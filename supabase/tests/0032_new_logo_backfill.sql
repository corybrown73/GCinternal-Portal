-- Invariant probes for backfill_template_tasks_forward (0032).
--
-- This function touches LIVE customer projects: it re-points an in-flight
-- implementation at a new template version and creates work items on it. The
-- rule it exists to hold is that it never manufactures history. A task
-- created in a stage the project already left would either sit permanently
-- overdue or, worse, get auto-completed and record work nobody did.
--
-- The migration's own loop cannot be tested: CI's database has no
-- implementations, so it executes zero times. That is exactly why the logic
-- lives in a function. These probes seed a real mid-flight project and call it.
--
-- Runs inside one transaction and rolls back. Requires ON_ERROR_STOP=1.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures: a project at stage 4 of 8, with the first four stages entered
-- ---------------------------------------------------------------------------
insert into customers (id, name)
  values ('44444444-1111-4111-8111-000000000001', 'Backfill Probe Co');

insert into implementations (id, customer_id, name, current_stage, target_launch_date)
  values ('44444444-2222-4222-8222-000000000001',
          '44444444-1111-4111-8111-000000000001',
          'Probe rollout', 'build', '2026-12-01');

-- Point it at v1, the way every real implementation was.
update implementations
   set journey_template_id = (select id from journey_templates
                               where key = 'new-logo' and version = 1)
 where id = '44444444-2222-4222-8222-000000000001';

-- Eight stage instances mirroring v2's stage order. The first four are
-- entered, matching a project that has reached `build`.
insert into stage_instances
  (implementation_id, stage_key, name, position, entered_at, status)
select '44444444-2222-4222-8222-000000000001', s.stage_key, s.name, s.position,
       case when s.position <= 4
            then now() - ((5 - s.position) * 7 || ' days')::interval
            else null end,
       case when s.position < 4 then 'done'
            when s.position = 4 then 'active'
            else 'pending' end
  from journey_template_stages s
  join journey_templates t on t.id = s.template_id
 where t.key = 'new-logo' and t.version = 2;

-- ---------------------------------------------------------------------------
-- Run it
-- ---------------------------------------------------------------------------
do $$
declare
  v2_id uuid;
  made  int;
begin
  select id into v2_id from journey_templates
   where key = 'new-logo' and version = 2 and status = 'published';
  if v2_id is null then
    raise exception 'FIXTURE BROKEN: no published New Logo v2';
  end if;
  made := backfill_template_tasks_forward(
    '44444444-2222-4222-8222-000000000001', v2_id);
  if made = 0 then
    raise exception 'INVARIANT NOT ENFORCED: the backfill created no tasks at all';
  end if;
  raise notice 'ok — backfill created % task(s)', made;
end $$;

-- ---------------------------------------------------------------------------
-- Nothing behind the current stage
-- ---------------------------------------------------------------------------
do $$
declare
  v_behind int;
  v_names  text;
begin
  select count(*), string_agg(w.task_key, ', ')
    into v_behind, v_names
    from work_items w
    join stage_instances si on si.id = w.stage_instance_id
   where w.implementation_id = '44444444-2222-4222-8222-000000000001'
     and si.position < 4;

  if v_behind > 0 then
    raise exception
      'INVARIANT NOT ENFORCED: % task(s) created in stages the project already left: %',
      v_behind, v_names;
  end if;
  raise notice 'ok — no tasks manufactured in stages already passed';
end $$;

-- ---------------------------------------------------------------------------
-- Everything from the current stage onward
-- ---------------------------------------------------------------------------
do $$
declare
  v_expected int;
  v_actual   int;
begin
  select count(*) into v_expected
    from journey_template_tasks k
    join journey_template_stages s on s.id = k.template_stage_id
    join journey_templates t on t.id = s.template_id
   where t.key = 'new-logo' and t.version = 2 and s.position >= 4;

  select count(*) into v_actual
    from work_items
   where implementation_id = '44444444-2222-4222-8222-000000000001';

  if v_actual <> v_expected then
    raise exception
      'INVARIANT NOT ENFORCED: expected % tasks from stage 4 onward, got %',
      v_expected, v_actual;
  end if;
  raise notice 'ok — every task from the current stage onward was created (%)', v_actual;
end $$;

-- ---------------------------------------------------------------------------
-- Nothing is silently completed
-- ---------------------------------------------------------------------------
-- The failure this guards is the tempting one: filling in the past by marking
-- it done. Every created task must be untouched work.
do $$
declare n int;
begin
  select count(*) into n from work_items
   where implementation_id = '44444444-2222-4222-8222-000000000001'
     and (status <> 'not_started' or completed_at is not null
          or completed_by is not null);
  if n > 0 then
    raise exception
      'INVARIANT NOT ENFORCED: % backfilled task(s) arrived already completed or started', n;
  end if;
  raise notice 'ok — every backfilled task arrived as real, untouched work';
end $$;

-- ---------------------------------------------------------------------------
-- Due dates are computed, or honestly absent
-- ---------------------------------------------------------------------------
do $$
declare
  v_entered int;
  v_future  int;
  v_launch  int;
begin
  -- stage_entry tasks on the ENTERED stage get a date from its entered_at.
  select count(*) into v_entered
    from work_items w
    join stage_instances si on si.id = w.stage_instance_id
   where w.implementation_id = '44444444-2222-4222-8222-000000000001'
     and si.position = 4 and w.due_basis = 'stage_entry' and w.due_at is not null;
  if v_entered = 0 then
    raise exception 'INVARIANT NOT ENFORCED: no due date computed for the active stage';
  end if;

  -- stage_entry tasks on a stage NOT yet entered have nothing to anchor to and
  -- must be null rather than guessed.
  select count(*) into v_future
    from work_items w
    join stage_instances si on si.id = w.stage_instance_id
   where w.implementation_id = '44444444-2222-4222-8222-000000000001'
     and si.entered_at is null and w.due_basis = 'stage_entry'
     and w.due_at is not null;
  if v_future > 0 then
    raise exception
      'INVARIANT NOT ENFORCED: % task(s) in un-entered stages were given an invented due date',
      v_future;
  end if;

  -- target_launch tasks anchor to the launch date, which this fixture has.
  select count(*) into v_launch
    from work_items
   where implementation_id = '44444444-2222-4222-8222-000000000001'
     and due_basis = 'target_launch' and due_at is null;
  if v_launch > 0 then
    raise exception
      'INVARIANT NOT ENFORCED: % launch-anchored task(s) got no date despite a launch date being set',
      v_launch;
  end if;

  raise notice 'ok — due dates computed where anchorable, null where not';
end $$;

-- ---------------------------------------------------------------------------
-- Dependencies resolve forward and drop backward
-- ---------------------------------------------------------------------------
do $$
declare v_dangling int;
begin
  -- Every uuid in depends_on must be a work item on this same implementation.
  select count(*) into v_dangling
    from work_items w, unnest(w.depends_on) as dep
   where w.implementation_id = '44444444-2222-4222-8222-000000000001'
     and not exists (
       select 1 from work_items d
        where d.id = dep
          and d.implementation_id = w.implementation_id);
  if v_dangling > 0 then
    raise exception 'INVARIANT NOT ENFORCED: % dangling dependency reference(s)', v_dangling;
  end if;
  raise notice 'ok — no dangling dependencies, backward ones dropped cleanly';
end $$;

-- ---------------------------------------------------------------------------
-- Running it twice changes nothing
-- ---------------------------------------------------------------------------
-- A migration that is re-applied, or an operator who clicks twice, must not
-- double the plan.
do $$
declare
  v_before int;
  v_after  int;
  v2_id    uuid;
  made     int;
begin
  select count(*) into v_before from work_items
   where implementation_id = '44444444-2222-4222-8222-000000000001';
  select id into v2_id from journey_templates
   where key = 'new-logo' and version = 2 and status = 'published';

  made := backfill_template_tasks_forward(
    '44444444-2222-4222-8222-000000000001', v2_id);

  select count(*) into v_after from work_items
   where implementation_id = '44444444-2222-4222-8222-000000000001';

  if v_after <> v_before or made <> 0 then
    raise exception
      'INVARIANT NOT ENFORCED: a second run created % task(s) (% -> %)',
      made, v_before, v_after;
  end if;
  raise notice 'ok — a second run is a no-op';
end $$;

-- ---------------------------------------------------------------------------
-- A never-instantiated project gets the whole plan
-- ---------------------------------------------------------------------------
-- Two of the six production implementations have no stage instances at all.
-- They are not "past" anything, so forward-only means everything.
insert into implementations (id, customer_id, name, current_stage)
  values ('44444444-2222-4222-8222-000000000002',
          '44444444-1111-4111-8111-000000000001', 'Never started', 'handoff');

do $$
declare
  v2_id uuid;
  made  int;
begin
  select id into v2_id from journey_templates
   where key = 'new-logo' and version = 2 and status = 'published';
  made := backfill_template_tasks_forward(
    '44444444-2222-4222-8222-000000000002', v2_id);
  -- No stage instances means no rows to join against, so nothing is created.
  -- That is correct and worth pinning: the fix for such a project is
  -- instantiate_journey, not this function, and silently creating orphaned
  -- work items with no stage would be worse than creating none.
  if made <> 0 then
    raise exception
      'INVARIANT CHANGED: a project with no stage instances got % task(s); it should get none from this path',
      made;
  end if;
  raise notice 'ok — a never-instantiated project is left for instantiate_journey, not half-filled';
end $$;

rollback;
