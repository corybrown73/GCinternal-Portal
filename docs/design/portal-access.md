# Design: External Portal Access

> Produced by the v2 Step-0 design panel (workflow wf_f952802b-e7e, 2026-08-29).
> Each design was drafted, adversarially critiqued, and revised. Status: revised.

# Workstream 4 — External Portal Access Model (REVISED)

## 0.0 Critique disposition

All 15 mustFix items were re-verified against the repo and are **accepted**; none is rebutted. Verification notes: `audit_log` (not `portal_audit_log`) feeds the account activity feed (`hub.server.ts` lines 101, 800, 934) and its `changed_by` is a *nullable* FK to `team_members` (0003:169), so the additive-columns fix works without relaxing constraints; `auth-gate.tsx:42-44` does redirect internal users off `/portal`; `customer_contacts.role` is NOT NULL (0003:65) with no unique(customer_id,email); buckets are provisioned by SQL (`0001:378`) and `attachments` is provisioned nowhere; Postgres `encode(...,'base64')` emits `/` and `+`; the repo has zero test infrastructure (no test script, no `.github/`); `implementations.external_ref` exists (0003:82). Fixes are integrated below, not appended.

## 0. Ground truth this design is built on (verified in code)

- **The server layer already bypasses RLS.** Every server function goes through `supabaseAdmin` (service role) with app-level authorization: `requireInternal()` / `requireCustomerIds()` in `src/lib/portal.server.ts`. RLS (0005) is defense-in-depth for the browser client only. Tokenized anonymous access follows the established pattern (`/view/$token` + `recordJourneyView` in `src/lib/journeys.server.ts`).
- **Token precedents:** API keys — sha256 hash in `portal_api_keys` with prefix/scopes/revoked_at (`src/lib/server/api-auth.ts`); short-lived HS256 JWTs (`src/lib/server/tokens.ts`). Share links reuse the **hash-in-DB API-key pattern** (§2.1).
- **Two audit stores exist and both matter:** `audit_log` (0003:164) is the hub entity history the account activity feed renders; `portal_audit_log` (0001:278, `actor_type` check `('user','api_key','email_token','system')`) is the security audit written by `src/lib/server/audit.ts`. External mutations must reach **both** (§2.4).
- **The authenticated customer model** (role `customer`, `customer_users`, `customer_invites`, 0005 customer RLS policies) works today; `/portal` renders from it. `AuthGate` confines customers to `/portal/*` and redirects internal users *off* `/portal` (lines 42-44) — so internal preview needs its own route, not `/portal` (§3).
- **Shared-DB caveat:** new names below were checked against the FULL 28-table prototype list in 0003's header (clients, users, forms, submissions, submission_fields, reports, accounts, sessions, verification_tokens, alert_rules, webhooks, shared_links, reference_tables, reference_rows, invites, form_versions, dashboards, dashboard_tiles, insight_items, routing_rules, solutions, proposals, price_book_items, connectors, api_specs, proposal_views, deal_activities, proposal_snapshots) and against all hub/portal tables. That full-list check is now the documented process for any future name.
- **Naming near-miss avoided:** `implementations.external_ref` already exists (0003:82, written by `implementation-input.ts:66`) as a CRM-ish reference. The new URL key is therefore named **`portal_key`**, not `external_key`.
- **Storage convention is SQL:** buckets are created by `insert into storage.buckets` (0001:378), buckets are private and every download is a server-signed URL (0001:376 comment). The `attachments` bucket used by `hub.server.ts:1675` is provisioned nowhere in the repo — W4's storage migration fixes that as a drive-by (§2.6).
- **Sequencing commitment:** `/plan` does **not** ship before Workstream 2's `work_items` layer lands. The previously proposed "milestones+commitments read-only fallback" is withdrawn — it inverted the brief's Phase 2→3 sequencing and delivered a plan page without the features that justify it. W4 depends on W2; if W2 slips, W4 slips.

---

## 1. Reconciliation of the two access models

**Keep both, converge behind one projection layer.**

| | Signed link (new) | Supabase auth (existing, kept) |
|---|---|---|
| Who | Any customer contact, no account | Contacts whose IT forbids tokenized links, plus everyone already invited via `/access` |
| Identity | `external_access_grants` row → `customer_contacts` row | `auth.users` → `portal_profiles(role='customer')` → `customer_users` |
| Scope | **One implementation** per grant | All implementations of linked customer(s) (current `/portal` behavior — unchanged) |
| Enforcement | Service-role server functions verifying the credential; RLS grants anon nothing | `requireCustomerIds()` + existing RLS customer policies as backstop |
| URL | `/plan/$token` (opaque 256-bit token) | `/portal`; per-implementation pages at `/portal/plan/$portalKey` |

No migration of existing `customer_users` to links; no auth users created for link recipients. One TypeScript type unifies the principals so exactly one code path decides what an outsider sees:

```ts
// src/lib/server/external-viewer.ts
export type ExternalViewer =
  | { kind: "grant"; grantId: string; implementationId: string; customerId: string;
      contactId: string | null; accessLevel: "viewer" | "contributor" }
  | { kind: "auth"; profileId: string; customerIds: string[] }
  | { kind: "internal_preview"; profileId: string; implementationId: string }; // read-only, never mutates

// The ONLY function allowed to serialize plan data for outsiders.
// Explicit DTOs (allowlisted fields), never select("*") spread into the payload.
export async function loadSharedPlan(viewer: ExternalViewer, implementationRef: string): Promise<SharedPlan>;
```

`loadSharedPlan` resolves `implementationRef` (a `portal_key`, never a uuid, when it came from a URL), checks scope (`grant.implementationId === impl.id`, or `impl.customer_id ∈ viewer.customerIds`, or preview), and projects only shared-visibility objects. `/portal`, `/plan/$token`, and the internal preview route all render the same `<SharedPlan>` component from this one function — a visibility bug cannot exist in only one of them.

**Rejected alternative (unchanged):** minting Supabase GoTrue JWTs with custom claims so RLS could authorize anonymous viewers. Rejected: second RLS dialect to audit; anon users pollute `auth.users` and the signup trigger; the real enforcement point is already the service-role server layer. RLS's job for the new tables is to guarantee anon and customer roles read nothing.

---

## 2. Schema (SQL sketches — migration numbers assigned at implementation time, see Migrations)

### 2.1 `external_access_grants`

Hash-in-DB, not a stateless JWT: revocation, passcode lockout, and telemetry need a server-side row; the row is the source of truth. **Service-role-write-only** (fix: the previous internal INSERT policy would have let any internal role insert a self-computed `token_hash` from the browser and mint an unaudited working link — all writes now go through the audited server path, same posture as `external_plan_events`).

```sql
create table external_access_grants (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete restrict,
  customer_id       uuid not null references customers (id) on delete restrict,
  contact_id        uuid references customer_contacts (id) on delete set null,
  email             text not null,
  token_hash        text not null unique,          -- sha256 hex; raw token NEVER stored or logged
  token_prefix      text not null,                 -- first 8 chars for admin UI ("gcpl_ab12…")
  access_level      text not null default 'contributor'
                    check (access_level in ('viewer','contributor')),
                    -- 'viewer' = read-only: NO complete, NO comment, NO upload, NO reassign.
                    -- 'contributor' = all four actions. One capability axis gates every mutation.
  parent_grant_id   uuid references external_access_grants (id), -- set when created_via='reassign'
  passcode_hash     text,                          -- scrypt; null = no passcode
  passcode_attempts int not null default 0,
  locked_until      timestamptz,
  expires_at        timestamptz not null,          -- immutable once issued; reassign children INHERIT parent's value
  revoked_at        timestamptz,
  revoked_by        uuid references portal_profiles (id),
  superseded_by     uuid references external_access_grants (id), -- rotation chain
  created_by        uuid references portal_profiles (id),        -- null when created by reassign flow
  created_via       text not null default 'internal' check (created_via in ('internal','reassign')),
  created_at        timestamptz not null default now(),
  last_opened_at    timestamptz,
  open_count        int not null default 0
);
create index external_access_grants_impl_idx on external_access_grants (implementation_id);
create index external_access_grants_contact_idx on external_access_grants (contact_id);
create index external_access_grants_parent_idx on external_access_grants (parent_grant_id);

alter table external_access_grants enable row level security;
-- Internal staff may READ grants (admin UI lists them via browser client as defense-in-depth);
-- there are NO insert/update/delete policies for ANY role: only the service-role server path writes.
create policy "eag internal select" on external_access_grants for select to authenticated using (portal_is_internal());
```

FK semantics (evidence-over-inference fix): grants are the record of who was given access — `on delete restrict` from implementations/customers means an implementation cannot be deleted while grants exist; the documented path is archive-then-delete. Grants themselves are never hard-deleted by the app: revocation (`revoked_at`) is the terminal state.

Token generation mirrors `generateApiKey()`: `gcpl_` + 32 random bytes base64url (app-side, Node `randomBytes`, URL-safe by construction); URL `${APP_URL}/plan/<token>`.

**Grant lifecycle rules**
- *Verify* (every request): row by `sha256(token)` AND `revoked_at is null` AND `expires_at > now()` AND (`locked_until is null or < now()`). All failures render the same neutral "link expired or revoked" page (no oracle).
- *Passcode*: unchanged — 5 wrong attempts → `locked_until = now() + 15 min`; passcode delivered out-of-band, never in the link email.
- *Session after verify*: HttpOnly Secure SameSite=Lax cookie, HS256 JWT `{ sub: grant_id, pc: bool }`, TTL 24h, `PLAN_SESSION_SECRET` (same `jose` machinery as `tokens.ts`). Cookie name is **per-grant** — `gc_plan_<token_prefix>` — so two grants in one browser (e.g. a consultant on two accounts) do not collide; the route knows which cookie to read because the token in the URL carries the prefix. Mutations accept only the cookie, never the raw token (CSRF: SameSite=Lax + POST-only server fns). Every request re-loads the grant row, so revocation kills live cookies at next check.
- *Revoke*: sets `revoked_at`/`revoked_by`; **cascade-revokes all descendant grants** (recursive CTE on `parent_grant_id`) so revoking a leaked link also kills every grant it spawned via reassign. Audited per grant.
- *Rotate/resend*: new grant, old gets `revoked_at` + `superseded_by`. Rotation does NOT cascade to children (they are different people; only revocation cascades).
- *Expiry*: default from `portal_app_config` `external_plan_link_ttl_days` (seeded 60). "Renew" re-issues, never extends in place — `expires_at` is immutable evidence of what was sent. **Reassign children inherit `expires_at = parent.expires_at`** — an anonymous bearer can never mint fresh TTL; only internal staff can issue longer-lived grants.

### 2.2 `external_plan_events` — engagement telemetry

```sql
create table external_plan_events (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  grant_id          uuid references external_access_grants (id) on delete set null, -- evidence SURVIVES grant deletion
  implementation_id uuid not null references implementations (id) on delete restrict, -- and implementation deletion is blocked while evidence exists
  contact_id        uuid references customer_contacts (id) on delete set null,
  profile_id        uuid references portal_profiles (id) on delete set null, -- auth-fallback viewers
  event             text not null check (event in
                    ('opened','task_completed','task_reopened','comment_added',
                     'file_uploaded','task_reassigned','snapshot_viewed','passcode_failed')),
  recorded_from     text not null default 'server' check (recorded_from in ('http_get','beacon','server')),
  metadata          jsonb,          -- e.g. work item portal ref, ua_family; no raw IPs
  created_at        timestamptz not null default now()
);
create index epe_impl_time_idx on external_plan_events (implementation_id, created_at desc);
create index epe_grant_idx on external_plan_events (grant_id, event, created_at desc);
-- RLS: enable; internal select only; NO write policies for any role (service-role writes only).
```

**Open recording (fix — record both, labeled, discard nothing):** the GET records `opened/recorded_from='http_get'`; a client-side beacon after render records `opened/recorded_from='beacon'`. Each is deduped to one per grant per source per hour. A no-JS or JS-blocked human open is therefore still evidence (`http_get` present, `beacon` absent) instead of silence; an email-scanner prefetch shows as `http_get` with no `beacon`. Workstream 5's Engagement signal weights `beacon` and interactive events (`task_completed`, `comment_added`) above bare `http_get`, and **shows its inputs** by linking these rows — never overwriting recorded health (non-negotiable #1). Nothing from this table is ever rendered to customers.

### 2.3 Customer-facing keys — no internal IDs in URLs

```sql
-- Named portal_key: implementations.external_ref (0003:82) already exists and means something else.
-- hex is URL-safe; Postgres 'base64' emits '/' and '+' which would 404 path segments.
alter table implementations
  add column portal_key text unique default encode(gen_random_bytes(12), 'hex');
-- The volatile default populates every existing row during ADD COLUMN (full-table rewrite —
-- acceptable at this table's size; run in a maintenance window). No follow-up UPDATE is needed.
alter table implementations alter column portal_key set not null;
```

24 hex chars, 96 bits. `/plan/$token` carries only the token; snapshot pages only a snapshot token; uuids never appear in any URL an outsider sees. `portal_key` is treated as **permanent**: it is never regenerated once issued (see Migrations — the rollback keeps the column precisely so emailed/bookmarked URLs survive a rollback/re-apply cycle).

### 2.4 Customer actions (extends Workstream 2's `work_items`) + dual audit

```sql
alter table work_items
  add column assigned_contact_id uuid references customer_contacts (id) on delete set null,
  add column completed_by_contact_id uuid references customer_contacts (id) on delete set null,
  add column completed_via text check (completed_via in ('internal','external_link','external_auth'));

create table work_item_comments (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  work_item_id      uuid not null references work_items (id) on delete cascade,
  author_profile_id uuid references portal_profiles (id),
  author_contact_id uuid references customer_contacts (id),
  internal          boolean not null default false,
  body              text not null,
  created_at        timestamptz not null default now(),
  check (author_profile_id is not null or author_contact_id is not null)
);

create table work_item_files (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  work_item_id      uuid not null references work_items (id) on delete cascade,
  implementation_id uuid not null references implementations (id) on delete cascade,
  storage_path      text not null,
  file_name         text not null,
  mime_type         text not null,
  size_bytes        bigint not null,
  uploaded_by_contact_id uuid references customer_contacts (id),
  uploaded_by_profile_id uuid references portal_profiles (id),
  created_at        timestamptz not null default now()
);
```

**RLS (fix — visibility gate added):** internal CRUD via `portal_is_internal()` on both. Customer-auth SELECT policies join work_items→stage_instances→implementations→customer_users **AND require `work_items.visibility = 'shared'`** — the 0006 `ticket_comments` pattern has no visibility axis, so copying it alone would have exposed comments/files on internal-only work items to any customer-auth browser client. Comments additionally require `internal = false`. No anon policies; token access is service-role only.

```sql
create policy "wic customer select" on work_item_comments for select to authenticated using (
  internal = false and exists (
    select 1 from work_items wi
    join stage_instances si on si.id = wi.stage_instance_id
    join customer_users cu on cu.customer_id = (select customer_id from implementations i where i.id = si.implementation_id)
    where wi.id = work_item_comments.work_item_id
      and wi.visibility = 'shared'
      and cu.profile_id = auth.uid()));
-- work_item_files: same shape, same visibility='shared' requirement, no internal column.
```

**Dual audit write (fix):** external mutations were previously invisible to the account activity feed, which renders `audit_log` (0003), not `portal_audit_log`. Every external mutation now writes **both** stores:
- `portal_audit_log` — actor_type `'external_contact'` (constraint widened), `actor_id = grant_id`, contact email in payload (security/audit trail).
- `audit_log` — additive columns: `actor_type text not null default 'team_member' check (actor_type in ('team_member','external_contact','system'))` and `actor_contact_id uuid references customer_contacts (id) on delete set null`. `changed_by` is already nullable (0003:169) and stays null for external rows. The three feed queries in `hub.server.ts` (lines 101, 800, 934) select `*`, so external rows appear automatically; the feed renderer gains a small formatter case for `actor_type='external_contact'` ("Jane Doe (customer) completed …").

Evidence-over-inference: completing a task records who, via which grant, when, in both stores plus `completed_by_contact_id`/`completed_via` on the row itself; computed rollups cite these rows.

### 2.5 `plan_snapshots` — weekly status snapshot

```sql
create table plan_snapshots (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete restrict,
  week_start        date not null,
  generated_at      timestamptz not null default now(),
  generated_by      uuid references portal_profiles (id),  -- null = cron
  supersedes_id     uuid references plan_snapshots (id),   -- corrections regenerate, never edit
  content           jsonb not null,
  share_token_hash  text unique,
  share_expires_at  timestamptz,
  share_revoked_at  timestamptz,
  check (share_token_hash is null or share_expires_at is not null),  -- no immortal public URLs
  unique (implementation_id, week_start, generated_at)
);
-- RLS: internal select/insert; customer-auth select via customer_users join; no anon; no browser writes.
```

`share_expires_at` is set app-side to `now() + external_snapshot_link_ttl_days` (config, seeded 30) whenever a share token is minted — the CHECK makes forgetting impossible.

**"At risk" content — the §3 contradiction resolved.** The rule is now precise: the customer never sees the internal risk register (`risks`/issues/escalation rows). The snapshot's `at_risk[]` is **derived exclusively from shared-visibility objects** — overdue `work_items` with `visibility='shared'` and slipping milestones — machine-drafted in customer language ("Data import sign-off is 4 days behind"), and editable by the IM before publish. The snapshot generator's input query set is allowlisted to shared work items, milestones, and commitments; it never reads the risk tables. §5 test 4 enforces this with a sentinel: seed an internal risk register row with a marker string and assert it appears nowhere in any snapshot `content` or plan payload.

`content` is frozen at generation — a record, never recomputed on read; corrections insert a superseding row. Rendered three ways from the same jsonb: internal account page, `/plan/s/$snapshotToken`, PDF via the `sow-pdf.ts` path. Weekly cron route `src/routes/api/cron/plan-snapshots.ts` (sibling of `api/cron/sla.ts`, guarded identically) generates one per active implementation with an active grant.

### 2.6 Storage & branding (SQL migration, private buckets)

Fix: the repo convention is SQL bucket provisioning (0001:378) and "private; server signs URLs for every download" (0001:376). So:

```sql
-- Drive-by repair: the 'attachments' bucket hub.server.ts:1675 depends on is provisioned nowhere.
insert into storage.buckets (id, name, public) values
  ('attachments', 'attachments', false),
  ('customer-branding', 'customer-branding', false)   -- PRIVATE; logos served via short-lived signed URLs
on conflict (id) do nothing;

alter table customers add column logo_path text;
```

Logo signed-URLs are fetched by the plan-page loader server-side (TTL 1h) — no public bucket. Uploads store under `attachments/implementations/<impl_id>/external/<grant_id>/<uuid>_<sanitized>`.

### 2.7 Feature flags (split)

`portal_app_config` rows (matching the `allowed_email_domains` pattern; server reads via supabaseAdmin):
- `external_plan_view_enabled` → `false` — gates `/plan/*`, `/plan/s/*`, `/portal/plan/*`, the internal Share panel, and grant issuance server fns (issuance checks the flag server-side; the UI hiding is not the gate).
- `external_plan_actions_enabled` → `false` — gates the four mutation server fns (complete/comment/upload/reassign) independently, enabling a deliberate staged rollout: view first, actions second. Both flags require W2's `work_items` to exist (commitment in §0): there is no pre-W2 fallback mode, so a flag flip always means the same product.
- `external_plan_link_ttl_days` → `60`; `external_snapshot_link_ttl_days` → `30`; `external_plan_reassign_daily_limit` → `10`.

Schema lands dark regardless of flags (additive-only); the flags gate every read/write path.

---

## 3. Behavior rules

**What a grant viewer sees (projection allowlist — `loadSharedPlan`)**
- Their tasks first: `work_items` with `visibility='shared'`, grouped due-today / this-week / overdue / later; "you owe us" = `party='customer'`; "we owe you" = summaries of internal/partner shared items plus open `commitments`.
- Milestone timeline, current stage label (customer vocabulary from `lifecycle.ts` labels).
- Who to contact: implementation owner name + email only.
- Shared documents: `work_item_files` on shared items + explicitly shared evidence.
- Snapshot "recent updates" list (frozen `content` only).
- **Never rendered:** `visibility='internal'` items, `journal_entries`, internal comments, the risk/issue/escalation registers (the snapshot's curated `at_risk[]` derived from shared items is the only "risk-shaped" content — see §2.5), health (recorded or computed), engagement telemetry, ARR/segment, any uuid.
- Field-level: every DTO field explicitly named; serializer test asserts payload keys ⊆ allowlist.

**Customer actions (cookie-authenticated server functions, all scoped grant → implementation, ALL gated by `access_level='contributor'`)** — fix: `viewer` grants can read only; the previous design let "read-only" grants comment, upload, and invite strangers.
- *Complete task*: item is `party='customer'`, `visibility='shared'`, in grant's implementation, W2 dependency gating passes; sets `status='done'`, `completed_at`, `completed_via='external_link'`, `completed_by_contact_id`; dual-audited (§2.4); owner notified via `sendEmail`. Reopen within 24h (`task_reopened`).
- *Comment*: `internal=false` forced server-side.
- *Upload*: 25 MB cap, MIME allowlist, sanitized filename, grant's implementation prefix, served only via short-lived signed URLs with `Content-Disposition: attachment`.
- *Reassign to colleague*: validates the task is theirs; find-or-create `customer_contacts` under the **same customer** — contact creation specifies `role='collaborator'` (satisfying the NOT NULL at 0003:65) and uses `insert ... on conflict (customer_id, lower(email)) do update set updated_at=now() returning id` against the new unique index (§ Migrations W4-M1), making find-or-create race-safe; sets `assigned_contact_id`; issues a child grant with `created_via='reassign'`, `parent_grant_id`, **inherited `expires_at`**, inherited `access_level` capped at the parent's, passcode per org policy; emails the colleague; notifies the implementation owner; rate-limited per grant per day. Revoking any ancestor cascade-revokes the child (§2.1).
- *Auth-fallback viewers* do the same via `/portal` with `completed_via='external_auth'` and `profile_id` telemetry.

**Internal preview (fix — auth-gate blocks internal users from /portal):** a dedicated internal route `implementations.$id.plan-preview` (under normal internal auth, no auth-gate change) renders the same `<SharedPlan>` component via `loadSharedPlan({kind:'internal_preview', …})` — a strictly read-only viewer kind whose mutations are rejected server-side. The Share panel links to it as "View as customer".

**Authenticated fallback / strict IT**: `/portal` untouched for everyone already invited (hard requirement); gains `/portal/plan/$portalKey`. Strict-IT accounts use the existing `/access` invite flow; the choice is per-contact at issue time.

**Route surface (all new, nothing moved — every existing URL keeps working)**
- `/plan/$token` — public plan page (add `/plan` to `PUBLIC_PREFIXES` in `auth-gate.tsx`; `robots noindex`; `Referrer-Policy: no-referrer`; no third-party embeds).
- `/plan/s/$snapshotToken` — public read-only snapshot (+ `?pdf=1`).
- `/portal/plan/$portalKey` — authenticated equivalent.
- Internal: Share panel on `customers.$customerId` implementation panel (issue/passcode/expiry/revoke/rotate/open history — issuance is server-fn only; the browser cannot write grants by construction, §2.1); `/access` gains a "Signed links" column; `implementations.$id.plan-preview`; engagement strip + `/alerts` later (W5).

## 4. Why RLS cannot authorize the token path, and what does instead

Unchanged in substance, strengthened in mechanism: (1) single choke point — only `external-viewer.ts` mints an `ExternalViewer`; only `loadSharedPlan` + the four action fns query with it; lint rule: no `supabaseAdmin` in `/plan` routes outside these modules. (2) RLS as a wall — new tables have no anon/customer policies, and grants/events have **no browser write policies for any role**. (3) Hashed credentials — DB leak ≠ link leak. (4) The §5 suite runs in real CI (§ Test harness) and gates the flag flip.

## 5. Authorization tests + test harness (explicit, owned work)

**W4-T0 — build the harness first (fix: the repo has NO test infrastructure — no vitest/jest, no test script, no tests dir, no `.github/workflows` — so the load-bearing control had nowhere to run).** Scope, shipped as W4's first PR before any schema lands: add `vitest` + `"test"` script to package.json; `.github/workflows/ci.yml` running lint → `supabase start` (local stack) → `supabase db reset` (applies all migrations) → **apply each `supabase/rollbacks/*_down.sql`, then re-apply, asserting clean up/down/up** — making "reversible" executed, not paperwork → vitest suite against the seeded local stack (fixtures: customers A/B, one implementation each, internal+shared work items, grants gA/gB with both access levels, auth users uA/uB, sentinel internal risk row). SQL/RLS assertions run via `supabase test db` (pgTAP). This harness is a precondition for flipping either flag, and it also becomes the first CI this repo has — a deliverable other workstreams inherit.

Tests (revised where fixes changed behavior):
1. **Cross-implementation isolation (token)**: `loadSharedPlan(gA, implB.portal_key)` → Forbidden; every action fn with gA cookie against B-owned items → Forbidden; B's snapshot token unreadable with gA cookie.
2. **Grant lifecycle**: expired/revoked/superseded → identical neutral 401; cookie invalid after revoke; **revoking a parent cascade-revokes reassign children (recursive)**; rotation does not revoke children.
3. **Passcode**: lockout at 5; correct passcode during lock refused; cookie without `pc:true` cannot mutate; **two grants in one browser use distinct `gc_plan_<prefix>` cookies without cross-talk**.
4. **Projection allowlist**: no internal item, journal, risk-register content (sentinel string absent from plan payload AND all snapshot `content`), health, ARR; payload keys ⊆ frozen DTO allowlist; regex scan proves no fixture uuid appears.
5. **Auth-fallback RLS (SQL)**: as uA, selects on all customer-visible tables return only A rows; **work_item_comments/work_item_files return zero rows for `visibility='internal'` items even with `internal=false` comments**; as anon, all new tables return zero rows; as uA, grants/events return zero rows; **as an internal-role JWT via publishable key, INSERT into external_access_grants and external_plan_events is denied** (service-role-only writes).
6. **Internal-route lockout**: role `customer` on `requireInternal` paths → Forbidden (regression pin).
7. **Write scoping & capabilities**: token completes internal-only task → Forbidden; **`access_level='viewer'` grant: complete, comment, upload, AND reassign all → Forbidden**; comment fn cannot set `internal=true`; reassign to a B-customer contact → Forbidden; **child grant `expires_at` equals parent's exactly**; child `access_level` never exceeds parent's; rate limit enforced; **actions fns refuse when `external_plan_actions_enabled=false` even with valid cookie**.
8. **Upload hardening**: oversize → 413; disallowed MIME → 415; `../` sanitized; `storage_path` prefix always gA's implementation.
9. **Credential hygiene**: raw token nowhere in DB or audit payloads; email contains link exactly once.
10. **Telemetry integrity & dual audit**: `opened` recorded from GET as `http_get` and beacon as `beacon`, each deduped per source per hour; **an external completion writes BOTH a `portal_audit_log` row (actor_type='external_contact') and an `audit_log` row (actor_type='external_contact', actor_contact_id set, changed_by null) and appears in the account activity feed query**; events for gA never carry implB ids; **deleting a grant row directly in SQL leaves its events (grant_id null)**.
11. **Contact find-or-create**: concurrent reassigns to the same new email create exactly one `customer_contacts` row (role='collaborator').

## 6. UI surfaces touched

- New: `/plan/$token` (+ passcode subview, task list, timeline, comment/upload/reassign sheets — mobile-first, GoCanvas brand + signed-URL customer logo), `/plan/s/$snapshotToken`, `/portal/plan/$portalKey`, `implementations.$id.plan-preview`.
- Extended: `/access` (signed-links column), `customers.$customerId` (Share panel, engagement strip, snapshot list + "generate now"), activity-feed formatter for `actor_type='external_contact'`, `/alerts` later (W5).
- Config: `auth-gate.tsx` PUBLIC_PREFIXES += `/plan`; env `PLAN_SESSION_SECRET`; Vercel cron → `/api/cron/plan-snapshots`; CI workflow (W4-T0).

## Proposed migrations

**Numbering (fix):** W4 ships in Phase 3, so Phase 1/2 workstreams will consume 0009+ first. W4's migrations are referenced here as **W4-M1…W4-M4** and receive their `NNNN` numbers at implementation time, after Phases 1–2 land, continuing the existing forward-only convention. Each ships with a committed `supabase/rollbacks/NNNN_down.sql`, and the W4-T0 CI workflow **executes** every down script (up → down → up) so reversibility is tested, not asserted. W4-T0 (test harness + CI, no schema) is the first PR.

**W4-M1 — external access grants + events + keys + storage**
- Create `external_access_grants` (FKs `on delete restrict` to implementations/customers; `parent_grant_id`; `access_level`) and `external_plan_events` (`grant_id on delete set null`, `implementation_id on delete restrict`, `recorded_from`). RLS: enable both; internal SELECT only; **no insert/update/delete policies for any role** — service-role writes only.
- `alter table implementations add column portal_key text unique default encode(gen_random_bytes(12), 'hex');` then `set not null`. Hex, not base64 (Postgres base64 emits `/` and `+`, which 404 path segments). The volatile default populates all rows during the ADD COLUMN rewrite — no backfill UPDATE (the previous one was a no-op). Run in a maintenance window; table is small.
- `alter table customers add column logo_path text;`
- Contact dedupe + uniqueness for the reassign flow: one-time dedupe of `customer_contacts` on `(customer_id, lower(email))` (merge FK references to the oldest row — scripted in the migration with the reference updates enumerated), then `create unique index customer_contacts_customer_email_key on customer_contacts (customer_id, lower(email)) where email is not null;` (name checked against the full 0003 prototype list — no collision).
- Storage (SQL, the actual repo convention per 0001:378): `insert into storage.buckets (id,name,public) values ('attachments','attachments',false), ('customer-branding','customer-branding',false) on conflict (id) do nothing;` — provisions the previously-unprovisioned `attachments` bucket `hub.server.ts` depends on, and a **private** branding bucket (server-signed URLs, per 0001's storage rule).
- Insert `portal_app_config`: `external_plan_view_enabled=false`, `external_plan_actions_enabled=false`, `external_plan_link_ttl_days=60`, `external_snapshot_link_ttl_days=30`, `external_plan_reassign_daily_limit=10`.
- **Rollback (W4-M1_down):** `create schema if not exists w4_archive; create table w4_archive.external_access_grants as table external_access_grants; create table w4_archive.external_plan_events as table external_plan_events;` then drop the live tables — issued-access history is archived, never destroyed. **`portal_key` is KEPT** (dropping it would regenerate different keys on re-apply and permanently kill every emailed/bookmarked `/portal/plan` URL; the down script documents this and the re-apply script is `add column if not exists`, idempotent over a kept column). `logo_path` kept for the same reason if any logo was uploaded, else dropped. Config rows deleted. Buckets are NOT deleted (the `attachments` bucket is load-bearing for existing hub uploads; `customer-branding` objects are customer data — deletion is a manual, sign-off-gated operation, stated as such rather than pretended clean). Unique index on customer_contacts kept (it is a correctness improvement independent of W4).

**W4-M2 — audit stores**
- `portal_audit_log`: swap the actor_type CHECK to add `'external_contact'` (verify the auto-generated constraint name in prod first: `select conname from pg_constraint where conrelid='portal_audit_log'::regclass`).
- `audit_log` (0003 — the store the account activity feed actually reads): `alter table audit_log add column actor_type text not null default 'team_member' check (actor_type in ('team_member','external_contact','system')), add column actor_contact_id uuid references customer_contacts (id) on delete set null;` (`changed_by` is already nullable, 0003:169 — no constraint change needed; external rows carry `changed_by null, actor_type='external_contact', actor_contact_id=<contact>`).
- **Rollback (W4-M2_down):** **a documented no-op for the constraints** — the widened CHECK and the additive audit_log columns are backward-compatible and SURVIVE rollback. Recorded `actor_type` values are never rewritten and external audit rows are never moved or deleted: mutating recorded audit fact to satisfy a narrower constraint would violate evidence-over-inference. (The previous design's rewrite-to-'system' rollback is withdrawn.)

**W4-M3 — work item external columns + comments/files** *(depends on W2's `work_items` — W4 does not ship before W2, per the sequencing commitment)*
- `alter table work_items add column assigned_contact_id …, completed_by_contact_id …, completed_via …` (all nullable — instant).
- Create `work_item_comments`, `work_item_files`. RLS: internal CRUD; customer-auth SELECT joins customer_users **and requires `work_items.visibility='shared'`** (plus `internal=false` for comments) — the 0006 ticket_comments pattern alone is insufficient because it has no visibility axis; no anon policies; no customer write policies (writes are server-mediated).
- **Rollback (W4-M3_down):** archive both tables into `w4_archive` (customer-authored content is evidence), then drop; drop the three work_items columns (values are also recorded in audit stores, so the who/when evidence survives the column drop).

**W4-M4 — plan snapshots**
- Create `plan_snapshots` with the `share_token_hash → share_expires_at` CHECK, `implementation_id on delete restrict`, unique `(implementation_id, week_start, generated_at)`. RLS: internal select/insert, customer-auth select via customer_users join, no anon, no browser writes of share tokens.
- **Rollback (W4-M4_down):** archive to `w4_archive.plan_snapshots`, then drop.

**Deployment order & flags:** W4-T0 (harness/CI) → W4-M1+W4-M2 at Phase 3 start with both flags false (all schema dark, additive; no existing table's semantics change, no existing policy or URL changes) → app code for `/plan` ships dark → W4-M3 with/after W2 → W4-M4 + cron last → flip `external_plan_view_enabled` after the §5 suite is green in CI → flip `external_plan_actions_enabled` as a separate, later decision. Every step is independently revertable via the executed-in-CI down scripts; every rollback archives rather than destroys, and the two stated non-clean spots (kept `portal_key`, kept buckets) are documented as deliberate rather than claimed safe.

## Risks

- Bearer-URL forwarding: anyone holding the link is the contact. Mitigated by per-person grants (forwarding visible in telemetry), inherited-expiry reassign chains, cascade revocation, optional passcode, and no health/ARR/internal data in the projection — but residual risk is inherent to the magic-link model and must be accepted explicitly by the product owner.
- Service-role discipline: the token path bypasses RLS by design, so a scoping bug in one server function leaks cross-customer data with no DB backstop. Mitigations: single choke-point module, DTO allowlist serializer, uuid-leak regex test, service-role-only write policies on grants/events, and the §5 suite running in the new CI as a gate on flag flip — the harness (W4-T0) is scoped, owned work that must land first.
- Email security scanners prefetch links: 'opened' is now recorded from both the GET (http_get) and a post-render beacon (beacon), labeled by source, so scanner noise is distinguishable rather than discarded — but the W5 engagement signal must weight beacon/interactive events above bare http_get or scanners will read as engaged champions.
- Customer file uploads are attacker-controlled content served to internal staff: MIME allowlist, size cap, attachment-only disposition, signed URLs; no AV scanning exists in the stack (open question).
- Reassign auto-invite from a leaked link can spray branded emails; mitigations: inherited expiry (no self-extension), access_level gating (viewer grants cannot reassign at all), per-grant daily rate limit, owner notification on every reassign, cascade revocation, and the open question on recipient-domain restriction.
- The customer_contacts dedupe in W4-M1 (prerequisite for the unique index) merges existing duplicate contact rows and rewrites FKs; it must be rehearsed against a production snapshot in the CI local stack before applying — a missed FK reference would orphan data.
- Two audit stores now both receive external events (audit_log for the account feed, portal_audit_log for security); a write path that updates one and not the other produces inconsistent history — the dual-write lives in one helper function and §5 test 10 pins both writes.
- Shared database with the prototype app: all new names (external_access_grants, external_plan_events, plan_snapshots, work_item_comments, work_item_files, w4_archive schema, customer_contacts_customer_email_key index) were checked against the FULL 28-table list in 0003's header; that full-list check is the documented process for any future name. The W4-M2 constraint swap must use the actual production constraint name.
- on-delete-restrict FKs (grants/events/snapshots → implementations) change implementation deletion behavior: deleting an implementation that ever had external access now requires an archive step first. This is deliberate (evidence must survive) but is a new operational rule that must be documented for admins.
- Anonymous cookie sessions on Vercel/TanStack server functions are a new middleware path; per-grant cookie naming (gc_plan_<prefix>) avoids cross-grant collision but SameSite/secure/path behavior needs the integration tests in §5; PLAN_SESSION_SECRET rotation invalidates active viewer sessions (harmless — viewers re-click their link).
- Hard dependency: W4 does not ship before W2's work_items (fallback mode withdrawn); if W2 slips, the external portal slips with it — this is now an explicit schedule coupling the product owner must plan around, not a silent product downgrade.
- Engagement telemetry is personal data about named customer contacts; retention and disclosure posture (GDPR) is unresolved (open question) and external_plan_events should not launch to EU accounts before it is.
- The ADD COLUMN with volatile default in W4-M1 rewrites the implementations table; small today, but it must run in a maintenance window and the migration must be rehearsed in the CI local stack (which W4-T0 makes possible).

## Open questions

- Link lifetime policy: is 60 days the right default TTL, and should a link auto-rotate (fresh link emailed) as expiry nears, or is silent expiry acceptable with the IM re-sharing manually? (Reassign children now inherit the parent's expiry — confirm that a child invited near expiry getting a short-lived link is acceptable UX.)
- Passcode policy: per-grant opt-in by the implementation manager, or mandated for a segment/tier? Is out-of-band passcode delivery an acceptable operational burden?
- Reassign recipients: any email address, or restricted to domains already present in the customer's contacts? Owner veto/approval, or notification only?
- Cross-contact visibility inside one implementation: do customer colleagues see each other's names on comments and completions, or is attribution shown only to the internal team?
- Engagement telemetry privacy: do we disclose open-tracking (terms/notice), and what is the retention period for external_plan_events? Gates EU/enterprise rollout.
- Snapshot links now always expire (default 30 days — confirm the number); PDFs cannot be revoked once downloaded — acceptable for the weekly status content as scoped?
- Strict-IT fallback bar: is Supabase email magic-link auth sufficient, or do some accounts require SSO (SAML/OIDC) — a much larger build to scope now if so?
- Should external task completion require a typed-name confirmation ('signed by Jane Doe') to strengthen it as evidence, or is the grant identity alone enough?
- Branding: is a per-account logo next to GoCanvas branding the ceiling, or is fuller white-labeling (colors, sender domain) expected for enterprise?
- Who consumes the 'champion quiet for N days' signal — implementation owner only, or also CSM/leadership dashboards — and what is N (brief's example: 12 days; confirm as default)?
- Rollback residue: the two deliberate non-clean rollback spots (portal_key column kept; storage buckets and w4_archive schema kept) — sign off that archived-not-destroyed is the required posture, or specify a retention window for w4_archive.
- The customer_contacts unique index on (customer_id, lower(email)) is a portal-wide behavior change (blocks duplicate contacts everywhere, not just in W4 flows) — confirm the hub's existing contact-creation UIs should adopt on-conflict semantics too.

## Adversarial critique (panel record)

{
  "verdicts": [
    {
      "aspect": "Non-negotiable: evidence over inference",
      "verdict": "flawed",
      "reason": "Mostly honored (frozen snapshot jsonb, superseding rows, immutable expires_at) but violated at the edges. (1) `external_plan_events.grant_id ... on delete cascade` and `implementation_id ... on delete cascade` mean deleting a grant or implementation silently erases the exact rows the design says the W5 Engagement signal must cite as its inputs — the evidence base is deletable by cascade. Same for `external_access_grants` itself (cascade from implementations): the record of who was given access disappears. (2) The 0010 rollback rewrites `portal_audit_log.actor_type='external_contact'` to 'system' — mutating recorded audit fact to satisfy a constraint is exactly the 'silently replace a recorded value' move the brief forbids; a widened CHECK is backward-compatible and should simply survive rollback. (3) Beacon-only 'opened' recording discards the GET evidence entirely rather than recording both events labeled by source — inference by omission: a no-JS or JS-blocked open is recorded as 'never opened', which will feed a false 'champion gone quiet' alert."
    },
    {
      "aspect": "Non-negotiable: every existing URL keeps working",
      "verdict": "flawed",
      "reason": "No existing URL is moved (verified: no /plan route exists; /portal, /view, /tam untouched; PUBLIC_PREFIXES change is additive). But the design breaks its own NEW urls twice: (1) `external_key text unique default encode(gen_random_bytes(9), 'base64')` — Postgres base64 alphabet includes '/' and '+'; a '/' inside `/portal/plan/$externalKey` splits the path segment and 404s roughly 1-(63/64)^12 ≈ 17% of implementations. (2) The 0009 rollback drops `external_key`; re-applying 0009 regenerates different random keys, permanently killing every previously emailed/bookmarked /portal/plan URL — the rollback plan is a URL-breaking event the design calls 'safe because nothing else references these objects'."
    },
    {
      "aspect": "Non-negotiable: feature-flag shippable per phase",
      "verdict": "flawed",
      "reason": "The portal_app_config flag pattern is real (verified 0001:21-27, allowed_email_domains precedent; server reads via supabaseAdmin bypass the 0005 internal-only 'config readable' policy, so flag reads work). But a single boolean `external_plan_enabled` cannot express the design's own contingency: if W2 slips, /plan ships as a read-only milestones+commitments fallback — a materially different product (no task completion, no reassign, the headline features) under the same flag. There is no flag distinguishing fallback mode from full mode, so 'flip it on' means different things depending on migration state, and turning on the full experience later is not independently gated. Also the flag gates '404 to outsiders' but 0009's external_key backfill and the grants table land regardless — acceptable additive-dark-schema, but internal grant-issuing UI gating is asserted, not designed."
    },
    {
      "aspect": "Existing code paths (what the design missed in the code it touches)",
      "verdict": "flawed",
      "reason": "Four verified misses. (1) TWO audit stores exist: hub entity history is `audit_log` (0003:164, `changed_by uuid references team_members`) and hub.server.ts reads it for the account activity feed at lines 101, 800, 934; `portal_audit_log` (0001:278) is a separate store written by src/lib/server/audit.ts. The design only widens portal_audit_log, so external task completions never appear in the account-page activity feed, and audit_log.changed_by's FK to team_members cannot represent a contact — the design never mentions audit_log. (2) auth-gate.tsx:42-44 force-redirects internal users off /portal to '/', so no IM can ever preview `/portal/plan/$externalKey`; unaddressed. (3) `customer_contacts.role` is NOT NULL (0003:65) and there is no unique(customer_id,email) — the reassign 'find-or-create' needs a role value it never specifies and is dupe/race-prone. (4) Bucket provenance claim is false: `portal-briefs` and `portal-uploads` are created by SQL migration (0001:378 `insert into storage.buckets`), and the `attachments` bucket referenced by hub.server.ts:1675 is provisioned NOWHERE in the repo — 'scripted, matching how attachments/portal-briefs were provisioned' cites a precedent that doesn't exist; the repo convention is SQL. Also `implementations.external_ref` already exists (0003:82, written by implementation-input.ts:66) — adding `external_key` beside it is an unacknowledged confusion hazard."
    },
    {
      "aspect": "Migration safety and rollback honesty",
      "verdict": "flawed",
      "reason": "(1) The 0009 SQL is untested-by-inspection: with a volatile default, ADD COLUMN rewrites the table populating every row, so the follow-up `update ... where external_key is null` is a no-op — harmless but shows the DDL was never run; the base64 charset bug (see URLs verdict) confirms it. (2) 0009 rollback drops grants/events tables outright — destroying the record of issued external access rather than archiving, while the 0010 rollback's 'archive step' shows the author knows better. (3) 0010 rollback rewrites audit rows (see evidence verdict) — reversibility achieved by falsifying history is not honest reversibility; leave the widened constraint. (4) Numbering: the design admits only 0011 may need renumbering, but W4 is Phase 3 and ALL of 0009-0012 will be consumed by Phase 1/2 migrations (W1 templates alone needs several tables); '0009 has no dependency on W1/W2' is logically true and numerically false. (5) The new `supabase/rollbacks/NNNN_down.sql` convention has no executor: there is no CI (no .github/workflows), no test script (package.json scripts: dev/build/lint/format only), so down-scripts are unexecuted documentation, not verified rollbacks. (6) Storage rollback deletes the customer-branding bucket including uploaded customer logos — data loss stated as clean rollback."
    },
    {
      "aspect": "RLS / authorization holes",
      "verdict": "flawed",
      "reason": "The service-role choke-point architecture matches the codebase's real enforcement model (verified: everything goes through supabaseAdmin; RLS is browser-only defense). But four concrete holes: (1) The `work_item_comments` customer-select policy ('0005 join pattern, internal=false only') never checks `work_items.visibility='shared'` — a customer-auth browser client with the publishable key can read non-internal comments on INTERNAL-ONLY work items; `work_item_files` has no visibility gate at all, so files attached to internal work items are readable. The 0006 ticket_comments precedent it mirrors has no visibility axis, so copying it is insufficient. (2) `external_access_grants` has an internal INSERT policy — any internal role (sales, tam_se) can compute sha256 of a self-chosen token client-side and insert a working, unaudited external link for any implementation, bypassing the server's audited generation path entirely; grants should be service-role-write-only like external_plan_events. (3) Reassign is privilege escalation: an anonymous link bearer mints fresh grants with a FULL new TTL to any email (rate limit 10/day), so a leaked link self-extends forever; spawned grants inherit nothing and revoking the parent does not revoke children (superseded_by covers only rotation). (4) `can_complete=false` ('read-only viewer') gates only completion — read-only grants can still comment, upload files, and invite colleagues per §3's action list. Minor: single `gc_plan` cookie collides across two grants in one browser; snapshot `share_expires_at` is nullable with no enforced default → potentially immortal public snapshot URLs."
    },
    {
      "aspect": "Naming-collision handling",
      "verdict": "sound",
      "reason": "Verified against the FULL prototype list in 0003's header (28 tables: clients, users, forms, submissions, submission_fields, reports, accounts, sessions, verification_tokens, alert_rules, webhooks, shared_links, reference_tables, reference_rows, invites, form_versions, dashboards, dashboard_tiles, insight_items, routing_rules, solutions, proposals, price_book_items, connectors, api_specs, proposal_views, deal_activities, proposal_snapshots): external_access_grants, external_plan_events, plan_snapshots, work_item_comments, work_item_files collide with none of them, nor with the 27 hub tables or portal_* tables. Caveats: the design quotes only a 4-name subset of the prototype list as its check, so the process was luckier than it was rigorous — future names must be checked against the full 0003 header — and the in-repo near-miss `implementations.external_ref` vs new `external_key` on the SAME table went unflagged."
    },
    {
      "aspect": "Brief definition-of-done / phase sequencing",
      "verdict": "flawed",
      "reason": "Against Phase 2's DoD the schema is compatible (0011's columns are additive and nullable; visibility/party semantics match journey_template_task's visibility(internal|shared)/party(internal|customer|partner)), and against the brief's W4 spec most boxes are covered (magic link, passcode, revocation, no internal IDs, reassign-invites, snapshot, telemetry). Three failures: (1) the W2-slip fallback ships the customer portal BEFORE the work-item layer, inverting the brief's Phase 2→3 sequencing and delivering a plan page that cannot do 'their tasks first / complete / reassign' — the brief's stated reason the portal exists — under the same undifferentiated flag. (2) §5's authorization test suite is declared 'part of the definition of done' and the load-bearing compensating control for a service-role bypass, but the repo has zero test infrastructure: no vitest/jest dependency, no test script in package.json, no tests directory, no .github/workflows, no CI to run 'supabase test' — building that harness is unscoped, unowned work the design silently assumes exists. (3) Internal contradiction: §3 says risks/issues are 'never rendered' to customers while §2.5's snapshot content includes at_risk[] and is rendered to customers on the plan page and public snapshot URL — the brief wants 'what is at risk' in the snapshot, so the projection blocklist needs an explicit curated-customer-language rule, not two rules that contradict. Also branding via a public-read bucket contradicts the repo's stated storage rule ('private; server signs URLs for every download', 0001:376)."
    }
  ],
  "mustFix": [
    "0009: generate external_key with a URL-safe alphabet (encode(...,'hex') or base64 with translate(+/ to -_)) — postgres 'base64' emits '/' and '+' which break /portal/plan/$externalKey path routing; also drop the no-op backfill UPDATE (volatile default already populates rows) or backfill explicitly without a volatile default.",
    "Add `work_items.visibility = 'shared'` to the customer-select RLS policies on work_item_comments AND work_item_files (the 0006 ticket_comments pattern being copied has no visibility axis and is insufficient); otherwise customer-auth browser clients read comments/files on internal-only work items.",
    "Remove the browser INSERT/UPDATE policies on external_access_grants (make it service-role-write-only like external_plan_events): with an internal insert policy, any internal role can insert a self-computed token_hash and mint a working, unaudited external link for any implementation, bypassing the audited server generation path.",
    "Reassign flow: child grants must inherit the parent grant's expires_at (never a fresh TTL minted by an anonymous bearer), revoking a grant must cascade-revoke grants it spawned via created_via='reassign', and comment/upload/reassign must be gated by can_complete (or a separate capability) — as written a 'read-only' grant can upload files and invite strangers.",
    "External mutations must reach the audit store the hub actually reads: hub.server.ts (lines 101, 800, 934) renders the account activity feed from `audit_log` (0003), not `portal_audit_log`; audit_log.changed_by FKs to team_members and cannot hold a contact. Either extend audit_log (nullable changed_by + actor columns) or change the feed queries — the design's 0010 touches only portal_audit_log, so external completions would be invisible on the account page.",
    "Rewrite the 0010 rollback: leave the widened actor_type CHECK in place on rollback (widening is backward-compatible); never rewrite recorded actor_type values to 'system' — that mutates audit evidence and violates the brief's evidence-over-inference non-negotiable.",
    "0009 rollback: archive (copy out) external_access_grants and external_plan_events instead of dropping, keep the external_key column (or document that reapplication regenerates different keys and kills every previously shared /portal/plan URL), and drop the on-delete-cascade from grants to external_plan_events so engagement evidence survives grant deletion.",
    "Renumber honestly: W4 ships in Phase 3, so all four migrations (not just 0011) will find 0009–0012 already claimed by Phase 1/2 work; state that W4 migration numbers are assigned at implementation time after Phases 1–2 land.",
    "Split the flag: `external_plan_enabled` cannot distinguish the W2-slip read-only fallback from the full task-action portal; either add per-capability flags (external_plan_view / external_plan_actions) or commit to not shipping /plan before W2, per the brief's Phase 2→3 sequencing.",
    "Build the test harness as an explicit, owned work item BEFORE flag flip: the repo has no vitest/jest, no test script, no tests directory, and no CI workflows — §5's suite is the declared load-bearing control for a service-role RLS bypass and currently has nowhere to run; the same CI must actually execute the new supabase/rollbacks/*_down.sql scripts or 'reversible' is untested paperwork.",
    "Provision all storage via SQL migration (`insert into storage.buckets ... on conflict do nothing`, the actual repo convention per 0001:378), including the never-provisioned 'attachments' bucket hub.server.ts depends on; make customer-branding private with server-signed URLs per 0001's stated storage rule instead of a public-read bucket.",
    "Fix reassign's contact creation: customer_contacts.role is NOT NULL — specify the role value used, and add unique(customer_id, lower(email)) (name checked against the prototype's table list) or handle duplicate/race find-or-create explicitly.",
    "Give internal staff a preview path: auth-gate.tsx:42-44 redirects internal users off /portal, making /portal/plan/$externalKey unreachable for the people issuing the links.",
    "Resolve the §3-vs-§2.5 contradiction: define exactly which 'at risk' content (curated customer-language snapshot fields, never the internal risk register rows) is customer-visible, and make the projection allowlist test enforce that definition.",
    "Enforce a non-null default share_expires_at on plan_snapshots share links (and record 'opened' from both the GET and the beacon, labeled by source, instead of discarding the GET evidence) so no public URL is immortal and no-JS opens aren't recorded as silence."
  ]
}
