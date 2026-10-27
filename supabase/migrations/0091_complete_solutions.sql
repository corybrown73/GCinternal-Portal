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
-- reused rather than copied.
--
-- HISTORY IS NOT EDITABLE, AND CHANGES AND HISTORY COMMIT TOGETHER. solution_events
-- is append-only. Every change is made by one of the functions below, which write
-- the change and its history rows in the same transaction: if the history cannot
-- be written, the change is not kept either. A target date keeps its first value
-- (original_target_date); every move is an event with its reason. Nothing is
-- deleted: a solution or component no longer wanted is archived.
--
-- CONCURRENCY. Every update passes the version it was read at (the row's
-- updated_at). The function locks the row and refuses the change if the row has
-- changed since, so one person's newer edit is never silently overwritten.
--
-- PERMISSIONS, DECIDED IN THE DATABASE. solution_may_edit() is the one rule:
-- admin, super admin and manager may change any implementation's solutions. A
-- TIS (portal role implementation or onboarding, which both show as
-- "Implementation") may change the implementations whose owner is their team
-- member: implementations.owner_id is the formal assignment, set by the
-- assignment engine, a claim, or a reassignment. Technical contributors (se,
-- tam_se) never gain this through an assignment; their engineering ownership is
-- technical_solutions.owner_id, which this rule does not read. Every customer
-- login and every other internal user is refused. The functions are callable by
-- the service role only; the application checks the same rule again for a clear
-- message, but the database is the authority.
--
-- SCOPE. Rows belong to an implementation. Nothing here reads or writes a deal,
-- the purchase record on the deal intake, or the pre-sale record. A solution
-- may LINK to a purchase record item (purchased_service_id); the link is a
-- reference, the purchase record is not changed.
--
-- MIGRATION DEPENDENCIES. 0003 (technical_solutions, implementations), 0001/0005
-- (portal_profiles, portal_is_internal), 0010 (portal_profiles.team_member_id),
-- 0019 (orgs). Nothing else. Application code that uses these tables must not
-- deploy before this migration is applied to production (docs/MIGRATIONS.md).

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
  -- The purchase record item this solution is the delivery of, when one matches.
  -- A reference only: the purchase record on the deal is never changed here.
  purchased_service_id text check (purchased_service_id is null or length(purchased_service_id) <= 100),
  sow_quote text check (sow_quote is null or length(sow_quote) <= 2000),
  start_condition text check (start_condition is null or length(start_condition) <= 1000),
  estimate_weeks integer check (estimate_weeks is null or estimate_weeks between 1 and 520),
  priority text not null default 'deliver_during_implementation'
    check (priority in ('needed_for_go_live', 'deliver_during_implementation', 'planned_for_later')),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'waiting', 'complete')),
  readiness_confirmed text not null default 'not_ready'
    check (readiness_confirmed in ('not_ready', 'at_risk', 'ready')),
  readiness_confirmed_at timestamptz,
  readiness_confirmed_by uuid references public.portal_profiles (id) on delete set null,
  next_action text check (next_action is null or length(next_action) <= 1000),
  target_date date,
  original_target_date date,
  archived_at timestamptz,
  created_by uuid references public.portal_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index complete_solutions_impl_idx
  on public.complete_solutions (implementation_id) where archived_at is null;
-- One active solution per purchase record item on an implementation.
create unique index complete_solutions_purchase_link_idx
  on public.complete_solutions (implementation_id, purchased_service_id)
  where purchased_service_id is not null and archived_at is null;

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
  integration_type text check (integration_type in ('dispatch', 'dynamic_reference_data', 'system')),
  name text not null check (length(btrim(name)) between 1 and 200),
  status text not null default 'not_started' check (status in (
    'not_started', 'being_built', 'waiting', 'ready_for_testing', 'changes_needed', 'complete'
  )),
  priority text not null default 'deliver_during_implementation'
    check (priority in ('needed_for_go_live', 'deliver_during_implementation', 'planned_for_later')),
  target_date date,
  original_target_date date,
  target_change_reason text check (target_change_reason is null or length(target_change_reason) <= 500),
  start_condition text check (start_condition is null or length(start_condition) <= 1000),
  estimate_weeks integer check (estimate_weeks is null or estimate_weeks between 1 and 520),
  blocker text check (blocker is null or length(blocker) <= 1000),
  latest_update text check (latest_update is null or length(latest_update) <= 2000),
  latest_update_at timestamptz,
  next_action text check (next_action is null or length(next_action) <= 1000),
  technical_solution_id uuid references public.technical_solutions (id) on delete set null,
  sow_quote text check (sow_quote is null or length(sow_quote) <= 2000),
  form_built boolean not null default false,
  customer_approved boolean not null default false,
  submission_count integer check (submission_count is null or submission_count >= 0),
  submission_checked_on date,
  customer_usage_confirmed_on date,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by uuid references public.portal_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint solution_components_type_for_integrations_only
    check (category = 'integrations' or integration_type is null),
  constraint solution_components_form_fields_check check (
    category = 'forms'
    or (not form_built and not customer_approved and submission_count is null
        and submission_checked_on is null and customer_usage_confirmed_on is null)
  ),
  constraint solution_components_submission_pair_check
    check ((submission_count is null) = (submission_checked_on is null))
);
create index solution_components_solution_idx
  on public.solution_components (complete_solution_id);
create index solution_components_impl_idx
  on public.solution_components (implementation_id);

create trigger solution_components_touch before update on public.solution_components
  for each row execute function portal_touch_updated_at();

-- A component's solution must belong to the same implementation as the component,
-- and the original target date never changes once it is set.
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
  critical boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (component_id, depends_on_id),
  constraint solution_component_dependencies_not_self check (component_id <> depends_on_id)
);
create index solution_component_dependencies_on_idx
  on public.solution_component_dependencies (depends_on_id);

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
  -- No foreign key: history must outlive the person who made the change. A
  -- cascade would try to update an append-only row and refuse the delete.
  actor_profile_id uuid,
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
-- Row level security: internal users only. Customers never read these tables.
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

-- ---------------------------------------------------------------------------
-- Transcript proposals can suggest a change to one component, and remember the
-- version of the component the suggestion was made against.
-- ---------------------------------------------------------------------------
alter table public.evidence_proposals
  add column if not exists solution_component_id uuid
    references public.solution_components (id) on delete set null,
  add column if not exists component_field text
    check (component_field is null or component_field in (
      'status', 'priority', 'next_action', 'blocker', 'target_date', 'latest_update'
    )),
  add column if not exists component_value text,
  add column if not exists component_version timestamptz;

alter table public.evidence_proposals drop constraint if exists evidence_proposals_type_check;
alter table public.evidence_proposals add constraint evidence_proposals_type_check check (
  type in ('risk', 'issue', 'decision', 'target_date', 'owner', 'note', 'intake_suggestion', 'component_update')
);

-- ===========================================================================
-- Permissions and version checks
-- ===========================================================================

-- The one permission rule for these tables. Used by every function below.
-- Team Lead is a flag on the profile, separate from the broad manager role. It is
-- set only by an admin or super admin, signed in, never by the person themselves
-- (see portal_guard_team_lead below). Added first: the rule below reads it.
alter table public.portal_profiles
  add column if not exists team_lead boolean not null default false;

-- The one post-sale permission rule. Everything that changes an implementation's
-- post-sale work (solutions, components, delivery records, stage moves, gate
-- decisions, owner reassignment) asks this. It never reads pre-sale tables.
--
--   admin, super admin, manager ........ any implementation (existing authority)
--   Team Lead (portal_profiles.team_lead) any implementation, regardless of owner
--   implementation, onboarding ......... only implementations they own, where
--                                        implementations.owner_id is their team member
--
-- Technical contributors (se, tam_se) never gain delivery rights through an
-- assignment: technical_solutions.owner_id is not read here.
create or replace function public.post_sale_may_manage(p_profile uuid, p_implementation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
      select 1 from public.portal_profiles p
       where p.id = p_profile
         and (p.role::text in ('super_admin', 'admin', 'manager') or p.team_lead)
    )
    or exists (
      select 1
        from public.portal_profiles p
        join public.implementations i on i.id = p_implementation
       where p.id = p_profile
         and p.team_member_id is not null
         and i.owner_id = p.team_member_id
         and p.role::text in ('implementation', 'onboarding')
    );
$$;

-- Solution writes use the same rule.
create or replace function public.solution_may_edit(p_profile uuid, p_implementation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.post_sale_may_manage(p_profile, p_implementation);
$$;

create or replace function public.solution_require_edit(p_profile uuid, p_implementation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.solution_may_edit(p_profile, p_implementation) then
    raise exception
      'You can change the solutions of implementations you own. A manager or admin can change any of them.'
      using errcode = '42501';
  end if;
end $$;

-- An update must say which version it changes. The row's own updated_at is that
-- version; a different one means someone else has changed the row since.
create or replace function public.solution_check_version(p_expected timestamptz, p_actual timestamptz)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_expected is null then
    raise exception 'This change needs the version you are changing. Reload the page and try again.'
      using errcode = '22023';
  end if;
  if p_actual is distinct from p_expected then
    raise exception
      'This changed while you were looking at it. Reload to see the latest, then make the change again.'
      using errcode = 'P0409';
  end if;
end $$;

-- ===========================================================================
-- Solutions
-- ===========================================================================

create or replace function public.solution_create(
  p_profile uuid,
  p_implementation uuid,
  p_title text,
  p_scope text,
  p_priority text,
  p_start_condition text default null,
  p_estimate_weeks integer default null,
  p_sow_quote text default null,
  p_next_action text default null,
  p_source text default 'manual',
  p_target_date date default null,
  p_purchased_service_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.solution_require_edit(p_profile, p_implementation);
  perform 1 from public.implementations where id = p_implementation;
  if not found then
    raise exception 'That implementation no longer exists.' using errcode = '22023';
  end if;
  begin
    insert into public.complete_solutions (
      implementation_id, title, scope, source, priority, status, readiness_confirmed,
      start_condition, estimate_weeks, sow_quote, next_action, target_date, original_target_date,
      purchased_service_id, created_by
    ) values (
      p_implementation, p_title, p_scope, p_source, p_priority, 'not_started', 'not_ready',
      p_start_condition, p_estimate_weeks, p_sow_quote, p_next_action, p_target_date, p_target_date,
      p_purchased_service_id, p_profile
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'That purchase record item is already the delivery of a solution on this implementation.'
      using errcode = '22023';
  end;
  insert into public.solution_events (implementation_id, complete_solution_id, kind, to_value, actor_profile_id)
  values (p_implementation, v_id, 'created', p_title, p_profile);
  return v_id;
end $$;

-- Changes a solution's own fields. The patch carries only the keys being changed.
create or replace function public.solution_update(
  p_profile uuid,
  p_id uuid,
  p_expected timestamptz,
  p_patch jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.complete_solutions%rowtype;
  v_open text;
begin
  select * into r from public.complete_solutions where id = p_id for update;
  if not found then
    raise exception 'That solution no longer exists.' using errcode = '22023';
  end if;
  perform public.solution_require_edit(p_profile, r.implementation_id);
  perform public.solution_check_version(p_expected, r.updated_at);
  if r.archived_at is not null then
    raise exception 'This solution is archived. Restore it to change it.' using errcode = '22023';
  end if;

  if p_patch ->> 'status' = 'complete' and r.status <> 'complete' then
    select string_agg(c.name, ', ' order by c.sort_order, c.created_at) into v_open
      from public.solution_components c
     where c.complete_solution_id = p_id and c.archived_at is null and c.status <> 'complete';
    if v_open is not null then
      raise exception 'This solution cannot be marked complete yet. Still open: %.', v_open
        using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'title' and (p_patch ->> 'title') is distinct from r.title then
    update public.complete_solutions set title = p_patch ->> 'title' where id = p_id;
    insert into public.solution_events (implementation_id, complete_solution_id, kind, from_value, to_value, actor_profile_id)
    values (r.implementation_id, p_id, 'edited', r.title, p_patch ->> 'title', p_profile);
  end if;
  if p_patch ? 'scope' and (p_patch ->> 'scope') is distinct from r.scope then
    update public.complete_solutions set scope = p_patch ->> 'scope' where id = p_id;
    insert into public.solution_events (implementation_id, complete_solution_id, kind, from_value, to_value, actor_profile_id)
    values (r.implementation_id, p_id, 'edited', r.scope, p_patch ->> 'scope', p_profile);
  end if;
  if p_patch ? 'priority' and (p_patch ->> 'priority') is distinct from r.priority then
    update public.complete_solutions set priority = p_patch ->> 'priority' where id = p_id;
    insert into public.solution_events (implementation_id, complete_solution_id, kind, from_value, to_value, actor_profile_id)
    values (r.implementation_id, p_id, 'priority', r.priority, p_patch ->> 'priority', p_profile);
  end if;
  if p_patch ? 'status' and (p_patch ->> 'status') is distinct from r.status then
    update public.complete_solutions set status = p_patch ->> 'status' where id = p_id;
    insert into public.solution_events (implementation_id, complete_solution_id, kind, from_value, to_value, actor_profile_id)
    values (r.implementation_id, p_id, 'status', r.status, p_patch ->> 'status', p_profile);
  end if;
  if p_patch ? 'next_action' and (p_patch ->> 'next_action') is distinct from r.next_action then
    update public.complete_solutions set next_action = p_patch ->> 'next_action' where id = p_id;
    insert into public.solution_events (implementation_id, complete_solution_id, kind, from_value, to_value, actor_profile_id)
    values (r.implementation_id, p_id, 'edited', r.next_action, p_patch ->> 'next_action', p_profile);
  end if;
  if p_patch ? 'start_condition' and (p_patch ->> 'start_condition') is distinct from r.start_condition then
    update public.complete_solutions set start_condition = p_patch ->> 'start_condition' where id = p_id;
    insert into public.solution_events (implementation_id, complete_solution_id, kind, from_value, to_value, actor_profile_id)
    values (r.implementation_id, p_id, 'edited', r.start_condition, p_patch ->> 'start_condition', p_profile);
  end if;
end $$;

-- Sets the solution's delivery date. The first date is kept as the original; a
-- later move needs a reason, which is kept with the history row.
create or replace function public.solution_set_target(
  p_profile uuid,
  p_id uuid,
  p_expected timestamptz,
  p_target date,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.complete_solutions%rowtype;
begin
  select * into r from public.complete_solutions where id = p_id for update;
  if not found then
    raise exception 'That solution no longer exists.' using errcode = '22023';
  end if;
  perform public.solution_require_edit(p_profile, r.implementation_id);
  perform public.solution_check_version(p_expected, r.updated_at);
  if r.archived_at is not null then
    raise exception 'This solution is archived. Restore it to change it.' using errcode = '22023';
  end if;
  if p_target is not distinct from r.target_date then
    return;
  end if;
  if r.original_target_date is not null and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Say why the delivery date moves. The original date stays on record.' using errcode = '22023';
  end if;
  update public.complete_solutions
     set target_date = p_target,
         original_target_date = coalesce(original_target_date, p_target)
   where id = p_id;
  insert into public.solution_events (implementation_id, complete_solution_id, kind, from_value, to_value, reason, actor_profile_id)
  values (r.implementation_id, p_id, 'target_date', r.target_date::text, p_target::text,
          nullif(btrim(coalesce(p_reason, '')), ''), p_profile);
end $$;

-- The TIS confirms a readiness. Moving to or from Ready, or to At risk, needs a reason.
create or replace function public.solution_confirm_readiness(
  p_profile uuid,
  p_id uuid,
  p_expected timestamptz,
  p_readiness text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.complete_solutions%rowtype;
begin
  select * into r from public.complete_solutions where id = p_id for update;
  if not found then
    raise exception 'That solution no longer exists.' using errcode = '22023';
  end if;
  perform public.solution_require_edit(p_profile, r.implementation_id);
  perform public.solution_check_version(p_expected, r.updated_at);
  if r.archived_at is not null then
    raise exception 'This solution is archived. Restore it to change it.' using errcode = '22023';
  end if;
  if p_readiness is not distinct from r.readiness_confirmed then
    return;
  end if;
  if (r.readiness_confirmed = 'ready' or p_readiness in ('ready', 'at_risk'))
     and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Say why readiness changes. A reason is kept with the change.' using errcode = '22023';
  end if;
  update public.complete_solutions
     set readiness_confirmed = p_readiness,
         readiness_confirmed_at = now(),
         readiness_confirmed_by = p_profile
   where id = p_id;
  insert into public.solution_events (implementation_id, complete_solution_id, kind, from_value, to_value, reason, actor_profile_id)
  values (r.implementation_id, p_id, 'readiness_confirmed', r.readiness_confirmed, p_readiness,
          nullif(btrim(coalesce(p_reason, '')), ''), p_profile);
end $$;

create or replace function public.solution_set_archived(
  p_profile uuid,
  p_id uuid,
  p_expected timestamptz,
  p_archived boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.complete_solutions%rowtype;
begin
  select * into r from public.complete_solutions where id = p_id for update;
  if not found then
    raise exception 'That solution no longer exists.' using errcode = '22023';
  end if;
  perform public.solution_require_edit(p_profile, r.implementation_id);
  perform public.solution_check_version(p_expected, r.updated_at);
  if (r.archived_at is not null) = p_archived then
    return;
  end if;
  update public.complete_solutions
     set archived_at = case when p_archived then now() else null end
   where id = p_id;
  insert into public.solution_events (implementation_id, complete_solution_id, kind, reason, actor_profile_id)
  values (r.implementation_id, p_id, case when p_archived then 'archived' else 'restored' end,
          nullif(btrim(coalesce(p_reason, '')), ''), p_profile);
end $$;

-- ===========================================================================
-- Components
-- ===========================================================================

create or replace function public.component_create(
  p_profile uuid,
  p_solution uuid,
  p_category text,
  p_integration_type text,
  p_name text,
  p_priority text,
  p_target_date date default null,
  p_start_condition text default null,
  p_estimate_weeks integer default null,
  p_next_action text default null,
  p_sow_quote text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.complete_solutions%rowtype;
  v_id uuid;
begin
  select * into s from public.complete_solutions where id = p_solution for update;
  if not found then
    raise exception 'That solution no longer exists.' using errcode = '22023';
  end if;
  perform public.solution_require_edit(p_profile, s.implementation_id);
  if s.archived_at is not null then
    raise exception 'This solution is archived. Restore it to change it.' using errcode = '22023';
  end if;
  insert into public.solution_components (
    implementation_id, complete_solution_id, category, integration_type, name, status, priority,
    target_date, original_target_date, start_condition, estimate_weeks, next_action, sow_quote,
    form_built, customer_approved, sort_order, created_by
  ) values (
    s.implementation_id, p_solution, p_category,
    case when p_category = 'integrations' then p_integration_type else null end,
    p_name, 'not_started', p_priority, p_target_date, p_target_date, p_start_condition,
    p_estimate_weeks, p_next_action, p_sow_quote, false, false, 0, p_profile
  )
  returning id into v_id;
  insert into public.solution_events (implementation_id, complete_solution_id, component_id, kind, to_value, actor_profile_id)
  values (s.implementation_id, p_solution, v_id, 'created', p_name, p_profile);
  return v_id;
end $$;

-- Changes one component. A Waiting component must say what it is waiting on; a
-- Changes Needed one must say what needs changing. A date that moves an original
-- needs a reason.
create or replace function public.component_update(
  p_profile uuid,
  p_id uuid,
  p_expected timestamptz,
  p_patch jsonb,
  p_target_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.solution_components%rowtype;
  s public.complete_solutions%rowtype;
  v_status text;
  v_blocker text;
  v_latest text;
begin
  select * into c from public.solution_components where id = p_id for update;
  if not found then
    raise exception 'That component no longer exists.' using errcode = '22023';
  end if;
  select * into s from public.complete_solutions where id = c.complete_solution_id;
  perform public.solution_require_edit(p_profile, c.implementation_id);
  perform public.solution_check_version(p_expected, c.updated_at);
  if s.archived_at is not null then
    raise exception 'This solution is archived. Restore it to change it.' using errcode = '22023';
  end if;
  if c.archived_at is not null then
    raise exception 'This component is archived. Restore it to change it.' using errcode = '22023';
  end if;

  v_status := coalesce(p_patch ->> 'status', c.status);
  v_blocker := case when p_patch ? 'blocker' then p_patch ->> 'blocker' else c.blocker end;
  v_latest := case when p_patch ? 'latest_update' then p_patch ->> 'latest_update' else c.latest_update end;
  if v_status = 'waiting' and nullif(btrim(coalesce(v_blocker, '')), '') is null then
    raise exception 'Record what it is waiting on before marking it Waiting.' using errcode = '22023';
  end if;
  if v_status = 'changes_needed' and nullif(btrim(coalesce(v_latest, '')), '') is null then
    raise exception 'Say what needs changing before marking it Changes Needed.' using errcode = '22023';
  end if;

  if p_patch ? 'name' and (p_patch ->> 'name') is distinct from c.name then
    update public.solution_components set name = p_patch ->> 'name' where id = p_id;
    insert into public.solution_events (implementation_id, complete_solution_id, component_id, kind, from_value, to_value, actor_profile_id)
    values (c.implementation_id, c.complete_solution_id, p_id, 'edited', c.name, p_patch ->> 'name', p_profile);
  end if;
  if p_patch ? 'priority' and (p_patch ->> 'priority') is distinct from c.priority then
    update public.solution_components set priority = p_patch ->> 'priority' where id = p_id;
    insert into public.solution_events (implementation_id, complete_solution_id, component_id, kind, from_value, to_value, actor_profile_id)
    values (c.implementation_id, c.complete_solution_id, p_id, 'priority', c.priority, p_patch ->> 'priority', p_profile);
  end if;
  if v_status is distinct from c.status then
    update public.solution_components set status = v_status where id = p_id;
    insert into public.solution_events (implementation_id, complete_solution_id, component_id, kind, from_value, to_value, actor_profile_id)
    values (c.implementation_id, c.complete_solution_id, p_id, 'status', c.status, v_status, p_profile);
  end if;
  if v_blocker is distinct from c.blocker then
    update public.solution_components set blocker = v_blocker where id = p_id;
    insert into public.solution_events (implementation_id, complete_solution_id, component_id, kind, from_value, to_value, actor_profile_id)
    values (c.implementation_id, c.complete_solution_id, p_id, 'edited', c.blocker, v_blocker, p_profile);
  end if;
  if v_latest is distinct from c.latest_update then
    update public.solution_components
       set latest_update = v_latest, latest_update_at = now()
     where id = p_id;
    insert into public.solution_events (implementation_id, complete_solution_id, component_id, kind, from_value, to_value, actor_profile_id)
    values (c.implementation_id, c.complete_solution_id, p_id, 'edited', c.latest_update, v_latest, p_profile);
  end if;
  if p_patch ? 'next_action' and (p_patch ->> 'next_action') is distinct from c.next_action then
    update public.solution_components set next_action = p_patch ->> 'next_action' where id = p_id;
    insert into public.solution_events (implementation_id, complete_solution_id, component_id, kind, from_value, to_value, actor_profile_id)
    values (c.implementation_id, c.complete_solution_id, p_id, 'edited', c.next_action, p_patch ->> 'next_action', p_profile);
  end if;
  if p_patch ? 'target_date' and (p_patch ->> 'target_date')::date is distinct from c.target_date then
    if c.original_target_date is not null and nullif(btrim(coalesce(p_target_reason, '')), '') is null then
      raise exception 'Say why the target date moves. The original date stays on record.' using errcode = '22023';
    end if;
    update public.solution_components
       set target_date = (p_patch ->> 'target_date')::date,
           target_change_reason = case when c.original_target_date is null then null
                                       else nullif(btrim(coalesce(p_target_reason, '')), '') end
     where id = p_id;
    insert into public.solution_events (implementation_id, complete_solution_id, component_id, kind, from_value, to_value, reason, actor_profile_id)
    values (c.implementation_id, c.complete_solution_id, p_id, 'target_date',
            c.target_date::text, (p_patch ->> 'target_date'), nullif(btrim(coalesce(p_target_reason, '')), ''), p_profile);
  end if;
end $$;

-- Form tracking. Built, customer approved, submissions with the date checked, and
-- customer usage confirmed on its own date. A count never sets usage.
create or replace function public.component_form_update(
  p_profile uuid,
  p_id uuid,
  p_expected timestamptz,
  p_patch jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.solution_components%rowtype;
  v_count integer;
  v_checked date;
begin
  select * into c from public.solution_components where id = p_id for update;
  if not found then
    raise exception 'That component no longer exists.' using errcode = '22023';
  end if;
  perform public.solution_require_edit(p_profile, c.implementation_id);
  perform public.solution_check_version(p_expected, c.updated_at);
  if c.archived_at is not null then
    raise exception 'This component is archived. Restore it to change it.' using errcode = '22023';
  end if;
  if c.category <> 'forms' then
    raise exception 'Form tracking applies to a form component only.' using errcode = '22023';
  end if;

  if p_patch ? 'form_built' and (p_patch ->> 'form_built')::boolean is distinct from c.form_built then
    update public.solution_components set form_built = (p_patch ->> 'form_built')::boolean where id = p_id;
    insert into public.solution_events (implementation_id, complete_solution_id, component_id, kind, from_value, to_value, actor_profile_id)
    values (c.implementation_id, c.complete_solution_id, p_id, 'form_built', c.form_built::text, p_patch ->> 'form_built', p_profile);
  end if;
  if p_patch ? 'customer_approved' and (p_patch ->> 'customer_approved')::boolean is distinct from c.customer_approved then
    update public.solution_components set customer_approved = (p_patch ->> 'customer_approved')::boolean where id = p_id;
    insert into public.solution_events (implementation_id, complete_solution_id, component_id, kind, from_value, to_value, actor_profile_id)
    values (c.implementation_id, c.complete_solution_id, p_id, 'customer_approved', c.customer_approved::text, p_patch ->> 'customer_approved', p_profile);
  end if;
  if p_patch ? 'submission_count' then
    v_count := (p_patch ->> 'submission_count')::integer;
    v_checked := case when v_count is null then null else (p_patch ->> 'submission_checked_on')::date end;
    if v_count is not null and v_checked is null then
      raise exception 'Enter the date the count was checked.' using errcode = '22023';
    end if;
    if v_count is distinct from c.submission_count or v_checked is distinct from c.submission_checked_on then
      update public.solution_components
         set submission_count = v_count, submission_checked_on = v_checked
       where id = p_id;
      insert into public.solution_events (implementation_id, complete_solution_id, component_id, kind, from_value, to_value, actor_profile_id)
      values (c.implementation_id, c.complete_solution_id, p_id, 'submission_count',
              case when c.submission_count is null then null else c.submission_count || ' on ' || c.submission_checked_on end,
              case when v_count is null then null else v_count || ' on ' || v_checked end,
              p_profile);
    end if;
  end if;
  if p_patch ? 'usage_confirmed_on' and (p_patch ->> 'usage_confirmed_on')::date is distinct from c.customer_usage_confirmed_on then
    update public.solution_components
       set customer_usage_confirmed_on = (p_patch ->> 'usage_confirmed_on')::date
     where id = p_id;
    insert into public.solution_events (implementation_id, complete_solution_id, component_id, kind, from_value, to_value, actor_profile_id)
    values (c.implementation_id, c.complete_solution_id, p_id, 'usage_confirmed',
            c.customer_usage_confirmed_on::text, p_patch ->> 'usage_confirmed_on', p_profile);
  end if;
end $$;

create or replace function public.component_set_archived(
  p_profile uuid,
  p_id uuid,
  p_expected timestamptz,
  p_archived boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.solution_components%rowtype;
begin
  select * into c from public.solution_components where id = p_id for update;
  if not found then
    raise exception 'That component no longer exists.' using errcode = '22023';
  end if;
  perform public.solution_require_edit(p_profile, c.implementation_id);
  perform public.solution_check_version(p_expected, c.updated_at);
  if (c.archived_at is not null) = p_archived then
    return;
  end if;
  update public.solution_components
     set archived_at = case when p_archived then now() else null end
   where id = p_id;
  insert into public.solution_events (implementation_id, complete_solution_id, component_id, kind, reason, actor_profile_id)
  values (c.implementation_id, c.complete_solution_id, p_id, case when p_archived then 'archived' else 'restored' end,
          nullif(btrim(coalesce(p_reason, '')), ''), p_profile);
end $$;

-- ===========================================================================
-- Dependencies
-- ===========================================================================

-- Makes one component depend on another in the same implementation. Dependency
-- changes on an implementation are serialised, so two people cannot each add a
-- link that closes a loop at the same moment.
create or replace function public.dependency_add(
  p_profile uuid,
  p_component uuid,
  p_depends_on uuid,
  p_critical boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.solution_components%rowtype;
  b public.solution_components%rowtype;
  v_loop boolean;
begin
  if p_component = p_depends_on then
    raise exception 'A component cannot depend on itself.' using errcode = '22023';
  end if;
  select * into a from public.solution_components where id = p_component;
  if not found then
    raise exception 'That component no longer exists.' using errcode = '22023';
  end if;
  select * into b from public.solution_components where id = p_depends_on;
  if not found then
    raise exception 'That component no longer exists.' using errcode = '22023';
  end if;
  if a.implementation_id <> b.implementation_id then
    raise exception 'A dependency must stay within one implementation.' using errcode = '22023';
  end if;
  perform public.solution_require_edit(p_profile, a.implementation_id);
  if a.archived_at is not null or b.archived_at is not null then
    raise exception 'An archived component cannot take a dependency. Restore it first.' using errcode = '22023';
  end if;

  perform 1 from public.complete_solutions where implementation_id = a.implementation_id for update;

  with recursive reach(id) as (
    select d.depends_on_id from public.solution_component_dependencies d where d.component_id = p_depends_on
    union
    select d.depends_on_id from public.solution_component_dependencies d join reach r on d.component_id = r.id
  )
  select exists (select 1 from reach where id = p_component) into v_loop;
  if v_loop then
    raise exception 'That dependency would make the components depend on each other in a loop.' using errcode = '22023';
  end if;

  begin
    insert into public.solution_component_dependencies (component_id, depends_on_id, critical)
    values (p_component, p_depends_on, p_critical);
  exception when unique_violation then
    raise exception 'That dependency is already recorded.' using errcode = '22023';
  end;
  insert into public.solution_events (implementation_id, complete_solution_id, component_id, kind, to_value, actor_profile_id)
  values (a.implementation_id, a.complete_solution_id, p_component, 'dependency_added',
          b.name || case when p_critical then ' (critical)' else '' end, p_profile);
end $$;

create or replace function public.dependency_remove(
  p_profile uuid,
  p_component uuid,
  p_depends_on uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.solution_components%rowtype;
  b public.solution_components%rowtype;
begin
  select * into a from public.solution_components where id = p_component;
  if not found then
    raise exception 'That component no longer exists.' using errcode = '22023';
  end if;
  perform public.solution_require_edit(p_profile, a.implementation_id);
  perform 1 from public.complete_solutions where implementation_id = a.implementation_id for update;
  select * into b from public.solution_components where id = p_depends_on;
  delete from public.solution_component_dependencies
   where component_id = p_component and depends_on_id = p_depends_on;
  if not found then
    raise exception 'That dependency is no longer recorded.' using errcode = '22023';
  end if;
  insert into public.solution_events (implementation_id, complete_solution_id, component_id, kind, from_value, actor_profile_id)
  values (a.implementation_id, a.complete_solution_id, p_component, 'dependency_removed', b.name, p_profile);
end $$;

-- ===========================================================================
-- Saving a reviewed SOW set: all or nothing.
-- ===========================================================================

-- Records a reviewed set in one transaction. A solution whose name already belongs
-- to an active solution on the implementation is skipped. A loop in the dependencies
-- of any solution refuses the whole set, so nothing half-saved is left behind.
create or replace function public.solution_save_reviewed_set(
  p_profile uuid,
  p_implementation uuid,
  p_sow_name text,
  p_solutions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s jsonb;
  c jsonb;
  v_dep text;
  v_title text;
  v_solution uuid;
  v_component uuid;
  v_ids jsonb;
  v_loop boolean;
  v_components integer;
  v_dependencies integer;
  v_created jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
begin
  perform public.solution_require_edit(p_profile, p_implementation);
  perform 1 from public.implementations where id = p_implementation;
  if not found then
    raise exception 'That implementation no longer exists.' using errcode = '22023';
  end if;
  -- Saves for one implementation run one at a time.
  perform 1 from public.complete_solutions where implementation_id = p_implementation for update;

  for s in select value from jsonb_array_elements(coalesce(p_solutions, '[]'::jsonb)) loop
    v_title := btrim(s ->> 'title');
    if exists (
      select 1 from public.complete_solutions
       where implementation_id = p_implementation and archived_at is null
         and lower(btrim(title)) = lower(v_title)
    ) then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'title', v_title,
        'reason', 'A solution with this name already exists on the implementation.'));
      continue;
    end if;
    -- One active solution per purchase record item: a second is skipped, not saved.
    if s ->> 'purchasedServiceId' is not null and exists (
      select 1 from public.complete_solutions
       where implementation_id = p_implementation and archived_at is null
         and purchased_service_id = s ->> 'purchasedServiceId'
    ) then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'title', v_title,
        'reason', 'Its purchase record item already has a solution on this implementation.'));
      continue;
    end if;

    insert into public.complete_solutions (
      implementation_id, title, scope, source, priority, status, readiness_confirmed,
      start_condition, estimate_weeks, sow_quote, target_date, original_target_date,
      purchased_service_id, created_by
    ) values (
      p_implementation, v_title, s ->> 'scope', 'sow', s ->> 'priority', 'not_started', 'not_ready',
      s ->> 'startCondition', (s ->> 'estimateWeeks')::integer, s ->> 'sowQuote',
      (s ->> 'suggestedTarget')::date, (s ->> 'suggestedTarget')::date,
      s ->> 'purchasedServiceId', p_profile
    )
    returning id into v_solution;
    insert into public.solution_events (implementation_id, complete_solution_id, kind, to_value, actor_profile_id)
    values (p_implementation, v_solution, 'created', v_title, p_profile);

    -- Components first, so every dependency can name them.
    v_ids := '{}'::jsonb;
    v_components := 0;
    for c in select value from jsonb_array_elements(coalesce(s -> 'components', '[]'::jsonb)) loop
      insert into public.solution_components (
        implementation_id, complete_solution_id, category, integration_type, name, status, priority,
        target_date, original_target_date, start_condition, estimate_weeks, sow_quote,
        form_built, customer_approved, sort_order, created_by
      ) values (
        p_implementation, v_solution, c ->> 'category',
        case when c ->> 'category' = 'integrations' then c ->> 'integrationType' else null end,
        btrim(c ->> 'name'), 'not_started', c ->> 'priority',
        (c ->> 'suggestedTarget')::date, (c ->> 'suggestedTarget')::date,
        c ->> 'startCondition', (c ->> 'estimateWeeks')::integer, c ->> 'sowQuote',
        false, false, 0, p_profile
      )
      returning id into v_component;
      v_ids := v_ids || jsonb_build_object(lower(btrim(c ->> 'name')), v_component::text);
      insert into public.solution_events (implementation_id, complete_solution_id, component_id, kind, to_value, actor_profile_id)
      values (p_implementation, v_solution, v_component, 'created', btrim(c ->> 'name'), p_profile);
      v_components := v_components + 1;
    end loop;

    -- Dependencies name components of this same solution. A name the set does
    -- not contain is ignored here, and the application reports it before saving.
    v_dependencies := 0;
    for c in select value from jsonb_array_elements(coalesce(s -> 'components', '[]'::jsonb)) loop
      for v_dep in select value from jsonb_array_elements_text(coalesce(c -> 'dependsOn', '[]'::jsonb)) loop
        if lower(btrim(v_dep)) = lower(btrim(c ->> 'name')) or not (v_ids ? lower(btrim(v_dep))) then
          continue;
        end if;
        insert into public.solution_component_dependencies (component_id, depends_on_id, critical)
        values ((v_ids ->> lower(btrim(c ->> 'name')))::uuid, (v_ids ->> lower(btrim(v_dep)))::uuid,
                coalesce((c ->> 'critical')::boolean, false))
        on conflict do nothing;
        v_dependencies := v_dependencies + 1;
      end loop;
    end loop;

    -- A loop among this solution's components refuses the whole set.
    with recursive walk(start_id, cur_id) as (
      select d.component_id, d.depends_on_id
        from public.solution_component_dependencies d
        join public.solution_components sc on sc.id = d.component_id
       where sc.complete_solution_id = v_solution
      union
      select w.start_id, d.depends_on_id
        from walk w
        join public.solution_component_dependencies d on d.component_id = w.cur_id
    )
    select exists (select 1 from walk where start_id = cur_id) into v_loop;
    if v_loop then
      raise exception 'The dependencies in "%" would make components depend on each other in a loop. Nothing was saved.', v_title
        using errcode = '22023';
    end if;

    insert into public.solution_events (implementation_id, complete_solution_id, kind, to_value, actor_profile_id)
    values (p_implementation, v_solution, 'sow_import', coalesce(p_sow_name, 'Signed SOW'), p_profile);

    v_created := v_created || jsonb_build_array(jsonb_build_object(
      'title', v_title, 'components', v_components, 'dependencies', v_dependencies));
  end loop;

  return jsonb_build_object('created', v_created, 'skipped', v_skipped);
end $$;

-- ===========================================================================
-- Team Lead authority, owner reassignment and the owner-conflict report.
-- ===========================================================================

-- Team Lead is a flag on the profile, separate from the broad manager role. Only
-- an admin or super admin, signed in, may set it, and nobody may set their own.
-- A service-role call (auth.uid() is null) cannot grant it: that is deliberate.
create or replace function public.portal_guard_team_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_role text;
begin
  if new.team_lead is not distinct from old.team_lead then
    return new;
  end if;
  if v_caller is null then
    raise exception 'Team Lead authority is granted by a signed-in admin, not by a system process'
      using errcode = '42501';
  end if;
  if v_caller = new.id then
    raise exception 'Nobody can change their own Team Lead authority' using errcode = '42501';
  end if;
  select p.role::text into v_role from public.portal_profiles p where p.id = v_caller;
  if v_role is distinct from 'admin' and v_role is distinct from 'super_admin' then
    raise exception 'Only an admin or super admin can grant or remove Team Lead authority'
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger portal_profiles_team_lead_guard
  before update on public.portal_profiles
  for each row execute function public.portal_guard_team_lead();

-- Every owner change, append-only. The implementation's owner_id is the authority;
-- this is the record of how it came to be that person.
create table public.implementation_owner_changes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.orgs (id),
  implementation_id uuid not null references public.implementations (id) on delete restrict,
  -- No foreign keys on the people here: history must outlive them (see solution_events).
  from_team_member_id uuid,
  to_team_member_id uuid,
  -- Why a person moved it. Required on every manual change; "other" needs words.
  reason_code text check (reason_code in ('tis_leave', 'workload', 'customer_escalation', 'coverage', 'other')),
  reason text check (reason is null or length(reason) <= 1000),
  -- manual: a person through implementation_set_owner, with a reason.
  -- system: any other write to owner_id (assignment engine, claim, Closed Won,
  -- Salesforce sync). No human explanation is invented for these.
  source text not null default 'system' check (source in ('manual', 'system')),
  actor_profile_id uuid,
  created_at timestamptz not null default now(),
  constraint implementation_owner_changes_manual_has_reason
    check (source <> 'manual' or reason_code is not null),
  constraint implementation_owner_changes_other_has_words
    check (reason_code <> 'other' or length(btrim(coalesce(reason, ''))) > 0)
);
create index implementation_owner_changes_impl_idx
  on public.implementation_owner_changes (implementation_id, created_at);

create or replace function public.implementation_owner_changes_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'implementation_owner_changes is a record: rows are never % (id %)', lower(tg_op), old.id;
end $$;

-- Every owner_id change is recorded, including the ones the assignment engine,
-- a claim, the Closed Won start and the Salesforce sync make without a person's
-- reason. implementation_set_owner sets a flag for its own transaction so the
-- change is recorded once, with its reason, not twice.
create or replace function public.implementation_owner_record_direct()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.owner_id is not null then
      insert into public.implementation_owner_changes
        (implementation_id, from_team_member_id, to_team_member_id, source)
      values (new.id, null, new.owner_id, 'system');
    end if;
    return new;
  end if;
  if old.owner_id is distinct from new.owner_id
     and coalesce(current_setting('app.owner_change_recorded', true), '') <> 'yes' then
    insert into public.implementation_owner_changes
      (implementation_id, from_team_member_id, to_team_member_id, source)
    values (new.id, old.owner_id, new.owner_id, 'system');
  end if;
  return new;
end $$;

create trigger implementations_owner_record_insert
  after insert on public.implementations
  for each row execute function public.implementation_owner_record_direct();
create trigger implementations_owner_record_update
  after update of owner_id on public.implementations
  for each row execute function public.implementation_owner_record_direct();

create trigger implementation_owner_changes_no_update
  before update on public.implementation_owner_changes
  for each row execute function public.implementation_owner_changes_append_only();
create trigger implementation_owner_changes_no_delete
  before delete on public.implementation_owner_changes
  for each row execute function public.implementation_owner_changes_append_only();

alter table public.implementation_owner_changes enable row level security;
create policy "implementation_owner_changes internal" on public.implementation_owner_changes
  for select to authenticated using (portal_is_internal());

-- Reassigns an implementation's owner. Team Lead, manager, admin or super admin
-- only: an assigned TIS may not hand their own implementation to someone else
-- through this path. The change is recorded with who made it, from whom and when.
-- Reassigns an implementation's owner. Team Lead, manager, admin or super admin
-- only: an assigned TIS may not hand their own implementation to someone else
-- through this path. Every manual change needs a reason code; "other" needs words.
-- The change is recorded with who made it, from whom, to whom and why.
drop function if exists public.implementation_set_owner(uuid, uuid, uuid, text, text);
create or replace function public.implementation_set_owner(
  p_profile uuid,
  p_implementation uuid,
  p_team_member uuid,
  p_reason_code text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not exists (
    select 1 from public.portal_profiles p
     where p.id = p_profile
       and (p.role::text in ('super_admin', 'admin', 'manager') or p.team_lead)
  ) then
    raise exception 'Only a Team Lead, a manager or an admin can reassign an implementation'
      using errcode = '42501';
  end if;
  if p_reason_code is null or p_reason_code not in ('tis_leave', 'workload', 'customer_escalation', 'coverage', 'other') then
    raise exception 'Choose why the implementation is being reassigned.' using errcode = '22023';
  end if;
  if p_reason_code = 'other' and v_reason is null then
    raise exception 'Say why, in a few words, when the reason is Other.' using errcode = '22023';
  end if;
  if length(coalesce(v_reason, '')) > 500 then
    raise exception 'Keep the reason to 500 characters.' using errcode = '22023';
  end if;
  select owner_id into v_current from public.implementations where id = p_implementation for update;
  if not found then
    raise exception 'That implementation no longer exists.' using errcode = '22023';
  end if;
  if p_team_member is not null and not exists (
    select 1 from public.team_members where id = p_team_member and active
  ) then
    raise exception 'That team member is not active.' using errcode = '22023';
  end if;
  if v_current is not distinct from p_team_member then
    return;
  end if;
  -- This change is recorded below, once, with its reason; the direct-write trigger stands aside.
  perform set_config('app.owner_change_recorded', 'yes', true);
  update public.implementations set owner_id = p_team_member where id = p_implementation;
  -- The flag lasts for the whole transaction, so it is cleared straight after the write.
  perform set_config('app.owner_change_recorded', 'no', true);
  insert into public.implementation_owner_changes
    (implementation_id, from_team_member_id, to_team_member_id, reason_code, reason, source, actor_profile_id)
  values (p_implementation, v_current, p_team_member, p_reason_code, v_reason, 'manual', p_profile);
end $$;

-- Where the journey's implementation_manager role assignment and the owner disagree.
-- Read only. Neither side is changed: owner_id stays authoritative, and the role
-- assignment stays as the record of what the template set. An admin resolves each
-- row by reassigning the owner, which leaves its history in place.
create view public.implementation_owner_conflicts as
select i.id as implementation_id,
       i.owner_id as owner_team_member_id,
       r.team_member_id as role_team_member_id
  from public.implementations i
  join public.implementation_role_assignments r
    on r.implementation_id = i.id
   and r.role_key = 'implementation_manager'
   and r.team_member_id is not null
 where i.owner_id is distinct from r.team_member_id;

-- ===========================================================================
-- Who may call the functions: the service role, which the application uses
-- after its own sign-in and role checks. Never a customer or anonymous caller.
-- ===========================================================================
revoke all on function public.solution_may_edit(uuid, uuid) from public, anon, authenticated;
revoke all on function public.solution_require_edit(uuid, uuid) from public, anon, authenticated;
revoke all on function public.solution_check_version(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.solution_create(uuid, uuid, text, text, text, text, integer, text, text, text, date, text) from public, anon, authenticated;
revoke all on function public.solution_update(uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.solution_set_target(uuid, uuid, timestamptz, date, text) from public, anon, authenticated;
revoke all on function public.solution_confirm_readiness(uuid, uuid, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.solution_set_archived(uuid, uuid, timestamptz, boolean, text) from public, anon, authenticated;
revoke all on function public.component_create(uuid, uuid, text, text, text, text, date, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.component_update(uuid, uuid, timestamptz, jsonb, text) from public, anon, authenticated;
revoke all on function public.component_form_update(uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.component_set_archived(uuid, uuid, timestamptz, boolean, text) from public, anon, authenticated;
revoke all on function public.dependency_add(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.dependency_remove(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.solution_save_reviewed_set(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.solution_may_edit(uuid, uuid) to service_role;
grant execute on function public.solution_require_edit(uuid, uuid) to service_role;
grant execute on function public.solution_check_version(timestamptz, timestamptz) to service_role;
grant execute on function public.solution_create(uuid, uuid, text, text, text, text, integer, text, text, text, date, text) to service_role;
grant execute on function public.solution_update(uuid, uuid, timestamptz, jsonb) to service_role;
grant execute on function public.solution_set_target(uuid, uuid, timestamptz, date, text) to service_role;
grant execute on function public.solution_confirm_readiness(uuid, uuid, timestamptz, text, text) to service_role;
grant execute on function public.solution_set_archived(uuid, uuid, timestamptz, boolean, text) to service_role;
grant execute on function public.component_create(uuid, uuid, text, text, text, text, date, text, integer, text, text) to service_role;
grant execute on function public.component_update(uuid, uuid, timestamptz, jsonb, text) to service_role;
grant execute on function public.component_form_update(uuid, uuid, timestamptz, jsonb) to service_role;
grant execute on function public.component_set_archived(uuid, uuid, timestamptz, boolean, text) to service_role;
grant execute on function public.dependency_add(uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.dependency_remove(uuid, uuid, uuid) to service_role;
grant execute on function public.solution_save_reviewed_set(uuid, uuid, text, jsonb) to service_role;
revoke all on function public.post_sale_may_manage(uuid, uuid) from public, anon, authenticated;
grant execute on function public.post_sale_may_manage(uuid, uuid) to service_role;
revoke all on function public.implementation_set_owner(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.implementation_set_owner(uuid, uuid, uuid, text, text) to service_role;
revoke all on public.implementation_owner_conflicts from public, anon, authenticated;
grant select on public.implementation_owner_conflicts to service_role;
