# Design: Journey Templates + Work Items

> Produced by the v2 Step-0 design panel (workflow wf_f952802b-e7e, 2026-08-29).
> Each design was drafted, adversarially critiqued, and revised. Status: revised.

# Journey Templates + Work Items — REVISED design for GCinternal-Portal (Workstreams 1–2)

Grounded in: `supabase/migrations/0001–0008`, `src/lib/lifecycle.ts`, `src/lib/hub.server.ts` (`createImplementation`, `advanceStage`), `src/lib/launch-gate.ts`, `src/lib/hub-format.ts`, `src/lib/journeys.server.ts` + `src/routes/journeys.*` + `src/routes/api.cron.journeys.ts` + `vercel.json`, `src/components/lifecycle-rail.tsx`, `src/components/stage-advance-write.tsx` (client-side `nextLifecycleStage`, line 51), `src/lib/portal.server.ts` (`loadPortalHome`), `src/lib/presale.server.ts` (deal-conversion implementation creation ~471–497), `src/routes/settings.tsx` (leaf route, no Outlet), RLS patterns in 0005/0006.

**Revision note (critic response):** all eleven mustFix items are accepted and incorporated — I verified the load-bearing ones against the repo (brief line 106 mandates four *published* seeds; `stage-advance-write.tsx:51` computes `toStage` client-side; nothing in `src/` reads `portal_app_config`; `settings.tsx` is a leaf `createFileRoute('/settings')`). No rebuttals. Also folded in the minor caveats from the sound verdicts: instance-side tables lose the `journey_` prefix (`plan_events`, `plan_instantiations`), backfilled rows carry provenance, the RLS enforcement story is corrected to loader-level, audit vocabulary for Sequences is addressed, and former risk 8 is rewritten (the account page already handles multiple implementations; the real gap is `/portal`).

---

## 0. The naming decision (blocking everything else)

**Facts in the repo:** the email-drip feature owns tables `journeys`, `journey_steps`, `journey_enrollments` (plus `engagement_events`, `content_items`, no prefix), routes `/journeys`, `/journeys/$journeyId`, `/api/cron/journeys` (referenced by `vercel.json` crons), `/view/$token` (JWT claim `{k:'journey'}`, 30-day expiry, `TAM_TOKEN_SECRET`), and the sidebar entry in `src/components/app-sidebar.tsx`.

**Decision: rename the email feature to "Sequences" first (DB + routes), then the template system takes the `journey_` prefix — but only for *template-side* tables.** Template-side: `journey_templates`, `journey_template_stages`, `journey_template_tasks`, `journey_stage_blocks`, `journey_roles`. Instance-side tables follow the hub's unprefixed convention (`implementations`, `commitments`, `milestones`): `stage_instances`, `work_items`, `scoping_questions`, `scoping_answers`, `plan_events`, `plan_instantiations`, `implementation_role_assignments`. (Revised: the previous draft's `journey_events`/`journey_instantiations` violated this rule; renamed.)

Why reuse `journey_` for templates rather than `playbook_`/`template_`:
1. The brief's vocabulary and mandated column names (`journey_type`, `journey_template_id` on `implementations`) call this a journey; a second prefix creates the exact code/UI vocabulary split WS8 eliminates.
2. Hub tables use unprefixed descriptive names; `journey_templates` fits. `portal_` is claimed by presale; a third prefix family worsens the namespace zoo.
3. The brief demands the Sequences rename anyway; doing it *first* (0009, before 0010 creates any `journey_*` table) makes the prefix unambiguous at every point in history.

**Rename mechanics (email → Sequences):**
- DB: `alter table journeys rename to sequences`, `journey_steps → sequence_steps`, `journey_enrollments → sequence_enrollments`. Policies, indexes, constraints and FKs ride along with a Postgres table rename (policy *names* keep old text; cosmetic).
- Compatibility views for the deploy window: `create view journeys with (security_invoker=true) as select * from sequences;` (same for the other two). These single-table views are auto-updatable; `journeys.server.ts` uses only plain insert/update/delete (verified — including the 23505 catch in `enrollContact`, which surfaces identically through a view), so currently-deployed code keeps reading and writing until the code cutover.
- Routes: new `/sequences`, `/sequences/$sequenceId`; `/journeys` and `/journeys/$journeyId` become thin `redirect({ to: "/sequences", statusCode: 301 })` routes — kept forever (user bookmarks). Sidebar label "Sequences" ("Email drip" hint).
- Cron: add `/api/cron/sequences` with the same handler, update `vercel.json` in the same deploy; keep `/api/cron/journeys` as a Bearer-authenticated alias for one release.
- Tracked links: `/view/$token` stays; `verifyJourneyToken` accepts claim `k in ('journey','sequence')` so 30-day tokens in already-sent emails keep resolving; new tokens sign `k:'sequence'`.
- Audit vocabulary (revised, was unaddressed): existing `audit_log` rows keep their historical action strings (`journey.step_sent`, entity_type `journey_enrollment`) — audit rows are immutable records. New writes use `sequence.*` / `sequence_enrollment`. The audit viewer gains a label map rendering both string families as "Sequence …", so the trail reads consistently without rewriting history.
- Code: `journeys.server.ts → sequences.server.ts`, row types `JourneyRow → SequenceRow`, etc. Mechanical.

---

## 1. Template-side schema (migration 0010)

All tables carry the standard `org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id)` seam. Text-state columns use `check` constraints (0006 idiom), never enums.

**Revised DDL order (mustFix 1): `journey_roles` and `journey_stage_blocks` are created FIRST**, so `journey_template_stages.source_block_id` has its target. Creation order within 0010: `journey_roles` → `journey_stage_blocks` → `journey_templates` → `journey_template_stages` → `journey_template_tasks` → `scoping_questions` → `scoping_answers` moves to 0011 (it references `implementations` only, and is instance-side data).

```sql
create table journey_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '...0001' references orgs (id),
  key text not null,              -- 'implementation_manager','solutions_engineer','customer_data_owner',...
  name text not null,
  party text not null default 'internal' check (party in ('internal','customer','partner')),
  description text,
  unique (org_id, key)
);

create table journey_stage_blocks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '...0001' references orgs (id),
  key text not null,
  name text not null,
  description text,
  stage_definition jsonb not null,   -- shape of a journey_template_stages row (minus ids)
  tasks jsonb not null default '[]', -- array of journey_template_tasks shapes (minus ids)
  created_by uuid references portal_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

-- A template VERSION is a row; a FAMILY is a key. Publishing v2 inserts a new
-- row; the v1 row is never mutated (live implementations pin to it by FK).
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
  source_block_id uuid references journey_stage_blocks (id) on delete set null,  -- valid: blocks created above
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
  offset_days int not null default 0,      -- negative allowed for target_launch ("T-14")
  duration_days int not null default 1,
  is_optional boolean not null default false,
  include_when jsonb,                      -- null = always; DSL below
  depends_on_keys text[] not null default '{}',
  unique (template_id, task_key),
  unique (template_stage_id, position) deferrable initially deferred
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
```

**Why `task_key`/`depends_on_keys` (strings) instead of the brief's `depends_on uuid[]` on templates:** template rows are copied on every republish and block insertion; uuid refs would need rewriting per copy and make drift diffing impossible. The stable per-family key is the identity; at instantiation keys resolve to concrete `work_items.depends_on uuid[]` (the brief's shape, on the instance side where ids are stable).

Stage blocks are editor-only artifacts copied into templates with `source_block_id` provenance, never referenced live (instantiate-don't-reference). Editing a block offers "also update the N *draft* templates using it"; never touches published versions.

**`include_when` DSL** (pure TS module `src/lib/journey-conditions.ts`, used client-side for builder preview and mirrored in the SQL of `instantiate_journey` — the `launch-gate.ts` shared-predicate pattern): `null` → always; object → AND of clauses keyed by `question_key`; scalar → equality; object value → `{">": n}`, `{">=": n}`, `{"<": n}`, `{"in": [..]}`, `{"contains": x}`, `{"exists": true}`. Missing answer → clause false, and the result records `missing: [keys]` so preview and instantiation snapshot both show *why* each task was in/out.

## 2. Instance-side schema (migration 0011)

```sql
alter table implementations
  add column journey_template_id uuid references journey_templates (id),  -- pins the exact VERSION row
  add column journey_type text,
  add column template_version int,
  add column parent_implementation_id uuid references implementations (id) on delete set null,
  add column kickoff_at timestamptz;      -- recorded at creation (see flow); NO created_at fallback

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
  source text not null default 'instantiation'
    check (source in ('instantiation','backfill','manual')),   -- provenance (mustFix 8)
  entered_at timestamptz,   -- DERIVED MIRROR of implementation_stage_history, which stays authoritative;
  exited_at timestamptz,    -- recomputable via resync; WS7 metrics read history, never these
  unique (implementation_id, stage_key),
  unique (implementation_id, position)
);

create table scoping_answers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '...0001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  question_key text not null,   -- keyed by KEY: survives version pull-ins; WS6 writes SF facts here
  value jsonb not null,
  source text not null default 'manual' check (source in ('manual','salesforce','api')),
  answered_by uuid references portal_profiles (id),
  answered_at timestamptz not null default now(),
  unique (implementation_id, question_key)
);

create table work_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '...0001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  stage_instance_id uuid references stage_instances (id) on delete set null,
  template_task_id uuid references journey_template_tasks (id) on delete set null,
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
-- Idempotency (mustFix 9): instantiation and drift pull-in can never duplicate a templated item.
create unique index work_items_task_key_idx
  on work_items (implementation_id, task_key) where task_key is not null;
create index stage_instances_implementation_idx on stage_instances (implementation_id);
create trigger work_items_touch before update on work_items for each row execute function portal_touch_updated_at();

alter table commitments
  add column work_item_id uuid references work_items (id) on delete set null;  -- link, never merge

-- Structured event log for the plan layer (renamed from journey_events — instance side is unprefixed).
create table plan_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '...0001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  work_item_id uuid references work_items (id) on delete cascade,
  kind text not null check (kind in
    ('instantiated','backfilled','status_change','dependency_override','date_recalc_applied',
     'task_pulled_from_template','reassigned','bulk_action','scoping_reevaluated','stage_resynced')),
  actor_id uuid references portal_profiles (id),
  detail jsonb not null,
  created_at timestamptz not null default now()
);
create index plan_events_impl_idx on plan_events (implementation_id, created_at desc);

-- The instantiation record: evidence for how the plan was generated (renamed from journey_instantiations).
create table plan_instantiations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '...0001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  template_id uuid not null references journey_templates (id),
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

### Authorization model (corrected per mustFix 4 + 5)

**The enforcement point is application code, not RLS.** Every loader and mutation in this codebase — including all of `portal.server.ts` — runs through `supabaseAdmin` (service role), which **bypasses RLS entirely**. Authorization is code-level: `requireInternal`/`requireCustomerIds`, and the `ticket_comments` precedent filters `internal = false` in the loader. Therefore:

- **Primary enforcement:** the WS4 portal loader that ever returns work items to a customer MUST filter `visibility = 'shared'` and scope by `customer_users.customer_id` → `implementations.customer_id`, exactly like `ticket_comments`. The brief-mandated portal-authorization tests target **this loader path** (assert: internal-visibility item never serialized to a customer session; customer of account A never receives account B's items), not the RLS policy.
- **Defense-in-depth only:** RLS policies still ship on every new table (template-side: select `portal_is_internal()`, writes `portal_can_manage()`; instance-side: all verbs `portal_is_internal()`; `work_items` additionally a customer select policy on `visibility='shared'` + `customer_users` join, mirroring the 0005 `milestones` policy). They protect any *future* user-scoped client, and cost nothing. The design no longer claims they change `/portal` behavior — they don't.
- **RPCs are service_role-only.** `instantiate_journey`, `apply_date_recalc`, `advance_templated_stage`, `publish_template`, `reorder_template_positions`, `resync_stage_instances`: `security definer`, then `revoke execute ... from public, anon, authenticated; grant execute ... to service_role;`. There is no "authenticated-internal" Postgres role (the previous draft invented one); granting to `authenticated` would expose these to customer logins via PostgREST `/rpc`. Belt-and-braces: each function body ALSO asserts the passed `actor_id`'s profile satisfies `portal_is_internal()`-equivalent (writes: manage-level where appropriate) so a future user-scoped caller stays safe.
- **Launch gate re-checked inside the RPC:** `advance_templated_stage` re-evaluates the launch-acceptance predicate in SQL (same tables `launch-gate.ts` reads) whenever the target `stage_key = 'launch'`, and raises unless satisfied or an explicit recorded waiver argument is passed — the TS layer remains the UX, the RPC is the enforcement, so a direct call can never skip the product's only hard gate.
- **Existing hole, hardened in passing:** `advanceImplementationStage`'s server function currently uses `requireSupabaseAuth` only — any authenticated user, customers included, can advance stages today. This workstream changes its middleware to `requireInternal`. Small, behavior-preserving for every legitimate caller, and a precondition for building more powerful mutations on this path.

## 3. Behavior rules

**Feature flags — real control plane (mustFix 3).** Nothing in `src/` reads `portal_app_config` today, so the flags get an actual read/write path shipped with 0010:
- `src/lib/server/app-config.server.ts`: `getFeatureFlag(key): Promise<boolean>` via `supabaseAdmin` with a 60-second in-memory cache (module-level, per serverless instance; worst case a flip takes one minute to propagate — acceptable and documented).
- Admin surface: a "Feature flags" card on the settings page (admin/super_admin only, enforced in the server function via `requireInternal` + role check, since the write also goes through `supabaseAdmin` and RLS won't apply). One toggle per key, writes `portal_app_config`, `audit_log` row per flip.
- Flags: `feature_journey_templates` (builder + template-aware creation flow) and `feature_work_items` (plan panel, templated next-stage computation, recalc/pull-in UI). Seeded `false` in 0010.

**Flag-off consistency (mustFix 2) — the contradiction is resolved by splitting sync from steering:**
- *Sync is unconditional:* from the deploy that accompanies 0012 onward, `advanceStage` **always** updates `stage_instances` when they exist (close current instance `done`/`exited_at`, open next `active`/`entered_at`) — in addition to its exact existing writes (close open `implementation_stage_history` row, insert new row, update `implementations.current_stage`/`stage_entered_at`). This is invisible bookkeeping on tables no UI reads while the flag is off, so "flag off = legacy behavior" stays true *and* the backfilled instances never desync.
- *Steering is flag-gated:* the **choice of next stage** comes from `stage_instances` order only when `feature_work_items` is on; off, it remains `nextLifecycleStage` from the TS constant. For New Logo (the only journey that exists while the flag is off) the two computations are provably identical strings, so the branch is byte-equivalent either way.
- *Safety net:* `resync_stage_instances(implementation_id)` RPC recomputes instance statuses/timestamps from `implementation_stage_history` (the authority); the flag-flip runbook runs it across all implementations and writes `plan_events` kind `stage_resynced` for any row it corrected. Divergence is therefore detectable and self-healing, and `stage_instances.entered_at/exited_at` are documented as a derived mirror — WS7 metrics read history only.

**Instantiation (`instantiate_journey` plpgsql RPC — atomic; supabase-js has no client transactions and `createImplementation`'s own error message admits partial-failure risk):**
1. Inputs: `implementation_id`, `template_id` (must be `status='published'`), `answers jsonb`, `roles jsonb`, `actor_id`.
2. Upsert `scoping_answers`; evaluate `include_when` per task (SQL mirror of the TS DSL; SQL is enforcement, TS is preview).
3. Create `stage_instances` (`source='instantiation'`, first stage `active`); write the first `implementation_stage_history` row exactly as `createImplementation` does today; set `current_stage`/`stage_entered_at`; pin `journey_template_id`, `journey_type`, `template_version`.
4. Create `work_items` for included tasks (the `(implementation_id, task_key)` partial unique makes re-runs conflict instead of duplicate — the RPC upserts `on conflict do nothing` for idempotency): resolve `role_key` → `owner_id`/`customer_owner_contact_id` (unresolved roles stay null with `role_key` kept — "Solutions Engineer (unassigned)", never an invented person); map `depends_on_keys` → uuids; copy offsets into `due_basis/due_offset_days/duration_days`; compute `due_at` only where the basis date is *recorded*: `project_start` = `kickoff_at`, else `contract_start_date`, else **null** (the `created_at` fallback is removed — an unrecorded kickoff yields no due date plus a "no kickoff recorded" prompt, not an invented one); `target_launch` = `target_launch_date` else null; `stage_entry` = null until entered.
5. Write `plan_instantiations` + `plan_events` kind `instantiated`.

**Kickoff capture (mustFix 10b):** the new-implementation flow adds a required "Kickoff date" field (date picker defaulting to today, editable) writing `implementations.kickoff_at`; editing it later runs the same recalc-diff flow as `target_launch_date`. Existing records keep `kickoff_at` null; their `project_start` items show the recorded `contract_start_date` basis or no date.

**Both implementation-creation paths are covered (mustFix 6c):** the form path calls `instantiate_journey`; **`presale.server.ts` deal conversion** (which today inserts `implementations` + first history row directly) is changed in the same deploy as 0012 to route through `instantiate_journey` pinned to New Logo v1 (stages-only when `feature_journey_templates` is off; template picker in the conversion UI when on). Post-migration, no code path can create an untemplated, unpinned implementation invisible to `journey_type` filters and drift tooling.

**Dependency gating (evidence over inference):** "blocked by dependencies" is **computed, never written** — `effectively_blocked = depends_on.some(pred => pred.status not in ('done','skipped'))`; recorded `status='blocked'` remains a human statement. Marking done over open predecessors is rejected server-side unless the call carries `override: { reason }`, which writes `plan_events` kind `dependency_override` with `{reason, open_dependencies:[{id,title,status}], actor}` before completing; shown in item history.

**Relative dates + recalc diff:** editing `target_launch_date` or `kickoff_at` computes proposed `due_at` for every open, non-hand-edited item on the matching basis and returns the diff **without saving**; the dialog renders it; confirm calls `apply_date_recalc` (atomic: date change + item updates + one `plan_events` kind `date_recalc_applied` with the full diff). Cancel applies nothing, not even the date. Hand-edited dates appear greyed: "pinned by hand — not recalculated".

**Waiting-on:** `status='waiting'` requires `waiting_on_party`; `waiting_since` stamped server-side; clearing nulls both; elapsed periods recoverable from `plan_events` (feeds WS5).

**Versioning + drift + selective pull-in:**
- *Republish is a single ordered transaction — the `publish_template(draft_id, version_note)` RPC (mustFix 7):* within one transaction it (1) stamps the old published row's `superseded_by_id = draft_id` — the row thereby *leaves* the partial unique index `journey_templates_current_idx` — then (2) sets the draft `status='published'`, `published_at`, `version_note`. Ordered this way each statement's uniqueness check passes; the UI "Publish" button calls only this RPC. Draft creation (duplicate current version's rows, version+1, `supersedes_id`) is likewise one RPC. Published rows are protected by an immutability trigger raising on content-column updates when `status='published'` — a trigger, not a policy, because triggers fire for service role too.
- *Drift detection:* `/settings/templates` lists per family every implementation whose pinned version has `superseded_by_id is not null`.
- *Pull-in:* diff by `task_key` (added / changed-shown-not-applied / removed-informational); per implementation the manager ticks added tasks; the server re-evaluates `include_when` against **live** `scoping_answers` (warning when excluded, and the pull-in modal states which answer set is used — live, not the instantiation snapshot), resolves roles via `implementation_role_assignments`, inserts `work_items` with `template_task_id` → the v2 task row (per-item provenance, honest about partial adoption; the partial unique index makes double-submission a no-op), writes `plan_events` kind `task_pulled_from_template`. Pinned `template_version` unchanged.

**Commitments:** stay their own table and UI section; linkable to a work item via `commitments.work_item_id`, chip both ways; fulfilling one never auto-completes the other.

## 4. Seeds + backfill (migrations 0012, 0013)

**0012 — New Logo v1 + backfill (behavior-preserving):**
- Seed `journey_roles` (implementation_manager, solutions_engineer, sales_owner, cs_owner, customer_champion, customer_data_owner).
- Seed **New Logo Implementation v1**: `key='new-logo'`, `journey_type='new_logo'`, `status='published'`, 8 stages with `stage_key` = exact `lifecycle.ts` ids, labels verbatim, phases mapped, `gate_mode='advisory'` (WS3 flips to `warn` when its confirm UI exists — see open questions), zero tasks/questions. Stages-only v1 IS the brief's "migrated verbatim": existing records gain a pinned template and instances, no work items, so `/portfolio` and `/customers` behavior is provably unchanged.
- Backfill every implementation: pin columns; derive `stage_instances` (`source='backfill'`) from `implementation_stage_history` **without touching it**, normalizing via an in-SQL alias CTE mirroring `STAGE_ALIASES` (`plan→plan-internal, align→align-external, validate→validate-iterate, prove-value→adopt, graduate/cs→graduate-to-cs`); per canonical stage `entered_at=min`, `exited_at=max`; status done/active/pending by position vs normalized `current_stage`. One `plan_events` kind `backfilled` per implementation with `detail = {derived_from:'implementation_stage_history', matched_stages, unmatched_history_values, current_stage_raw}` — inferred rows are provenance-stamped and visually distinguishable (the UI badges `source='backfill'` instances "derived from history").
- **Non-normalizing `current_stage` handled explicitly, never aborting (mustFix 8):** implementations whose `current_stage` fails the alias map (pre-handoff values like `qualify`/`scoping`, or unknown strings from CSV/presale imports) get all instances `pending` (no `active`), a `plan_events` `backfilled` row flagging `unmatched_current_stage`, and a `raise notice` per id; the migration ends with a summary notice ("N implementations backfilled, M with unmatched current_stage — see plan_events"). The hard assertion is downgraded to: raise only if any implementation ends with *more than one* `active` instance (a true derivation bug). Pre-handoff history rows map to no instance and render exactly as today via `PRE_HANDOFF_STAGE_LABELS`.
- `lifecycle.ts` is kept: seed source of truth, flag-off fallback, and the permanent home of `STAGE_ALIASES`/`normalizeStage` for historical rows.

**0013 — the other three published seeds (mustFix 10a):** the brief (line 106) mandates "Seed four published templates", so all four ship **published** — this is no longer deferred behind an open question. **Add-On Module**, **Integration**, and **Data Migration** are seeded with stages, tasks, roles and scoping questions authored by engineering strictly from the brief's own examples and motions: Integration carries scoping questions `integration_type` (select: erp/mes/none), `plants` (number), `environments` (select), with `{"integration_type":"erp"}` including the sandbox + field-mapping task block and `{"plants":{">":1}}` including the per-site rollout block — exactly the brief's worked examples, satisfying DoD-2 ("answer three scoping questions, see the correct conditional tasks generated"). All three are flag-gated (invisible until `feature_journey_templates` flips) and version-1, so a content owner can review and republish v2 through the builder before real use; the request for that review is an open question, the seeds themselves are not.

**Backfill of roles note (mustFix from rollback review):** `implementation_role_assignments`/`work_items` reference `journey_roles.key` as strings (deliberately, for copy-safety), so 0012's rollback deletes seeded roles ONLY where no assignment/work_item references the key — the down script guards each delete with a `not exists`, and reports (notice) any keys it must leave behind.

## 5. UI surfaces touched

1. **`/settings` restructure + `/settings/templates`** (mustFix 6d): `settings.tsx` is today a leaf `createFileRoute('/settings')`; it becomes a layout route with an `<Outlet/>` + section nav, its current content moves verbatim to `settings.index.tsx` (URL `/settings` unchanged — non-negotiable), and `settings.templates.tsx` is added (manager+): family list, version history, drift counts; builder — drag-reorder (single `reorder_template_positions` RPC per drop, since deferrable uniques only help inside one transaction; naive per-row PostgREST updates would violate mid-drag), stage/task editors, `include_when` structured editor, dependency picker, stage-block library, scoping-question editor, preview pane (pure TS evaluator; excluded tasks greyed with failing clause), Publish dialog (version note → `publish_template` RPC). Builder warns when a `new_logo`-type template lacks a `launch` stage_key (launch-gate coupling). Drift panel → per-implementation pull-in modal. Also here: the admin-only Feature-flags card.
2. **New-implementation flow**: template picker (current published versions), **required kickoff date**, scoping questions, role-resolution step (skippable; unresolved = unassigned), generated-plan preview, create → `instantiate_journey`. Deal conversion in presale gets the same treatment (§3).
3. **`/customers/$customerId` Plan section**: checklist grouped by `stage_instance` (owner avatar, party badge, due date with basis+offset on hover, waiting-on chip, computed dependency-blocked indicator, "derived from history" badge on backfilled instances); timeline/Gantt toggle (no Kanban); multi-select bulk bar (reassign / shift ±N with diff preview / mark done with per-item override prompts); ad-hoc "Add item"; commitment↔work-item chips both ways.
4. **`stage-advance-write.tsx`** (mustFix 6a): stops computing `toStage` client-side via `nextLifecycleStage` (line 51); the loader supplies `nextStage` derived server-side (from `stage_instances` when `feature_work_items` is on, from the TS constant otherwise), and the component submits that value. Without this, any non-new-logo journey's advance button computes a wrong/absent next stage.
5. **`portal.server.ts` `loadPortalHome`** (mustFix 6b): `progress_pct` currently divides by `LIFECYCLE_STAGES.length` and `stageDisplay` falls back to raw keys — both become stage_instances-aware (count/position/name from the implementation's instances when present, legacy constant otherwise). Required in THIS workstream: DoD-2 creates a second, non-new-logo implementation, and without this `/portal` shows 0% and machine keys for it. Which implementation(s) the portal shows when several exist remains a WS4/Phase-1 question — but what it shows must render correctly now.
6. **`LifecycleRail`** and the portal `StageTracker`: optional `stages` prop from `stage_instances`; defaults to `LIFECYCLE_STAGES` — New Logo renders pixel-identical.
7. **`stageLabel`/`StageBadge`, `customers.index` `stageIndex` sort, `customer360-derive.ts` progress**: resolve from joined `stage_instances` (name/position) when present; `normalizeStage` + humanized-key fallback keeps every legacy call site safe. **`sow-analysis.server.ts`** (minor): its LLM prompt's stage list comes from the implementation's stage_instances when present.
8. **Sequences rename**: sidebar label, `/sequences*` routes, permanent 301s from `/journeys*`, audit-viewer label map.
9. **`/portal` work items**: rendering shared items is WS4; this workstream only guarantees the loader-filter contract and tests are in place (§2 authorization model).

## Proposed migrations

Numbered continuations of `supabase/migrations/` (next free: 0009). **Reversibility is encoded, not narrated (mustFix 11):** every up migration `00NN_*.sql` ships with a committed `supabase/down/00NN_down.sql` containing the verbatim inverse DDL/DML, referenced from the up file's header comment; before merge, each pair is exercised (up → down → up) against a Supabase branch database (`supabase db` CLI or MCP `create_branch`), and that check is a PR checklist item. The repo's applied-migration convention stays up-only; `down/` is the tested escape hatch the brief's "reversible" demands.

Order matters: the rename MUST precede any `journey_*` creation.

**0009_sequences_rename.sql**
- `alter table journeys rename to sequences;` `journey_steps → sequence_steps;` `journey_enrollments → sequence_enrollments;` (policies/indexes/FKs ride along; `engagement_events`, `content_items` untouched).
- Compat views for the deploy window: `create view journeys with (security_invoker=true) as select * from sequences;` (×3) — auto-updatable; verified `journeys.server.ts` uses only plain insert/update/delete.
- Same deploy: `/sequences*` routes + permanent 301s from `/journeys*`; `/api/cron/sequences` + `vercel.json` cron path (keep `/api/cron/journeys` alias one release); token verifier accepting `k in ('journey','sequence')`; new audit writes use `sequence.*` strings with viewer label-map for old rows.
- **down/0009_down.sql:** drop the three views; rename the three tables back. (Redeploy prior code.)

**0010_journey_templates.sql**
- Create, IN THIS ORDER (fixes the forward-FK failure): `journey_roles`, `journey_stage_blocks`, `journey_templates`, `journey_template_stages` (its `source_block_id` FK now valid), `journey_template_tasks`, `scoping_questions`. Partial unique `journey_templates_current_idx`; deferrable position uniques; published-content immutability trigger (trigger, not policy — fires for service role).
- RLS defense-in-depth: select `portal_is_internal()`, writes `portal_can_manage()` on all six.
- RPCs `publish_template(draft_id, version_note, actor_id)` and `reorder_template_positions(...)`: security definer; `revoke execute from public, anon, authenticated; grant execute to service_role;` bodies assert actor is manage-level. `publish_template` transaction order: stamp old row's `superseded_by_id` FIRST (row leaves the partial index), then set draft published — publish is never order-dependent from the UI.
- `portal_app_config` inserts: `feature_journey_templates:false`, `feature_work_items:false`. Same deploy ships the flag read path (`app-config.server.ts`) and the admin Feature-flags card — the flags have a real control plane from day one.
- **down/0010_down.sql:** drop the two functions, the trigger + function, the six tables in reverse order; delete the two config keys. No existing table touched; rollback total.

**0011_work_items.sql**
- `alter table implementations add column journey_template_id / journey_type / template_version / parent_implementation_id / kickoff_at;` create `stage_instances` (with `source` provenance column), `scoping_answers`, `work_items`, `plan_events`, `plan_instantiations`, `implementation_role_assignments`; `alter table commitments add column work_item_id;` indexes incl. the idempotency partial unique `work_items_task_key_idx (implementation_id, task_key) where task_key is not null`; touch trigger; RLS (internal-only; `work_items` adds the visibility-scoped customer-select policy mirroring 0005 `milestones` — documented as defense-in-depth, since all app reads use supabaseAdmin and enforcement is loader-level).
- RPCs `instantiate_journey`, `apply_date_recalc`, `advance_templated_stage`, `resync_stage_instances`: security definer, execute revoked from public/anon/authenticated, granted to **service_role only**; bodies assert internal actor; `advance_templated_stage` re-checks the launch-acceptance predicate in SQL for `stage_key='launch'`.
- Same deploy: `advanceStage` gains the unconditional stage_instances sync write + flag-gated next-stage steering; `advanceImplementationStage` middleware hardened `requireSupabaseAuth → requireInternal`; `stage-advance-write.tsx` switches to server-supplied nextStage; presale deal conversion routes through `instantiate_journey`.
- **down/0011_down.sql:** drop the four functions; `alter table commitments drop column work_item_id;` drop the six tables (children first); drop the five implementation columns. Additive/nullable throughout; no data outside new tables lost.

**0012_seed_new_logo_v1.sql**
- Seed `journey_roles`; seed New Logo v1 published: 8 stages, `stage_key` = exact `lifecycle.ts` ids, labels verbatim, `gate_mode='advisory'`, durations null (no invented numbers), zero tasks/questions.
- Backfill: pin all implementations; insert `stage_instances` with `source='backfill'` derived from `implementation_stage_history` via the STAGE_ALIASES CTE (`entered_at=min`, `exited_at=max`, status by position vs normalized current_stage); one `plan_events` kind `backfilled` per implementation recording matched/unmatched values. Implementations with non-normalizing `current_stage` (pre-handoff/CSV/presale values): all instances `pending`, flagged in their `backfilled` event, per-id `raise notice`, summary notice at end — **the migration never aborts on them**. Hard assertion only for >1 active instance (true derivation bug). Pre-handoff history rows skipped (render via `PRE_HANDOFF_STAGE_LABELS` as today). **`implementation_stage_history` receives zero writes.**
- **down/0012_down.sql:** delete `plan_events` kind `backfilled`; delete `stage_instances` where `source='backfill'` (or template_stage_id in v1's stages); null the pin columns where `journey_template_id` = v1 id; delete v1 stages + template; delete seeded `journey_roles` guarded by `not exists` against `implementation_role_assignments`/`work_items.role_key` references (notice for any key left behind). History untouched, so state restores exactly.

**0013_seed_templates_addon_integration_datamigration.sql**
- Seed Add-On Module, Integration, Data Migration — **published v1** (brief line 106 mandates four published; flag-gating keeps them invisible until `feature_journey_templates` flips). Content authored from the brief's own examples: Integration ships scoping questions `integration_type`/`plants`/`environments` and the erp → sandbox+field-mapping block, `plants>1` → per-site rollout block; task offsets conservative; roles from the seeded `journey_roles`. Version-note: "seeded from v2 brief — review before use"; content owner republishes v2 via the builder.
- **down/0013_down.sql:** delete the three templates (cascades stages/tasks/questions) after guarding that no implementation pins them (raise with the list if any does).

**0014_drop_sequence_compat_views.sql** — one release after cutover verified.
- `drop view if exists journeys, journey_steps, journey_enrollments;` remove the `/api/cron/journeys` alias route in the same deploy (page 301s from `/journeys*` are kept forever).
- **down/0014_down.sql:** recreate the three views verbatim.

**Deployment/flag choreography:** 0009 + rename code = one deploy (shippable alone). 0010 + flag control plane = one deploy. 0011 + advanceStage sync/hardening + presale routing = one deploy. 0012/0013 apply with both flags false — zero behavior change, verifiable (`/portfolio`, `/customers`, advancement all legacy; the only new writes are invisible stage_instances syncs). Flag-flip runbook for `feature_work_items`: run `resync_stage_instances` across all implementations, review `stage_resynced` events, then flip in the admin card. Each flip reversible in the UI without a migration.

## Risks

- Rename window: between applying 0009 and the code deploy, live traffic hits the email-drip feature — mitigated by auto-updatable compat views, the cron alias, and the dual-claim token verifier; residual risk is a Vercel cron tick during the vercel.json cutover seconds (30-min cadence makes one missed tick harmless, but verify the first post-deploy tick).
- Outstanding tracked email links: /view/$token JWTs live 30 days with claim k='journey'; dropping old-claim acceptance or the /view route before 0014 + 30 days silently breaks links already in customer inboxes.
- Stage-vocabulary spread: the touch list now includes stage-advance-write.tsx, portal.server.ts loadPortalHome, presale.server.ts conversion, settings.tsx restructure, customers.index stageIndex sort, customer360-derive progress, cron/sla graduate-to-cs special case, and sow-analysis.server.ts — but this remains the largest code-touch surface; it needs the checklist + tests treatment (a grep-audit for LIFECYCLE_STAGES/nextLifecycleStage/normalizeStage imports as a PR gate), not spot fixes.
- Flag-off desync residual: the unconditional stage_instances sync in advanceStage only covers stage moves made through the app; any manual SQL stage fix (service key) between 0012 and flag-flip still desyncs instances — the flag-flip runbook's resync_stage_instances pass is mandatory, not optional.
- Backfill derivation limits: implementations whose history predates the current vocabulary get instances with null entered_at and positional statuses; rows are provenance-stamped source='backfill' and dwell math must come from implementation_stage_history (authoritative) — any WS7 metric reading stage_instances timestamps is a bug.
- In-memory flag cache: getFeatureFlag caches 60s per serverless instance, so a flip propagates unevenly for up to a minute across concurrent lambdas; acceptable for these flags but must not be reused for authorization decisions.
- supabase-js has no client-side transactions; if instantiation/recalc/publish/pull-in/reorder bypass the specified RPCs (e.g. a future contributor 'simplifies' to sequential inserts), partial plans, half-applied diffs, and mid-drag constraint violations return — lint/PR-review guard: no multi-write plan mutation outside an RPC.
- Recorded-vs-computed 'blocked': work_items.status includes 'blocked' (human statement) while dependency blockage is computed; any code path auto-writing status='blocked' from dependencies violates evidence-over-inference and corrupts WS5's waiting/blocked signal.
- Launch gate coupling: launchAcceptanceGate and the RPC's SQL re-check key on the literal stage_key 'launch'; a builder user omitting/renaming that key in a new_logo-type template silently drops the product's only hard gate until WS3 — the builder warns on this (UI item 1) but a warning can be ignored; WS3's configurable gates are the real fix.
- Customer exposure surface: enforcement for shared work items is the WS4 loader filter (supabaseAdmin bypasses RLS everywhere); the RLS policy is defense-in-depth only. The mandated portal-authorization tests must target the loader path and must exist BEFORE any portal surface renders work items — a forgotten visibility filter in a future loader is the realistic leak vector.
- Security-definer RPC surface: functions are granted to service_role only and assert internal actors in-body, but they are powerful (advance stages, rewrite dates); any future grant loosening to 'authenticated' re-opens direct PostgREST /rpc access for customer logins — the revoke/grant block in each migration is load-bearing and should be covered by a test that anon/authenticated cannot execute them.
- Template immutability depends on a trigger (correct choice — triggers fire for service role, policies don't apply to it), but a superuser or a migration can still disable triggers; published-version mutation would silently corrupt the provenance of every pinned implementation.
- Seeded Add-On/Integration/Data-Migration content is engineering-authored from the brief's examples, not practitioner-authored; shipping them published (as the brief mandates) means the first real use could run on unreviewed content if the flag flips before the named owner's review — the version-note flags this, but process, not code, prevents it.
- Drift pull-in evaluates include_when against LIVE scoping answers while plan_instantiations holds the ORIGINAL snapshot; the pull-in modal states which answer set is used, but users comparing the two surfaces can still be confused when answers were edited post-creation.
- One-implementation-per-customer assumptions in /portal: loadPortalHome is made render-correct for templated implementations in this workstream, but which implementation(s) a customer login sees when several exist is deferred to WS4/Phase 1 — until then the portal shows the existing single-pick behavior with correct rendering.

## Open questions

- Gate mode for the migrated New Logo v1: WS1 says 'migrated verbatim' (= advisory, current behavior) but WS3 says 'default the migrated template to warn'. The seed ships advisory (verbatim wins at Phase 2); confirm the flip to warn lands with WS3's confirm-dialog and not before.
- Seeded Add-On / Integration / Data-Migration content: the brief mandates they ship PUBLISHED and the design complies (0013, flag-gated, content authored strictly from the brief's examples). Who is the named owner to review and republish v2 through the builder before feature_journey_templates flips for real users, and is flag-flip blocked on that review?
- Is an immediate permanent 301 of /journeys → /sequences acceptable, or does the team want a deprecation-banner period first? (Tracked-link tokens are honored for their full 30-day life either way.)
- Rebase option: is pin-forever-with-per-task-pull-in the end state, or should a project be able to fully rebase onto a newer version (accepting all changes) — and if so, what happens to work items whose task_key the new version removed?
- Customer-party role resolution at creation: may customer_contacts be assigned as work-item owners at instantiation (e.g. 'Customer Data Owner'), or is customer-role resolution deferred until the WS4 portal can surface those items to the assignee?
- Journey linearity: the design assumes a single active stage (matching today's advanceStage); do Data-Migration or phased-rollout motions need parallel active stages? That changes stage_instances semantics and rail rendering materially and should be decided before the Data-Migration template sees real use.
- Template write gate: is portal_can_manage() (admin/super_admin/manager) the right publisher set, or does the brief's 'Implementation Lead' role need a new portal role before non-managers can edit templates?
- Post-creation scoping edits: when an answer changes after instantiation, the design offers an add/remove diff and never silently applies — confirm answers should remain editable at all, versus frozen with changes flowing only through the pull-in path.
- Canonical journey_type list: seeding covers new_logo/add_on/integration/data_migration and the check constraint reserves rollout/recovery — confirm the set, and whether 'recovery' (CS-triggered, no closed deal) enters the template picker now or Phase 4+.
- project_start for pre-existing records: with the created_at fallback removed, legacy implementations without kickoff_at use contract_start_date or show 'no kickoff recorded' — should the app prompt owners to backfill kickoff_at from their records (a recorded fact), and is contract_start_date an acceptable interim basis for due-date math?
- Hardening advanceImplementationStage from requireSupabaseAuth to requireInternal closes an existing hole (customers can currently advance stages) — confirm no legitimate customer-facing flow depends on it before the middleware change ships.

## Adversarial critique (panel record)

{
  "verdicts": [
    {
      "aspect": "Evidence over inference (non-negotiable)",
      "verdict": "sound",
      "reason": "Genuinely honored: due_at stored with its basis+offset inputs, due_at_edited pins hand-set dates against recalc, dependency-blocked is computed and never written to status, recalc shows a diff before an atomic apply, journey_instantiations records the scoping snapshot with per-task exclusion reasons, and dependency overrides require a written reason. Two caveats stop short of violation: the 0012 backfill writes stage_instances.status='done' by position for stages history may never actually show (positional inference stored as a recorded row with no derived/backfilled marker), and stage_instances.entered_at/exited_at duplicates the authoritative implementation_stage_history, creating a divergence surface the design itself must police."
    },
    {
      "aspect": "Every existing URL keeps working (non-negotiable)",
      "verdict": "sound",
      "reason": "Verified against the code: /journeys and /journeys/$journeyId get 301s (brief explicitly allows 301), /view/$token stays and the dual-claim verifier (k in journey|sequence) matches the actual signJourneyToken claim shape and 30-day expiry in journeys.server.ts, the /api/cron/journeys Bearer-authed alias matches vercel.json's real cron entry, and /api/v1, /portal, /customers, /portfolio are untouched. The plan to keep page 301s forever while dropping only the cron alias is the right split."
    },
    {
      "aspect": "Feature-flag shippability (non-negotiable)",
      "verdict": "flawed",
      "reason": "Two real defects. (1) Internal contradiction: the advancement rule is 'if the implementation has stage_instances, take the new branch', but 0012 backfills stage_instances onto EVERY implementation — so with both flags false, stage advancement takes the templated branch, falsifying the 'byte-for-byte legacy' claim; and even if the branch is flag-gated, legacy advanceStage does not update stage_instances, so every stage move between applying 0012 and flipping feature_work_items silently desyncs the backfilled instances (the 'active' instance falls behind current_stage). (2) portal_app_config is referenced nowhere in src/ — the app has no read path for these flags and no UI writes that table (its RLS update policy is admin-only via the user-scoped client, which no code uses), so 'each flip is reversible without a migration' really means 'someone runs SQL with the service key'."
    },
    {
      "aspect": "Breakage of existing code paths",
      "verdict": "flawed",
      "reason": "The design's risk list gestures at the stage-vocabulary spread but its concrete touch list misses verified call sites: (a) stage-advance-write.tsx computes toStage client-side via nextLifecycleStage from the TS constant — for any non-new-logo templated implementation the advance button computes the wrong/no next stage and the server rejects it; the design edits only the server side. (b) portal.server.ts loadPortalHome computes progress_pct from LIFECYCLE_STAGES.length and stageDisplay falls back to raw stage keys — yet UI item 8 claims /portal is 'unchanged in this workstream'; the moment DoD-2's second implementation exists, the customer portal shows 0% progress and machine keys for it. (c) presale.server.ts (~471–497) is a second implementation-creation path (deal conversion) that inserts implementations + first history row directly — never mentioned; post-flag it creates untemplated, unpinned implementations invisible to journey_type filters and drift tooling. (d) settings.tsx is a leaf createFileRoute('/settings') with no Outlet — /settings/templates requires restructuring the route, not just adding a file. (e) sow-analysis.server.ts feeds the 8 lifecycle ids into an LLM prompt (minor). The claims it does make about advanceStage, launch-gate, normalizeStage, customers.index, customer360-derive, lifecycle-rail, and the cron/sla graduate-to-cs special case all check out against the code."
    },
    {
      "aspect": "Migration safety and rollback honesty",
      "verdict": "flawed",
      "reason": "(1) 0010 as written fails to apply: journey_template_stages declares source_block_id references journey_stage_blocks, which is created later in the same file — forward FK reference errors unless reordered or added via a later ALTER. (2) The partial unique index (org_id,key) WHERE published AND superseded_by_id IS NULL makes publish-v2 order-dependent: setting v2 to published before stamping v1.superseded_by_id violates the index; the design describes publish as UI steps, not a single ordered transaction/RPC. (3) The 0012 'sanity assertion' (raise unless exactly one active/terminal instance) will ABORT the production migration for any implementation whose current_stage fails to normalize — pre-handoff or unknown values are plausible given the presale/CSV import paths — with no specified handling. (4) 0012 rollback deletes seeded journey_roles while implementation_role_assignments/work_items reference role keys as strings (no FK protects, but data dangles if anything was created). (5) The repo has up-only migration files; rollback exists as prose in the design, which matches repo practice but means 'reversible' is asserted, never encoded or tested — the brief demands reversible migrations, so at minimum each down script should ship verbatim. The rename mechanics themselves (policies/FKs riding along, auto-updatable views — verified journeys.server.ts uses no upserts) are honest."
    },
    {
      "aspect": "RLS / authorization holes",
      "verdict": "flawed",
      "reason": "The design misidentifies the enforcement point. Every loader and mutation in this codebase — including all of portal.server.ts — runs through supabaseAdmin (service role, bypasses RLS); authorization is code-level (requireInternal/requireCustomerIds, and the ticket_comments precedent filters internal=false in the loader). So the claim that shared work items 'become readable' in /portal under the new RLS policy is false — nothing changes for portal reads, and conversely the policy will not save a WS4 loader that forgets the visibility='shared' filter. Second hole: 'granted to service role/authenticated-internal' — no authenticated-internal role exists in Postgres; granting EXECUTE to authenticated exposes instantiate_journey, apply_date_recalc, and advance_templated_stage to customer principals (customer logins are real authenticated users) via PostgREST /rpc, and a security-definer advance_templated_stage callable directly bypasses the TS-side launch gate — the only hard gate in the product. The functions must assert portal_is_internal()/portal_can_manage() in their bodies or be granted to service_role only. Third: the design inherits without noting that advanceImplementationStage's middleware is requireSupabaseAuth only (any authenticated user, customers included, can advance stages today) — building more privileged RPCs on that pattern widens an existing hole."
    },
    {
      "aspect": "Naming-collision handling",
      "verdict": "sound",
      "reason": "The rename-first sequencing (0009 before any journey_* creation), compat views, dual token claim, and cron alias are all verified workable against the actual code: journeys.server.ts uses only plain insert/update/delete (auto-updatable views support all three, including the 23505 catch in enrollContact), the token verifier's k:'journey' check and 30-day expiry match, vercel.json's cron path matches, and the sidebar entry exists as claimed. Minor unaddressed items: journey_events and journey_instantiations sit on the INSTANCE side yet take the journey_ prefix, violating the design's own 'instance tables are unprefixed' rule; audit action strings ('journey.step_sent', entity_type 'journey_enrollment') are not renamed, leaving mixed vocabulary in the audit trail; the missing-cron-tick window during the vercel.json cutover is acknowledged."
    },
    {
      "aspect": "Phase-2 definition of done",
      "verdict": "flawed",
      "reason": "DoD items 1, 3, and 5 (builder with deps/party/visibility, recalc diff, version drift + selective pull-in) are designed convincingly. But: (a) Workstream 1 and the Phase-2 sequencing line both say 'Seed FOUR PUBLISHED templates' — the design ships one published stages-only New Logo and defers Add-On/Integration/Data-Migration as drafts behind an open question; the brief's rule is stop-and-ask, so this must be resolved before the phase can claim done, and as designed Phase 2 does not meet its stated scope. (b) DoD-2 requires 'dates relative to kickoff', yet the new-implementation flow never captures kickoff_at — the coalesce silently substitutes created_at, which is an invented kickoff, ironic given the evidence-over-inference banner. (c) DoD-4 (both implementations rolled up under one account, separate in /portfolio) leans entirely on the existing customers.$customerId implementation list and loadCustomer360's implementationId parameter — this actually exists in the code, so it passes, but the design's own risk 8 wrongly claims the page 'picks an arbitrary one', suggesting the author did not verify the surface the DoD depends on."
    }
  ],
  "mustFix": [
    "0010 DDL ordering: create journey_stage_blocks before journey_template_stages, or add the source_block_id FK via a later ALTER — as written the migration fails on a forward FK reference.",
    "Resolve the flag contradiction: gate the templated-advancement branch on feature_work_items AND decide how stage_instances stay consistent while the flag is off — either advanceStage always updates stage_instances when they exist (flag gates UI only) or a resync runs at flag-flip. As specified, 0012's universal backfill + 'has stage_instances' branching makes 'flag off = byte-for-byte legacy' false and guarantees desync.",
    "Give the feature flags a real control plane: code that reads portal_app_config (nothing in src/ touches it today) and an admin surface (or documented service-role procedure) to flip keys — its RLS allows update only, admin-only, via a user-scoped client no code path uses.",
    "Fix the RPC authorization: drop the fictional 'authenticated-internal' grant; security-definer instantiate_journey / apply_date_recalc / advance_templated_stage must assert portal_is_internal() (writes: portal_can_manage() where appropriate) in their bodies or be granted to service_role only — otherwise customer principals can call them via PostgREST /rpc, and advance_templated_stage called directly bypasses the launch gate. Re-check the launch gate inside the RPC, not only in TS.",
    "Correct the RLS story: state that supabaseAdmin bypasses RLS everywhere, make the WS4 loader filter (visibility='shared', scoped by customer_users) the primary enforcement per the ticket_comments precedent, keep the policy as defense-in-depth, and write the brief-mandated portal-authorization tests against the loader path.",
    "Add the missed code paths to the touch list: stage-advance-write.tsx (client-side nextLifecycleStage must use stage_instances for templated journeys), portal.server.ts loadPortalHome progress_pct + stageDisplay, presale.server.ts deal-conversion implementation creation (must pin New Logo v1 / instantiate, or be explicitly documented as legacy-path), and restructure settings.tsx (needs an Outlet/layout) for /settings/templates.",
    "Make publish/republish a single ordered transaction (stamp old row's superseded_by_id before setting the new row published) — otherwise the partial unique index journey_templates_current_idx fires mid-publish; specify it as an RPC like the other multi-write operations.",
    "0012 backfill: handle implementations whose current_stage does not normalize (pre-handoff or unknown values from CSV/presale imports) explicitly — map, skip-with-report, or fail with a named list — instead of an assertion that aborts the production migration; and stamp backfilled stage_instances with derivation provenance (e.g. a backfilled flag or an 'instantiated' journey_events row noting derived-from-history) so inferred statuses are visually distinguishable from recorded ones.",
    "Add a partial unique index on work_items (implementation_id, task_key) WHERE task_key IS NOT NULL so instantiation and drift pull-in are idempotent — without it a double-submitted pull-in duplicates plan items.",
    "Resolve the four-published-seeds question BEFORE claiming Phase 2 done (the brief says stop and ask — shipping one published template is a scope deviation, not an open question to default), and add kickoff_at capture to the new-implementation flow so 'dates relative to kickoff' rests on a recorded date, not a silent created_at fallback.",
    "Ship the rollback SQL for 0009–0013 as actual down scripts (kept in-repo, tested against a branch database), not prose — 'reversible numbered migrations' is a non-negotiable and currently exists only as narrative."
  ]
}
