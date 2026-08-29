-- 0025 — Platform hygiene completion (Phase 7).
--
-- Design: docs/design/hygiene.md. One migration for the whole phase, because
-- every part of it is additive and none of it can be split without leaving a
-- half-consolidated audit or a half-bridged people graph in between.
--
-- Sections:
--   A. Audit stores (decision 3) — indexes, and the trigger backstop that makes
--      an unrecorded API-key or role change impossible rather than unlikely.
--   B. People (decision 9) — the bridge finished: unique, backfilled,
--      self-maintaining, and readable through one view.
--   C. The four write-orphaned tables — write path or staged removal.
--   D. Vocabulary — the org_id seam extended to the portal_* tables.
--   E. Saved views.
--   F. API-key expiry and rate limits.
--   G. Flags — eight, all off.
--
-- NOTHING IS DROPPED HERE. Two tables are deprecated with comments and revoked
-- write grants; their rows, their readers and their fallbacks all stay. The
-- actual drops are a later release, exactly as 0012 deferred dropping the
-- sequence compat views.
--
-- `if not exists` throughout is load-bearing, not defensive noise: 0025's down
-- deliberately KEEPS every column and row that could be recorded human input,
-- so a re-apply after a rollback finds much of this already there. Without it,
-- CI's up -> down -> up fails.
--
-- Rollback: supabase/down/0025_down.sql

-- ===========================================================================
-- A. Audit stores (PLAN.md decision 3)
-- ===========================================================================
-- Both stores survive with jobs that do not overlap: audit_log is the account
-- ACTIVITY FEED (field-level, human-readable, already rendered on the 360 and
-- on Home), portal_audit_log is the SECURITY / API ACTION log.
--
-- No actor columns are added to audit_log: the ledger gives those to Phase 4's
-- 0020, and two concurrently built migrations adding "the actor" is how you end
-- up with two half-populated columns. Attribution goes through the bridge in
-- section B instead — portal_profiles.team_member_id -> audit_log.changed_by,
-- which is a real FK that already exists.

-- The feed is read by entity and by recency. Neither had an index.
create index if not exists audit_log_entity_idx
  on audit_log (entity_type, entity_id, changed_at desc);
create index if not exists audit_log_recent_idx
  on audit_log (changed_at desc);

-- The audit-health panel reconciles trigger-observed rows against app-written
-- ones by action name.
create index if not exists portal_audit_log_action_idx
  on portal_audit_log (action, created_at desc);

-- ---------------------------------------------------------------------------
-- The trigger backstop.
-- ---------------------------------------------------------------------------
-- Every app read and write uses the service-role client and bypasses RLS, so a
-- policy is not a guarantee — a trigger is. These two write a portal_audit_log
-- row transactionally with the change, so the change cannot happen without the
-- record: if the log write fails, the role change fails.
--
-- The trigger cannot know the app-level actor (the service-role client carries
-- no end-user claim), so it writes actor_type 'system' and an action suffixed
-- '.observed'. This is deliberately a SECOND row, not a replacement for the
-- app's audit() row: the app row carries attribution, the trigger row proves
-- the event happened, and an '.observed' row with no attributed row beside it
-- is the evidence that the app-side audit silently failed.
create or replace function portal_audit_observe_api_key()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into portal_audit_log (actor_type, action, entity_type, entity_id, payload)
    values ('system', 'api_key.create.observed', 'api_key', new.id,
            jsonb_build_object('source', 'trigger', 'name', new.name,
                               'key_prefix', new.key_prefix, 'scopes', to_jsonb(new.scopes)));
  elsif new.revoked_at is distinct from old.revoked_at and new.revoked_at is not null then
    insert into portal_audit_log (actor_type, action, entity_type, entity_id, payload)
    values ('system', 'api_key.revoke.observed', 'api_key', new.id,
            jsonb_build_object('source', 'trigger', 'name', new.name,
                               'key_prefix', new.key_prefix));
  end if;
  return new;
end $$;

drop trigger if exists portal_api_keys_audit_observe on portal_api_keys;
create trigger portal_api_keys_audit_observe
  after insert or update on portal_api_keys
  for each row execute function portal_audit_observe_api_key();

create or replace function portal_audit_observe_role_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    insert into portal_audit_log (actor_type, action, entity_type, entity_id, payload)
    values ('system', 'profile.role_change.observed', 'profile', new.id,
            jsonb_build_object('source', 'trigger', 'email', new.email,
                               'from', old.role::text, 'to', new.role::text));
  end if;
  return new;
end $$;

-- After the existing before-update role guard (portal_guard_role_change, 0001),
-- so only a change that was actually allowed is observed.
drop trigger if exists portal_profiles_audit_observe on portal_profiles;
create trigger portal_profiles_audit_observe
  after update on portal_profiles
  for each row execute function portal_audit_observe_role_change();

-- ===========================================================================
-- B. People (PLAN.md decision 9) — bridge finished, NOT merged
-- ===========================================================================
-- portal_profiles.id references auth.users(id): a profile cannot exist without
-- a login. team_members is the directory of people work is assigned to,
-- including contractors, leavers, and people who have never logged in. Merging
-- would mean either minting fake auth users or repointing the 19 hub tables
-- that FK team_members(id) — in one release, with on-delete-set-null semantics
-- that would quietly blank ownership on every row that failed to remap.
--
-- So: finish the bridge 0010 started. Additive only. team_member_id is not
-- renamed, not moved and not made not-null — 0014's RPCs (lines 270, 460) and
-- Phase 3's handoff resolution read it exactly as they do today.

-- 1. Unique. Two profiles pointing at one directory row means "my accounts"
--    returns someone else's work. 0010's backfill matched on lower(email)
--    against a nullable, non-unique team_members.email, so that is reachable
--    today. Created BEFORE the backfill, so a bad backfill fails loudly
--    instead of committing a broken graph.
create unique index if not exists portal_profiles_team_member_uidx
  on portal_profiles (team_member_id)
  where team_member_id is not null;

-- 2. Complete. Two passes: claim an existing unclaimed directory row by email,
--    then create one for any internal profile still unmatched. 0010 could not
--    do the second pass because it was not yet decided whether a profile with
--    no directory row was a bug or a fact. It is a bug: an internal user who
--    cannot be assigned work is not a state this product has a use for.
update portal_profiles p
   set team_member_id = t.id
  from team_members t
 where p.team_member_id is null
   and p.role <> 'customer'
   and t.email is not null
   and lower(t.email) = lower(p.email)
   and not exists (
     select 1 from portal_profiles q
      where q.team_member_id = t.id and q.id <> p.id
   )
   -- Never claim a directory row two profiles both match on email.
   and (
     select count(*) from team_members t2
      where t2.email is not null and lower(t2.email) = lower(p.email)
   ) = 1;

do $$
declare
  r record;
  new_id uuid;
  made int := 0;
begin
  for r in
    select id, email, full_name, role::text as role
      from portal_profiles
     where team_member_id is null and role <> 'customer'
  loop
    insert into team_members (name, email, role, active)
    values (coalesce(nullif(trim(r.full_name), ''), split_part(r.email, '@', 1)),
            r.email, r.role, true)
    returning id into new_id;
    update portal_profiles set team_member_id = new_id where id = r.id;
    made := made + 1;
  end loop;
  if made > 0 then
    raise notice 'created % team_members row(s) for internal profiles that had none', made;
  end if;
end $$;

-- 3. Self-maintaining. The drift exists because signup writes a profile
--    (portal_handle_new_user, 0001:43) and nothing has ever written a
--    directory row. This closes it inside the same transaction as the signup.
--    Customer-role profiles get no directory row: customers are not assignable,
--    and that is checked here rather than assumed downstream.
create or replace function portal_link_team_member()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  existing uuid;
begin
  if new.role = 'customer' or new.team_member_id is not null then
    return new;
  end if;

  select t.id into existing
    from team_members t
   where t.email is not null
     and lower(t.email) = lower(new.email)
     and not exists (select 1 from portal_profiles q where q.team_member_id = t.id)
   limit 1;

  if existing is null then
    insert into team_members (name, email, role, active)
    values (coalesce(nullif(trim(new.full_name), ''), split_part(new.email, '@', 1)),
            new.email, new.role::text, true)
    returning id into existing;
  end if;

  new.team_member_id := existing;
  return new;
end $$;

drop trigger if exists portal_profiles_link_team_member on portal_profiles;
create trigger portal_profiles_link_team_member
  before insert on portal_profiles
  for each row execute function portal_link_team_member();

-- 4. Readable as one thing. security_invoker per 0012's pattern, so the view
--    enforces the underlying tables' RLS as the caller. One row per person:
--    directory rows (with their profile if they have one), then profiles with
--    no directory row — which after the backfill means customers only.
create or replace view people with (security_invoker = true) as
  select t.id                                as team_member_id,
         p.id                                as profile_id,
         coalesce(nullif(trim(p.full_name), ''), t.name) as name,
         coalesce(t.email, p.email)          as email,
         t.role                              as directory_role,
         p.role::text                        as auth_role,
         t.active                            as active,
         t.org_id                            as org_id
    from team_members t
    left join portal_profiles p on p.team_member_id = t.id
  union all
  select null::uuid, p.id, p.full_name, p.email, null::text, p.role::text, true, null::uuid
    from portal_profiles p
   where p.team_member_id is null;

grant select on people to authenticated, service_role;

-- ===========================================================================
-- C. The four write-orphaned tables
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- C1. trace_links — a DERIVED write path, plus one manual link.
-- ---------------------------------------------------------------------------
-- Three reads build the traceability spine; zero inserts exist. But most of the
-- graph it draws is already in the schema as foreign keys. The spine is empty
-- not because the relationships are unknown but because nobody projected them
-- into the table the renderer reads. So the write path is a derivation, not a
-- form: a hand-maintained parallel copy of a foreign key drifts from it on the
-- first edit; a derived one cannot.
-- Added nullable and backfilled to 'manual', NOT defaulted to 'derived' first:
-- any row that already exists predates this migration and was not derived by
-- it, and the rollback deletes derived rows. Getting this order wrong would
-- make the rollback destroy pre-existing rows.
alter table trace_links add column if not exists source text;
update trace_links set source = 'manual' where source is null;
alter table trace_links alter column source set default 'derived';
alter table trace_links alter column source set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trace_links_source_check'
  ) then
    alter table trace_links
      add constraint trace_links_source_check check (source in ('derived', 'manual'));
  end if;
end $$;

-- The unique index below cannot be created over duplicate edges. Exact
-- duplicates carry no information, but a table this migration cannot read is
-- not a table it gets to assume things about: archive the whole table before
-- touching a row of it, then keep the oldest of each duplicate set.
do $$
declare
  dupes int;
begin
  select count(*) into dupes from (
    select 1 from trace_links
     group by from_entity_type, from_entity_id, relationship, to_entity_type, to_entity_id
    having count(*) > 1
  ) d;
  if dupes > 0 then
    create schema if not exists v2_archive;
    execute 'create table if not exists v2_archive.trace_links as table trace_links';
    -- id::text rather than ctid or the bare uuid: min() over uuid and tid are
    -- both recent additions, and this migration should not depend on the
    -- server minor version to be able to roll forward.
    delete from trace_links t
     where t.id::text <> (
       select min(u.id::text) from trace_links u
        where u.from_entity_type = t.from_entity_type and u.from_entity_id = t.from_entity_id
          and u.relationship = t.relationship
          and u.to_entity_type = t.to_entity_type and u.to_entity_id = t.to_entity_id
     );
    raise notice 'archived trace_links and collapsed % duplicate edge group(s)', dupes;
  end if;
end $$;

-- Makes both the backfill and the sync triggers idempotent, and gives the
-- manual linker something to upsert against.
create unique index if not exists trace_links_edge_uidx
  on trace_links (from_entity_type, from_entity_id, relationship, to_entity_type, to_entity_id);

-- Backfill the three relationships that already exist as FKs.
insert into trace_links (org_id, from_entity_type, from_entity_id, relationship,
                         to_entity_type, to_entity_id, source)
select s.org_id, 'requirement', s.requirement_id, 'implemented_by', 'technical_solution', s.id,
       'derived'
  from technical_solutions s
 where s.requirement_id is not null
on conflict do nothing;

insert into trace_links (org_id, from_entity_type, from_entity_id, relationship,
                         to_entity_type, to_entity_id, source)
select e.org_id, e.related_entity_type, e.related_entity_id, 'evidenced_by', 'evidence', e.id,
       'derived'
  from evidence e
 where e.related_entity_type is not null and e.related_entity_id is not null
on conflict do nothing;

insert into trace_links (org_id, from_entity_type, from_entity_id, relationship,
                         to_entity_type, to_entity_id, source)
select a.org_id, a.approved_entity_type, a.approved_entity_id, 'approved_by', 'approval', a.id,
       'derived'
  from approvals a
 where a.approved_entity_type is not null and a.approved_entity_id is not null
on conflict do nothing;

-- Keep them in sync. Each trigger only ever writes 'derived' rows, so the
-- rollback can remove exactly what it added and leave manual links alone.
create or replace function trace_link_sync_solution()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.requirement_id is not null then
    insert into trace_links (org_id, from_entity_type, from_entity_id, relationship,
                             to_entity_type, to_entity_id, source)
    values (new.org_id, 'requirement', new.requirement_id, 'implemented_by',
            'technical_solution', new.id, 'derived')
    on conflict do nothing;
  end if;
  if tg_op = 'UPDATE' and old.requirement_id is not null
     and old.requirement_id is distinct from new.requirement_id then
    delete from trace_links
     where source = 'derived' and relationship = 'implemented_by'
       and from_entity_type = 'requirement' and from_entity_id = old.requirement_id
       and to_entity_type = 'technical_solution' and to_entity_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists technical_solutions_trace_sync on technical_solutions;
create trigger technical_solutions_trace_sync
  after insert or update of requirement_id on technical_solutions
  for each row execute function trace_link_sync_solution();

create or replace function trace_link_sync_related()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  rel text;
  to_type text;
  from_type text;
  from_id uuid;
begin
  if tg_table_name = 'evidence' then
    rel := 'evidenced_by'; to_type := 'evidence';
    from_type := new.related_entity_type; from_id := new.related_entity_id;
  else
    rel := 'approved_by'; to_type := 'approval';
    from_type := new.approved_entity_type; from_id := new.approved_entity_id;
  end if;

  if from_type is not null and from_id is not null then
    insert into trace_links (org_id, from_entity_type, from_entity_id, relationship,
                             to_entity_type, to_entity_id, source)
    values (new.org_id, from_type, from_id, rel, to_type, new.id, 'derived')
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists evidence_trace_sync on evidence;
create trigger evidence_trace_sync
  after insert or update of related_entity_type, related_entity_id on evidence
  for each row execute function trace_link_sync_related();

drop trigger if exists approvals_trace_sync on approvals;
create trigger approvals_trace_sync
  after insert or update of approved_entity_type, approved_entity_id on approvals
  for each row execute function trace_link_sync_related();

-- ---------------------------------------------------------------------------
-- C2. cs_handoffs becomes THE handover record; graduations is deprecated.
-- ---------------------------------------------------------------------------
-- "The graduation flow decides" — there is no graduation flow. Both tables have
-- exactly one reader and zero writers, and graduation-readiness.ts already
-- prefers cs_handoffs and falls back to graduations field by field. Two tables,
-- one event. cs_handoffs is the richer one and the one the UI already calls the
-- handover record, so it wins and gains the two fields only graduations had.
alter table cs_handoffs
  add column if not exists health_at_handover text,
  add column if not exists notes text,
  add column if not exists recorded_by uuid references team_members (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists cs_handoffs_touch on cs_handoffs;
create trigger cs_handoffs_touch before update on cs_handoffs
  for each row execute function portal_touch_updated_at();

-- Fold graduations forward WITHOUT dropping it. Only where no handover record
-- exists, so an existing record is never overwritten by an older graduation.
insert into cs_handoffs (org_id, implementation_id, handoff_date, cs_owner_id,
                         summary, notes, health_at_handover)
select g.org_id, g.implementation_id, g.graduated_at::date, g.cs_owner_id,
       g.exit_criteria_summary, g.notes, g.health_at_graduation
  from graduations g
 where not exists (
   select 1 from cs_handoffs h where h.implementation_id = g.implementation_id
 )
on conflict (implementation_id) do nothing;

comment on table graduations is
  'DEPRECATED (0025, Phase 7). Superseded by cs_handoffs, which is the handover '
  'record. Rows and readers are kept for one release; graduation-readiness.ts '
  'still falls back to this table. Scheduled for removal in a later migration.';

comment on table cs_handoffs is
  'The handover record: the single record of an implementation being handed to '
  'Customer Success. Written by the Record-handover form (flag handover_record). '
  'Not a gate — graduation readiness stays read-only and independent.';

-- ---------------------------------------------------------------------------
-- C3. requirement_scope_changes — staged removal.
-- ---------------------------------------------------------------------------
-- Never read, never written, no UI renders it. There is nothing to give a write
-- path TO: building a change-control surface nobody asked for, to justify a
-- table nobody uses, is how dead weight becomes permanent.
--
-- Not dropped here. Archived (there should be no rows, but "should" is not a
-- guarantee about a production database this migration cannot read), commented,
-- and its write grants revoked so nothing starts depending on it during the
-- deprecation window.
do $$
declare
  n int;
begin
  select count(*) into n from requirement_scope_changes;
  if n > 0 then
    create schema if not exists v2_archive;
    execute 'create table if not exists v2_archive.requirement_scope_changes '
            'as table requirement_scope_changes';
    raise notice 'archived % requirement_scope_changes row(s) before deprecation', n;
  end if;
end $$;

revoke insert, update, delete on requirement_scope_changes from authenticated;

comment on table requirement_scope_changes is
  'DEPRECATED (0025, Phase 7). No reader, no writer, no UI since 0003. Any rows '
  'are archived to v2_archive. Scheduled for removal in a later migration; '
  'write grants are revoked so nothing new depends on it meanwhile.';

-- ===========================================================================
-- D. Vocabulary — the org_id seam reaches the portal_* tables
-- ===========================================================================
-- 38 tables carry org_id; not one portal_* table does. Same default, same FK.
-- It stays a SEAM: no policy filters on it and no query filters on it, exactly
-- as on the hub side. Adding a filter is the moment single-org assumptions
-- elsewhere start returning empty pages, and that belongs to whatever phase
-- actually makes the product multi-tenant. What this buys is that that phase is
-- then not also a data migration.
--
-- portal_app_config deliberately does NOT get one: it holds the feature flags
-- and the domain allowlist, which are properties of the deployment, not of a
-- tenant. Giving it an org_id would imply per-tenant flags, a product decision
-- nobody has made.
do $$
declare
  t text;
begin
  foreach t in array array[
    'portal_accounts', 'portal_profiles', 'portal_api_keys',
    'portal_stage_transitions', 'portal_gong_reports', 'portal_briefs',
    'portal_tam_requests', 'portal_onboarding_notes', 'portal_audit_log'
  ] loop
    execute format(
      'alter table %I add column if not exists org_id uuid not null '
      'default ''00000000-0000-4000-8000-000000000001'' references orgs (id)', t);
  end loop;
end $$;

create index if not exists portal_accounts_org_idx on portal_accounts (org_id);
create index if not exists portal_audit_log_org_idx on portal_audit_log (org_id);

-- ===========================================================================
-- E. Saved views
-- ===========================================================================
-- A named set of search PARAMETERS for one surface — deliberately not a saved
-- result set, which would go stale silently. A view is applied by writing its
-- query into the URL, so it produces an ordinary, shareable, bookmarkable URL
-- and nothing about any existing search-param contract changes.
create table if not exists saved_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  owner_profile_id uuid not null references portal_profiles (id) on delete cascade,
  surface text not null check (surface in ('customers', 'search', 'pipeline', 'tickets')),
  name text not null,
  query jsonb not null default '{}',
  -- Shared views are visible to every internal user; private ones only to their
  -- owner. Authorization is enforced in app code (all app traffic is
  -- service-role); the policy below is defense-in-depth.
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Plain columns, not lower(name): PostgREST can only infer an ON CONFLICT
-- target from a column list, and re-saving a view under the same name has to
-- update it rather than error. Case-sensitive uniqueness is the price, and it
-- is the right one — "Q3 renewals" and "Q3 Renewals" as two views is a mild
-- annoyance; a "Save" button that throws is a bug.
create unique index if not exists saved_views_owner_name_uidx
  on saved_views (owner_profile_id, surface, name);
create index if not exists saved_views_surface_idx on saved_views (surface, shared);

drop trigger if exists saved_views_touch on saved_views;
create trigger saved_views_touch before update on saved_views
  for each row execute function portal_touch_updated_at();

alter table saved_views enable row level security;
drop policy if exists "saved_views internal" on saved_views;
create policy "saved_views internal" on saved_views
  for all to authenticated
  using (portal_is_internal() and (shared or owner_profile_id = auth.uid()))
  with check (portal_is_internal() and owner_profile_id = auth.uid());

-- ===========================================================================
-- F. API-key expiry and rate limits
-- ===========================================================================
-- expires_at null = no expiry, so every existing key is unaffected. Both checks
-- are gated by the api_key_limits flag in app code: the failure mode of getting
-- a rate limit wrong is a silently broken Salesforce integration.
alter table portal_api_keys
  add column if not exists expires_at timestamptz,
  add column if not exists rate_limit_per_minute integer not null default 120;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'portal_api_keys_rate_limit_check'
  ) then
    alter table portal_api_keys
      add constraint portal_api_keys_rate_limit_check
      check (rate_limit_per_minute > 0 and rate_limit_per_minute <= 100000);
  end if;
end $$;

-- One row per key per minute. Counters, not evidence: the rollback drops this.
-- The column is `hits`, not `count`, so nothing in the function below has to
-- disambiguate a column from the aggregate of the same name.
create table if not exists portal_api_key_usage (
  key_id uuid not null references portal_api_keys (id) on delete cascade,
  minute timestamptz not null,
  hits integer not null default 0,
  primary key (key_id, minute)
);

alter table portal_api_key_usage enable row level security;
-- No policy at all: only the service-role client ever touches this.

-- A single atomic statement. Read-then-write from the app would undercount
-- under exactly the concurrency a rate limit exists to survive. It returns the
-- count and leaves the comparison to the caller, so the limit stays a single
-- value read from the key row rather than a number duplicated into the DB.
create or replace function portal_api_key_consume(p_key_id uuid)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  bucket timestamptz := date_trunc('minute', now());
  used integer;
begin
  insert into portal_api_key_usage (key_id, minute, hits)
  values (p_key_id, bucket, 1)
  on conflict (key_id, minute) do update set hits = portal_api_key_usage.hits + 1
  returning portal_api_key_usage.hits into used;

  -- Opportunistic cleanup; cheap because it is keyed and rare.
  if used = 1 then
    delete from portal_api_key_usage
     where key_id = p_key_id and minute < bucket - interval '1 hour';
  end if;

  return used;
end $$;

revoke execute on function portal_api_key_consume(uuid) from public, anon, authenticated;
grant execute on function portal_api_key_consume(uuid) to service_role;

-- ===========================================================================
-- G. Flags — eight, all off. Everything above is additive and inert until they
-- flip, except the trigger backstop in A (which cannot be flag-gated, because
-- flags live in app code) and the derived trace links in C1 (which only
-- populate a rendering that already exists and whose emptiness is the bug).
-- ===========================================================================
update portal_app_config
   set value = value || jsonb_build_object(
         'audit_activity_feed', false,
         'audit_strict', false,
         'handover_record', false,
         'trace_links_editing', false,
         'global_search', false,
         'saved_views', false,
         'demo_mode', false,
         'api_key_limits', false)
 where key = 'v2_flags';
