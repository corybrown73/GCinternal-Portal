-- Invariant probes for the atomic Kickoff correction (0089).
--
-- The correction is one transaction. These probes check that: it removes only
-- the Kickoff record and returns the deal to Kickoff; it leaves later work and
-- everything else alone; it writes the stage history and the audit row; it
-- refuses stale requests, partner implementations, customers, other
-- organisations and callers that are not the server; and a failure part-way
-- writes nothing.
--
-- Runs inside one transaction and rolls back. Requires ON_ERROR_STOP=1.

begin;

create function pg_temp.assert_refused(p_sql text, p_fragment text, p_what text)
returns void language plpgsql as $fn$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_fragment) in lower(sqlerrm)) = 0 then
      raise exception 'INVARIANT "%" was refused, but for the wrong reason. Expected "%", got: %',
        p_what, p_fragment, sqlerrm;
    end if;
    raise notice 'ok — refused: %', p_what;
    return;
  end;
  raise exception 'INVARIANT "%" was accepted but must be refused', p_what;
end;
$fn$;

create function pg_temp.assert_eq(p_sql text, p_expected text, p_what text)
returns void language plpgsql as $fn$
declare
  v text;
begin
  execute p_sql into v;
  if v is distinct from p_expected then
    raise exception 'INVARIANT "%" expected %, got %', p_what, p_expected, v;
  end if;
  raise notice 'ok — %', p_what;
end;
$fn$;

create function pg_temp.as_server() returns void language sql as $fn$
  select set_config('request.jwt.claim.role', 'service_role', true);
$fn$;

create function pg_temp.snap(p_completed jsonb) returns jsonb language sql as $fn$
  select case when (intake #> '{timeline,completed}') = p_completed then intake
              else jsonb_set(intake, '{timeline,completed}', p_completed) end
    from portal_accounts where id = '00000000-0000-4000-8000-0000000000d1';
$fn$;

create function pg_temp.as_role(p_role text) returns void language sql as $fn$
  select set_config('request.jwt.claim.role', p_role, true);
$fn$;

-- Fixtures: one organisation, a deal and its implementation, a second
-- organisation, and people in each.
insert into orgs (id, name) values ('00000000-0000-4000-8000-0000000000c2', 'Other org')
  on conflict do nothing;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'probe-tis@gocanvas.com'),
  ('00000000-0000-4000-8000-0000000000a2', 'probe-customer@gocanvas.com'),
  ('00000000-0000-4000-8000-0000000000a3', 'probe-other-org@gocanvas.com')
on conflict do nothing;

-- The sign-up trigger creates each profile with a default role, and the role
-- guard refuses a change unless the caller is an admin. The fixture sets the
-- roles directly, so the guard is off for this setup only, and back on after.
alter table portal_profiles disable trigger portal_profiles_role_guard;
insert into portal_profiles (id, email, role, org_id) values
  ('00000000-0000-4000-8000-0000000000a1', 'probe-tis@gocanvas.com', 'implementation', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000a2', 'probe-customer@gocanvas.com', 'customer', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000a3', 'probe-other-org@gocanvas.com', 'implementation', '00000000-0000-4000-8000-0000000000c2')
on conflict (id) do update set role = excluded.role, org_id = excluded.org_id;
alter table portal_profiles enable trigger portal_profiles_role_guard;

insert into customers (id, name) values ('00000000-0000-4000-8000-0000000000c1', 'Probe customer')
  on conflict do nothing;

-- The deal: held Kickoff, later work done on the Make It Yours task, and a note.
insert into portal_accounts (id, name, stage, intake) values
  ('00000000-0000-4000-8000-0000000000d1', 'Probe deal', 'get_it_working',
   '{"path":"new_logo","timeline":{"completed":{"kickoff":"2026-09-25","working":"2026-10-02","intake_done":"2026-09-20"},"overrides":{"kickoff":"2026-09-25","live":"2026-11-30"},"times":{"kickoff":"10:00"}}}');

insert into implementations (id, customer_id, name, current_stage, deal_id) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', 'Probe impl',
   'build', '00000000-0000-4000-8000-0000000000d1');

insert into journal_entries (id, implementation_id, stage, note, kind) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 'get_it_working',
   'Kickoff notes: the transcript says approvals go to the regional manager', 'note');

-- 1. Later work, no later stage complete: the record goes, the work stays, the
--    deal returns to Kickoff, and the stage history and audit log record it.
select pg_temp.as_server();
select public.portal_correct_kickoff_held(
  '00000000-0000-4000-8000-0000000000d1', 'get_it_working',
  pg_temp.snap('{"kickoff":"2026-09-25","working":"2026-10-02","intake_done":"2026-09-20"}'::jsonb),
  '00000000-0000-4000-8000-0000000000a1', 'Ticked by mistake', 1);

select pg_temp.assert_eq(
  $q$ select stage::text from portal_accounts where id = '00000000-0000-4000-8000-0000000000d1' $q$,
  'kickoff', 'the deal returns to Kickoff');
select pg_temp.assert_eq(
  $q$ select ((intake #> '{timeline,completed}') = '{"working": "2026-10-02", "intake_done": "2026-09-20"}'::jsonb)::text from portal_accounts where id = '00000000-0000-4000-8000-0000000000d1' $q$,
  'true',
  'only the Kickoff record is removed; later work and earlier steps are kept');
select pg_temp.assert_eq(
  $q$ select ((intake #> '{timeline,overrides}') = '{"kickoff": "2026-09-25", "live": "2026-11-30"}'::jsonb)::text from portal_accounts where id = '00000000-0000-4000-8000-0000000000d1' $q$,
  'true',
  'deadlines and overrides are unchanged');
select pg_temp.assert_eq(
  $q$ select count(*)::text from portal_stage_transitions where account_id = '00000000-0000-4000-8000-0000000000d1'
        and from_stage = 'get_it_working' and to_stage = 'kickoff' and source = 'ui'
        and actor_profile_id = '00000000-0000-4000-8000-0000000000a1' $q$,
  '1', 'the stage move is written to the stage history');
select pg_temp.assert_eq(
  $q$ select count(*)::text from portal_audit_log where action = 'kickoff.held_unticked'
        and entity_id = '00000000-0000-4000-8000-0000000000d1' $q$,
  '1', 'the correction is written to the audit log');
select pg_temp.assert_eq(
  $q$ select (note = 'Kickoff notes: the transcript says approvals go to the regional manager')::text
        from journal_entries where id = '00000000-0000-4000-8000-0000000000f1' $q$,
  'true', 'the notes and transcript text are not touched');

-- 2. A stale replay of the same request is refused: nothing moves twice.
select pg_temp.assert_refused(
  $q$ select public.portal_correct_kickoff_held('00000000-0000-4000-8000-0000000000d1', 'get_it_working',
        pg_temp.snap('{"kickoff":"2026-09-25","working":"2026-10-02","intake_done":"2026-09-20"}'::jsonb),
        '00000000-0000-4000-8000-0000000000a1', 'again', 0) $q$,
  'kickoff_correction_stale', 'a replayed correction is refused as stale');

-- Restore Kickoff held and a Get it working deal for the remaining probes.
select set_config('app.allow_stage_change', 'on', true);
update portal_accounts set stage = 'get_it_working',
  intake = jsonb_set(intake, '{timeline,completed}', '{"kickoff":"2026-09-25","working":"2026-10-02","intake_done":"2026-09-20"}')
  where id = '00000000-0000-4000-8000-0000000000d1';

-- 3. Stale stage: the deal has moved since the server decided.
select pg_temp.assert_refused(
  $q$ select public.portal_correct_kickoff_held('00000000-0000-4000-8000-0000000000d1', 'make_it_yours',
        pg_temp.snap('{"kickoff":"2026-09-25","working":"2026-10-02","intake_done":"2026-09-20"}'::jsonb),
        '00000000-0000-4000-8000-0000000000a1', 'x', 0) $q$,
  'kickoff_correction_stale', 'a stale stage is refused');

-- 4. Stale completion record: a later tick changed the snapshot.
select pg_temp.assert_refused(
  $q$ select public.portal_correct_kickoff_held('00000000-0000-4000-8000-0000000000d1', 'get_it_working',
        pg_temp.snap('{"kickoff":"2026-09-25","intake_done":"2026-09-20"}'::jsonb),
        '00000000-0000-4000-8000-0000000000a1', 'x', 0) $q$,
  'kickoff_correction_stale', 'a changed completion record is refused as stale');
select pg_temp.assert_eq(
  $q$ select stage::text from portal_accounts where id = '00000000-0000-4000-8000-0000000000d1' $q$,
  'get_it_working', 'a refused stale request writes nothing');

-- 5. Kickoff not held.
update portal_accounts set intake = jsonb_set(intake, '{timeline,completed}', '{"working":"2026-10-02"}')
  where id = '00000000-0000-4000-8000-0000000000d1';
select pg_temp.assert_refused(
  $q$ select public.portal_correct_kickoff_held('00000000-0000-4000-8000-0000000000d1', 'get_it_working',
        pg_temp.snap('{"working":"2026-10-02"}'::jsonb),
        '00000000-0000-4000-8000-0000000000a1', 'x', 0) $q$,
  'kickoff_correction_not_held', 'a deal without Kickoff held is refused');
update portal_accounts set intake = jsonb_set(intake, '{timeline,completed}', '{"kickoff":"2026-09-25","working":"2026-10-02","intake_done":"2026-09-20"}')
  where id = '00000000-0000-4000-8000-0000000000d1';

-- 6. Partner implementations, by intake path and by implementation journey.
update portal_accounts set intake = jsonb_set(intake, '{path}', '"partner_implementation"')
  where id = '00000000-0000-4000-8000-0000000000d1';
select pg_temp.assert_refused(
  $q$ select public.portal_correct_kickoff_held('00000000-0000-4000-8000-0000000000d1', 'get_it_working',
        pg_temp.snap('{"kickoff":"2026-09-25","working":"2026-10-02","intake_done":"2026-09-20"}'::jsonb),
        '00000000-0000-4000-8000-0000000000a1', 'x', 0) $q$,
  'kickoff_correction_not_applicable', 'a partner intake path is never corrected');
update portal_accounts set intake = jsonb_set(intake, '{path}', '"new_logo"')
  where id = '00000000-0000-4000-8000-0000000000d1';
update implementations set journey_type = 'partner_implementation'
  where id = '00000000-0000-4000-8000-0000000000e1';
select pg_temp.assert_refused(
  $q$ select public.portal_correct_kickoff_held('00000000-0000-4000-8000-0000000000d1', 'get_it_working',
        pg_temp.snap('{"kickoff":"2026-09-25","working":"2026-10-02","intake_done":"2026-09-20"}'::jsonb),
        '00000000-0000-4000-8000-0000000000a1', 'x', 0) $q$,
  'kickoff_correction_not_applicable', 'a partner implementation journey is never corrected');
update implementations set journey_type = null where id = '00000000-0000-4000-8000-0000000000e1';

-- 7. Permissions: a customer login, and a person from another organisation.
--    Except the last check, these are the server calling on a person's behalf.
select pg_temp.assert_refused(
  $q$ select public.portal_correct_kickoff_held('00000000-0000-4000-8000-0000000000d1', 'get_it_working',
        pg_temp.snap('{"kickoff":"2026-09-25","working":"2026-10-02","intake_done":"2026-09-20"}'::jsonb),
        '00000000-0000-4000-8000-0000000000a2', 'x', 0) $q$,
  'kickoff_correction_forbidden', 'a customer login cannot correct Kickoff');
select pg_temp.assert_refused(
  $q$ select public.portal_correct_kickoff_held('00000000-0000-4000-8000-0000000000d1', 'get_it_working',
        pg_temp.snap('{"kickoff":"2026-09-25","working":"2026-10-02","intake_done":"2026-09-20"}'::jsonb),
        '00000000-0000-4000-8000-0000000000a3', 'x', 0) $q$,
  'kickoff_correction_forbidden', 'a person from another organisation cannot correct the deal');
select pg_temp.as_role('authenticated');
select pg_temp.assert_refused(
  $q$ select public.portal_correct_kickoff_held('00000000-0000-4000-8000-0000000000d1', 'get_it_working',
        pg_temp.snap('{"kickoff":"2026-09-25","working":"2026-10-02","intake_done":"2026-09-20"}'::jsonb),
        '00000000-0000-4000-8000-0000000000a1', 'x', 0) $q$,
  'kickoff_correction_forbidden', 'a caller that is not the server is refused');
select pg_temp.as_server();

-- 8. The function is not callable by anon or authenticated.
select pg_temp.assert_eq(
  $q$ select (has_function_privilege('authenticated', 'public.portal_correct_kickoff_held(uuid, portal_account_stage, jsonb, uuid, text, integer)', 'execute')
           or has_function_privilege('anon', 'public.portal_correct_kickoff_held(uuid, portal_account_stage, jsonb, uuid, text, integer)', 'execute'))::text $q$,
  'false', 'anon and authenticated have no execute right');

-- 9. No partial writes: if the audit row cannot be written, nothing else is
--    written either. The failure is forced part-way, after the deal update.
select pg_temp.as_role('service_role');
create function pg_temp.fail_audit() returns trigger language plpgsql as $fn$
begin
  if new.action = 'kickoff.held_unticked' then
    raise exception 'probe: audit write fails';
  end if;
  return new;
end;
$fn$;
create trigger probe_fail_audit before insert on portal_audit_log
  for each row execute function pg_temp.fail_audit();

do $$
begin
  perform public.portal_correct_kickoff_held('00000000-0000-4000-8000-0000000000d1', 'get_it_working',
    pg_temp.snap('{"kickoff":"2026-09-25","working":"2026-10-02","intake_done":"2026-09-20"}'::jsonb),
    '00000000-0000-4000-8000-0000000000a1', 'x', 0);
  raise exception 'INVARIANT "a failed audit write aborts the correction" was accepted';
exception when others then
  if sqlerrm not like '%probe: audit write fails%' then
    raise;
  end if;
  raise notice 'ok — a failed audit write aborts the whole correction';
end $$;
select pg_temp.assert_eq(
  $q$ select (stage::text = 'get_it_working' and (intake #> '{timeline,completed}') = '{"kickoff": "2026-09-25", "working": "2026-10-02", "intake_done": "2026-09-20"}'::jsonb)::text
        from portal_accounts where id = '00000000-0000-4000-8000-0000000000d1' $q$,
  'true',
  'the failed correction leaves the stage and the record exactly as they were');

-- 10. A correction from Kickoff itself removes the record and keeps the stage.
select set_config('app.allow_stage_change', 'on', true);
update portal_accounts set stage = 'kickoff' where id = '00000000-0000-4000-8000-0000000000d1';
select set_config('app.allow_stage_change', '', true);
drop trigger probe_fail_audit on portal_audit_log;
select public.portal_correct_kickoff_held(
  '00000000-0000-4000-8000-0000000000d1', 'kickoff',
  pg_temp.snap('{"kickoff":"2026-09-25","working":"2026-10-02","intake_done":"2026-09-20"}'::jsonb),
  '00000000-0000-4000-8000-0000000000a1', 'In kickoff', 0);
select pg_temp.assert_eq(
  $q$ select stage::text from portal_accounts where id = '00000000-0000-4000-8000-0000000000d1' $q$,
  'kickoff', 'a correction made while in Kickoff keeps the stage');
select pg_temp.assert_eq(
  $q$ select count(*)::text from portal_stage_transitions where account_id = '00000000-0000-4000-8000-0000000000d1'
        and note like 'Kickoff held unticked: In kickoff%' $q$,
  '0', 'no stage history row is written when the stage does not change');

-- 11. A concurrent write that is not the completion record. The server decided
--     "automatic" for a deal in Complete with no outcome. Another person then
--     records the outcome, which makes Complete done and the decision blocked.
--     The correction must refuse on the old decision, and write nothing.
select pg_temp.as_server();
select set_config('app.allow_stage_change', 'on', true);
update portal_accounts set stage = 'onboarding_complete',
  intake = jsonb_set(intake, '{timeline,completed}', '{"kickoff":"2026-09-25","intake_done":"2026-09-20"}')
  where id = '00000000-0000-4000-8000-0000000000d1';
select set_config('app.allow_stage_change', '', true);
create temp table probe_snap as
  select intake from portal_accounts where id = '00000000-0000-4000-8000-0000000000d1';
update portal_accounts set intake = jsonb_set(intake, '{outcome}',
  '{"kind": "proven", "reason": null, "at": "2026-10-01T00:00:00Z", "by": null}')
  where id = '00000000-0000-4000-8000-0000000000d1';
select pg_temp.assert_refused(
  $q$ select public.portal_correct_kickoff_held('00000000-0000-4000-8000-0000000000d1', 'onboarding_complete',
        (select intake from probe_snap), '00000000-0000-4000-8000-0000000000a1', 'race', 0) $q$,
  'kickoff_correction_stale', 'an outcome recorded after the decision refuses the correction');
select pg_temp.assert_eq(
  $q$ select (stage::text = 'onboarding_complete' and (intake #> '{timeline,completed,kickoff}') = '"2026-09-25"'::jsonb
        and (intake #> '{outcome,kind}') = '"proven"'::jsonb)::text
        from portal_accounts where id = '00000000-0000-4000-8000-0000000000d1' $q$,
  'true', 'the refused race writes nothing: the stage, the record and the outcome are as they were');
select pg_temp.assert_eq(
  $q$ select count(*)::text from portal_stage_transitions where account_id = '00000000-0000-4000-8000-0000000000d1'
        and note like 'Kickoff held unticked: race%' $q$,
  '0', 'the refused race writes no stage history');

-- 12. Positive control: the same request with nothing changed since the decision
--     is accepted, so the guard refuses only real changes.
update portal_accounts set intake = intake - 'outcome'
  where id = '00000000-0000-4000-8000-0000000000d1';
select public.portal_correct_kickoff_held('00000000-0000-4000-8000-0000000000d1', 'onboarding_complete',
  (select intake from probe_snap), '00000000-0000-4000-8000-0000000000a1', 'unchanged', 0);
select pg_temp.assert_eq(
  $q$ select stage::text from portal_accounts where id = '00000000-0000-4000-8000-0000000000d1' $q$,
  'kickoff', 'an unchanged request is accepted and returns the deal to Kickoff');

rollback;
