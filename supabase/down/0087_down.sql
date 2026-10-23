-- Reverses 0087. Three things are undone, in this order.
--
-- 1. Everything 0087 added: the owner history table and its triggers, the owner
--    functions, and the team-member deactivation. The history is removed with the
--    table, so an owner set by the 0087 functions keeps the owner it has, but its
--    recorded history goes. Restore from a backup first if that history matters.
-- 2. The claim protocol as it was in the previous revision of 0087 (f3db307).
-- 3. The Salesforce create and supersede functions and the partner handoff, as they
--    were in 0023 and 0084. They are restored from those migrations, not retyped.
--
-- After this, implementations.owner_id can be written directly again: the guard is gone.

drop trigger if exists implementations_owner_guard on implementations;
drop trigger if exists implementations_owner_history on implementations;
drop trigger if exists implementation_owner_history_immutable on implementation_owner_history;

drop function if exists portal_deactivate_team_member(uuid, uuid);
drop function if exists portal_set_implementation_owner(uuid, uuid, uuid, text, boolean, uuid);
drop function if exists portal_record_assignment(uuid, uuid, int, jsonb, text, uuid, text, text, text);
drop function if exists portal_actor_may_assign(uuid);
drop function if exists portal_lock_member(uuid);
drop function if exists portal_deal_owner_state(uuid);
drop function if exists portal_record_deal_owner_change(uuid, uuid, uuid, uuid, text, text, text);
drop function if exists portal_owner_context(uuid, text, text, text);
drop function if exists portal_owner_context_clear();
drop function if exists portal_owner_guard_mode();
delete from portal_app_config where key = 'owner_guard';
drop function if exists implementations_owner_guard();
drop function if exists implementations_owner_history();
drop function if exists implementation_owner_history_immutable();

drop policy if exists "owner history internal" on implementation_owner_history;
drop table if exists implementation_owner_history;

-- The assignment ledger is writable by internal logins again, as it was before 0087.
drop policy if exists "assignments internal read" on portal_assignments;
create policy "assignments internal" on portal_assignments
  for all using (portal_is_internal()) with check (portal_is_internal());

-- The team and the pool are writable by internal logins again, as 0005 and 0050 left them.
drop policy if exists "assignment_pool internal read" on portal_assignment_pool;
create policy "assignment_pool internal" on portal_assignment_pool
  for all using (portal_is_internal()) with check (portal_is_internal());
create policy "team_members internal insert" on team_members
  for insert to authenticated with check (portal_is_internal());
create policy "team_members internal update" on team_members
  for update to authenticated using (portal_is_internal()) with check (portal_is_internal());
create policy "team_members internal delete" on team_members
  for delete to authenticated using (portal_is_internal());
-- The privileges 0087 removed come back as Supabase's default grants gave them.
grant all on portal_assignments, portal_assignment_pool, team_members to anon, authenticated;

-- 2. The claim protocol, as the previous revision of 0087 defined it.
-- 0087: a deal's owner is changed in one transaction, under one lock order.
--
-- THE PROBLEM. A claim wrote the project's owner, then wrote the assignment
-- record from the app, in separate statements. A failure between them left an
-- owner with no record, and two claims racing each other could both land. A
-- claim before the project exists has no owner row to lock at all: its owner is
-- the newest row of portal_assignments (claimed-owner.ts), so two claims could
-- each read "nobody" and each insert a row.
--
-- THE PROTOCOL. Every write that changes a deal's owner goes through one of the
-- functions below. Each takes the same locks in the same order:
--
--   1. the deal's project row, when a project exists (implementations),
--   2. then the deal row (portal_accounts).
--
-- A deal with no project takes only the deal row. It then checks that no
-- project has appeared since it looked; if one has, it stops with a retry
-- rather than lock the project out of order. This is the order
-- partner_implementation_handoff already uses (project lock, then the deal's
-- stage transition), so the two cannot deadlock.
--
-- Under those locks, the owner check and the write cannot be separated by
-- another writer on the same protocol: of two concurrent claims, one commits and
-- the other sees an owner and is refused. The owner write and the assignment
-- record are one transaction, so a failure leaves neither. Notifications and
-- the audit entry are not part of it; the app sends them after the commit.
--
-- WHAT IS NOT COVERED. Writes that change implementations.owner_id outside this
-- protocol still exist: the customer page's owner edit (setImplementation and
-- updateRecordField), the Salesforce project create and supersede functions
-- (0023), and the implementation insert itself. Those can change the project's
-- owner without taking these locks. A claim still cannot overwrite such an owner,
-- because a claim writes only when the owner is empty. What those writes can do
-- is leave the ledger and the project owner disagreeing, which they can already
-- do today. Routing them through this protocol is a separate decision.

-- The project a deal's ownership lives on: the newest live project of the deal,
-- else the newest live project of its customer that belongs to no deal. The same
-- rule as liveImplementationForDeal (src/lib/server/deal-implementation.ts), which
-- the document guard uses too. Null before a project exists.
create or replace function portal_project_for_deal(p_deal uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select i.id from implementations i
      where i.deal_id = p_deal and i.superseded_by_implementation_id is null
      order by i.created_at desc limit 1),
    (select i.id from implementations i
       join portal_accounts a on a.customer_id = i.customer_id
      where a.id = p_deal and i.deal_id is null and i.superseded_by_implementation_id is null
      order by i.created_at desc limit 1)
  );
$$;

-- Takes the locks for changing a deal's owner, in the order described above, and
-- returns the project the owner lives on (null before a project exists). Stops
-- with a retry if the project changed while the locks were being taken.
create or replace function portal_lock_ownership(p_deal uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_project uuid := portal_project_for_deal(p_deal);
begin
  if v_project is not null then
    perform 1 from implementations where id = v_project for update;
    perform 1 from portal_accounts where id = p_deal for update;
  else
    perform 1 from portal_accounts where id = p_deal for update;
  end if;
  if not found then
    raise exception 'Deal % not found', p_deal;
  end if;
  if portal_project_for_deal(p_deal) is distinct from v_project then
    raise exception 'ownership_retry: the project for this deal changed while it was being updated. Try again.';
  end if;
  return v_project;
end $$;

-- A person takes an unowned deal for themselves. Allowed only in claim mode, only
-- for the signed-in person's own active pool membership, and only when there is
-- no owner. Writes the owner (when there is a project) and the assignment record
-- in this one transaction. Failures are raised as claim_refused:<code>|<text>, so
-- the app can say what happened. A refused claim writes nothing.
create or replace function portal_claim_deal(
  p_deal uuid,
  p_team_member uuid,
  p_actor_profile uuid,
  p_weight int,
  p_breakdown jsonb,
  p_note text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_rules jsonb;
  v_mode text;
  v_project uuid;
  v_owner uuid;
  v_name text;
  v_ledger uuid;
begin
  -- The claimant is the signed-in profile, and that profile must be this team member.
  select lower(email) into v_email from portal_profiles where id = p_actor_profile;
  if coalesce(v_email, '') = '' then
    raise exception 'claim_refused:no_profile|No profile for this sign-in.';
  end if;
  if not exists (
    select 1
      from team_members t
      join portal_assignment_pool p on p.team_member_id = t.id
     where t.id = p_team_member and t.active and p.active and lower(t.email) = v_email
  ) then
    raise exception 'claim_refused:not_in_pool|You are not in the assignment pool. A manager adds people under Admin → Assignment.';
  end if;

  -- Only the explicit claim mode allows a claim. Missing and unreadable rules refuse.
  select value into v_rules from portal_app_config where key = 'assignment_rules';
  if not found then
    raise exception 'claim_refused:rules_missing|No assignment rules are saved, so accounts cannot be claimed. A manager assigns this account.';
  end if;
  v_mode := case when jsonb_typeof(v_rules) = 'object' then v_rules ->> 'mode' end;
  if v_mode = 'auto' then
    raise exception 'claim_refused:rules_auto|Accounts are assigned by a manager in this workspace, so you cannot claim this one. Ask a manager to assign it.';
  end if;
  if v_mode is distinct from 'claim' then
    raise exception 'claim_refused:rules_invalid|The assignment rules are not valid, so accounts cannot be claimed until a manager saves them again.';
  end if;

  -- Under the ownership locks: the owner is the project's owner, or before the
  -- project exists, the newest assignment record (claimed-owner.ts).
  v_project := portal_lock_ownership(p_deal);
  if v_project is not null then
    select owner_id into v_owner from implementations where id = v_project;
  else
    select team_member_id into v_owner from portal_assignments
     where deal_id = p_deal order by created_at desc limit 1;
  end if;
  if v_owner is not null then
    select name into v_name from team_members where id = v_owner;
    raise exception 'claim_refused:already_owned|% already owns this account.', coalesce(v_name, 'Someone');
  end if;

  if v_project is not null then
    update implementations set owner_id = p_team_member where id = v_project and owner_id is null;
    if not found then
      raise exception 'claim_refused:already_owned|This account was just taken, so it cannot be claimed. Reload to see who owns it.';
    end if;
  end if;

  insert into portal_assignments
    (deal_id, implementation_id, team_member_id, weight, breakdown, source, actor_profile_id, note)
  values (p_deal, v_project, p_team_member, p_weight, coalesce(p_breakdown, '{}'::jsonb), 'manual', p_actor_profile, p_note)
  returning id into v_ledger;

  return jsonb_build_object('implementation_id', v_project, 'ledger_id', v_ledger);
end $$;

-- A manager's assignment, or a rule's: writes the owner (when there is a project)
-- and the assignment record in one transaction, under the same locks as a claim.
-- It may replace an existing owner: that is what a manager does. It never removes
-- a claim's record.
create or replace function portal_record_assignment(
  p_deal uuid,
  p_team_member uuid,
  p_weight int,
  p_breakdown jsonb,
  p_source text,
  p_actor_profile uuid,
  p_note text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
  v_ledger uuid;
begin
  v_project := portal_lock_ownership(p_deal);
  if v_project is not null then
    update implementations set owner_id = p_team_member where id = v_project;
  end if;
  insert into portal_assignments
    (deal_id, implementation_id, team_member_id, weight, breakdown, source, actor_profile_id, note)
  values (p_deal, v_project, p_team_member, p_weight, coalesce(p_breakdown, '{}'::jsonb), p_source, p_actor_profile, p_note)
  returning id into v_ledger;
  return jsonb_build_object('implementation_id', v_project, 'ledger_id', v_ledger);
end $$;

-- A project takes its deal's owner from the assignment record, when it has none of
-- its own: the owner who claimed or was assigned before the project existed. Used
-- when a project starts (onboarding, a new implementation) and by the owner
-- reconcile. Takes the same locks, so it cannot run in the middle of a claim.
-- Returns true when it set an owner, false when there was nothing to set.
create or replace function portal_inherit_pre_project_owner(p_implementation uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_deal uuid;
  v_latest uuid;
begin
  select deal_id into v_deal from implementations where id = p_implementation;
  if v_deal is null then
    return false;
  end if;
  perform 1 from implementations where id = p_implementation for update;
  perform 1 from portal_accounts where id = v_deal for update;
  select team_member_id into v_latest from portal_assignments
   where deal_id = v_deal order by created_at desc limit 1;
  if v_latest is null then
    return false;
  end if;
  update implementations set owner_id = v_latest where id = p_implementation and owner_id is null;
  return found;
end $$;

-- Only the server runs these, with the service role. Nothing else may call them.
revoke execute on function portal_project_for_deal(uuid) from public, anon, authenticated;
revoke execute on function portal_lock_ownership(uuid) from public, anon, authenticated;
revoke execute on function portal_claim_deal(uuid, uuid, uuid, int, jsonb, text) from public, anon, authenticated;
revoke execute on function portal_record_assignment(uuid, uuid, int, jsonb, text, uuid, text) from public, anon, authenticated;
revoke execute on function portal_inherit_pre_project_owner(uuid) from public, anon, authenticated;
grant execute on function portal_claim_deal(uuid, uuid, uuid, int, jsonb, text) to service_role;
grant execute on function portal_record_assignment(uuid, uuid, int, jsonb, text, uuid, text) to service_role;
grant execute on function portal_inherit_pre_project_owner(uuid) to service_role;

-- 3. The functions 0087 changed, as 0023 and 0084 defined them.
create or replace function sf_supersede_implementation(
  p_old_implementation_id uuid,
  p_new_implementation jsonb,
  p_reason text,
  p_actor_profile_id uuid
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  old_row implementations%rowtype;
  new_id uuid;
  actor_tm uuid;
  first_stage text;
  now_ts timestamptz := now();
begin
  if not (auth.role() = 'service_role' or portal_can_manage()) then
    raise exception 'forbidden';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to supersede an implementation';
  end if;

  select * into old_row from implementations where id = p_old_implementation_id for update;
  if not found then
    raise exception 'Implementation % does not exist', p_old_implementation_id;
  end if;
  if old_row.salesforce_opportunity_id is null then
    raise exception 'Implementation % has no Salesforce opportunity to carry forward',
      p_old_implementation_id;
  end if;
  if old_row.superseded_by_implementation_id is not null then
    raise exception 'Implementation % is already superseded by %',
      p_old_implementation_id, old_row.superseded_by_implementation_id;
  end if;

  select team_member_id into actor_tm from portal_profiles where id = p_actor_profile_id;
  first_stage := coalesce(p_new_implementation ->> 'current_stage', 'handoff');

  -- 1. The new row, WITHOUT the opportunity id.
  insert into implementations (
    customer_id, name, current_stage, stage_entered_at, status, source,
    owner_id, sales_owner, salesforce_account_id, sf_closed_won_at,
    target_launch_date, sow_value, parent_implementation_id
  )
  values (
    coalesce((p_new_implementation ->> 'customer_id')::uuid, old_row.customer_id),
    coalesce(p_new_implementation ->> 'name', old_row.name || ' (follow-on)'),
    first_stage,
    now_ts,
    coalesce(p_new_implementation ->> 'status', 'on_track'),
    coalesce(p_new_implementation ->> 'source', 'salesforce'),
    coalesce((p_new_implementation ->> 'owner_id')::uuid, old_row.owner_id),
    coalesce(p_new_implementation ->> 'sales_owner', old_row.sales_owner),
    coalesce(p_new_implementation ->> 'salesforce_account_id', old_row.salesforce_account_id),
    nullif(p_new_implementation ->> 'sf_closed_won_at', '')::timestamptz,
    nullif(p_new_implementation ->> 'target_launch_date', '')::date,
    nullif(p_new_implementation ->> 'sow_value', '')::numeric,
    null
  )
  returning id into new_id;

  -- 2. The old row leaves the current-opportunity index.
  update implementations
     set superseded_by_implementation_id = new_id,
         updated_at = now_ts
   where id = p_old_implementation_id;

  -- 3. The slot is free; the new row takes the opportunity id.
  update implementations
     set salesforce_opportunity_id = old_row.salesforce_opportunity_id,
         updated_at = now_ts
   where id = new_id;

  -- 4. The append-only stage history opens with the new implementation.
  insert into implementation_stage_history (implementation_id, stage, entered_at, entered_by, notes)
  values (new_id, first_stage, now_ts, actor_tm,
          'Follow-on implementation created by supersede: ' || p_reason);

  -- 5. Who did this, to what, and why.
  insert into portal_audit_log (actor_type, actor_id, action, entity_type, entity_id, payload)
  values (
    case when p_actor_profile_id is null then 'system' else 'user' end,
    p_actor_profile_id,
    'implementation.superseded',
    'implementation',
    p_old_implementation_id,
    jsonb_build_object(
      'old_implementation_id', p_old_implementation_id,
      'new_implementation_id', new_id,
      'salesforce_opportunity_id', old_row.salesforce_opportunity_id,
      'reason', p_reason
    )
  );

  return new_id;
end;
$$;

create or replace function sf_create_implementation(
  p_customer_id uuid,
  p_patch jsonb,
  p_template_id uuid,
  p_opportunity_id text,
  p_account_id text,
  p_closed_won_at timestamptz,
  p_actor_profile_id uuid
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  impl_id uuid;
  actor_tm uuid;
  now_ts timestamptz := now();
  first_stage text := coalesce(p_patch ->> 'current_stage', 'handoff');
begin
  if auth.role() is distinct from 'service_role' and not portal_can_manage() then
    raise exception 'forbidden';
  end if;

  if p_template_id is not null then
    -- Reuse Phase 2's instantiation verbatim: it creates the implementation,
    -- its stage instances, work items and dependencies, pinned to the exact
    -- template version. Duplicating any of that here would guarantee drift.
    impl_id := instantiate_journey(
      p_customer_id,
      p_patch || jsonb_build_object('source', 'salesforce'),
      p_template_id,
      '{}'::jsonb,
      '{}'::jsonb,
      p_actor_profile_id
    );
  else
    select team_member_id into actor_tm from portal_profiles where id = p_actor_profile_id;

    insert into implementations (
      customer_id, name, current_stage, stage_entered_at, status, source,
      owner_id, sales_owner, target_launch_date, sow_value
    )
    values (
      p_customer_id,
      coalesce(p_patch ->> 'name', 'Salesforce opportunity'),
      first_stage,
      now_ts,
      coalesce(p_patch ->> 'status', 'on_track'),
      'salesforce',
      nullif(p_patch ->> 'owner_id', '')::uuid,
      p_patch ->> 'sales_owner',
      nullif(p_patch ->> 'target_launch_date', '')::date,
      nullif(p_patch ->> 'sow_value', '')::numeric
    )
    returning id into impl_id;

    insert into implementation_stage_history (implementation_id, stage, entered_at, entered_by)
    values (impl_id, first_stage, now_ts, actor_tm);
  end if;

  -- The stamp that claims the opportunity. A unique violation here aborts the
  -- whole transaction, including everything above.
  update implementations
     set salesforce_opportunity_id = p_opportunity_id,
         salesforce_account_id = p_account_id,
         sf_closed_won_at = p_closed_won_at
   where id = impl_id;

  return impl_id;
end;
$$;

create or replace function partner_implementation_handoff(
  p_implementation_id uuid,
  p_team_member_id uuid,
  p_actor_team_member uuid,
  p_actor_profile uuid,
  p_assignment jsonb,
  p_outbox jsonb,
  p_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v implementations%rowtype;
  v_open int;
begin
  v := partner_lock(p_implementation_id);
  if v.current_stage <> 'partner_setup' then
    raise exception 'duplicate_handoff: this implementation is already past the handoff (at %), so nothing was handed over again.',
      v.current_stage;
  end if;
  if v.deal_id is null then
    raise exception 'This implementation has no deal, so the handoff cannot move the deal.';
  end if;

  v_open := partner_gate_outstanding(p_implementation_id, 'partner_setup');
  if v_open > 0 then
    raise exception 'closed_gate: % gate criteria are still open on Partner Setup & Connection, so the handoff was refused.',
      v_open;
  end if;

  perform partner_move_stage(p_implementation_id, 'form_finalisation', p_actor_team_member,
    'Implementation Ready: handed to GoCanvas implementation', false, p_at);
  perform partner_complete_milestone(p_implementation_id, 'Implementation Ready', 'partner_setup', p_at);

  perform portal_transition_stage(v.deal_id, 'onboarding_kickoff',
    case when p_actor_profile is null then 'system' else 'ui' end::portal_transition_source,
    p_actor_profile, null, 'Handed to GoCanvas implementation (Implementation Ready)', p_at);

  if p_team_member_id is not null then
    update implementations set owner_id = p_team_member_id, updated_at = p_at
     where id = p_implementation_id;
    insert into portal_assignments
      (deal_id, implementation_id, team_member_id, weight, breakdown, source, actor_profile_id, note)
    values (v.deal_id, p_implementation_id, p_team_member_id,
            (p_assignment ->> 'weight')::int, coalesce(p_assignment -> 'breakdown', '{}'::jsonb),
            p_assignment ->> 'source', p_actor_profile, p_assignment ->> 'note');
    perform partner_record(p_implementation_id, v.deal_id, 'implementation.assigned',
      jsonb_build_object('team_member_id', p_team_member_id, 'source', p_assignment ->> 'source'),
      p_actor_profile, p_at);
  end if;

  -- One notice per recipient: the assignee, or each pool member when the
  -- account is open to claim. Keyed, so a notice is never queued twice.
  insert into notification_outbox
    (dedupe_key, kind, recipient, subject, html, implementation_id)
  select n ->> 'dedupe_key', 'assignment', n ->> 'to', n ->> 'subject', n ->> 'html', p_implementation_id
    from jsonb_array_elements(coalesce(p_outbox, '[]'::jsonb)) n;

  perform partner_record(p_implementation_id, v.deal_id, 'implementation.handed_off',
    jsonb_build_object('to_stage', 'form_finalisation', 'assigned', p_team_member_id is not null),
    p_actor_profile, p_at);
  return jsonb_build_object('stage', 'form_finalisation', 'assigned', p_team_member_id is not null);
end $$;
