-- 0013 — Journey templates: the definition side of the lifecycle.
--
-- A template VERSION is a row; a template FAMILY is a key. Publishing v2
-- INSERTS a new row and leaves v1 untouched, because live implementations pin
-- the exact version row by FK — an implementation's plan must never change
-- under it because someone edited a template.
--
-- Task identity is `task_key` (a string), not a uuid: template rows are copied
-- on every republish, so uuids would have to be rewritten per copy and drift
-- matching ("is v2's task X the same as v1's?") would be impossible. Keys are
-- the identity; uuids are storage. Keys resolve to concrete uuids at
-- instantiation, where ids are stable.
--
-- Creation order below is FK order — journey_stage_blocks before
-- journey_template_stages, which references it.
--
-- Ships dark: both feature flags default false.
-- Rollback: supabase/down/0013_down.sql (drops only tables this file created).

-- ---------------------------------------------------------------------------
-- Roles a template can assign work to
-- ---------------------------------------------------------------------------
create table journey_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  key text not null,
  name text not null,
  party text not null default 'internal' check (party in ('internal', 'customer', 'partner')),
  description text,
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

-- ---------------------------------------------------------------------------
-- Reusable stage blocks (editor-only artifacts, hence jsonb: never queried
-- relationally — inserting a block copies its contents into real rows)
-- ---------------------------------------------------------------------------
create table journey_stage_blocks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  key text not null,
  name text not null,
  description text,
  stage_definition jsonb not null,
  tasks jsonb not null default '[]',
  created_by uuid references portal_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------
create table journey_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  key text not null,
  version int not null default 1,
  name text not null,
  journey_type text not null check (journey_type in
    ('new_logo', 'add_on', 'integration', 'data_migration', 'rollout', 'recovery')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  supersedes_id uuid references journey_templates (id),
  superseded_by_id uuid references journey_templates (id),
  description text,
  -- Salesforce auto-selection rules. Unused until Phase 5 reads it.
  default_for jsonb,
  version_note text,
  published_at timestamptz,
  created_by uuid references portal_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key, version)
);

-- Exactly one live version per family.
create unique index journey_templates_current_idx
  on journey_templates (org_id, key)
  where status = 'published' and superseded_by_id is null;

create table journey_template_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  template_id uuid not null references journey_templates (id) on delete cascade,
  position int not null,
  -- For the 'new-logo' family these ARE the lifecycle.ts stage ids.
  stage_key text not null,
  name text not null,
  phase text not null default 'delivery'
    check (phase in ('intake', 'delivery', 'value', 'steady_state')),
  purpose text,
  target_duration_days int,
  entry_criteria jsonb not null default '[]',
  exit_criteria jsonb not null default '[]',
  gate_mode text not null default 'advisory'
    check (gate_mode in ('advisory', 'warn', 'blocking')),
  required_artifacts text[] not null default '{}',
  source_block_id uuid references journey_stage_blocks (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (template_id, stage_key),
  -- Deferred so a drag-reorder can renumber in one statement.
  constraint journey_template_stages_position_key
    unique (template_id, position) deferrable initially deferred
);

create table journey_template_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  template_id uuid not null references journey_templates (id) on delete cascade,
  template_stage_id uuid not null references journey_template_stages (id) on delete cascade,
  position int not null,
  -- Stable identity ACROSS versions; drives drift matching.
  task_key text not null,
  title text not null,
  description text,
  role_key text not null default 'implementation_manager',
  party text not null default 'internal' check (party in ('internal', 'customer', 'partner')),
  visibility text not null default 'internal' check (visibility in ('internal', 'shared')),
  offset_basis text not null default 'stage_entry'
    check (offset_basis in ('project_start', 'stage_entry', 'target_launch')),
  -- Negative allowed, e.g. "T-14".
  offset_days int not null default 0,
  duration_days int not null default 1,
  is_optional boolean not null default false,
  -- null = always included; otherwise the include_when DSL.
  include_when jsonb,
  depends_on_keys text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (template_id, task_key),
  constraint journey_template_tasks_position_key
    unique (template_stage_id, position) deferrable initially deferred
);

create table scoping_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  template_id uuid not null references journey_templates (id) on delete cascade,
  position int not null,
  key text not null,
  prompt text not null,
  kind text not null default 'select'
    check (kind in ('boolean', 'select', 'multi_select', 'number', 'text')),
  options jsonb,
  required boolean not null default false,
  created_at timestamptz not null default now(),
  unique (template_id, key)
);

create trigger journey_templates_touch before update on journey_templates
  for each row execute function portal_touch_updated_at();
create trigger journey_stage_blocks_touch before update on journey_stage_blocks
  for each row execute function portal_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Published content is immutable
-- ---------------------------------------------------------------------------
-- A TRIGGER, not a policy: every app write runs as service_role, and policies
-- do not apply to it. Publishing a template freezes its content because live
-- implementations pin that exact row — editing it would silently rewrite the
-- plan of every implementation already running it.
create or replace function journey_template_frozen()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  tpl_status text;
  tpl_id uuid;
begin
  tpl_id := coalesce(new.template_id, old.template_id);
  select status into tpl_status from journey_templates where id = tpl_id;
  if tpl_status = 'published' then
    raise exception
      'Template % is published and its content is frozen. Publish a new version instead.', tpl_id;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger journey_template_stages_frozen
  before insert or update or delete on journey_template_stages
  for each row execute function journey_template_frozen();
create trigger journey_template_tasks_frozen
  before insert or update or delete on journey_template_tasks
  for each row execute function journey_template_frozen();
create trigger scoping_questions_frozen
  before insert or update or delete on scoping_questions
  for each row execute function journey_template_frozen();

-- ---------------------------------------------------------------------------
-- Publish
-- ---------------------------------------------------------------------------
-- Order matters: stamp the outgoing version's superseded_by_id FIRST so it
-- leaves the partial unique index, then mark the draft published. Doing it the
-- other way round transiently violates "one live version per family".
create or replace function publish_template(draft_id uuid, note text, actor_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  draft journey_templates%rowtype;
  current_id uuid;
begin
  if not (auth.role() = 'service_role' or portal_can_manage()) then
    raise exception 'forbidden';
  end if;

  select * into draft from journey_templates where id = draft_id for update;
  if not found then raise exception 'Template % not found', draft_id; end if;
  if draft.status <> 'draft' then
    raise exception 'Template % is %, only a draft can be published', draft_id, draft.status;
  end if;
  if not exists (select 1 from journey_template_stages where template_id = draft_id) then
    raise exception 'A template needs at least one stage before it can be published';
  end if;

  select id into current_id
    from journey_templates
   where org_id = draft.org_id and key = draft.key
     and status = 'published' and superseded_by_id is null
   for update;

  if current_id is not null then
    update journey_templates set superseded_by_id = draft_id, updated_at = now()
     where id = current_id;
    update journey_templates set supersedes_id = current_id where id = draft_id;
  end if;

  update journey_templates
     set status = 'published',
         published_at = now(),
         version_note = coalesce(note, version_note),
         created_by = coalesce(created_by, actor_id),
         updated_at = now()
   where id = draft_id;

  return draft_id;
end;
$$;

-- Renumber positions in one statement; the deferred unique constraints make
-- the intermediate states legal.
create or replace function reorder_template_positions(
  scope_table text,
  scope_id uuid,
  ordered_ids uuid[]
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not (auth.role() = 'service_role' or portal_can_manage()) then
    raise exception 'forbidden';
  end if;

  if scope_table = 'stages' then
    update journey_template_stages s
       set position = t.ord
      from (select unnest(ordered_ids) as id, generate_subscripts(ordered_ids, 1) as ord) t
     where s.id = t.id and s.template_id = scope_id;
  elsif scope_table = 'tasks' then
    update journey_template_tasks k
       set position = t.ord
      from (select unnest(ordered_ids) as id, generate_subscripts(ordered_ids, 1) as ord) t
     where k.id = t.id and k.template_stage_id = scope_id;
  else
    raise exception 'Unknown scope_table %', scope_table;
  end if;
end;
$$;

revoke execute on function publish_template(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function reorder_template_positions(text, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function publish_template(uuid, text, uuid) to service_role;
grant execute on function reorder_template_positions(text, uuid, uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- RLS (defense-in-depth; the server functions are the real boundary)
-- ---------------------------------------------------------------------------
alter table journey_roles enable row level security;
alter table journey_stage_blocks enable row level security;
alter table journey_templates enable row level security;
alter table journey_template_stages enable row level security;
alter table journey_template_tasks enable row level security;
alter table scoping_questions enable row level security;

create policy "journey_roles internal select" on journey_roles
  for select to authenticated using (portal_is_internal());
create policy "journey_roles manage write" on journey_roles
  for all to authenticated using (portal_can_manage()) with check (portal_can_manage());

create policy "journey_stage_blocks internal select" on journey_stage_blocks
  for select to authenticated using (portal_is_internal());
create policy "journey_stage_blocks manage write" on journey_stage_blocks
  for all to authenticated using (portal_can_manage()) with check (portal_can_manage());

create policy "journey_templates internal select" on journey_templates
  for select to authenticated using (portal_is_internal());
create policy "journey_templates manage write" on journey_templates
  for all to authenticated using (portal_can_manage()) with check (portal_can_manage());

create policy "journey_template_stages internal select" on journey_template_stages
  for select to authenticated using (portal_is_internal());
create policy "journey_template_stages manage write" on journey_template_stages
  for all to authenticated using (portal_can_manage()) with check (portal_can_manage());

create policy "journey_template_tasks internal select" on journey_template_tasks
  for select to authenticated using (portal_is_internal());
create policy "journey_template_tasks manage write" on journey_template_tasks
  for all to authenticated using (portal_can_manage()) with check (portal_can_manage());

create policy "scoping_questions internal select" on scoping_questions
  for select to authenticated using (portal_is_internal());
create policy "scoping_questions manage write" on scoping_questions
  for all to authenticated using (portal_can_manage()) with check (portal_can_manage());

-- ---------------------------------------------------------------------------
-- Feature flags — both dark. The control plane ships in the same deploy.
-- ---------------------------------------------------------------------------
update portal_app_config
   set value = value || '{"journey_templates": false, "work_items": false}'::jsonb
 where key = 'v2_flags';
