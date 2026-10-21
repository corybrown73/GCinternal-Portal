-- Invariant probes for implementation closure (0088).
--
-- Closing an implementation without graduating it. Each refusal is checked for
-- its SQLSTATE, so a probe fails when something refuses for the wrong reason.
-- Runs in one transaction and rolls back. Requires ON_ERROR_STOP=1.

begin;

create function pg_temp.expect_refused(p_sql text, p_state text, p_what text)
returns void language plpgsql as $fn$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_state then
      raise exception 'INVARIANT "%" was refused with % (%), expected %',
        p_what, sqlstate, sqlerrm, p_state;
    end if;
    raise notice 'ok — refused: %', p_what;
    return;
  end;
  raise exception 'INVARIANT "%" was NOT refused', p_what;
end $fn$;

-- Fixtures ------------------------------------------------------------------

-- Fixture users are inserted without the production signup trigger, which
-- admits only approved email domains. The probe is about closure, not signup.
alter table auth.users disable trigger portal_on_auth_user_created;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'admin@probe.test'),
  ('a0000000-0000-4000-8000-000000000002', 'mgr@probe.test'),
  ('a0000000-0000-4000-8000-000000000003', 'se@probe.test'),
  ('a0000000-0000-4000-8000-000000000004', 'other-se@probe.test'),
  ('a0000000-0000-4000-8000-000000000005', 'sales@probe.test');

insert into team_members (id, org_id, active, name, role, email) values
  ('b0000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', true, 'Sam Specialist', 'implementation', 'se@probe.test'),
  ('b0000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', true, 'Olive Other', 'implementation', 'other-se@probe.test'),
  ('b0000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', true, 'Sid Sales', 'sales', 'sales@probe.test');

insert into portal_profiles (id, email, role, org_id, team_member_id) values
  ('a0000000-0000-4000-8000-000000000001', 'admin@probe.test', 'admin', '00000000-0000-4000-8000-000000000001', null),
  ('a0000000-0000-4000-8000-000000000002', 'mgr@probe.test', 'manager', '00000000-0000-4000-8000-000000000001', null),
  ('a0000000-0000-4000-8000-000000000003', 'se@probe.test', 'implementation', '00000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003'),
  ('a0000000-0000-4000-8000-000000000004', 'other-se@probe.test', 'implementation', '00000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004'),
  ('a0000000-0000-4000-8000-000000000005', 'sales@probe.test', 'sales', '00000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000005');

insert into customers (id, org_id, name, source, is_test, updated_at) values
  ('c0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Probe Customer', 'manual', false, now());

-- I1 owned by Sam, pre-kickoff. I2 owned by Sam, in build. I3 unowned, pre-kickoff.
-- G1 graduated by stage. G2 graduated by a graduations row.
insert into implementations (id, org_id, customer_id, name, current_stage, owner_id) values
  ('d0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'I1 owned pre-kickoff', 'handoff', 'b0000000-0000-4000-8000-000000000003'),
  ('d0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'I2 owned in build', 'build', 'b0000000-0000-4000-8000-000000000003'),
  ('d0000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'I3 unowned pre-kickoff', 'handoff', null),
  ('d0000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'G1 graduated by stage', 'graduate-to-cs', 'b0000000-0000-4000-8000-000000000003'),
  ('d0000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'G2 graduated by record', 'build', 'b0000000-0000-4000-8000-000000000003');

-- G3: its own stage looks ordinary, but its deal has graduated.
insert into portal_accounts (id, org_id, name, stage, stage_entered_at, updated_at) values
  ('e0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Probe deal', 'onboarding_complete', now(), now());
insert into implementations (id, org_id, customer_id, name, current_stage, deal_id) values
  ('d0000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'G3 graduated by deal', 'build', 'e0000000-0000-4000-8000-000000000001');

insert into graduations (org_id, implementation_id) values
  ('00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005');

-- Who may close ---------------------------------------------------------------

select portal_close_implementation('d0000000-0000-4000-8000-000000000003', 'implementation_not_required', 'Customer runs this in-house.', 'a0000000-0000-4000-8000-000000000002');
do $$
begin
  if not exists (select 1 from implementations where id = 'd0000000-0000-4000-8000-000000000003' and closed_at is not null and closure_reason = 'implementation_not_required' and closed_by = 'a0000000-0000-4000-8000-000000000002') then
    raise exception 'INVARIANT "a manager can close a pre-kickoff implementation" failed';
  end if;
  raise notice 'ok — a manager closes a pre-kickoff implementation, with reason and closer recorded';
end $$;

select portal_close_implementation('d0000000-0000-4000-8000-000000000001', 'implementation_not_required', 'Owner closes it after the customer said no.', 'a0000000-0000-4000-8000-000000000003');
do $$
begin
  if not exists (select 1 from implementations where id = 'd0000000-0000-4000-8000-000000000001' and closed_at is not null) then
    raise exception 'INVARIANT "the assigned specialist can close their own implementation" failed';
  end if;
  raise notice 'ok — the assigned specialist closes their own implementation';
end $$;

select portal_close_implementation('d0000000-0000-4000-8000-000000000002', 'implementation_not_required', 'Closed by an admin.', 'a0000000-0000-4000-8000-000000000001');
do $$
begin
  if not exists (select 1 from implementations where id = 'd0000000-0000-4000-8000-000000000002' and closed_at is not null) then
    raise exception 'INVARIANT "an admin can close any implementation" failed';
  end if;
  raise notice 'ok — an admin closes an implementation they do not own';
end $$;

select pg_temp.expect_refused(
  $q$ select portal_close_implementation('d0000000-0000-4000-8000-000000000003', 'implementation_not_required', 'Second try.', 'a0000000-0000-4000-8000-000000000002') $q$,
  '23505', 'an implementation cannot be closed twice');

select pg_temp.expect_refused(
  $q$ select portal_close_implementation('d0000000-0000-4000-8000-000000000003', 'implementation_not_required', '   ', 'a0000000-0000-4000-8000-000000000002') $q$,
  '22023', 'a closure needs an explanation');

select pg_temp.expect_refused(
  $q$ select portal_close_implementation('d0000000-0000-4000-8000-000000000003', 'graduated_elsewhere', 'Reason not on the list.', 'a0000000-0000-4000-8000-000000000002') $q$,
  '22023', 'only the closure reason on the list is accepted');

select pg_temp.expect_refused(
  $q$ select portal_close_implementation('d0000000-0000-4000-8000-000000000003', 'implementation_not_required', 'No actor given.', null) $q$,
  '42501', 'a closure needs the acting profile');

select pg_temp.expect_refused(
  $q$ select portal_close_implementation('d0000000-0000-4000-8000-000000000003', 'implementation_not_required', 'Unknown actor.', 'a0000000-0000-4000-8000-0000000000ff') $q$,
  '42501', 'a closure needs a known acting profile');

select pg_temp.expect_refused(
  $q$ select portal_close_implementation('d0000000-0000-4000-8000-000000000003', 'implementation_not_required', 'Sales cannot close.', 'a0000000-0000-4000-8000-000000000005') $q$,
  '42501', 'sales cannot close an implementation');

select pg_temp.expect_refused(
  $q$ select portal_close_implementation('d0000000-0000-4000-8000-000000000001', 'implementation_not_required', 'Not my project.', 'a0000000-0000-4000-8000-000000000004') $q$,
  '42501', 'a specialist who is not the owner cannot close it');

-- Graduation is never closed ------------------------------------------------

select pg_temp.expect_refused(
  $q$ select portal_close_implementation('d0000000-0000-4000-8000-000000000006', 'implementation_not_required', 'Deal already graduated.', 'a0000000-0000-4000-8000-000000000002') $q$,
  '22023', 'an implementation whose deal has graduated cannot be closed');


select pg_temp.expect_refused(
  $q$ select portal_close_implementation('d0000000-0000-4000-8000-000000000004', 'implementation_not_required', 'Graduated already.', 'a0000000-0000-4000-8000-000000000002') $q$,
  '22023', 'a stage that has graduated cannot be closed');

select pg_temp.expect_refused(
  $q$ select portal_close_implementation('d0000000-0000-4000-8000-000000000005', 'implementation_not_required', 'Graduated by record.', 'a0000000-0000-4000-8000-000000000002') $q$,
  '22023', 'a graduation on record cannot be closed');

-- The freeze ----------------------------------------------------------------

select pg_temp.expect_refused(
  $q$ update implementations set current_stage = 'build' where id = 'd0000000-0000-4000-8000-000000000003' $q$,
  '42501', 'a closed implementation does not move stage');

select pg_temp.expect_refused(
  $q$ update implementations set owner_id = 'b0000000-0000-4000-8000-000000000004' where id = 'd0000000-0000-4000-8000-000000000001' $q$,
  '42501', 'a closed implementation is not reassigned');

select pg_temp.expect_refused(
  $q$ update implementations set target_launch_date = current_date where id = 'd0000000-0000-4000-8000-000000000001' $q$,
  '42501', 'a closed implementation has no target-date change');

select pg_temp.expect_refused(
  $q$ update implementations set closure_note = 'Rewritten.' where id = 'd0000000-0000-4000-8000-000000000001' $q$,
  '42501', 'the closure itself cannot be rewritten');

select pg_temp.expect_refused(
  $q$ insert into implementation_stage_history (org_id, implementation_id, stage, entered_at, advanced_with_gaps) values ('00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'build', now(), false) $q$,
  '42501', 'a closed implementation records no stage history');

select pg_temp.expect_refused(
  $q$ insert into stage_instances (implementation_id, stage_key, name, position) values ('d0000000-0000-4000-8000-000000000001', 'build', 'Build', 1) $q$,
  '42501', 'a closed implementation starts no stage');

-- Records stay writable: notes, the implementation's own descriptive fields.
update implementations set customer_goals = 'Kept as a note after closure.' where id = 'd0000000-0000-4000-8000-000000000001';
do $$
begin
  if not exists (select 1 from implementations where id = 'd0000000-0000-4000-8000-000000000001' and customer_goals = 'Kept as a note after closure.') then
    raise exception 'INVARIANT "notes on a closed implementation stay writable" failed';
  end if;
  raise notice 'ok — notes on a closed implementation stay writable';
end $$;

-- Shape and audit -------------------------------------------------------------

select pg_temp.expect_refused(
  $q$ update implementations set closed_at = now() where id = 'd0000000-0000-4000-8000-000000000004' $q$,
  '23514', 'a closure always carries a reason and a note');

do $$
begin
  if (select count(*) from portal_audit_log where action = 'implementation.closed' and entity_id = 'd0000000-0000-4000-8000-000000000003') <> 1 then
    raise exception 'INVARIANT "every closure is audited once" failed';
  end if;
  raise notice 'ok — every closure is audited once';
end $$;

-- Only the service role may call the closing function.
do $$
begin
  if has_function_privilege('authenticated', 'portal_close_implementation(uuid,text,text,uuid)', 'execute') then
    raise exception 'INVARIANT "authenticated cannot call the closing function directly" failed';
  end if;
  if not has_function_privilege('service_role', 'portal_close_implementation(uuid,text,text,uuid)', 'execute') then
    raise exception 'INVARIANT "the service role can call the closing function" failed';
  end if;
  raise notice 'ok — only the service role may call the closing function';
end $$;

-- Deleting the closer's profile clears who closed it, and keeps the closure.
delete from portal_profiles where id = 'a0000000-0000-4000-8000-000000000001';
do $$
begin
  if not exists (select 1 from implementations where id = 'd0000000-0000-4000-8000-000000000002' and closed_at is not null and closed_by is null) then
    raise exception 'INVARIANT "deleting the closer keeps the closure and clears the name" failed';
  end if;
  raise notice 'ok — deleting the closer keeps the closure';
end $$;

rollback;
