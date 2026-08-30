-- 0033 — give an EXISTING implementation a plan
--
-- WHY THIS EXISTS
--
-- 0032 found that New Logo v1 shipped with zero tasks and fixed the template.
-- It did not fix the reason the three live accounts were the *only* ones that
-- even had stage instances: they were seeded by 0015/0016. Nothing the
-- application itself creates gets a plan. Four things stack up:
--
--   1. startOnboarding() — the pre-sale -> onboarding handoff, the path this
--      product is named for — raw-inserts into `implementations` and never
--      touches journey_template_id. No stage instances, no work items.
--   2. createImplementation() — the manual "New implementation" — the same.
--   3. The Salesforce path IS wired correctly (sf_create_implementation calls
--      instantiate_journey), but selectTemplate() reads
--      `journey_templates.default_for`, and every template has it NULL. Every
--      candidate is recorded as "no default_for rules" and the winner is null,
--      so the wired path applies nothing either.
--   4. template-select.ts says a catch-all "belongs in the
--      `sf_fallback_template` config". 0023 seeded that key to '"none"'. No
--      code has ever read it.
--
-- This migration fixes 3 and 4 in the data, and supplies the function that 1
-- and 2 were missing.
--
-- WHY A NEW FUNCTION RATHER THAN instantiate_journey
--
-- instantiate_journey creates the implementation row itself — deliberately, so
-- that the legacy creation path and the templated one can never both write and
-- disagree about the first stage. That is the right design and it is exactly
-- what makes it useless here: startOnboarding has already created the row (and
-- linked the deal, and moved the pre-sale stage) by the time a plan is wanted,
-- and Summit Field Services has been sitting at handoff since 2026-08-29.
-- Neither can be handed to a function whose first act is an INSERT.
--
-- So the plan-building half becomes its own function, working against a row
-- that exists. instantiate_journey is left untouched: it is applied, it is
-- correct, and rewriting a live creation path to prove a point about
-- duplication would risk the one path that currently works.
--
-- WHAT IT REFUSES TO INVENT
--
-- The implementation already has a current_stage and an append-only
-- implementation_stage_history. Both are authoritative and neither is
-- overwritten. Stage instances are built to AGREE with that history:
--
--   * a stage with a history row takes its timestamps from that row and is
--     marked provenance 'backfill_observed';
--   * a stage behind the current one with NO history row is 'done' with null
--     timestamps and provenance 'backfill_inferred' — 0014 defines that value
--     as "deduced from stage ORDER with no recorded entry", which the UI
--     labels and dwell metrics exclude;
--   * a fresh implementation (sitting on the template's first stage with no
--     history beyond it) is marked 'live' throughout, so a project started
--     from a deal and a project created from Salesforce produce byte-identical
--     plans.
--
-- Work items are created FORWARD ONLY, from the current stage on. This is the
-- same rule 0032's backfill follows and it is the user's decision (D10):
-- auto-completing the past records work nobody did, in a system whose whole
-- argument is an honest trail.

-- ---------------------------------------------------------------------------
-- apply_journey_template
-- ---------------------------------------------------------------------------
create or replace function apply_journey_template(
  p_implementation_id uuid,
  p_template_id uuid,
  p_answers jsonb default '{}'::jsonb,
  p_roles jsonb default '{}'::jsonb,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  tpl              journey_templates%rowtype;
  impl             implementations%rowtype;
  first_stage      journey_template_stages%rowtype;
  st               journey_template_stages%rowtype;
  tsk              journey_template_tasks%rowtype;
  hist             record;
  si_id            uuid;
  si_status        text;
  si_provenance    text;
  si_entered       timestamptz;
  si_exited        timestamptz;
  cur_pos          int;
  stage_pos        jsonb := '{}'::jsonb;
  stage_to_instance jsonb := '{}'::jsonb;
  stage_entered    jsonb := '{}'::jsonb;
  key_to_item      jsonb := '{}'::jsonb;
  included         text[] := '{}';
  excluded         jsonb := '[]'::jsonb;
  skipped_past     text[] := '{}';
  is_fresh         boolean;
  hist_count       int;
  project_start    timestamptz;
  target_launch    date;
  due              timestamptz;
  owner            uuid;
  new_item_id      uuid;
  dep_key          text;
  dep_ids          uuid[];
  actor_tm         uuid;
  task_stage_key   text;
begin
  if not (auth.role() = 'service_role' or portal_is_internal()) then
    raise exception 'forbidden';
  end if;

  select * into impl from implementations where id = p_implementation_id;
  if not found then
    raise exception 'apply_journey_template: no implementation %', p_implementation_id;
  end if;

  select * into tpl from journey_templates where id = p_template_id;
  if not found then
    raise exception 'apply_journey_template: no template %', p_template_id;
  end if;
  if tpl.status <> 'published' then
    raise exception 'Template % is %, only a published template can be applied',
      p_template_id, tpl.status;
  end if;

  -- Never plan twice. A second plan over the first would either duplicate
  -- every stage (the unique index refuses it) or half-apply and leave a
  -- project whose rail disagrees with its work items. Callers that want to
  -- re-plan must say so explicitly, which no caller does yet.
  if exists (select 1 from stage_instances where implementation_id = impl.id) then
    return jsonb_build_object(
      'applied', false,
      'reason', 'implementation already has a plan',
      'implementation_id', impl.id
    );
  end if;

  select * into first_stage from journey_template_stages
   where template_id = p_template_id order by position limit 1;
  if not found then
    raise exception 'Template % has no stages', p_template_id;
  end if;

  -- The current stage must exist in this template. Guessing a position for a
  -- stage the template does not contain would silently file every task under
  -- the wrong stage; refusing sends somebody to pick the right template.
  select position into cur_pos from journey_template_stages
   where template_id = p_template_id and stage_key = impl.current_stage;
  if cur_pos is null then
    raise exception
      'Implementation % is at stage %, which template % (%, v%) does not contain',
      impl.id, impl.current_stage, p_template_id, tpl.key, tpl.version;
  end if;

  -- "Fresh" = created moments ago and never moved: sitting on the template's
  -- first stage with no history anywhere else. Only then is the plan genuinely
  -- live rather than reconstructed.
  select count(*) into hist_count
    from implementation_stage_history
   where implementation_id = impl.id and stage <> first_stage.stage_key;
  is_fresh := (cur_pos = first_stage.position and hist_count = 0);

  select team_member_id into actor_tm from portal_profiles where id = p_actor_id;

  project_start := coalesce(impl.kickoff_at, impl.contract_start_date::timestamptz, impl.created_at);
  target_launch := impl.target_launch_date;

  -- 1. Stage instances, agreeing with the recorded history.
  for st in select * from journey_template_stages
             where template_id = p_template_id order by position loop

    -- The first recorded entry into this stage, and the last recorded exit.
    -- History is append-only and a stage can be re-entered; the span from
    -- first entry to last exit is the honest reading of that.
    select min(h.entered_at) as entered, max(h.exited_at) as exited
      into hist
      from implementation_stage_history h
     where h.implementation_id = impl.id and h.stage = st.stage_key;

    si_entered := hist.entered;
    si_exited  := hist.exited;

    if st.position < cur_pos then
      si_status := 'done';
    elsif st.position = cur_pos then
      si_status := 'active';
      si_exited := null;                       -- the current stage has not ended
      si_entered := coalesce(si_entered, impl.stage_entered_at);
    else
      si_status := 'pending';
      si_entered := null;                      -- not reached; no date to claim
      si_exited := null;
    end if;

    if is_fresh then
      si_provenance := 'live';
    elsif st.position > cur_pos then
      si_provenance := 'live';                 -- nothing about the future is reconstructed
    elsif si_entered is not null then
      si_provenance := 'backfill_observed';
    else
      si_provenance := 'backfill_inferred';
    end if;

    insert into stage_instances (
      implementation_id, template_stage_id, stage_key, name, phase, position,
      gate_mode, entry_criteria, exit_criteria, target_duration_days,
      status, provenance, entered_at, exited_at
    )
    values (
      impl.id, st.id, st.stage_key, st.name, st.phase, st.position,
      st.gate_mode, st.entry_criteria, st.exit_criteria, st.target_duration_days,
      si_status, si_provenance, si_entered, si_exited
    )
    returning id into si_id;

    stage_to_instance := stage_to_instance || jsonb_build_object(st.stage_key, si_id);
    stage_pos         := stage_pos || jsonb_build_object(st.stage_key, st.position);
    if si_entered is not null then
      stage_entered := stage_entered || jsonb_build_object(st.stage_key, si_entered);
    end if;
  end loop;

  -- 2. Work items, forward only, for the tasks whose conditions hold.
  for tsk in select t.* from journey_template_tasks t
              join journey_template_stages s on s.id = t.template_stage_id
             where t.template_id = p_template_id
             order by s.position, t.position loop

    select stage_key into task_stage_key from journey_template_stages
     where id = tsk.template_stage_id;

    -- D10: a stage already left gets no tasks. Recorded by key so the reason
    -- for an absent task is readable rather than inferred from a gap.
    if (stage_pos ->> task_stage_key)::int < cur_pos then
      skipped_past := skipped_past || tsk.task_key;
      continue;
    end if;

    if not journey_include_when_matches(tsk.include_when, coalesce(p_answers, '{}'::jsonb)) then
      excluded := excluded || jsonb_build_object('key', tsk.task_key, 'clause', tsk.include_when);
      continue;
    end if;

    -- Unresolved keeps the role and leaves the owner null —
    -- "Solutions Engineer (unassigned)" — never an invented name.
    owner := null;
    if tsk.party = 'internal' then
      select team_member_id into owner from implementation_role_assignments
       where implementation_id = impl.id and role_key = tsk.role_key;
    end if;

    -- A due date only where its basis actually exists. A stage not yet entered
    -- has nothing to date from, and a blank beats a guess.
    due := case
      when tsk.offset_basis = 'project_start' and project_start is not null
        then project_start + make_interval(days => tsk.offset_days)
      when tsk.offset_basis = 'target_launch' and target_launch is not null
        then target_launch::timestamptz + make_interval(days => tsk.offset_days)
      when tsk.offset_basis = 'stage_entry' and (stage_entered ? task_stage_key)
        then (stage_entered ->> task_stage_key)::timestamptz
             + make_interval(days => tsk.offset_days)
      else null
    end;

    insert into work_items (
      implementation_id, stage_instance_id, template_task_id, task_key,
      title, description, position, role_key, owner_id, party, visibility,
      due_basis, due_offset_days, duration_days, due_at
    )
    values (
      impl.id,
      (stage_to_instance ->> task_stage_key)::uuid,
      tsk.id, tsk.task_key, tsk.title, tsk.description, tsk.position,
      tsk.role_key, owner, tsk.party, tsk.visibility,
      tsk.offset_basis, tsk.offset_days, tsk.duration_days, due
    )
    returning id into new_item_id;

    included    := included || tsk.task_key;
    key_to_item := key_to_item || jsonb_build_object(tsk.task_key, new_item_id);
  end loop;

  -- 3. Dependencies. One naming a task that was not created — excluded by a
  --    condition, or belonging to a stage already behind us — is dropped, not
  --    left dangling at an id that does not exist.
  for tsk in select t.* from journey_template_tasks t
             where t.template_id = p_template_id
               and array_length(t.depends_on_keys, 1) > 0
               and t.task_key = any (included) loop
    dep_ids := '{}';
    foreach dep_key in array tsk.depends_on_keys loop
      if key_to_item ? dep_key then
        dep_ids := dep_ids || (key_to_item ->> dep_key)::uuid;
      end if;
    end loop;
    update work_items set depends_on = dep_ids
     where implementation_id = impl.id and task_key = tsk.task_key;
  end loop;

  -- 4. Pin the implementation to this exact template version. 0032's backfill
  --    set journey_template_id and left template_version behind, which is how
  --    three production rows came to point at v2 while claiming v1.
  update implementations
     set journey_template_id = tpl.id,
         journey_type        = coalesce(tpl.journey_type, journey_type),
         template_version    = tpl.version,
         updated_at          = now()
   where id = impl.id;

  -- 5. How this plan was built, kept as evidence.
  insert into journey_instantiations (
    implementation_id, template_id, scoping_snapshot, included_task_keys,
    excluded_task_keys, role_resolution, created_by
  )
  values (
    impl.id, p_template_id, coalesce(p_answers, '{}'::jsonb), included,
    excluded, coalesce(p_roles, '{}'::jsonb), p_actor_id
  );

  insert into journey_events (implementation_id, kind, actor_id, detail)
  values (impl.id, 'instantiated', p_actor_id, jsonb_build_object(
    'template_id', p_template_id, 'template_key', tpl.key, 'version', tpl.version,
    'applied_to_existing', true,
    'fresh', is_fresh,
    'from_stage', impl.current_stage,
    'included', included,
    'excluded', excluded,
    'skipped_already_passed', skipped_past
  ));

  return jsonb_build_object(
    'applied', true,
    'implementation_id', impl.id,
    'template_id', tpl.id,
    'template_key', tpl.key,
    'template_version', tpl.version,
    'fresh', is_fresh,
    'from_stage', impl.current_stage,
    'stages', (select count(*) from stage_instances where implementation_id = impl.id),
    'work_items', coalesce(array_length(included, 1), 0),
    'skipped_already_passed', coalesce(array_length(skipped_past, 1), 0),
    'excluded_by_condition', jsonb_array_length(excluded)
  );
end $$;

revoke execute on function apply_journey_template(uuid, uuid, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function apply_journey_template(uuid, uuid, jsonb, jsonb, uuid)
  to service_role;

comment on function apply_journey_template(uuid, uuid, jsonb, jsonb, uuid) is
  'Build stage instances and work items for an implementation that already '
  'exists, agreeing with its recorded stage history and creating tasks only '
  'from its current stage forward. instantiate_journey remains the path for '
  'creating an implementation and its plan together.';

-- ---------------------------------------------------------------------------
-- backfill_template_tasks_forward: also pin template_version
-- ---------------------------------------------------------------------------
-- 0032's backfill re-pointed journey_template_id and left template_version at
-- whatever it was, so after 0032 ran, Acme, BlueRiver and Corewell each pointed
-- at New Logo v2 while their template_version column said 1. Every read that
-- trusts the column rather than the join reported the wrong version. Replacing
-- the function fixes future runs; the UPDATE below fixes the rows 0032 left.
create or replace function backfill_template_tasks_forward(
  p_implementation_id uuid,
  p_template_id uuid
)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_impl    record;
  v_cur_pos int;
  v_made    int;
  v_version int;
begin
  select i.id, i.current_stage, i.target_launch_date into v_impl
    from implementations i where i.id = p_implementation_id;
  if not found then
    raise exception 'backfill_template_tasks_forward: no implementation %',
      p_implementation_id;
  end if;

  select version into v_version from journey_templates where id = p_template_id;
  if v_version is null then
    raise exception 'backfill_template_tasks_forward: no template %', p_template_id;
  end if;

  update stage_instances si
     set template_stage_id = s2.id
    from journey_template_stages s2
   where si.implementation_id = v_impl.id
     and s2.template_id = p_template_id
     and s2.stage_key = si.stage_key;

  update implementations
     set journey_template_id = p_template_id,
         template_version    = v_version
   where id = v_impl.id;

  select position into v_cur_pos
    from stage_instances
   where implementation_id = v_impl.id and stage_key = v_impl.current_stage;

  -- An implementation with no stage instance for its current stage has no
  -- stage instances at all, and every insert below joins stage_instances — so
  -- this function creates nothing for it, whatever position we pick. 0032's
  -- comment here ("give it everything rather than nothing") described an
  -- intent the query could not carry out. apply_journey_template above is the
  -- function for that case; say so rather than returning a silent zero.
  if v_cur_pos is null then
    raise exception
      'Implementation % has no stage instances; use apply_journey_template to '
      'give it a plan, not backfill_template_tasks_forward', v_impl.id;
  end if;

  insert into work_items
    (implementation_id, stage_instance_id, template_task_id, task_key, title,
     description, position, role_key, party, visibility, due_basis,
     due_offset_days, duration_days, due_at)
  select v_impl.id, si.id, k.id, k.task_key, k.title, k.description,
         k.position, k.role_key, k.party, k.visibility, k.offset_basis,
         k.offset_days, k.duration_days,
         case k.offset_basis
           when 'stage_entry' then
             case when si.entered_at is null then null
                  else si.entered_at + (k.offset_days || ' days')::interval end
           when 'target_launch' then
             case when v_impl.target_launch_date is null then null
                  else v_impl.target_launch_date::timestamptz
                       + (k.offset_days || ' days')::interval end
           when 'project_start' then
             (select min(x.entered_at) from stage_instances x
               where x.implementation_id = v_impl.id and x.entered_at is not null)
             + (k.offset_days || ' days')::interval
         end
    from journey_template_tasks k
    join journey_template_stages s2 on s2.id = k.template_stage_id
    join stage_instances si
      on si.implementation_id = v_impl.id and si.stage_key = s2.stage_key
   where k.template_id = p_template_id
     and s2.position >= v_cur_pos
  on conflict (implementation_id, task_key) do nothing;

  get diagnostics v_made = row_count;

  update work_items w
     set depends_on = coalesce((
           select array_agg(d.id)
             from journey_template_tasks k2
             join unnest(k2.depends_on_keys) as dep_key on true
             join work_items d
               on d.implementation_id = w.implementation_id
              and d.task_key = dep_key
            where k2.id = w.template_task_id
         ), '{}')
   where w.implementation_id = v_impl.id
     and w.template_task_id is not null;

  return v_made;
end $$;

revoke execute on function backfill_template_tasks_forward(uuid, uuid)
  from public, anon, authenticated;
grant execute on function backfill_template_tasks_forward(uuid, uuid) to service_role;

-- Repair the drift 0032 left behind. Idempotent, and touches only rows whose
-- column actually disagrees with the template they point at.
update implementations i
   set template_version = t.version,
       updated_at = now()
  from journey_templates t
 where t.id = i.journey_template_id
   and i.template_version is distinct from t.version;

-- ---------------------------------------------------------------------------
-- sf_fallback_template: the catch-all the design specified and nothing read
-- ---------------------------------------------------------------------------
-- template-select.ts is explicit that "a catch-all belongs in the
-- `sf_fallback_template` config, not hidden in a template's rules", and 0023
-- duly seeded the key — as '"none"', consumed by no code, while every template
-- shipped with default_for NULL. The result is that selection has never once
-- returned a winner in this deployment.
--
-- The value is a template KEY, not an id: ids differ between environments, and
-- a key follows the family forward, so publishing New Logo v3 moves the
-- fallback with it instead of pinning it to a superseded version.
--
-- Only the untouched seed value is replaced. An operator who has already
-- chosen a fallback keeps their choice.
update portal_app_config
   set value = '"new-logo"'::jsonb, updated_at = now()
 where key = 'sf_fallback_template'
   and value = '"none"'::jsonb;

insert into portal_app_config (key, value)
select 'sf_fallback_template', '"new-logo"'::jsonb
 where not exists (select 1 from portal_app_config where key = 'sf_fallback_template');
