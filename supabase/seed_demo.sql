-- Demo data for the Monday walkthrough. Idempotent-ish: run once on a fresh
-- schema. Safe to delete everything it creates (fixed d5... uuids).

-- Team
insert into team_members (id, name, role) values
  ('d5000000-0000-4000-8000-000000000001', 'Cory Brown', 'Implementation Lead'),
  ('d5000000-0000-4000-8000-000000000002', 'Jamie Rivera', 'Solutions Engineer'),
  ('d5000000-0000-4000-8000-000000000003', 'Sam Patel', 'Implementation Manager')
on conflict (id) do nothing;

-- Customers + implementations across the lifecycle
insert into customers (id, name, segment, industry, arr, region) values
  ('d5100000-0000-4000-8000-000000000001', 'Acme Manufacturing', 'Mid-Market', 'Manufacturing', 48000, 'US-East'),
  ('d5100000-0000-4000-8000-000000000002', 'BlueRiver Inspections', 'SMB', 'Field Services', 27500, 'US-Central'),
  ('d5100000-0000-4000-8000-000000000003', 'Corewell Energy', 'Enterprise', 'Energy', 96000, 'US-West')
on conflict (id) do nothing;

insert into customer_contacts (id, customer_id, name, role, email) values
  ('d5110000-0000-4000-8000-000000000001', 'd5100000-0000-4000-8000-000000000001', 'Dana Ortiz', 'Ops Director', 'dana@acme-mfg.example'),
  ('d5110000-0000-4000-8000-000000000002', 'd5100000-0000-4000-8000-000000000002', 'Lee Chen', 'Field Supervisor', 'lee@blueriver.example'),
  ('d5110000-0000-4000-8000-000000000003', 'd5100000-0000-4000-8000-000000000003', 'Priya Nair', 'IT Program Manager', 'priya@corewell.example')
on conflict (id) do nothing;

insert into implementations (id, customer_id, name, current_stage, stage_entered_at, status, owner_id, tier, target_launch_date, customer_goals) values
  ('d5200000-0000-4000-8000-000000000001', 'd5100000-0000-4000-8000-000000000001', 'Acme Manufacturing rollout', 'build', now() - interval '9 days', 'on_track', 'd5000000-0000-4000-8000-000000000001', 'standard', current_date + 21, 'Replace paper quality inspections across 3 plants'),
  ('d5200000-0000-4000-8000-000000000002', 'd5100000-0000-4000-8000-000000000002', 'BlueRiver field forms', 'align-external', now() - interval '16 days', 'at_risk', 'd5000000-0000-4000-8000-000000000002', 'light', current_date + 10, 'Digital inspection forms with offline capture'),
  ('d5200000-0000-4000-8000-000000000003', 'd5100000-0000-4000-8000-000000000003', 'Corewell Energy program', 'validate-iterate', now() - interval '4 days', 'on_track', 'd5000000-0000-4000-8000-000000000003', 'enterprise', current_date + 35, 'Work orders + ERP integration for 400 field techs')
on conflict (id) do nothing;

insert into implementation_stage_history (implementation_id, stage, entered_at, exited_at) values
  ('d5200000-0000-4000-8000-000000000001', 'handoff', now() - interval '30 days', now() - interval '24 days'),
  ('d5200000-0000-4000-8000-000000000001', 'plan-internal', now() - interval '24 days', now() - interval '18 days'),
  ('d5200000-0000-4000-8000-000000000001', 'align-external', now() - interval '18 days', now() - interval '9 days'),
  ('d5200000-0000-4000-8000-000000000001', 'build', now() - interval '9 days', null),
  ('d5200000-0000-4000-8000-000000000002', 'handoff', now() - interval '28 days', now() - interval '22 days'),
  ('d5200000-0000-4000-8000-000000000002', 'plan-internal', now() - interval '22 days', now() - interval '16 days'),
  ('d5200000-0000-4000-8000-000000000002', 'align-external', now() - interval '16 days', null);

insert into milestones (implementation_id, name, stage, status, target_date, completed_date, owner_id) values
  ('d5200000-0000-4000-8000-000000000001', 'Kickoff complete', 'align-external', 'complete', current_date - 12, current_date - 12, 'd5000000-0000-4000-8000-000000000001'),
  ('d5200000-0000-4000-8000-000000000001', 'First form live in the field', 'build', 'in_progress', current_date + 5, null, 'd5000000-0000-4000-8000-000000000001'),
  ('d5200000-0000-4000-8000-000000000001', 'All 3 plants launched', 'launch', 'not_started', current_date + 21, null, 'd5000000-0000-4000-8000-000000000001'),
  ('d5200000-0000-4000-8000-000000000002', 'Kickoff complete', 'align-external', 'complete', current_date - 10, current_date - 9, 'd5000000-0000-4000-8000-000000000002'),
  ('d5200000-0000-4000-8000-000000000002', 'Reference data loaded', 'build', 'not_started', current_date - 2, null, 'd5000000-0000-4000-8000-000000000002'),
  ('d5200000-0000-4000-8000-000000000003', 'Pilot crew validated', 'validate-iterate', 'in_progress', current_date + 7, null, 'd5000000-0000-4000-8000-000000000003');

insert into commitments (implementation_id, description, due_date, status, committed_to, owner_id) values
  ('d5200000-0000-4000-8000-000000000001', 'Deliver plant-2 form template draft', current_date + 3, 'open', 'Dana Ortiz', 'd5000000-0000-4000-8000-000000000001'),
  ('d5200000-0000-4000-8000-000000000002', 'Customer to supply asset list CSV', current_date - 4, 'open', 'GoCanvas team', 'd5000000-0000-4000-8000-000000000002'),
  ('d5200000-0000-4000-8000-000000000003', 'Confirm ERP sandbox credentials', current_date + 2, 'open', 'Priya Nair', 'd5000000-0000-4000-8000-000000000003');

-- Presale pipeline (deals)
insert into portal_accounts (id, name, domain, salesforce_id, stage, arr, summary, customer_id) values
  ('d5300000-0000-4000-8000-000000000001', 'Summit Field Services', 'summitfs.example', 'SF-9001', 'prospect', 18000, 'Paper inspection forms, 40 techs, evaluating vs FormsPro', null),
  ('d5300000-0000-4000-8000-000000000002', 'Ironline Utilities', 'ironline.example', 'SF-9002', 'closed_won', 42000, 'Won on offline capture + dispatch. Kickoff pending.', null),
  ('d5300000-0000-4000-8000-000000000003', 'Acme Manufacturing', 'acme-mfg.example', 'SF-8801', 'in_onboarding', 48000, 'Quality inspections across 3 plants.', 'd5100000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into portal_stage_transitions (account_id, from_stage, to_stage, source, note) values
  ('d5300000-0000-4000-8000-000000000001', null, 'prospect', 'csv_import', 'Imported from Salesforce'),
  ('d5300000-0000-4000-8000-000000000002', null, 'prospect', 'csv_import', 'Imported from Salesforce'),
  ('d5300000-0000-4000-8000-000000000002', 'prospect', 'closed_won', 'api', 'Zapier: Opportunity Closed Won'),
  ('d5300000-0000-4000-8000-000000000003', null, 'closed_won', 'csv_import', 'Imported at handoff build-out'),
  ('d5300000-0000-4000-8000-000000000003', 'closed_won', 'in_onboarding', 'ui', 'Onboarding started');

insert into portal_gong_reports (account_id, report_type, title, content_md) values
  ('d5300000-0000-4000-8000-000000000002', 'call_notes', 'Discovery + demo calls — Aug 2026',
   E'## Current process\n- Paper work orders printed each morning; techs return them end of day\n- Data re-keyed into spreadsheet by two coordinators (~3h/day)\n- No photo evidence attached to inspections\n\n## Goals\n- Same-day visibility into completed work\n- Offline capture for rural routes\n- Dispatch jobs to specific crews\n\n## Stakeholders\n- Maria Gomez, Ops Manager (champion)\n- Ty Walker, IT (integration owner)\n\n## Risks\n- IT bandwidth for ERP integration is limited until Q1');

-- A ticket already in flight (routing table is seeded by migration 0006)
insert into tickets (customer_id, implementation_id, submitter_email, category, subject, body, priority, status, assigned_role, sla_due_at, created_at) values
  ('d5100000-0000-4000-8000-000000000002', 'd5200000-0000-4000-8000-000000000002', 'lee@blueriver.example', 'training',
   'When is level 2 training for supervisors?', 'Our supervisors finished the intro video — how do we schedule the next session?', 'normal', 'open', 'implementation', now() + interval '18 hours', now() - interval '6 hours');
