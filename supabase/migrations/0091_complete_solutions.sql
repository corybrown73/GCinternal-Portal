-- 0091: complete solutions, their components, and their history.
--
-- A customer's implementation delivers one or more COMPLETE SOLUTIONS. Each is
-- made of COMPONENTS in five categories (forms, integrations, analytics,
-- training, other). Dispatch and Dynamic Reference Data are integration types,
-- so they are a field on an integration component, not a category of their own.
--
--   customer -> implementation -> complete solution -> component
--
-- WHY NEW TABLES, NOT technical_solutions. technical_solutions (0003) is the
-- engineering record: what Technical Solutions is building, its design notes
-- and field mappings. It is kept exactly as it is. A component may point at one
-- (solution_components.technical_solution_id), so the engineering detail is
-- reused rather than copied. A complete solution is the thing the TIS delivers
-- and reports on, which is a different unit with different statuses.
--
-- HISTORY IS NOT EDITABLE. solution_events is append-only. A target date keeps
-- its original value (original_target_date) and every change to it, with the
-- reason, is an event. Nothing is deleted: a solution or component that is no
-- longer wanted is archived (archived_at), and every foreign key that could
-- remove history is ON DELETE RESTRICT.
--
-- SCOPE. Rows belong to an implementation. Nothing here reads or writes a deal
-- or the pre-sale record. The SOW a suggestion is read from stays where it is
-- (implementations.sow_document_path); these tables keep only the sentence each
-- item came from (sow_quote), so the original is never needed to explain a row.
--
-- MIGRATION DEPENDENCIES. None on another migration beyond 0003 (technical_solutions),
-- 0001/0005 (portal_profiles, portal_is_internal) and 0019 (implementations' org model).
-- The application reads these tables, so the code that uses them must not deploy
-- before this migration is applied to production (docs/MIGRATIONS.md).

-- ---------------------------------------------------------------------------
-- complete_solutions
-- ---------------------------------------------------------------------------
create table public.complete_solutions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.orgs (id),
  implementation_id uuid not null references public.implementations (id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 200),
  -- purchased: on the signed SOW. requested: asked for, not yet approved for scope.
  scope text not null default 'purchased' check (scope in ('purchased', 'requested')),
  source text not null default 'manual' check (source in ('manual', 'sow')),
  sow_quote text check (sow_quote is null or length(sow_quote) <= 2000),
  -- The starting condition the SOW states for this solution, in its own words.
  start_condition text check (start_condition is null or length(start_condition) <= 1000),
  estimate_weeks integer check (estimate_weeks is null or estimate_weeks between 1 and 520),
  priority text not null default 'deliver_during_implementation'
    check (priority in ('needed_for_go_live', 'deliver_during_implementation', 'planned_for_later')),
  -- The TIS-set state of the work as a whole.
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'waiting', 'complete')),
  -- Readiness is SUGGESTED from the components and CONFIRMED by a person. The
  -- confirmed value is the one shown as the solution's readiness.
  readiness_confirmed text not null default 'not_ready'
    check (readiness_confirmed in ('not_ready', 'at_risk', 'ready')),
  readiness_confirmed_at timestamptz,
  readiness_confirmed_by uuid references public.portal_profiles (id) on delete set null,
  next_action text check (next_action is null or length(next_action) <= 1000),
  -- The delivery timeline for the whole solution. Set by a person; a SOW estimate
  -- is only ever a suggestion until confirmed.
  target_date date,
  original_target_date date,
  archived_at timestamptz,
  created_by uuid references public.portal_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index complete_solutions_impl_idx
  on public.complete_solutions (implementation_id) where archived_at is null;

create trigger complete_solutions_touch before update on public.complete_solutions
  for each row execute function portal_touch_updated_at();

-- ---------------------------------------------------------------------------
-- solution_components
-- ---------------------------------------------------------------------------
create table public.solution_components (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.orgs (id),
  implementation_id uuid not null references public.implementations (id) on delete restrict,
  complete_solution_id uuid not null references public.complete_solutions (id) on delete restrict,
  category text not null check (category in ('forms', 'integrations', 'analytics', 'training', 'other')),
  -- Only an integration has a type: dispatch, dynamic reference data, or another system.
  integration_type text check (integration_type in ('dispatch', 'dynamic_reference_data', 'system')),
  name text not null check (length(btrim(name)) between 1 and 200),
  status text not null default 'not_started' check (status in (
    'not_started', 'being_built', 'waiting', 'ready_for_testing', 'changes_needed', 'complete'
  )),
  priority text not null default 'deliver_during_implementation'
    check (priority in ('needed_for_go_live', 'deliver_during_implementation', 'planned_for_later')),
  -- Delivery. original_target_date is the first date ever given and never moves.
  target_date date,
  original_target_date date,
  target_change_reason text check (target_change_reason is null or length(target_change_reason) <= 500),
  start_condition text check (start_condition is null or length(start_condition) <= 1000),
  estimate_weeks integer check (estimate_weeks is null or estimate_weeks between 1 and 520),
  -- What is holding it, what happened last, and what happens next.
  blocker text check (blocker is null or length(blocker) <= 1000),
  latest_update text check (latest_update is null or length(latest_update) <= 2000),
  latest_update_at timestamptz,
  next_action text check (next_action is null or length(next_action) <= 1000),
  -- The engineering record behind this component, when there is one.
  technical_solution_id uuid references public.technical_solutions (id) on delete set null,
  sow_quote text check (sow_quote is null or length(sow_quote) <= 2000),
  -- Forms only. Each is recorded on its own; none is inferred from another.
  form_built boolean not null default false,
  customer_approved boolean not null default false,
  submission_count integer check (submission_count is null or submission_count >= 0),
  -- The date the submission count was read from the system. Required with the count.
  submission_checked_on date,
  -- Customer usage is confirmed by a person on a date. A submission count never sets it.
  customer_usage_confirmed_on date,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by uuid references public.portal_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Integration type belongs to integrations only.
  constraint solution_components_type_for_integrations_only
    check (category = 'integrations' or integration_type is null),
  -- Form tracking belongs to forms only.
  constraint solution_components_form_fields_check check (
    category = 'forms'
    or (not form_built and not customer_approved and submission_count is null
        and submission_checked_on is null and customer_usage_confirmed_on is null)
  ),
  -- A count and the date it was checked are entered together.
  constraint solution_components_submission_pair_check
    check ((submission_count is null) = (submission_checked_on is null))
);
create index solution_components_solution_idx
  on public.solution_components (complete_solution_id);
create index solution_components_impl_idx
  on public.solution_components (implementation_id);

create trigger solution_components_touch before update on public.solution_components
  for each row execute function portal_touch_updated_at();

-- A component's solution must belong to the same implementation as the component.
create or replace function public.solution_component_enforce()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_impl uuid;
begin
  select implementation_id into v_impl
    from public.complete_solutions where id = new.complete_solution_id;
  if v_impl is null then
    raise exception 'solution_components: complete solution % does not exist', new.complete_solution_id;
  end if;
  if v_impl <> new.implementation_id then
    raise exception
      'solution_components: component belongs to implementation % but its solution belongs to %',
      new.implementation_id, v_impl;
  end if;
  if new.original_target_date is null and new.target_date is not null then
    new.original_target_date := new.target_date;
  end if;
  if tg_op = 'UPDATE' and old.original_target_date is not null
     and new.original_target_date is distinct from old.original_target_date then
    raise exception 'solution_components: the original target date of a component cannot be changed';
  end if;
  return new;
end $$;

create trigger solution_components_enforce
  before insert or update on public.solution_components
  for each row execute function public.solution_component_enforce();

-- ---------------------------------------------------------------------------
-- solution_component_dependencies
-- ---------------------------------------------------------------------------
create table public.solution_component_dependencies (
  component_id uuid not null references public.solution_components (id) on delete restrict,
  depends_on_id uuid not null references public.solution_components (id) on delete restrict,
  -- A critical dependency holds the component it blocks: the solution cannot be
  -- ready while it is open. Suggested readiness reads this.
  critical boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (component_id, depends_on_id),
  constraint solution_component_dependencies_not_self check (component_id <> depends_on_id)
);
create index solution_component_dependencies_on_idx
  on public.solution_component_dependencies (depends_on_id);

-- Both ends belong to one implementation. Cycles are refused by the application
-- (it has the whole graph to hand); this trigger guards the cross-implementation case.
create or replace function public.solution_dependency_enforce()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_a uuid;
  v_b uuid;
begin
  select implementation_id into v_a from public.solution_components where id = new.component_id;
  select implementation_id into v_b from public.solution_components where id = new.depends_on_id;
  if v_a is null or v_b is null then
    raise exception 'solution_component_dependencies: both components must exist';
  end if;
  if v_a <> v_b then
    raise exception 'solution_component_dependencies: a dependency must stay within one implementation';
  end if;
  return new;
end $$;

create trigger solution_component_dependencies_enforce
  before insert or update on public.solution_component_dependencies
  for each row execute function public.solution_dependency_enforce();

-- ---------------------------------------------------------------------------
-- solution_events: the history. Append-only.
-- ---------------------------------------------------------------------------
create table public.solution_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.orgs (id),
  implementation_id uuid not null references public.implementations (id) on delete restrict,
  complete_solution_id uuid not null references public.complete_solutions (id) on delete restrict,
  component_id uuid references public.solution_components (id) on delete restrict,
  kind text not null check (kind in (
    'created', 'edited', 'status', 'priority', 'target_date', 'readiness_confirmed',
    'dependency_added', 'dependency_removed', 'form_built', 'customer_approved',
    'submission_count', 'usage_confirmed', 'archived', 'restored', 'sow_import'
  )),
  from_value text,
  to_value text,
  reason text check (reason is null or length(reason) <= 1000),
  actor_profile_id uuid references public.portal_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index solution_events_solution_idx
  on public.solution_events (complete_solution_id, created_at);

create or replace function public.solution_events_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'solution_events is a history: rows are never % (id %)', lower(tg_op), old.id;
end $$;

create trigger solution_events_no_update
  before update on public.solution_events
  for each row execute function public.solution_events_append_only();
create trigger solution_events_no_delete
  before delete on public.solution_events
  for each row execute function public.solution_events_append_only();

-- ---------------------------------------------------------------------------
-- Row level security: internal users only. Customers never read these tables;
-- the customer views are built on the server from an allow-list.
-- ---------------------------------------------------------------------------
alter table public.complete_solutions enable row level security;
alter table public.solution_components enable row level security;
alter table public.solution_component_dependencies enable row level security;
alter table public.solution_events enable row level security;

create policy "complete_solutions internal" on public.complete_solutions
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());
create policy "solution_components internal" on public.solution_components
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());
create policy "solution_component_dependencies internal" on public.solution_component_dependencies
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());
create policy "solution_events internal" on public.solution_events
  for select to authenticated using (portal_is_internal());
create policy "solution_events internal insert" on public.solution_events
  for insert to authenticated with check (portal_is_internal());

-- ---------------------------------------------------------------------------
-- Transcript proposals can now suggest a change to one component.
-- ---------------------------------------------------------------------------
alter table public.evidence_proposals
  add column if not exists solution_component_id uuid
    references public.solution_components (id) on delete set null,
  add column if not exists component_field text
    check (component_field is null or component_field in (
      'status', 'priority', 'next_action', 'blocker', 'target_date', 'latest_update'
    )),
  add column if not exists component_value text;

alter table public.evidence_proposals drop constraint if exists evidence_proposals_type_check;
alter table public.evidence_proposals add constraint evidence_proposals_type_check check (
  type in ('risk', 'issue', 'decision', 'target_date', 'owner', 'note', 'intake_suggestion', 'component_update')
);
