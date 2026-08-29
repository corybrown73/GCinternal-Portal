# Design: Multi-Implementation Migration

> Produced by the v2 Step-0 design panel (workflow wf_f952802b-e7e, 2026-08-29).
> Each design was drafted, adversarially critiqued, and revised. Status: revised.

# Phase 1 — Account → many Implementations (revised design)

*Revision note: all eight critique mustFix items are accepted and incorporated (each verified against the code before accepting). One refinement, not a rebuttal: the critic said journey `stage_entered` drips are display-only — correct (`stage_entered` appears only in the zod enum `src/lib/journeys.functions.ts:51` and display code) — but `customer_created` enrollments DO fire (`src/lib/journeys.server.ts:377, 726`), so behavior rule 4 now distinguishes the two instead of specifying semantics for the unwired one.*

## 0. What the code actually does today (inventory of 1:1 assumptions)

Everything below was read, not inferred. File paths are repo-relative from `/home/user/GCinternal-Portal`.

**Critical architectural fact (reframes all authorization work):** every app read/write — internal hub, customer portal, access management, tickets — goes through `supabaseAdmin` with the service-role key (`src/integrations/supabase/client.server.ts:32-59`; `portal.server.ts`, `access.server.ts:6`, `hub.server.ts`, `tickets.server.ts` all use it). RLS is bypassed for all app traffic, as 0003's own header admits ("the app's service-role data layer bypasses RLS anyway"). Therefore **implementation scoping is enforced in app code; RLS policies are defense-in-depth** (they matter for any future direct-PostgREST/anon access and for correctness hygiene, not for today's portal UI).

**Already multi-implementation-safe (do not touch):**
- `supabase/migrations/0003_hub_tables.sql:69-97` — `implementations.customer_id` is a plain FK; nothing unique. All 20+ child tables key on `implementation_id`.
- `src/routes/customers.$customerId.tsx:131-144, 231-269` — the 360 page takes `?impl=<uuid>` and renders an `ImplementationSwitcher` when `implementations.length >= 2`; the tab bar (line 361-365) correctly carries `impl` through tab switches.
- `src/lib/hub.server.ts:335-353 (loadCustomer360)` — loads all implementations; picks `?impl=`, else newest by `created_at`; unknown id silently falls back to newest.
- `src/lib/hub.server.ts:1388-1431 (createImplementation)` — already creates a second implementation for an existing `customerId`.
- `src/routes/customers.index.tsx` — already one row per implementation; `src/lib/home-triage.ts` — one queue row per implementation.

**Actual one-per-customer assumptions (the Phase-1 work):**
1. `src/lib/presale.server.ts:447-536 (startOnboarding)` — (a) `if (account.customer_id) return { alreadyLinked: true }` dead-ends a second implementation; (b) always inserts a brand-new `customers` row from the deal name — an existing account buying an add-on becomes a duplicate account; no Salesforce-id matching exists (`portal_accounts.salesforce_id` is never consulted against `customers`).
2. `src/lib/portal.server.ts:334-368 (submitPortalTicket)` — `implementationId = impls.length === 1 ? impls[0].id : null`.
3. Portal scoping — `customer_users` / `customer_invites` (0005) link a login to a customer; `loadPortalHome` (`portal.server.ts:120-245`) shows every implementation of the account. No way to scope an invite to one implementation.
4. **`replyPortalTicket` (`portal.server.ts:370-383`) authorizes by customer only** via `requireCustomerIds` — with scoped grants it would let an implementation-scoped user reply to sibling-implementation tickets. **`linkedCustomerIds` (`tickets.server.ts:556-562`) returns bare customer ids**, discarding grant scope. Both are enforcement points because RLS is bypassed (see architectural fact above). *(Added per critique.)*
5. Cross-page deep links drop the implementation: `src/routes/index.tsx:115`, `portfolio.tsx:84-88`, `alerts.tsx:141-147`, `tickets.$ticketId.tsx:158-163`, `deals.$dealId.tsx:178-184`, `technical-solutions.$id.tsx:101-117`, `customers.index.tsx:192-201` all link `/customers/$customerId` without `impl`.
6. **Intra-360 links drop the implementation too** *(missed in v1, added per critique)*: `customers.$customerId.tsx` lines **701** (readiness-area links), **897** (stage-history link), **1506** (requirements link from the solution panel), **2018** and **2133** (gate/trace/evidence links) emit `search={{ tab }}` **without** `impl`, while the tab bar at 365 carries it. On a 2-implementation account, clicking "History" while reviewing implementation B silently teleports to implementation A — worse than the cross-page cases because it happens mid-review.
7. `access.server.ts:122-132 (inviteCustomerContact)` — upserts `customer_invites` with `onConflict: "email,customer_id"`, i.e. it depends on the exact 0005 unique constraint that the scoping migration must widen. **This creates a hard sequencing constraint** (see migrations Step 7/7a).
8. Journeys (email drip, 0006): `journey_enrollments.customer_id` is account-scoped. `trigger_event='customer_created'` is actually wired (`journeys.server.ts:377, 726`); `trigger_event='stage_entered'` is stored and displayed only (`journeys.functions.ts:51`, `journeys.index.tsx:91`) — no code fires it. No Phase-1 schema change.

**Health today:** no health column exists. `implementations.status` (text, DB default `'active'`, no CHECK; app zod enum `on_track|at_risk|blocked|idle` per `src/lib/implementation-input.ts:80-81`) is the recorded manual flag. `deriveHealth()` (`src/lib/customer360-derive.ts:121-221`) computes `blocked|at_risk|on_track|no_signal`; its decision turns not on counts alone but on the **severity of the top escalation/risk** (lines 150-172) and individual milestone statuses (through ~203). It never reads `implementations.status`. The UI already shows disagreement ("Manual flag: {status}", `customers.index.tsx:206-215`, `customers.$customerId.tsx:327-332`).

## 1. Core decision: keep the `customers` table, change its meaning

**Rename is off the table; alias views are too.** The shared database already owns a prototype `accounts` table (0003 header), and presale deals live in `portal_accounts` (0001:105-119). So:

- **`customers` = the Account.** One row per company. Gains `salesforce_account_id` and `csm_owner_id`.
- **`implementations` = the delivery motion.** Many per account. The `customer_id` FK name stays (renaming touches every query, 20+ indexes, every 0005/0006 policy body for zero behavior).
- **TypeScript naming** *(revised per critique)*: **no `type Account = CustomerRow` alias.** Presale code already binds "account" to deals — `startOnboarding`'s local `account` IS a `portal_accounts` row (`presale.server.ts:453-460`) and `/api/v1/accounts` endpoints are deals — so an `Account` alias would recreate in code the three-way ambiguity the schema decision avoids. Phase 1 keeps `Customer*` type names; UI copy may say "Account" where unambiguous; the naming-cleanup workstream owns any type rename (candidate: `HubAccount`, only after the presale side stops using bare "account").

## 2. URLs

- `/customers` and `/customers/$customerId` remain canonical and unchanged; `$customerId` stays the account UUID. Nothing 301s in Phase 1.
- Implementation selection stays in `?impl=<uuid>`. New rule: **any link generated from an implementation-scoped record must carry `impl`** — the 7 cross-page call sites (inventory item 5) AND the 5 intra-360 call sites (item 6), which thread `selectedImplId` exactly the way the tab bar at `customers.$customerId.tsx:361-365` already does.
- Default pick when `impl` is absent changes from "newest" to "**oldest non-graduated, else newest**" (behind the flag) so pre-multi-implementation bookmarks keep resolving to the original implementation.

## 3. Schema — additive only (DDL sketch; exact SQL in migration steps)

```sql
-- customers (the account)
alter table customers
  add column salesforce_account_id text,           -- unique where not null
  add column csm_owner_id uuid references team_members (id) on delete set null;

-- implementations
alter table implementations
  add column parent_implementation_id uuid references implementations (id) on delete set null,
  add column salesforce_opportunity_id text,       -- unique where not null (SF idempotency key)
  add column health_recorded text
    check (health_recorded in ('on_track','at_risk','blocked')),
  add column health_recorded_reason text,          -- Precursive rule seam: app requires when at_risk/blocked
  add column health_recorded_by uuid references team_members (id) on delete set null,
  add column health_recorded_at timestamptz,
  add column health_computed text
    check (health_computed in ('on_track','at_risk','blocked','no_signal')),
  add column health_computed_at timestamptz,
  add column health_computed_inputs jsonb;         -- evidence: enough to REPRODUCE deriveHealth's branch (see §4)

-- portal scoping (Workstream-4 seam)
alter table customer_users   add column implementation_id uuid references implementations (id) on delete cascade;
alter table customer_invites add column implementation_id uuid references implementations (id) on delete cascade;
```

`source` already exists on both tables (0003, default `'manual'`); Phase 1 only documents the value set (`manual | csv_import | api | presale`) and makes `startOnboarding` stamp `'presale'`. No CHECK is added to `source` or `status` (existing prod rows like `status='active'` would break idempotency). `parent_implementation_id` is single-level, trigger-enforced; it ships as an inert column (rollups are Phase 5).

## 4. Health: recorded vs computed (evidence-over-inference rules)

- `health_recorded` is the human's statement, **only ever written by a human action** (the implementation editor). Backfilled once from `status` where `status in ('on_track','at_risk','blocked')` — a copy, with an `audit_log` row per copied value naming the migration. `status` is not modified and not dropped; it remains the legacy read path and rollback safety net. `idle` and `'active'` do not map (not healths; `health_recorded` stays NULL and renders as "no recorded health").
- **`health_recorded_at` stays NULL in the backfill** *(revised per critique)*: `updated_at` is touched by ANY edit via the 0003 touch trigger, so stamping it as "when the human recorded health" would be inference dressed as fact. The UI renders NULL-`_at` recorded values as "recorded before v2". Only genuine human writes set `_at`/`_by`.
- `health_computed` is a cache of `deriveHealth()`, never a new algorithm. Written by a `recomputeHealth(implementationId)` helper after mutations to risks/issues/escalations/commitments/milestones/stage advance, plus the SLA cron (`src/routes/api/cron/sla.ts`) as the backstop sweep.
- **`health_computed_inputs` must reproduce the decision, not summarize it** *(revised per critique)*: deriveHealth's branch turns on the severity of the top escalation/risk (`customer360-derive.ts:150-172`) and specific milestone statuses (~173-203), so counts alone cannot show why. The snapshot stores the deciding rows: `{ top_escalation: {id, severity, title} | null, top_risk: {id, severity, title} | null, open_issue_count, overdue_commitments: [{id, due_date}], tripping_milestones: [{id, status, due_date}], days_in_stage, launch_date, launch_overdue, derived: <value>, reason: <deriveHealth's reason string> }` — sufficient to re-derive the value from the snapshot alone.
- **Display rules:** the 360 and lists keep computing live via `deriveHealth()`; the cache serves the API, portfolio queries, and Phase-4 SF write-back, and wherever it renders it must show `health_computed_at` and expose the inputs. Recorded and computed render side by side; disagreement gets the explicit flag ("Owner says On track; signals say At risk"). Computed never overwrites recorded; no code path but the human editor writes `health_recorded`.
- The editor dual-writes `status` + `health_recorded(_reason/_by/_at)` while the flag is on, so flag-off regresses nothing.

## 5. Customer portal with 3 live implementations (Workstream-4 seam)

- `customer_users.implementation_id NULL` = account-wide grant (every existing row keeps today's behavior); non-NULL = scoped to one implementation. Same for invites; the signup trigger copies the invite's scope onto the grant.
- **Enforcement lives in app code (primary), because all portal paths run on the service-role client:**
  - `linkedCustomerIds` (`tickets.server.ts:556-562`) is replaced by `linkedCustomerGrants(profileId): {customer_id, implementation_id | null}[]`; every caller consumes grants, not bare customer ids.
  - `loadPortalHome` / `loadPortalTickets` filter implementations and tickets to granted scope (account-NULL grant = all, as today).
  - `submitPortalTicket` drops the "exactly one" heuristic: scoped grant → that implementation; account grant with several implementations → the portal form asks which project (or files account-level with `implementation_id null`).
  - **`replyPortalTicket` (`portal.server.ts:370-383`) checks grant scope** *(added per critique)*: the ticket must belong to a granted customer AND (`grant.implementation_id is null` OR `ticket.implementation_id is null` OR equal) — same account-level-NULL allowance as reads, so a scoped user can still reply to account-level tickets they can see and file.
- **Scope filtering is NOT behind the feature flag** *(revised per critique — closes the flag-off widening leak)*: once 0010 is applied, honoring `implementation_id` on grants is permanent, unflagged code — a security invariant, not a feature. Since every pre-existing grant is NULL-scoped, this is behaviorally invisible until someone issues a scoped grant, and turning the `account_model` flag off can never silently re-widen a scoped customer to account-wide data. The flag gates only UX and workflow changes (invite scope selector, ticket picker, startOnboarding path, default-impl pick, grouped list). Full de-scoping requires deleting/NULLing scoped grants explicitly (rollback doc, Step 7).
- **RLS (defense-in-depth only)**: policies are tightened to mirror the app rules (§ migrations Step 9) so any future non-service-role access path inherits the same boundary. The brief-mandated portal-authorization tests target the app paths first — `loadPortalHome`, `loadPortalTickets`, `submitPortalTicket`, `replyPortalTicket`: customer A never reads customer B; an implementation-scoped user never reads or replies to sibling-implementation data; RLS tests are the secondary layer.
- Phase 3's signed magic links get a clean target: a link mints a session bound to one `customer_users` row with `implementation_id` set.

## 6. UI surfaces touched

| Surface | Change | Flag? |
|---|---|---|
| `index.tsx`, `portfolio.tsx`, `alerts.tsx`, `tickets.$ticketId.tsx`, `deals.$dealId.tsx`, `technical-solutions.$id.tsx`, `customers.index.tsx` | Carry `impl` on every `/customers/$customerId` link from an implementation-scoped record | No (param already supported) |
| `customers.$customerId.tsx:701, 897, 1506, 2018, 2133` | Thread `selectedImplId` into the intra-page `search={{ tab }}` links, matching the tab bar at 361-365 | No |
| `customers.index.tsx` | Group rows under an account header when >1 implementation; copy stops equating row = customer | Yes |
| `customers.$customerId.tsx` header | Show `health_recorded` (reason/by/at; "recorded before v2" when `_at` NULL) beside derived health, replacing raw "Manual flag" | Yes |
| `src/components/implementation-write.tsx` | Recorded-health section, required reason on at_risk/blocked, dual-writes `status` | Yes |
| `deals.$dealId.tsx` | "Start another implementation" instead of `alreadyLinked` dead-end; **explicit account picker** when no `salesforce_account_id` match (never silent duplicate-account insert) | Yes |
| `access.tsx` + `access.server.ts` | Invite upsert → select-then-insert/update (**lockstep with 0010**, see Step 7a); optional "Scope to implementation" select; grants list shows scope | Upsert fix: no. Scope UI: yes |
| `portal.index.tsx` / `portal.tickets.tsx` | Render only granted implementations; ticket form implementation picker | Scope filtering: no. Picker UX: yes |
| `tickets.server.ts` / `portal.server.ts` | `linkedCustomerGrants`, scoped `replyPortalTicket` | No (invariant) |

## 7. Behavior rules
1. `startOnboarding`: match account by `salesforce_account_id` when present (never by name); no match → explicit account picker (choose existing or confirm new); already-linked deal → new implementation under the existing customer; stamp `source='presale'` and `salesforce_opportunity_id`.
2. Duplicate `salesforce_opportunity_id` on create returns the existing implementation (partial unique index = idempotency key; Phase-4 `POST /api/v1/implementations` inherits it).
3. A child implementation is a full first-class implementation (own stage machine, history, health); rollup views are Phase 5.
4. Journeys *(corrected per critique)*: `journey_enrollments` stays account-scoped. `trigger_event='customer_created'` fires today (`journeys.server.ts:377, 726`) and continues to fire once per account — not per implementation. `trigger_event='stage_entered'` is **unwired** (stored and displayed only, `journeys.functions.ts:51`, `journeys.index.tsx:91`); Phase 1 documents it as such and defines no firing semantics; whoever wires it later must decide per-implementation scoping then.
5. Feature flag: `portal_app_config` key `v2_flags` → `{"account_model": bool}`, read server-side. Schema is additive; the flag gates workflow/UX changes only. Grant-scope enforcement and the invite-upsert replacement are unflagged invariants (see §5 and Step 7a).

## Proposed migrations

# Ordered migration steps (each with rollback)

Repo convention: numbered files in `supabase/migrations/`, never edit a shipped one. Two new SQL migrations (0009, 0010) with down-scripts in `supabase/rollbacks/` (new dir), plus code steps. **Sequencing constraint (critique mustFix 1): Step 7a (code) must be deployed BEFORE or WITH 0010 — never after.**

## Step 1 — `0009_account_model.sql` part A: account identity
```sql
alter table customers
  add column salesforce_account_id text,
  add column csm_owner_id uuid references team_members (id) on delete set null;
create unique index customers_sf_account_idx
  on customers (salesforce_account_id) where salesforce_account_id is not null;
```
**Rollback:** `drop index customers_sf_account_idx; alter table customers drop column salesforce_account_id, drop column csm_owner_id;` — export hand-entered SF ids first (`copy (select id, salesforce_account_id, csm_owner_id from customers where salesforce_account_id is not null or csm_owner_id is not null) to ...`).

## Step 2 — 0009 part B: backfill SF account id from the linked presale deal
```sql
update customers c
   set salesforce_account_id = pa.salesforce_id
  from portal_accounts pa
 where pa.customer_id = c.id
   and pa.salesforce_id is not null
   and c.salesforce_account_id is null;
```
(Uses the 0007 `portal_accounts.customer_id` link; `customers.external_id` untouched.)
**Rollback** *(narrowed per critique — must not null values a human corrected after the backfill)*: only null rows still equal to the backfilled value:
```sql
update customers c set salesforce_account_id = null
  from portal_accounts pa
 where pa.customer_id = c.id and c.salesforce_account_id = pa.salesforce_id;
```

## Step 3 — 0009 part C: implementation columns + indexes
```sql
alter table implementations
  add column parent_implementation_id uuid references implementations (id) on delete set null,
  add column salesforce_opportunity_id text,
  add column health_recorded text
    check (health_recorded in ('on_track','at_risk','blocked')),
  add column health_recorded_reason text,
  add column health_recorded_by uuid references team_members (id) on delete set null,
  add column health_recorded_at timestamptz,
  add column health_computed text
    check (health_computed in ('on_track','at_risk','blocked','no_signal')),
  add column health_computed_at timestamptz,
  add column health_computed_inputs jsonb;
create unique index implementations_sf_opportunity_idx
  on implementations (salesforce_opportunity_id) where salesforce_opportunity_id is not null;
create index implementations_parent_idx on implementations (parent_implementation_id);
```
**Rollback:** drop both indexes, drop all nine columns — MANDATED export first of human-entered health rows: `copy (select id, health_recorded, health_recorded_reason, health_recorded_by, health_recorded_at from implementations where health_recorded is not null) to ...`. Backfill-only values are safe (`status` never touched).

## Step 4 — 0009 part D: single-level parent guard
```sql
create or replace function implementations_parent_guard()
returns trigger language plpgsql as $$
begin
  if new.parent_implementation_id is null then return new; end if;
  if new.parent_implementation_id = new.id then
    raise exception 'An implementation cannot be its own parent';
  end if;
  if exists (select 1 from implementations p
              where p.id = new.parent_implementation_id
                and p.parent_implementation_id is not null) then
    raise exception 'Parent rollups are single-level: the chosen parent already has a parent';
  end if;
  if exists (select 1 from implementations c
              where c.parent_implementation_id = new.id) then
    raise exception 'This implementation has children and cannot itself take a parent';
  end if;
  return new;
end $$;
create trigger implementations_parent_guard
  before insert or update of parent_implementation_id on implementations
  for each row execute function implementations_parent_guard();
```
**Rollback:** `drop trigger implementations_parent_guard on implementations; drop function implementations_parent_guard();`

## Step 5 — 0009 part E: health backfill as an audited copy
```sql
update implementations
   set health_recorded = status          -- health_recorded_at stays NULL: updated_at is a proxy
 where status in ('on_track','at_risk','blocked')   -- touched by any edit (0003 touch trigger),
   and health_recorded is null;                     -- so it is not evidence of when health was recorded

insert into audit_log (entity_type, entity_id, field_name, old_value, new_value, change_reason, changed_at)
select 'implementation', id, 'health_recorded', null, health_recorded,
       'Backfilled 1:1 from implementations.status by migration 0009', now()
  from implementations
 where health_recorded is not null;
```
(UI renders NULL `health_recorded_at` as "recorded before v2". `idle`/`'active'` deliberately do not map.)
**Rollback** *(revised per critique — audit rows are user-visible history via `hub.server.ts:101/800` and an audit trail deleted on rollback is not an audit trail)*: null the copied values, then write **superseding** audit rows instead of deleting:
```sql
update implementations set health_recorded = null
 where id in (select entity_id::uuid from audit_log
               where field_name='health_recorded' and change_reason like 'Backfilled%0009')
   and health_recorded_at is null;   -- never touch rows a human has since re-recorded
insert into audit_log (entity_type, entity_id, field_name, old_value, new_value, change_reason, changed_at)
select 'implementation', entity_id, 'health_recorded', new_value, null,
       'Rollback of 0009 backfill: value superseded, original audit rows retained', now()
  from audit_log where field_name='health_recorded' and change_reason like 'Backfilled%0009';
```

## Step 6 — 0009 part F: feature flag row
```sql
insert into portal_app_config (key, value)
values ('v2_flags', '{"account_model": false}'::jsonb)
on conflict (key) do nothing;
```
**Rollback:** `delete from portal_app_config where key = 'v2_flags';`

## Step 7a — code PR (UNFLAGGED, deploy BEFORE or WITH 0010): remove the ON CONFLICT dependency
*(New step per critique mustFix 1.)* `src/lib/access.server.ts:122-132` upserts `customer_invites` with `onConflict: "email,customer_id"`. 0010 drops that named unique constraint, and PostgREST cannot use the replacement coalesce-expression index as an ON CONFLICT arbiter — so shipping 0010 first breaks **every invite at runtime while the flag is off**. Replace the upsert with select-then-update/insert on `(email, customer_id, implementation_id is not distinct from <scope>)` (scope = NULL until the scope UI ships). This code works under both the old and new schema, so the safe order is: deploy PR 7a → run 0010. Same PR replaces `linkedCustomerIds` with `linkedCustomerGrants` and adds the scope check to `replyPortalTicket` (behavior-identical while all grants are NULL-scoped).
**Rollback:** revert PR — but only if 0010 has not been applied (revert reintroduces the ON CONFLICT dependency).

## Step 7 — `0010_portal_implementation_scope.sql` part A: scoped grants
```sql
alter table customer_users
  add column implementation_id uuid references implementations (id) on delete cascade;
alter table customer_invites
  add column implementation_id uuid references implementations (id) on delete cascade;

alter table customer_users   drop constraint customer_users_profile_id_customer_id_key;
create unique index customer_users_scope_idx
  on customer_users (profile_id, customer_id, coalesce(implementation_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table customer_invites drop constraint customer_invites_email_customer_id_key;
create unique index customer_invites_scope_idx
  on customer_invites (email, customer_id, coalesce(implementation_id, '00000000-0000-0000-0000-000000000000'::uuid));
```
Pre-flight: verify actual constraint names in prod (`\d customer_users`) — defaults confirmed against 0005:56-81 but verify anyway. **Prerequisite: Step 7a deployed.**
**Rollback** *(revised per critique — mandate export, matching Step 3's honesty)*: MANDATED export first: `copy (select * from customer_users where implementation_id is not null) to ...` and same for `customer_invites`; then drop the two indexes; delete scoped rows (they cannot exist under the old constraints — the export is the record of destroyed grants/invites, and affected customers must be re-invited); re-add the original unique constraints; drop the two columns.

## Step 8 — 0010 part B: signup trigger carries the scope
Re-create `portal_handle_new_user()` (verbatim 0005 body) with two edits: the `customer_users` insert adds `implementation_id => inv.implementation_id`, and `on conflict (profile_id, customer_id) do nothing` becomes `on conflict do nothing`. Re-assert the 0005 `revoke execute` lines.
**Rollback:** re-create the exact 0005 function body (copied verbatim into the down script).

## Step 9 — 0010 part C: RLS scope tightening (defense-in-depth; app code is the primary enforcement — every app query runs service-role, `client.server.ts:32-59`)
Direct-column tables (`implementations`, and `tickets` with its NULL allowance):
```sql
drop policy "implementations customer select" on implementations;
create policy "implementations customer select" on implementations
  for select to authenticated
  using (exists (
    select 1 from customer_users cu
     where cu.profile_id = auth.uid()
       and cu.customer_id = implementations.customer_id
       and (cu.implementation_id is null or cu.implementation_id = implementations.id)));
```
Join-through 0005 tables (`milestones`, `commitments`, `success_criteria`): add `and (cu.implementation_id is null or cu.implementation_id = i.id)` inside the existing implementations join. `tickets` customer select/insert: `and (cu.implementation_id is null or tickets.implementation_id is null or tickets.implementation_id = cu.implementation_id)`. **`ticket_comments`** *(corrected per critique)*: its 0006 policy (0006:211-235) joins through `tickets t` with a **nullable** `t.implementation_id` — there is no implementations join in that policy — so the condition goes on `t.implementation_id` with the same NULL allowance: `and (cu.implementation_id is null or t.implementation_id is null or t.implementation_id = cu.implementation_id)`; otherwise scoped users lose comments on account-level tickets they can legitimately see. `customers`/`customer_contacts` policies unchanged.
**Rollback:** drop the new policies, recreate the 0005/0006 originals verbatim (bodies copied into the down file).

## Step 10 — code PR A (safe unflagged): carry `impl` on deep links
The 7 cross-page call sites AND the 5 intra-360 call sites (`customers.$customerId.tsx:701, 897, 1506, 2018, 2133` — thread `selectedImplId` the way line 361-365 does); `loadCustomer360` default pick becomes oldest-non-graduated behind the flag. **Rollback:** revert PR.

## Step 11 — code PR B (flagged): health read/write paths
Editor dual-writes `status` + `health_recorded(_reason/_by/_at)`; required reason on at_risk/blocked; `recomputeHealth()` writing `health_computed(_at/_inputs)` with the deciding-rows snapshot (top escalation/risk severity, tripping milestones, days_in_stage — see design §4) from delivery-write mutations, stage advance, and the SLA cron; recorded-vs-computed rendering. **Rollback:** flag off — reads fall back to `status` + live `deriveHealth` exactly as today.

## Step 12 — code PR C (flagged UX on top of unflagged enforcement): presale + portal workflows
`startOnboarding` account-matching + explicit account picker on no-match + second-implementation path + `source='presale'`; `submitPortalTicket` grant-based selection + portal ticket picker; `loadPortalHome`/`loadPortalTickets` grant filtering (the filtering predicate itself is the unflagged `linkedCustomerGrants` from 7a; the flag gates the picker/grouping UX); `access.tsx` scope select. **Portal-authorization tests land in this PR against the app paths**: `loadPortalHome`, `loadPortalTickets`, `submitPortalTicket`, `replyPortalTicket` (customer A vs B; scoped user vs sibling implementation; scoped user CAN see/reply account-level tickets), with RLS policy tests secondary. **Rollback:** flag off restores the `alreadyLinked` short-circuit and pickers; grant-scope enforcement stays on by design (see risk on flag-off widening); full de-scoping = Step 7 rollback procedure.

**Ordering:** 0009 → PR 7a → 0010 → PRs A/B/C in any order. 0009 is independently shippable and reversible; 0010 is shippable only after 7a and reversible per its down-script.

## Risks

- Primary authorization risk is in APP CODE, not RLS: every portal query runs on the service-role client (client.server.ts:32-59), so a missed enforcement point (the way replyPortalTicket and linkedCustomerIds were missed in v1 of this design) silently leaks sibling-implementation data regardless of policies. Mitigation: single choke point (linkedCustomerGrants) that every portal path must consume, plus the brief-required authorization tests against loadPortalHome/loadPortalTickets/submitPortalTicket/replyPortalTicket in the same PR; RLS (Step 9) is defense-in-depth only.
- Sequencing hazard: if 0010 ships before code PR 7a, every customer invite fails at runtime ('no unique or exclusion constraint matching the ON CONFLICT specification') because access.server.ts:122-132 names the dropped constraint as its upsert arbiter and PostgREST cannot use the coalesce-expression index. The deploy runbook must gate 0010 on 7a being live; conversely 7a must not be reverted after 0010 is applied.
- Flag-off is not a full rollback of portal scoping by design: grant-scope enforcement is permanent once 0010 lands, so disabling account_model can never re-widen a scoped user — but it also means truly reverting scoping requires the Step 7 rollback procedure (export + delete scoped grants + re-invite affected contacts). The rollback doc must say this explicitly.
- Production implementations.status values are unconstrained (no CHECK; DB default 'active'). The Step-5 backfill copies only the three health values; anything else yields health_recorded = NULL. Run `select status, count(*) from implementations group by 1` against prod before shipping 0009 and eyeball the distribution.
- Stored health_computed can go stale if a mutation path forgets recomputeHealth. Mitigated by keeping all current UI on live deriveHealth, rendering the cache only with computed_at + inputs, and the SLA cron as backstop sweep — but Phase-4 Salesforce write-back inherits any staleness between sweeps.
- Changing the default implementation pick (newest → oldest-non-graduated) changes what an impl-less bookmark shows for accounts that already have >1 implementation. Behind the flag, but a visible change worth announcing.
- Dropping the auto-named unique constraints in Step 7 assumes Postgres default names (confirmed against 0005:56-81, but verify in prod with \d before shipping; a mismatch aborts the migration harmlessly and blocks the deploy).
- Rollback of 0009 after humans record health reasons loses those entries; rollback of 0010 destroys scoped grants and pending invites. Both down-scripts MANDATE exports first, but that is procedural, not enforced — the runbook is the control.
- startOnboarding's match-by-salesforce_account_id depends on the Step-2 backfill, which covers only portal_accounts-linked customers. Unlinked/seeded customers have no SF id, so the explicit account picker in PR C is the guard against silent duplicate-account creation until ids are entered.
- The parent-guard trigger's exists-checks can miss a 2-cycle under two concurrent inserts naming each other as parent (READ COMMITTED). Acceptably rare for an internal tool; add `select ... for update` on the parent row if it ever matters.
- customers.external_id and implementations.external_ref semantically overlap the new salesforce_* columns; Phase-1 code must never write SF ids into the legacy columns, and the audit doc marks them import-legacy.
- health_computed_inputs snapshots include escalation/risk titles; they are internal-only evidence and must never be serialized into portal or /api/v1 customer-visible responses.

## Open questions

- When an account has several live implementations, what should account-level surfaces roll up for health — worst-of-children, primary-implementation-only, or no rollup (per-implementation rows only, as today)? This decides what /portfolio and the future Salesforce Account write-back show.
- Existing portal logins are account-wide (NULL grant). When a second implementation goes live on an account, should existing customer users automatically see it (current behavior, preserved by NULL), or should go-live of a new implementation require explicitly widening/scoping each contact's access?
- Presale shape: portal_accounts is one row per account (salesforce_id unique), not one per opportunity. Where does an add-on/expansion opportunity live — re-running the same deal record, a new deal row (requires relaxing the unique salesforce_id), or Phase-4 API only? This determines whether startOnboarding needs a full 'second deal' concept or just the 'start another implementation' action.
- Is 'idle' a health you want to keep recording, or a lifecycle status (paused/on-hold)? We propose it is not a health (health_recorded stays NULL for idle rows) — confirm, because it changes the portfolio filter chips.
- Should health_recorded_reason be mandatory for at_risk/blocked from day one of Phase 1 (Precursive rule pulled forward), or only when Workstream 5 ships? Mandatory now means the first person to flag at_risk after the flip meets a new required field with no warning.
- Are phased rollouts ever more than one level deep (region -> country -> site)? We enforce single-level parent/child; deeper trees are a schema-compatible relaxation later but the trigger and future rollup queries differ.
- Customer-facing and internal noun: 'Account' or 'Customer' in UI copy? URLs stay /customers either way; and the type-name target (HubAccount vs keeping Customer*) belongs to the naming workstream since presale code currently binds bare 'account' to deals.
- Who supplies salesforce_account_id for existing customers with no linked presale deal (the backfill covers only 0007-linked rows) — manual entry in the UI, a one-off CSV, or wait for the Phase-4 sync?
- Scoped portal users and account-level artifacts: our rule lets an implementation-scoped contact see and reply to tickets with implementation_id NULL on their account (they can also file them). Acceptable, or must scoped contacts be strictly limited to their implementation's tickets?
- When the stage_entered journey trigger is eventually wired (it is unwired today), should enrollment be per-account (current journey_enrollments shape) or per-implementation? Phase 1 takes no position; the answer decides whether journey_enrollments needs an implementation_id column later.

## Adversarial critique (panel record)

{
  "verdicts": [
    {
      "aspect": "Brief non-negotiables (evidence-over-inference, URLs, reversible migrations, flag-shippable)",
      "verdict": "flawed",
      "reason": "The 'schema is additive and inert when off' claim is FALSE for 0010: Step 7 drops customer_invites_email_customer_id_key, but src/lib/access.server.ts:122-132 does .upsert(..., { onConflict: \"email,customer_id\" }) — after 0010 ships, every customer invite fails at runtime with 'no unique or exclusion constraint matching the ON CONFLICT specification' while the flag is OFF (PostgREST cannot infer the new coalesce-expression index as the arbiter). Second flag violation: once any scoped grant exists, turning account_model off makes loadPortalHome/loadPortalTickets ignore scope again (service-role paths), silently re-widening a scoped customer to account-wide data — the claimed 'flag off restores today's behavior for NULL-scoped grants' is only true if no scoped grant was ever issued. Evidence-over-inference is mostly respected (status untouched, backfill audited, computed never overwrites recorded — verified against customer360-derive.ts:121-221 and customers.index.tsx:206-215), with two lapses: backfilling health_recorded_at from updated_at stamps a proxy (any edit touches updated_at via the 0003 touch trigger) as a recorded fact, and the health_computed_inputs shape ({open_escalations, open_risks, ...} counts) cannot reproduce deriveHealth's actual decision, which turns on the SEVERITY of the top escalation/risk (customer360-derive.ts:150-172) and milestone statuses — counts alone are a summary, not 'the exact inputs'. URLs: genuinely safe (no route changes, ?impl already supported at customers.$customerId.tsx:249-253); the newest→oldest-non-graduated default flip is honestly flagged as a visible change."
    },
    {
      "aspect": "Breakage of existing code paths (what the inventory missed)",
      "verdict": "flawed",
      "reason": "The 8-callsite deep-link inventory is accurate as far as it goes (verified index.tsx:115, portfolio.tsx:84-88 CustomerLink, alerts.tsx:141-147, tickets.$ticketId.tsx:158-163, deals.$dealId.tsx:178-184, technical-solutions.$id.tsx:101-117, customers.index.tsx:192-201) but it MISSED an entire family inside the 360 page itself: customers.$customerId.tsx ~697-703 (readiness-area links), ~893-898 (stage-history link), ~1502-1508 (requirements link from the solution panel), ~2014-2020 and ~2129-2135 (gate/trace/evidence links) all emit search={{ tab }} WITHOUT impl — while the tab bar at line 365 correctly carries it. On an account with 2 implementations, clicking 'History' or a readiness link from implementation B silently teleports you to implementation A's data — worse than the cross-page links because it happens mid-review of a chosen implementation. Also missed: replyPortalTicket (portal.server.ts:370-383) authorizes by customer only via requireCustomerIds — the design fixes submitPortalTicket/loadPortalHome/loadPortalTickets but a scoped user can still read (via loadPortalTickets until PR C) and reply to sibling-implementation tickets; linkedCustomerIds (tickets.server.ts:556-562) must return grant scope, not bare customer ids. Minor inventory error: behavior rule 4 documents journey stage_entered firing semantics, but trigger_event is stored and displayed only (journeys.index.tsx:91, journeys.server.ts) — no code fires it; the rule documents a phantom behavior."
    },
    {
      "aspect": "Migration safety and rollback honesty",
      "verdict": "flawed",
      "reason": "Structure is genuinely good (numbered files, verbatim-copied down policies, status kept as safety net, constraint-name verification risk called out — and the default names customer_users_profile_id_customer_id_key / customer_invites_email_customer_id_key are correct per 0005:56-81). But: (1) the ON CONFLICT arbiter break above means Step 7 is not a safe standalone DB migration — it requires a lockstep code deploy the plan doesn't sequence; (2) Step 7's ROLLBACK does 'delete from customer_users/customer_invites where implementation_id is not null' — it destroys real user grants and pending invites with no mandated export, while Step 3's rollback carefully mandates a CSV export for health reasons — inconsistent honesty about data loss; (3) Step 5's rollback DELETES the audit_log backfill rows — an audit trail you delete on rollback is not an audit trail, and hub.server.ts:101/800 renders audit_log in the UI, so those rows are user-visible history; mark them superseded instead; (4) Step 2's rollback nulls salesforce_account_id for ALL portal_accounts-linked customers, including values a human corrected after the backfill. The coalesce-sentinel-uuid uniqueness trick and the parent-guard trigger are fine (concurrency caveat honestly listed)."
    },
    {
      "aspect": "RLS / authorization holes",
      "verdict": "flawed",
      "reason": "The section is built on a miscalibrated premise: EVERY app read/write goes through supabaseAdmin with the service-role key (src/integrations/supabase/client.server.ts:38-53; portal.server.ts:1-12, access.server.ts:6, hub.server.ts, tickets.server.ts) — RLS is bypassed for all of it, as 0003's own header admits ('the app's service-role data layer bypasses RLS anyway'). So Step 9's policy rewrite is defense-in-depth only; the actual enforcement of implementation scoping is the app-code changes in PR C, and the design's top risk item ('a wrong OR locks existing portal users out') is wrong — no RLS mistake can affect the portal UI at all. Consequences the design misses: the brief-mandated portal-authorization tests must target loadPortalHome/loadPortalTickets/submitPortalTicket/replyPortalTicket app paths, and replyPortalTicket is absent from the touched-surfaces list entirely (real hole). Also the Step 9 sketch for ticket_comments ('add cu.implementation_id = i.id inside the existing join') is wrong for that table — its 0006 policy (0006:211-235) joins through tickets t with a NULLABLE t.implementation_id; the condition must be on t.implementation_id with the same account-level-NULL rule as the tickets policy, or scoped users lose comments on account-level tickets they can see. The NULL-grant = today's behavior default is correct and the pattern for the 0005 direct/join tables matches the real policy bodies."
    },
    {
      "aspect": "Naming-collision handling (customers stays, no rename/alias view)",
      "verdict": "sound",
      "reason": "The DB-level call is correct and evidence-backed: 0003's header confirms the shared database already contains a prototype 'accounts' table, portal_accounts are presale DEALS (0001:105-119), and renaming customer_id would touch 20+ indexes and every 0005/0006 policy body for zero behavior. Keeping /customers URLs canonical is consistent. One self-contradiction to fix, not enough to sink the aspect: the proposed TS alias 'type Account = CustomerRow' recreates the exact three-way ambiguity in code that the design refuses in the schema — presale code already binds 'account' to deals (startOnboarding's local variable `account` IS a portal_accounts row, presale.server.ts:453-460, and /api/v1/accounts endpoints are deals). A developer reading `account.customer_id` will not know which of three meanings applies."
    },
    {
      "aspect": "Phase-2 definition-of-done readiness",
      "verdict": "sound",
      "reason": "Nothing in Phase 1 blocks the five DoD items, and the load-bearing seams are real: createImplementation (hub.server.ts:1388-1431) and the fixed startOnboarding cover DoD 2's 'implementation for an existing account with a live new-logo implementation'; the ?impl switcher plus grouped /customers rows plus per-implementation /portfolio rows satisfy DoD 4's 'rolled up under one account / separate in portfolio' (the brief itself defers multi-site parent ROLLUP views to Phase 5 — 'portfolio rollups for multi-site programmes' — so parent_implementation_id-as-inert-column is the right Phase-1 scope); template/version columns are correctly left to Phase 2 since instantiation semantics decide their shape; salesforce_opportunity_id's partial unique index pre-builds Workstream 6's idempotency key. The honest open questions (where an add-on opportunity lives given portal_accounts' unique salesforce_id; idle-as-health) are the right ones and none gates Phase 2's in-app DoD flows. Caveat only: DoD 2 assumes an account picker exists when presale can't match by salesforce_account_id — the design's risk item 7 acknowledges this but the picker isn't in the UI-surfaces table; add it to PR C's scope."
    }
  ],
  "mustFix": [
    "Sequence the invite-upsert fix WITH migration 0010, not in flagged PR C: src/lib/access.server.ts:122-132 upserts customer_invites with onConflict:\"email,customer_id\"; dropping that unique constraint in Step 7 makes every invite fail at runtime with the flag OFF ('no unique or exclusion constraint matching the ON CONFLICT specification' — PostgREST cannot use the new coalesce-expression index as arbiter). Replace the upsert with select-then-insert/update (or an RPC) in the same deploy as 0010.",
    "Add the missed intra-360 link family to the impl-carry work: customers.$customerId.tsx ~697-703, ~893-898, ~1502-1508, ~2014-2020, ~2129-2135 emit search={{ tab }} without impl and silently reset the reader to the default implementation; thread selectedImplId through them the way the tab bar at line 361-365 already does.",
    "Scope replyPortalTicket (portal.server.ts:370-383) and change linkedCustomerIds (tickets.server.ts:556-562) to return {customer_id, implementation_id} grants — otherwise an implementation-scoped user can reply to (and, until PR C lands, read) sibling-implementation tickets, because every portal path runs on the service-role client and never touches RLS.",
    "Rewrite the RLS section's framing and tests: all app queries use supabaseAdmin (client.server.ts:38-53), so Step 9 is defense-in-depth; the brief-required portal-authorization tests must exercise the app-code paths (loadPortalHome, loadPortalTickets, submitPortalTicket, replyPortalTicket) as the primary enforcement, with RLS tests secondary. Also fix the ticket_comments policy sketch: the scope condition goes on tickets.implementation_id (nullable, with the same account-level-NULL allowance as the tickets policy), not on an implementations join that table doesn't have.",
    "Close the flag-off widening leak: once any implementation-scoped grant exists, disabling account_model silently returns those users to account-wide visibility. Either make grant-scope filtering permanent (unflagged) code once 0010 is applied, or have the flag-off procedure require deleting/NULLing scoped grants first and say so in the rollback doc.",
    "Fix rollback honesty in two places: Step 7's down-script deletes real customer_users/customer_invites rows — mandate an export first (the design already does this for health in Step 3, so match it); and Step 5's down-script must not DELETE audit_log rows (they render in the UI via hub.server.ts:101/800 and an audit trail deleted on rollback is not an audit trail) — write a superseding audit row instead.",
    "Tighten the recorded/computed evidence: leave health_recorded_at NULL in the backfill (updated_at is touched by ANY edit via the 0003 touch trigger — presenting it as when the human recorded health is inference dressed as fact; render 'recorded before v2') and extend health_computed_inputs beyond counts to capture the deciding rows (top escalation/risk severity+title, days_in_stage, the milestone that tripped) so the cache can actually reproduce deriveHealth's branch (customer360-derive.ts:150-203), not just gesture at it.",
    "Drop or rename the 'type Account = CustomerRow' alias — presale code already binds 'account' to deals (presale.server.ts:453-460 names a portal_accounts row `account`; /api/v1/accounts endpoints are deals). Use HubAccount/CustomerAccount or keep 'Customer' in types until the naming workstream renames the presale side; and delete behavior-rule 4's claim that stage_entered drips 'fire' — trigger_event is stored and displayed only, no code executes it, so document it as unwired instead of specifying semantics for a phantom."
  ]
}
