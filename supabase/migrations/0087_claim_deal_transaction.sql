-- 0087: who owns an account is changed in one place, under one lock order, and every
-- change is recorded in the same transaction.
--
-- THE PROBLEM. An owner was written by many paths, most of them outside any lock:
-- a claim, a manager's assignment, the customer page, full-form saves that resent
-- an old owner, the Salesforce create and supersede functions, and the partner
-- handoff. A claim before the project exists had no row to lock, and its owner
-- was only the newest assignment record. Nothing recorded a clear, and a clear
-- had no way to be recorded in the assignment ledger, which requires a person.
--
-- THE RULES THIS ENFORCES.
--   1. Only an admin, super admin or manager may deliberately assign, reassign or
--      clear an owner (portal_set_implementation_owner, and a manager's assignment
--      through portal_record_assignment). Nothing else checks this, so the check is
--      in the database.
--   2. A person may claim an unowned account only in claim mode (portal_claim_deal).
--   3. An owner that exists is never replaced by a rule, an integration, or a
--      Salesforce payload. Those assign only an unowned account (mode unowned_only).
--   4. Every change of an owner writes one row to implementation_owner_history, in
--      the same transaction as the change. The history is append-only.
--   5. A team member cannot be deactivated while a claim or an assignment that names
--      them is in progress (portal_deactivate_team_member).
--
-- THE GUARD. implementations.owner_id can be changed only inside these functions:
-- a trigger refuses any other change. This holds for every client, including a
-- logged-in internal user writing through the REST API.
--
-- THE LOCK PROTOCOL. A write that changes a deal's owner takes, in this order:
--
--   1. the deal's project row, when a project exists (implementations),
--   2. then the deal row (portal_accounts).
--
-- A deal with no project takes only the deal row, then checks that no project has
-- appeared since it looked; if one has, it stops with a retry. The member row is
-- locked FOR SHARE before any of this, so a writer that names a person as owner
-- waits for that person's deactivation, and a deactivation waits for the writer.
-- The order is the one partner_implementation_handoff already used.

-- ---------------------------------------------------------------------------
-- 1. The history of owners. One row per change, never updated or deleted.
-- ---------------------------------------------------------------------------
-- The references are plain columns, not foreign keys: a history row must survive
-- the deletion of the project, the deal, the person or the profile it names.
create table if not exists implementation_owner_history (
  seq bigint generated always as identity primary key,
  id uuid not null default gen_random_uuid() unique,
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  implementation_id uuid,
  deal_id uuid,
  -- Null before the first owner, and null after a clear. A clear names no one.
  previous_owner_id uuid,
  new_owner_id uuid,
  actor_profile_id uuid,
  actor_kind text not null check (actor_kind in ('user', 'system', 'integration')),
  source text not null check (source in (
    'claim', 'manager_assignment', 'rule_assignment', 'integration_assignment',
    'clear', 'inherit', 'partner_handoff', 'salesforce_create', 'salesforce_supersede',
    'legacy_direct_write'
  )),
  reason text,
  changed_at timestamptz not null default clock_timestamp(),
  check (implementation_id is not null or deal_id is not null)
);

create index if not exists implementation_owner_history_deal_idx
  on implementation_owner_history (deal_id, seq desc);
create index if not exists implementation_owner_history_impl_idx
  on implementation_owner_history (implementation_id, seq desc);

create or replace function implementation_owner_history_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'implementation_owner_history is append-only: a recorded owner change is never edited or removed';
end $$;

drop trigger if exists implementation_owner_history_immutable on implementation_owner_history;
create trigger implementation_owner_history_immutable
  before update or delete on implementation_owner_history
  for each row execute function implementation_owner_history_immutable();

alter table implementation_owner_history enable row level security;
create policy "owner history internal" on implementation_owner_history
  for select using (portal_is_internal());
-- Privileges, not only policies: row-level security does not cover TRUNCATE, and a
-- future policy mistake must not reopen a write. Internal logins read these tables only.
revoke all on implementation_owner_history from anon, authenticated;
grant select on implementation_owner_history to authenticated;

-- The assignment ledger is read by internal users and written only by the server.
-- It was writable by any internal login through the REST API.
drop policy if exists "assignments internal" on portal_assignments;
create policy "assignments internal read" on portal_assignments
  for select using (portal_is_internal());

-- Who may claim is decided by the team and the pool, and both are written by the
-- server only. Any internal login could otherwise reactivate itself, add itself to
-- the pool through the REST API, and then claim. Internal logins read them.
drop policy if exists "team_members internal insert" on team_members;
drop policy if exists "team_members internal update" on team_members;
drop policy if exists "team_members internal delete" on team_members;
drop policy if exists "assignment_pool internal" on portal_assignment_pool;
create policy "assignment_pool internal read" on portal_assignment_pool
  for select using (portal_is_internal());
revoke all on portal_assignments, portal_assignment_pool, team_members from anon, authenticated;
grant select on portal_assignments, portal_assignment_pool, team_members to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The authorisation context a protected change runs under. It lasts for the
--    transaction only (set_config with is_local = true), so it cannot leak into
--    another request.
-- ---------------------------------------------------------------------------
create or replace function portal_owner_context(
  p_actor_profile uuid,
  p_actor_kind text,
  p_source text,
  p_reason text
) returns void language plpgsql set search_path = public as $$
begin
  perform set_config('portal.owner_change', 'authorised', true);
  perform set_config('portal.owner_actor_profile', coalesce(p_actor_profile::text, ''), true);
  perform set_config('portal.owner_actor_kind', p_actor_kind, true);
  perform set_config('portal.owner_source', p_source, true);
  perform set_config('portal.owner_reason', coalesce(p_reason, ''), true);
end $$;

-- Ends the authority. Each protocol function calls this just before it returns, so
-- the authority covers only its own writes, not later statements in the transaction.
create or replace function portal_owner_context_clear()
returns void language plpgsql set search_path = public as $$
begin
  perform set_config('portal.owner_change', '', true);
end $$;

-- The guard's mode, from portal_app_config (key owner_guard). 'observe' lets a direct
-- owner write through and records it as a legacy write, so an application that has not
-- yet moved to the ownership functions keeps working during the rollout. 'enforce'
-- refuses it. A missing setting means enforce: the default fails closed. Changing the
-- mode is a configuration change, not a migration.
create or replace function portal_owner_guard_mode()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select value ->> 'mode' from portal_app_config where key = 'owner_guard'), 'enforce');
$$;

-- Refuses a change of implementations.owner_id made outside the protected functions.
-- A signed-in internal login (a REST request under the authenticated role) is refused in
-- every mode: observe mode is only for the server's own writes during the rollout. The
-- server writes with the service role, which is what observe mode lets through.
create or replace function implementations_owner_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.owner_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.owner_id is not distinct from old.owner_id then
    return new;
  end if;
  if coalesce(current_setting('portal.owner_change', true), '') = 'authorised' then
    return new;
  end if;
  if coalesce(auth.role(), '') = 'authenticated' or portal_owner_guard_mode() = 'enforce' then
    raise exception 'owner_change_not_authorised: an account owner changes only through the ownership functions';
  end if;
  return new;
end $$;

-- The rollout's starting mode. Enforcement is switched on once the application that
-- uses the ownership functions is live; see the PR's rollout section.
insert into portal_app_config (key, value) values ('owner_guard', '{"mode":"observe"}')
  on conflict (key) do nothing;

drop trigger if exists implementations_owner_guard on implementations;
create trigger implementations_owner_guard
  before insert or update of owner_id on implementations
  for each row execute function implementations_owner_guard();

-- Records every change of implementations.owner_id, in the same transaction.
create or replace function implementations_owner_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.owner_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.owner_id is not distinct from old.owner_id then
    return new;
  end if;
  -- A change made under the protected functions carries its own actor and source. Any
  -- other change is a legacy direct write: it is recorded as such, with no actor named.
  if coalesce(current_setting('portal.owner_change', true), '') = 'authorised' then
    insert into implementation_owner_history
      (implementation_id, deal_id, previous_owner_id, new_owner_id,
       actor_profile_id, actor_kind, source, reason)
    values (
      new.id, new.deal_id,
      case when tg_op = 'UPDATE' then old.owner_id end, new.owner_id,
      nullif(current_setting('portal.owner_actor_profile', true), '')::uuid,
      current_setting('portal.owner_actor_kind', true),
      current_setting('portal.owner_source', true),
      nullif(current_setting('portal.owner_reason', true), '')
    );
  else
    insert into implementation_owner_history
      (implementation_id, deal_id, previous_owner_id, new_owner_id,
       actor_profile_id, actor_kind, source, reason)
    values (
      new.id, new.deal_id,
      case when tg_op = 'UPDATE' then old.owner_id end, new.owner_id,
      null, 'system', 'legacy_direct_write',
      'Changed without the ownership functions, by an application that has not moved to them yet'
    );
  end if;
  return new;
end $$;

drop trigger if exists implementations_owner_history on implementations;
create trigger implementations_owner_history
  after insert or update of owner_id on implementations
  for each row execute function implementations_owner_history();

-- The history of a change that has no project yet (a claim or an assignment before
-- the project exists). Projects record their own changes through the trigger above.
create or replace function portal_record_deal_owner_change(
  p_deal uuid,
  p_previous uuid,
  p_new uuid,
  p_actor_profile uuid,
  p_actor_kind text,
  p_source text,
  p_reason text
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into implementation_owner_history
    (implementation_id, deal_id, previous_owner_id, new_owner_id,
     actor_profile_id, actor_kind, source, reason)
  values (null, p_deal, p_previous, p_new, p_actor_profile, p_actor_kind, p_source, p_reason);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Who owns a deal, and the locks.
-- ---------------------------------------------------------------------------

-- The project a deal's ownership lives on: the newest live project of the deal,
-- else the newest live project of its customer that belongs to no deal. The same
-- rule as liveImplementationForDeal (src/lib/server/deal-implementation.ts).
-- Null before a project exists.
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

-- The owner a deal has when it has no project: the newest history row for the deal
-- if there is one (it records clears too), else the newest assignment record
-- (for deals that predate the history). Null means no owner.
create or replace function portal_deal_owner_state(p_deal uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  select h.new_owner_id into v_owner
    from implementation_owner_history h
   where h.deal_id = p_deal
   order by h.seq desc limit 1;
  if found then
    return v_owner;
  end if;
  select team_member_id into v_owner from portal_assignments
   where deal_id = p_deal order by created_at desc limit 1;
  return v_owner;
end $$;

-- Takes the locks for changing a deal's owner, in the order above, and returns the
-- project the owner lives on (null before a project exists). Stops with a retry if
-- the project changed while the locks were being taken.
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

-- Takes a share lock on a team member and reports whether they are active. A
-- writer that names someone as owner calls this first. Deactivation holds the
-- exclusive lock, so the two cannot interleave.
create or replace function portal_lock_member(p_team_member uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform 1 from team_members where id = p_team_member for share;
  return exists (select 1 from team_members where id = p_team_member and active);
end $$;

-- Whether a profile holds one of the three roles that may change an owner.
create or replace function portal_actor_may_assign(p_actor_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from portal_profiles
     where id = p_actor_profile and role in ('admin', 'super_admin', 'manager')
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Claims. A person takes an unowned account for themselves, in claim mode only.
-- ---------------------------------------------------------------------------
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
  -- The member is locked before anything else, so a deactivation waits for this claim.
  perform 1 from team_members where id = p_team_member for share;
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

  v_project := portal_lock_ownership(p_deal);
  if v_project is not null then
    select owner_id into v_owner from implementations where id = v_project;
  else
    v_owner := portal_deal_owner_state(p_deal);
  end if;
  if v_owner is not null then
    select name into v_name from team_members where id = v_owner;
    raise exception 'claim_refused:already_owned|% already owns this account.', coalesce(v_name, 'Someone');
  end if;

  perform portal_owner_context(p_actor_profile, 'user', 'claim', p_note);
  if v_project is not null then
    update implementations set owner_id = p_team_member where id = v_project and owner_id is null;
    if not found then
      raise exception 'claim_refused:already_owned|This account was just taken, so it cannot be claimed. Reload to see who owns it.';
    end if;
  else
    perform portal_record_deal_owner_change(p_deal, null, p_team_member, p_actor_profile, 'user', 'claim', p_note);
  end if;

  insert into portal_assignments
    (deal_id, implementation_id, team_member_id, weight, breakdown, source, actor_profile_id, note)
  values (p_deal, v_project, p_team_member, p_weight, coalesce(p_breakdown, '{}'::jsonb), 'manual', p_actor_profile, p_note)
  returning id into v_ledger;

  perform portal_owner_context_clear();
  return jsonb_build_object('implementation_id', v_project, 'ledger_id', v_ledger);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Assignments by a manager (mode manager) or by a rule or an integration (mode
--    unowned_only). A rule or an integration never replaces an existing owner.
-- ---------------------------------------------------------------------------
drop function if exists portal_record_assignment(uuid, uuid, int, jsonb, text, uuid, text);
create or replace function portal_record_assignment(
  p_deal uuid,
  p_team_member uuid,
  p_weight int,
  p_breakdown jsonb,
  p_source text,
  p_actor_profile uuid,
  p_note text,
  p_mode text,
  p_actor_kind text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
  v_previous uuid;
  v_ledger uuid;
  v_history_source text;
begin
  if p_mode not in ('manager', 'unowned_only') then
    raise exception 'invalid assignment mode %', p_mode;
  end if;
  if p_source not in ('auto', 'manual') then
    raise exception 'invalid ledger source %', p_source;
  end if;
  if p_mode = 'manager' then
    if p_actor_profile is null or not portal_actor_may_assign(p_actor_profile) then
      raise exception 'forbidden: only an admin, super admin or manager may assign an account owner';
    end if;
    v_history_source := 'manager_assignment';
  else
    v_history_source := case when p_actor_kind = 'integration'
                             then 'integration_assignment' else 'rule_assignment' end;
  end if;

  perform 1 from team_members where id = p_team_member for share;
  if not exists (select 1 from team_members where id = p_team_member and active) then
    raise exception 'That person is not on the team any more, so they cannot be assigned.';
  end if;

  v_project := portal_lock_ownership(p_deal);
  if v_project is not null then
    select owner_id into v_previous from implementations where id = v_project;
  else
    v_previous := portal_deal_owner_state(p_deal);
  end if;

  if p_mode = 'unowned_only' and v_previous is not null then
    return jsonb_build_object(
      'assigned', false, 'implementation_id', v_project, 'ledger_id', null,
      'current_owner_id', v_previous
    );
  end if;

  perform portal_owner_context(p_actor_profile, p_actor_kind, v_history_source, p_note);
  if v_project is not null then
    update implementations set owner_id = p_team_member where id = v_project;
  else
    perform portal_record_deal_owner_change(
      p_deal, v_previous, p_team_member, p_actor_profile, p_actor_kind, v_history_source, p_note
    );
  end if;

  insert into portal_assignments
    (deal_id, implementation_id, team_member_id, weight, breakdown, source, actor_profile_id, note)
  values (p_deal, v_project, p_team_member, p_weight, coalesce(p_breakdown, '{}'::jsonb), p_source, p_actor_profile, p_note)
  returning id into v_ledger;

  perform portal_owner_context_clear();
  return jsonb_build_object(
    'assigned', true, 'implementation_id', v_project, 'ledger_id', v_ledger,
    'previous_owner_id', v_previous
  );
end $$;

-- ---------------------------------------------------------------------------
-- 6. A manager sets or clears the owner of a project: an explicit reassignment.
--    The expected owner, when given, must still be the owner (no blind overwrite).
-- ---------------------------------------------------------------------------
create or replace function portal_set_implementation_owner(
  p_implementation uuid,
  p_new_owner uuid,
  p_actor_profile uuid,
  p_reason text,
  p_check_expected boolean,
  p_expected_owner uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_impl implementations%rowtype;
  v_previous uuid;
  v_current_project uuid;
  v_ledger uuid;
  v_source text;
begin
  if p_actor_profile is null or not portal_actor_may_assign(p_actor_profile) then
    raise exception 'forbidden: only an admin, super admin or manager may change an account owner';
  end if;

  select * into v_impl from implementations where id = p_implementation;
  if not found then
    raise exception 'That project no longer exists';
  end if;
  if v_impl.deal_id is not null then
    v_current_project := portal_lock_ownership(v_impl.deal_id);
    if v_current_project is distinct from p_implementation then
      raise exception 'That project is no longer the current one for this deal. Reload and try again.';
    end if;
  else
    perform 1 from implementations where id = p_implementation for update;
  end if;
  select * into v_impl from implementations where id = p_implementation;
  if v_impl.superseded_by_implementation_id is not null then
    raise exception 'That project has been superseded. Reload and change the current one.';
  end if;

  v_previous := v_impl.owner_id;
  if p_check_expected and v_previous is distinct from p_expected_owner then
    raise exception 'owner_changed: the owner was changed by someone else while you were editing. Reload to see who owns it.';
  end if;

  if p_new_owner is not null and not portal_lock_member(p_new_owner) then
    raise exception 'That person is not on the team any more, so they cannot own an account.';
  end if;
  if p_new_owner is not distinct from v_previous then
    return jsonb_build_object('changed', false, 'previous_owner_id', v_previous, 'new_owner_id', p_new_owner);
  end if;

  v_source := case when p_new_owner is null then 'clear' else 'manager_assignment' end;
  perform portal_owner_context(p_actor_profile, 'user', v_source, p_reason);
  update implementations set owner_id = p_new_owner, updated_at = now() where id = p_implementation;

  -- A clear names no one, so it has no assignment record. An owner does.
  if p_new_owner is not null and v_impl.deal_id is not null then
    insert into portal_assignments
      (deal_id, implementation_id, team_member_id, weight, breakdown, source, actor_profile_id, note)
    values (v_impl.deal_id, p_implementation, p_new_owner, 0, '{}'::jsonb, 'manual', p_actor_profile,
            coalesce(nullif(btrim(p_reason), ''), 'Reassigned by hand'))
    returning id into v_ledger;
  end if;

  perform portal_owner_context_clear();
  return jsonb_build_object(
    'changed', true, 'previous_owner_id', v_previous, 'new_owner_id', p_new_owner,
    'ledger_id', v_ledger
  );
end $$;

-- ---------------------------------------------------------------------------
-- 7. A new project takes its deal's owner, when it has none of its own.
-- ---------------------------------------------------------------------------
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
  if (select owner_id from implementations where id = p_implementation) is not null then
    return false;
  end if;
  -- The owner the deal has now. A deal whose owner was cleared has none to carry.
  v_latest := portal_deal_owner_state(v_deal);
  if v_latest is null then
    return false;
  end if;
  if not portal_lock_member(v_latest) then
    return false;
  end if;
  perform portal_owner_context(null, 'system', 'inherit', 'Carried from the deal when its project started');
  update implementations set owner_id = v_latest where id = p_implementation and owner_id is null;
  perform portal_owner_context_clear();
  return found;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Removing a person from the team. Soft: they stop being offered, and their name
--    stays on history. Refused while they own anything, including a deal they have
--    claimed but no project carries yet.
-- ---------------------------------------------------------------------------
create or replace function portal_deactivate_team_member(
  p_team_member uuid,
  p_actor_profile uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_owned int;
  v_claimed int;
begin
  if p_actor_profile is null or not portal_actor_may_assign(p_actor_profile) then
    raise exception 'forbidden: only an admin, super admin or manager may remove a team member';
  end if;
  -- Exclusive: waits for any claim or assignment that is naming this person.
  select name into v_name from team_members where id = p_team_member for update;
  if not found then
    raise exception 'That person is not on the team.';
  end if;
  if exists (select 1 from portal_profiles where team_member_id = p_team_member) then
    raise exception '% has a login. Remove the user under Admin → Users first.', v_name;
  end if;

  select count(*) into v_owned from implementations
   where owner_id = p_team_member and current_stage <> 'graduate-to-cs';
  select count(*) into v_claimed from portal_accounts a
   where a.id in (
           select deal_id from portal_assignments where team_member_id = p_team_member
           union
           select deal_id from implementation_owner_history where new_owner_id = p_team_member
         )
     and a.stage is distinct from 'onboarding_complete'
     and portal_deal_owner_state(a.id) = p_team_member
     and portal_project_for_deal(a.id) is null;
  if v_owned + v_claimed > 0 then
    raise exception '% still owns % account%. Reassign them first, then remove.',
      v_name, v_owned + v_claimed, case when v_owned + v_claimed = 1 then '' else 's' end;
  end if;

  update team_members set active = false where id = p_team_member;
  delete from portal_assignment_pool where team_member_id = p_team_member;
  return jsonb_build_object('name', v_name);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Salesforce. The integration never replaces an owner the Hub already has.
--    A new project may take the owner the payload names, because nothing is
--    replaced; that is recorded in the history as an integration assignment.
-- ---------------------------------------------------------------------------

-- Supersede: the follow-on keeps the owner the old project had. The payload's owner
-- is used only when the old project has none.
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

  perform portal_owner_context(
    p_actor_profile_id,
    case when p_actor_profile_id is null then 'integration' else 'user' end,
    'salesforce_supersede',
    p_reason
  );

  -- 1. The new row, WITHOUT the opportunity id. The Hub's owner carries forward.
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
    coalesce(old_row.owner_id, (p_new_implementation ->> 'owner_id')::uuid),
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

  perform portal_owner_context_clear();
  return new_id;
end;
$$;

revoke execute on function sf_supersede_implementation(uuid, jsonb, text, uuid) from public, anon;

-- The ingest's create step. A new project with no existing owner may take the owner
-- the payload names; recorded as an integration assignment in the history.
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

  -- Set before any insert below, including the one inside instantiate_journey.
  perform portal_owner_context(p_actor_profile_id, 'integration', 'salesforce_create', null);

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

  perform portal_owner_context_clear();
  return impl_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. The partner handoff. Its owner is set only when the project has none, and
--     only for an active team member. Its lock order is the protocol's: the project
--     (partner_lock) and then the deal (portal_transition_stage).
-- ---------------------------------------------------------------------------
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
  v_assigned boolean := false;
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

  if p_team_member_id is not null and v.owner_id is null then
    if not portal_lock_member(p_team_member_id) then
      raise exception 'That person is not on the team any more, so they cannot own an account.';
    end if;
    perform portal_owner_context(
      p_actor_profile,
      case when p_actor_profile is null then 'system' else 'user' end,
      'partner_handoff',
      p_assignment ->> 'note'
    );
    update implementations set owner_id = p_team_member_id, updated_at = p_at
     where id = p_implementation_id;
    insert into portal_assignments
      (deal_id, implementation_id, team_member_id, weight, breakdown, source, actor_profile_id, note)
    values (v.deal_id, p_implementation_id, p_team_member_id,
            (p_assignment ->> 'weight')::int, coalesce(p_assignment -> 'breakdown', '{}'::jsonb),
            p_assignment ->> 'source', p_actor_profile, p_assignment ->> 'note');
    v_assigned := true;
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
    jsonb_build_object('to_stage', 'form_finalisation', 'assigned', v_assigned),
    p_actor_profile, p_at);
  perform portal_owner_context_clear();
  return jsonb_build_object('stage', 'form_finalisation', 'assigned', v_assigned);
end $$;

-- ---------------------------------------------------------------------------
-- Grants. Only the server runs these, with the service role.
-- ---------------------------------------------------------------------------
revoke execute on function portal_owner_guard_mode() from public, anon, authenticated;
revoke execute on function portal_owner_context(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function portal_owner_context_clear() from public, anon, authenticated;
revoke execute on function portal_record_deal_owner_change(uuid, uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function portal_project_for_deal(uuid) from public, anon, authenticated;
revoke execute on function portal_deal_owner_state(uuid) from public, anon, authenticated;
revoke execute on function portal_lock_ownership(uuid) from public, anon, authenticated;
revoke execute on function portal_lock_member(uuid) from public, anon, authenticated;
revoke execute on function portal_actor_may_assign(uuid) from public, anon, authenticated;
revoke execute on function portal_claim_deal(uuid, uuid, uuid, int, jsonb, text) from public, anon, authenticated;
revoke execute on function portal_record_assignment(uuid, uuid, int, jsonb, text, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function portal_set_implementation_owner(uuid, uuid, uuid, text, boolean, uuid) from public, anon, authenticated;
revoke execute on function portal_inherit_pre_project_owner(uuid) from public, anon, authenticated;
revoke execute on function portal_deactivate_team_member(uuid, uuid) from public, anon, authenticated;
grant execute on function portal_claim_deal(uuid, uuid, uuid, int, jsonb, text) to service_role;
grant execute on function portal_record_assignment(uuid, uuid, int, jsonb, text, uuid, text, text, text) to service_role;
grant execute on function portal_set_implementation_owner(uuid, uuid, uuid, text, boolean, uuid) to service_role;
grant execute on function portal_inherit_pre_project_owner(uuid) to service_role;
grant execute on function portal_deactivate_team_member(uuid, uuid) to service_role;
