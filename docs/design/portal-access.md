# Design: External Portal Access

> Produced by the v2 Step-0 design panel (workflow wf_f952802b-e7e, 2026-08-29).
> Each design was drafted, adversarially critiqued, and revised (all four revised).

# Workstream 4 — External Portal Access Model (rev. 2, post-critique)

## 0. Critique disposition

All 14 mustFix items are **accepted** — each was re-verified against the repo and the critic is right. Fixes are incorporated inline below: (1) hex `share_slug` + no redundant backfill + rewrite/lock note, §2.3; (2) service-role-only grant writes + consistency trigger, §2.1; (3) auth-door column leak closed by dropping direct customer selects on `customers`/`implementations` (verified safe: `/portal` renders exclusively via server functions on `supabaseAdmin` — `portal.functions.ts` → `portal.server.ts:120`), §4.1 + migration 0012; (4) reassign grants inherit parent expiry/passcode, §3; (5) revoke-on-contact-delete and revoke-on-close triggers, §2.1; (6) snapshots generated through the same DTO allowlist, `at_risk[]` contradiction resolved as fact-based `attention[]`, §2.5; (7) snapshot share links get non-null enforced expiry (DB check constraint), §2.5; (8) sow-pdf.ts claim withdrawn — server-side snapshot PDF specified and costed as net-new, §2.5; (9) all buckets provisioned in a numbered migration per the real 0001 precedent (including the currently-unprovisioned `attachments` bucket `hub.server.ts:1675` depends on), `customer-branding` made private with signed URLs, migration 0011; (10) 0010 rollback rewritten archive-then-remove, 0009/0013 rollbacks state data-loss preconditions honestly with export/preserve steps, migrations section; (11) internal preview specified without weakening AuthGate, §3; (12) collision check re-run against the full 28-table 0003 list and recorded, §2.0; (13) `/plan/$token` specified as an SSR loader that verifies and sets the cookie in the response — the `/view/$token` useEffect pattern is explicitly NOT the model, §3; (14) `created_via='snapshot_cron'` removed; reopen semantics defined append-only, §2.4/§3.

Two clarifications (not rebuttals): the journeys `recordView` citation is corrected — it dedupes once-ever, not hourly; hourly dedupe here is a new rule, not a precedent. And the new column is renamed `share_slug` to avoid confusion with the pre-existing `implementations.external_ref` (`0003_hub_tables.sql:82`).

## 0.1 Ground truth this design is built on (verified in code)

- **The server layer already bypasses RLS.** Every server function goes through `supabaseAdmin` (service role) with app-level authorization: `requireInternal()` / `requireCustomerIds()` in `src/lib/portal.server.ts`. RLS (0005) is defense-in-depth for the browser client only. Verified for this revision: `/portal` pages load through `loadPortalHome`/server functions, never the browser client — which is what makes migration 0012 (dropping direct customer selects) behavior-neutral.
- **Token precedents:** API keys — sha256 hash in `portal_api_keys` with prefix/scopes/revoked_at (`src/lib/server/api-auth.ts`); HS256 JWTs with `jti` (`src/lib/server/tokens.ts`). Share links use the hash-in-DB pattern (§2.1).
- **Storage reality (corrected):** buckets ARE provisioned in SQL — `0001_portal_init.sql:378` inserts `portal-briefs` and `portal-uploads` into `storage.buckets`, commented "private; server signs URLs for every download". The `attachments` bucket used by `hub.server.ts` is provisioned nowhere in the repo. This design fixes that (migration 0011) and follows the all-private/signed-URL convention for branding assets.
- **PDF reality (corrected):** `src/lib/sow-pdf.ts` is client-side jsPDF (`downloadSowAnalysisPdf`, imported by `src/components/sow-analysis.tsx`). There is no server-side PDF path in the repo; snapshot PDFs are net-new work (§2.5).
- **AuthGate** (`src/components/auth-gate.tsx`): `PUBLIC_PREFIXES` uses exact-or-slash matching (line 8), so adding `/plan` cannot shadow `/portfolio` etc.; lines 42–44 hard-redirect internal users off `/portal/*` — hence the internal-preview mechanism in §3 that does not touch the gate.
- **Audit:** `portal_audit_log.actor_type` check is `('user','api_key','email_token','system')`; external actions need a new actor type (migration 0010).
- **Feature-flag plumbing is net-new:** nothing in `src/` reads `portal_app_config` today (only SQL triggers do). §2.7 costs a config-read helper and requires flag enforcement in server loaders, not just UI hiding.
- **Dependency:** the plan page renders W2 `work_items` (`visibility`, `party`); until W2 lands, the projection falls back to milestones + open commitments (read-only).

## 1. Reconciliation of the two access models

**Keep both, converge behind one projection layer.**

| | Signed link (new) | Supabase auth (existing, kept) |
|---|---|---|
| Who | Any customer contact, no account | Strict-IT contacts + everyone already invited via `/access` |
| Identity | `external_access_grants` row → `customer_contacts` | `auth.users` → `portal_profiles(role='customer')` → `customer_users` |
| Scope | One implementation per grant | All implementations of linked customer(s) — current `/portal` behavior, unchanged |
| Enforcement | Service-role server fns verifying the credential; RLS grants anon nothing | Server fns via `requireCustomerIds()`; RLS backstop **narrowed by migration 0012** (§4.1) |
| URL | `/plan/$token` (opaque token, no internal IDs) | `/portal` + `/portal/plan/$shareSlug` |

One TypeScript type is the single authorization/projection core:

```ts
// src/lib/server/external-viewer.ts
export type ExternalViewer =
  | { kind: "grant"; grantId: string; implementationId: string;
      customerId: string; contactId: string | null; canComplete: boolean }
  | { kind: "auth"; profileId: string; customerIds: string[] }
  | { kind: "preview"; profileId: string };   // internal staff; requireInternal() gated, read-only

export async function loadSharedPlan(viewer: ExternalViewer, implementationRef: string): Promise<SharedPlan>;
// The projection is factored so the snapshot generator consumes it too:
export function buildSharedPlanDTO(rows: SharedPlanInputs): SharedPlan; // pure, allowlisted fields only
```

`loadSharedPlan` resolves `implementationRef` (a `share_slug`, never a uuid, when from a URL), checks scope, and projects only shared-visibility objects through `buildSharedPlanDTO`. `/plan/$token`, `/portal/plan/$shareSlug`, the internal preview, **and the weekly snapshot generator** (§2.5) all pass through `buildSharedPlanDTO` — the single-serializer claim is now structurally true, and the serializer test (§5 test 4) covers every consumer.

**Honest caveat on the auth door** (was the critic's hole #1): the projection layer only governs server-rendered data. The auth door also has direct PostgREST access under 0005's policies, and those policies are full-row — `customers.arr/segment`, `implementations.sow_value/sow_document_url/discovery_board_url/discovery_notes/customer_goals/tier` were readable by any customer-auth user with the publishable key, bypassing `loadSharedPlan` entirely. Fixed at the source: migration 0012 drops the customer-select policies on `customers` and `implementations` (customer browser sessions read zero rows of those tables directly; server functions are unaffected because they use the service role). Customer-select policies on the narrow tables (`milestones`, `commitments`, `success_criteria`, `tickets`, `ticket_comments`, `customer_contacts`) are individually column-audited in the 0012 header and kept only where every column is customer-safe; any that fail the audit are dropped the same way. §5 gains column-level assertions on direct PostgREST reads (test 5b).

**Rejected alternative (unchanged):** minting GoTrue anonymous JWTs so RLS could authorize token viewers — rejected (second RLS dialect to audit; `auth.users` pollution; the real enforcement point is already the service-role layer). RLS's job for all new tables: anon and customer roles can read nothing.

## 2. Schema (SQL sketches)

### 2.0 Naming-collision check (re-run, full list)

Checked against the **complete 28-table prototype list from the 0003 header** (clients, users, forms, submissions, submission_fields, reports, accounts, sessions, verification_tokens, alert_rules, webhooks, shared_links, reference_tables, reference_rows, invites, form_versions, dashboards, dashboard_tiles, insight_items, routing_rules, solutions, proposals, price_book_items, connectors, api_specs, proposal_views, deal_activities, proposal_snapshots) plus all hub/portal tables: `external_access_grants`, `external_plan_events`, `work_item_comments`, `work_item_files`, `plan_snapshots`, `portal_audit_log_external_archive` — **no collision**. Near-misses, checked and distinct: `plan_snapshots` vs prototype `proposal_snapshots`; `external_plan_events` vs hub `engagement_events`. This check, including the near-misses, is recorded verbatim in the 0009 migration header, matching 0003's precedent.

### 2.1 `external_access_grants`

Hash-in-DB (API-key pattern), not a stateless JWT: revocation, lockout, and telemetry need the row anyway — the row is the source of truth.

```sql
create table external_access_grants (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  customer_id       uuid not null references customers (id) on delete cascade,
  contact_id        uuid references customer_contacts (id),  -- no ON DELETE action; a trigger revokes instead (below)
  email             text not null,
  token_hash        text not null unique,          -- sha256 hex; raw token never stored or logged
  token_prefix      text not null,                 -- first 8 chars for admin UI ("gcpl_ab12…")
  can_complete      boolean not null default true,
  passcode_hash     text,                          -- scrypt; null = none
  passcode_attempts int not null default 0,
  locked_until      timestamptz,
  expires_at        timestamptz not null,          -- immutable once issued; renew = rotate
  revoked_at        timestamptz,
  revoked_by        uuid references portal_profiles (id),
  revoke_reason     text check (revoke_reason in ('manual','rotated','contact_removed','implementation_closed')),
  superseded_by     uuid references external_access_grants (id),
  parent_grant_id   uuid references external_access_grants (id), -- set by reassign; expiry inheritance chain
  created_by        uuid references portal_profiles (id),        -- null only when created_via='reassign'
  created_via       text not null default 'internal' check (created_via in ('internal','reassign')),
  created_at        timestamptz not null default now(),
  last_opened_at    timestamptz,
  open_count        int not null default 0
);
create index eag_impl_idx on external_access_grants (implementation_id);
create index eag_contact_idx on external_access_grants (contact_id);

alter table external_access_grants enable row level security;
-- Internal staff may READ grants (admin UI lists them). ALL writes are
-- service-role only: no authenticated insert/update/delete policies exist,
-- so no browser session — sales, tam_se, anyone — can mint or alter a grant.
-- Issuance goes through an audited server fn gated app-side to
-- admin/super_admin/manager/implementation roles (portal_can_manage pattern).
create policy "eag internal select" on external_access_grants
  for select to authenticated using (portal_is_internal());

-- Belt-and-braces consistency + immutability trigger (service role bypasses RLS,
-- not triggers): customer_id must equal the implementation's customer on insert;
-- expires_at, token_hash, implementation_id, customer_id immutable after insert.
create function eag_enforce() returns trigger language plpgsql as $$ ... $$;
create trigger eag_enforce_trg before insert or update on external_access_grants
  for each row execute function eag_enforce();

-- Automatic revocation (mustFix 5):
-- 1) Contact offboarded: before delete on customer_contacts, revoke that
--    contact's active grants (revoke_reason='contact_removed') into an
--    AFTER trigger writing portal_audit_log via the app is not possible from
--    SQL alone, so the trigger sets revoked_at/reason and the nightly
--    reconcile job emits the audit rows; contact_id then set null by the trigger.
create trigger cc_revoke_grants_trg before delete on customer_contacts
  for each row execute function revoke_grants_for_contact();
-- 2) Implementation closed/churned: trigger on implementations status/stage
--    transition into a terminal value revokes all active grants
--    (revoke_reason='implementation_closed') and expires live snapshot shares.
create trigger impl_close_revokes_grants_trg after update on implementations
  for each row when (/* new stage/status is terminal and old was not */)
  execute function revoke_grants_for_implementation();
```

Token: `gcpl_` + 32 random bytes base64url (app-side; URL-safe by construction). URL `${APP_URL}/plan/<token>`.

**Lifecycle rules**
- *Verify* (every request): row by `sha256(token)`, `revoked_at is null`, `expires_at > now()`, not locked. All failures render the same neutral page (no oracle).
- *Passcode*: 5 wrong attempts → `locked_until = now() + 15 min`; set/reset by internal staff, delivered out-of-band, never in the link email.
- *Session*: after verify, HttpOnly/Secure/SameSite=Lax cookie `gc_plan` = HS256 JWT `{sub: grant_id, pc: bool}`, TTL 24h, signed with new `PLAN_SESSION_SECRET` (`jose`, as in `src/lib/server/tokens.ts`). Mutations accept only the cookie (POST-only server fns; CSRF-resistant). Every request re-loads the grant row, so revocation kills live cookies at next check.
- *Revoke / rotate*: internal UI; rotate = new grant + old `revoked_at`/`superseded_by`/`revoke_reason='rotated'`. Renew is always rotation; `expires_at` is trigger-enforced immutable — evidence of what was issued.
- *Expiry default*: `portal_app_config` key `external_plan_link_ttl_days` (seeded 60).

### 2.2 `external_plan_events`

```sql
create table external_plan_events (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  grant_id          uuid references external_access_grants (id) on delete cascade,
  implementation_id uuid not null references implementations (id) on delete cascade,
  contact_id        uuid references customer_contacts (id) on delete set null,
  profile_id        uuid references portal_profiles (id) on delete set null, -- auth-door viewers
  event             text not null check (event in
                    ('opened','task_completed','task_reopened','comment_added',
                     'file_uploaded','task_reassigned','snapshot_viewed','passcode_failed',
                     'grant_revoked','grant_rotated')),
  metadata          jsonb,  -- work-item ref, ua_family; no raw IPs
  created_at        timestamptz not null default now()
);
create index epe_impl_time_idx on external_plan_events (implementation_id, created_at desc);
create index epe_grant_idx on external_plan_events (grant_id, event, created_at desc);
-- RLS: enable; internal select only; NO insert/update/delete policies for any
-- non-service role — engagement history cannot be forged from a browser.
```

This table is **append-only** and is the evidence of record for all external activity (see reopen semantics, §2.4). `opened` is deduped to one per grant per hour — a new rule, not a journeys precedent (`recordView` dedupes once-ever); recorded from a post-hydration client beacon, never from the GET, so Outlook SafeLinks prefetches record nothing. `last_opened_at`/`open_count` denormalized on write. Input for W5's engagement signal, which links to these rows (evidence over inference). Never rendered to customers.

### 2.3 Customer-facing keys — `share_slug` (renamed; `external_ref` already exists on implementations)

```sql
-- NOTE: volatile default on ADD COLUMN forces a full-table REWRITE under
-- ACCESS EXCLUSIVE lock and fills EVERY existing row itself — no backfill
-- UPDATE needed or included. implementations is small (hundreds of rows);
-- lock window is milliseconds, run off-peak regardless.
alter table implementations
  add column share_slug text not null unique default encode(gen_random_bytes(9), 'hex');
-- hex only: base64 emits '/' and '+' which break a path segment. 18 hex chars
-- (72 bits) is unguessable-enough for an identifier that is NOT a credential
-- (auth still required on every route that uses it).
```

Uuids never appear in any URL an outsider sees; `/plan/$token` carries only the token; snapshot pages only a snapshot token.

### 2.4 Customer actions (extends W2's `work_items`)

```sql
alter table work_items
  add column assigned_contact_id uuid references customer_contacts (id) on delete set null,
  add column completed_by_contact_id uuid references customer_contacts (id) on delete set null,
  add column completed_via text check (completed_via in ('internal','external_link','external_auth'));
```

**Reopen/re-complete semantics (mustFix 14):** the append-only `external_plan_events` + `portal_audit_log` rows are the completion evidence of record; the `work_items` columns are a denormalized "latest state" pointer, never the evidence itself. Reopening records a `task_reopened` event and flips `status`, but **does not clear** `completed_by_contact_id`/`completed_at`; a subsequent completion writes a new `task_completed` event and updates the pointer columns. Nothing recorded is ever erased or overwritten — computed views cite the event rows.

```sql
create table work_item_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  work_item_id uuid not null references work_items (id) on delete cascade,
  author_profile_id uuid references portal_profiles (id),
  author_contact_id uuid references customer_contacts (id),
  internal boolean not null default false,   -- same rule as ticket_comments.internal
  body text not null,
  created_at timestamptz not null default now(),
  check (author_profile_id is not null or author_contact_id is not null)
);

create table work_item_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  work_item_id uuid not null references work_items (id) on delete cascade,
  implementation_id uuid not null references implementations (id) on delete cascade,
  storage_path text not null,   -- attachments/implementations/<impl_id>/external/<grant_id>/<uuid>_<name>
  file_name text not null, mime_type text not null, size_bytes bigint not null,
  uploaded_by_contact_id uuid references customer_contacts (id),
  uploaded_by_profile_id uuid references portal_profiles (id),
  created_at timestamptz not null default now()
);
-- RLS both: internal CRUD via portal_is_internal(); customer-auth SELECT via the
-- 0005 join pattern (…→implementations→customer_users), internal=false only for
-- comments — every exposed column audited as customer-safe in the migration
-- header; no anon policies; token path is service-role only.
```

`portal_audit_log.actor_type` gains `'external_contact'`; every external mutation audited with `actor_id = grant_id` and contact email in payload.

### 2.5 `plan_snapshots`

```sql
create table plan_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  week_start date not null,
  generated_at timestamptz not null default now(),
  generated_by uuid references portal_profiles (id),  -- null = cron
  supersedes_id uuid references plan_snapshots (id),  -- corrections regenerate, never edit
  content jsonb not null,          -- frozen SharedPlanSnapshot DTO (below)
  share_token_hash text unique,
  share_expires_at timestamptz,
  share_revoked_at timestamptz,
  unique (implementation_id, week_start, generated_at),
  -- mustFix 7: a share token cannot exist without an expiry — DB-enforced.
  check (share_token_hash is null or share_expires_at is not null)
);
-- RLS: internal select/insert; customer-auth select via customer_users join
-- (content is already the customer-safe DTO, so full-row is safe by construction);
-- no anon. Writes beyond insert: service-role only (frozen records).
```

**Single serializer (mustFix 6):** the cron generates `content` by calling the same `buildSharedPlanDTO` used by `loadSharedPlan`, then freezing its output plus a delta section — `SharedPlanSnapshot = { plan: SharedPlan (allowlisted DTO), moved[], attention[], we_owe[], you_owe[], next_milestone, contact }`. There is no second serializer; §5 test 4 asserts snapshot content keys ⊆ the same frozen allowlist.

**`at_risk[]` contradiction resolved:** internal risks/issues/health are never customer-visible, in snapshots or anywhere. The section is renamed `attention[]` and may contain only customer-observable facts already in the shared projection: overdue shared work items, milestone dates that slipped between snapshots (both dates shown — evidence, not judgment), and commitments past due. No internal risk-register content, no health scores, no internal commentary.

Share links: minted lazily on "share"; token `gcps_` + 32 bytes base64url, hash stored; **default expiry 30 days** (`portal_app_config` key `snapshot_share_ttl_days`), non-null enforced by the check constraint; revocable via `share_revoked_at`; revoked automatically when the implementation closes (§2.1 trigger).

**PDF (mustFix 8 — corrected and costed):** there is no server-side PDF path in the repo today; `sow-pdf.ts` is client-side jsPDF and stays untouched. Net-new work: `src/lib/server/snapshot-pdf.ts` using jsPDF in Node (jsPDF runs in Node for text/table/vector output — no DOM needed for this layout; no headless browser on Vercel). Rendered on demand at `/plan/s/$snapshotToken?pdf=1` and attachable to the weekly email. Estimate: ~2–3 days including branding layout, distinct from the page work. Accepted limitation: a downloaded PDF is unrevocable — stated in risks and open questions.

### 2.6 Branding

```sql
alter table customers add column logo_path text;
```

Logo objects live in a **private** `customer-branding` bucket (provisioned in migration 0011 per the 0001 `storage.buckets` precedent) and are served via short-lived signed URLs from the plan/snapshot SSR loaders — matching 0001's "private; server signs URLs for every download" convention. No public bucket.

### 2.7 Feature flag — including the net-new plumbing

`portal_app_config` rows: `external_plan_enabled=false`, `external_plan_link_ttl_days=60`, `external_plan_reassign_daily_limit=10`, `snapshot_share_ttl_days=30`.

**Costed as new work (critic caveat accepted):** no app code reads `portal_app_config` today. Add `src/lib/server/app-config.ts` (`getConfig(key)` with a 60s in-memory TTL cache on `supabaseAdmin`). Enforcement is server-side: the `/plan/*` SSR loaders and every external server fn check `external_plan_enabled` first and return 404/Forbidden when off; UI hiding is cosmetic on top.

## 3. Behavior rules

**Projection allowlist (`buildSharedPlanDTO` — the only serializer, all doors)**
- Their tasks first: shared work items grouped due-today / this-week / overdue / later; "you owe us" = `party='customer'`; "we owe you" = milestone-level summaries + open `commitments`.
- Milestone timeline, current stage label (customer vocabulary from `lifecycle.ts`).
- Contact: implementation owner name + email only.
- Shared documents: `work_item_files` + explicitly shared evidence.
- **Never rendered:** `visibility='internal'` items, journal, internal comments, risks/issues/escalations, health (recorded or computed), engagement telemetry, ARR/segment/sow_value/tier/discovery material, any uuid.
- Every DTO field explicitly named; serializer test asserts keys ⊆ allowlist for **all** consumers (plan page, portal page, preview, snapshot).

**`/plan/$token` is SSR, not the `/view/$token` pattern (mustFix 13).** `/view/$token` verifies client-side in a useEffect; that is explicitly not the model here. `/plan/$token` uses a TanStack Start SSR route loader (server-side): it verifies the grant, sets the `gc_plan` cookie on the response, and returns either the fully-rendered plan, the passcode form, or the neutral error page — one round trip, no client waterfall, satisfying the SSR non-negotiable. The post-hydration `opened` beacon is then meaningful precisely because the GET/SSR pass records nothing.

**Customer actions (cookie-authenticated POST server fns, scoped grant → implementation)**
- *Complete*: iff `can_complete` ∧ `party='customer'` ∧ `visibility='shared'` ∧ item ∈ grant's implementation ∧ W2 dependency gating passes; sets status/`completed_at`/`completed_via='external_link'`/`completed_by_contact_id`; `task_completed` event; audited; owner notified via `sendEmail`. *Reopen* within 24h: `task_reopened` event + status flip; completion columns preserved (§2.4).
- *Comment*: `internal=false` forced server-side.
- *Upload*: 25 MB cap, MIME allowlist, sanitized filename, stored under the grant's implementation prefix in `attachments`, served only via signed URLs with `Content-Disposition: attachment`.
- *Reassign to colleague* (mustFix 4 — inheritance): finds-or-creates `customer_contacts` under the **same customer**; issues a new grant with `created_via='reassign'`, `parent_grant_id` set, **`expires_at` copied from the parent grant** (never a fresh TTL — a chain of reassignments can never outlive the original issuance) and **passcode policy inherited** (if the parent grant has a passcode, the child gets one and the implementation owner is prompted to deliver it before the link activates for actions). Only an internal staff member can extend access, by rotating. Rate-limited per grant per day; owner notified on every reassign; `task_reassigned` event.
- *Auth-door viewers* perform the same actions via `/portal` with `completed_via='external_auth'`.

**Internal preview (mustFix 11).** AuthGate lines 42–44 bounce internal users off `/portal/*`, and the gate is deliberately left untouched. Instead, the internal implementation panel (`customers.$customerId`) gets a "Preview customer view" tab that renders the same `<SharedPlan>` component via `loadSharedPlan({kind:'preview', profileId}, slug)` — server fn gated by `requireInternal()`, read-only (action buttons disabled with a preview banner). Staff see byte-for-byte what the customer sees without any auth-model exception.

**Authenticated fallback / strict IT:** `/portal` untouched; gains `/portal/plan/$shareSlug` rendering `<SharedPlan>`. Strict-IT accounts use the existing `/access` invite flow; choice is per-contact at issue time.

**Route surface (all additive):** `/plan/$token` (add `/plan` to `PUBLIC_PREFIXES`; `robots noindex`; `Referrer-Policy: no-referrer`), `/plan/s/$snapshotToken` (+`?pdf=1`), `/portal/plan/$shareSlug`. Internal: Share panel on `customers.$customerId` (issue/revoke/rotate/passcode/open history + preview tab); `/access` gains a "Signed links" column; engagement strip feeds `/alerts` later (W5).

## 4. Enforcement model

### 4.1 Closing the auth-door column leak (mustFix 3)

0005's `customers customer select` (line 172) and `implementations customer select` (line 193) are full-row: `arr`, `segment`, `sow_value`, `sow_document_url/name`, `discovery_board_url`, `discovery_notes`, `customer_goals`, `tier` were directly PostgREST-readable by customer-auth users. Fix (migration 0012): **drop those two customer-select policies outright.** Verified behavior-neutral: all `/portal` reads go through server functions on `supabaseAdmin` (`portal.functions.ts` → `loadPortalHome` at `portal.server.ts:120`); no browser-client customer read of these tables exists (pre-ship gate: grep for browser-client `.from('customers'|'implementations')` reachable under role `customer` recorded in the migration header). Remaining customer-select policies are column-audited one by one in the 0012 header; any exposing a non-customer-safe column is dropped the same way. The new `share_slug` column therefore never sits under a customer-readable full-row policy. Tests gain direct-PostgREST column assertions (§5 test 5b).

### 4.2 Why RLS cannot authorize the token path, and what does

`auth.uid()` is null for a token bearer; minting GoTrue JWTs was rejected (§1). Compensating controls: (1) single choke point — only `external-viewer.ts` builds an `ExternalViewer`; only `loadSharedPlan`/`buildSharedPlanDTO` and the five action fns query with it; review rule: no `supabaseAdmin` in `/plan` routes outside these modules. (2) RLS as a wall: new tables have no anon/customer policies; grants/events accept **no writes from any browser session, internal included**. (3) DB triggers backstop the service role itself: grant consistency + immutability, auto-revocation on contact delete and implementation close. (4) Hashed credentials: DB leak ≠ link leak. (5) The §5 suite is part of definition of done.

## 5. Authorization tests

Vitest against seeded local Supabase (customers A/B, one implementation each, internal+shared work items, grants gA/gB, auth users uA/uB) + SQL/pgTAP RLS assertions in CI.

1. **Cross-implementation isolation:** `loadSharedPlan(gA, slugB)` → Forbidden; every action fn with gA cookie against B-owned items → Forbidden; B's snapshot token unreadable via gA.
2. **Grant lifecycle:** expired / revoked / superseded → identical neutral 401; cookie minted from gA invalid after gA revoked; **contact-delete trigger revokes gA and its cookie stops working; closing implementation A revokes gA and expires A's snapshot shares** (mustFix 5).
3. **Passcode:** lockout at 5; correct passcode refused during lock; cookie without `pc:true` cannot mutate.
4. **Projection allowlist — all serializer consumers:** for the plan page, portal page, preview, **and a generated snapshot's `content`**: no internal-visibility item, journal, risk/issue/health/ARR/sow/tier/discovery field; keys ⊆ frozen allowlist; regex scan proves no fixture uuid anywhere.
5. **Auth-door RLS:** (a) row scoping — uA sees only A rows on every customer-readable table, anon sees zero rows everywhere, uA sees zero grants/events; (b) **column exposure (new)** — direct PostgREST as uA: `select *` on `customers` and `implementations` returns zero rows (policies dropped); on each remaining customer-readable table, returned columns ⊆ that table's audited allowlist.
6. **Internal-route lockout:** role customer on `requireInternal` paths → Forbidden. **Grant-write lockout (new):** authenticated internal browser session (sales/tam_se JWT, publishable key) attempting insert/update/delete on `external_access_grants` and insert on `external_plan_events` → zero rows affected.
7. **Write scoping:** token completes internal item → Forbidden; `can_complete=false` → Forbidden; comment cannot set `internal=true`; reassign to a contact under customer B → Forbidden; rate limit enforced; **reassigned grant's `expires_at` equals parent's exactly and passcode requirement inherited; a reassign chain never extends total lifetime** (mustFix 4).
8. **Upload hardening:** oversize 413; bad MIME 415; `../` sanitized; storage prefix always `implementations/<implA>/…` for gA.
9. **Credential hygiene:** raw token nowhere in DB or audit payloads; email contains link exactly once.
10. **Telemetry integrity:** hourly `opened` dedupe; **SSR GET records no event — only the beacon does**; gA events never carry implB ids.
11. **Evidence preservation (new):** reopen leaves `completed_by_contact_id`/`completed_at` intact and appends `task_reopened`; snapshot correction inserts superseding row, original row byte-identical; `expires_at` update attempt rejected by trigger.
12. **Flag enforcement (new):** with `external_plan_enabled=false`, `/plan/$token` SSR returns 404 and every external server fn refuses — server-side, not UI.

## 6. UI surfaces / code touched

- New routes: `/plan/$token` (SSR loader), `/plan/s/$snapshotToken` (+pdf), `/portal/plan/$shareSlug`.
- New modules: `external-viewer.ts`, `app-config.ts`, `snapshot-pdf.ts` (net-new, §2.5), `/api/cron/plan-snapshots` (guarded like `api.cron.journeys.ts` / `sla`).
- Extended: `/access` (signed-links column), `customers.$customerId` (Share panel, preview tab, engagement strip, snapshot list), `/alerts` later (W5).
- Config: `auth-gate.tsx` `PUBLIC_PREFIXES += '/plan'` (verified non-shadowing); env `PLAN_SESSION_SECRET`; Vercel cron entry.

## Proposed migrations

Numbered forward migrations (`supabase/migrations/NNNN_*.sql`), each with a committed rollback in `supabase/rollbacks/NNNN_down.sql` (new convention; no shipped files touched). Every rollback below states its data-loss preconditions honestly and scripts its preserve step. Numbering: 0009–0012 have no W2 dependency; 0013 depends on W2's `work_items` and renumbers after W2 if W2 claims numbers first.

**0009_external_access_grants.sql**
- Header records the full naming-collision check against the 28-table prototype list from 0003 (result: no collision; near-misses documented: plan_snapshots vs proposal_snapshots, external_plan_events vs engagement_events) and the column-audit note for share_slug.
- Create `external_access_grants` + `external_plan_events`, indexes, RLS (internal SELECT only on grants; internal SELECT only on events; NO authenticated write policies on either), `eag_enforce` consistency/immutability trigger, `cc_revoke_grants_trg` on customer_contacts, `impl_close_revokes_grants_trg` on implementations.
- `alter table implementations add column share_slug text not null unique default encode(gen_random_bytes(9),'hex');` — hex (URL-safe; base64 '/'+' break path params). NO backfill UPDATE: the volatile default forces a full-table rewrite that fills every existing row itself. Comment in-file: ACCESS EXCLUSIVE lock + rewrite; table is small, run off-peak.
- `alter table customers add column logo_path text;`
- Seed `portal_app_config`: external_plan_enabled=false, external_plan_link_ttl_days=60, external_plan_reassign_daily_limit=10, snapshot_share_ttl_days=30.
- Rollback 0009_down — preconditions stated in-file: SAFE only pre-launch. Post-launch it destroys the issued-credential record and, on re-apply, would regenerate every share_slug, breaking bookmarked /portal/plan URLs. The script therefore FIRST preserves: `create table _ws4_archive_grants as select * from external_access_grants; create table _ws4_archive_events as select * from external_plan_events; create table _ws4_archive_slugs as select id, share_slug from implementations;` then drops tables/triggers/column/config rows. A companion 0009_reapply.sql restores share_slug from `_ws4_archive_slugs` (update-by-id, overriding the regenerated defaults) so re-application does not break URLs.

**0010_audit_actor_external.sql**
- Verify actual production constraint name first (`\d portal_audit_log`), then swap the actor_type check to include 'external_contact'.
- Rollback 0010_down — archive-then-remove, chosen and scripted (never rewrite actor_type in place; that falsifies the audit trail): `create table portal_audit_log_external_archive (like portal_audit_log including all); insert into portal_audit_log_external_archive select * from portal_audit_log where actor_type='external_contact'; delete from portal_audit_log where actor_type='external_contact';` then swap the constraint back. Archive table name checked against the 28-table prototype list (no collision). The archive is retained, not dropped.

**0011_storage_buckets.sql** (per the real 0001 precedent — buckets are provisioned in SQL, 0001:378)
- `insert into storage.buckets (id, name, public) values ('attachments','attachments',false), ('customer-branding','customer-branding',false) on conflict (id) do nothing;` — fixes the repo gap where `hub.server.ts`'s 'attachments' bucket is provisioned nowhere (idempotent against any manually-created prod bucket), and adds branding as PRIVATE per 0001's "private; server signs URLs for every download" convention.
- Rollback 0011_down — precondition stated: only delete the 'customer-branding' bucket row if empty; NEVER delete 'attachments' (pre-existing prod data depends on it) — the rollback leaves it in place and says why.

**0012_customer_policy_tightening.sql** (mustFix 3; independent of W2, can ship early)
- Header: column audit of every 0005 customer-select policy, plus the verification note that /portal reads flow through server functions on supabaseAdmin (portal.functions.ts → portal.server.ts) and grep evidence that no browser-client customer read of these tables exists.
- `drop policy "customers customer select" on customers; drop policy "implementations customer select" on implementations;` and drop any other audited-unsafe customer-select policy per the header's audit table.
- Rollback 0012_down: recreate the dropped policies verbatim from 0005 (restores the leak — stated in-file as the known consequence).

**0013_work_item_external_columns.sql** (after W2's work_items migration; renumber as needed)
- `alter table work_items add column assigned_contact_id …, completed_by_contact_id …, completed_via …` (all nullable — no rewrite).
- Create `work_item_comments`, `work_item_files` with RLS (internal CRUD; customer-auth SELECT via the 0005 join pattern with internal=false for comments; column audit in header; no anon).
- Rollback 0013_down — precondition stated: dropping completed_by_contact_id/completed_via erases who completed customer tasks while status stays 'done'. Script preserves first: `create table _ws4_archive_work_item_completion as select id, assigned_contact_id, completed_by_contact_id, completed_via from work_items where completed_via is not null;` plus archives of comments/files, then drops. (The append-only external_plan_events rows also survive independently unless 0009 was rolled back.)

**0014_plan_snapshots.sql**
- Create `plan_snapshots` with the `share_token_hash null or share_expires_at not null` check constraint, unique (implementation_id, week_start, generated_at), RLS (internal select/insert; customer-auth select via customer_users join; no anon; no update/delete policies — frozen records, service-role corrections insert superseding rows).
- Rollback 0014_down: archive `create table _ws4_archive_plan_snapshots as select * from plan_snapshots;` then drop.

**Deployment order & flags:** 0009+0010+0011+0012 ship at Phase-3 start with external_plan_enabled=false; /plan code ships dark behind server-enforced flag checks; 0013 with/after W2; 0014 + cron last. All additive except 0012's policy drops (verified behavior-neutral, separately revertible). Every step independently revertible with its scripted preserve step.

## Risks

- Bearer-URL forwarding: anyone holding the link is the contact. Mitigated by per-person grants (forwarding visible in telemetry), inherited-expiry reassign chains, optional passcode, one-click revoke/rotate, auto-revoke on contact removal and implementation close, and no sensitive data in the projection — residual risk inherent to magic links; product owner must accept it explicitly.
- Service-role discipline: the token path bypasses RLS by design; a scoping bug leaks cross-customer data with no DB backstop. Mitigations: single choke-point module, one shared DTO serializer for every consumer including snapshots, uuid-leak regex tests, grant-consistency DB triggers, and the §5 suite gating the phase — the tests are load-bearing.
- Migration 0012 drops customer browser-read RLS on customers/implementations on the strength of verification that all /portal reads use server functions; if an unnoticed browser-client customer read exists, /portal would silently show empty data for that widget. Mitigated by the pre-ship grep recorded in the migration header plus a staging pass with a real customer login; rollback restores 0005 policies verbatim.
- 0009's share_slug ADD COLUMN with a volatile default rewrites implementations under ACCESS EXCLUSIVE lock; small table, but it must run off-peak, and a rollback+reapply without the scripted _ws4_archive_slugs restore would regenerate slugs and break bookmarked /portal/plan URLs.
- Snapshot PDFs are unrevocable once downloaded, and server-side jsPDF-in-Node is a new path with no repo precedent (sow-pdf.ts is client-only) — layout parity and font handling need explicit testing; flagged as new work (~2–3 days), not a reuse.
- Email security scanners prefetch links; the SSR pass records nothing and only the post-hydration beacon records 'opened', but W5's engagement signal should still weight interactive events above opens to avoid false engagement reads.
- Customer uploads are attacker-controlled content served to staff: MIME allowlist, size cap, attachment-only disposition, signed URLs; no AV scanning exists in the stack (open question).
- Reassign auto-invite can spray branded emails from a leaked link; mitigated by inherited expiry (no lifetime extension), per-grant daily rate limit, owner notification on every reassign, and the recipient-domain open question.
- Shared database with the prototype app: collision check re-run against the full 28-table 0003 list for all six new tables including the audit archive; any future rename must re-check; 0010's constraint swap must use the verified production constraint name.
- Ordering coupling: 0013 depends on W2's work_items; if W2 slips, /plan ships on the milestones+commitments fallback — read-only for customers, a materially thinner v1.
- Auto-revocation triggers (contact delete, implementation close) write revoked_at from SQL where app-level audit emission isn't available; the nightly reconcile job that emits the corresponding audit/event rows is a small new moving part that must itself be monitored.
- Anonymous cookie sessions are a new middleware path (all sessions today are Supabase bearer tokens); SameSite/Secure/path behavior needs integration tests; PLAN_SESSION_SECRET rotation invalidates live viewer sessions (harmless — viewers re-click their link).
- Engagement telemetry is personal data about named contacts; retention/disclosure posture (GDPR) unresolved — external_plan_events should not launch to EU accounts before it is.

## Open questions

- Link lifetime: is 60 days the right default TTL, and should links auto-rotate (fresh link emailed) near expiry, or is silent expiry with manual re-share acceptable?
- Passcode policy: per-grant opt-in by the IM, or mandated per segment/tier? Is out-of-band passcode delivery an acceptable operational burden?
- Reassign recipients: any email, or restricted to domains already present in the customer's contacts? Owner veto/approval, or notification only?
- Cross-contact visibility: do customer colleagues see each other's names on comments/completions, or is attribution internal-only?
- Telemetry privacy: do we disclose open-tracking to customers, and what is the retention period for external_plan_events? Gates EU/enterprise rollout.
- Snapshot PDFs cannot be revoked once downloaded — acceptable for weekly status content as scoped (attention[] facts only), or should PDFs be internal-download only?
- Strict-IT bar: is Supabase magic-link auth sufficient, or do some accounts require SSO (SAML/OIDC) — a much larger build to scope now if so?
- Should external task completion require typed-name confirmation ('signed by Jane Doe') to strengthen it as evidence, or is grant identity enough?
- Branding ceiling: customer logo beside GoCanvas branding, or fuller white-labeling (colors, sender domain) for enterprise?
- Who consumes the 'champion quiet for N days' signal (owner only, or CSM/leadership dashboards), and is N=12 days the confirmed default?
- Remaining 0005 customer-select policies (milestones, commitments, success_criteria, tickets, customer_contacts): after the 0012 column audit, do we keep audited-safe direct reads as a backstop, or go fully server-function-only for the customer role (simpler invariant, one more migration)?
- AV scanning for customer uploads: accept the risk with hardening only, or add a scanning step (e.g. quarantine-until-scanned) before staff can download?

## Adversarial critique (panel record)

{
  "verdicts": [
    {
      "aspect": "Non-negotiable: evidence over inference",
      "verdict": "flawed",
      "reason": "Mostly honored (frozen snapshot jsonb, supersedes_id correction chain, events-as-inputs for the engagement signal). But three leaks: (a) the weekly snapshot generator is a SECOND serializer outside the loadSharedPlan choke point — the 'single projection layer' claim is false, and its frozen content includes at_risk[] while §3 says risks are 'never rendered' to outsiders, an unresolved self-contradiction; test 4 only covers loadSharedPlan. (b) 'Reopen within 24h' doesn't say whether completed_by_contact_id/completed_at are cleared — overwriting recorded completion evidence would violate the rule. (c) Proposed rollbacks destroy recorded evidence (see migration verdict)."
    },
    {
      "aspect": "Non-negotiable: every existing URL keeps working",
      "verdict": "sound",
      "reason": "Verified purely additive: no existing route named /plan exists in src/routes; PUBLIC_PREFIXES addition in auth-gate.tsx uses exact-or-slash prefix matching so /plan cannot shadow /portfolio, /pipeline etc.; /portal, /view/$token, /access untouched. Only caveat is internal-preview UX (see code-breakage verdict), which is not a URL break."
    },
    {
      "aspect": "Non-negotiable: feature-flag shippable per phase",
      "verdict": "sound",
      "reason": "Flag as portal_app_config row matches the real allowed_email_domains precedent (0001 line 21-28, value is jsonb); migrations are additive and dark; each step gated. Caveat: no app-side config-read helper exists today (grep for portal_app_config in src/ returns nothing — only the SQL trigger reads it), so the flag plumbing is net-new work the design doesn't cost, and the 404-behind-flag must be enforced in server loaders, not just UI hiding."
    },
    {
      "aspect": "Breakage of existing code paths / false code claims",
      "verdict": "flawed",
      "reason": "Four verified false or missed claims. (1) `external_key text unique default encode(gen_random_bytes(9),'base64')` — Postgres base64 emits '/', '+' — a '/' in the key breaks the /portal/plan/$externalKey path param and TanStack routing; must be hex/base64url. Also the follow-up backfill UPDATE is a no-op: a volatile default on ADD COLUMN already fills every existing row (with a table rewrite) — the SQL shows misunderstanding of what will run. (2) 'PDF via the same server-side generation path sow-pdf.ts already uses' is false: sow-pdf.ts is jsPDF exported as downloadSowAnalysisPdf and imported by the client component sow-analysis.tsx — there is no server-side PDF path; cron-generated snapshot PDFs are net-new work. (3) Storage claim false: buckets ARE provisioned in SQL migrations (0001 lines 378-381 inserts portal-briefs and portal-uploads into storage.buckets, commented 'private; server signs URLs for every download'), while the 'attachments' bucket hub.server.ts:1675 uses is provisioned NOWHERE in the repo — the design both misstates the convention and builds on an unprovisioned bucket. (4) AuthGate (auth-gate.tsx lines 42-44) hard-redirects internal users OFF /portal/*, so staff can never preview /portal/plan/$externalKey; unaddressed. Minor: journeys recordView dedupes once-ever, not hourly as the design implies; and implementations already has an external_ref column, inviting confusion with the new external_key."
    },
    {
      "aspect": "Migration safety and rollback honesty",
      "verdict": "flawed",
      "reason": "Numbering, additive-only shape, and the acknowledged W2 renumbering coupling are fine; the new supabase/rollbacks/ convention is a reasonable answer to 'reversible' with no existing down-file convention. But the rollbacks are dishonest about data: 0009_down's 'safe because nothing else references these objects' is only true before launch — once grants exist it destroys the issued-credential record, and re-applying 0009 regenerates every external_key, silently breaking all bookmarked /portal/plan URLs. 0010_down rewrites actor_type='external_contact' to 'system', falsifying the audit trail ('who did what' becomes a lie) — and the design leaves 'or delete into an archive table' unchosen. 0011_down drops completed_by_contact_id/completed_via while status stays 'done', erasing who completed customer tasks. The base64 default bug (see code breakage) is also a migration correctness bug. Bucket provisioning should be a numbered migration per the 0001 precedent, not a script."
    },
    {
      "aspect": "RLS / authorization holes",
      "verdict": "flawed",
      "reason": "Three concrete holes. (1) The design's central claim — 'two front doors, one projection core, a visibility bug cannot exist in only one of them' — is false for the auth door: 0005's customer-select policies are full-row (customers customer select, implementations customer select), and customers carries arr and segment while implementations carries sow_value, sow_document_url/name, discovery_board_url/notes, customer_goals, tier. A customer-auth user with the publishable key can PostgREST-read all of these directly, bypassing loadSharedPlan entirely; the design promises 'Never rendered: ARR/segment' but its tests (5) check row scoping only, never column exposure, and it adds external_key under this same full-row policy without auditing columns. (2) The proposed 'eag internal insert/update' policies via portal_is_internal() let ANY internal role — sales, tam_se — insert a grant row from a browser client with an arbitrary token_hash whose preimage they chose, for any implementation, with mismatched denormalized customer_id (the consistency check is 'app-side' only), no passcode, any expiry, and no audit entry. Grant writes must be service-role-only (as the design itself correctly does for external_plan_events) or gated by portal_can_manage plus a DB trigger. (3) The reassign flow issues a NEW grant with a FRESH TTL, triggerable by whoever holds the link: self-reassign to a second address renews access indefinitely, making expiry advisory — this defeats the brief's 'expiring' requirement. Additional gaps: contact_id 'on delete set null' leaves an orphaned grant active after a champion is offboarded, and nothing revokes grants when an implementation closes/churns; plan_snapshots.share_expires_at is nullable with no default, permitting a never-expiring public link, against the brief's 'expiring and revocable'; the public-read customer-branding bucket contradicts the repo's stated all-private/signed-URL storage convention."
    },
    {
      "aspect": "Naming-collision handling",
      "verdict": "flawed",
      "reason": "Outcome happens to pass, methodology is wrong. The design quotes the prototype app as owning 'shared_links, invites, verification_tokens, sessions' — the actual 0003 header lists TWENTY-EIGHT prototype tables (including accounts, webhooks, alert_rules, dashboards, solutions, proposal_snapshots, reports). I checked the proposed names (external_access_grants, external_plan_events, work_item_comments, work_item_files, plan_snapshots) against the full 28 plus hub tables: no collision (plan_snapshots vs prototype proposal_snapshots and external_plan_events vs hub engagement_events are distinct but near-misses worth documenting). A check run against the design's 4-name list would have missed 24 tables; the migration header must re-run and record the full check as 0003 did."
    },
    {
      "aspect": "Phase-2 definition-of-done impact",
      "verdict": "sound",
      "reason": "W4 is correctly placed in Phase 3 and its Phase-2 touchpoints are safe: 0011 adds only nullable columns to work_items (no rewrite, no behavior change to template instantiation, dependencies, or date recalculation), and the design relies on exactly the party/visibility/waiting_on_party fields the brief's W2 spec defines. Residual risks are acknowledged in the design: the 0011 renumbering race with W2's migration numbers, and the W2-slip fallback producing a read-only plan (which fails Phase-3 scope, not Phase-2 DoD). Nothing here breaks DoD items 1-5."
    }
  ],
  "mustFix": [
    "Fix external_key generation: `encode(gen_random_bytes(9),'base64')` emits '/' and '+', which break the /portal/plan/$externalKey path segment. Use hex (or app-side base64url), drop the redundant backfill UPDATE (a volatile default already fills existing rows during the ADD COLUMN rewrite), and note the table rewrite/lock in the migration.",
    "Make external_access_grants writes service-role-only (no authenticated insert/update/delete policies), or restrict to portal_can_manage() plus a DB trigger enforcing customer_id = the implementation's customer — otherwise any sales/tam_se browser session can mint an unaudited, unexpiring grant with a self-chosen token for any implementation.",
    "Close the auth-door column leak: 0005's full-row customer-select policies expose customers.arr/segment and implementations.sow_value, sow_document_url, discovery_board_url/notes, customer_goals, tier to customer-auth users via direct PostgREST. Add column privileges or security_invoker views (or revoke direct customer selects entirely), and extend the test suite with column-level assertions on direct reads — row-scoping tests (test 5) do not catch this.",
    "Reassign-created grants must inherit the parent grant's expires_at and passcode policy, never a fresh TTL — as designed, anyone holding a leaked link can self-reassign to renew access forever, making expiry advisory.",
    "Revoke grants automatically when their contact is deleted (replace 'on delete set null' semantics with a revoke trigger) and when the implementation is closed/churned; add both to the authorization test suite.",
    "Route snapshot content generation through the same DTO allowlist as loadSharedPlan and add it to the serialization test; resolve the contradiction between snapshot content containing at_risk[] and §3's 'risks never rendered' rule by explicitly deciding what at-risk language is customer-shareable.",
    "Give snapshot share links a non-null default expiry (share_expires_at) — the brief requires external access to be 'expiring and revocable'; a lazily-created, never-expiring public snapshot link violates it.",
    "Replace the false sow-pdf.ts claim: downloadSowAnalysisPdf is client-side jsPDF imported by sow-analysis.tsx. Specify a real server-side PDF path for cron-generated snapshots (jsPDF-in-Node or HTML-to-PDF) and cost it as new work.",
    "Provision storage in a numbered migration, matching the actual 0001 precedent (insert into storage.buckets), not a script; make customer-branding private with signed URLs per 0001's 'private; server signs URLs for every download' convention; and provision the 'attachments' bucket in a migration too — it currently exists nowhere in the repo despite hub.server.ts depending on it.",
    "Rewrite the 0010 rollback to archive-then-remove (pick the archive-table option and script it) — never rewrite actor_type to 'system' in place, which falsifies the audit trail; and state the data-loss preconditions honestly in 0009_down/0011_down (issued grants, external completions), including that re-applying 0009 regenerates every external_key and breaks bookmarked URLs — add an export/preserve step.",
    "Handle internal preview: auth-gate.tsx lines 42-44 bounce internal users off /portal/*, so staff can never see /portal/plan/$externalKey. Add an internal preview route or an AuthGate exemption, and specify it.",
    "Re-run the naming-collision check against the full 28-table prototype list in the 0003 header (not the 4 names the design quotes) and record the result in the new migration's header, including the near-misses plan_snapshots vs proposal_snapshots and external_plan_events vs engagement_events.",
    "Specify /plan/$token as an SSR loader that verifies the grant and sets the gc_plan cookie in the response — not the /view/$token client-side useEffect pattern the design cites as precedent — to satisfy the SSR/no-waterfall non-negotiable and make the post-render open beacon meaningful.",
    "Remove or justify created_via='snapshot_cron' on external_access_grants — no described flow has the snapshot cron creating grants; and specify whether reopening a completed task clears completed_by_contact_id/completed_at (it must not silently erase the recorded completion — record reopen as a new event alongside the original)."
  ]
}
