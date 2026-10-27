-- Invariant probes for 0091 (complete solutions). Each refusal is checked for its
-- SQLSTATE and its message, so a probe fails when something refuses for the wrong
-- reason. Runs in one transaction and rolls back. Requires ON_ERROR_STOP=1.

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

-- Fixtures: one implementation with two solutions, and a second implementation.
insert into customers (id, org_id, name, source, is_test, updated_at) values
  ('c0000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'Probe Customer S', 'manual', false, now());
insert into implementations (id, org_id, customer_id, name, current_stage) values
  ('d0000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000b1', 'S1', 'build'),
  ('d0000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000b1', 'S2', 'build');
insert into complete_solutions (id, org_id, implementation_id, title) values
  ('e0000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b1', 'Inspections'),
  ('e0000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b2', 'Other impl solution');
insert into solution_components (id, org_id, implementation_id, complete_solution_id, category, name) values
  ('f0000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b1', 'forms', 'Inspection form'),
  ('f0000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b1', 'integrations', 'Dispatch feed'),
  ('f0000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b2', 'e0000000-0000-4000-8000-0000000000b2', 'training', 'Training');

-- Original target date: the first date given is kept, and never moves.
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

-- A component belongs to its solution's implementation.
select pg_temp.expect_refused(
  $$insert into solution_components (org_id, implementation_id, complete_solution_id, category, name)
    values ('00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b2', 'e0000000-0000-4000-8000-0000000000b1', 'other', 'Wrong impl')$$,
  'P0001', 'a component cannot sit under another implementation''s solution', '%belongs to implementation%');

-- Form tracking belongs to forms only.
select pg_temp.expect_refused(
  $$insert into solution_components (org_id, implementation_id, complete_solution_id, category, name, form_built)
    values ('00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b1', 'analytics', 'Dashboard', true)$$,
  '23514', 'form fields are refused on a non-form component', '%solution_components_form_fields_check%');

-- Submission count and checked date travel together.
select pg_temp.expect_refused(
  $$update solution_components set category = 'forms', submission_count = 12 where id = 'f0000000-0000-4000-8000-0000000000b2'$$,
  '23514', 'a submission count without the date it was checked is refused', '%solution_components_submission_pair_check%');

-- Integration type belongs to integrations only.
select pg_temp.expect_refused(
  $$insert into solution_components (org_id, implementation_id, complete_solution_id, category, integration_type, name)
    values ('00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b1', 'forms', 'dispatch', 'Bad type')$$,
  '23514', 'an integration type on a form is refused', '%solution_components_type_for_integrations_only%');

-- Dependencies stay within one implementation, and cannot point at themselves.
select pg_temp.expect_refused(
  $$insert into solution_component_dependencies (component_id, depends_on_id)
    values ('f0000000-0000-4000-8000-0000000000b2', 'f0000000-0000-4000-8000-0000000000b3')$$,
  'P0001', 'a dependency cannot cross implementations', '%within one implementation%');
select pg_temp.expect_refused(
  $$insert into solution_component_dependencies (component_id, depends_on_id)
    values ('f0000000-0000-4000-8000-0000000000b2', 'f0000000-0000-4000-8000-0000000000b2')$$,
  '23514', 'a component cannot depend on itself', '%not_self%');

-- History is append-only.
insert into solution_events (org_id, implementation_id, complete_solution_id, kind, to_value)
  values ('00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b1', 'created', 'Inspections');
select pg_temp.expect_refused(
  $$update solution_events set to_value = 'rewritten'$$,
  'P0001', 'history cannot be rewritten', '%history%');
select pg_temp.expect_refused(
  $$delete from solution_events$$,
  'P0001', 'history cannot be deleted', '%history%');

-- A solution with components cannot be deleted (history stays).
select pg_temp.expect_refused(
  $$delete from complete_solutions where id = 'e0000000-0000-4000-8000-0000000000b1'$$,
  '23503', 'a solution with components cannot be deleted', '%foreign key%');

rollback;
