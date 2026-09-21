-- 0059: Field Fusion training journey, version 2.
--
-- The training plan is three thirty-minute calls over two weeks, not two
-- sessions in a week. A published template's content is frozen, so this is
-- a new version: drafted, filled, published, and v1 marked superseded so the
-- plan picker stops offering it. Same stage keys as before.
do $$
declare
  v_old uuid; v_tid uuid;
  v_handoff uuid; v_plan uuid; v_align uuid; v_build uuid; v_validate uuid; v_launch uuid; v_adopt uuid; v_grad uuid;
begin
  select id into v_old from journey_templates where key = 'field-fusion' and version = 1;
  if v_old is null or exists (select 1 from journey_templates where key = 'field-fusion' and version = 2) then
    return;
  end if;

  insert into journey_templates (key, version, name, journey_type, status, description, version_note, supersedes_id)
  values (
    'field-fusion', 2, 'Field Fusion training', 'new_logo', 'draft',
    'A Field Fusion account: the forms are already built and the product is confirmed working before the handoff, so implementation runs GoCanvas training — three thirty-minute calls over two weeks, real jobs in between.',
    'Three thirty-minute calls over two weeks.', v_old
  )
  returning id into v_tid;

  insert into journey_template_stages (template_id, position, stage_key, name, phase, gate_mode, purpose) values
    (v_tid, 1, 'handoff',           'Pre-training',        'intake',       'blocking', 'Field Fusion confirmed working and the account handed to implementation with the use case, goals and setup notes.'),
    (v_tid, 2, 'plan-internal',     'Training call 1',     'delivery',     'advisory', 'The basics on a real job: open it, fill it in, submit it, watch it arrive. Thirty minutes. Not a kickoff.'),
    (v_tid, 3, 'align-external',    'Align externally',    'delivery',     'advisory', 'Who runs it day to day, who signs off, what live looks like.'),
    (v_tid, 4, 'build',             'Training call 2',     'delivery',     'advisory', 'The first real submissions in front of us; what slowed anyone down; the next things to learn. Thirty minutes.'),
    (v_tid, 5, 'validate-iterate',  'A week of real jobs', 'delivery',     'advisory', 'The crew runs it on real jobs on their own; what slows them down is what the last call covers.'),
    (v_tid, 6, 'launch',            'Training call 3 · live', 'delivery',  'blocking', 'The office side, the questions from the week, who trains the next hire. Everyone trained runs it on every job.'),
    (v_tid, 7, 'adopt',             'Adopt',               'value',        'advisory', 'Usage at the agreed bar, with the goals from the calls evidenced.'),
    (v_tid, 8, 'graduate-to-cs',    'Complete',            'steady_state', 'blocking', 'Ready to hand over confirmed and accepted by Customer Success.');

  select id into v_handoff  from journey_template_stages where template_id = v_tid and stage_key = 'handoff';
  select id into v_plan     from journey_template_stages where template_id = v_tid and stage_key = 'plan-internal';
  select id into v_align    from journey_template_stages where template_id = v_tid and stage_key = 'align-external';
  select id into v_build    from journey_template_stages where template_id = v_tid and stage_key = 'build';
  select id into v_validate from journey_template_stages where template_id = v_tid and stage_key = 'validate-iterate';
  select id into v_launch   from journey_template_stages where template_id = v_tid and stage_key = 'launch';
  select id into v_adopt    from journey_template_stages where template_id = v_tid and stage_key = 'adopt';
  select id into v_grad     from journey_template_stages where template_id = v_tid and stage_key = 'graduate-to-cs';

  insert into journey_template_tasks
    (template_id, template_stage_id, position, task_key, title, description, role_key, party, visibility, offset_days, is_gate, is_optional, depends_on_keys)
  values
    (v_tid, v_handoff, 1, 'nl.packet_review',     'Read the handoff: use case, goals and the setup notes', 'What the calls said and what the setup found. Enough to run the first training call from.', 'implementation_manager', 'internal', 'internal', 0, true,  false, '{}'),
    (v_tid, v_handoff, 2, 'ff.setup_confirmed',   'Field Fusion confirmed working, forms in place',        'Ticked on the deal before the handoff. Read-only here.', 'implementation_manager', 'internal', 'internal', 0, true,  false, '{}'),
    (v_tid, v_handoff, 3, 'nl.name_champion',     'Confirm the champion and who runs it day to day',       'Who to train first, and who can say yes.', 'sales_owner', 'internal', 'shared', 1, false, false, '{}'),
    (v_tid, v_handoff, 4, 'nl.kickoff_scheduled', 'Schedule training call 1',                              'Thirty minutes, on their phones, with their forms. Not a kickoff.', 'implementation_manager', 'internal', 'shared', 1, true,  false, '{nl.name_champion}'),
    (v_tid, v_plan, 1, 'nl.kickoff_call',        'Run training call 1 — the basics',                       'Open a job, fill it in, submit it, watch it arrive. The crew leaves with three homework items.', 'implementation_manager', 'internal', 'shared', 0, true,  false, '{}'),
    (v_tid, v_plan, 2, 'nl.crew_list',           'Provide the crew and user list',                         'Names and emails for everyone who will use it, and the one person who runs the first real jobs.', 'customer_data_owner', 'customer', 'shared', 1, false, false, '{nl.kickoff_call}'),
    (v_tid, v_plan, 3, 'nl.account_provisioned', 'Confirm logins for everyone who needs one',              'From the list the customer sends after the call.', 'implementation_manager', 'internal', 'internal', 2, true,  false, '{nl.crew_list}'),
    (v_tid, v_plan, 4, 'ff.first_real_jobs',     'Two or three real jobs before call 2',                   'Run by the person named on the call, not by an admin.', 'customer_champion', 'customer', 'shared', 3, true,  false, '{nl.kickoff_call}'),
    (v_tid, v_align, 1, 'nl.plan_agreed',     'Agree the two weeks and the live day',                     'The customer agrees who does what, and when the crew counts as live.', 'customer_champion', 'customer', 'shared', 1, true, false, '{}'),
    (v_tid, v_align, 2, 'nl.launch_date_set', 'Agree the live date',                                       '', 'implementation_manager', 'internal', 'shared', 1, true, false, '{nl.plan_agreed}'),
    (v_tid, v_build, 1, 'ff.second_call',     'Run training call 2 — real jobs, questions answered',       'The first real submissions in front of us; what slowed anyone down; photos, dispatch, whatever the forms use.', 'implementation_manager', 'internal', 'shared', 0, true,  false, '{}'),
    (v_tid, v_validate, 1, 'nl.customer_uat', 'A week of real jobs, on your own',                         'Everyone trained runs it on their jobs. Write down what slows anyone down.', 'customer_champion', 'customer', 'shared', 0, true,  false, '{}'),
    (v_tid, v_launch, 1, 'ff.third_call',       'Run training call 3 — the office side, and what''s next', 'Reports and exports, the questions from the week, and who trains the next hire.', 'implementation_manager', 'internal', 'shared', 0, true,  false, '{}'),
    (v_tid, v_launch, 2, 'nl.devices_ready',    'Everyone trained has the app on a phone that works',      '', 'customer_data_owner', 'customer', 'shared', 0, false, false, '{}'),
    (v_tid, v_launch, 3, 'nl.go_live',          'Crew live — every job on the app',                        '', 'implementation_manager', 'internal', 'shared', 0, true,  false, '{ff.third_call,nl.devices_ready}'),
    (v_tid, v_launch, 4, 'nl.first_submission', 'First week of submissions from the field',                'From the people doing the jobs, not from an admin.', 'customer_champion', 'customer', 'shared', 1, true,  false, '{nl.go_live}'),
    (v_tid, v_adopt, 1, 'nl.week1_check',      'Week one usage check',                                     'Who is submitting, who is not, and why not.', 'implementation_manager', 'internal', 'internal', 7,  true, false, '{}'),
    (v_tid, v_adopt, 2, 'nl.blockers_cleared', 'Clear anything blocking daily use',                        '', 'implementation_manager', 'internal', 'shared', 14, true, false, '{nl.week1_check}'),
    (v_tid, v_adopt, 3, 'nl.adoption_review',  'Review adoption against the goals from the calls',         'Met, or not, with the numbers.', 'implementation_manager', 'internal', 'shared', 21, true, false, '{nl.blockers_cleared}'),
    (v_tid, v_grad, 1, 'nl.cs_intro',     'Introduce the CS owner to the customer', '', 'cs_owner', 'internal', 'shared', 0, true, false, '{}'),
    (v_tid, v_grad, 2, 'nl.handover_doc', 'Record the handover to CS',              'What was promised, what is outstanding, what to watch.', 'implementation_manager', 'internal', 'internal', 2, true, false, '{nl.cs_intro}'),
    (v_tid, v_grad, 3, 'nl.cs_accepted',  'CS accepts the account',                 '', 'cs_owner', 'internal', 'internal', 5, true, false, '{nl.handover_doc}');

  -- One live template per key (journey_templates_current_idx): v1 steps
  -- aside before v2 goes live.
  update journey_templates set superseded_by_id = v_tid where id = v_old;
  update journey_templates set status = 'published', published_at = now() where id = v_tid;
end $$;
