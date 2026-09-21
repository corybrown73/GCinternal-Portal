-- 0058: the Field Fusion training journey, as a published journey template.
--
-- Same eight stage keys as the new-logo journey, so the stage sync, the
-- presale mirror and the rail all keep working; the names and the tasks are
-- about a crew being trained on a product that is already set up. Task keys
-- are shared with the new-logo template where the meaning is the same, so
-- what the deal already settled (notes on file, the champion named, the
-- first call booked) is ticked on the project the same way.
--
-- Seeded only where no template carries the key: a re-run never reinstates
-- a template an operator archived.
do $$
declare
  v_tid uuid;
  v_handoff uuid; v_plan uuid; v_align uuid; v_build uuid; v_validate uuid; v_launch uuid; v_adopt uuid; v_grad uuid;
begin
  if exists (select 1 from journey_templates where key = 'field-fusion') then
    return;
  end if;

  -- Drafted first: a published template's content is frozen by trigger, so
  -- the stages and tasks go in before the status flips.
  insert into journey_templates (key, version, name, journey_type, status, description, version_note)
  values (
    'field-fusion', 1, 'Field Fusion training', 'new_logo', 'draft',
    'A Field Fusion account: the product is set up and confirmed before the handoff, so implementation trains the crew rather than building a form. Training call, second session, real jobs, live.',
    'First version: the training journey.'
  )
  returning id into v_tid;

  insert into journey_template_stages (template_id, position, stage_key, name, phase, gate_mode, purpose) values
    (v_tid, 1, 'handoff',           'Pre-training',     'intake',       'blocking', 'Field Fusion confirmed working and the account handed to implementation with the use case, goals and setup notes.'),
    (v_tid, 2, 'plan-internal',     'Training call',    'delivery',     'advisory', 'The first call: the crew walked through a real job on the app, together. Not a kickoff.'),
    (v_tid, 3, 'align-external',    'Align externally', 'delivery',     'advisory', 'Who runs it day to day, who signs off, what live looks like.'),
    (v_tid, 4, 'build',             'Second session',   'delivery',     'advisory', 'Hands on the phones: a job start to finish, the office watching it arrive.'),
    (v_tid, 5, 'validate-iterate',  'Real jobs',        'delivery',     'advisory', 'The crew runs real jobs on their own; what slows them down is what gets covered.'),
    (v_tid, 6, 'launch',            'Live',             'delivery',     'blocking', 'Everyone trained runs it on every job.'),
    (v_tid, 7, 'adopt',             'Adopt',            'value',        'advisory', 'Usage at the agreed bar, with the goals from the calls evidenced.'),
    (v_tid, 8, 'graduate-to-cs',    'Complete',         'steady_state', 'blocking', 'Ready to hand over confirmed and accepted by Customer Success.');

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
    -- Pre-training
    (v_tid, v_handoff, 1, 'nl.packet_review',     'Read the handoff: use case, goals and the setup notes', 'What the calls said and what the setup found. Enough to run a training call from.', 'implementation_manager', 'internal', 'internal', 0, true,  false, '{}'),
    (v_tid, v_handoff, 2, 'ff.setup_confirmed',   'Field Fusion confirmed working',                        'Ticked on the deal before the handoff. Read-only here.', 'implementation_manager', 'internal', 'internal', 0, true,  false, '{}'),
    (v_tid, v_handoff, 3, 'nl.name_champion',     'Confirm the champion and who runs it day to day',       'Who to train first, and who can say yes.', 'sales_owner', 'internal', 'shared', 1, false, false, '{}'),
    (v_tid, v_handoff, 4, 'nl.kickoff_scheduled', 'Schedule the training call',                            'Sixty minutes, on their phones, with their jobs. Not a kickoff.', 'implementation_manager', 'internal', 'shared', 1, true,  false, '{nl.name_champion}'),
    -- Training call
    (v_tid, v_plan, 1, 'nl.account_provisioned', 'Confirm logins for everyone who needs one',              'From the list the customer sends after the call.', 'implementation_manager', 'internal', 'internal', 0, true,  false, '{}'),
    (v_tid, v_plan, 2, 'nl.kickoff_call',        'Run the training call',                                  'A real job on the app, together. The crew leaves with three homework items.', 'implementation_manager', 'internal', 'shared', 0, true,  false, '{}'),
    (v_tid, v_plan, 3, 'nl.crew_list',           'Provide the crew and user list',                         'Names and emails for everyone who will use it, and the one person who runs the first real job.', 'customer_data_owner', 'customer', 'shared', 1, false, false, '{nl.kickoff_call}'),
    -- Align externally (hidden by default; kept so the keys line up)
    (v_tid, v_align, 1, 'nl.plan_agreed',     'Agree the training week and the live day',                  'The customer agrees who does what, and when the crew counts as live.', 'customer_champion', 'customer', 'shared', 1, true, false, '{}'),
    (v_tid, v_align, 2, 'nl.launch_date_set', 'Agree the live date',                                       '', 'implementation_manager', 'internal', 'shared', 1, true, false, '{nl.plan_agreed}'),
    -- Second session
    (v_tid, v_build, 1, 'ff.second_session',  'Run the second session',                                    'Thirty minutes, hands on the phones. A job start to finish; the office watches it arrive.', 'implementation_manager', 'internal', 'shared', 0, true,  false, '{}'),
    (v_tid, v_build, 2, 'ff.first_real_job',  'First real job run by a field user',                        'Not by an admin. By the person named on the call.', 'customer_champion', 'customer', 'shared', 1, true,  false, '{ff.second_session}'),
    -- Real jobs
    (v_tid, v_validate, 1, 'nl.customer_uat', 'Run it on real jobs for two days',                          'Without us on the call. Write down anything that slows anyone down.', 'customer_champion', 'customer', 'shared', 0, true,  false, '{}'),
    (v_tid, v_validate, 2, 'nl.gaps_closed',  'Questions and tune-up',                                     'What the real jobs raised: a setting, a shortcut, rarely more.', 'implementation_manager', 'internal', 'shared', 2, true,  false, '{nl.customer_uat}'),
    -- Live
    (v_tid, v_launch, 1, 'nl.devices_ready',    'Everyone trained has the app on a phone that works',      '', 'customer_data_owner', 'customer', 'shared', 0, false, false, '{}'),
    (v_tid, v_launch, 2, 'nl.go_live',          'Crew live — every job on the app',                        '', 'implementation_manager', 'internal', 'shared', 0, true,  false, '{nl.devices_ready}'),
    (v_tid, v_launch, 3, 'nl.first_submission', 'First week of submissions from the field',                'From the people doing the jobs, not from an admin.', 'customer_champion', 'customer', 'shared', 1, true,  false, '{nl.go_live}'),
    -- Adopt
    (v_tid, v_adopt, 1, 'nl.week1_check',      'Week one usage check',                                     'Who is submitting, who is not, and why not.', 'implementation_manager', 'internal', 'internal', 7,  true, false, '{}'),
    (v_tid, v_adopt, 2, 'nl.blockers_cleared', 'Clear anything blocking daily use',                        '', 'implementation_manager', 'internal', 'shared', 14, true, false, '{nl.week1_check}'),
    (v_tid, v_adopt, 3, 'nl.adoption_review',  'Review adoption against the goals from the calls',         'Met, or not, with the numbers.', 'implementation_manager', 'internal', 'shared', 21, true, false, '{nl.blockers_cleared}'),
    -- Complete
    (v_tid, v_grad, 1, 'nl.cs_intro',     'Introduce the CS owner to the customer', '', 'cs_owner', 'internal', 'shared', 0, true, false, '{}'),
    (v_tid, v_grad, 2, 'nl.handover_doc', 'Record the handover to CS',              'What was promised, what is outstanding, what to watch.', 'implementation_manager', 'internal', 'internal', 2, true, false, '{nl.cs_intro}'),
    (v_tid, v_grad, 3, 'nl.cs_accepted',  'CS accepts the account',                 '', 'cs_owner', 'internal', 'internal', 5, true, false, '{nl.handover_doc}');

  update journey_templates set status = 'published', published_at = now() where id = v_tid;
end $$;
