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
