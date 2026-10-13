-- 0083: the Partner Implementation journey, its storage, and a transactional
-- way to start one.
--
-- 1. journey_templates.journey_type may name a partner implementation. The
--    check is widened, so every existing row still satisfies it.
-- 2. implementations.partner_key names the partner leading the work. It is a
--    format check, not a list: a new partner is a code registration (see
--    PARTNERS in lib/partner-implementation.ts), never a migration. Null for
--    every existing record; Field Fusion accounts are read through their
--    intake path, so nothing is backfilled.
-- 3. Task offsets and work-item due bases gain 'unscheduled'. A partner's
--    tasks carry it, so apply_journey_template leaves their due dates null:
--    no task is dated from the launch date or any other basis.
-- 4. The seven-stage partner template (stages 2–7). Published through the same
--    path as the Field Fusion template (0058): drafted, then frozen.
-- 5. create_partner_implementation: creates the customer when the deal has
--    none, then the implementation, its first history row, and the template's
--    stages and tasks, in ONE transaction. If anything fails, everything rolls
--    back, the customer included. No partial record can be left behind.
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
  partner_key is null or partner_key ~ '^[a-z][a-z0-9_]{1,62}$'
);

-- 'unscheduled' is a basis that dates nothing. apply_journey_template's due
-- expression has no branch for it, so its due date is null.
alter table journey_template_tasks drop constraint if exists journey_template_tasks_offset_basis_check;
alter table journey_template_tasks add constraint journey_template_tasks_offset_basis_check check (
  offset_basis in ('project_start', 'stage_entry', 'target_launch', 'unscheduled')
);
alter table work_items drop constraint if exists work_items_due_basis_check;
alter table work_items add constraint work_items_due_basis_check check (
  due_basis in ('project_start', 'stage_entry', 'target_launch', 'unscheduled')
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

  -- Tasks are the gate criteria. None is dated by the template: each carries
  -- the 'unscheduled' basis. A person sets a date, or a scheduling rule is
  -- agreed and recorded for that task; until then the due date stays blank.
  insert into journey_template_tasks
    (template_id, template_stage_id, position, task_key, title, role_key, party, visibility,
     offset_basis, offset_days, is_gate, is_optional, depends_on_keys)
  values
    (v_tid, v_s_cwp, 1, 'cwp.requirements_confirmed', 'Requirements confirmed',                   'implementation_manager', 'customer', 'shared',   'unscheduled', 0, true,  false, '{}'),
    (v_tid, v_s_cwp, 2, 'cwp.stakeholders_confirmed', 'Stakeholders confirmed',                   'implementation_manager', 'customer', 'shared',   'unscheduled', 0, true,  false, '{}'),
    (v_tid, v_s_cwp, 3, 'cwp.approach_confirmed',     'Implementation approach confirmed',        'implementation_manager', 'partner',  'internal', 'unscheduled', 0, true,  false, '{}'),

    (v_tid, v_s_ps,  1, 'ps.solution_configured',     'Solution configured',                      'implementation_manager', 'partner',  'internal', 'unscheduled', 0, true,  false, '{}'),
    (v_tid, v_s_ps,  2, 'ps.connection_verified',     'Connection verified',                      'implementation_manager', 'partner',  'internal', 'unscheduled', 0, true,  false, '{}'),
    (v_tid, v_s_ps,  3, 'ps.lead_confirms_ready',     'Partner lead confirms readiness',          'implementation_manager', 'partner',  'internal', 'unscheduled', 0, true,  false, '{}'),

    (v_tid, v_s_ff,  1, 'ff.forms_ready',             'Forms ready',                              'implementation_manager', 'internal', 'internal', 'unscheduled', 0, true,  false, '{}'),
    (v_tid, v_s_ff,  2, 'ff.datasets_available',      'Required datasets available',              'implementation_manager', 'customer', 'shared',   'unscheduled', 0, true,  false, '{}'),
    (v_tid, v_s_ff,  3, 'ff.tis_confirms',            'TIS confirms the stage',                   'implementation_manager', 'internal', 'internal', 'unscheduled', 0, true,  false, '{}'),

    (v_tid, v_s_pi,  1, 'pi.customer_pilot_completed', 'Customer pilot completed',                'implementation_manager', 'customer', 'shared',   'unscheduled', 0, true,  false, '{}'),
    (v_tid, v_s_pi,  2, 'pi.feedback_resolved',       'Pilot feedback resolved or documented',    'implementation_manager', 'internal', 'internal', 'unscheduled', 0, true,  false, '{}'),
    (v_tid, v_s_pi,  3, 'pi.outcome_agreed',          'Pilot outcome agreed',                     'implementation_manager', 'internal', 'internal', 'unscheduled', 0, true,  false, '{}'),
    (v_tid, v_s_pi,  4, 'pi.tis_confirms',            'TIS confirms the stage',                   'implementation_manager', 'internal', 'internal', 'unscheduled', 0, true,  false, '{}'),

    (v_tid, v_s_tr,  1, 'tr.end_user_trial_completed', 'End-user trial completed',                'implementation_manager', 'customer', 'shared',   'unscheduled', 0, true,  false, '{}'),
    (v_tid, v_s_tr,  2, 'tr.rollout_readiness',       'Rollout readiness confirmed',              'implementation_manager', 'internal', 'internal', 'unscheduled', 0, true,  false, '{}'),
    (v_tid, v_s_tr,  3, 'tr.tis_confirms',            'TIS confirms the stage',                   'implementation_manager', 'internal', 'internal', 'unscheduled', 0, true,  false, '{}'),

    (v_tid, v_s_ro,  1, 'ro.go_live',                 'Go-live completed',                        'implementation_manager', 'internal', 'internal', 'unscheduled', 0, true,  false, '{}'),
    (v_tid, v_s_ro,  2, 'ro.training_delivered',      'Training delivered',                       'implementation_manager', 'internal', 'internal', 'unscheduled', 0, true,  false, '{}'),
    (v_tid, v_s_ro,  3, 'ro.acceptance_confirmed',    'Acceptance confirmed',                     'implementation_manager', 'customer', 'shared',   'unscheduled', 0, true,  false, '{}'),
    (v_tid, v_s_ro,  4, 'ro.support_handoff',         'Support handoff confirmed',                'implementation_manager', 'internal', 'internal', 'unscheduled', 0, true,  false, '{}');

  update journey_templates set status = 'published', published_at = now() where id = v_tid;
end $$;

-- Start a partner implementation in one transaction. The customer is created
-- here too when the deal has none: a missing or unapplied template, a bad
-- customer, or any other failure rolls back the customer, the implementation,
-- its history and its plan together. Nothing can be left behind.
-- Returns the implementation id, the customer id, and whether this call
-- created the customer.
drop function if exists create_partner_implementation(uuid, uuid, text, text, jsonb, uuid, uuid, timestamptz);

create or replace function create_partner_implementation(
  p_customer_id uuid,
  p_new_customer jsonb,
  p_deal_id uuid,
  p_name text,
  p_partner_key text,
  p_sow jsonb,
  p_entered_by uuid,
  p_actor_profile uuid,
  p_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tpl uuid;
  v_cust uuid;
  v_impl uuid;
  v_created boolean := false;
  v_start text := 'closed_won_planning';
  v_res jsonb;
begin
  select id into v_tpl from journey_templates
   where key = 'partner-implementation' and status = 'published' and superseded_by_id is null;
  if v_tpl is null then
    raise exception 'The partner implementation journey is not published, so nothing was started.';
  end if;

  if p_customer_id is not null then
    v_cust := p_customer_id;
  else
    if coalesce(p_new_customer ->> 'name', '') = '' then
      raise exception 'A new customer needs a name, so nothing was started.';
    end if;
    insert into customers (name, arr, industry, salesforce_account_id, logo_path)
    values (
      p_new_customer ->> 'name',
      (p_new_customer ->> 'arr')::numeric,
      p_new_customer ->> 'industry',
      p_new_customer ->> 'salesforce_account_id',
      p_new_customer ->> 'logo_path'
    )
    returning id into v_cust;
    v_created := true;
  end if;

  insert into implementations (
    customer_id, deal_id, name, current_stage, stage_entered_at, partner_key,
    status, source, sow_reference, sow_signed_date, sow_value,
    sow_document_url, sow_document_name, sow_document_path
  ) values (
    v_cust, p_deal_id, p_name, v_start, p_at, p_partner_key,
    'on_track', 'presale',
    p_sow ->> 'sow_reference',
    (p_sow ->> 'sow_signed_date')::date,
    (p_sow ->> 'sow_value')::numeric,
    p_sow ->> 'sow_document_url',
    p_sow ->> 'sow_document_name',
    p_sow ->> 'sow_document_path'
  )
  returning id into v_impl;

  insert into implementation_stage_history (implementation_id, stage, entered_at, entered_by, exited_at)
  values (v_impl, v_start, p_at, p_entered_by, null);

  v_res := apply_journey_template(v_impl, v_tpl, '{}'::jsonb, '{}'::jsonb, p_actor_profile);
  if coalesce((v_res ->> 'applied')::boolean, false) is not true then
    raise exception 'The partner journey did not apply, so nothing was started: %', v_res;
  end if;

  return jsonb_build_object(
    'implementation_id', v_impl,
    'customer_id', v_cust,
    'customer_created', v_created
  );
end $$;

revoke execute on function create_partner_implementation(uuid, jsonb, uuid, text, text, jsonb, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function create_partner_implementation(uuid, jsonb, uuid, text, text, jsonb, uuid, uuid, timestamptz)
  to service_role;
