# Design: Journey Templates + Work Items

> Produced by the v2 Step-0 design panel (workflow wf_f952802b-e7e, 2026-08-29).
> Each design was drafted, adversarially critiqued, and revised (all four revised).

# Journey Templates + Work Items — REVISED design for GCinternal-Portal (Workstreams 1–2)

Grounded in: `supabase/migrations/0001–0008`, `src/lib/lifecycle.ts`, `src/lib/hub.server.ts` (`createImplementation` :1377–1423, `advanceStage` :1470), `src/lib/stage-advance-input.ts`, `src/components/stage-advance-write.tsx` (:51), `src/routes/customers.$customerId.tsx` (:1237), `src/lib/home-triage.ts` (:245), `src/lib/leadership.ts`, `src/lib/graduation-readiness.ts`, `src/routes/api.cron.sla.ts` (:159), `src/lib/portal.server.ts` (:152–161), `src/lib/launch-gate.ts`, `src/lib/hub-format.ts`, `src/lib/journeys.server.ts` + `src/lib/journeys.functions.ts` + `src/routes/journeys.*` + `src/routes/api.cron.journeys.ts` + `src/routes/view.$token.tsx` + `vercel.json`, RLS patterns in 0005/0006.

**Critique resolution:** all 12 mustFix items are accepted (verified against the code: the hardcoded `'handoff'` insert, the three client-side `nextLifecycleStage` call sites, and the `journey.*` audit actions are all real). No rebuttals. Fixes are integrated below, not appended: creation-path unification (§3 Instantiation), the full advance/derive touched-surface inventory (§3, §5), RPC authorization semantics (§2 RLS/RPC), server-function guards (§5.9), 0010 DDL ordering, 0012 skip-and-report backfill with provenance-marked derived rows, honest rollbacks with preconditions (migrations), four published seeds (§4), account rollup surface (§5.3a), kickoff_at capture (§5.2), and the audit-vocabulary rename (§0).

---

## 0. The naming decision (blocking everything else)

**Facts in the repo:** the email-drip feature owns tables `journeys`, `journey_steps`, `journey_enrollments` (plus `engagement_events`, `content_items`, no prefix collision), routes `/journeys`, `/journeys/$journeyId`, `/api/cron/journeys` (in `vercel.json` crons at */30), `/view/$token` (JWT claim `{k:'journey'}`, 30-day expiry, `TAM_TOKEN_SECRET`), sidebar entry in `src/components/app-sidebar.tsx`, and audit rows with actions `journey.*` and entity types `journey`/`journey_step`/`journey_enrollment` (journeys.server.ts:192–670).

**Decision: rename the email feature to "Sequences" first (DB + routes + audit vocabulary), then the template system takes the `journey_` prefix.**

Why reuse `journey_` rather than `playbook_`/`template_`:
1. The brief's vocabulary and mandated column names (`journey_type`, `journey_template_id` on `implementations`) call the lifecycle a journey; a second prefix creates the exact code/UI vocabulary split Workstream 8 exists to eliminate.
2. `portal_` is claimed by presale; a third prefix family grows the namespace zoo in a shared DB.
3. The brief demands the Sequences rename anyway; doing it in 0009, before 0010 creates any `journey_*` table, makes the prefix unambiguous at every point in history.

**Naming convention, stated precisely** (fixing the earlier inconsistent claim): *template-system* tables — definitions, roles, blocks, the instantiation record, and the plan event log — carry the `journey_` prefix (`journey_templates`, `journey_template_stages`, `journey_template_tasks`, `journey_stage_blocks`, `journey_roles`, `journey_instantiations`, `journey_events`). *Instance-side* tables hanging off `implementations` follow the hub's unprefixed convention (`stage_instances`, `work_items`, `scoping_questions`, `scoping_answers`, `implementation_role_assignments`), matching `commitments`/`milestones`.

**Rename mechanics (email → Sequences):**
- DB: `alter table journeys rename to sequences`, `journey_steps → sequence_steps`, `journey_enrollments → sequence_enrollments`. Policies, indexes, constraints, FKs ride along (policy names keep old text; cosmetic). `engagement_events`, `content_items` untouched.
- Compatibility views for the deploy window: `create view journeys with (security_invoker=true) as select * from sequences;` (same for the other two). These single-table views are auto-updatable, so currently-deployed code's reads *and* writes via `supabaseAdmin` keep working (including insert-returning, the 23505 conflict fallback, and count/head queries) until the code cutover. Dropped in 0013 after verification.
- Routes: new `/sequences`, `/sequences/$sequenceId`; `/journeys` and `/journeys/$journeyId` become thin `redirect({ to: "/sequences", statusCode: 301 })` routes — kept permanently (bookmarks). Sidebar label "Sequences".
- Cron: add `/api/cron/sequences` (same handler), update `vercel.json` in the same deploy, keep `/api/cron/journeys` as a Bearer-authenticated alias for one release.
- Tracked links: `/view/$token` stays; `verifyJourneyToken` accepts `k in ('journey','sequence')` so 30-day tokens in already-sent emails keep resolving; new tokens sign `k:'sequence'`.
- **Audit vocabulary (mustFix #12):** at code cutover, every `audit()` call in `sequences.server.ts` (née journeys.server.ts) emits `sequence.*` actions and entity types `sequence`/`sequence_step`/`sequence_enrollment` (e.g. `journey.step_sent → sequence.step_sent`, journeys.server.ts:192–670 inventory: step_sent, enrolled, viewed, created, activated/paused, step_updated, step_added, step_deleted). Historical audit rows are never rewritten; any audit-log UI filter that matches on `journey.` prefixes matches both. This prevents semantic collision with the new `journey_events` table.
- Code: `journeys.server.ts → sequences.server.ts`, `journeys.functions.ts → sequences.functions.ts` (incl. `ensureDefaultJourney → ensureDefaultSequence`), row types renamed. Mechanical.

---

## 1. Template-side schema (migration 0010)

All tables carry `org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id)` (the 0003/0006 seam). Text-state columns use `check` constraints, not enums (the 0004/0005 enum-split lesson).

**DDL creation order (mustFix #5):** `journey_roles` → `journey_stage_blocks` → `journey_templates` → `journey_template_stages` (whose `source_block_id` FK now has its target) → `journey_template_tasks` → `scoping_questions` → `scoping_answers`. No forward references remain.

```sql
-- A template VERSION is a row. A FAMILY is a key. Publishing v2 inserts a new
-- row; the v1 row is never mutated (live implementations pin it by FK).
create table journey_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '...0001' references orgs (id),
  key text not null,                       -- 'new-logo','add-on','integration','data-migration'
  version int not null default 1,
  name text not null,
  journey_type text not null check (journey_type in
    ('new_logo','add_on','integration','data_migration','rollout','recovery')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  supersedes_id uuid references journey_templates (id),
  superseded_by_id uuid references journey_templates (id),
  description text,
  default_for jsonb,                       -- WS6 auto-selection rules; unused until Phase 4
  version_note text,
  published_at timestamptz,
  created_by uuid references portal_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key, version)
);
create unique index journey_templates_current_idx
  on journey_templates (org_id, key)
  where status = 'published' and superseded_by_id is null;

create table journey_template_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '...0001' references orgs (id),
  template_id uuid not null references journey_templates (id) on delete cascade,
  position int not null,
  stage_key text not null,                 -- for 'new-logo' these ARE lifecycle.ts ids
  name text not null,
  phase text not null default 'delivery' check (phase in ('intake','delivery','value','steady_state')),
  purpose text,
  target_duration_days int,
  entry_criteria jsonb not null default '[]',
  exit_criteria jsonb not null default '[]',
  gate_mode text not null default 'advisory' check (gate_mode in ('advisory','warn','blocking')),
  required_artifacts text[] not null default '{}',
  source_block_id uuid references journey_stage_blocks (id) on delete set null,  -- created earlier in this migration
  unique (template_id, stage_key),
  unique (template_id, position) deferrable initially deferred
);

create table journey_template_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '...0001' references orgs (id),
  template_id uuid not null references journey_templates (id) on delete cascade,
  template_stage_id uuid not null references journey_template_stages (id) on delete cascade,
  position int not null,
  task_key text not null,                  -- stable identity ACROSS versions; drives drift matching
  title text not null,
  description text,
  role_key text not null default 'implementation_manager',
  party text not null default 'internal' check (party in ('internal','customer','partner')),
  visibility text not null default 'internal' check (visibility in ('internal','shared')),
  offset_basis text not null default 'stage_entry'
    check (offset_basis in ('project_start','stage_entry','target_launch')),
  offset_days int not null default 0,      -- negative allowed ("T-14")
  duration_days int not null default 1,
  is_optional boolean not null default false,
  include_when jsonb,                      -- null = always; DSL below
  depends_on_keys text[] not null default '{}',
  unique (template_id, task_key),
  unique (template_stage_id, position) deferrable initially deferred
);
```

**Why `task_key`/`depends_on_keys` (strings) instead of the brief's `depends_on uuid[]` on templates:** template rows are copied on every republish and block insertion; uuid refs would need rewriting per copy and make drift diffing ("is v2 task X the same task as v1's?") impossible. Keys are the identity; uuids the storage. At instantiation keys resolve to concrete `work_items.depends_on uuid[]` (the brief's shape, on the instance side where ids are stable).

```sql
create table journey_stage_blocks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '...0001' references orgs (id),
  key text not null,
  name text not null,
  description text,
  stage_definition jsonb not null,   -- journey_template_stages row shape (minus ids)
  tasks jsonb not null default '[]', -- journey_template_tasks shapes (minus ids)
  created_by uuid references portal_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);
```
Inserting a block = server copies definition+tasks into real stage/task rows, stamps `source_block_id`. Editing a block later offers "also update N *draft* templates using it" — never touches published versions. Blocks are jsonb (editor-only artifacts, never queried relationally).

```sql
create table journey_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '...0001' references orgs (id),
  key text not null,
  name text not null,
  party text not null default 'internal' check (party in ('internal','customer','partner')),
  description text,
  unique (org_id, key)
);

create table scoping_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '...0001' references orgs (id),
  template_id uuid not null references journey_templates (id) on delete cascade,
  position int not null,
  key text not null,
  prompt text not null,
  kind text not null default 'select' check (kind in ('boolean','select','multi_select','number','text')),
  options jsonb,
  required boolean not null default false,
  unique (template_id, key)
);

create table scoping_answers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '...0001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  question_key text not null,              -- keyed by KEY: survives version pull-ins; WS6 can write SF facts
  value jsonb not null,
  source text not null default 'manual' check (source in ('manual','salesforce','api')),
  answered_by uuid references portal_profiles (id),
  answered_at timestamptz not null default now(),
  unique (implementation_id, question_key)
);
```

**`include_when` DSL** (pure TS module `src/lib/journey-conditions.ts`, used client-side for builder preview and mirrored in the SQL of `instantiate_journey` — the `launch-gate.ts` pure-function pattern): `null` → always; object → AND of clauses keyed by `question_key`; scalar clause → equality; object clause → `{">":n} {">=":n} {"<":n} {"in":[..]} {"contains":x} {"exists":true}`. Missing answer → clause false AND result records `missing:[keys]` — preview and instantiation snapshot both show *why* each task was in/out.

## 2. Instance-side schema (migration 0011)

```sql
alter table implementations
  add column journey_template_id uuid references journey_templates (id),  -- pins the exact VERSION row
  add column journey_type text,
  add column template_version int,
  add column parent_implementation_id uuid references implementations (id) on delete set null,
  add column kickoff_at timestamptz;      -- 'project_start' basis; fallback coalesce(kickoff_at, contract_start_date, created_at)

alter table commitments
  add column work_item_id uuid references work_items (id) on delete set null;  -- link, never merge

create table stage_instances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '...0001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  template_stage_id uuid references journey_template_stages (id) on delete set null,
  stage_key text not null,
  name text not null,
  phase text not null,
  position int not null,
  gate_mode text not null default 'advisory',
  entry_criteria jsonb not null default '[]',
  exit_criteria jsonb not null default '[]',
  target_duration_days int,
  status text not null default 'pending' check (status in ('pending','active','done','skipped')),
  provenance text not null default 'live'
    check (provenance in ('live','backfill_observed','backfill_inferred')),  -- mustFix #8
  entered_at timestamptz,
  exited_at timestamptz,
  unique (implementation_id, stage_key),
  unique (implementation_id, position)
);
```

**entered_at/exited_at second-copy rule (critique aspect 1b), stated explicitly:** `implementation_stage_history` remains the *sole authoritative* record of stage transitions; `stage_instances.entered_at/exited_at` is a denormalized read cache written *only* inside the same RPC transaction that writes the history row (or by the 0012 backfill, provenance-marked). On any disagreement, history wins; WS7 metrics and all dwell-time math read history exclusively; a `stage_instance_history_check` view (`select` comparing the two) ships for ops verification. No code path ever updates the mirror without the corresponding history write in the same transaction.

```sql
create table work_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '...0001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  stage_instance_id uuid references stage_instances (id) on delete set null,
  template_task_id uuid references journey_template_tasks (id) on delete set null,  -- provenance incl. version
  task_key text,                          -- null for ad-hoc items
  title text not null,
  description text,
  position int not null,
  role_key text,
  owner_id uuid references team_members (id) on delete set null,
  customer_owner_contact_id uuid references customer_contacts (id) on delete set null,
  party text not null default 'internal' check (party in ('internal','customer','partner')),
  visibility text not null default 'internal' check (visibility in ('internal','shared')),
  status text not null default 'not_started'
    check (status in ('not_started','in_progress','waiting','blocked','done','skipped')),
  waiting_on_party text check (waiting_on_party in ('internal','customer','partner')),
  waiting_since timestamptz,
  due_basis text check (due_basis in ('project_start','stage_entry','target_launch')),
  due_offset_days int,
  duration_days int,
  due_at timestamptz,                     -- stored WITH its inputs — computed value shows its evidence
  due_at_edited boolean not null default false,  -- hand-set date is a recorded fact; recalc never touches it
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references portal_profiles (id),
  depends_on uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index work_items_implementation_idx on work_items (implementation_id);
create index work_items_stage_instance_idx on work_items (stage_instance_id);
create index work_items_open_due_idx on work_items (due_at) where status not in ('done','skipped');
create index stage_instances_implementation_idx on stage_instances (implementation_id);
create trigger work_items_touch before update on work_items for each row execute function portal_touch_updated_at();

create table journey_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '...0001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  work_item_id uuid references work_items (id) on delete cascade,
  kind text not null check (kind in
    ('instantiated','backfilled','status_change','dependency_override','date_recalc_applied',
     'task_pulled_from_template','reassigned','bulk_action','scoping_reevaluated')),
  actor_id uuid references portal_profiles (id),
  detail jsonb not null,
  created_at timestamptz not null default now()
);
create index journey_events_impl_idx on journey_events (implementation_id, created_at desc);

create table journey_instantiations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '...0001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  template_id uuid not null references journey_templates (id) on delete restrict,  -- explicit: templates with usage cannot be deleted (mustFix #7)
  scoping_snapshot jsonb not null,
  included_task_keys text[] not null,
  excluded_task_keys jsonb not null,      -- [{key, reason_clause}]
  role_resolution jsonb not null,
  created_by uuid references portal_profiles (id),
  created_at timestamptz not null default now()
);

create table implementation_role_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '...0001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  role_key text not null,
  team_member_id uuid references team_members (id) on delete set null,
  customer_contact_id uuid references customer_contacts (id) on delete set null,
  unique (implementation_id, role_key),
  check (team_member_id is null or customer_contact_id is null)
);
```

**RLS + RPC authorization (mustFix #3, #4):**
- Table policies (0005/0006 idiom): template-side tables — select `portal_is_internal()`, writes `portal_can_manage()`. `scoping_answers`, `journey_events`, `journey_instantiations`, `implementation_role_assignments`, `stage_instances` — all verbs `portal_is_internal()`. `work_items` — internal full access plus the customer select below.
- **RPC hardening, specified exactly:** `instantiate_journey`, `apply_date_recalc`, `advance_templated_stage`, `reorder_positions` are `security definer set search_path = public`. Grants: `revoke execute on function ... from public, anon, authenticated; grant execute on function ... to service_role;`. There is no "authenticated-internal" role; the functions are service-role-only at the grant layer. **Defense in depth:** each function body's first statement asserts caller legitimacy anyway — `if not (auth.role() = 'service_role' or portal_is_internal()) then raise exception 'forbidden'; end if;` — and template-*mutating* paths (publish, block-apply, reorder of template rows) additionally assert `portal_can_manage()` when invoked with a user JWT. This way a future well-intentioned `grant to authenticated` does not open the RPCs to customer portal logins via PostgREST.
- **Server-function guards are the real enforcement** because the internal app runs on `supabaseAdmin` (RLS-bypassing) throughout `hub.server.ts`/`portal.server.ts`: every new server function declares its guard using the `journeys.functions.ts` pattern — builder mutations (template/stage/task/block/question CRUD, publish, pull-in): `requireInternal()` **and** an explicit `portal_can_manage`-equivalent role check on the profile (admin/super_admin/manager); plan mutations (work-item status, reassign, dates, bulk, ad-hoc add, advancement, instantiation): `requireInternal()`; all reads of template/plan data: `requireInternal()` except the portal loader below. "The builder UI enforces the same" is a UX statement only; the server functions are the authorization boundary and each is listed with its guard in the implementation checklist.
- Customer read policy (mirrors 0005 `milestones customer select`, plus visibility conjunct):

```sql
create policy "work_items customer select" on work_items
  for select to authenticated
  using (visibility = 'shared' and exists (
    select 1 from implementations i
    join customer_users cu on cu.customer_id = i.customer_id
    where i.id = work_items.implementation_id and cu.profile_id = auth.uid()));
```
Note, deliberately documented: this is **customer-scoped, not implementation-scoped** — a customer login sees shared items across all of that customer's implementations. That is the desired account-portal behavior for concurrent motions, but it means a future recovery/CS motion's shared items are also visible; the portal-authorization test suite (mandated by the brief) includes a case asserting internal-visibility items never appear and a case documenting the cross-implementation read. Writes stay internal; customer completion arrives with WS4.

## 3. Behavior rules

**Instantiation — unified creation path (mustFix #1):** `instantiate_journey` **creates the implementation row itself**; it does not take an `implementation_id`. The legacy `createImplementation` (hub.server.ts:1377, which hardcodes `current_stage:'handoff'` at :1404 and inserts the 'handoff' history row) remains exactly as-is and is the *only* path when `feature_work_items` is off or no template is chosen. When a template is chosen, the new-implementation server function calls the RPC and never calls `createImplementation` — there is no double-write, no stale 'handoff' history row, no conflicting first stage.
1. Inputs: `customer_id`, `patch` (the same implementation fields the form collects today, **plus `kickoff_at`**), `template_id` (must be `status='published'`), `answers jsonb`, `roles jsonb`.
2. In one transaction: insert `implementations` with `current_stage = <first template stage_key>`, `stage_entered_at = now()`, pins (`journey_template_id`, `journey_type`, `template_version`), `kickoff_at`; insert the first `implementation_stage_history` row for that stage_key (append-only, no prior row — same shape as today's, different key when the template's first stage isn't 'handoff').
3. Upsert `scoping_answers`; evaluate `include_when` per task (SQL is the enforcement point; the TS module is the preview).
4. Create `stage_instances` (first `active`, `entered_at=now()`, `provenance='live'`).
5. Create `work_items` for included tasks: resolve `role_key` via `roles` (unresolved → owner null, `role_key` kept — "Solutions Engineer (unassigned)", never an invented person); map `depends_on_keys` → uuids; compute `due_at` only where the basis date exists (`project_start` = coalesce(kickoff_at, contract_start_date, created_at); `target_launch` = target_launch_date else null; `stage_entry` = null until entered).
6. Write `journey_instantiations` + `journey_events` kind `instantiated`. Atomic by construction (plpgsql; `createImplementation`'s own partial-failure comment is the evidence supabase-js sequential inserts won't do).

**Stage advancement — server AND client (mustFix #2):** "next stage" resolution moves into one shared shape. Server: `advanceStage` (hub.server.ts:1470 `expected = nextLifecycleStage(current)`) branches — if the implementation has `stage_instances`, expected-next = next instance by `position`; close current instance (`done`, `exited_at`), open next (`active`, `entered_at`), *plus* the exact existing writes (close open history row, insert new history row, update `current_stage`/`stage_entered_at`) in the `advance_templated_stage` RPC. Client: **every call site that computes next from the TS constant is in scope, by file:**
- `src/lib/stage-advance-input.ts`: gains `resolveNextStage(currentStageKey, stageInstances | null)` — falls back to `nextLifecycleStage` when instances are absent.
- `src/components/stage-advance-write.tsx` (:51): takes a `nextStage {key,label} | null` prop supplied by the loader (from `stage_instances`), instead of computing `nextLifecycleStage(currentStage)`; button hidden when null, exactly today's behavior for legacy records.
- `src/routes/customers.$customerId.tsx` (:1237): `toStage` sourced from the loader's resolved next stage, not `nextLifecycleStage(activeStage)`.
- `src/lib/home-triage.ts` (:245): triage query joins `stage_instances` for templated implementations; `toStage` from `resolveNextStage`.
- `src/lib/leadership.ts`, `src/lib/graduation-readiness.ts`, `src/routes/api.cron.sla.ts` (:159 'graduate-to-cs' special case), `src/lib/portal.server.ts` (:152–161 progress math): each gains the stage_instances-aware branch (position/terminal-stage from instances when present; `LIFECYCLE_STAGES` fallback otherwise). SLA's terminal check becomes "is the current stage the last instance (or 'graduate-to-cs' for legacy)". These are in the Phase-2 implementation checklist with per-file tests, not in the risk register.
- Launch gate: `launchAcceptanceGate` still fires on `toStage === 'launch'` — unchanged for New Logo, inert for templates without a `launch` stage_key; the builder warns when a `new_logo`-type template lacks one. `gate_mode` stored now, enforced in WS3 (advisory until then; the migrated template must not change behavior). On stage entry, `due_at` computed for that stage's `stage_entry` items where `due_at is null and not due_at_edited`.

**Dependency gating (evidence over inference):** "blocked by dependencies" is **computed, never written** — `effectively_blocked = depends_on.some(pred => pred.status not in ('done','skipped'))` derived in loader/UI; recorded `status='blocked'` stays a human statement. Completing an item with open predecessors is rejected server-side unless the call carries `override:{reason}`, which writes `journey_events` kind `dependency_override` with `{reason, open_dependencies:[{id,title,status}], actor}` first. No code path may auto-write `status='blocked'` from dependency state.

**Relative dates + recalculation diff:** editing `target_launch_date` or `kickoff_at` → server computes proposed `due_at` for every open, non-hand-edited item on the moved basis and returns the `{item,title,old_due_at,new_due_at}[]` diff **without saving**; dialog renders it; confirm applies date + items atomically via `apply_date_recalc` RPC and writes one `journey_events` kind `date_recalc_applied` with the full diff; cancel applies nothing (not even the date). Hand-edited dates render greyed: "pinned by hand — not recalculated".

**Waiting-on:** `status='waiting'` requires `waiting_on_party`; `waiting_since` stamped server-side; clearing nulls both; elapsed periods recoverable from `journey_events` status changes (feeds WS5).

**Versioning + drift + selective pull-in:** republish duplicates the current row (version+1, `supersedes_id`, draft) with stages/tasks/questions (same keys); Publish stamps `published_at`/`version_note`/old row's `superseded_by_id`. Published rows are immutable via trigger raising on content-column update when `status='published'` (a trigger, not a policy — fires for service role too). Drift: `/settings/templates` lists implementations pinned to superseded versions. Pull-in diffs by `task_key` (`added`/`changed` shown not auto-applied/`removed` informational); manager ticks specific added tasks; server re-evaluates `include_when` against **live** `scoping_answers` (the pull-in modal states which answer set is used and flags answers edited since the instantiation snapshot), resolves roles via `implementation_role_assignments`, creates items with `template_task_id` → the v2 row (per-item provenance, honest partial adoption), writes `journey_events` kind `task_pulled_from_template`. Pinned `template_version` unchanged.

**Commitments:** separate table, separate UI; linkable via `commitments.work_item_id`, chip both ways; fulfilling one never auto-completes the other.

**Feature flags:** store = `portal_app_config` (0001; RLS admin **update**-only, so flag keys are inserted by migration 0010 — verified constraint). `feature_journey_templates` (builder + template-aware creation) and `feature_work_items` (plan panel + templated advancement). Flag off, or no `stage_instances` ⇒ byte-for-byte legacy paths. The Sequences rename itself is not flaggable (mandated Phase-1 naming, rides with 0009's coordinated deploy — stated, not hidden).

## 4. Seed + migration of existing records (migration 0012) — four published templates (mustFix #9)

The brief's WS1 DoD says "seed four published templates"; that is a committed deliverable, not an open question:
- **New Logo v1** — published, stages-only verbatim: 8 stages, `stage_key` = exact `lifecycle.ts` ids, labels verbatim, phases mapped, `gate_mode='advisory'`, null durations, **zero tasks/questions**. Stages-only is what makes the backfill provably behavior-preserving.
- **Add-On v1, Integration v1, Data-Migration v1** — **seeded published** with stage lists, starter task sets, roles, offsets, and scoping questions drawn from the brief's own examples (e.g. Integration: `integration_type` question gating ERP/MES task branches; Data-Migration: extract/map/validate/load stages), each with `version_note = 'Initial seed from v2 brief — content review pending'`. Content review by the implementation team is a named launch-checklist item *before* `feature_journey_templates` flips (flag choreography gives that window); revisions land as v2 through the normal republish flow, exercising versioning on day one. These templates back no existing implementations, so seed content carries zero migration risk. (The residual openQuestion is only *who* signs off, not *whether* they ship published.)
- Seed `journey_roles`: implementation_manager, solutions_engineer, sales_owner, cs_owner, customer_champion, customer_data_owner.

**Backfill — skip-and-report with provenance (mustFix #6, #8):**
- For each implementation whose `current_stage` **normalizes** under the in-SQL alias CTE mirroring `STAGE_ALIASES` (plan→plan-internal, align→align-external, validate→validate-iterate, prove-value→adopt, graduate/cs→graduate-to-cs): pin `journey_template_id`=New Logo v1, `journey_type='new_logo'`, `template_version=1`; derive `stage_instances` from `implementation_stage_history` **without touching it**. Per canonical stage: if history rows exist → `entered_at=min`, `exited_at=max`, `provenance='backfill_observed'`; stages *before* current with **no** history row → `status='done'`, null timestamps, **`provenance='backfill_inferred'`** — the invented-state marker the UI renders as "inferred from stage order, no recorded entry" and WS7 excludes from dwell math. Stage = current → `active`; after → `pending`. One `journey_events` row per backfilled implementation, kind `backfilled`, detail `{alias_map, per_stage:[{stage_key, derivation:'observed'|'inferred', history_row_count}]}` — the derivation is itself evidence.
- Implementations whose `current_stage` does **not** normalize (pre-handoff values like `qualify`/`scoping`, import junk): **skipped, not aborted** — no pin, no instances; they continue on the legacy rendering path indefinitely (which handles them today via `PRE_HANDOFF_STAGE_LABELS`/`normalizeStage` fallbacks). The migration `raise notice`s each skipped id and writes them to a `_backfill_0012_skipped(implementation_id, current_stage)` report table (droppable later) so ops can migrate them by hand. No assertion strands the deploy; a post-check merely `raise notice`s counts (backfilled / skipped / inferred-stage rows).
- Pre-handoff *history rows* on backfilled implementations map to no instance and stay readable via `PRE_HANDOFF_STAGE_LABELS`. `implementation_stage_history` receives zero writes.
- `lifecycle.ts` is kept: seed source of truth, flag-off fallback, and permanent home of `STAGE_ALIASES`/`normalizeStage` for historical rows.

## 5. UI surfaces touched

1. **`/settings/templates`** (new; guard: requireInternal + manage-role check): family list w/ version history + drift counts; builder — drag-reorder (single `reorder_positions` RPC; deferrable uniques make swaps one tx — naive per-row PostgREST updates are forbidden), stage editor, task editor (role/party/visibility/offsets/`include_when` structured editor/dependency picker), block library (save-as/insert), scoping-question editor, preview pane (sample answers → TS evaluator renders plan, excluded tasks greyed with failing clause), Publish dialog requiring version note, warning when a `new_logo` template lacks a `launch` stage_key. Drift panel → per-implementation pull-in modal (shows which answer set is evaluated).
2. **New-implementation flow**: template picker (current published versions; "no template" = legacy path), scoping questions, **kickoff date field (`kickoff_at`, default today, editable later on the implementation settings panel with recalc-diff on change — mustFix #11)**, role-resolution step (skippable), generated-plan preview, create → `instantiate_journey` (single RPC; `createImplementation` untouched and used only for the no-template path).
3. **`/customers/$customerId`**: new **Plan** section — checklist grouped by stage instance, owner avatar, party badge, due date (hover shows basis+offset — the computed value shows its inputs), waiting-on chip, computed dependency-blocked indicator, timeline/Gantt toggle (no Kanban), multi-select bulk bar (reassign / shift ±N with diff preview / mark done with per-item override prompts), ad-hoc "Add item", inferred-provenance badge on backfilled stages. Commitment↔work-item chips both ways.
   **3a. Multi-implementation rollup (mustFix #10, DoD #4):** the account page gains an implementation switcher — a tab/selector row listing all of the customer's implementations (name, journey_type badge, current stage, template version), leveraging `loadCustomer360`'s existing `implementationId` parameter; default selection = most recently created *active* implementation, deterministic and labeled. `/portfolio` already lists per-implementation rows (unchanged). `src/lib/portal.server.ts` (:152–161) is updated so the customer portal renders one tracker per implementation with shared work items grouped under each, replacing the single-implementation derive. This is the minimum DoD-#4 surface and ships in this phase behind `feature_work_items`; the fuller account-model work stays Phase 1 but this phase no longer depends on it.
4. **`LifecycleRail`** (`src/components/lifecycle-rail.tsx`): optional `stages` prop from `stage_instances`; defaults to `LIFECYCLE_STAGES` — New Logo renders pixel-identical. Same for the portal `StageTracker`.
5. **`stageLabel`/`StageBadge`** (`hub-format.ts`): templated non-new-logo rows resolve labels from joined `stage_instances.name`; `normalizeStage` fallback + humanized-key last resort keep legacy call sites safe. `customers.index` `stageIndex` sorting and `customer360-derive.ts` progress math use `stage_instances.position` when present.
6. **Advance-stage UI**: `stage-advance-write.tsx`, `customers.$customerId.tsx`, `home-triage.ts` per §3 (loader-supplied next stage).
7. **Derived-metrics call sites**: `leadership.ts`, `graduation-readiness.ts`, `api.cron.sla.ts`, `portal.server.ts` per §3 — in the checklist with tests.
8. **Target-launch / kickoff edit dialog**: recalc diff table, pinned rows greyed, Confirm/Cancel.
9. **Sequences rename**: sidebar, `/sequences*`, 301s, cron alias, token dual-claim, `sequence.*` audit actions.
10. **`/portal`**: shared work items readable under new RLS; per-implementation trackers via §5.3a; rendering interactions are WS4.

## Proposed migrations

Numbered continuations of `supabase/migrations/` (next free: 0009), each reversible with honest preconditions. The rename MUST precede any `journey_*` creation.

**0009_sequences_rename.sql** — free the `journey_` namespace.
- `alter table journeys rename to sequences;` `journey_steps → sequence_steps;` `journey_enrollments → sequence_enrollments;` (policies/indexes/FKs ride along; `engagement_events`/`content_items` untouched).
- Compat views for the deploy window: `create view journeys with (security_invoker=true) as select * from sequences;` (×3) — auto-updatable, so deployed code's reads/writes (incl. insert-returning and the 23505 fallback) keep working until cutover.
- Same deploy: `/sequences*` routes + permanent 301s from `/journeys*`; `/api/cron/sequences` + `vercel.json` update (keep `/api/cron/journeys` alias one release); token verifier accepting `k in ('journey','sequence')`; audit calls emitting `sequence.*` actions / `sequence*` entity types (historical rows untouched).
- **Rollback:** drop the three views; rename tables back; redeploy prior code. Honest caveat: requires the coordinated redeploy; any `sequence.*` audit rows written in the window remain (append-only log, acceptable).

**0010_journey_templates.sql** — template-side tables, in dependency order (fixes the forward-reference failure): `journey_roles` → `journey_stage_blocks` → `journey_templates` → `journey_template_stages` (its `source_block_id` FK target now exists) → `journey_template_tasks` → `scoping_questions` → `scoping_answers`. Plus: partial unique `journey_templates_current_idx`; deferrable position uniques; published-immutability trigger (trigger, not policy — fires for service role); RLS (select `portal_is_internal()`, writes `portal_can_manage()`; `scoping_answers` internal-only); `insert` of `feature_journey_templates:false`, `feature_work_items:false` into `portal_app_config` (its RLS is UPDATE-only for admins, so migration-insert is required and verified).
- **Rollback:** drop seven tables in reverse dependency order, drop trigger function, delete the two config keys. Precondition: total and lossless *only while no template content has been authored*; after authoring, rollback destroys drafts/templates (published templates pinned by implementations are additionally protected by 0011's `on delete restrict` — see below) — the rollback script begins with a guarded `do` block that raises unless `journey_templates` is empty or a `force` comment marker is uncommented.

**0011_work_items.sql** — instance-side.
- `alter table implementations add column journey_template_id / journey_type / template_version / parent_implementation_id / kickoff_at;` create `stage_instances` (with `provenance` column), `work_items`, `journey_events`, `journey_instantiations` (**`template_id ... on delete restrict`** — explicit: a template version with any usage cannot be deleted), `implementation_role_assignments`; `alter table commitments add column work_item_id;` indexes, touch trigger, RLS (internal-only everywhere; `work_items` customer select with `visibility='shared'` conjunct).
- RPCs: `instantiate_journey` (creates the implementation row itself), `apply_date_recalc`, `advance_templated_stage`, `reorder_positions` — all `security definer set search_path=public`, `revoke execute from public, anon, authenticated`, `grant execute to service_role`, and in-body `raise exception 'forbidden'` unless `auth.role()='service_role' or portal_is_internal()` (manage-role assertion on template-mutating paths).
- **Rollback (honest):** drop the four functions; `alter table commitments drop column work_item_id;` drop the five tables (children first: journey_events, journey_instantiations, work_items, implementation_role_assignments, stage_instances); drop the five `implementations` columns. **This destroys recorded facts once `kickoff_at`/`journey_type`/`parent_implementation_id` are populated** — the rollback script therefore (a) raises unless those columns are entirely null OR (b) first copies the non-null rows into a `_rollback_0011_saved_columns` table it leaves behind. Stated precondition: clean rollback only before real usage; after usage it is a data-loss operation requiring the saved-columns escrow.

**0012_seed_and_backfill.sql** — seeds + backfill.
- Seed `journey_roles`; seed **four published templates**: New Logo v1 (stages-only verbatim: exact `lifecycle.ts` ids/labels, advisory, null durations, zero tasks/questions) and Add-On/Integration/Data-Migration v1 (published, starter content from the brief, `version_note='Initial seed from v2 brief — content review pending'`).
- Backfill (skip-and-report): implementations whose `current_stage` normalizes under the alias CTE get pins + derived `stage_instances` (`provenance='backfill_observed'` where history rows exist, `'backfill_inferred'` for positionally-done stages with no history row — null timestamps, never invented) + one `journey_events` kind `backfilled` per implementation recording the alias map and per-stage derivation. Non-normalizing implementations are **skipped** into `_backfill_0012_skipped(implementation_id, current_stage)` with `raise notice` — no assertion aborts the deploy; they stay on the legacy path. `implementation_stage_history` receives zero writes. Post-check emits counts only.
- **Rollback (ordered, with stated precondition):** valid *before any non-backfill instantiation or work-item creation* — the script raises if `work_items` is non-empty or `journey_instantiations` contains rows not created by this migration's backfill (backfill creates none, so any row blocks). Order: `delete from journey_events where kind='backfilled'`; `delete from stage_instances where provenance like 'backfill_%'`; `update implementations set journey_template_id=null, journey_type=null, template_version=null where journey_template_id in (seeded ids)`; delete seeded template_tasks/stages/questions/templates (the `on delete restrict` on journey_instantiations no longer blocks because the precondition guarantees no instantiation rows) ; delete seeded roles; drop `_backfill_0012_skipped`. History untouched throughout, so pre-migration state is exactly restored under the precondition; after real usage, rollback is instead "flip both flags off" (full behavioral revert without data loss), which is the supported late-rollback story.

**0013_drop_sequence_compat_views.sql** — one release after cutover verification.
- `drop view if exists journeys, journey_steps, journey_enrollments;` remove the `/api/cron/journeys` alias route in the same deploy (the `/journeys` 301 page redirects are permanent).
- **Rollback:** recreate the three views (verbatim DDL kept in the migration comment).

Deployment/flag choreography: 0009 + rename code = one coordinated deploy (shippable alone; the rename itself is unflaggable and said so). 0010–0012 apply with both flags false — zero behavior change (verify: /portfolio, /customers, advancement, cron SLA all traverse legacy paths; backfilled columns/rows are read by nothing while flags are off). Template-content review window sits between 0012 and flipping `feature_journey_templates`. Flip `feature_journey_templates` → builder + template-aware creation; flip `feature_work_items` → plans, templated advancement, rollup surfaces. Each flip reverts via `portal_app_config` update, no migration.

## Risks

- Rename window: between 0009 applying and the code deploy, live traffic hits the email feature — mitigated by auto-updatable compat views, the cron alias, and dual-claim token verification; residual: a Vercel cron tick during the seconds the new vercel.json isn't live (30-min cadence makes one missed tick harmless) and PostgREST schema-cache reload lag (seconds).
- Outstanding tracked email links: /view/$token JWTs live 30 days with k='journey'; dropping the old claim acceptance before 0013 + 30 days silently breaks links already in customers' inboxes — the verifier keeps both claims until then.
- Stage-vocabulary surface breadth: even with the named-file checklist now in the plan (stage-advance-write.tsx, customers.$customerId.tsx:1237, home-triage.ts:245, leadership.ts, graduation-readiness.ts, api.cron.sla.ts:159, portal.server.ts:152-161, hub-format.ts, customer360-derive.ts, customers.index), a missed grep-resistant call site would misrender templated implementations the day feature_work_items flips — per-file tests plus one integration test that walks a non-new-logo implementation through every listed surface is the gate for the flag flip.
- Backfill inference is now provenance-marked but still inference: 'backfill_inferred' done-stages have no timestamps and WS7 must exclude them from dwell math (history remains the only metrics source); UI must render the inferred badge or users will read invented completeness as fact.
- Skipped-backfill stragglers: implementations left in _backfill_0012_skipped run the legacy path indefinitely; if ops never migrates them, the portfolio contains a permanent mixed population — acceptable but must be monitored (the report table is the worklist).
- supabase-js has no client transactions (createImplementation documents its own partial-failure mode); if instantiation/recalc/advancement/reorder are implemented as sequential inserts instead of the specified RPCs, partial plans and half-applied diffs are certain — the RPCs are load-bearing, not optional.
- Recorded-vs-computed 'blocked': work_items.status includes 'blocked' (human statement) while dependency blockage is computed; any code path auto-writing status='blocked' from dependencies violates evidence-over-inference and corrupts WS5's waiting/blocked signal — enforce in review + a test asserting no server function writes it.
- Launch-gate coupling: launchAcceptanceGate keys on literal 'launch'; a builder user renaming/omitting that stage_key in a new_logo-type template silently drops the product's only hard gate until WS3 — the builder warning is advisory only; consider a publish-time hard warning requiring acknowledgment.
- RLS exposure: the work_items customer-select policy is the first row-level customer exposure of plan data and is deliberately customer-scoped (shared items visible across ALL of that customer's implementations, including future recovery motions); the mandated portal-authorization tests must cover the visibility conjunct and the cross-implementation read before feature_work_items flips.
- Template immutability rests on a trigger (correctly, since service-role writes bypass RLS); if the trigger is ever disabled for a 'quick fix', pinned versions can silently mutate under live implementations.
- Drag-reorder must go through the single reorder_positions RPC; naive per-row PostgREST updates hit the deferrable uniques mid-drag.
- Pull-in evaluates include_when against LIVE scoping answers while the instantiation snapshot holds the originals; the modal now states which answer set is used and flags edited answers, but the two-answer-set situation remains a comprehension hazard in the evidence trail.
- Seeded Add-On/Integration/Data-Migration content is engineering-authored from the brief; if the content-review checklist item is skipped before the flag flips, real projects instantiate unreviewed plans — v2 republish fixes forward, but early instantiations stay pinned to the unreviewed v1 (pull-in mitigates, does not erase).
- 0011/0012 late rollback is lossy by nature; the supported late revert is flags-off (behavioral revert, zero data loss), and the migration rollback scripts guard themselves with preconditions rather than pretending losslessness.

## Open questions

- Gate mode for migrated New Logo v1: WS1 says 'migrated verbatim' (advisory = current behavior) but WS3 says 'default the migrated template to warn'. Seeding advisory now and flipping to warn when WS3's confirm dialog ships — confirm that sequencing.
- Content sign-off owner for the seeded Add-On / Integration / Data-Migration v1 templates: they ship published with engineering-authored starter content and a review checklist item gating the flag flip — who is the named reviewer, and is publish-then-revise-as-v2 acceptable versus holding the flag until review completes?
- Is the immediate 301 of /journeys → /sequences acceptable, or does the team want a deprecation-banner period first? (Tracked links keep working either way via the 30-day dual-claim window.)
- Rebase semantics: is pin-forever with per-task pull-in provenance the end state, or should a project be able to fully rebase onto a newer version (accepting all changes) — and what happens to items the new version removed?
- Can customer_contacts own work items at instantiation (role party='customer'), and is resolving customer roles required at creation or deferrable until WS4's portal completion flows exist?
- Is the journey strictly linear (single active stage, matching advanceStage today)? Data-Migration/rollout motions with parallel active stages would change stage_instances semantics and rail rendering materially — design assumes linear.
- Template write gate: is portal_can_manage() (admin/super_admin/manager) correct, or does the brief's 'Implementation Lead' need a new portal role before the builder ships?
- When a scoping answer is edited post-instantiation, should the system proactively offer the add/remove diff (design: offer, never silently apply), or are answers frozen after creation?
- Canonical journey_type list: seeding new_logo/add_on/integration/data_migration/rollout/recovery — confirm the set and whether 'recovery' (CS-triggered, no closed deal) belongs in the template picker now or Phase 4+.
- Is coalesce(kickoff_at, contract_start_date, created_at) the business-correct 'project_start' fallback for existing records that predate the kickoff_at field? (New records now capture kickoff_at explicitly at creation.)
- Default selection rule for the account-page implementation switcher: 'most recently created active implementation' is the proposed deterministic default — confirm, or specify a business rule (e.g. primary motion flag).

## Adversarial critique (panel record)

{
  "verdicts": [
    {
      "aspect": "Non-negotiable: evidence over inference",
      "verdict": "flawed",
      "reason": "Mostly honored (due_at stored with basis+offset, dependency-blocked computed never written, recalc diff before save, instantiation snapshot with exclusion reasons). Two violations: (a) the 0012 backfill writes stage_instances.status='done' for stages that have NO implementation_stage_history row (older-vocabulary records), i.e. invented state stored as a recorded row with no provenance marker distinguishing observed-done from inferred-done — the design's own risk list admits null entered_at but still writes 'done'; (b) stage_instances.entered_at/exited_at is a second copy of history data ('convenience mirror') — a duplicated source of truth the brief's philosophy argues against, with no stated reconciliation rule when they disagree."
    },
    {
      "aspect": "Non-negotiable: every existing URL keeps working",
      "verdict": "sound",
      "reason": "Verified against the repo: /journeys and /journeys/$journeyId get 301s to /sequences*, /view/$token (src/routes/view.$token.tsx) is kept with the verifier accepting both k:'journey' and k:'sequence' so 30-day tokens in sent emails survive, /api/cron/journeys keeps a Bearer-authenticated alias one release (vercel.json cron confirmed at */30), and cron auth (CRON_SECRET, timingSafeEqual in api.cron.journeys.ts) is unaffected by the alias. No other route consumes the journey vocabulary in URLs."
    },
    {
      "aspect": "Non-negotiable: reversible migrations / rollback honesty",
      "verdict": "flawed",
      "reason": "0009 rollback is honest (requires coordinated redeploy, stated). But 0010 as written cannot apply: journey_template_stages declares source_block_id REFERENCES journey_stage_blocks, which the design creates AFTER the stages table. 0011's rollback claim 'no data outside the new tables is lost' is false once kickoff_at / journey_type / parent_implementation_id are populated — dropping those columns destroys recorded facts. 0012's rollback claim 'restores the exact prior state' only holds before any real usage: journey_instantiations.template_id has no ON DELETE clause, so deleting the seeded New Logo v1 template fails once any instantiation row exists, and the rollback script's delete order for answers/events/ad-hoc items is unspecified."
    },
    {
      "aspect": "Non-negotiable: feature-flag independent shippability",
      "verdict": "sound",
      "reason": "portal_app_config exists (0001, RLS-enabled, admin update policy verified) and is a workable flag store; flags default false, 0010–0012 are additive, and the claim that flag-off paths are byte-for-byte legacy is credible because loaders branch on presence of stage_instances. Caveats worth stating but not disqualifying: the Sequences rename itself cannot be flagged (it's a mandated Phase-1 naming item riding in this workstream), the 0012 backfill mutates implementations rows regardless of flag state (behaviorally inert), and note 'config admin write' is UPDATE-only — flag keys must be inserted by migration, which 0010 does."
    },
    {
      "aspect": "Breakage of existing code paths",
      "verdict": "flawed",
      "reason": "Three concrete misses found by reading the code the design claims to change. (1) createImplementation (hub.server.ts:1377) hardcodes current_stage:'handoff' AND inserts a 'handoff' history row; instantiate_journey takes implementation_id and 'writes the first implementation_stage_history row exactly as createImplementation does today' — for any template whose first stage is not 'handoff' this yields a stale open 'handoff' history row plus a duplicate/conflicting first row and a current_stage overwrite; the two creation paths are never reconciled. (2) stage-advance-write.tsx:51 computes next = nextLifecycleStage(currentStage) CLIENT-side and hides the button when null — the server-side advanceStage branch alone leaves the advance UI dead (or sending a wrong toStage that advanceStage rejects) for every non-new-logo template; the component is absent from the design's touched-surfaces list (§5), as is home-triage.ts:245 which does the same. (3) leadership.ts, graduation-readiness.ts, api/cron/sla.ts:159 and portal.server.ts:152-161 all hard-derive from LIFECYCLE_STAGES/normalizeStage; the design parks these in 'risks' with a 'needs a checklist' note instead of in the plan, yet templated implementations misrender there the moment feature_work_items flips. The Sequences-rename code inventory itself is accurate (journeys.server.ts, journeys.functions.ts incl. ensureDefaultJourney, sidebar, cron, token verifier all covered)."
    },
    {
      "aspect": "Migration safety (mechanics of the rename window)",
      "verdict": "sound",
      "reason": "The compat-view strategy is verified against actual old-code usage: journeys.server.ts does plain selects, insert-returning, update, delete, count head queries, and a 23505-code-dependent conflict fallback — all of which work through simple auto-updatable security_invoker views with base-table defaults and constraint errors passing through; engagement_events/content_items genuinely have no collision (confirmed in 0006 DDL); policies/FKs/indexes ride along with ALTER TABLE RENAME. Residual risks (cron tick during the deploy gap, PostgREST schema-cache reload) are acknowledged and low."
    },
    {
      "aspect": "RLS / authorization holes",
      "verdict": "flawed",
      "reason": "The load-bearing hole: the three SECURITY DEFINER RPCs are 'granted to service role/authenticated-internal' — 'authenticated-internal' is not a Postgres role. If they are granted to `authenticated` (the 0005 idiom the design cites grants helper functions to authenticated), every customer portal login (customer_users are role `authenticated`) can call instantiate_journey/apply_date_recalc/advance_templated_stage via PostgREST RPC, and as SECURITY DEFINER they bypass the tables' internal-only RLS — unless each function body asserts portal_is_internal(), which the design never specifies. Second gap: the internal app runs entirely on supabaseAdmin (hub.server.ts, journeys.server.ts, portal.server.ts all use service role), so template-table RLS protects nothing on the builder path; real enforcement must be requireInternal/portal_can_manage checks in the new server functions, and the design only says 'the builder UI enforces the same' — UI enforcement is not authorization. The work_items customer-select policy itself correctly mirrors 0005's milestones policy with the visibility conjunct, but note it is customer-scoped, not implementation-scoped: a customer login sees shared items across ALL of that customer's implementations (incl. a future recovery motion)."
    },
    {
      "aspect": "Naming-collision handling (Journeys → Sequences)",
      "verdict": "sound",
      "reason": "Rename-first ordering (0009 before any journey_* creation), verified table inventory (journeys/journey_steps/journey_enrollments renamed; engagement_events/content_items correctly left alone), dual-claim token verification for in-flight 30-day email links, cron alias plus vercel.json update, and 301s is the right shape and matches the brief's mandated rename. Cosmetic inconsistencies only: the design claims instance-side tables follow the unprefixed convention yet names journey_events/journey_instantiations/journey_roles with the prefix, and audit_log rows keep entity_type 'journey'/'journey_enrollment' strings for the email feature after the rename (historical rows fine, but new sequence writes will keep emitting 'journey.*' actions unless journeys.server.ts audit calls are renamed too — unstated)."
    },
    {
      "aspect": "Phase-2 definition of done",
      "verdict": "flawed",
      "reason": "DoD #3 (recalc diff) and #5 (drift + selective pull-in with per-item v2 provenance) are properly designed. DoD #1 fails the workstream as specced: the brief says 'Seed four published templates'; the design publishes only New Logo v1 and punts Add-On/Integration/Data-Migration to drafts via an open question. DoD #2 fails as designed: the createImplementation/instantiate_journey double-write and the client-side advance button (see code-breakage aspect) break creating and moving a non-new-logo implementation, and the new-implementation flow never captures kickoff_at even though 'dates relative to kickoff' is the acceptance test. DoD #4 (both implementations rolled up under one account) is booked as a Phase-1 'sequencing risk' rather than delivered: loadCustomer360 already supports an implementationId pick and /portfolio lists per-implementation rows, but the account-page rollup surface is absent from §5's UI list and portal.server.ts still derives a single tracker."
    }
  ],
  "mustFix": [
    "Reconcile the two creation paths: either instantiate_journey creates the implementation row itself (atomic, with the template's first stage) and the legacy createImplementation remains the flag-off path only, or createImplementation stops hardcoding current_stage:'handoff' + the 'handoff' history row when a template is chosen. As designed, a non-new-logo instantiation leaves a stale open 'handoff' history row plus a conflicting first-stage row (hub.server.ts:1402-1423).",
    "Add src/components/stage-advance-write.tsx (next computed client-side via nextLifecycleStage at line 51) and src/lib/home-triage.ts:245 to the touched-surface plan, sourcing 'next' from stage_instances when present — otherwise the advance button is dead or rejected for every templated implementation and DoD #2 cannot pass. Do the same promotion (risks → plan with named files) for leadership.ts, graduation-readiness.ts, api/cron/sla.ts:159 and portal.server.ts progress math.",
    "Specify authorization inside the three SECURITY DEFINER RPCs: revoke from public/anon AND assert portal_is_internal() (portal_can_manage() for template-mutating paths) in the function body, because 'authenticated-internal' is not a Postgres role and a grant to `authenticated` exposes them to customer portal logins via PostgREST RPC.",
    "Name the server-function guards for the builder and plan mutations (requireInternal + portal_can_manage, the journeys.functions.ts pattern): the app runs on supabaseAdmin, so RLS does not protect any internal write path; 'the builder UI enforces the same' is not enforcement.",
    "Fix 0010 DDL ordering: create journey_stage_blocks before journey_template_stages, or add the source_block_id FK with a later ALTER — the migration as listed fails on a forward reference.",
    "Replace the 0012 abort-on-anomaly assertion with skip-and-report semantics for implementations whose current_stage does not normalize (pre-handoff values, import junk), and define their backfill outcome explicitly — the assertion as written contradicts the design's own tolerance for those rows and can strand the whole deploy.",
    "Make rollback claims honest: 0011 must acknowledge that dropping kickoff_at/journey_type/parent_implementation_id destroys recorded data once populated (or gate the drop on emptiness); 0012 must add ON DELETE behavior or an explicit ordered-delete for journey_instantiations (template_id FK has no ON DELETE and blocks template deletion after first use) and state its rollback precondition ('before any non-backfill instantiation').",
    "Mark backfilled stage-instance state as derived: either a distinct status/flag for stages inferred 'done' with no history row, or a mandatory backfill journey_events row recording the alias map and derivation per implementation — invented 'done' rows with no provenance violate evidence-over-inference.",
    "Resolve the four-published-templates requirement before claiming WS1 compliance: get explicit sign-off that Add-On/Integration/Data-Migration ship as drafts, or commit to seeding them published with named content owners — currently a mandated deliverable is parked in openQuestions.",
    "Put the account-page multi-implementation rollup (DoD #4) in scope or obtain written confirmation it lands in Phase 1 before this phase's flag flips: §5's UI list has no rollup surface and portal.server.ts still derives a single stage tracker.",
    "Capture kickoff_at in the new-implementation flow (it is the 'project_start' basis for DoD #2's relative dates); the design adds the column and a coalesce fallback but no input surface ever sets it.",
    "Extend the rename to the audit vocabulary going forward: journeys.server.ts audit() calls emit 'journey.*' actions and 'journey'/'journey_enrollment' entity types that will collide semantically with the new journey_events log — rename emitted actions to 'sequence.*' at cutover (historical rows stay as-is)."
  ]
}
