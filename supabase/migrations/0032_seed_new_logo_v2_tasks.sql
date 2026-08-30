-- 0032 — New Logo gets a task list.
--
-- THE BUG THIS FIXES, AND IT IS NOT A CODE BUG.
--
-- `journey_template_tasks` for New Logo v1: zero rows. The other three seeded
-- templates have 4 or 5 tasks each; the flagship one has none. Every live
-- implementation runs New Logo, so `instantiate_journey` faithfully produced 8
-- stage instances and 0 work items, and the Plan panel rendered eight empty
-- stages on every real account.
--
-- 0015 is not at fault. It says it seeded New Logo "from lifecycle.ts verbatim"
-- and it did exactly that. `lifecycle.ts` describes stages: id, label, intent,
-- phase, leads, supports, boundary. It has never contained a task list. There
-- was nothing to migrate, so nothing was migrated, and because the
-- `work_items` flag stayed off until 2026-08-30 nobody opened the panel to
-- notice.
--
-- The cost of that gap is the whole product. The user ran three real
-- onboardings over three weeks (Acme 2026-07-30 through 2026-08-20, BlueRiver
-- and Corewell behind it) and reported the process as "a little confusing".
-- They were working from memory because the plan was empty.
--
-- WHY A NEW VERSION RATHER THAN A FIX TO v1. Published template content is
-- frozen by trigger (0013, `journey_template_frozen`) and that is correct: a
-- live implementation pins its template by FK, and editing published content
-- under a running project would silently change what people already agreed to.
-- So this is v2, published through `publish_template`, which supersedes v1.
--
-- WHY THE BACKFILL IS FORWARD-ONLY. The three live implementations are mid
-- flight. Instantiating all 31 tasks on Acme, which is at `build`, would
-- manufacture overdue work in three stages it already finished. Auto-completing
-- them instead would record tasks as done that nobody did, in a system whose
-- entire point is an honest trail. So each implementation receives tasks for
-- the stage it is in and every stage ahead, and nothing behind. Their history
-- stays exactly as it was recorded.
--
-- Rollback: supabase/down/0032_down.sql

do $$
declare
  v1_id  uuid;
  v2_id  uuid;
  org    uuid := '00000000-0000-4000-8000-000000000001';
begin
  select id into v1_id
    from journey_templates
   where org_id = org and key = 'new-logo' and version = 1;

  if v1_id is null then
    raise notice '0032: no New Logo v1 found; nothing to supersede, skipping';
    return;
  end if;

  if exists (select 1 from journey_templates
              where org_id = org and key = 'new-logo' and version = 2) then
    raise notice '0032: New Logo v2 already exists, skipping';
    return;
  end if;

  -- ---------------------------------------------------------------------
  -- 1. The draft
  -- ---------------------------------------------------------------------
  insert into journey_templates
    (org_id, key, version, name, journey_type, status, description, version_note)
  values
    (org, 'new-logo', 2, 'New Logo', 'new_logo', 'draft',
     'The standard onboarding for a new GoCanvas customer, from sales handoff '
     'through to Customer Success.',
     'v2 adds the task list. v1 shipped with eight stages and no tasks, so the '
     'plan rendered empty on every account that used it.')
  returning id into v2_id;

  -- ---------------------------------------------------------------------
  -- 2. The stages, copied from v1 verbatim
  -- ---------------------------------------------------------------------
  -- Copied rather than retyped so v2 cannot drift from the stage vocabulary
  -- the app and the stage history already use. The Launch gate keeps whatever
  -- gate_mode v1 gave it (decision 1 in docs/PLAN.md grandfathered it as
  -- blocking); copying is what preserves that without restating it.
  insert into journey_template_stages
    (org_id, template_id, position, stage_key, name, phase, purpose,
     target_duration_days, entry_criteria, exit_criteria, gate_mode,
     required_artifacts)
  select org, v2_id, position, stage_key, name, phase, purpose,
         target_duration_days, entry_criteria, exit_criteria, gate_mode,
         required_artifacts
    from journey_template_stages
   where template_id = v1_id;

  -- ---------------------------------------------------------------------
  -- 3. The tasks
  -- ---------------------------------------------------------------------
  -- Drafted from the stage intents in lifecycle.ts and the task shape the
  -- Integration template already uses. The day offsets are estimates and are
  -- expected to be corrected in the template builder; they are here so the
  -- plan has dates to be wrong about rather than no dates at all.
  --
  -- `visibility = 'shared'` is what puts a task on the customer's plan link.
  -- Seven of these are the customer's own work, which is the point: a plan
  -- that only lists our tasks is a status report, not a plan.
  insert into journey_template_tasks
    (org_id, template_id, template_stage_id, position, task_key, title,
     description, role_key, party, visibility, offset_basis, offset_days,
     duration_days, is_optional, depends_on_keys)
  select org, v2_id, s.id, t.position, t.task_key, t.title, t.description,
         t.role_key, t.party, t.visibility, t.offset_basis, t.offset_days,
         t.duration_days, t.is_optional, t.depends_on_keys
    from (values
      -- stage_key, pos, task_key, title, description, role, party, visibility,
      -- basis, offset, duration, optional, depends_on
      ('handoff', 1, 'nl.packet_review', 'Review the handoff packet from sales',
       'Read what sales recorded and decide whether it is enough to start.',
       'implementation_manager', 'internal', 'internal', 'stage_entry', 0, 1, false, '{}'::text[]),
      ('handoff', 2, 'nl.sow_confirm', 'Confirm scope against the signed SOW',
       'What was sold, what is in scope, and what is explicitly not.',
       'solutions_engineer', 'internal', 'internal', 'stage_entry', 1, 1, false, '{nl.packet_review}'::text[]),
      ('handoff', 3, 'nl.name_champion', 'Confirm the champion and the decision maker',
       'Who runs this day to day, and who can say yes.',
       'sales_owner', 'internal', 'shared', 'stage_entry', 1, 1, false, '{}'::text[]),
      ('handoff', 4, 'nl.kickoff_scheduled', 'Schedule the kickoff call',
       null, 'implementation_manager', 'internal', 'shared', 'stage_entry', 2, 1, false, '{nl.name_champion}'::text[]),

      ('plan-internal', 1, 'nl.account_provisioned', 'Provision the account and admin users',
       null, 'implementation_manager', 'internal', 'internal', 'stage_entry', 0, 1, false, '{}'::text[]),
      ('plan-internal', 2, 'nl.form_inventory', 'Inventory the forms and processes to migrate',
       'The paper or spreadsheet processes this is replacing.',
       'solutions_engineer', 'internal', 'shared', 'stage_entry', 2, 3, false, '{}'::text[]),
      ('plan-internal', 3, 'nl.success_criteria', 'Write the success criteria with measurable targets',
       'What has to be true in 90 days for this to have worked.',
       'implementation_manager', 'internal', 'internal', 'stage_entry', 3, 2, false, '{nl.form_inventory}'::text[]),
      ('plan-internal', 4, 'nl.internal_plan_review', 'Internal plan review before the customer sees it',
       null, 'implementation_manager', 'internal', 'internal', 'stage_entry', 5, 1, false, '{nl.success_criteria}'::text[]),

      ('align-external', 1, 'nl.kickoff_call', 'Run the kickoff call',
       null, 'implementation_manager', 'internal', 'shared', 'stage_entry', 0, 1, false, '{}'::text[]),
      ('align-external', 2, 'nl.plan_agreed', 'Sign off the plan and the dates',
       'The customer agrees what happens when, and who owns each part.',
       'customer_champion', 'customer', 'shared', 'stage_entry', 3, 2, false, '{nl.kickoff_call}'::text[]),
      ('align-external', 3, 'nl.crew_list', 'Provide the crew and user list',
       'Names, roles and mobile numbers for everyone who will use it.',
       'customer_data_owner', 'customer', 'shared', 'stage_entry', 3, 3, false, '{nl.kickoff_call}'::text[]),
      ('align-external', 4, 'nl.launch_date_set', 'Agree the target launch date',
       null, 'implementation_manager', 'internal', 'shared', 'stage_entry', 5, 1, false, '{nl.plan_agreed}'::text[]),

      ('build', 1, 'nl.first_form_built', 'Build the first form',
       'One real form, end to end, to prove the shape before building the rest.',
       'solutions_engineer', 'internal', 'shared', 'stage_entry', 0, 3, false, '{nl.crew_list}'::text[]),
      ('build', 2, 'nl.form_review', 'Review the first form',
       'Does this match how the work actually happens in the field?',
       'customer_champion', 'customer', 'shared', 'stage_entry', 5, 2, false, '{nl.first_form_built}'::text[]),
      ('build', 3, 'nl.remaining_forms', 'Build the remaining forms',
       null, 'solutions_engineer', 'internal', 'shared', 'stage_entry', 7, 5, false, '{nl.form_review}'::text[]),
      ('build', 4, 'nl.dispatch_setup', 'Configure dispatch and reference data',
       null, 'solutions_engineer', 'internal', 'internal', 'stage_entry', 7, 3, false, '{}'::text[]),
      ('build', 5, 'nl.integration_scoped', 'Scope the integration',
       'Only when the deal includes one. Skip otherwise.',
       'solutions_engineer', 'internal', 'internal', 'stage_entry', 7, 3, true, '{}'::text[]),

      ('validate-iterate', 1, 'nl.uat_pack', 'Send the test pack',
       'What to test, who tests it, and what counts as passing.',
       'implementation_manager', 'internal', 'shared', 'stage_entry', 0, 1, false, '{}'::text[]),
      ('validate-iterate', 2, 'nl.customer_uat', 'Test against your real process',
       'Run a real job through it, not a demo one.',
       'customer_champion', 'customer', 'shared', 'stage_entry', 2, 5, false, '{nl.uat_pack}'::text[]),
      ('validate-iterate', 3, 'nl.gaps_closed', 'Close the gaps found in testing',
       null, 'solutions_engineer', 'internal', 'shared', 'stage_entry', 7, 5, false, '{nl.customer_uat}'::text[]),
      ('validate-iterate', 4, 'nl.signoff_uat', 'Sign off testing',
       null, 'customer_champion', 'customer', 'shared', 'stage_entry', 10, 1, false, '{nl.gaps_closed}'::text[]),

      ('launch', 1, 'nl.devices_ready', 'Confirm devices and app installs',
       'Every crew member has the app on a device that works.',
       'customer_data_owner', 'customer', 'shared', 'target_launch', -3, 3, false, '{}'::text[]),
      ('launch', 2, 'nl.crew_training', 'Train the crews',
       null, 'implementation_manager', 'internal', 'shared', 'stage_entry', 0, 3, false, '{}'::text[]),
      ('launch', 3, 'nl.go_live', 'Go live',
       null, 'implementation_manager', 'internal', 'shared', 'target_launch', 0, 1, false, '{nl.crew_training,nl.devices_ready}'::text[]),
      ('launch', 4, 'nl.first_submission', 'First real submission from a field user',
       'Not from an admin. From someone doing the job.',
       'customer_champion', 'customer', 'shared', 'target_launch', 1, 2, false, '{nl.go_live}'::text[]),

      ('adopt', 1, 'nl.week1_check', 'Week one usage check',
       'Who is submitting, who is not, and why not.',
       'implementation_manager', 'internal', 'internal', 'stage_entry', 7, 1, false, '{}'::text[]),
      ('adopt', 2, 'nl.blockers_cleared', 'Clear anything blocking daily use',
       null, 'solutions_engineer', 'internal', 'shared', 'stage_entry', 14, 5, false, '{nl.week1_check}'::text[]),
      ('adopt', 3, 'nl.adoption_review', 'Review adoption against the success criteria',
       'The targets written in Plan. Met, or not, with the numbers.',
       'implementation_manager', 'internal', 'shared', 'stage_entry', 21, 2, false, '{nl.blockers_cleared}'::text[]),

      ('graduate-to-cs', 1, 'nl.cs_intro', 'Introduce the CS owner to the customer',
       null, 'cs_owner', 'internal', 'shared', 'stage_entry', 0, 1, false, '{}'::text[]),
      ('graduate-to-cs', 2, 'nl.handover_doc', 'Record the handover to CS',
       'What was promised, what is outstanding, what to watch.',
       'implementation_manager', 'internal', 'internal', 'stage_entry', 2, 2, false, '{nl.cs_intro}'::text[]),
      ('graduate-to-cs', 3, 'nl.cs_accepted', 'CS accepts the account',
       null, 'cs_owner', 'internal', 'internal', 'stage_entry', 5, 1, false, '{nl.handover_doc}'::text[])
    ) as t (stage_key, position, task_key, title, description, role_key, party,
            visibility, offset_basis, offset_days, duration_days, is_optional,
            depends_on_keys)
    join journey_template_stages s
      on s.template_id = v2_id and s.stage_key = t.stage_key;

  -- ---------------------------------------------------------------------
  -- 4. Publish, which supersedes v1
  -- ---------------------------------------------------------------------
  perform publish_template(v2_id, 'Adds the task list New Logo shipped without.', null);

  raise notice '0032: New Logo v2 published with % tasks',
    (select count(*) from journey_template_tasks where template_id = v2_id);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Forward-only backfill for implementations already running v1
-- ---------------------------------------------------------------------------
-- Each live implementation is re-pointed at v2 and receives tasks for the stage
-- it is IN and every stage AHEAD. Nothing is created for a stage it has left.
--
-- The alternative was instantiating everything and auto-completing the past.
-- That records work as done that nobody did. In a system whose whole argument
-- is an honest trail, a manufactured completion is worse than an absent task:
-- the absent task is visibly absent, the manufactured one is invisibly false.
--
-- WHY THIS IS A FUNCTION AND NOT INLINE. Inline, it would run once against
-- whatever production happened to contain and could never be tested: the CI
-- database has no implementations, so an inline loop executes zero times and
-- proves nothing. As a function the same code is exercised by
-- supabase/tests/0032_new_logo_backfill.sql against seeded fixtures, and it
-- stays available for the next time a template version needs rolling forward.
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
begin
  select i.id, i.current_stage, i.target_launch_date into v_impl
    from implementations i where i.id = p_implementation_id;
  if not found then
    raise exception 'backfill_template_tasks_forward: no implementation %',
      p_implementation_id;
  end if;

  -- Re-point the stage instances at the new template's stage rows. Matching on
  -- stage_key, which is the stable identity across versions.
  update stage_instances si
     set template_stage_id = s2.id
    from journey_template_stages s2
   where si.implementation_id = v_impl.id
     and s2.template_id = p_template_id
     and s2.stage_key = si.stage_key;

  update implementations set journey_template_id = p_template_id
   where id = v_impl.id;

  select position into v_cur_pos
    from stage_instances
   where implementation_id = v_impl.id and stage_key = v_impl.current_stage;

  -- No stage instance for the current stage means this implementation was
  -- never instantiated at all. Give it everything rather than nothing.
  if v_cur_pos is null then v_cur_pos := 0; end if;

  insert into work_items
    (implementation_id, stage_instance_id, template_task_id, task_key, title,
     description, position, role_key, party, visibility, due_basis,
     due_offset_days, duration_days, due_at)
  select v_impl.id, si.id, k.id, k.task_key, k.title, k.description,
         k.position, k.role_key, k.party, k.visibility, k.offset_basis,
         k.offset_days, k.duration_days,
         -- Dates are computed from the inputs and stored beside them, so a due
         -- date can always show its reasoning. NULL where the basis has nothing
         -- to anchor to yet: a stage not entered, or no launch date agreed. A
         -- guessed date would be worse than a blank one.
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
  -- Replay-safe: work_items_task_key_unique (implementation_id, task_key).
  on conflict (implementation_id, task_key) do nothing;

  get diagnostics v_made = row_count;

  -- Dependencies, resolved after the rows exist. A dependency naming a task
  -- that was NOT created (it belongs to a stage already passed) is dropped
  -- rather than left dangling: the work it named is behind us.
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

do $$
declare
  v2_id uuid;
  impl  record;
  made  int;
begin
  select id into v2_id from journey_templates
   where org_id = '00000000-0000-4000-8000-000000000001'
     and key = 'new-logo' and version = 2 and status = 'published';
  if v2_id is null then
    raise notice '0032: no published New Logo v2; skipping backfill';
    return;
  end if;

  for impl in
    select i.id
      from implementations i
      join journey_templates t on t.id = i.journey_template_id
     where t.key = 'new-logo' and t.version = 1
  loop
    made := backfill_template_tasks_forward(impl.id, v2_id);
    raise notice '0032: % — % task(s) created', impl.id, made;
  end loop;
end $$;
