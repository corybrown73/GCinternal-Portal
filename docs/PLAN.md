# V2 Plan — phased, migration-first, approval-gated

Status: **awaiting approval.** Per the brief, no application code is written until this plan is approved.
This plan is built on evidence: `docs/AUDIT.md` (Step 0 audit, every claim verified against the code and the
live database) and the four adversarially-reviewed designs in `docs/design/` — `templates.md`,
`multi-implementation.md`, `portal-access.md`, `salesforce.md`. Where this plan and a design differ, this
plan wins (it exists to resolve their collisions: both the templates and account-model designs claimed
migration `0009`, and both the account-model and Salesforce designs add the same Salesforce key columns).

## Progress

- **Phase 0 — complete** (commits `7136995`…`2a68260`). Migration 0009 applied to production;
  server-side RBAC on all 69 hub/presale server functions; the `'active'` status save bug, the TAM
  approver-role query and its 404 deep link fixed; full-schema typegen; ~4,300 lines of dead weight
  removed; hardcoded Supabase fallbacks dropped; **first test harness and CI** (lint → typecheck →
  test → build, plus a migrations job that executes every down script up→down→up).
- **Phase 1 — complete** (commits `852ccb6`…`f22f0f7`). Migrations 0010 and 0011 applied to
  production; implementation scope enforced in the app layer and honoured in RLS; `?impl=` carried
  on every implementation-derived link; recorded-vs-computed health with a reproducible evidence
  cache; presale handoff matches accounts by Salesforce id and can start a second implementation.
  The `account_model` flag is **off** in production, so all workflow/UX changes are dark; the
  schema, the scope enforcement and the bug fixes are live.
- **Phase 2 — not started.**

Two things from Phase 1 that need your call are listed under "Open from Phase 1" at the end.

## How to read this

1. Skim **Top findings you did not list** — these reshape several workstreams.
2. Read **Decisions needed from you** — the brief said "if a requirement conflicts with the code, stop and
   ask." These ten questions are that ask; each carries a recommendation so you can approve fast.
3. The **Phases** are the execution order. Each names its migrations (one global sequence, `0009`+), its
   rollback posture, its feature flags, and its exit criteria.

Two facts from the audit frame everything:

- **All app reads/writes run on the service-role client** (`src/integrations/supabase/client.server.ts`),
  so RLS is bypassed for app traffic. Authorization is therefore enforced in app code; RLS is
  defense-in-depth. Every design was revised around this.
- **The repo has zero tests and zero CI.** The brief's "reversible migrations" promise is unverifiable
  today. Phase 0 builds the harness that makes every later phase's rollback *executed*, not asserted.

---

## Top findings you did not list

The five that most change the plan (all adversarially verified; details and line references in `docs/AUDIT.md`):

1. **Server-side authorization hole.** Every hub serverFn (Home, Customer 360, portfolio, owners,
   technical solutions) requires only a *valid Supabase JWT* — a customer-role login is kept out of
   internal data by the client-side AuthGate only. The brief said "auth doesn't exist"; the truth is
   worse-shaped: auth exists, and the server trusts it too much. Fixing this is Phase 0 work, before any
   new surface ships.
2. **A live save bug proves the status vocabulary split.** `implementations.status` defaults to
   `'active'` in the DB (no CHECK), but the update schema only accepts
   `on_track|at_risk|blocked|idle` — so saving a SOW, discovery board, or details edit on any
   hub-created implementation **fails validation** until someone manually re-picks a status. Three
   vocabularies coexist for one column (DB default, code enum, derived health).
3. **Split-brain audit.** The hub UI reads `audit_log`, which *nothing writes*; every new code path
   writes `portal_audit_log`, which *nothing reads* — and `audit()` swallows errors, so audit writes are
   best-effort. "Wire the audit log" is a consolidation decision, not a wiring task (question 3 below).
4. **Two unlinked people tables.** 19 hub tables anchor ownership to `team_members` (free-text role, no
   auth link) while auth/RBAC lives in `portal_profiles`; no FK connects them anywhere in 0001–0008.
   Every v2 feature that assigns work or filters "my accounts" needs this resolved first (question 9).
5. **The TAM approval flow is production-broken twice over.** Approver emails go only to legacy
   `role='admin'` profiles (super_admin/manager get nothing) and the email deep-link points to
   `/accounts/{id}?tab=tam` — a route that doesn't exist in this app. Every "open in portal" link 404s.

Also verified and folded into phases below: four UI-rendered tables have **no write path at all**
(`trace_links`, `graduations`, `cs_handoffs`, `requirement_scope_changes`); the presale name-match can
**silently overwrite `salesforce_id`**; the `org_id` tenancy seam covers 38 hub tables but **zero
`portal_*` tables** and no policy filters on it; `portal_profiles` is still `select using(true)` so
customer logins can read every internal staff profile; generated Supabase types cover **half the schema**
(no `portal_*` tables/enums — the presale stage machine is hand-duplicated); computed health already
exists and drives the UI (`deriveHealth`), inverting the brief's premise; and dead weight is concentrated
(41 of 46 shadcn components unused, four dead exports, an unused `reports:write` API scope).

---

## Decisions needed from you

Each has a recommendation; "approve as recommended" on all ten is a valid answer.

1. **Launch gate: blocking or warn?** The brief says migrated template gates default to *warn*, but a
   hard, server-enforced blocking Launch gate already exists (`launch-gate.ts`). **Recommendation:**
   grandfather Launch as *blocking* in the migrated New Logo template — never regress a shipped
   enforcement — and default everything *else* to warn/advisory until WS3's configurable gates land.
2. **Redefine the auth workstream.** Auth + 10 roles + RLS exist. **Recommendation:** re-scope to
   (a) server-side role checks on every hub serverFn (Phase 0), (b) per-role write granularity within
   "internal", (c) "my accounts vs all" filtering. Original "build auth" deliverables are dropped.
3. **Which audit store is canonical?** **Recommendation:** both, with defined jobs — `audit_log` becomes
   the account activity feed (hub mutations start writing it via one helper; the portal design's external
   actions already dual-write it), `portal_audit_log` stays the action-level security/API log. Phase 7
   makes `audit()` failures loud (log + alert), never silent.
4. **Salesforce match precedence.** **Recommendation:** for auto-create, match `implementations` on
   normalized `salesforce_opportunity_id` and `customers` on `salesforce_account_id` — *never* name.
   The presale endpoint keeps its name fallback but **stops overwriting** a present `salesforce_id` on a
   name-matched update (data-integrity fix, Phase 5).
5. **Hardcoded Supabase fallbacks.** The literal URL/publishable key in three client factories papered
   over the env-var pain and carry wrong-project risk. **Recommendation:** keep them through Phase 0,
   then remove once the CI/startup env check lands (fail loudly with a named-variable message). The
   service key already has no fallback.
6. **Health model.** Computed health already ships; manual status coexists. **Recommendation:** adopt the
   account-model design's split — `health_recorded` (human statement, required reason when at_risk/
   blocked, only ever human-written) beside `health_computed` (cached `deriveHealth`, with reproducible
   inputs); computed never overwrites recorded; `'active'` rows backfill to *no recorded health*, and the
   save bug is fixed in Phase 0 by tolerating `'active'` on input while the editor forces a real choice.
7. **Journeys naming collision direction.** **Recommendation:** rename the email-drip feature to
   **Sequences** (tables, routes with permanent 301s, cron alias, dual-claim tokens) *first*, then the
   template system takes the `journey_` prefix — exactly as the templates design specifies.
8. **Multi-implementation shape.** The brief's "one row per customer" premise is false; the schema
   already supports many implementations per account. **Recommendation:** build on the existing
   `customers`/`implementations` shape (additive columns, no rename, no restructure) per the
   account-model design.
9. **People tables.** **Recommendation:** bridge, don't merge, for now: add
   `portal_profiles.team_member_id` (nullable FK) in Phase 1, backfill by email match, make new v2
   ownership columns FK `team_members` (consistent with the 19 existing anchors). A full merge is Phase 7
   scope if still wanted.
10. **Presale/lifecycle stage seam.** The presale tail (`onboarding_kickoff → in_onboarding →
    onboarding_complete`) mirrors hub lifecycle progress but is updated independently.
    **Recommendation:** sync it forward from implementation lifecycle events through
    `portal_transition_stage()` (the only legal writer), flag-gated, in Phase 5 alongside the other
    presale-bridge work. Never sync backward.

---

## Global migration ledger

One sequence, continuing from applied `0008`. Every migration ships with a committed, **CI-executed**
down script (`supabase/down/NNNN_down.sql`, exercised up→down→up on the local stack); data-bearing
rollbacks archive to a schema (`v2_archive`) rather than destroy. The Salesforce-key columns appear
**once** (Phase 1); Phase 5 consumes them.

| # | Migration | Phase |
|---|---|---|
| 0009 | `rls_profile_exposure` — tighten `portal_profiles` select; customers read only their own row | 0 |
| 0010 | `account_model` — `customers.salesforce_account_id` + `csm_owner_id`; `implementations` parent/opportunity-id/health columns; `portal_profiles.team_member_id` bridge; backfills + flag row | 1 |
| 0011 | `portal_implementation_scope` — scoped `customer_users`/`customer_invites`, signup-trigger scope, RLS tightening | 1 |
| 0012 | `sequences_rename` — `journeys→sequences` (×3 tables), compat views, cron/token/301 choreography | 2 |
| 0013 | `journey_templates` — six template tables, publish/reorder RPCs, immutability trigger, flags | 2 |
| 0014 | `work_items` — instance layer (`stage_instances`, `work_items`, scoping, plan events, role assignments), instantiate/recalc/advance RPCs | 2 |
| 0015 | `seed_new_logo_v1` — published v1 from `lifecycle.ts` verbatim; provenance-stamped backfill; never aborts on non-normalizing rows | 2 |
| 0016 | `seed_templates_addon_integration_datamigration` — three more published v1 templates | 2 |
| 0017 | `drop_sequence_compat_views` — one release after cutover verified | 2 |
| 0018 | `handoff_gate` — handoff packet object, accept/return states, `handoff_returned` alert kind | 3 |
| 0019 | `external_access` — grants, plan events, `portal_key`, contact dedupe + unique index, buckets, flags | 4 |
| 0020 | `audit_stores` — `audit_log` actor columns; `portal_audit_log` CHECK widened | 4 |
| 0021 | `work_item_external` — external columns + `work_item_comments`/`work_item_files` | 4 |
| 0022 | `plan_snapshots` — weekly snapshot + share tokens | 4 |
| 0023 | `sf_integration` — supersession pointer, `sf_closed_won_at`, `integration_sync_log`, `integration_field_maps`, outbox, webhook endpoints/secrets | 5 |
| 0024 | `signals_metrics` — anything Phase 6 needs beyond Phase 1's health cache (expected: little or nothing) | 6 |
| 0025 | `audit_consolidation` + people-merge remainder, per decisions 3/9 | 7 |

URL guarantee: every existing URL keeps working; the only redirects introduced are permanent 301s
`/journeys* → /sequences*`.

---

## Phases

### Phase 0 — Harness, hardening, hygiene *(no feature flags; smallest possible schema touch)*

The precondition phase. Nothing user-visible changes except bugs disappearing.

- **CI + test harness** (promoted from the portal design's W4-T0): vitest + `test` script;
  `.github/workflows/ci.yml` running lint → typecheck → build → local Supabase stack (`db reset` applies
  all migrations) → **every down script exercised up→down→up** → test suite. This is the repo's first CI
  and every later phase's rollback proof.
- **Server-side RBAC**: every hub serverFn gains `requireInternal`/role checks (closes finding 1);
  regression test pins customer-role lockout.
- **Bug fixes**: the `'active'` status save bug (tolerate on input, editor forces explicit choice); the
  TAM approver-role query and the 404 deep link; stale copy ("No auth yet…", "Not available yet").
- **Migration 0009**: `portal_profiles` read exposure closed.
- **Dead-weight PR**: 41 unused shadcn components, dead exports, unused `reports:write` scope, dead
  `error-capture.ts`.
- **Type generation** widened to cover `portal_*` tables/enums; the hand-duplicated presale stage array
  collapses into generated types.
- Env: startup check for the service key; hardcoded fallbacks removed per decision 5.

**Rollback:** revert commits; 0009 down restores the old policy. **Exit:** CI green including up/down/up;
customer JWT provably cannot call internal serverFns; SOW save works on a hub-created implementation.

### Phase 1 — Account model & health *(flag: `account_model`)*

The account-model design (`docs/design/multi-implementation.md`), renumbered to 0010/0011. Accounts get
real Salesforce keys; implementations get parent links, opportunity ids, and the recorded/computed health
split; the portal gains implementation-scoped grants (scope *enforcement* is an unflagged invariant; only
UX is flagged); the 12 link call sites that drop `?impl=` are fixed; `startOnboarding` stops dead-ending
second implementations and stops minting duplicate accounts (explicit picker, never name-match).

**Rollback:** 0011/0010 down (columns kept if data written, documented); flag off restores all legacy
workflows — scoped grants must be explicitly deleted to de-scope (by design). **Exit:** two
implementations on one account fully navigable without stage-teleporting; a scoped customer invite sees
exactly one implementation; recorded and computed health render side-by-side with disagreement flagged.

### Phase 2 — Sequences rename, journey templates, work items *(flags: `feature_journey_templates`, `feature_work_items`)*

The templates design verbatim, renumbered 0012–0017: rename first, then versioned templates
(instantiate-don't-reference, publish-inserts-a-row, live implementations pin by FK), the work-item layer
with dependencies/`waiting_on_party`/relative dates/visibility, conditional blocks via scoping answers,
role-based assignment, the template-builder UI, and four **published** seed templates (New Logo migrated
verbatim from `lifecycle.ts`; Launch gate per decision 1). Both flags ship dark; the flag-flip runbook
requires the resync pass.

**Rollback:** each migration's down script; seeds guarded against pinned implementations;
`implementation_stage_history` receives zero writes so legacy state restores exactly. **Exit:** flag-off
production is byte-identical in behavior; flag-on instantiates a templated plan whose stage advance stays
in sync with the legacy machine.

### Phase 3 — Handoff gate *(flag: `handoff_gate`; not design-paneled — sketch below, detailed design happens at phase start)*

The sales→delivery gate the brief centers on: a **handoff packet** assembled from the deal (SOW analysis,
Gong-derived brief, commitments, scoping answers), a **completeness score** computed in app code from
named required fields (never a black box — each missing item listed), and **accept/return**: delivery
accepts the handoff or returns it to sales with reasons (`handoff_returned` alert + email). Builds on
Phase 2's work items (the packet's gaps become work items) and the existing readiness/gate-review pattern.
Migration 0018 only; the score is computed, not stored as truth.

**Rollback:** 0018 down archives packets. **Exit:** a deal can be handed off, returned with reasons, and
re-accepted, with the full trail on the 360.

### Phase 4 — External portal *(flags: `external_plan_view_enabled`, then `external_plan_actions_enabled`)*

The portal-access design verbatim, renumbered 0019–0022: signed magic links (`/plan/$token`, hashed
tokens, optional passcode, expiry, cascade-revocable reassign chains), no accounts needed, task
completion/comment/upload for `contributor` grants, the single `loadSharedPlan` projection choke point
(field-allowlisted DTOs, no internal data, no uuids), engagement telemetry, weekly snapshots, and the
authenticated `/portal` untouched as the strict-IT fallback. The §5 authorization suite gates each flag
flip in CI.

**Rollback:** downs archive grants/events/snapshots to `v2_archive`; `portal_key` deliberately kept
(documented). **Exit:** the full isolation test suite green; a customer completes a task from a link and
the owner sees it, audited in both stores.

### Phase 5 — Salesforce *(flags: `sf_auto_create`, `sf_presale_bridge`)*

The Salesforce design, consuming Phase 1's key columns and adding only its own (0023):
`POST /api/v1/implementations` with the replay/supersede behavior matrix (replay never writes; re-won
after completion → 409 + alert + human-driven supersede RPC), template auto-selection via `default_for`
with recorded inputs, the event outbox feeding outbound webhooks (Zapier write-back) with delivery log,
field-mapping UI + sync log at `/admin/integrations`, OpenAPI at `/api/v1/openapi.json`, the
name-overwrite fix (decision 4), and the presale stage seam sync (decision 10).

**Rollback:** 0023 down archives sync/outbox history. **Exit:** replaying the same closed-won payload
five times yields one implementation and five sync-log rows; write-back events observable in Zapier.

### Phase 6 — Signals & metrics *(read-only surfaces; minimal flagging)*

WS5 + WS7 on the raw materials the audit confirmed exist unread: velocity and dwell-vs-target from
`implementation_stage_history` (authoritative timestamps — never backfilled `stage_instances`), slip
attribution, engagement signals from Phase 4 telemetry (weighting interactive events above bare GETs),
champion-gone-quiet and launch-date-at-risk alert kinds, medians/p90/on-time-rate metrics routes, and
"Waiting on" promoted to the cross-surface backbone. Computed signals **never overwrite** recorded ones.

**Exit:** portfolio answers "what's quietly dying and why" with reasons, from evidence.

### Phase 7 — Platform hygiene completion

The consolidation decisions executed (0025): audit stores per decision 3 with loud failures; people-table
end-state per decision 9; vocabulary cleanup (TIS expanded, dual final-stage names unified, `org_id` seam
extended to `portal_*` tables); write paths or removal for the four write-orphaned tables
(`trace_links`, `graduations`, `cs_handoffs`, `requirement_scope_changes` — graduation flow decides);
global search + saved views; demo-mode toggle; API-key expiry + rate limits.

---

## Sequencing rationale & dependencies

Phase 0 unblocks everything (CI proves every later rollback; RBAC must precede new surfaces). Phase 1
before 2 because scoped portal grants and account identity are the seam Phases 4 and 5 build on, and its
migrations are the smallest. Phase 2 before 3 and 4 because the handoff packet and the external plan both
render work items. Phase 5 after 1 (keys) and 2 (template auto-selection), though it degrades gracefully
without templates. Phases 3, 4, 6 are mutually independent once 2 lands and can reorder on your
priorities — say the word and I'll reshuffle.

Each phase is a deployable, flag-gated unit; stopping after any phase leaves production coherent.

---

## Open from Phase 1

Two decisions surfaced during implementation. Neither blocks Phase 2; both are dark behind the
`account_model` flag today.

1. **Second implementation from the presale side.** The build lets a linked deal start another
   implementation ("Start another implementation" on the deal page). The account-model design
   argued the opposite — that an already-linked deal should route to the Customer 360 instead, and
   that Phase 1 should have *no* presale-side second-onboarding flow, because `portal_accounts` is
   one row per account and an add-on opportunity has nowhere to live in presale. Both routes now
   exist; the design's concern is real but only bites when a single account has several concurrent
   opportunities, which the presale schema cannot represent until the Phase 5 Salesforce work adds
   opportunity identity. **Recommendation:** keep both, revisit when opportunity ids land.
2. **`implementations.source = 'presale'` is stamped unflagged.** It is written on every
   presale-created implementation regardless of the flag. Nothing renders or exports the column
   today, so this is invisible — but it is a (harmless) behavior change with the flag off.
   **Recommendation:** leave it; the provenance is worth having from the start.
