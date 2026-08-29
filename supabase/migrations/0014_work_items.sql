-- 0014 — The instance side: a real plan per implementation.
--
-- Template rows are the definition; these are the copy an implementation
-- actually runs. Instantiate-don't-reference: a plan is materialised once, so
-- editing a template never rewrites a live implementation's work.
--
-- Two rules this migration encodes rather than documents:
--   * implementation_stage_history stays the SOLE authority on stage
--     transitions. stage_instances.entered_at/exited_at is a read cache written
--     only inside the same transaction as the history row. On disagreement,
--     history wins; dwell metrics read history, never this mirror.
--   * "blocked by a dependency" is COMPUTED and never written. work_items.status
--     = 'blocked' stays a human statement. No code path may infer one from the
--     other.
--
-- Ships dark behind feature flags work_items / journey_templates (0013).
-- Rollback: supabase/down/0014_down.sql

alter table implementations
  add column journey_template_id uuid references journey_templates (id),
  add column journey_type text,
  add column template_version int,
  -- 'project_start' basis; falls back to contract_start_date then created_at.
  add column kickoff_at timestamptz;

create table stage_instances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  template_stage_id uuid references journey_template_stages (id) on delete set null,
  stage_key text not null,
  name text not null,
  phase text not null default 'delivery',
  position int not null,
  gate_mode text not null default 'advisory',
  entry_criteria jsonb not null default '[]',
  exit_criteria jsonb not null default '[]',
  target_duration_days int,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'done', 'skipped')),
  -- How this row's timestamps came to be. 'backfill_inferred' means the state
  -- was deduced from stage ORDER with no recorded entry — the UI says so and
  -- dwell metrics exclude it.
  provenance text not null default 'live'
    check (provenance in ('live', 'backfill_observed', 'backfill_inferred')),
  entered_at timestamptz,
  exited_at timestamptz,
  created_at timestamptz not null default now(),
  unique (implementation_id, stage_key),
  unique (implementation_id, position)
);

create table work_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  stage_instance_id uuid references stage_instances (id) on delete set null,
  -- Provenance including the exact template VERSION this item came from.
  template_task_id uuid references journey_template_tasks (id) on delete set null,
  task_key text,
  title text not null,
  description text,
  position int not null default 0,
  role_key text,
  owner_id uuid references team_members (id) on delete set null,
  customer_owner_contact_id uuid references customer_contacts (id) on delete set null,
  party text not null default 'internal' check (party in ('internal', 'customer', 'partner')),
  visibility text not null default 'internal' check (visibility in ('internal', 'shared')),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'waiting', 'blocked', 'done', 'skipped')),
  waiting_on_party text check (waiting_on_party in ('internal', 'customer', 'partner')),
  waiting_since timestamptz,
  due_basis text check (due_basis in ('project_start', 'stage_entry', 'target_launch')),
  due_offset_days int,
  duration_days int,
  -- Stored with its inputs, so a computed date can always show its evidence.
  due_at timestamptz,
  -- A hand-set date is a recorded fact; recalculation never touches it.
  due_at_edited boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references portal_profiles (id),
  depends_on uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Replay safety for instantiation and template pull-in.
  constraint work_items_task_key_unique unique (implementation_id, task_key)
);

create index work_items_implementation_idx on work_items (implementation_id);
create index work_items_stage_instance_idx on work_items (stage_instance_id);
create index work_items_open_due_idx on work_items (due_at)
  where status not in ('done', 'skipped');
create index stage_instances_implementation_idx on stage_instances (implementation_id);

create trigger work_items_touch before update on work_items
  for each row execute function portal_touch_updated_at();

create table scoping_answers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  -- Keyed by KEY, not question id: answers survive a template version pull-in.
  question_key text not null,
  value jsonb not null,
  source text not null default 'manual' check (source in ('manual', 'salesforce', 'api')),
  answered_by uuid references portal_profiles (id),
  answered_at timestamptz not null default now(),
  unique (implementation_id, question_key)
);

create table journey_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  work_item_id uuid references work_items (id) on delete cascade,
  kind text not null check (kind in
    ('instantiated', 'backfilled', 'status_change', 'dependency_override',
     'date_recalc_applied', 'task_pulled_from_template', 'reassigned',
     'bulk_action', 'scoping_reevaluated', 'stage_resynced')),
  actor_id uuid references portal_profiles (id),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index journey_events_impl_idx on journey_events (implementation_id, created_at desc);

create table journey_instantiations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  -- restrict: a template that has been used cannot be deleted out from under
  -- the record of how a plan was built.
  template_id uuid not null references journey_templates (id) on delete restrict,
  scoping_snapshot jsonb not null default '{}',
  included_task_keys text[] not null default '{}',
  excluded_task_keys jsonb not null default '[]',
  role_resolution jsonb not null default '{}',
  created_by uuid references portal_profiles (id),
  created_at timestamptz not null default now()
);

create table implementation_role_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  role_key text not null,
  team_member_id uuid references team_members (id) on delete set null,
  customer_contact_id uuid references customer_contacts (id) on delete set null,
  unique (implementation_id, role_key),
  check (team_member_id is null or customer_contact_id is null)
);

-- Link, never merge: fulfilling one never auto-completes the other.
alter table commitments
  add column work_item_id uuid references work_items (id) on delete set null;

-- ---------------------------------------------------------------------------
-- include_when evaluator
-- ---------------------------------------------------------------------------
-- SQL is the enforcement point; the TS module of the same rules is the
-- builder's preview. null → always included. Otherwise an AND over clauses
-- keyed by question_key. A missing answer makes its clause FALSE — never
-- silently true, so an unanswered question can never quietly add work.
create or replace function journey_include_when_matches(cond jsonb, answers jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  qkey text;
  clause jsonb;
  answer jsonb;
begin
  if cond is null or jsonb_typeof(cond) <> 'object' then
    return true;
  end if;

  for qkey, clause in select * from jsonb_each(cond) loop
    answer := answers -> qkey;

    -- 'exists' asks about presence; every other clause needs a value.
    if jsonb_typeof(clause) = 'object' and clause ? 'exists' then
      if (clause -> 'exists') = 'true'::jsonb then
        if answer is null then return false; end if;
      else
        if answer is not null then return false; end if;
      end if;
      continue;
    end if;

    if answer is null then return false; end if;

    if jsonb_typeof(clause) <> 'object' then
      -- Scalar clause = equality.
      if answer <> clause then return false; end if;
      continue;
    end if;

    if clause ? '>' and not ((answer)::text::numeric > (clause ->> '>')::numeric) then
      return false;
    end if;
    if clause ? '>=' and not ((answer)::text::numeric >= (clause ->> '>=')::numeric) then
      return false;
    end if;
    if clause ? '<' and not ((answer)::text::numeric < (clause ->> '<')::numeric) then
      return false;
    end if;
    if clause ? '<=' and not ((answer)::text::numeric <= (clause ->> '<=')::numeric) then
      return false;
    end if;
    if clause ? 'in' and not (clause -> 'in') @> jsonb_build_array(answer) then
      return false;
    end if;
    if clause ? 'contains' and not (answer @> (clause -> 'contains')) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- instantiate_journey — the unified creation path
-- ---------------------------------------------------------------------------
-- Deliberately creates the implementation row ITSELF rather than taking an id.
-- The legacy createImplementation stays untouched and remains the only path
-- when the flag is off or no template is chosen, so there is never a double
-- write, a stale 'handoff' history row, or two disagreeing first stages.
create or replace function instantiate_journey(
  p_customer_id uuid,
  p_patch jsonb,
  p_template_id uuid,
  p_answers jsonb,
  p_roles jsonb,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  tpl journey_templates%rowtype;
  impl_id uuid;
  first_stage journey_template_stages%rowtype;
  st journey_template_stages%rowtype;
  tsk journey_template_tasks%rowtype;
  si_id uuid;
  first_si_id uuid;
  stage_to_instance jsonb := '{}'::jsonb;
  key_to_item jsonb := '{}'::jsonb;
  included text[] := '{}';
  excluded jsonb := '[]'::jsonb;
  project_start timestamptz;
  target_launch date;
  due timestamptz;
  owner uuid;
  new_item_id uuid;
  dep_key text;
  dep_ids uuid[];
  actor_tm uuid;
begin
  if not (auth.role() = 'service_role' or portal_is_internal()) then
    raise exception 'forbidden';
  end if;

  -- implementation_stage_history.entered_by is a team_members FK, while
  -- journey_* tables key on portal_profiles. The 0010 bridge maps one to the
  -- other; an unbridged profile records null rather than a wrong id.
  select team_member_id into actor_tm from portal_profiles where id = p_actor_id;

  select * into tpl from journey_templates where id = p_template_id;
  if not found then raise exception 'Template % not found', p_template_id; end if;
  if tpl.status <> 'published' then
    raise exception 'Template % is %, only a published template can be instantiated',
      p_template_id, tpl.status;
  end if;

  select * into first_stage from journey_template_stages
   where template_id = p_template_id order by position limit 1;
  if not found then raise exception 'Template % has no stages', p_template_id; end if;

  -- 1. The implementation, pinned to this exact template version.
  insert into implementations (
    customer_id, name, current_stage, stage_entered_at,
    journey_template_id, journey_type, template_version, kickoff_at,
    owner_id, sales_owner, tier, target_launch_date, contract_start_date,
    sow_reference, sow_value, customer_goals, source, status
  )
  values (
    p_customer_id,
    coalesce(p_patch ->> 'name', tpl.name),
    first_stage.stage_key,
    now(),
    tpl.id, tpl.journey_type, tpl.version,
    (p_patch ->> 'kickoff_at')::timestamptz,
    (p_patch ->> 'owner_id')::uuid,
    p_patch ->> 'sales_owner',
    p_patch ->> 'tier',
    (p_patch ->> 'target_launch_date')::date,
    (p_patch ->> 'contract_start_date')::date,
    p_patch ->> 'sow_reference',
    (p_patch ->> 'sow_value')::numeric,
    p_patch ->> 'customer_goals',
    coalesce(p_patch ->> 'source', 'manual'),
    coalesce(p_patch ->> 'status', 'on_track')
  )
  returning id, coalesce(kickoff_at, contract_start_date::timestamptz, created_at), target_launch_date
    into impl_id, project_start, target_launch;

  -- 2. Stage history: append-only, same shape as the legacy path.
  insert into implementation_stage_history (implementation_id, stage, entered_at, entered_by, notes)
  values (impl_id, first_stage.stage_key, now(), actor_tm, 'Plan created from template');

  -- 3. Scoping answers.
  if p_answers is not null and jsonb_typeof(p_answers) = 'object' then
    insert into scoping_answers (implementation_id, question_key, value, answered_by)
    select impl_id, k, v, p_actor_id from jsonb_each(p_answers) as e(k, v);
  end if;

  -- 4. Role assignments.
  if p_roles is not null and jsonb_typeof(p_roles) = 'object' then
    insert into implementation_role_assignments (implementation_id, role_key, team_member_id)
    select impl_id, k, nullif(v #>> '{}', '')::uuid from jsonb_each(p_roles) as e(k, v);
  end if;

  -- 5. Stage instances: the first is active, the rest pending.
  for st in select * from journey_template_stages
             where template_id = p_template_id order by position loop
    insert into stage_instances (
      implementation_id, template_stage_id, stage_key, name, phase, position,
      gate_mode, entry_criteria, exit_criteria, target_duration_days,
      status, provenance, entered_at
    )
    values (
      impl_id, st.id, st.stage_key, st.name, st.phase, st.position,
      st.gate_mode, st.entry_criteria, st.exit_criteria, st.target_duration_days,
      case when st.position = first_stage.position then 'active' else 'pending' end,
      'live',
      case when st.position = first_stage.position then now() else null end
    )
    returning id into si_id;
    stage_to_instance := stage_to_instance || jsonb_build_object(st.stage_key, si_id);
    if st.position = first_stage.position then first_si_id := si_id; end if;
  end loop;

  -- 6. Work items for the tasks whose conditions hold.
  for tsk in select t.* from journey_template_tasks t
              join journey_template_stages s on s.id = t.template_stage_id
             where t.template_id = p_template_id
             order by s.position, t.position loop
    if not journey_include_when_matches(tsk.include_when, coalesce(p_answers, '{}'::jsonb)) then
      excluded := excluded || jsonb_build_object('key', tsk.task_key, 'clause', tsk.include_when);
      continue;
    end if;

    -- Resolve the role to a person. Unresolved keeps the role and leaves the
    -- owner null — "Solutions Engineer (unassigned)" — never an invented name.
    owner := null;
    if tsk.party = 'internal' then
      select team_member_id into owner from implementation_role_assignments
       where implementation_id = impl_id and role_key = tsk.role_key;
    end if;

    -- A due date only where its basis actually exists.
    due := case
      when tsk.offset_basis = 'project_start' and project_start is not null
        then project_start + make_interval(days => tsk.offset_days)
      when tsk.offset_basis = 'target_launch' and target_launch is not null
        then target_launch::timestamptz + make_interval(days => tsk.offset_days)
      when tsk.offset_basis = 'stage_entry'
             and (stage_to_instance ->> (select stage_key from journey_template_stages
                                          where id = tsk.template_stage_id)) = first_si_id::text
        then now() + make_interval(days => tsk.offset_days)
      else null
    end;

    insert into work_items (
      implementation_id, stage_instance_id, template_task_id, task_key,
      title, description, position, role_key, owner_id, party, visibility,
      due_basis, due_offset_days, duration_days, due_at
    )
    values (
      impl_id,
      (stage_to_instance ->> (select stage_key from journey_template_stages
                               where id = tsk.template_stage_id))::uuid,
      tsk.id, tsk.task_key, tsk.title, tsk.description, tsk.position,
      tsk.role_key, owner, tsk.party, tsk.visibility,
      tsk.offset_basis, tsk.offset_days, tsk.duration_days, due
    )
    returning id into new_item_id;

    included := included || tsk.task_key;
    key_to_item := key_to_item || jsonb_build_object(tsk.task_key, new_item_id);
  end loop;

  -- 7. Dependencies: keys resolve to uuids now that every item exists. A
  --    dependency on an excluded task is dropped, not dangled.
  for tsk in select t.* from journey_template_tasks t
             where t.template_id = p_template_id
               and array_length(t.depends_on_keys, 1) > 0
               and t.task_key = any (included) loop
    dep_ids := '{}';
    foreach dep_key in array tsk.depends_on_keys loop
      if key_to_item ? dep_key then
        dep_ids := dep_ids || (key_to_item ->> dep_key)::uuid;
      end if;
    end loop;
    update work_items set depends_on = dep_ids
     where implementation_id = impl_id and task_key = tsk.task_key;
  end loop;

  -- 8. How this plan was built, kept as evidence.
  insert into journey_instantiations (
    implementation_id, template_id, scoping_snapshot, included_task_keys,
    excluded_task_keys, role_resolution, created_by
  )
  values (
    impl_id, p_template_id, coalesce(p_answers, '{}'::jsonb), included,
    excluded, coalesce(p_roles, '{}'::jsonb), p_actor_id
  );

  insert into journey_events (implementation_id, kind, actor_id, detail)
  values (impl_id, 'instantiated', p_actor_id, jsonb_build_object(
    'template_id', p_template_id, 'template_key', tpl.key, 'version', tpl.version,
    'included', included, 'excluded', excluded
  ));

  return impl_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- advance_templated_stage
-- ---------------------------------------------------------------------------
-- The history writes are identical to the legacy path; the stage_instances
-- mirror moves in the SAME transaction, which is the only way the two can
-- never disagree.
create or replace function advance_templated_stage(
  p_implementation_id uuid,
  p_to_stage text,
  p_actor_id uuid,
  p_notes text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  cur stage_instances%rowtype;
  nxt stage_instances%rowtype;
  at_ts timestamptz := now();
  actor_tm uuid;
begin
  if not (auth.role() = 'service_role' or portal_is_internal()) then
    raise exception 'forbidden';
  end if;

  -- See instantiate_journey: history keys on team_members, not profiles.
  select team_member_id into actor_tm from portal_profiles where id = p_actor_id;

  select * into cur from stage_instances
   where implementation_id = p_implementation_id and status = 'active'
   order by position limit 1;
  if not found then
    raise exception 'Implementation % has no active stage instance', p_implementation_id;
  end if;

  select * into nxt from stage_instances
   where implementation_id = p_implementation_id and position > cur.position
   order by position limit 1;
  if not found then
    raise exception 'Implementation % is already at its final stage', p_implementation_id;
  end if;
  if nxt.stage_key <> p_to_stage then
    raise exception 'Next stage for % is %, not %', p_implementation_id, nxt.stage_key, p_to_stage;
  end if;

  -- History first: it is the authority.
  update implementation_stage_history
     set exited_at = at_ts
   where implementation_id = p_implementation_id and exited_at is null;
  insert into implementation_stage_history (implementation_id, stage, entered_at, entered_by, notes)
  values (p_implementation_id, nxt.stage_key, at_ts, actor_tm, p_notes);

  update implementations
     set current_stage = nxt.stage_key, stage_entered_at = at_ts, updated_at = at_ts
   where id = p_implementation_id;

  -- Mirror, same transaction.
  update stage_instances set status = 'done', exited_at = at_ts where id = cur.id;
  update stage_instances set status = 'active', entered_at = at_ts where id = nxt.id;

  -- Stage-entry due dates land now that the stage has actually been entered.
  update work_items
     set due_at = at_ts + make_interval(days => coalesce(due_offset_days, 0))
   where stage_instance_id = nxt.id
     and due_basis = 'stage_entry'
     and due_at is null
     and not due_at_edited;

  return jsonb_build_object('ok', true, 'stage', nxt.stage_key, 'entered_at', at_ts);
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_date_recalc — only ever called after a human confirms the diff
-- ---------------------------------------------------------------------------
create or replace function apply_date_recalc(
  p_implementation_id uuid,
  p_updates jsonb,
  p_actor_id uuid,
  p_detail jsonb
)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  n int := 0;
begin
  if not (auth.role() = 'service_role' or portal_is_internal()) then
    raise exception 'forbidden';
  end if;

  -- Hand-edited dates are recorded facts and are never recalculated, even if
  -- the caller lists them.
  update work_items w
     set due_at = (u ->> 'due_at')::timestamptz
    from jsonb_array_elements(p_updates) as u
   where w.id = (u ->> 'id')::uuid
     and w.implementation_id = p_implementation_id
     and not w.due_at_edited;
  get diagnostics n = row_count;

  insert into journey_events (implementation_id, kind, actor_id, detail)
  values (p_implementation_id, 'date_recalc_applied', p_actor_id,
          coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('applied_count', n));

  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- resync_stage_instances — the flag-flip runbook's repair pass
-- ---------------------------------------------------------------------------
-- A manual SQL stage fix between backfill and flag-flip desyncs the mirror.
-- This re-derives instance status from implementations.current_stage. It never
-- touches history, and never invents timestamps.
create or replace function resync_stage_instances(p_implementation_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  cur_key text;
  cur_pos int;
  changed int := 0;
begin
  if not (auth.role() = 'service_role' or portal_is_internal()) then
    raise exception 'forbidden';
  end if;

  select current_stage into cur_key from implementations where id = p_implementation_id;
  select position into cur_pos from stage_instances
   where implementation_id = p_implementation_id and stage_key = cur_key;
  if cur_pos is null then
    return jsonb_build_object('ok', false, 'reason', 'current_stage has no stage_instance');
  end if;

  update stage_instances
     set status = case
       when position < cur_pos then 'done'
       when position = cur_pos then 'active'
       else 'pending'
     end
   where implementation_id = p_implementation_id
     and status <> case
       when position < cur_pos then 'done'
       when position = cur_pos then 'active'
       else 'pending'
     end;
  get diagnostics changed = row_count;

  if changed > 0 then
    insert into journey_events (implementation_id, kind, detail)
    values (p_implementation_id, 'stage_resynced',
            jsonb_build_object('current_stage', cur_key, 'rows_changed', changed));
  end if;

  return jsonb_build_object('ok', true, 'rows_changed', changed);
end;
$$;

revoke execute on function instantiate_journey(uuid, jsonb, uuid, jsonb, jsonb, uuid)
  from public, anon, authenticated;
revoke execute on function advance_templated_stage(uuid, text, uuid, text)
  from public, anon, authenticated;
revoke execute on function apply_date_recalc(uuid, jsonb, uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function resync_stage_instances(uuid) from public, anon, authenticated;
grant execute on function instantiate_journey(uuid, jsonb, uuid, jsonb, jsonb, uuid) to service_role;
grant execute on function advance_templated_stage(uuid, text, uuid, text) to service_role;
grant execute on function apply_date_recalc(uuid, jsonb, uuid, jsonb) to service_role;
grant execute on function resync_stage_instances(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RLS (defense-in-depth; server functions are the real boundary)
-- ---------------------------------------------------------------------------
alter table stage_instances enable row level security;
alter table work_items enable row level security;
alter table scoping_answers enable row level security;
alter table journey_events enable row level security;
alter table journey_instantiations enable row level security;
alter table implementation_role_assignments enable row level security;

create policy "stage_instances internal" on stage_instances
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());
create policy "scoping_answers internal" on scoping_answers
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());
create policy "journey_events internal" on journey_events
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());
create policy "journey_instantiations internal" on journey_instantiations
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());
create policy "implementation_role_assignments internal" on implementation_role_assignments
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());

create policy "work_items internal" on work_items
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());

-- Customers read only SHARED items, and only on their own implementations.
-- Scope mirrors 0011: a scoped grant never reaches a sibling implementation.
create policy "work_items customer select" on work_items
  for select to authenticated
  using (
    visibility = 'shared'
    and exists (
      select 1
      from implementations i
      join customer_users cu on cu.customer_id = i.customer_id
      where i.id = work_items.implementation_id
        and cu.profile_id = auth.uid()
        and (cu.implementation_id is null or cu.implementation_id = i.id)
    )
  );
