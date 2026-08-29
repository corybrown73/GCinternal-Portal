# Design: Multi-Implementation Migration

> Produced by the v2 Step-0 design panel (workflow wf_f952802b-e7e, 2026-08-29).
> Each design was drafted, adversarially critiqued, and revised (all four revised).

# Phase 1 — Account → many Implementations (design, REVISED)

## 0.0 Critique disposition

All nine mustFix items were re-verified against the repo and are **accepted — none rebutted**. Verification notes that changed the design:
- `access.server.ts:131` really does upsert `customer_invites` with PostgREST `onConflict: "email,customer_id"`; any change to that unique constraint breaks invites at deploy time regardless of index scheme, because PostgREST cannot express the `WHERE` predicate needed to target a partial unique index. Fix: §5.1 + migration Steps 7/8 + the new deploy-ordering rule.
- Every portal read/write runs on `supabaseAdmin` (service role, RLS bypassed); `linkedCustomerIds` (`tickets.server.ts:556`) is the real authorization primitive, and it is also consumed by the customer-role branches of `tickets.functions.ts:63,75,139,179` — a surface the original design missed entirely. Fix: §5.2. RLS is reclassified as defense-in-depth (§5.4) and the risk register reordered.
- No code path and no trigger writes `audit_log` for `implementations.status` (grepped all of `src/` and all migrations — `audit_log` is only ever read by the app; only `portal_audit_log` is written, by `src/lib/server/audit.ts`). Therefore **no human edit of `status` is evidenced anywhere**, an evidence-gated backfill would be a guaranteed no-op, and the original backfill was pure laundering. Fix: the backfill is **removed** (§4), which also moots the audit-deleting rollback.
- `interface Account` already exists at `src/lib/presale-types.ts:19` meaning *presale deal*; the proposed `type Account = CustomerRow` alias is withdrawn (§8).
- The presale schema holds no opportunity id anywhere (`portal_accounts` is one row per account, unique `salesforce_id`, unique `lower(name)`), so "stamp `salesforce_opportunity_id` from presale" was dead code; corrected in §7 rule 1/2.

## 0.1 What the code actually does today (corrected inventory)

Everything below was read, not inferred. Paths repo-relative from `/home/user/GCinternal-Portal`.

**Already multi-implementation-safe (do not touch):**
- `supabase/migrations/0003_hub_tables.sql:69-97` — `implementations.customer_id` is a plain FK; nothing unique. All 20+ child tables key on `implementation_id`.
- `src/routes/customers.$customerId.tsx:139-144, 248-269` — the 360 page takes `?impl=<uuid>` and renders `ImplementationSwitcher` when ≥2 implementations exist.
- `src/lib/hub.server.ts:335-353 (loadCustomer360)` — loads all implementations; picks `?impl=` else newest by `created_at`; unknown id silently falls back.
- `src/lib/hub.server.ts:1388-1431 (createImplementation)` — already creates second implementations for an existing customer (the `NewImplementation` dialog offers existing customers).
- `src/routes/customers.index.tsx` — already one row per implementation. Home triage (`src/lib/home-triage.ts`) — already one queue row per implementation.

**Actual one-per-customer assumptions (the Phase-1 work):**
1. `src/lib/presale.server.ts:447-536 (startOnboarding)` — (a) `alreadyLinked` short-circuit forever blocks a second implementation from presale; (b) always inserts a brand-new `customers` row from the deal name (duplicate-account risk); no SF matching exists on `customers`.
2. `src/lib/portal.server.ts:334-368 (submitPortalTicket)` — "exactly one implementation" heuristic (line 355).
3. Portal scoping — `customer_users`/`customer_invites` (0005) link a login to a **customer**; a portal login sees every implementation of the account. **The enforcement point is the app layer, not RLS**: all portal code runs on `supabaseAdmin` via `requireCustomerIds` (`portal.server.ts:48`) → `linkedCustomerIds` (`tickets.server.ts:556`), which returns bare customer ids with no implementation dimension. Consumers: `loadPortalHome` (:121), `loadPortalTickets` (:281), `submitPortalTicket` (:344), **`replyPortalTicket` (:370-383)**, and the customer-role branches of `tickets.functions.ts:63,75,139,179` (`loadTickets`/`loadTicket`/`createTicket`/`addComment`).
4. **Deep links drop the implementation (complete inventory, 13 sites):** `src/routes/index.tsx:67` (CustomerLink component) **and** `:115` (queue row); `portfolio.tsx:85, 504`; `alerts.tsx:142`; `tickets.$ticketId.tsx:159`; `technical-solutions.$id.tsx:102, 114, 167`; `customers.index.tsx:193`; **`src/components/account-rows.tsx:44, 77`** (the shared per-implementation row used by leadership/owner surfaces — keyed by `row.impl.id` yet linking without `impl`); **and the two post-create navigations** `src/components/implementation-write.tsx:165` and `src/routes/deals.$dealId.tsx:173`, which navigate to the bare customer URL after creating an implementation. (`deals.$dealId.tsx:180` is an account-level link with no specific implementation — it legitimately stays bare.)
5. `customers.index.tsx` copy treats implementation == customer.
6. `journeys` (0006) — `journey_enrollments.customer_id` is account-scoped; `stage_entered` is ambiguous with several stage machines. No schema change in Phase 1; behavior rule in §7.

**Health today:** no health column. `implementations.status` (text, DB default `'active'`, **no CHECK**; app zod enum `on_track|at_risk|blocked|idle`) is the manual flag, but **it is written programmatically too** — `startOnboarding` inserts `'on_track'` at `presale.server.ts:487` and other paths leave the DB default `'active'` — so a `status` value is *not* evidence of a human statement. `deriveHealth()` (`customer360-derive.ts:141-221`) computes from signals, never reads `status`, and branches on: top escalation severity rank ≤1 → blocked; top risk rank 0 → blocked; top risk/issue rank ≤2 → at_risk; overdue commitments; launch overdue (target vs actual dates); `daysSince(stage_entered_at)` > STAGE_FLAG_DAYS; missed/at-risk milestone; else no_signal/on_track — i.e. **identities and severities of specific rows, not counts**.

## 1. Core decision: keep the `customers` table, change its meaning

Unchanged from v1 and confirmed correct by the critic: the shared DB's prototype app owns `accounts` (0003 header collision list) and presale deals live in `portal_accounts`, so no rename and no alias view.
- **`customers` = the Account.** One row per company. Gains `salesforce_account_id`, `csm_owner_id`.
- **`implementations` = the delivery motion.** Many per account; `customer_id` FK name stays (repo convention; renaming touches every query/policy/index for zero behavior).
- Vocabulary flips in **UI copy only**. **No `type Account` alias is introduced** — `interface Account` (`presale-types.ts:19`) already means *presale deal* and is used throughout `src/lib/server/accounts.ts` and the deals routes; adding a second `Account` type recreates the exact three-meanings problem this section exists to prevent. `CustomerRow` stays the post-sale type name; the naming-cleanup workstream may later rename the presale type to `PresaleDeal`, out of Phase-1 scope.

## 2. URLs

- `/customers` and `/customers/$customerId` unchanged; `$customerId` remains the account UUID; nothing redirects.
- Implementation selection stays in `?impl=<uuid>` (already implemented). Rule: **every link or navigation generated from an implementation-scoped record carries `impl`** — all 13 sites in §0.1 item 4, including both post-create navigations (`createImplementation` and `startOnboarding` return the new `implementationId` for exactly this purpose). This makes the default-pick change below safe: the user who just created a second implementation lands on the NEW one because the navigation says so explicitly, not because of tie-breaking.
- Default pick when `impl` absent: "**oldest non-graduated, else newest**" (was: newest) so pre-existing bookmarks keep resolving to the original implementation after an add-on is created. Behind the flag.

## 3. Schema — additive only (DDL sketch; exact SQL in migrations)

```sql
-- customers (the account)
alter table customers
  add column salesforce_account_id text,           -- partial-unique where not null
  add column csm_owner_id uuid references team_members (id) on delete set null;

-- implementations
alter table implementations
  add column parent_implementation_id uuid references implementations (id) on delete set null,
  add column salesforce_opportunity_id text,       -- partial-unique; POPULATED ONLY BY PHASE-4 API / manual entry (no opportunity id exists in the presale schema)
  add column health_recorded text
    check (health_recorded in ('on_track','at_risk','blocked')),
  add column health_recorded_reason text,
  add column health_recorded_by uuid references team_members (id) on delete set null,
  add column health_recorded_at timestamptz,
  add column health_computed text
    check (health_computed in ('on_track','at_risk','blocked','no_signal')),
  add column health_computed_at timestamptz,
  add column health_computed_inputs jsonb;         -- full evidence object, §4

-- portal scoping
alter table customer_users   add column implementation_id uuid references implementations (id) on delete cascade;
alter table customer_invites add column implementation_id uuid references implementations (id) on delete cascade;
```

`source` already exists on both tables (0003, default `'manual'`); Phase 1 only documents the value set (`manual|csv_import|api|presale`) and makes `startOnboarding` stamp `'presale'`. No CHECK added to `source` or `status` (existing prod rows like `status='active'` make that non-idempotent). `parent_implementation_id` is single-level, trigger-enforced — **recorded here as a deliberate narrowing of the brief's phased-rollout shape**: N siblings under one parent covers phased rollouts; arbitrary depth is a schema-compatible relaxation Phase 5 may make, and Phase-5 rollup queries must not assume depth>1 exists.

## 4. Health: recorded vs computed (evidence-over-inference rules)

- `health_recorded` is the **human's statement, only ever written by the implementation editor**. **There is no backfill.** Rationale (replaces v1's Step 5): `status` is written programmatically (`startOnboarding` inserts `'on_track'`; DB default `'active'`), no trigger or code writes `audit_log` for status changes, so *no status value anywhere is evidenced as a human statement* — copying any of them into a column defined as "the human's statement" and rendering "Owner says On track" would launder a system default into recorded fact, and `updated_at` (moved by the 0003 touch trigger on any edit) cannot serve as `health_recorded_at`. All rows start NULL; `_at`/`_by` are stamped only by real saves.
- **Legacy read-through with explicit provenance:** while `health_recorded` is NULL and `status in ('on_track','at_risk','blocked')`, the UI shows "Legacy status flag: At risk (unconfirmed — set by app or import, not a recorded owner statement)". Never "Owner says". The first human save through the editor replaces it. `status` itself is not modified, not dropped; it remains the legacy read path and the rollback safety net, and the editor dual-writes it while the flag is on.
- `health_computed` is a cache of `deriveHealth()`, never a new algorithm. `deriveHealth` is refactored to return `{ level, reason, evidence }` and the cache stores that same `evidence` object — one source, so the stored inputs are by construction the inputs that produced the verdict. **Shape (mirrors what the function actually branches on, `customer360-derive.ts:141-221`, not counts):**

```jsonc
{
  "rule": "escalation_blocked|risk_blocked|risk_at_risk|issue_at_risk|overdue_commitments|launch_overdue|stalled_stage|milestone_off_track|no_signal|clear",
  "top_escalation": {"id": "...", "severity": "critical", "title": "..."} /* or null */,
  "top_risk": {"id": "...", "severity": "high", "likelihood": "likely", "title": "..."} /* or null */,
  "top_issue": {"id": "...", "severity": "high", "title": "..."} /* or null */,
  "overdue_commitments": [{"id": "...", "title": "...", "due_date": "2026-08-01"}],  // capped at 10
  "milestone": {"id": "...", "name": "...", "status": "missed", "target_date": "..."} /* or null */,
  "stage": "build", "stage_entered_at": "...", "days_in_stage": 41,
  "target_launch_date": "...", "actual_launch_date": null,
  "counts": {"open_escalations": 1, "open_risks": 2, "open_issues": 0, "commitments": 3, "milestones": 5}
}
```

- Written by `recomputeHealth(implementationId)` after any mutation to risks/issues/escalations/commitments/milestones/stage advance, plus the SLA cron (`src/routes/api/cron/sla.ts`) sweeping all active implementations as the staleness backstop. Stores `health_computed_at` alongside.
- **Display rules:** 360 and lists keep computing live via `deriveHealth()`; the cache serves the API, portfolio queries, and Phase-4 write-back, and wherever rendered must show `health_computed_at` and expose the evidence object. Recorded and computed render side by side; disagreement flagged ("Recorded: On track · Signals: At risk"). Computed never overwrites recorded; no code path but the human editor writes `health_recorded`.

## 5. Portal scoping — enforced in the app layer, defended in RLS

### 5.1 Grants and invites (the invite-upsert fix)
`customer_users.implementation_id NULL` = account-wide (every existing row keeps today's behavior); non-NULL = scoped. Same for invites; the signup trigger copies the invite's scope. Uniqueness becomes **two partial unique indexes per table**: `(email, customer_id) WHERE implementation_id IS NULL` and `(email, customer_id, implementation_id) WHERE implementation_id IS NOT NULL` (same pattern on `customer_users` with `profile_id`). **Hard dependency, stated plainly:** `access.server.ts:122-132` upserts invites via PostgREST `onConflict: "email,customer_id"`, and a column-list ON CONFLICT cannot use a partial index as arbiter (PostgREST cannot emit the required WHERE predicate) — so dropping the old constraint breaks every customer invite at runtime, flag off or on. Therefore the upsert is replaced with an explicit select-then-insert-or-update **in a PR deployed BEFORE 0010 runs** (it works under both schemas because it initially keys only on email+customer_id); see migration ordering.

### 5.2 App-layer enforcement (the load-bearing gate)
All portal reads/writes run on `supabaseAdmin`, so RLS is bypassed; the gate is the `linkedCustomerIds` family. Changes:
- New `linkedGrants(profileId): Array<{customer_id, implementation_id | null}>` in `tickets.server.ts` beside `linkedCustomerIds` (which stays for account-level checks, now `distinct`). Helper `allowedImplIds(grants, customerId): null /* all */ | Set<string>`.
- Every consumer adopts scope filtering: `loadPortalHome`, `loadPortalTickets`, `submitPortalTicket`, **`replyPortalTicket`** (`portal.server.ts:370-383` — scope check on the ticket's `implementation_id` before `addComment`), and the customer-role branches in **`tickets.functions.ts:63,75,139,179`** (list/detail/create/comment). Rule for account-level tickets (`implementation_id IS NULL`): visible and commentable by scoped users of that account, matching their ability to file one.
- `submitPortalTicket` drops the "exactly one" heuristic: scoped grant → that implementation; account grant with several implementations → the portal form asks which project (or files account-level with NULL).

### 5.3 Phase-3 seam
A signed magic link mints a session bound to one `customer_users` row with `implementation_id` set — no rework needed then.

### 5.4 RLS (defense-in-depth for direct PostgREST access only)
Every customer policy from 0005/0006 gains the null-or-match grant condition — tables `implementations`, `milestones`, `commitments`, `success_criteria`, `tickets` (**select AND insert**), `ticket_comments` (**select AND the customer INSERT policy at 0006:224-235**, both joining through `tickets`). `customers`/`customer_contacts` stay account-level. This work is real but is not the primary defense; the risk register reflects that.

## 6. UI surfaces touched (all behind the flag except pure link fixes)

| Surface | Change |
|---|---|
| The 13 link/navigation sites in §0.1 item 4 | Carry `impl` (safe unflagged — param already supported); post-create navigations use the returned new `implementationId` |
| `customers.index.tsx` | Group rows under an account header when >1 implementation; copy stops equating row = customer |
| `customers.$customerId.tsx` | Header: recorded health (reason/by/at) or the labeled legacy fallback, beside derived health; switcher unchanged |
| `src/components/implementation-write.tsx` | Health section: recorded health + reason required on at_risk/blocked; dual-writes `status`; post-create nav carries `impl` |
| `deals.$dealId.tsx` | When already linked: link to the customer 360 (where the existing `NewImplementation` dialog handles add-ons). No presale-side "second onboarding" flow in Phase 1 — see §7 rule 1 and open question 3 |
| `access.tsx` / `access.server.ts` | Invite upsert → select-then-write (pre-0010 PR); then optional "Scope to implementation" select; grants list shows scope |
| `portal.index.tsx` / `portal.tickets.tsx` | Render only granted implementations; ticket form implementation picker |

## 7. Behavior rules
1. `startOnboarding`: match the account by `salesforce_account_id` when present; otherwise present an **explicit account picker** (create-new is one option) — never auto-match by name, never silently insert a duplicate. If the deal is already linked, it links to the customer 360 rather than dead-ending; creating the additional implementation happens there via the existing multi-capable `createImplementation`. Stamp `source='presale'`. **It does NOT stamp `salesforce_opportunity_id` — no opportunity id exists anywhere in the presale schema** (`portal_accounts` is one row per account, unique `salesforce_id`); the column is populated only by the Phase-4 API or manual entry. Presale-side re-run idempotency instead: `portal_accounts.customer_id` link + the UI confirm.
2. Creating an implementation with a `salesforce_opportunity_id` that already exists returns the existing implementation (partial unique index; Phase-4 `POST /api/v1/implementations` inherits this). Until Phase 4 the index is simply inert.
3. A child implementation is a full first-class implementation (own stage machine/history/health); parent is just another implementation; rollups are Phase 5, which must honor the single-level narrowing in §3.
4. `journey_enrollments` stays account-scoped; `stage_entered` fires on any implementation of the account (documented).
5. Feature flag: `portal_app_config` key `v2_flags` → `{"account_model": bool}`, read server-side. Schema additive and inert when off; the flag gates behavior (startOnboarding path, default pick, portal pickers, health editor).
6. (From critic caveat) `tier` currently lives on `implementations`; the brief's account schema puts it on the account. Phase 1 does not move it — logged as open question 8.

## Proposed migrations

# Ordered migration + deploy steps (each with rollback)

Convention: numbered files in `supabase/migrations/`, never edit a shipped one. Down-scripts live in `supabase/rollbacks/` (new dir) and — addressing the critic's "reversible is procedural, not demonstrated" — each down-script is **exercised once on a Supabase branch/staging database** (apply up, seed representative rows, apply down, assert schema+data invariants) before the up-migration ships to prod; the assertion script is committed beside the down file.

**Deploy ordering (explicit):** Step 0 (code) → 0009 (Steps 1-5) → code PRs B (Step 9) → Step 6+7 (0010) in the SAME deploy train as nothing (schema-only, now safe because Step 0 already shipped) → code PR C (Step 10). Step 0 MUST be live before 0010 is applied — 0010 drops the unique constraints the current PostgREST upsert depends on.

## Step 0 — code PR A0 (unflagged, ships FIRST): make invite writes schema-agnostic
Replace the `customer_invites` upsert at `src/lib/access.server.ts:122-132` (`onConflict: "email,customer_id"`) with select-then-insert-or-update keyed on (email, customer_id). Works identically under the 0005 schema and the 0010 schema (a column-list ON CONFLICT cannot use a partial unique index as arbiter, so the upsert must go regardless). Audit any other `.upsert` against `customer_users`/`customer_invites` (grep shows this is the only one).
**Rollback:** revert PR (only valid before 0010 is applied; after 0010, rolling back this PR re-breaks invites — the down path is 0010-down first).

## Step 1 — `0009_account_model.sql` part A: account identity
```sql
alter table customers
  add column salesforce_account_id text,
  add column csm_owner_id uuid references team_members (id) on delete set null;
create unique index customers_sf_account_idx
  on customers (salesforce_account_id) where salesforce_account_id is not null;
```
**Rollback:** drop index; drop both columns. (Export hand-entered SF ids first if any.)

## Step 2 — 0009 part B: backfill SF account id from the linked presale deal
```sql
update customers c
   set salesforce_account_id = pa.salesforce_id
  from portal_accounts pa
 where pa.customer_id = c.id
   and pa.salesforce_id is not null
   and c.salesforce_account_id is null;
```
(0007 `portal_accounts.customer_id` is the only trustworthy SF mapping; `customers.external_id` untouched.) This is a backfill of an *external identifier*, not a recorded human statement — provenance is the FK link itself.
**Rollback:** covered by Step 1 rollback.

## Step 3 — 0009 part C: implementation columns + indexes
```sql
alter table implementations
  add column parent_implementation_id uuid references implementations (id) on delete set null,
  add column salesforce_opportunity_id text,
  add column health_recorded text check (health_recorded in ('on_track','at_risk','blocked')),
  add column health_recorded_reason text,
  add column health_recorded_by uuid references team_members (id) on delete set null,
  add column health_recorded_at timestamptz,
  add column health_computed text check (health_computed in ('on_track','at_risk','blocked','no_signal')),
  add column health_computed_at timestamptz,
  add column health_computed_inputs jsonb;
create unique index implementations_sf_opportunity_idx
  on implementations (salesforce_opportunity_id) where salesforce_opportunity_id is not null;
create index implementations_parent_idx on implementations (parent_implementation_id);
```
**There is no health backfill step.** All `health_recorded*` start NULL (see design §4: no status value is evidenced as a human statement — `startOnboarding` writes `'on_track'` programmatically and nothing audits status edits). The UI's labeled legacy read-through covers the gap.
**Rollback:** drop the two indexes, drop the nine columns. Any `health_recorded*` values present at rollback time are genuine human entries (there was no backfill), so the down procedure REQUIRES `copy (select id, health_recorded, health_recorded_reason, health_recorded_by, health_recorded_at from implementations where health_recorded is not null) to ...` first, and additionally writes one `audit_log` row per lost entry (`change_reason='health_recorded dropped by 0009 rollback; value preserved in export'`) so the trail records the removal instead of silently forgetting it. Down-script aborts if the export marker file/flag is absent (enforced in the rollback script, not just documented).

## Step 4 — 0009 part D: single-level parent guard
Trigger `implementations_parent_guard()` as in v1: rejects self-parent, parent-with-a-parent, and parenting a node that has children. Adds `perform 1 from implementations where id = new.parent_implementation_id for update;` as the first check to close the concurrent 2-cycle window under READ COMMITTED.
**Rollback:** drop trigger + function.

## Step 5 — 0009 part E: feature flag row
```sql
insert into portal_app_config (key, value)
values ('v2_flags', '{"account_model": false}'::jsonb)
on conflict (key) do nothing;
```
**Rollback:** `delete from portal_app_config where key = 'v2_flags';`

## Step 6 — `0010_portal_implementation_scope.sql` part A: scoped grants (requires Step 0 live)
```sql
alter table customer_users   add column implementation_id uuid references implementations (id) on delete cascade;
alter table customer_invites add column implementation_id uuid references implementations (id) on delete cascade;

alter table customer_users   drop constraint customer_users_profile_id_customer_id_key;
create unique index customer_users_account_scope_idx
  on customer_users (profile_id, customer_id) where implementation_id is null;
create unique index customer_users_impl_scope_idx
  on customer_users (profile_id, customer_id, implementation_id) where implementation_id is not null;

alter table customer_invites drop constraint customer_invites_email_customer_id_key;
create unique index customer_invites_account_scope_idx
  on customer_invites (email, customer_id) where implementation_id is null;
create unique index customer_invites_impl_scope_idx
  on customer_invites (email, customer_id, implementation_id) where implementation_id is not null;
```
Pre-flight: verify the auto-generated constraint names in prod (`select conname from pg_constraint where conrelid in ('customer_users'::regclass,'customer_invites'::regclass)`); a mismatch aborts harmlessly but blocks the deploy.
**Rollback (customer-visible data loss, stated honestly):** scoped rows cannot exist under the old constraints, so the down-script first `copy`-exports all rows `where implementation_id is not null` from both tables (abort if export not confirmed), then deletes them, drops the four partial indexes, re-adds the original unique constraints, drops the columns. Affected contacts lose portal access until re-invited — the rollback runbook includes notifying the owning CSM.

## Step 7 — 0010 part B: signup trigger carries the scope
Re-create `portal_handle_new_user()` (verbatim 0005 body) with: the `customer_users` insert adds `implementation_id => inv.implementation_id`, and `on conflict (profile_id, customer_id) do nothing` becomes bare `on conflict do nothing` (valid against any arbiter, partial indexes included). Re-assert the 0005 `revoke execute` lines.
**Rollback:** re-create the exact 0005 function body (copied verbatim into the down file).

## Step 8 — 0010 part C: RLS scope tightening (defense-in-depth; null grant = today's behavior)
Recreate each customer policy from 0005/0006 with the grant condition. Direct-column tables (`implementations`, `tickets`): `and (cu.implementation_id is null or cu.implementation_id = <row's impl>)`; `tickets` select **and insert**: `and (cu.implementation_id is null or tickets.implementation_id is null or tickets.implementation_id = cu.implementation_id)`. Join-through tables (`milestones`, `commitments`, `success_criteria`): condition inside the existing join. `ticket_comments`: **both** the select policy **and the customer INSERT policy (0006:224-235)** gain the condition via their join through `tickets`, so a scoped user cannot comment on sibling-implementation tickets even via direct PostgREST. `customers`/`customer_contacts` unchanged.
**Rollback:** drop new policies, recreate 0005/0006 originals verbatim (bodies copied into the down file).

## Step 9 — code PR B (flagged): health read/write paths + deep links
- Carry `impl` at all 13 sites (§0.1 item 4) including `account-rows.tsx:44,77`, `index.tsx:67`, and post-create navigations (`implementation-write.tsx:165`, `deals.$dealId.tsx:173` — `createImplementation`/`startOnboarding` return the new `implementationId`). Safe unflagged.
- `loadCustomer360` default pick → oldest-non-graduated (flagged).
- `deriveHealth` refactor returning `{level, reason, evidence}`; `recomputeHealth()` writing `health_computed(_at/_inputs)` from delivery mutations, stage advance, SLA cron; editor dual-writes `status` + `health_recorded(_reason/_by/_at)` with required reason on at_risk/blocked; 360 + `/customers` render recorded-vs-computed, with the labeled legacy fallback when recorded is NULL.
**Rollback:** flag off — reads fall back to `status` + live `deriveHealth` exactly as today; link changes are inert.

## Step 10 — code PR C (flagged): presale + portal scoping behavior
- `startOnboarding`: SF-id match → explicit account picker → `source='presale'`; already-linked path routes to the 360 (no presale-side second onboarding).
- `linkedGrants` + `allowedImplIds` in `tickets.server.ts`; adopt in `loadPortalHome`, `loadPortalTickets`, `submitPortalTicket`, `replyPortalTicket`, and `tickets.functions.ts:63,75,139,179` customer branches; portal ticket-form implementation picker; `access.tsx` scope select (invite write path already select-then-write from Step 0).
- **Tests in the same PR (brief requirement):** customer A never reads customer B; implementation-scoped user never reads/replies-on/files-against a sibling implementation, via every portal server function AND via the tickets.functions customer path; NULL-grant user behavior byte-identical to today.
**Rollback:** flag off restores account-wide behavior (all existing grants are NULL-scoped, so nothing changes for them).

**Ordering constraints, restated:** Step 0 before 0010 (invite upsert). 0009 before 0010 (FK targets). PR C after both. 0009 and 0010 are each transactional, independently shippable, independently reversible — with 0010's reversal being honest about scoped-grant data loss.

## Risks

- HIGHEST blast radius is the app layer, not RLS: every portal read/write runs on supabaseAdmin (service role, RLS bypassed), so a missed consumer of linkedCustomerIds is a real cross-implementation leak regardless of policies. The known consumer set is portal.server.ts (loadPortalHome/loadPortalTickets/submitPortalTicket/replyPortalTicket via requireCustomerIds) plus tickets.functions.ts:63,75,139,179; mitigation is centralizing scope logic in linkedGrants/allowedImplIds, a grep-audit for any other requireCustomerIds/linkedCustomerIds caller at PR-C review time, and the mandated authorization tests in the same PR.
- Deploy-ordering hazard: applying 0010 before code PR A0 (Step 0) breaks every customer invite at runtime (PostgREST onConflict cannot target partial unique indexes). The order is stated in the migration plan, but nothing mechanical enforces it — the release checklist must gate 0010 on A0 being live, and the staging rehearsal must run the invite flow after applying 0010.
- RLS rewrite (Step 8) remains risky as defense-in-depth: a wrong OR in the null-grant condition either locks portal users out of PostgREST access or weakens the backstop. Every recreated policy body must be diffed against the 0005/0006 originals, and the ticket_comments INSERT policy is the easy one to forget (it was missing from v1 of this design).
- Rollback of 0010 deletes implementation-scoped customer_users/customer_invites rows — customer-visible access loss. The down-script export+abort guard makes it recoverable but not invisible; the runbook requires CSM notification. 'Reversible' here means restorable-with-work, and the design says so explicitly.
- With no health backfill, every implementation shows the 'legacy flag (unconfirmed)' fallback until a human saves health once — portfolio-wide recorded-health coverage starts at zero and grows only with use. Acceptable (honest) but worth setting expectations with managers; the editor's dual-write means each routine status touch converts one row.
- Stored health_computed can go stale if a mutation path forgets recomputeHealth; current UI stays on live deriveHealth so users never see stale values, but Phase-4 Salesforce write-back reads the cache — the SLA cron sweep is the mandatory backstop and its coverage (all non-graduated implementations) must be asserted in tests.
- Production implementations.status is unconstrained (no CHECK; default 'active'; CSV import may have written free text). The legacy read-through only recognizes on_track/at_risk/blocked; anything else renders as 'no recorded health'. Run select status, count(*) from implementations group by 1 against prod before shipping PR B and eyeball the distribution.
- Default-pick change (newest → oldest non-graduated) alters what impl-less bookmarks show for accounts that already have >1 implementation today. Behind the flag and mitigated by post-create navigations now carrying impl explicitly, but still a visible flip worth announcing.
- Auto-generated constraint names in Step 6 are assumed (customer_users_profile_id_customer_id_key / customer_invites_email_customer_id_key — correct for 0005's inline uniques, per the critic's own verification); still verify in prod pre-flight since a rename would abort the migration and block the deploy train.
- customers.external_id / implementations.external_ref semantically overlap the new salesforce_* columns; Phase-1 code must never write SF ids into the legacy columns, and the audit doc marks them import-legacy.
- The parent-guard trigger's for-update lock closes the concurrent 2-cycle window but adds a lock on parent rows during child inserts; contention is negligible at this tool's scale but the trigger must not be copied into a high-volume context unexamined.

## Open questions

- When an account has several live implementations, what should account-level surfaces roll up for health — worst-of-children, primary-implementation-only, or no rollup (per-implementation rows only, as today)? Decides /portfolio grouping and the future Salesforce Account write-back.
- Existing portal logins are account-wide (NULL grant). When a second implementation goes live, should existing customer users automatically see it (current behavior, preserved by NULL), or should go-live require explicitly widening/scoping each contact's access?
- Presale expansion shape — now explicitly blocking, not just open: portal_accounts is one row per account (unique salesforce_id), so an add-on opportunity has nowhere to live in presale. Phase 1 therefore routes 'already linked' deals to the customer 360 instead of building a presale-side second-onboarding flow. Decide: re-run the same deal record, a new deal row (relax the unique), or expansion enters only via the Phase-4 API? The answer determines whether a deals-page 'Start another implementation' action ever gets built.
- Is 'idle' a health you want to record, or a lifecycle status (paused/on-hold)? Proposal: not a health (the legacy read-through ignores it; health_recorded never holds it) — confirm, since it changes portfolio filter chips.
- Should health_recorded_reason be mandatory for at_risk/blocked from day one (Precursive rule pulled forward), or only when Workstream 5 ships? Mandatory now means the first at_risk save after the flag flips hits a new required field unannounced.
- Are phased rollouts ever more than one level deep (region → country → site)? Phase 1 deliberately narrows to single-level parent/child (documented in §3); deeper trees are a schema-compatible relaxation but the trigger and Phase-5 rollup queries differ.
- UI noun: 'Account' or 'Customer'? URLs stay /customers either way; this sets the vocabulary target for the naming-cleanup workstream (including whether the presale TypeScript 'Account' interface becomes 'PresaleDeal') and what the grouped /customers header says.
- tier currently lives on implementations; the brief's account schema puts it on the account. Phase 1 leaves it — should Phase 2 move it to customers (account-level fact) or keep it per-implementation (delivery-motion fact)? Affects the grouped list and Phase-4 field mapping.
- Who supplies salesforce_account_id for existing customers with no linked presale deal (the backfill covers only 0007-linked rows) — manual entry in the UI, a one-off CSV, or wait for Phase-4 sync?
- Scoped portal users and account-level tickets: the design lets an implementation-scoped contact see and reply on tickets with implementation_id NULL for their account (matching their ability to file one). Acceptable, or must scoped contacts be strictly limited to their implementation's tickets?

## Adversarial critique (panel record)

{
  "verdicts": [
    {
      "aspect": "Brief non-negotiables (evidence-over-inference, URLs, reversible migrations, flag-shippable)",
      "verdict": "flawed",
      "reason": "URLs are genuinely preserved and most schema is additive, but three violations: (a) Step 5 launders a system default into a recorded human statement — startOnboarding inserts status='on_track' programmatically (presale.server.ts:487), the backfill copies it into health_recorded (defined as 'the human's statement', rendered as 'Owner says On track'), and stamps health_recorded_at=updated_at even though the 0003 touch trigger moves updated_at on any edit, so both value and timestamp are inference written into recorded-fact columns; (b) the proposed health_computed_inputs shape ({open_escalations, open_risks, ...counts}) cannot reproduce deriveHealth's verdict, which branches on severity ranks of the top escalation/risk/issue, milestone statuses, stalled days and launch dates (customer360-derive.ts:141-221) — a count-only snapshot cannot 'show its inputs on demand' in any way that explains the output; (c) the claim that 0010's schema is 'additive and inert when off' is false — dropping the customer_invites unique constraint breaks the invite flow immediately regardless of flag (see next aspect)."
    },
    {
      "aspect": "Breakage of existing code paths",
      "verdict": "flawed",
      "reason": "One production-breaking miss and several inventory gaps. (1) access.server.ts:122-132 upserts customer_invites via PostgREST onConflict:'email,customer_id'; Step 7 drops that constraint and replaces it with an expression unique index (coalesce(implementation_id, zero-uuid)), which a column-list ON CONFLICT cannot use as arbiter — every customer invite fails at runtime the moment 0010 deploys, flag off or on, and this call site appears nowhere in the design. (2) replyPortalTicket (portal.server.ts:370-383) is absent from Step 12's function list, so a scoped portal user could still reply on sibling-implementation tickets; linkedCustomerIds (tickets.server.ts:556), the actual authorization primitive all portal functions share, returns unscoped customer ids and is never mentioned. (3) The deep-link inventory of '8 call sites' misses src/components/account-rows.tsx:44,77 (the shared per-implementation row used by leadership/owner surfaces — keyed by row.impl.id yet linking without impl), src/routes/index.tsx:67 (a second link component besides :115), and the post-create navigations implementation-write.tsx:165 and deals.$dealId.tsx:173 — under the design's new 'oldest non-graduated' default pick, a user who just created a second implementation is navigated to the OLD one, a regression the design itself introduces. The rest of the inventory (loadCustomer360, startOnboarding, submitPortalTicket, deriveHealth, no CHECK on status, switcher, ?impl param) verified accurate against the code."
    },
    {
      "aspect": "Migration safety and rollback honesty",
      "verdict": "flawed",
      "reason": "Additive DDL in 0009 is genuinely safe and the design is unusually honest about destructive rollbacks (CSV export before dropping health columns, verified constraint names flagged as a risk — and the guessed default names customer_users_profile_id_customer_id_key / customer_invites_email_customer_id_key are correct for 0005's inline uniques). But: (a) Step 7 is not just risky, it is a live breakage (invite upsert, above) with an unstated hard ordering dependency on a same-deploy code change; (b) Step 5's rollback nulls health_recorded for every entity in the backfill audit set without checking the current value, silently destroying any health a human recorded after migration — it must guard on health_recorded = the backfilled new_value; (c) the same rollback deletes audit_log rows, i.e. the down script erases audit history in a system whose brief demands an audit trail; (d) rollback of Step 7 deletes scoped customer_users/customer_invites rows — labeled reversible but it is customer-visible data loss; (e) down scripts live in a new supabase/rollbacks dir with no execution/test harness, so 'reversible' is procedural, not demonstrated."
    },
    {
      "aspect": "RLS / authorization holes",
      "verdict": "flawed",
      "reason": "The design misdiagnoses where authorization is enforced. Every data access in the app — including the entire customer portal — runs through supabaseAdmin (service role) which bypasses RLS (portal.server.ts:1,12; hub.server.ts; tickets.server.ts); the publishable-key client is used only for auth flows (grep of src confirms client.ts is imported only by auth.ts/login/signup/callback/forgot-password). So Step 9's policy rewrite is defense-in-depth for direct PostgREST access only, while the load-bearing gate is requireCustomerIds/linkedCustomerIds plus app-level filters — and the design patches only 3 of the portal functions, missing replyPortalTicket and the linkedCustomerIds primitive itself. Within the RLS work: the ticket_comments customer INSERT policy (0006:224-235) also joins through tickets and needs the same scope condition, but Step 9 only clearly specifies the select side; and the design's own risk register presents 'wrong OR in the RLS condition' as the highest blast radius when the actual highest-blast-radius surface is the service-role app layer it barely changes. The null-grant-preserves-behavior scheme itself is sound, and the signup-trigger scope copy is coherent."
    },
    {
      "aspect": "Naming-collision handling",
      "verdict": "flawed",
      "reason": "The DB-layer reasoning is verified correct: the shared database's prototype app does own an accounts table (0003 header collision list), presale deals live in portal_accounts, and keeping customers/customer_id while flipping vocabulary is the right call — as is refusing an accounts alias view. But the design then commits the exact sin it argues against: 'type Account = CustomerRow' in hub-types.ts collides with the existing exported interface Account for presale deals (presale-types.ts:19, used throughout src/lib/server/accounts.ts and the deals routes), giving the codebase two contradictory TypeScript Account types — one meaning post-sale company, one meaning presale deal. Also unaddressed: portal_accounts.salesforce_id (an account-level SF id) vs the new customers.salesforce_account_id vs implementations.salesforce_opportunity_id — the latter can never be stamped from presale because no opportunity id exists anywhere in the presale schema (portal_accounts is one row per account with unique salesforce_id and unique lower(name)), so behavior rule 1's 'stamp salesforce_opportunity_id when known' is dead code until Phase 4; the design flags the one-deal-per-account shape only as an open question when it actually invalidates part of its stated behavior."
    },
    {
      "aspect": "Phase-2 definition-of-done readiness",
      "verdict": "sound",
      "reason": "The seams mostly hold: DoD #2 (create an implementation for an existing account with a live new-logo implementation) is unblocked by the startOnboarding fix plus the already-multi-capable createImplementation; DoD #4's account rollup is served by the grouped /customers list and per-implementation rows already exist in home triage and /customers; parent_implementation_id, salesforce ids, and the recorded/computed health split are the right Phase-4/5 seams, and the idempotency index pre-builds Workstream 6's key mechanism. Caveats that keep this from being fully clean but are not design-breaking: /portfolio is never examined or touched, so 'see them separately in /portfolio' rests on unverified current behavior; nothing reserves journey_type/journey_template_id/template_version (acceptable — Phase 2 adds them additively); tier lives on implementations while the brief's account schema puts it on account (unaddressed); and the single-level parent trigger is a defensible restriction but should be recorded as a deliberate narrowing of the brief's phased-rollout shape so Phase 5 rollups don't get surprised."
    }
  ],
  "mustFix": [
    "0010 Step 7 breaks customer invites in production: access.server.ts:122-132 upserts customer_invites with PostgREST onConflict:'email,customer_id', which cannot use the proposed coalesce() expression index as arbiter. Replace with two partial unique indexes — (email, customer_id) WHERE implementation_id IS NULL and (email, customer_id, implementation_id) WHERE implementation_id IS NOT NULL (same for customer_users) — and ship the matching access.server.ts change in the same deploy; state the ordering dependency explicitly.",
    "Portal scoping must be enforced in the app layer, not RLS: all portal reads/writes use supabaseAdmin (service role, RLS bypassed). Extend linkedCustomerIds (tickets.server.ts:556) to return implementation-scoped grants and add replyPortalTicket (portal.server.ts:370-383) to Step 12's list — otherwise a scoped contact can still read and reply on sibling-implementation tickets.",
    "Complete the deep-link inventory: src/components/account-rows.tsx:44,77 (shared per-implementation row on leadership/owner surfaces), src/routes/index.tsx:67, and the post-create navigations implementation-write.tsx:165 and deals.$dealId.tsx:173 must carry impl — under the new 'oldest non-graduated' default pick, creating a second implementation currently navigates the user to the OLD one.",
    "Stop the backfill laundering system defaults into recorded health: startOnboarding sets status='on_track' programmatically, so backfilled health_recorded must never render as 'Owner says On track'. Either backfill only where a human edit is evidenced, or mark backfilled rows with explicit provenance ('carried over from legacy status') in the UI; do not stamp health_recorded_at=updated_at (the touch trigger makes it meaningless) — leave it NULL.",
    "Fix Step 5 rollback honesty: only null health_recorded where it still equals the backfilled new_value (guard against destroying post-migration human entries), and do not delete the audit_log rows — a down script that erases audit history contradicts the brief's audit-trail requirement.",
    "Specify health_computed_inputs to contain what deriveHealth actually branches on — top escalation/risk/issue severities and titles, overdue commitment dates, missed/at-risk milestone statuses, days-in-stage, target/actual launch dates — not bare counts; counts cannot explain the verdict and fail 'show its inputs on demand'.",
    "Scope the ticket_comments customer INSERT policy (0006:224-235) in Step 9, not just the select side, so a scoped user cannot comment on sibling-implementation tickets via direct PostgREST access.",
    "Drop or rename the 'type Account = CustomerRow' alias — interface Account already exists for presale deals (presale-types.ts:19); introducing a second Account type recreates the three-meanings problem the design cites as the reason not to rename. Use AccountRow/HubAccount or keep CustomerRow and change only UI copy.",
    "Correct behavior rule 1's claim of stamping implementations.salesforce_opportunity_id from presale: no opportunity id exists anywhere in the presale schema (portal_accounts is one row per account, unique salesforce_id, unique lower(name)); document that the column is populated only by the Phase-4 API, and resolve the one-deal-per-account expansion question before building 'Start another implementation' on deals.$dealId."
  ]
}
