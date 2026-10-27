-- Invariant probes for 0091 (complete solutions). Each refusal is checked for its
-- SQLSTATE and its message, so a probe fails when something refuses for the wrong
-- reason. Runs in one transaction and rolls back. Requires ON_ERROR_STOP=1.
--
-- Every write goes through the functions the application calls, so these probes
-- test the rules the application relies on, not just the table constraints.
-- Versions are fixed literals in the fixtures (a touch trigger would otherwise
-- stamp every write with the same transaction time, hiding a stale version).

begin;

create function pg_temp.expect_refused(p_sql text, p_state text, p_what text, p_message text)
returns void language plpgsql as $fn$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_state or sqlerrm not like p_message then
      raise exception 'INVARIANT "%" was refused with % (%), expected % matching %',
        p_what, sqlstate, sqlerrm, p_state, p_message;
    end if;
    raise notice 'ok — refused: %', p_what;
    return;
  end;
  raise exception 'INVARIANT "%" was NOT refused', p_what;
end $fn$;

-- ---------------------------------------------------------------------------
-- Fixtures. The auth.users trigger that creates a profile is switched off for
-- this transaction, so each profile can carry its own role and team member.
-- ---------------------------------------------------------------------------
alter table auth.users disable trigger portal_on_auth_user_created;
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-0000000000b1', 'owner@probe.test'),
  ('a0000000-0000-4000-8000-0000000000b2', 'other@probe.test'),
  ('a0000000-0000-4000-8000-0000000000b3', 'manager@probe.test'),
  ('a0000000-0000-4000-8000-0000000000b4', 'customer@probe.test'),
  ('a0000000-0000-4000-8000-0000000000b5', 'sales@probe.test'),
  ('a0000000-0000-4000-8000-0000000000b6', 'unlinked@probe.test');
insert into team_members (id, org_id, name, role) values
  ('70000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'Owner TIS', 'implementation'),
  ('70000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000001', 'Other TIS', 'implementation'),
  ('70000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-000000000001', 'Sales rep', 'sales');
insert into portal_profiles (id, email, full_name, role, team_member_id) values
  ('a0000000-0000-4000-8000-0000000000b1', 'owner@probe.test', 'Owner TIS', 'implementation', '70000000-0000-4000-8000-0000000000b1'),
  ('a0000000-0000-4000-8000-0000000000b2', 'other@probe.test', 'Other TIS', 'implementation', '70000000-0000-4000-8000-0000000000b2'),
  ('a0000000-0000-4000-8000-0000000000b3', 'manager@probe.test', 'Manager', 'manager', null),
  ('a0000000-0000-4000-8000-0000000000b4', 'customer@probe.test', 'Customer', 'customer', null),
  ('a0000000-0000-4000-8000-0000000000b5', 'sales@probe.test', 'Sales', 'sales', '70000000-0000-4000-8000-0000000000b3'),
  ('a0000000-0000-4000-8000-0000000000b6', 'unlinked@probe.test', 'Unlinked TIS', 'implementation', null);

insert into customers (id, org_id, name, source, is_test, updated_at) values
  ('c0000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'Probe Customer S', 'manual', false, now());
insert into implementations (id, org_id, customer_id, name, current_stage, owner_id) values
  ('d0000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000b1', 'S1', 'build', '70000000-0000-4000-8000-0000000000b1'),
  ('d0000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000b1', 'S2', 'build', '70000000-0000-4000-8000-0000000000b2');
-- Further people and implementations for the owner and role rules below.
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-0000000000c7', 'se@probe.test'),
  ('a0000000-0000-4000-8000-0000000000c8', 'tamse@probe.test'),
  ('a0000000-0000-4000-8000-0000000000c9', 'onboarding@probe.test'),
  ('a0000000-0000-4000-8000-0000000000ca', 'admin@probe.test'),
  ('a0000000-0000-4000-8000-0000000000cb', 'superadmin@probe.test');
insert into team_members (id, org_id, name, role) values
  ('70000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-000000000001', 'SE', 'se'),
  ('70000000-0000-4000-8000-0000000000b5', '00000000-0000-4000-8000-000000000001', 'TAM SE', 'tam_se'),
  ('70000000-0000-4000-8000-0000000000b6', '00000000-0000-4000-8000-000000000001', 'Onboarding', 'onboarding');
insert into portal_profiles (id, email, full_name, role, team_member_id) values
  ('a0000000-0000-4000-8000-0000000000c7', 'se@probe.test', 'SE', 'se', '70000000-0000-4000-8000-0000000000b4'),
  ('a0000000-0000-4000-8000-0000000000c8', 'tamse@probe.test', 'TAM SE', 'tam_se', '70000000-0000-4000-8000-0000000000b5'),
  ('a0000000-0000-4000-8000-0000000000c9', 'onboarding@probe.test', 'Onboarding', 'onboarding', '70000000-0000-4000-8000-0000000000b6'),
  ('a0000000-0000-4000-8000-0000000000ca', 'admin@probe.test', 'Admin', 'admin', null),
  ('a0000000-0000-4000-8000-0000000000cb', 'superadmin@probe.test', 'Super admin', 'super_admin', null);
insert into implementations (id, org_id, customer_id, name, current_stage, owner_id) values
  ('d0000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000b1', 'S3', 'build', '70000000-0000-4000-8000-0000000000b4'),
  ('d0000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000b1', 'S4', 'build', '70000000-0000-4000-8000-0000000000b5'),
  ('d0000000-0000-4000-8000-0000000000b5', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000b1', 'S5', 'build', '70000000-0000-4000-8000-0000000000b6');

-- Team Lead candidate (no team member), an onboarding lead with a separate team
-- member, and an inactive team member for the reassignment checks.
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-0000000000cc', 'teamlead@probe.test'),
  ('a0000000-0000-4000-8000-0000000000cd', 'onboarding2@probe.test');
insert into team_members (id, org_id, name, role, active) values
  ('70000000-0000-4000-8000-0000000000b7', '00000000-0000-4000-8000-000000000001', 'Onboarding 2', 'onboarding', true),
  ('70000000-0000-4000-8000-0000000000b8', '00000000-0000-4000-8000-000000000001', 'Left the team', 'implementation', false);
insert into portal_profiles (id, email, full_name, role, team_member_id) values
  ('a0000000-0000-4000-8000-0000000000cc', 'teamlead@probe.test', 'Team Lead', 'implementation', null),
  ('a0000000-0000-4000-8000-0000000000cd', 'onboarding2@probe.test', 'Onboarding 2', 'onboarding', '70000000-0000-4000-8000-0000000000b7');

insert into complete_solutions (id, org_id, implementation_id, title, updated_at) values
  ('e0000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b1', 'Inspections', '2026-10-01 10:00:00+00'),
  ('e0000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b2', 'Other impl solution', '2026-10-01 10:00:00+00');
insert into solution_components (id, org_id, implementation_id, complete_solution_id, category, name, updated_at) values
  ('f0000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b1', 'forms', 'Inspection form', '2026-10-01 10:00:00+00'),
  ('f0000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b1', 'integrations', 'Dispatch feed', '2026-10-01 10:00:00+00'),
  ('f0000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b2', 'e0000000-0000-4000-8000-0000000000b2', 'training', 'Training', '2026-10-01 10:00:00+00');

-- ---------------------------------------------------------------------------
-- Table invariants: the first target is the original, components stay on their
-- solution's implementation, form fields belong to forms, history is append-only.
-- ---------------------------------------------------------------------------
update solution_components set target_date = '2026-11-01' where id = 'f0000000-0000-4000-8000-0000000000b1';
do $$
begin
  if (select original_target_date from solution_components where id = 'f0000000-0000-4000-8000-0000000000b1') is distinct from date '2026-11-01' then
    raise exception 'INVARIANT "the first target date becomes the original" failed';
  end if;
  raise notice 'ok — the first target date is kept as the original';
end $$;
select pg_temp.expect_refused(
  $$update solution_components set original_target_date = '2026-12-01' where id = 'f0000000-0000-4000-8000-0000000000b1'$$,
  'P0001', 'the original target date cannot be rewritten', '%original target date%');

select pg_temp.expect_refused(
  $$insert into solution_components (org_id, implementation_id, complete_solution_id, category, name)
    values ('00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b2', 'e0000000-0000-4000-8000-0000000000b1', 'other', 'Wrong impl')$$,
  'P0001', 'a component cannot sit under another implementation''s solution', '%belongs to implementation%');

select pg_temp.expect_refused(
  $$insert into solution_components (org_id, implementation_id, complete_solution_id, category, name, form_built)
    values ('00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b1', 'analytics', 'Dashboard', true)$$,
  '23514', 'form fields are refused on a non-form component', '%solution_components_form_fields_check%');

select pg_temp.expect_refused(
  $$update solution_components set category = 'forms', submission_count = 12 where id = 'f0000000-0000-4000-8000-0000000000b2'$$,
  '23514', 'a submission count without the date it was checked is refused', '%solution_components_submission_pair_check%');

select pg_temp.expect_refused(
  $$insert into solution_components (org_id, implementation_id, complete_solution_id, category, integration_type, name)
    values ('00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b1', 'forms', 'dispatch', 'Bad type')$$,
  '23514', 'an integration type on a form is refused', '%solution_components_type_for_integrations_only%');

select pg_temp.expect_refused(
  $$insert into solution_component_dependencies (component_id, depends_on_id)
    values ('f0000000-0000-4000-8000-0000000000b2', 'f0000000-0000-4000-8000-0000000000b3')$$,
  'P0001', 'a dependency cannot cross implementations', '%within one implementation%');

insert into solution_events (org_id, implementation_id, complete_solution_id, kind, to_value)
  values ('00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b1', 'created', 'Inspections');
select pg_temp.expect_refused(
  $$update solution_events set to_value = 'rewritten'$$,
  'P0001', 'history cannot be rewritten', '%history%');
select pg_temp.expect_refused(
  $$delete from solution_events$$,
  'P0001', 'history cannot be deleted', '%history%');
select pg_temp.expect_refused(
  $$delete from complete_solutions where id = 'e0000000-0000-4000-8000-0000000000b1'$$,
  '23503', 'a solution with components cannot be deleted', '%foreign key%');

-- ---------------------------------------------------------------------------
-- Grants: no customer or anonymous caller can run a write function, and the
-- service role can. Checked against the catalogue, not against this session.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  n integer := 0;
begin
  for f in
    select p.oid, p.proname from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.proname = any (array[
         'solution_may_edit', 'solution_require_edit', 'solution_check_version',
         'solution_create', 'solution_update', 'solution_set_target',
         'solution_confirm_readiness', 'solution_set_archived', 'solution_save_reviewed_set',
         'component_create', 'component_update', 'component_form_update',
         'component_set_archived', 'dependency_add', 'dependency_remove',
         'post_sale_may_manage', 'implementation_set_owner'])
  loop
    n := n + 1;
    if has_function_privilege('anon', f.oid, 'execute') or has_function_privilege('authenticated', f.oid, 'execute') then
      raise exception 'INVARIANT "% is callable by a customer or an anonymous caller" failed', f.proname;
    end if;
    if not has_function_privilege('service_role', f.oid, 'execute') then
      raise exception 'INVARIANT "% is not callable by the service role" failed', f.proname;
    end if;
  end loop;
  if n <> 17 then
    raise exception 'INVARIANT "all 17 write functions exist" failed: found %', n;
  end if;
  raise notice 'ok — all 17 write functions are callable by the service role only';
end $$;

-- ---------------------------------------------------------------------------
-- Permissions: an assigned TIS may change their own implementation; a manager
-- may change any; another TIS, a customer, a sales login, and a TIS with no
-- team member are all refused, with nothing written.
-- ---------------------------------------------------------------------------
do $$
declare
  v uuid;
begin
  v := public.solution_create('a0000000-0000-4000-8000-0000000000b1', 'd0000000-0000-4000-8000-0000000000b1',
        'Owner solution', 'purchased', 'deliver_during_implementation');
  if v is null or (select count(*) from complete_solutions where title = 'Owner solution') <> 1 then
    raise exception 'INVARIANT "the assigned TIS may create on their own implementation" failed';
  end if;
  v := public.solution_create('a0000000-0000-4000-8000-0000000000b3', 'd0000000-0000-4000-8000-0000000000b1',
        'Manager solution', 'purchased', 'deliver_during_implementation');
  if v is null then
    raise exception 'INVARIANT "a manager may create on any implementation" failed';
  end if;
  raise notice 'ok — the assigned TIS and a manager may create solutions';
end $$;

select pg_temp.expect_refused(
  $$select public.solution_create('a0000000-0000-4000-8000-0000000000b2', 'd0000000-0000-4000-8000-0000000000b1',
      'Intruder', 'purchased', 'deliver_during_implementation')$$,
  '42501', 'another TIS cannot create on an implementation they do not own', '%You can change the solutions%');
select pg_temp.expect_refused(
  $$select public.solution_create('a0000000-0000-4000-8000-0000000000b4', 'd0000000-0000-4000-8000-0000000000b1',
      'Customer', 'purchased', 'deliver_during_implementation')$$,
  '42501', 'a customer cannot create a solution', '%You can change the solutions%');
select pg_temp.expect_refused(
  $$select public.solution_create('a0000000-0000-4000-8000-0000000000b5', 'd0000000-0000-4000-8000-0000000000b1',
      'Sales', 'purchased', 'deliver_during_implementation')$$,
  '42501', 'a sales login is not a TIS, even when it is linked to a team member', '%You can change the solutions%');
select pg_temp.expect_refused(
  $$select public.solution_create('a0000000-0000-4000-8000-0000000000b6', 'd0000000-0000-4000-8000-0000000000b1',
      'Unlinked', 'purchased', 'deliver_during_implementation')$$,
  '42501', 'a TIS with no team member cannot create', '%You can change the solutions%');
select pg_temp.expect_refused(
  $$select public.solution_create('ffffffff-0000-4000-8000-0000000000ff', 'd0000000-0000-4000-8000-0000000000b1',
      'Nobody', 'purchased', 'deliver_during_implementation')$$,
  '42501', 'a caller with no profile cannot create', '%You can change the solutions%');
select pg_temp.expect_refused(
  $$select public.solution_update('a0000000-0000-4000-8000-0000000000b2', 'e0000000-0000-4000-8000-0000000000b1',
      '2026-10-01 10:00:00+00', '{"title":"Hijacked"}'::jsonb)$$,
  '42501', 'another TIS cannot edit a solution on an implementation they do not own', '%You can change the solutions%');
select pg_temp.expect_refused(
  $$select public.dependency_add('a0000000-0000-4000-8000-0000000000b4', 'f0000000-0000-4000-8000-0000000000b1',
      'f0000000-0000-4000-8000-0000000000b2', false)$$,
  '42501', 'a customer cannot add a dependency', '%You can change the solutions%');
select pg_temp.expect_refused(
  $$select public.component_create('a0000000-0000-4000-8000-0000000000b2', 'e0000000-0000-4000-8000-0000000000b1',
      'other', null, 'Sneaky', 'planned_for_later')$$,
  '42501', 'another TIS cannot add a component to someone else''s solution', '%You can change the solutions%');
do $$
begin
  if (select title from complete_solutions where id = 'e0000000-0000-4000-8000-0000000000b1') <> 'Inspections' then
    raise exception 'INVARIANT "a refused edit writes nothing" failed';
  end if;
  raise notice 'ok — a refused edit writes nothing';
end $$;

-- ---------------------------------------------------------------------------
-- Who may change solutions. Admin, super admin and manager may change any
-- implementation. A delivery owner (implementation or onboarding) may change
-- their own. A technical contributor (se, tam_se) may not, even as the owner:
-- an engineering assignment never grants delivery rights.
-- ---------------------------------------------------------------------------
do $$
begin
  perform public.solution_create('a0000000-0000-4000-8000-0000000000ca', 'd0000000-0000-4000-8000-0000000000b1',
    'Admin solution', 'purchased', 'deliver_during_implementation');
  perform public.solution_create('a0000000-0000-4000-8000-0000000000cb', 'd0000000-0000-4000-8000-0000000000b1',
    'Super admin solution', 'purchased', 'deliver_during_implementation');
  perform public.solution_create('a0000000-0000-4000-8000-0000000000c9', 'd0000000-0000-4000-8000-0000000000b5',
    'Onboarding solution', 'purchased', 'deliver_during_implementation');
  raise notice 'ok — admin, super admin and the owning onboarding lead may create solutions';
end $$;
select pg_temp.expect_refused(
  $$select public.solution_create('a0000000-0000-4000-8000-0000000000c7', 'd0000000-0000-4000-8000-0000000000b3',
      'SE owned', 'purchased', 'deliver_during_implementation')$$,
  '42501', 'an SE who owns an implementation is still a technical contributor and cannot change its delivery solutions', '%You can change the solutions%');
select pg_temp.expect_refused(
  $$select public.solution_create('a0000000-0000-4000-8000-0000000000c8', 'd0000000-0000-4000-8000-0000000000b4',
      'TAM SE owned', 'purchased', 'deliver_during_implementation')$$,
  '42501', 'a TAM SE who owns an implementation cannot change its delivery solutions', '%You can change the solutions%');

-- ---------------------------------------------------------------------------
-- Concurrency: a change made against a version that has since changed is
-- refused, and the newer change stands. The version is the row's updated_at.
-- ---------------------------------------------------------------------------
select pg_temp.expect_refused(
  $$select public.solution_update('a0000000-0000-4000-8000-0000000000b3', 'e0000000-0000-4000-8000-0000000000b1',
      null, '{"title":"No version"}'::jsonb)$$,
  '22023', 'a change with no version is refused', '%needs the version you are changing%');

do $$
begin
  perform public.solution_update('a0000000-0000-4000-8000-0000000000b3', 'e0000000-0000-4000-8000-0000000000b1',
    '2026-10-01 10:00:00+00', '{"title":"Writer B"}'::jsonb);
  if (select title from complete_solutions where id = 'e0000000-0000-4000-8000-0000000000b1') <> 'Writer B' then
    raise exception 'INVARIANT "a change made against the current version is kept" failed';
  end if;
  raise notice 'ok — a change made against the current version is kept';
end $$;

select pg_temp.expect_refused(
  $$select public.solution_update('a0000000-0000-4000-8000-0000000000b3', 'e0000000-0000-4000-8000-0000000000b1',
      '2026-10-01 10:00:00+00', '{"title":"Writer A"}'::jsonb)$$,
  'P0409', 'a change made against a version that has since changed is refused', '%changed while you were looking%');
do $$
begin
  if (select title from complete_solutions where id = 'e0000000-0000-4000-8000-0000000000b1') <> 'Writer B' then
    raise exception 'INVARIANT "the newer change is not overwritten" failed';
  end if;
  if (select count(*) from solution_events where complete_solution_id = 'e0000000-0000-4000-8000-0000000000b1' and kind = 'edited') <> 1 then
    raise exception 'INVARIANT "a refused change writes no history" failed';
  end if;
  raise notice 'ok — the newer change stands and the refused one writes no history';
end $$;

-- ---------------------------------------------------------------------------
-- Atomicity: when the history row cannot be written, the change is not kept.
-- A NOT VALID check on solution_events refuses every history insert, which is
-- the failure the functions must roll back from. Dropped at the end.
-- ---------------------------------------------------------------------------
alter table solution_events add constraint probe_refuse_history check (false) not valid;

select pg_temp.expect_refused(
  format($$select public.solution_set_target('a0000000-0000-4000-8000-0000000000b3', 'e0000000-0000-4000-8000-0000000000b1', %L, date '2026-11-20', null)$$,
         (select updated_at from complete_solutions where id = 'e0000000-0000-4000-8000-0000000000b1')),
  '23514', 'a solution date change whose history cannot be written is not kept', '%probe_refuse_history%');
do $$
begin
  if (select target_date from complete_solutions where id = 'e0000000-0000-4000-8000-0000000000b1') is not null then
    raise exception 'INVARIANT "the solution date is not kept when its history fails" failed';
  end if;
  raise notice 'ok — the solution date is not kept when its history fails';
end $$;

select pg_temp.expect_refused(
  format($$select public.component_update('a0000000-0000-4000-8000-0000000000b3', 'f0000000-0000-4000-8000-0000000000b1', %L, '{"status":"being_built"}'::jsonb, null)$$,
         (select updated_at from solution_components where id = 'f0000000-0000-4000-8000-0000000000b1')),
  '23514', 'a component change whose history cannot be written is not kept', '%probe_refuse_history%');
do $$
begin
  if (select status from solution_components where id = 'f0000000-0000-4000-8000-0000000000b1') <> 'not_started' then
    raise exception 'INVARIANT "the component change is not kept when its history fails" failed';
  end if;
  raise notice 'ok — the component change is not kept when its history fails';
end $$;

select pg_temp.expect_refused(
  format($$select public.component_form_update('a0000000-0000-4000-8000-0000000000b3', 'f0000000-0000-4000-8000-0000000000b1', %L, '{"form_built":true}'::jsonb)$$,
         (select updated_at from solution_components where id = 'f0000000-0000-4000-8000-0000000000b1')),
  '23514', 'a form change whose history cannot be written is not kept', '%probe_refuse_history%');
do $$
begin
  if (select form_built from solution_components where id = 'f0000000-0000-4000-8000-0000000000b1') then
    raise exception 'INVARIANT "the form change is not kept when its history fails" failed';
  end if;
  raise notice 'ok — the form change is not kept when its history fails';
end $$;

alter table solution_events drop constraint probe_refuse_history;

-- ---------------------------------------------------------------------------
-- Refusals that write nothing, and the reasons they name.
-- ---------------------------------------------------------------------------
do $$
begin
  perform public.solution_set_target('a0000000-0000-4000-8000-0000000000b3', 'e0000000-0000-4000-8000-0000000000b1',
    (select updated_at from complete_solutions where id = 'e0000000-0000-4000-8000-0000000000b1'),
    date '2026-11-20', null);
  if (select original_target_date from complete_solutions where id = 'e0000000-0000-4000-8000-0000000000b1') is distinct from date '2026-11-20'
     or (select to_value from solution_events where complete_solution_id = 'e0000000-0000-4000-8000-0000000000b1' and kind = 'target_date') is distinct from '2026-11-20' then
    raise exception 'INVARIANT "the first solution date is kept as its original, with history" failed';
  end if;
  raise notice 'ok — the first solution date is kept as its original, with history';
end $$;

select pg_temp.expect_refused(
  format($$select public.solution_set_target('a0000000-0000-4000-8000-0000000000b3', 'e0000000-0000-4000-8000-0000000000b1', %L, date '2026-12-01', null)$$,
         (select updated_at from complete_solutions where id = 'e0000000-0000-4000-8000-0000000000b1')),
  '22023', 'a later move of the solution date needs a reason', '%Say why the delivery date moves%');

do $$
begin
  perform public.solution_set_target('a0000000-0000-4000-8000-0000000000b3', 'e0000000-0000-4000-8000-0000000000b1',
    (select updated_at from complete_solutions where id = 'e0000000-0000-4000-8000-0000000000b1'),
    date '2026-12-01', 'Vendor sandbox slipped two weeks');
  if (select count(*) from solution_events
       where complete_solution_id = 'e0000000-0000-4000-8000-0000000000b1' and kind = 'target_date'
         and reason = 'Vendor sandbox slipped two weeks' and from_value = '2026-11-20' and to_value = '2026-12-01') <> 1 then
    raise exception 'INVARIANT "a reasoned move is recorded with its reason and both dates" failed';
  end if;
  if (select original_target_date from complete_solutions where id = 'e0000000-0000-4000-8000-0000000000b1') is distinct from date '2026-11-20' then
    raise exception 'INVARIANT "a move keeps the original date" failed';
  end if;
  raise notice 'ok — a reasoned move is recorded with its reason, and the original stays';
end $$;

select pg_temp.expect_refused(
  format($$select public.solution_confirm_readiness('a0000000-0000-4000-8000-0000000000b3', 'e0000000-0000-4000-8000-0000000000b1', %L, 'ready', null)$$,
         (select updated_at from complete_solutions where id = 'e0000000-0000-4000-8000-0000000000b1')),
  '22023', 'confirming Ready needs a reason', '%Say why readiness changes%');

select pg_temp.expect_refused(
  format($$select public.solution_update('a0000000-0000-4000-8000-0000000000b3', 'e0000000-0000-4000-8000-0000000000b1', %L, '{"status":"complete"}'::jsonb)$$,
         (select updated_at from complete_solutions where id = 'e0000000-0000-4000-8000-0000000000b1')),
  '22023', 'a solution cannot be completed while a component is open', '%Still open%');

select pg_temp.expect_refused(
  format($$select public.component_update('a0000000-0000-4000-8000-0000000000b3', 'f0000000-0000-4000-8000-0000000000b2', %L, '{"status":"waiting"}'::jsonb, null)$$,
         (select updated_at from solution_components where id = 'f0000000-0000-4000-8000-0000000000b2')),
  '22023', 'Waiting needs a recorded blocker', '%Record what it is waiting on%');

select pg_temp.expect_refused(
  format($$select public.component_update('a0000000-0000-4000-8000-0000000000b3', 'f0000000-0000-4000-8000-0000000000b2', %L, '{"status":"changes_needed"}'::jsonb, null)$$,
         (select updated_at from solution_components where id = 'f0000000-0000-4000-8000-0000000000b2')),
  '22023', 'Changes Needed needs an explanation', '%Say what needs changing%');

select pg_temp.expect_refused(
  format($$select public.component_form_update('a0000000-0000-4000-8000-0000000000b3', 'f0000000-0000-4000-8000-0000000000b1', %L, '{"submission_count":40}'::jsonb)$$,
         (select updated_at from solution_components where id = 'f0000000-0000-4000-8000-0000000000b1')),
  '22023', 'a submission count needs the date it was checked', '%Enter the date the count was checked%');

select pg_temp.expect_refused(
  format($$select public.component_form_update('a0000000-0000-4000-8000-0000000000b3', 'f0000000-0000-4000-8000-0000000000b2', %L, '{"form_built":true}'::jsonb)$$,
         (select updated_at from solution_components where id = 'f0000000-0000-4000-8000-0000000000b2')),
  '22023', 'form tracking is refused on a non-form component', '%applies to a form component only%');

-- A stale component version is refused even when the change is valid.
select pg_temp.expect_refused(
  $$select public.component_update('a0000000-0000-4000-8000-0000000000b3', 'f0000000-0000-4000-8000-0000000000b1',
      '2026-10-01 10:00:00+00', '{"status":"being_built"}'::jsonb, null)$$,
  'P0409', 'a component changed since it was read is refused', '%changed while you were looking%');

-- ---------------------------------------------------------------------------
-- Dependencies: same implementation, no self links, no loops, no duplicates.
-- ---------------------------------------------------------------------------
select public.dependency_add('a0000000-0000-4000-8000-0000000000b3', 'f0000000-0000-4000-8000-0000000000b1',
  'f0000000-0000-4000-8000-0000000000b2', true);
do $$
begin
  if (select critical from solution_component_dependencies
       where component_id = 'f0000000-0000-4000-8000-0000000000b1' and depends_on_id = 'f0000000-0000-4000-8000-0000000000b2') is not true then
    raise exception 'INVARIANT "a critical dependency is recorded as critical" failed';
  end if;
  raise notice 'ok — a critical dependency is recorded, with history';
end $$;

select pg_temp.expect_refused(
  $$select public.dependency_add('a0000000-0000-4000-8000-0000000000b3', 'f0000000-0000-4000-8000-0000000000b2',
      'f0000000-0000-4000-8000-0000000000b1', false)$$,
  '22023', 'a dependency that closes a loop is refused', '%loop%');
select pg_temp.expect_refused(
  $$select public.dependency_add('a0000000-0000-4000-8000-0000000000b3', 'f0000000-0000-4000-8000-0000000000b1',
      'f0000000-0000-4000-8000-0000000000b1', false)$$,
  '22023', 'a component cannot depend on itself', '%cannot depend on itself%');
select pg_temp.expect_refused(
  $$select public.dependency_add('a0000000-0000-4000-8000-0000000000b3', 'f0000000-0000-4000-8000-0000000000b1',
      'f0000000-0000-4000-8000-0000000000b3', false)$$,
  '22023', 'a dependency cannot cross implementations', '%within one implementation%');
select pg_temp.expect_refused(
  $$select public.dependency_add('a0000000-0000-4000-8000-0000000000b3', 'f0000000-0000-4000-8000-0000000000b1',
      'f0000000-0000-4000-8000-0000000000b2', false)$$,
  '22023', 'a repeated dependency is refused', '%already recorded%');
select pg_temp.expect_refused(
  $$select public.dependency_remove('a0000000-0000-4000-8000-0000000000b3', 'f0000000-0000-4000-8000-0000000000b2',
      'f0000000-0000-4000-8000-0000000000b1')$$,
  '22023', 'removing a dependency that is not recorded is refused', '%no longer recorded%');
select public.dependency_remove('a0000000-0000-4000-8000-0000000000b3', 'f0000000-0000-4000-8000-0000000000b1',
  'f0000000-0000-4000-8000-0000000000b2');
do $$
begin
  if (select count(*) from solution_events where kind in ('dependency_added', 'dependency_removed')
        and component_id = 'f0000000-0000-4000-8000-0000000000b1') <> 2 then
    raise exception 'INVARIANT "dependency add and remove are both in history" failed';
  end if;
  raise notice 'ok — dependency add and remove are both in history';
end $$;

-- ---------------------------------------------------------------------------
-- Reviewed SOW set: all or nothing. A loop in any solution refuses the whole set.
-- ---------------------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  r := public.solution_save_reviewed_set('a0000000-0000-4000-8000-0000000000b3', 'd0000000-0000-4000-8000-0000000000b1', 'Signed SOW',
    '[{"title":"SOW Good","scope":"purchased","priority":"needed_for_go_live","estimateWeeks":3,"sowQuote":"Quote",
       "suggestedTarget":"2026-12-01","components":[
         {"name":"Form","category":"forms","integrationType":null,"priority":"needed_for_go_live","dependsOn":[],"critical":false},
         {"name":"Feed","category":"integrations","integrationType":"dispatch","priority":"needed_for_go_live","dependsOn":["Form","Missing"],"critical":true}]}]'::jsonb);
  if jsonb_array_length(r -> 'created') <> 1 or jsonb_array_length(r -> 'skipped') <> 0 then
    raise exception 'INVARIANT "a reviewed set saves its solutions" failed: %', r;
  end if;
  if (select count(*) from solution_component_dependencies d join solution_components c on c.id = d.component_id
       where c.name = 'Feed') <> 1 then
    raise exception 'INVARIANT "a dependency naming a component outside the set is not saved" failed';
  end if;
  r := public.solution_save_reviewed_set('a0000000-0000-4000-8000-0000000000b3', 'd0000000-0000-4000-8000-0000000000b1', 'Signed SOW',
    '[{"title":"sow good","scope":"purchased","priority":"needed_for_go_live","components":[]}]'::jsonb);
  if jsonb_array_length(r -> 'created') <> 0 or jsonb_array_length(r -> 'skipped') <> 1 then
    raise exception 'INVARIANT "a solution name already on the implementation is skipped, not duplicated" failed: %', r;
  end if;
  raise notice 'ok — a reviewed set saves, skips a repeated name, and ignores unknown dependencies';
end $$;

select pg_temp.expect_refused(
  $$select public.solution_save_reviewed_set('a0000000-0000-4000-8000-0000000000b3', 'd0000000-0000-4000-8000-0000000000b1', 'Signed SOW',
    '[{"title":"SOW Fine","scope":"purchased","priority":"needed_for_go_live","components":[]},
      {"title":"SOW Loop","scope":"purchased","priority":"needed_for_go_live","components":[
        {"name":"Alpha","category":"other","priority":"needed_for_go_live","dependsOn":["Beta"],"critical":false},
        {"name":"Beta","category":"other","priority":"needed_for_go_live","dependsOn":["Alpha"],"critical":false}]}]'::jsonb)$$,
  '22023', 'a loop in one solution refuses the whole reviewed set', '%loop%');
do $$
begin
  if exists (select 1 from complete_solutions where title in ('SOW Fine', 'SOW Loop')) then
    raise exception 'INVARIANT "a refused reviewed set leaves nothing behind" failed';
  end if;
  raise notice 'ok — a refused reviewed set leaves nothing behind';
end $$;

-- ---------------------------------------------------------------------------
-- A purchase record item is the delivery of at most one active solution.
-- ---------------------------------------------------------------------------
do $$
begin
  perform public.solution_create('a0000000-0000-4000-8000-0000000000b3', 'd0000000-0000-4000-8000-0000000000b1',
    'Linked A', 'purchased', 'deliver_during_implementation', null, null, null, null, 'manual', null, 'svc-1');
  raise notice 'ok — a purchase record item links to one solution';
end $$;
select pg_temp.expect_refused(
  $$select public.solution_create('a0000000-0000-4000-8000-0000000000b3', 'd0000000-0000-4000-8000-0000000000b1',
      'Linked B', 'purchased', 'deliver_during_implementation', null, null, null, null, 'manual', null, 'svc-1')$$,
  '22023', 'a second solution for the same purchase record item is refused', '%already the delivery%');

-- A reviewed set does not link a second solution to a purchase record item that
-- already has one: that solution is skipped, and the rest of the set is saved.
do $$
declare
  r jsonb;
begin
  r := public.solution_save_reviewed_set('a0000000-0000-4000-8000-0000000000b3', 'd0000000-0000-4000-8000-0000000000b1', 'Signed SOW',
    '[{"title":"Second link","scope":"purchased","priority":"needed_for_go_live","purchasedServiceId":"svc-1","components":[]},
      {"title":"Unlinked","scope":"purchased","priority":"needed_for_go_live","purchasedServiceId":null,"components":[]}]'::jsonb);
  if jsonb_array_length(r -> 'created') <> 1 or jsonb_array_length(r -> 'skipped') <> 1
     or (r -> 'skipped' -> 0 ->> 'title') <> 'Second link' then
    raise exception 'INVARIANT "a purchase record item links to one solution in a reviewed set" failed: %', r;
  end if;
  raise notice 'ok — a reviewed set skips a second link to the same purchase record item and keeps the rest';
end $$;

-- A formal reassignment moves the right with it: the old owner is refused, the new one allowed.
update implementations set owner_id = '70000000-0000-4000-8000-0000000000b2' where id = 'd0000000-0000-4000-8000-0000000000b1';
select pg_temp.expect_refused(
  $$select public.solution_create('a0000000-0000-4000-8000-0000000000b1', 'd0000000-0000-4000-8000-0000000000b1',
      'Old owner', 'purchased', 'deliver_during_implementation')$$,
  '42501', 'the previous owner loses solution rights on reassignment', '%You can change the solutions%');
do $$
begin
  perform public.solution_create('a0000000-0000-4000-8000-0000000000b2', 'd0000000-0000-4000-8000-0000000000b1',
    'New owner', 'purchased', 'deliver_during_implementation');
  raise notice 'ok — the new owner gains solution rights on reassignment';
end $$;

-- ---------------------------------------------------------------------------
-- Team Lead authority is granted only by an admin or super admin, signed in, never
-- to oneself, and never by a system process. The stub reads auth.uid() from the
-- JWT claims, so each case sets the caller explicitly.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000ca"}', true);
update portal_profiles set team_lead = true where id = 'a0000000-0000-4000-8000-0000000000cc';
do $$
begin
  if not (select team_lead from portal_profiles where id = 'a0000000-0000-4000-8000-0000000000cc') then
    raise exception 'INVARIANT "an admin grants Team Lead" failed';
  end if;
  raise notice 'ok — an admin grants Team Lead';
end $$;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000cb"}', true);
update portal_profiles set team_lead = true where id = 'a0000000-0000-4000-8000-0000000000cd';
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000cb"}', true);
update portal_profiles set team_lead = false where id = 'a0000000-0000-4000-8000-0000000000cd';
do $$
begin
  if (select team_lead from portal_profiles where id = 'a0000000-0000-4000-8000-0000000000cd') then
    raise exception 'INVARIANT "a super admin removes Team Lead" failed';
  end if;
  raise notice 'ok — a super admin grants and removes Team Lead';
end $$;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000b3"}', true);
select pg_temp.expect_refused(
  $$update portal_profiles set team_lead = true where id = 'a0000000-0000-4000-8000-0000000000cd'$$,
  '42501', 'a manager cannot grant Team Lead', '%Only an admin or super admin%');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000cc"}', true);
select pg_temp.expect_refused(
  $$update portal_profiles set team_lead = true where id = 'a0000000-0000-4000-8000-0000000000cd'$$,
  '42501', 'a Team Lead cannot grant Team Lead to someone else', '%Only an admin or super admin%');
select pg_temp.expect_refused(
  $$update portal_profiles set team_lead = false where id = 'a0000000-0000-4000-8000-0000000000cc'$$,
  '42501', 'a Team Lead cannot remove their own Team Lead authority', '%Nobody can change their own%');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000ca"}', true);
select pg_temp.expect_refused(
  $$update portal_profiles set team_lead = true where id = 'a0000000-0000-4000-8000-0000000000ca'$$,
  '42501', 'an admin cannot grant themselves Team Lead', '%Nobody can change their own%');

select set_config('request.jwt.claims', '{}', true);
select pg_temp.expect_refused(
  $$update portal_profiles set team_lead = true where id = 'a0000000-0000-4000-8000-0000000000cd'$$,
  '42501', 'a system process (no signed-in caller) cannot grant Team Lead', '%signed-in admin%');

-- Team Lead reaches every post-sale implementation, not only the ones it owns.
do $$
begin
  perform public.solution_create('a0000000-0000-4000-8000-0000000000cc', 'd0000000-0000-4000-8000-0000000000b3',
    'Team Lead solution on S3', 'purchased', 'deliver_during_implementation');
  perform public.solution_create('a0000000-0000-4000-8000-0000000000cc', 'd0000000-0000-4000-8000-0000000000b5',
    'Team Lead solution on S5', 'purchased', 'deliver_during_implementation');
  raise notice 'ok — a Team Lead manages implementations it does not own';
end $$;

-- Technical contributors and other TIS users are refused on implementations they do not own.
select pg_temp.expect_refused(
  $$select public.solution_create('a0000000-0000-4000-8000-0000000000c7', 'd0000000-0000-4000-8000-0000000000b1',
      'SE on S1', 'purchased', 'deliver_during_implementation')$$,
  '42501', 'an SE who does not own an implementation cannot change it', '%You can change the solutions%');
select pg_temp.expect_refused(
  $$select public.solution_create('a0000000-0000-4000-8000-0000000000cd', 'd0000000-0000-4000-8000-0000000000b1',
      'Onboarding 2 on S1', 'purchased', 'deliver_during_implementation')$$,
  '42501', 'an onboarding lead who does not own an implementation cannot change it', '%You can change the solutions%');

-- ---------------------------------------------------------------------------
-- Reassignment: owner_id is the authority; a change of owner needs a reason, is
-- recorded, and cannot be made by the assigned TIS.
-- ---------------------------------------------------------------------------
select pg_temp.expect_refused(
  $$select public.implementation_set_owner('a0000000-0000-4000-8000-0000000000c9', 'd0000000-0000-4000-8000-0000000000b5',
      '70000000-0000-4000-8000-0000000000b7', 'workload', 'Taking it over')$$,
  '42501', 'an assigned TIS cannot reassign their own implementation', '%Only a Team Lead, a manager or an admin%');
select pg_temp.expect_refused(
  $$select public.implementation_set_owner('a0000000-0000-4000-8000-0000000000cc', 'd0000000-0000-4000-8000-0000000000b5',
      '70000000-0000-4000-8000-0000000000b8', 'coverage', 'Cover')$$,
  '22023', 'an inactive team member cannot be given an implementation', '%not active%');
select public.implementation_set_owner('a0000000-0000-4000-8000-0000000000cc', 'd0000000-0000-4000-8000-0000000000b5',
  '70000000-0000-4000-8000-0000000000b7', 'workload', 'Onboarding 2 takes over delivery');
-- A manual reassignment needs a reason code: without one it is refused, and nothing changes.
select pg_temp.expect_refused(
  $$select public.implementation_set_owner('a0000000-0000-4000-8000-0000000000cc', 'd0000000-0000-4000-8000-0000000000b4',
      '70000000-0000-4000-8000-0000000000b7', null, null)$$,
  '22023', 'a manual reassignment without a reason is refused', '%Choose why the implementation is being reassigned%');
select pg_temp.expect_refused(
  $$select public.implementation_set_owner('a0000000-0000-4000-8000-0000000000cc', 'd0000000-0000-4000-8000-0000000000b4',
      '70000000-0000-4000-8000-0000000000b7', 'other', '   ')$$,
  '22023', 'a reason of Other needs words', '%Say why, in a few words%');
do $$
begin
  if (select owner_id from implementations where id = 'd0000000-0000-4000-8000-0000000000b4') is distinct from '70000000-0000-4000-8000-0000000000b5' then
    raise exception 'INVARIANT "a refused reassignment changes nothing" failed';
  end if;
  raise notice 'ok — a refused reassignment changes nothing';
end $$;
select public.implementation_set_owner('a0000000-0000-4000-8000-0000000000cc', 'd0000000-0000-4000-8000-0000000000b4',
  '70000000-0000-4000-8000-0000000000b7', 'customer_escalation', null);
do $$
begin
  -- Recorded once: the manual change is a single row with its reason and source, and
  -- the direct-write trigger does not add a second, system row for the same change.
  if (select count(*) from implementation_owner_changes
       where implementation_id = 'd0000000-0000-4000-8000-0000000000b4'
         and to_team_member_id = '70000000-0000-4000-8000-0000000000b7') <> 1 then
    raise exception 'INVARIANT "a manual change is recorded exactly once" failed';
  end if;
  if (select count(*) from implementation_owner_changes
       where implementation_id = 'd0000000-0000-4000-8000-0000000000b4'
         and to_team_member_id = '70000000-0000-4000-8000-0000000000b7'
         and source = 'manual' and reason_code = 'customer_escalation' and actor_profile_id = 'a0000000-0000-4000-8000-0000000000cc') <> 1 then
    raise exception 'INVARIANT "a manual change keeps its code, its source and who made it" failed';
  end if;
  raise notice 'ok — a manual change is recorded once, with its code, source and actor';
end $$;

-- A write to owner_id that does not come through the reassignment function is still
-- recorded, as a system change. Nothing is invented for it: no reason, no actor.
update implementations set owner_id = '70000000-0000-4000-8000-0000000000b6' where id = 'd0000000-0000-4000-8000-0000000000b4';
do $$
begin
  if (select count(*) from implementation_owner_changes
       where implementation_id = 'd0000000-0000-4000-8000-0000000000b4'
         and to_team_member_id = '70000000-0000-4000-8000-0000000000b6'
         and source = 'system' and reason_code is null and reason is null and actor_profile_id is null) <> 1 then
    raise exception 'INVARIANT "a direct owner write is recorded as a system change, with no invented reason" failed';
  end if;
  raise notice 'ok — a direct owner write is recorded as a system change, with no invented reason';
end $$;

do $$
begin
  if (select owner_id from implementations where id = 'd0000000-0000-4000-8000-0000000000b5') is distinct from '70000000-0000-4000-8000-0000000000b7' then
    raise exception 'INVARIANT "a Team Lead reassigns an implementation" failed';
  end if;
  if (select count(*) from implementation_owner_changes
       where implementation_id = 'd0000000-0000-4000-8000-0000000000b5'
         and from_team_member_id = '70000000-0000-4000-8000-0000000000b6'
         and to_team_member_id = '70000000-0000-4000-8000-0000000000b7'
         and reason = 'Onboarding 2 takes over delivery') <> 1 then
    raise exception 'INVARIANT "a reassignment is recorded with the old and new owner and the reason" failed';
  end if;
  raise notice 'ok — a Team Lead reassigns an implementation, and the change is recorded';
end $$;
select pg_temp.expect_refused(
  $$select public.solution_create('a0000000-0000-4000-8000-0000000000c9', 'd0000000-0000-4000-8000-0000000000b5',
      'Old owner after reassignment', 'purchased', 'deliver_during_implementation')$$,
  '42501', 'the previous owner loses rights on reassignment', '%You can change the solutions%');
do $$
begin
  perform public.solution_create('a0000000-0000-4000-8000-0000000000cd', 'd0000000-0000-4000-8000-0000000000b5',
    'New owner after reassignment', 'purchased', 'deliver_during_implementation');
  raise notice 'ok — the new owner gains rights on reassignment';
end $$;

-- The owner history is a record: it cannot be rewritten or erased.
select pg_temp.expect_refused(
  $$update implementation_owner_changes set reason = 'rewritten'$$,
  'P0001', 'owner history cannot be rewritten', '%is a record%');
select pg_temp.expect_refused(
  $$delete from implementation_owner_changes$$,
  'P0001', 'owner history cannot be deleted', '%is a record%');

-- The owner conflict report: read only, and it reports disagreement, not agreement.
-- S5's owner is b7; its role assignment says b5: a conflict. S3's owner is b4 and its
-- role assignment agrees: no conflict.
insert into implementation_role_assignments (implementation_id, role_key, team_member_id) values
  ('d0000000-0000-4000-8000-0000000000b5', 'implementation_manager', '70000000-0000-4000-8000-0000000000b5'),
  ('d0000000-0000-4000-8000-0000000000b3', 'implementation_manager', '70000000-0000-4000-8000-0000000000b4');
do $$
begin
  if (select count(*) from implementation_owner_conflicts where implementation_id = 'd0000000-0000-4000-8000-0000000000b5') <> 1 then
    raise exception 'INVARIANT "a role assignment that disagrees with the owner is reported" failed';
  end if;
  if (select count(*) from implementation_owner_conflicts where implementation_id = 'd0000000-0000-4000-8000-0000000000b3') <> 0 then
    raise exception 'INVARIANT "an implementation with no owner conflict is not reported" failed';
  end if;
  if (select owner_id from implementations where id = 'd0000000-0000-4000-8000-0000000000b5') is distinct from '70000000-0000-4000-8000-0000000000b7' then
    raise exception 'INVARIANT "reporting a conflict does not change the owner" failed';
  end if;
  raise notice 'ok — a disagreement is reported; the owner is unchanged';
end $$;
select pg_temp.expect_refused(
  $$set role authenticated; select count(*) from implementation_owner_conflicts$$,
  '42501', 'the conflict report is not readable by a signed-in user directly', '%permission denied%');

-- ---------------------------------------------------------------------------
-- Existing rows: the first solution exists with its history, and a solution
-- with components cannot be deleted.
-- ---------------------------------------------------------------------------
select pg_temp.expect_refused(
  $$delete from complete_solutions where id = 'e0000000-0000-4000-8000-0000000000b1'$$,
  '23503', 'a solution with components cannot be deleted', '%foreign key%');

rollback;
