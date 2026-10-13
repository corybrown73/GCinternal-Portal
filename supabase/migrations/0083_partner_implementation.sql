-- 0083: the Partner Implementation journey, and a nullable partner on an
-- implementation.
--
-- 1. journey_templates.journey_type may name a partner implementation. The
--    check is widened, so every existing row still satisfies it.
-- 2. implementations.partner_key says which partner leads the work. Null for
--    every existing record: Field Fusion accounts are read through their
--    intake path (see implementationTypeFor), so nothing is backfilled.
-- 3. The seven-stage partner template, with the stages it carries from
--    Closed Won & Planning on. Pre-Sale & POC stays on the deal. Published
--    through the same path as the Field Fusion template (0058): content is
--    written while it is a draft, then frozen by journey_template_frozen.
--
-- No existing stage, task, template or implementation row is touched.

alter table journey_templates drop constraint if exists journey_templates_journey_type_check;
alter table journey_templates add constraint journey_templates_journey_type_check check (
  journey_type in ('new_logo', 'add_on', 'integration', 'data_migration', 'rollout', 'recovery',
                   'partner_implementation')
);

alter table implementations add column if not exists partner_key text;
alter table implementations drop constraint if exists implementations_partner_key_check;
alter table implementations add constraint implementations_partner_key_check check (
  partner_key is null or partner_key in ('field_fusion_iq')
);

do $$
declare
  v_tid uuid;
  v_s_cwp uuid; v_s_ps uuid; v_s_ff uuid; v_s_pi uuid; v_s_tr uuid; v_s_ro uuid;
begin
  -- Idempotent: a second run finds the template and changes nothing.
  if exists (select 1 from journey_templates where key = 'partner-implementation') then
    return;
  end if;

  insert into journey_templates (key, version, name, journey_type, status, description, version_note)
  values (
    'partner-implementation', 1, 'Partner implementation', 'partner_implementation', 'draft',
    'A partner-led GoCanvas implementation from Closed Won & Planning to Roll Out & Graduation. The partner leads setup and connection; then GoCanvas TIS owns implementation and enablement. Any partner uses this template.',
    'First version: the seven-stage partner journey. Pre-Sale & POC stays on the deal.'
  )
  returning id into v_tid;

  insert into journey_template_stages (template_id, position, stage_key, name, phase, gate_mode, purpose) values
    (v_tid, 1, 'closed_won_planning', 'Closed Won & Planning', 'intake',       'advisory', 'Requirements, stakeholders and the implementation approach are confirmed.'),
    (v_tid, 2, 'partner_setup',       'Partner Setup & Connection', 'delivery', 'blocking', 'The solution is configured, the connection is verified, and the partner lead confirms readiness. This gate is the Implementation Ready handoff.'),
    (v_tid, 3, 'form_finalisation',   'Form Finalisation & Data Readiness', 'delivery', 'advisory', 'Forms are ready and the required datasets are available. TIS confirms.'),
    (v_tid, 4, 'pilot',               'Pilot', 'delivery', 'advisory', 'The customer pilot is completed, feedback is resolved or documented, and the outcome is agreed. TIS confirms.'),
    (v_tid, 5, 'trial_run',           'Trial Run', 'value', 'advisory', 'An actual end-user trial is completed and rollout readiness is confirmed. TIS confirms.'),
    (v_tid, 6, 'roll_out',            'Roll Out & Graduation', 'steady_state', 'blocking', 'Go-live, training, acceptance and the support handoff are confirmed.');

  select id into v_s_cwp from journey_template_stages where template_id = v_tid and stage_key = 'closed_won_planning';
  select id into v_s_ps  from journey_template_stages where template_id = v_tid and stage_key = 'partner_setup';
  select id into v_s_ff  from journey_template_stages where template_id = v_tid and stage_key = 'form_finalisation';
  select id into v_s_pi  from journey_template_stages where template_id = v_tid and stage_key = 'pilot';
  select id into v_s_tr  from journey_template_stages where template_id = v_tid and stage_key = 'trial_run';
  select id into v_s_ro  from journey_template_stages where template_id = v_tid and stage_key = 'roll_out';

  -- Tasks are the gate criteria. Due dates are not set here: offset_basis is
  -- target_launch with no offset, so a task is dated only from a recorded
  -- target launch, never from an invented stage-entry date.
  insert into journey_template_tasks
    (template_id, template_stage_id, position, task_key, title, role_key, party, visibility,
     offset_basis, offset_days, is_gate, is_optional, depends_on_keys)
  values
    (v_tid, v_s_cwp, 1, 'cwp.requirements_confirmed', 'Requirements confirmed',                   'implementation_manager', 'customer', 'shared',   'target_launch', 0, true,  false, '{}'),
    (v_tid, v_s_cwp, 2, 'cwp.stakeholders_confirmed', 'Stakeholders confirmed',                   'implementation_manager', 'customer', 'shared',   'target_launch', 0, true,  false, '{}'),
    (v_tid, v_s_cwp, 3, 'cwp.approach_confirmed',     'Implementation approach confirmed',        'implementation_manager', 'partner',  'internal', 'target_launch', 0, true,  false, '{}'),

    (v_tid, v_s_ps,  1, 'ps.solution_configured',     'Solution configured',                      'implementation_manager', 'partner',  'internal', 'target_launch', 0, true,  false, '{}'),
    (v_tid, v_s_ps,  2, 'ps.connection_verified',     'Connection verified',                      'implementation_manager', 'partner',  'internal', 'target_launch', 0, true,  false, '{}'),
    (v_tid, v_s_ps,  3, 'ps.lead_confirms_ready',     'Partner lead confirms readiness',          'implementation_manager', 'partner',  'internal', 'target_launch', 0, true,  false, '{}'),

    (v_tid, v_s_ff,  1, 'ff.forms_ready',             'Forms ready',                              'implementation_manager', 'internal', 'internal', 'target_launch', 0, true,  false, '{}'),
    (v_tid, v_s_ff,  2, 'ff.datasets_available',      'Required datasets available',              'implementation_manager', 'customer', 'shared',   'target_launch', 0, true,  false, '{}'),
    (v_tid, v_s_ff,  3, 'ff.tis_confirms',            'TIS confirms the stage',                   'implementation_manager', 'internal', 'internal', 'target_launch', 0, true,  false, '{}'),

    (v_tid, v_s_pi,  1, 'pi.customer_pilot_completed', 'Customer pilot completed',                'implementation_manager', 'customer', 'shared',   'target_launch', 0, true,  false, '{}'),
    (v_tid, v_s_pi,  2, 'pi.feedback_resolved',       'Pilot feedback resolved or documented',    'implementation_manager', 'internal', 'internal', 'target_launch', 0, true,  false, '{}'),
    (v_tid, v_s_pi,  3, 'pi.outcome_agreed',          'Pilot outcome agreed',                     'implementation_manager', 'internal', 'internal', 'target_launch', 0, true,  false, '{}'),
    (v_tid, v_s_pi,  4, 'pi.tis_confirms',            'TIS confirms the stage',                   'implementation_manager', 'internal', 'internal', 'target_launch', 0, true,  false, '{}'),

    (v_tid, v_s_tr,  1, 'tr.end_user_trial_completed', 'End-user trial completed',                'implementation_manager', 'customer', 'shared',   'target_launch', 0, true,  false, '{}'),
    (v_tid, v_s_tr,  2, 'tr.rollout_readiness',       'Rollout readiness confirmed',              'implementation_manager', 'internal', 'internal', 'target_launch', 0, true,  false, '{}'),
    (v_tid, v_s_tr,  3, 'tr.tis_confirms',            'TIS confirms the stage',                   'implementation_manager', 'internal', 'internal', 'target_launch', 0, true,  false, '{}'),

    (v_tid, v_s_ro,  1, 'ro.go_live',                 'Go-live completed',                        'implementation_manager', 'internal', 'internal', 'target_launch', 0, true,  false, '{}'),
    (v_tid, v_s_ro,  2, 'ro.training_delivered',      'Training delivered',                       'implementation_manager', 'internal', 'internal', 'target_launch', 0, true,  false, '{}'),
    (v_tid, v_s_ro,  3, 'ro.acceptance_confirmed',    'Acceptance confirmed',                     'implementation_manager', 'customer', 'shared',   'target_launch', 0, true,  false, '{}'),
    (v_tid, v_s_ro,  4, 'ro.support_handoff',         'Support handoff confirmed',                'implementation_manager', 'internal', 'internal', 'target_launch', 0, true,  false, '{}');

  update journey_templates set status = 'published', published_at = now() where id = v_tid;
end $$;
