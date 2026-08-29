-- 0016 — Seed the Add-On, Integration and Data Migration templates.
--
-- These three back NO existing implementation, so unlike New Logo their
-- content carries zero migration risk — nothing is reinterpreted, only made
-- available. They ship PUBLISHED (the brief's deliverable) but behind
-- feature_journey_templates, which gives the implementation team a review
-- window before anyone can use them.
--
-- The content is engineering-authored from the brief's own examples, NOT
-- practitioner-authored. Every version_note says so, and revisions land as v2
-- through the normal republish flow — which exercises versioning on day one.
--
-- Offsets are conservative and relative; no absolute durations are invented.
-- Rollback: supabase/down/0016_down.sql

do $$
declare
  tpl_id uuid;
  s_scope uuid; s_config uuid; s_validate uuid; s_live uuid;
begin
  ---------------------------------------------------------------------------
  -- Add-On Module
  ---------------------------------------------------------------------------
  insert into journey_templates (key, version, name, journey_type, status, description, version_note)
  values ('add-on', 1, 'Add-On Module', 'add_on', 'draft',
          'A module added to an account already live on GoCanvas.',
          'Initial seed from the v2 brief — content review pending.')
  returning id into tpl_id;

  insert into journey_template_stages (template_id, position, stage_key, name, phase, purpose)
  values
    (tpl_id, 1, 'scope', 'Scope', 'intake',
     'Confirm what was bought and who owns it on both sides.'),
    (tpl_id, 2, 'configure', 'Configure', 'delivery',
     'Build the module against the existing account configuration.'),
    (tpl_id, 3, 'validate', 'Validate', 'delivery',
     'Customer confirms the module does what was sold.'),
    (tpl_id, 4, 'live', 'Live', 'value',
     'In use by the intended team, with the existing CS owner informed.')
  returning id into s_scope;

  select id into s_scope from journey_template_stages
   where template_id = tpl_id and stage_key = 'scope';
  select id into s_config from journey_template_stages
   where template_id = tpl_id and stage_key = 'configure';
  select id into s_validate from journey_template_stages
   where template_id = tpl_id and stage_key = 'validate';
  select id into s_live from journey_template_stages
   where template_id = tpl_id and stage_key = 'live';

  insert into journey_template_tasks
    (template_id, template_stage_id, position, task_key, title, role_key, party, visibility,
     offset_basis, offset_days, depends_on_keys)
  values
    (tpl_id, s_scope, 1, 'addon.confirm_scope', 'Confirm what was purchased and the success measure',
     'implementation_manager', 'internal', 'internal', 'stage_entry', 0, '{}'),
    (tpl_id, s_scope, 2, 'addon.name_owner', 'Confirm the customer-side owner for this module',
     'implementation_manager', 'customer', 'shared', 'stage_entry', 2, '{}'),
    (tpl_id, s_config, 1, 'addon.build', 'Configure the module',
     'solutions_engineer', 'internal', 'internal', 'stage_entry', 0, '{addon.confirm_scope}'),
    (tpl_id, s_validate, 1, 'addon.customer_test', 'Test the module and confirm it matches the need',
     'customer_champion', 'customer', 'shared', 'stage_entry', 0, '{addon.build}'),
    (tpl_id, s_live, 1, 'addon.notify_cs', 'Tell the CS owner what changed on the account',
     'cs_owner', 'internal', 'internal', 'stage_entry', 0, '{addon.customer_test}');

  perform publish_template(tpl_id, 'Initial seed from the v2 brief — content review pending', null);

  ---------------------------------------------------------------------------
  -- Integration
  ---------------------------------------------------------------------------
  insert into journey_templates (key, version, name, journey_type, status, description, version_note)
  values ('integration', 1, 'Integration', 'integration', 'draft',
          'Connecting GoCanvas to a customer system of record.',
          'Initial seed from the v2 brief — content review pending.')
  returning id into tpl_id;

  insert into journey_template_stages (template_id, position, stage_key, name, phase, purpose)
  values
    (tpl_id, 1, 'discovery', 'Discovery', 'intake',
     'Establish which system, which direction, and who owns it.'),
    (tpl_id, 2, 'design', 'Design', 'delivery',
     'Agree the field mapping and the failure behaviour.'),
    (tpl_id, 3, 'build', 'Build', 'delivery', 'Build and connect in a sandbox.'),
    (tpl_id, 4, 'validate-iterate', 'Validate / Iterate', 'delivery',
     'Prove it with real data, including the unhappy paths.'),
    (tpl_id, 5, 'launch', 'Launch', 'delivery', 'Cut over to production.');

  -- Scoping questions drive what work actually appears.
  insert into scoping_questions (template_id, position, key, prompt, kind, options, required)
  values
    (tpl_id, 1, 'integration_type', 'Which system are we integrating with?', 'select',
     '["erp","mes","crm","other"]'::jsonb, true),
    (tpl_id, 2, 'plants', 'How many sites or plants are in scope?', 'number', null, false),
    (tpl_id, 3, 'environments', 'Is there a customer sandbox we can use?', 'boolean', null, false);

  select id into s_scope from journey_template_stages
   where template_id = tpl_id and stage_key = 'discovery';
  select id into s_config from journey_template_stages
   where template_id = tpl_id and stage_key = 'design';
  select id into s_validate from journey_template_stages
   where template_id = tpl_id and stage_key = 'build';

  insert into journey_template_tasks
    (template_id, template_stage_id, position, task_key, title, role_key, party, visibility,
     offset_basis, offset_days, include_when, depends_on_keys)
  values
    (tpl_id, s_scope, 1, 'int.identify_system', 'Confirm the system, direction and record owner',
     'solutions_engineer', 'internal', 'internal', 'stage_entry', 0, null, '{}'),
    (tpl_id, s_scope, 2, 'int.customer_contact', 'Name the customer-side system owner',
     'implementation_manager', 'customer', 'shared', 'stage_entry', 2, null, '{}'),
    -- ERP work only appears when it is actually an ERP integration.
    (tpl_id, s_config, 1, 'int.erp_sandbox', 'Get ERP sandbox access',
     'solutions_engineer', 'customer', 'shared', 'stage_entry', 0,
     '{"integration_type": "erp"}'::jsonb, '{int.identify_system}'),
    (tpl_id, s_config, 2, 'int.field_mapping', 'Agree the field mapping',
     'solutions_engineer', 'internal', 'shared', 'stage_entry', 3, null, '{int.identify_system}'),
    -- Multi-site work only appears when there is more than one site.
    (tpl_id, s_validate, 1, 'int.site_rollout_plan', 'Plan the per-site rollout order',
     'implementation_manager', 'internal', 'shared', 'stage_entry', 0,
     '{"plants": {">": 1}}'::jsonb, '{int.field_mapping}');

  perform publish_template(tpl_id, 'Initial seed from the v2 brief — content review pending', null);

  ---------------------------------------------------------------------------
  -- Data Migration
  ---------------------------------------------------------------------------
  insert into journey_templates (key, version, name, journey_type, status, description, version_note)
  values ('data-migration', 1, 'Data Migration', 'data_migration', 'draft',
          'Moving existing customer records into GoCanvas.',
          'Initial seed from the v2 brief — content review pending.')
  returning id into tpl_id;

  insert into journey_template_stages (template_id, position, stage_key, name, phase, purpose)
  values
    (tpl_id, 1, 'extract', 'Extract', 'intake', 'Get the data out of the source system.'),
    (tpl_id, 2, 'map', 'Map', 'delivery', 'Agree how source fields become GoCanvas fields.'),
    (tpl_id, 3, 'validate', 'Validate', 'delivery',
     'Customer confirms a sample is correct before the full load.'),
    (tpl_id, 4, 'load', 'Load', 'delivery', 'Load, verify counts, and confirm.');

  select id into s_scope from journey_template_stages
   where template_id = tpl_id and stage_key = 'extract';
  select id into s_config from journey_template_stages
   where template_id = tpl_id and stage_key = 'map';
  select id into s_validate from journey_template_stages
   where template_id = tpl_id and stage_key = 'validate';
  select id into s_live from journey_template_stages
   where template_id = tpl_id and stage_key = 'load';

  insert into journey_template_tasks
    (template_id, template_stage_id, position, task_key, title, role_key, party, visibility,
     offset_basis, offset_days, depends_on_keys)
  values
    (tpl_id, s_scope, 1, 'dm.export', 'Export the source data',
     'customer_data_owner', 'customer', 'shared', 'stage_entry', 0, '{}'),
    (tpl_id, s_config, 1, 'dm.mapping', 'Agree the field mapping',
     'solutions_engineer', 'internal', 'shared', 'stage_entry', 0, '{dm.export}'),
    (tpl_id, s_validate, 1, 'dm.sample_signoff', 'Confirm a sample load is correct',
     'customer_data_owner', 'customer', 'shared', 'stage_entry', 0, '{dm.mapping}'),
    (tpl_id, s_live, 1, 'dm.full_load', 'Run the full load and verify record counts',
     'solutions_engineer', 'internal', 'shared', 'stage_entry', 0, '{dm.sample_signoff}');

  perform publish_template(tpl_id, 'Initial seed from the v2 brief — content review pending', null);
end $$;
