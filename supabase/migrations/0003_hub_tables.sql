-- 0003 — Hub tables: faithful DDL for every table in
-- src/integrations/supabase/types.ts (27 tables), plus the orgs multi-tenancy
-- seam.
--
-- Collision check (this database is shared): none of the 27 new table names
-- collides with the prototype app's tables (clients, users, forms, submissions,
-- submission_fields, reports, accounts, sessions, verification_tokens,
-- alert_rules, webhooks, shared_links, reference_tables, reference_rows,
-- invites, form_versions, dashboards, dashboard_tiles, insight_items,
-- routing_rules, solutions, proposals, price_book_items, connectors, api_specs,
-- proposal_views, deal_activities, proposal_snapshots) nor with the portal_*
-- tables from 0001/0002. Nearest near-misses, checked and distinct:
-- audit_log vs portal_audit_log, team_members vs users.
--
-- RLS here is intentionally coarse (internal tool; the app's service-role data
-- layer bypasses RLS anyway). Migration 0005 tightens it per role.

-- ---------------------------------------------------------------------------
-- Multi-tenancy seam
-- ---------------------------------------------------------------------------
create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

insert into orgs (id, name)
values ('00000000-0000-4000-8000-000000000001', 'GoCanvas');

-- ---------------------------------------------------------------------------
-- Root tables (no FK dependencies among the 27)
-- ---------------------------------------------------------------------------
create table team_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  email text,
  name text not null,
  role text not null
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  arr numeric,
  created_at timestamptz not null default now(),
  external_id text,
  industry text,
  name text not null,
  region text,
  segment text,
  source text not null default 'manual',
  updated_at timestamptz not null default now()
);

create table customer_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  created_at timestamptz not null default now(),
  customer_id uuid not null references customers (id) on delete cascade,
  email text,
  name text not null,
  notes text,
  role text not null,
  updated_at timestamptz not null default now()
);

create table implementations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  actual_launch_date date,
  contract_start_date date,
  created_at timestamptz not null default now(),
  current_stage text not null,
  customer_goals text,
  customer_id uuid not null references customers (id) on delete cascade,
  discovery_board_image_name text,
  discovery_board_image_url text,
  discovery_board_notes text,
  discovery_board_url text,
  external_ref text,
  name text not null,
  owner_id uuid references team_members (id) on delete set null,
  sales_owner text,
  source text not null default 'manual',
  sow_document_name text,
  sow_document_url text,
  sow_reference text,
  sow_signed_date date,
  sow_value numeric,
  stage_entered_at timestamptz not null default now(),
  status text not null default 'active',
  target_launch_date date,
  tier text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Implementation children
-- ---------------------------------------------------------------------------
create table adoption_areas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  created_at timestamptz not null default now(),
  customer_owner_contact_id uuid references customer_contacts (id) on delete set null,
  expected_frequency text,
  implementation_id uuid not null references implementations (id) on delete cascade,
  in_use_definition text,
  intended_usage text,
  intended_users text,
  kind text not null,
  name text not null,
  notes text,
  owner_id uuid references team_members (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table evidence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  created_at timestamptz not null default now(),
  description text,
  implementation_id uuid not null references implementations (id) on delete cascade,
  related_entity_id uuid,
  related_entity_type text,
  title text not null,
  type text not null,
  uploaded_by uuid references team_members (id) on delete set null,
  url text
);

create table adoption_observations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  adoption_area_id uuid not null references adoption_areas (id) on delete cascade,
  created_at timestamptz not null default now(),
  evidence_id uuid references evidence (id) on delete set null,
  notes text,
  observed_at timestamptz not null default now(),
  observed_by uuid references team_members (id) on delete set null,
  source text,
  state text not null,
  workaround_description text,
  workaround_in_use boolean not null default false
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  approved_entity_id uuid,
  approved_entity_type text,
  approver_name text,
  approver_role text,
  customer_contact_id uuid references customer_contacts (id) on delete set null,
  decided_at timestamptz,
  evidence_id uuid references evidence (id) on delete set null,
  implementation_id uuid not null references implementations (id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'pending',
  title text not null
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  change_reason text,
  changed_at timestamptz not null default now(),
  changed_by uuid references team_members (id) on delete set null,
  entity_id uuid not null,
  entity_type text not null,
  field_name text,
  new_value text,
  old_value text
);

create table commitments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  committed_to text,
  description text not null,
  due_date date,
  fulfilled_at timestamptz,
  implementation_id uuid not null references implementations (id) on delete cascade,
  made_at timestamptz not null default now(),
  made_by uuid references team_members (id) on delete set null,
  owner_id uuid references team_members (id) on delete set null,
  status text not null default 'open'
);

-- one-to-one with implementations (Relationships: isOneToOne) -> unique FK
create table cs_handoffs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  account_context text,
  created_at timestamptz not null default now(),
  cs_owner_id uuid references team_members (id) on delete set null,
  handoff_date date,
  implementation_id uuid not null unique references implementations (id) on delete cascade,
  open_items text,
  summary text
);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  created_at timestamptz not null default now(),
  decided_by text,
  decision_date date,
  description text,
  implementation_id uuid not null references implementations (id) on delete cascade,
  rationale text,
  status text not null default 'proposed',
  title text not null
);

create table issues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  description text,
  implementation_id uuid not null references implementations (id) on delete cascade,
  owner_id uuid references team_members (id) on delete set null,
  raised_at timestamptz not null default now(),
  resolution text,
  resolved_at timestamptz,
  severity text not null default 'medium',
  status text not null default 'open',
  title text not null
);

create table risks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  description text,
  identified_at timestamptz not null default now(),
  impact text,
  implementation_id uuid not null references implementations (id) on delete cascade,
  likelihood text not null default 'medium',
  mitigation text,
  owner_id uuid references team_members (id) on delete set null,
  resolved_at timestamptz,
  severity text not null default 'medium',
  status text not null default 'open',
  title text not null
);

create table escalations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  description text,
  escalation_type text,
  implementation_id uuid not null references implementations (id) on delete cascade,
  owner_id uuid references team_members (id) on delete set null,
  raised_at timestamptz not null default now(),
  raised_by uuid references team_members (id) on delete set null,
  related_issue_id uuid references issues (id) on delete set null,
  related_risk_id uuid references risks (id) on delete set null,
  resolution_summary text,
  resolved_at timestamptz,
  severity text not null default 'medium',
  status text not null default 'open',
  title text not null
);

-- one-to-one with implementations (Relationships: isOneToOne) -> unique FK
create table graduations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  created_at timestamptz not null default now(),
  cs_owner_id uuid references team_members (id) on delete set null,
  exit_criteria_summary text,
  graduated_at timestamptz,
  health_at_graduation text,
  implementation_id uuid not null unique references implementations (id) on delete cascade,
  notes text
);

create table implementation_stage_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  entered_at timestamptz not null,
  entered_by uuid references team_members (id) on delete set null,
  exited_at timestamptz,
  implementation_id uuid not null references implementations (id) on delete cascade,
  notes text,
  stage text not null
);

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  attachment_name text,
  attachment_url text,
  author_id uuid references team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  implementation_id uuid not null references implementations (id) on delete cascade,
  links text,
  note text not null,
  stage text not null
);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  completed_date date,
  created_at timestamptz not null default now(),
  implementation_id uuid not null references implementations (id) on delete cascade,
  name text not null,
  owner_id uuid references team_members (id) on delete set null,
  stage text,
  status text not null default 'not_started',
  target_date date
);

create table requirements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  category text,
  created_at timestamptz not null default now(),
  created_by uuid references team_members (id) on delete set null,
  description text,
  implementation_id uuid not null references implementations (id) on delete cascade,
  priority text not null default 'medium',
  scope_status text not null default 'in_scope',
  source text,
  status text not null default 'proposed',
  title text not null
);

create table requirement_scope_changes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  change_type text not null,
  created_at timestamptz not null default now(),
  decision text,
  decision_at timestamptz,
  decision_by text,
  description text,
  effective_date date,
  impact text,
  reason text,
  requested_at timestamptz,
  requested_by text,
  requirement_id uuid not null references requirements (id) on delete cascade
);

create table success_criteria (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  baseline_period text,
  baseline_value text,
  created_at timestamptz not null default now(),
  customer_owner_contact_id uuid references customer_contacts (id) on delete set null,
  description text not null,
  due_stage text,
  implementation_id uuid not null references implementations (id) on delete cascade,
  measured_at timestamptz,
  measured_value text,
  measurement_source text,
  metric text,
  owner_id uuid references team_members (id) on delete set null,
  status text not null default 'not_started',
  target_date date,
  target_value text
);

create table success_criteria_observations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  assessment text,
  created_at timestamptz not null default now(),
  evidence_id uuid references evidence (id) on delete set null,
  notes text,
  observed_at timestamptz not null default now(),
  observed_by uuid references team_members (id) on delete set null,
  observed_value text not null,
  source text,
  success_criteria_id uuid not null references success_criteria (id) on delete cascade
);

create table technical_solutions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  configuration_details text,
  created_at timestamptz not null default now(),
  design_summary text,
  implementation_id uuid not null references implementations (id) on delete cascade,
  owner_id uuid references team_members (id) on delete set null,
  requirement_id uuid references requirements (id) on delete set null,
  status text not null default 'draft',
  title text not null,
  updated_at timestamptz not null default now()
);

create table technical_solution_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  attachment_name text,
  attachment_url text,
  content text not null,
  created_at timestamptz not null default now(),
  created_by uuid references team_members (id) on delete set null,
  links text,
  note_type text not null,
  technical_solution_id uuid not null references technical_solutions (id) on delete cascade
);

create table field_mappings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  created_at timestamptz not null default now(),
  implementation_id uuid not null references implementations (id) on delete cascade,
  required boolean,
  source_field text,
  source_system text,
  status text,
  target_field text,
  technical_solution_id uuid references technical_solutions (id) on delete set null,
  transformation_notes text
);

create table trace_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  created_at timestamptz not null default now(),
  from_entity_id uuid not null,
  from_entity_type text not null,
  relationship text not null,
  to_entity_id uuid not null,
  to_entity_type text not null
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- org seam on high-traffic tables
create index customers_org_idx on customers (org_id);
create index implementations_org_idx on implementations (org_id);
create index commitments_org_idx on commitments (org_id);
create index milestones_org_idx on milestones (org_id);
create index issues_org_idx on issues (org_id);
create index risks_org_idx on risks (org_id);
create index escalations_org_idx on escalations (org_id);

-- FKs the app filters on
create index implementations_customer_idx on implementations (customer_id);
create index customer_contacts_customer_idx on customer_contacts (customer_id);
create index adoption_areas_implementation_idx on adoption_areas (implementation_id);
create index adoption_observations_area_idx on adoption_observations (adoption_area_id);
create index approvals_implementation_idx on approvals (implementation_id);
create index commitments_implementation_idx on commitments (implementation_id);
create index decisions_implementation_idx on decisions (implementation_id);
create index escalations_implementation_idx on escalations (implementation_id);
create index evidence_implementation_idx on evidence (implementation_id);
create index field_mappings_implementation_idx on field_mappings (implementation_id);
create index implementation_stage_history_impl_idx on implementation_stage_history (implementation_id);
create index issues_implementation_idx on issues (implementation_id);
create index journal_entries_implementation_idx on journal_entries (implementation_id);
create index milestones_implementation_idx on milestones (implementation_id);
create index requirements_implementation_idx on requirements (implementation_id);
create index requirement_scope_changes_req_idx on requirement_scope_changes (requirement_id);
create index risks_implementation_idx on risks (implementation_id);
create index success_criteria_implementation_idx on success_criteria (implementation_id);
create index success_criteria_observations_sc_idx on success_criteria_observations (success_criteria_id);
create index technical_solutions_implementation_idx on technical_solutions (implementation_id);
create index technical_solution_notes_ts_idx on technical_solution_notes (technical_solution_id);

-- ---------------------------------------------------------------------------
-- updated_at touch triggers (only tables that have updated_at), reusing
-- portal_touch_updated_at() from 0001.
-- ---------------------------------------------------------------------------
create trigger adoption_areas_touch before update on adoption_areas
  for each row execute function portal_touch_updated_at();
create trigger customer_contacts_touch before update on customer_contacts
  for each row execute function portal_touch_updated_at();
create trigger customers_touch before update on customers
  for each row execute function portal_touch_updated_at();
create trigger implementations_touch before update on implementations
  for each row execute function portal_touch_updated_at();
create trigger technical_solutions_touch before update on technical_solutions
  for each row execute function portal_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: enable everywhere; coarse internal policies for now (tightened in 0005).
-- Policy names are deterministic ("<table> select|insert|update|delete") so
-- 0005 can drop them by name.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'orgs','team_members','customers','customer_contacts','implementations',
    'adoption_areas','evidence','adoption_observations','approvals','audit_log',
    'commitments','cs_handoffs','decisions','issues','risks','escalations',
    'graduations','implementation_stage_history','journal_entries','milestones',
    'requirements','requirement_scope_changes','success_criteria',
    'success_criteria_observations','technical_solutions',
    'technical_solution_notes','field_mappings','trace_links'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "%s select" on %I for select to authenticated using (true)', t, t);
    execute format(
      'create policy "%s insert" on %I for insert to authenticated with check (true)', t, t);
    execute format(
      'create policy "%s update" on %I for update to authenticated using (true) with check (true)', t, t);
    execute format(
      'create policy "%s delete" on %I for delete to authenticated using (true)', t, t);
  end loop;
end $$;
