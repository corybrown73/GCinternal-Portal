-- Invariant probes for apply_journey_template (0033).
--
-- This function is now the only way a project created from a deal gets a plan,
-- so it runs against LIVE customer work. Two things it must never do:
--
--   * disagree with implementation_stage_history, which is the append-only
--     authority on where a project has been;
--   * manufacture work in a stage the project already left (D10).
--
-- And one thing it must never do twice: a second application over an existing
-- plan would collide on (implementation_id, stage_key) half way through and
-- leave a project whose rail and work items disagree.
--
-- As with 0032, none of this can be proved by the migration itself — CI's
-- database has no implementations — which is why the logic is a function and
-- the fixtures are here.
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
      raise exception 'INVARIANT "%" was refused, but for the wrong reason. Expected a message containing "%", got: %',
        p_what, p_fragment, sqlerrm;
    end if;
    raise notice 'ok — refused: %', p_what;
    return;
  end;
  raise exception 'INVARIANT NOT ENFORCED: % was allowed', p_what;
end $fn$;

insert into customers (id, name)
  values ('55555555-1111-4111-8111-000000000001', 'Apply Probe Co');

-- ---------------------------------------------------------------------------
-- A: a fresh project, exactly as startOnboarding leaves it
-- ---------------------------------------------------------------------------
-- One implementation at the template's first stage, one stage-history row, no
-- stage instances, no work items. This is the shape the handoff creates.
insert into implementations (id, customer_id, name, current_stage, stage_entered_at, target_launch_date)
  values ('55555555-2222-4222-8222-00000000000a',
          '55555555-1111-4111-8111-000000000001',
          'Fresh from a deal', 'handoff', now(), current_date + 60);

insert into implementation_stage_history (implementation_id, stage, entered_at)
  values ('55555555-2222-4222-8222-00000000000a', 'handoff', now());

do $$
declare
  v2_id uuid;
  res   jsonb;
  n_st  int;
  n_wi  int;
  n_tpl int;
begin
  select id into v2_id from journey_templates
   where key = 'new-logo' and version = 2 and status = 'published';
  if v2_id is null then raise exception 'FIXTURE BROKEN: no published New Logo v2'; end if;

  res := apply_journey_template('55555555-2222-4222-8222-00000000000a', v2_id);
  if not (res ->> 'applied')::boolean then
    raise exception 'INVARIANT NOT ENFORCED: a fresh project was not given a plan: %', res;
  end if;

  -- Every stage, and every task, because nothing is behind it.
  select count(*) into n_st from stage_instances
   where implementation_id = '55555555-2222-4222-8222-00000000000a';
  select count(*) into n_wi from work_items
   where implementation_id = '55555555-2222-4222-8222-00000000000a';
  select count(*) into n_tpl from journey_template_tasks where template_id = v2_id;

  if n_st <> 8 then
    raise exception 'INVARIANT NOT ENFORCED: expected 8 stage instances, got %', n_st;
  end if;
  if n_wi <> n_tpl then
    raise exception
      'INVARIANT NOT ENFORCED: a project with nothing behind it got % of % tasks',
      n_wi, n_tpl;
  end if;
  raise notice 'ok — a fresh project gets the whole plan (% stages, % tasks)', n_st, n_wi;
end $$;

-- A fresh plan is 'live' throughout, so a project started from a deal is
-- indistinguishable from one Salesforce created through instantiate_journey.
-- If this ever drifts, dwell metrics start excluding real projects.
do $$
declare n int; v text;
begin
  select count(*), string_agg(distinct provenance, ', ') into n, v
    from stage_instances
   where implementation_id = '55555555-2222-4222-8222-00000000000a'
     and provenance <> 'live';
  if n > 0 then
    raise exception
      'INVARIANT NOT ENFORCED: % stage(s) of a fresh plan were marked reconstructed (%)', n, v;
  end if;
  raise notice 'ok — a fresh plan is live throughout, like instantiate_journey''s';
end $$;

-- The implementation is pinned to the exact version, column and join agreeing.
-- 0032's backfill set the id and left the column, which is the drift this
-- probe exists to stop coming back.
do $$
declare v_col int; v_join int;
begin
  select i.template_version, t.version into v_col, v_join
    from implementations i join journey_templates t on t.id = i.journey_template_id
   where i.id = '55555555-2222-4222-8222-00000000000a';
  if v_col is distinct from v_join then
    raise exception
      'INVARIANT NOT ENFORCED: template_version says % but the template it points at is v%',
      v_col, v_join;
  end if;
  raise notice 'ok — template_version agrees with the template the row points at (v%)', v_col;
end $$;

-- Nothing arrives pre-completed.
do $$
declare n int;
begin
  select count(*) into n from work_items
   where implementation_id = '55555555-2222-4222-8222-00000000000a'
     and (status <> 'not_started' or completed_at is not null or completed_by is not null);
  if n > 0 then
    raise exception 'INVARIANT NOT ENFORCED: % task(s) arrived already started or done', n;
  end if;
  raise notice 'ok — every task arrived as real, untouched work';
end $$;

-- Applying a second time is refused, not doubled. The unique index on
-- (implementation_id, stage_key) would abort mid-loop otherwise.
do $$
declare
  v2_id uuid; res jsonb; n_before int; n_after int;
begin
  select id into v2_id from journey_templates
   where key = 'new-logo' and version = 2 and status = 'published';
  select count(*) into n_before from work_items
   where implementation_id = '55555555-2222-4222-8222-00000000000a';

  res := apply_journey_template('55555555-2222-4222-8222-00000000000a', v2_id);

  select count(*) into n_after from work_items
   where implementation_id = '55555555-2222-4222-8222-00000000000a';

  if (res ->> 'applied')::boolean or n_after <> n_before then
    raise exception
      'INVARIANT NOT ENFORCED: a second application was accepted (% -> % tasks): %',
      n_before, n_after, res;
  end if;
  raise notice 'ok — a second application is refused and changes nothing';
end $$;

-- ---------------------------------------------------------------------------
-- B: a project already mid-flight, reconstructed from its history
-- ---------------------------------------------------------------------------
-- Summit Field Services sat at handoff for days with no plan; a project can
-- equally have moved several stages before anyone notices it has none. The
-- reconstruction must agree with the recorded history and add nothing behind.
insert into implementations (id, customer_id, name, current_stage, stage_entered_at, target_launch_date)
  values ('55555555-2222-4222-8222-00000000000b',
          '55555555-1111-4111-8111-000000000001',
          'Mid-flight, never planned', 'build', now() - interval '4 days',
          current_date + 30);

insert into implementation_stage_history (implementation_id, stage, entered_at, exited_at)
values
  ('55555555-2222-4222-8222-00000000000b', 'handoff',       now() - interval '30 days', now() - interval '24 days'),
  ('55555555-2222-4222-8222-00000000000b', 'plan-internal', now() - interval '24 days', now() - interval '16 days'),
  -- align-external is deliberately ABSENT: a stage the project passed through
  -- with nothing recorded. It must be marked inferred, not given a date.
  ('55555555-2222-4222-8222-00000000000b', 'build',         now() - interval '4 days',  null);

do $$
declare v2_id uuid; res jsonb;
begin
  select id into v2_id from journey_templates
   where key = 'new-logo' and version = 2 and status = 'published';
  res := apply_journey_template('55555555-2222-4222-8222-00000000000b', v2_id);
  if not (res ->> 'applied')::boolean then
    raise exception 'INVARIANT NOT ENFORCED: a mid-flight project was refused a plan: %', res;
  end if;
  raise notice 'ok — mid-flight project planned: %', res;
end $$;

-- Statuses follow the current stage, not the template's first stage.
do $$
declare v_bad text;
begin
  select string_agg(format('%s=%s', stage_key, status), ', ') into v_bad
    from stage_instances si
   where si.implementation_id = '55555555-2222-4222-8222-00000000000b'
     and status <> case
       when si.position < (select position from stage_instances
                            where implementation_id = si.implementation_id
                              and stage_key = 'build') then 'done'
       when si.stage_key = 'build' then 'active'
       else 'pending' end;
  if v_bad is not null then
    raise exception 'INVARIANT NOT ENFORCED: stage statuses disagree with current_stage: %', v_bad;
  end if;
  raise notice 'ok — stage statuses follow the recorded current stage';
end $$;

-- Timestamps come from history, or are absent. Never invented.
do $$
declare
  v_entered timestamptz;
  v_inferred text;
  v_future int;
begin
  -- A stage WITH a history row takes that row's entry and is marked observed.
  select entered_at into v_entered from stage_instances
   where implementation_id = '55555555-2222-4222-8222-00000000000b'
     and stage_key = 'plan-internal';
  if v_entered is null then
    raise exception 'INVARIANT NOT ENFORCED: a stage with recorded history got no entered_at';
  end if;

  -- The stage with NO history row must say so rather than borrow a neighbour's
  -- date. 0014 defines backfill_inferred as exactly this, and dwell metrics
  -- exclude it.
  select provenance into v_inferred from stage_instances
   where implementation_id = '55555555-2222-4222-8222-00000000000b'
     and stage_key = 'align-external';
  if v_inferred <> 'backfill_inferred' then
    raise exception
      'INVARIANT NOT ENFORCED: a passed stage with no recorded entry was marked %, not backfill_inferred',
      v_inferred;
  end if;

  -- Stages not yet reached claim no dates at all.
  select count(*) into v_future from stage_instances
   where implementation_id = '55555555-2222-4222-8222-00000000000b'
     and status = 'pending' and (entered_at is not null or exited_at is not null);
  if v_future > 0 then
    raise exception
      'INVARIANT NOT ENFORCED: % un-reached stage(s) were given timestamps', v_future;
  end if;
  raise notice 'ok — timestamps come from history or are honestly absent';
end $$;

-- Forward only: nothing in a stage the project already left.
do $$
declare v_behind int; v_names text; v_cur int;
begin
  select position into v_cur from stage_instances
   where implementation_id = '55555555-2222-4222-8222-00000000000b' and stage_key = 'build';

  select count(*), string_agg(w.task_key, ', ') into v_behind, v_names
    from work_items w join stage_instances si on si.id = w.stage_instance_id
   where w.implementation_id = '55555555-2222-4222-8222-00000000000b'
     and si.position < v_cur;
  if v_behind > 0 then
    raise exception
      'INVARIANT NOT ENFORCED: % task(s) created in stages already left: %', v_behind, v_names;
  end if;

  -- ...and everything from the current stage onward is there.
  select count(*) into v_behind
    from journey_template_tasks k
    join journey_template_stages s on s.id = k.template_stage_id
    join journey_templates t on t.id = s.template_id
   where t.key = 'new-logo' and t.version = 2 and s.position >= v_cur;
  if v_behind <> (select count(*) from work_items
                   where implementation_id = '55555555-2222-4222-8222-00000000000b') then
    raise exception 'INVARIANT NOT ENFORCED: expected % tasks from the current stage onward, got %',
      v_behind, (select count(*) from work_items
                  where implementation_id = '55555555-2222-4222-8222-00000000000b');
  end if;
  raise notice 'ok — forward only, and complete from the current stage onward';
end $$;

-- No dangling dependency: a task depending on one that was skipped as past
-- must drop the reference, not point at an id that does not exist.
do $$
declare v int;
begin
  select count(*) into v
    from work_items w, unnest(w.depends_on) as dep
   where w.implementation_id = '55555555-2222-4222-8222-00000000000b'
     and not exists (select 1 from work_items d
                      where d.id = dep and d.implementation_id = w.implementation_id);
  if v > 0 then
    raise exception 'INVARIANT NOT ENFORCED: % dangling dependency reference(s)', v;
  end if;
  raise notice 'ok — dependencies on skipped tasks are dropped, not dangled';
end $$;

-- ---------------------------------------------------------------------------
-- C: refusals
-- ---------------------------------------------------------------------------
-- A project sitting on a stage the template does not define. Filing its tasks
-- under a guessed position would put every one of them in the wrong stage; the
-- honest outcome is to send somebody to pick the right template.
insert into implementations (id, customer_id, name, current_stage)
  values ('55555555-2222-4222-8222-00000000000c',
          '55555555-1111-4111-8111-000000000001',
          'Stage the template lacks', 'renewal-review');

select pg_temp.assert_refused(
  format('select apply_journey_template(%L, %L)',
         '55555555-2222-4222-8222-00000000000c',
         (select id from journey_templates where key = 'new-logo' and version = 2)),
  'does not contain',
  'applying a template that lacks the project''s current stage');

-- A draft template is not a plan anybody agreed to.
insert into journey_templates (id, key, name, version, status, journey_type)
  values ('55555555-3333-4333-8333-00000000000d', 'probe-draft', 'Probe Draft', 1, 'draft', 'new_logo');
insert into journey_template_stages (template_id, stage_key, name, position)
  values ('55555555-3333-4333-8333-00000000000d', 'handoff', 'Handoff', 0);

insert into implementations (id, customer_id, name, current_stage)
  values ('55555555-2222-4222-8222-00000000000e',
          '55555555-1111-4111-8111-000000000001', 'Draft target', 'handoff');

select pg_temp.assert_refused(
  format('select apply_journey_template(%L, %L)',
         '55555555-2222-4222-8222-00000000000e',
         '55555555-3333-4333-8333-00000000000d'),
  'only a published template',
  'applying a draft template');

select pg_temp.assert_refused(
  format('select apply_journey_template(%L, %L)',
         '00000000-0000-4000-8000-00000000dead',
         (select id from journey_templates where key = 'new-logo' and version = 2)),
  'no implementation',
  'applying a template to an implementation that does not exist');

-- ---------------------------------------------------------------------------
-- D: the fallback config the design specified
-- ---------------------------------------------------------------------------
-- selectTemplate returns no winner unless a template carries default_for rules,
-- and none does. The documented catch-all is this config key, which 0023 seeded
-- as "none" and no code read. If it goes back to a value that resolves to
-- nothing, every new project silently gets no plan again — the exact failure
-- 0032 and 0033 exist to end.
do $$
declare v_key text; v_tpl uuid;
begin
  select value #>> '{}' into v_key from portal_app_config where key = 'sf_fallback_template';
  if v_key is null then
    raise exception 'INVARIANT NOT ENFORCED: sf_fallback_template is missing entirely';
  end if;
  if v_key = 'none' then
    raise exception 'INVARIANT NOT ENFORCED: sf_fallback_template is still the unread placeholder';
  end if;
  select id into v_tpl from journey_templates
   where key = v_key and status = 'published' and superseded_by_id is null;
  if v_tpl is null then
    raise exception
      'INVARIANT NOT ENFORCED: sf_fallback_template names %, which is not a live published template',
      v_key;
  end if;
  raise notice 'ok — the fallback resolves to a live published template (%)', v_key;
end $$;

rollback;
