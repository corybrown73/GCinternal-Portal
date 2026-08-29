# Design: Salesforce Integration

> Produced by the v2 Step-0 design panel (workflow wf_f952802b-e7e, 2026-08-29).
> Each design was drafted, adversarially critiqued, and revised (all four revised).

# Workstream 6 — Salesforce auto-create, idempotency, write-back, webhooks (REVISED)

Critique disposition: every mustFix item was re-verified against the repo and found correct; all 13 are incorporated below (none rebutted). Key reversals from v1: the ingest now adopts UI-created customers instead of guaranteeing duplicates; the deal-link moves into the core auto-create path; supersede is a Postgres RPC, not a fictional "one transaction" over REST; replay never writes by default; webhook secrets move to a service-role-only table; the invented rollback convention is replaced with honest, tested down-scripts that state their data loss.

## 0. What exists today (grounding — corrected)

- **Post-sale creation ALREADY exists**: `startOnboarding()` (`src/lib/presale.server.ts:447-536`) creates a `customers` row (name/arr only — **no** Salesforce id), an `implementations` row (`status:'on_track'`, `current_stage=LIFECYCLE_STAGES[0]`), a seed `implementation_stage_history` row, links `portal_accounts.customer_id`, and moves the deal to `onboarding_kickoff` via `transitionStage`. v1's claim that "nothing post-sale is created" was wrong; this function is the reconciliation problem, not a footnote.
- **Three stage-history writers**: hub manual create (`src/lib/hub.server.ts` ~1417), hub stage transition (~1514), and `startOnboarding` (~497). Any event emission must cover all three plus the new SF endpoint.
- **`implementations.status` reality**: DDL default `'active'` (0003 line 93); `startOnboarding` writes `'on_track'`. There is no `'closed'` value in production. Terminality must not branch on status.
- **`implementations` columns**: `owner_id uuid` (FK `team_members`), `sales_owner text` (free text), `external_ref text` (0003 line 82 — may already carry opportunity references; see open question #7). There is **no** `se_owner` column.
- **`createAlert()`** (`src/lib/tickets.server.ts:586`) **throws** on insert failure and has no dedupe — unlike `audit()`'s never-throw contract.
- **Inbound presale**: Zapier POSTs to `POST /api/v1/accounts` → `upsertAccount` (matches `portal_accounts.salesforce_id`, falls back to `lower(name)`); auth via `requireApiKey` (`src/lib/server/api-auth.ts`), keys in `portal_api_keys`.
- **Infra idioms reused**: `portal_transition_stage()` RPC (0001) is the precedent for multi-statement transactional logic; Vercel crons + `CRON_SECRET`; `portal_app_config` (0001) for flags; `org_id` default `'00000000-0000-4000-8000-000000000001'` everywhere.
- Naming: new config table is **`integration_field_maps`** (NOT `field_mappings`, taken in 0003 for per-implementation customer data mapping); "Journeys" `journey_*` tables (0006) are the email drip, unrelated to WS1 journey templates.

## 1. Identity & idempotency schema

### SF id normalization — applied everywhere, including existing ingest points

0009 adds an **immutable SQL function `sf_id_18(text) returns text`** (the deterministic 15→18 suffix algorithm; returns input unchanged if already 18-char or null) plus the same pure function in TS (`src/lib/server/sf-id.ts`, unit-tested against the SQL version). Normalization is applied at **every** entry point:
- the new ingest endpoint (both ids),
- **`upsertAccount`** in `src/lib/server/accounts.ts` — normalize `salesforce_id` before match and before store (code change, ships with the endpoint),
- **`importDealsCsv`** in `presale.server.ts` — same,
- the admin adopt/backfill actions,
- a one-time data fix in 0009: `update portal_accounts set salesforce_id = sf_id_18(salesforce_id) where salesforce_id is not null and length(salesforce_id) = 15;` with the old→new pairs written to `portal_audit_log` (action `account.sf_id_normalized`, actor_type `system`) so the original recorded value is preserved as evidence, not silently rewritten.

Without this, the bridge join `portal_accounts.salesforce_id = <18-char>` silently misses legacy 15-char rows and idempotency is fiction at the seam it depends on.

### customers

```sql
alter table customers add column salesforce_account_id text;  -- always sf_id_18-normalized
create unique index customers_sf_account_uidx
  on customers (org_id, salesforce_account_id)
  where salesforce_account_id is not null;
```

### implementations

```sql
alter table implementations
  add column salesforce_opportunity_id text,           -- sf_id_18-normalized
  add column salesforce_account_id text,               -- denormalized for write-back payloads
  add column sf_closed_won_at timestamptz,             -- from payload; evidence, never computed
  add column superseded_by_implementation_id uuid
    references implementations (id) on delete set null;

create unique index implementations_sf_opp_current_uidx
  on implementations (org_id, salesforce_opportunity_id)
  where salesforce_opportunity_id is not null
    and superseded_by_implementation_id is null;
create index implementations_sf_opp_idx on implementations (salesforce_opportunity_id);
```

### Supersede is a Postgres RPC (v1's "one transaction" was unimplementable)

The partial unique index is checked per statement and is not deferrable; the old row cannot point at a not-yet-existing new row; and supabase-js REST has no multi-statement transactions. Following the `portal_transition_stage` precedent (0001), 0009 defines:

```sql
create or replace function sf_supersede_implementation(
  p_old_implementation_id uuid,
  p_new_implementation   jsonb,   -- columns for the new row, WITHOUT salesforce_opportunity_id
  p_reason               text,    -- required, non-empty
  p_actor_profile_id     uuid     -- nullable for api_key actors; actor recorded either way
) returns uuid  -- new implementation id
language plpgsql security definer as $$
-- Single transaction, ordered to satisfy the partial index at every statement:
--   1. insert new implementations row from p_new_implementation (opp id NULL → index not involved);
--   2. update old row: superseded_by_implementation_id = new id (old row leaves the index);
--   3. update new row: salesforce_opportunity_id = old row's opp id (slot now free);
--   4. insert seed implementation_stage_history row for the new row;
--   5. insert portal_audit_log row (action 'implementation.superseded', payload = old id, new id, reason).
-- Raises if p_old is already superseded, if p_reason is blank, or if the old row has no opp id.
$$;
```

Called only from the explicit UI action "Create follow-on implementation" (manager+), never automatically. Grant execute to service role only; the server function wraps it with role checks.

### Terminality — defined against real data, not invented statuses

`terminal(existing)` := a `graduations` row exists for the implementation **OR** `current_stage = 'graduate-to-cs'`. `implementations.status` (`'active'` default, `'on_track'` from startOnboarding, plus whatever humans set) is **not** consulted for terminality — the observed values don't encode it.

### Behavior matrix for `POST /api/v1/implementations`

`existing` = current (non-superseded) implementation for the normalized opp id:

| State | Behavior | HTTP |
|---|---|---|
| No `existing` | Resolve customer (§2 step 4), create implementation, select template (§3), core deal-link (§2 step 8) | `201 {created:true}` |
| `existing`, not terminal | **Pure replay: zero writes to customers/implementations.** Compute and log a drift report (payload value vs. hub value per mapped field) in the sync-log `decision` jsonb; apply per-field `fill_policy='if_blank'` fills ONLY if configured, each fill audited visibly (§2a). Return existing ids | `200 {created:false, replay:true}` |
| `existing` terminal | No auto-duplicate. Sync-log row + deduped, never-throw alert (§2b), machine-readable guidance | `409 {code:'opportunity_already_delivered', existing_implementation_id}` |
| Concurrent double-fire | DB unique index wins; on `23505` re-select, fall through to replay branch | `200` |

`Idempotency-Key` header: request-level cache (same key + body hash within 24h → cached response) stored on the sync-log row; the durable key remains the opportunity id.

## 2. `POST /api/v1/implementations` — pipeline (revised)

New file `src/routes/api/v1/implementations.ts` (shape of `accounts.ts`: dynamic imports, `requireApiKey`, `apiError`). New scopes `implementations:read`, `implementations:write` appended to `API_SCOPES` (text[] — no migration). Zod `opportunityIngestSchema` unchanged from v1 (`salesforce_opportunity_id`, `salesforce_account_id`, `account_name` used ONLY to create never to match, `opportunity_name`, `opportunity_type`, `stage_name`, `amount`, `currency`, `close_date`, `owner_email`, `se_email`, `line_items[]`, `raw`).

1. Flag `feature.sf_auto_create` (portal_app_config) — off → `503 feature_disabled`. Env `SF_INTEGRATION_DISABLED=1` = global kill switch.
2. Normalize both ids via `sfId18()`.
3. Apply inbound `integration_field_maps` (override layer, not prerequisite).
4. **Customer resolution — adoption before creation** (this is the fix for the guaranteed-duplicate bug):
   a. Match `customers` on `(org_id, salesforce_account_id)` → use it.
   b. Else find `portal_accounts` where `sf_id_18(salesforce_id) = <account id>`; if that row has `customer_id` (i.e. `startOnboarding` already ran), **adopt** that customer: stamp `customers.salesforce_account_id` (an audited identity-stamp, `portal_audit_log` action `customer.sf_id_adopted`, payload includes the matching portal_accounts row id as evidence) and use it. No field fills.
   c. Else create the customer from the payload.
   On adoption or creation-conflict (23505 → re-select), never write payload values over existing customer fields; a drift report goes in the sync log instead (see §2a).
5. Idempotency matrix (§1).
6. Template selection (§3) — only if `feature.sf_template_select` is on AND the WS1 contract objects exist (§3a); else bare implementation at `current_stage='handoff'`, `source='salesforce'`, queued in the "needs template" triage list (§3a).
7. **Owner resolution — lands where columns exist**: `owner_email` → `team_members` by email → `implementations.owner_id` (set on create only; unresolved email recorded in sync log, owner_id left null). `se_email` is **sync-log-only** (`decision.se_email`) — there is no `se_owner` column and WS2 owns the role-typed assignment model; adding a throwaway column here would collide with it. When WS2's assignment table lands, a backfill can replay `decision.se_email` from the sync log — which is exactly why it's recorded.
8. **Core deal-link (moved OUT of the bridge flag)**: if a `portal_accounts` row matched in 4b (or matches now, strictly on normalized `salesforce_id`, never name), set its `customer_id`. This is part of `sf_auto_create` itself — otherwise, with bridge off (the default), `startOnboarding`'s only guard (`account.customer_id`, presale.server.ts:459) passes and a human clicking "Start onboarding" duplicates the customer AND the implementation. The link is what makes the two paths mutually idempotent.
9. **Bridge flag gates ONLY the stage transition**: `feature.sf_presale_bridge` on → call `portal_transition_stage(deal, 'closed_won', 'api', ...)` (forward-only, same funnel as the UI). Off → deal stage untouched.
10. Seed `implementation_stage_history` row; `audit()` action `implementation.sf_create`; `emitEvent('implementation.created', ...)` (§4).
11. Response `{implementation, customer: {id, adopted: bool}, template, created, replay}`.

**Symmetric patch to `startOnboarding`** (ships in the same PR as 0009, before any flag flips): (a) before creating a customer, look up `customers` by `(org_id, sf_id_18(account.salesforce_id))` and reuse on hit (covers SF-ingest-ran-first); (b) stamp `salesforce_account_id: sfId18(account.salesforce_id)` on any customer it creates. Both directions now converge on the same customer row regardless of which fires first. `startOnboarding` also gains an `emitEvent('implementation.created', ...)` call (§4).

### 2a. Replay & fill semantics — evidence over inference, fixed

A blank a human left IS recorded state. Therefore:
- Default replay behavior is **read-only**: no null-fill, no customer fill. The sync-log `decision` jsonb carries the drift report (per mapped field: payload value, hub value, `action:'none'`).
- Fills are **opt-in per field**: `integration_field_maps` gains `fill_policy text not null default 'never' check (fill_policy in ('never','if_blank'))`. Only inbound rows explicitly set to `'if_blank'` may fill a null column on replay/adoption.
- Every fill that happens is **visible, not just logged**: one `portal_audit_log` row (action `implementation.replay_fill`, payload = fields + values + sync_log id) AND one implementation journal entry ("Filled by Salesforce replay: se notes… — see sync log") so it appears in the implementation UI timeline, not only in an admin table. Seeded field-map rows all default to `'never'`.

### 2b. The 409 alert — never-throw + deduped

`createAlert()` throws (tickets.server.ts:586ff) and has no dedupe. The endpoint uses a wrapper `safeCreateAlert()` in `src/lib/server/events.ts`: try/catch (log-and-continue on failure, matching `audit()`'s contract), and before insert it queries for an open alert with `kind='sf_rewon_after_completion'` and `payload->>'salesforce_opportunity_id' = <id>` (the `/api/cron/sla` open-alert-query idiom) — hit → skip insert and skip notify. Zapier retry storms neither 500 the handler nor email managers repeatedly.

Also `GET /api/v1/implementations?salesforce_opportunity_id=&updated_since=` (scope `implementations:read`).

## 3. Template auto-selection

`default_for` rule schema and pure `selectTemplate(rules, inputs)` in `src/lib/server/template-select.ts` unchanged from v1 (priority; glob `product_code_any/all`, `product_family_any`, `opportunity_type_any`, `min/max_amount`; AND across clauses, OR within lists; only `status='published'`; winner + full per-rule pass/fail evaluation stored in sync-log `decision`; "test a payload" box in `/admin/integrations`).

### 3a. WS1 interface — a named contract, not prose

WS6 compiles and ships against this exact contract, which WS1 must satisfy (agreed with WS1's designer, recorded here as the dependency spec):
- Table `journey_templates` with at least: `id uuid pk`, `key text`, `status text` (`'published'` participates), `default_for jsonb`, `current_version int`.
- Column additions on `implementations` (WS1's migration, not 0009): `template_id uuid null`, `template_version int null`.
- RPC `apply_template_to_implementation(p_implementation_id uuid, p_template_id uuid, p_template_version int, p_actor_profile_id uuid) returns void` — idempotent for a given (implementation, template, version); **must accept any implementation whose `template_id` is null regardless of `source` or age** (this is the "adopt a bare implementation later" mechanism, and it is a WS1 acceptance criterion, not a hope).

WS6 calls: `selectTemplate` → on match, `apply_template_to_implementation(newImplId, tpl.id, tpl.current_version, null)`, and stores `{template_id, template_version, matched_rule}` in the sync log. Runtime feature detection: `feature.sf_template_select` flag AND a cheap existence probe of the RPC (cached); absent → skip cleanly.

**Fallback & triage (Phase 4 ships without WS1)**: implementation is created bare (`current_stage='handoff'`, `template_id` null when the column exists, `source='salesforce'`). `/admin/integrations` shows a **"Needs template" queue**: SF-created implementations with no template, each with an "Apply template" action that calls the same RPC once WS1 exists — owner of the queue is open question #5. `sf_fallback_template` config (`"none"` or a template key) decides default behavior once templates exist.

## 4. Outbound: outbox → webhooks → Zapier write-back

### 4.1 Delivery mechanism recommendation (unchanged, honest trade-offs)

**Signed outbound webhook consumed by Zapier** for Phase 4: the team has zero SF API access (CSV + Zapier only); a Connected App needs an SF admin who doesn't exist yet; Zapier "Update Record by Id" is a stock action ops can own; payload carries SF-shaped field names from the outbound map so the Zap is a dumb pipe. Recorded trade-offs: we log Zapier's 200 not SF's result; seconds of latency; per-task billing. A later `direct_sf_rest` mode is a new dispatcher branch, same `integration_sync_log`, no schema change.

### 4.2 Event outbox

```sql
create table integration_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  event_type text not null,   -- implementation.created | stage.changed | gate.blocked
                              -- | alert.raised | handoff.returned | salesforce.write_back
  entity_type text not null, entity_id uuid not null,
  implementation_id uuid references implementations (id) on delete set null,
  payload jsonb not null,     -- full body incl. inputs (evidence)
  dedupe_key text,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz
);
create index integration_events_undispatched_idx on integration_events (created_at)
  where dispatched_at is null;
-- Race-proof dedupe (v1's read-then-insert was racy):
create unique index integration_events_dedupe_uidx
  on integration_events (org_id, dedupe_key)
  where dedupe_key is not null and dispatched_at is null;
```

`emitEvent()` in `src/lib/server/events.ts` (never-throw, like `audit()`) inserts with the dedupe key and treats `23505` as success-skip.

**Emission from ALL writers, enforced by shared helpers**: two thin functions — `recordImplementationCreated(...)` (writes the seed stage-history row + emits `implementation.created`) and `recordStageChange(...)` (writes the history row + emits `stage.changed` with from/to/actor/note). All four call sites are refactored onto them in this workstream's PR: hub manual create (hub.server.ts ~1417), hub transition (~1514), `startOnboarding` (~497), and the new SF endpoint. Webhook consumers therefore see the whole world, not just SF-sourced activity. `createAlert()` gains one `emitEvent('alert.raised', ...)` line. `gate.blocked` / `handoff.returned` are declared types with no emitters until WS3 calls them — documented as such in the OpenAPI webhook section. `salesforce.write_back` events are emitted on mapped outbound field changes (stage, `health_computed`, target/actual launch dates, portal link on creation), payload `{salesforce_opportunity_id, salesforce_account_id, fields:{<SF API name>: value}, inputs:{...}}`, `dedupe_key = 'wb:'||opp||':'||sha256(fields)`.

### 4.3 Webhook endpoints, secrets, delivery

```sql
create table webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  name text not null, url text not null,
  secret_last4 text not null,                 -- ciphertext lives elsewhere (below)
  event_types text[] not null default '{}',   -- empty = all
  active boolean not null default true,
  created_by uuid references portal_profiles (id),
  created_at timestamptz not null default now(),
  disabled_at timestamptz, disabled_reason text
);

-- Service-role-ONLY secrets table. RLS enabled, ZERO policies => no authenticated
-- principal (managers included, and customer-portal users who ARE role `authenticated`
-- via customer_users magic links) can read it through PostgREST; only the service role
-- (bypasses RLS) can. This replaces v1's "exclude the column from the UI select list",
-- which was not a security boundary, and v1's webhook_endpoints_safe view, which as a
-- default (owner-rights) view would have bypassed RLS for every authenticated principal.
-- No view is created at all; if one is ever added it MUST be
-- `with (security_invoker = true)` with explicit narrow grants.
create table webhook_endpoint_secrets (
  endpoint_id uuid primary key references webhook_endpoints (id) on delete cascade,
  secret_ciphertext text not null,   -- AES-256-GCM under env WEBHOOK_SIGNING_KEK
  created_at timestamptz not null default now()
);

create table webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  endpoint_id uuid not null references webhook_endpoints (id) on delete cascade,
  event_id uuid not null references integration_events (id) on delete cascade,
  attempt int not null default 0,
  status text not null default 'pending'
    check (status in ('pending','succeeded','failed','exhausted','skipped')),
  request_body jsonb not null,
  response_status int, response_body text,   -- truncated 4KB
  last_error text,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (endpoint_id, event_id)
);
create index webhook_deliveries_due_idx on webhook_deliveries (next_attempt_at)
  where status in ('pending','failed');
```

Signing (Stripe-style, verifiable in a Zapier code step): canonical JSON `{id,type,created_at,data}`; headers `X-GCHub-Event-Id/-Event-Type/-Timestamp/-Signature: v1=hex(hmac_sha256(secret, "{ts}.{body}"))`; receivers reject |now−ts| > 5 min. Secret `whsec_...` shown once at creation, then only ciphertext + last4 exist.

Dispatch: cron `/api/cron/dispatch` every 5 min (`vercel.json`), `authenticateCronRequest`. Pass 1 fans undispatched events into `webhook_deliveries` (one per matching active endpoint) and stamps `dispatched_at` (stamped-guard idiom from the SLA sweep). Pass 2 POSTs due deliveries (batch ≤ 25, 10s timeout each); 2xx → succeeded; else failed with backoff 1m,5m,30m,2h,6h,24h; after 6 → `exhausted` + `safeCreateAlert(kind:'webhook_exhausted')`; 20 consecutive exhaustions auto-disables the endpoint + critical alert. Manual redeliver creates a fresh pending row, preserving history. Pass 3 (self-heal): enqueue `implementation.created` for any `source='salesforce'` implementation lacking one (outbox is not transactional over REST). Docs state at-least-once, unordered delivery; consumers order by `created_at` + entity id.

## 5. Field maps + sync log + admin UI

```sql
create table integration_field_maps (      -- NOT 'field_mappings' (0003, taken)
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  provider text not null default 'salesforce',
  direction text not null check (direction in ('inbound','outbound')),
  source_path text not null,   -- inbound: payload path; outbound: hub field key
  target_field text not null,  -- inbound: hub column; outbound: SF field API name (GCHub_*__c)
  transform text,              -- 'none'|'date'|'number'|'stage_label'|'lowercase'
                               -- (fixed menu; pure fns in src/lib/server/transforms.ts, no eval)
  fill_policy text not null default 'never'
    check (fill_policy in ('never','if_blank')),   -- §2a: replay/adopt fills are opt-in per field
  required boolean not null default false,
  active boolean not null default true,
  notes text,
  updated_by uuid references portal_profiles (id),
  updated_at timestamptz not null default now(),
  unique (org_id, provider, direction, source_path, target_field)
);

create table integration_sync_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  direction text not null check (direction in ('inbound','outbound')),
  provider text not null default 'salesforce',
  kind text not null,          -- opportunity.ingest | write_back.dispatch | replay | ...
  external_id text,
  implementation_id uuid references implementations (id) on delete set null,
  customer_id uuid references customers (id) on delete set null,
  api_key_id uuid references portal_api_keys (id),
  idempotency_key text,
  request_payload jsonb,
  decision jsonb,              -- idempotency branch, template rule evaluations, drift report,
                               -- adopted-customer evidence, unresolved emails (incl. se_email)
  response_status int, response_payload jsonb,
  status text not null check (status in ('succeeded','replayed','rejected','failed')),
  error text,
  retried_from_id uuid references integration_sync_log (id),
  created_at timestamptz not null default now()
);
create index integration_sync_log_ext_idx on integration_sync_log (external_id, created_at desc);
create index integration_sync_log_status_idx on integration_sync_log (status, created_at desc)
  where status in ('rejected','failed');
```

Inbound retry: "Re-run" on a failed/rejected row re-executes the pipeline against stored `request_payload` (safe under §1 idempotency), new row with `retried_from_id`. Outbound retry = webhook redeliver.

UI under `/admin` shell (read `portal_can_manage()`, write admin), beside `admin.api-keys.tsx`:
- `/admin/integrations` — status cards, feature-flag toggles (`feature.sf_auto_create`, `feature.webhooks_out`, `feature.sf_write_back`, `feature.sf_presale_bridge`, `feature.sf_template_select`), **"Needs template" queue** (§3a), per-customer "adopt external_id / stamp SF account id" action.
- `/admin/integrations/field-maps` — editor incl. `fill_policy` column with explainer copy; "test with sample payload" preview (mapped output + template-selection result). Header copy says "Salesforce field mapping" explicitly (vs. 0003 `field_mappings`).
- `/admin/integrations/sync-log` — filterable, row detail with payload + decision (drift reports rendered as a diff table), re-run.
- `/admin/integrations/webhooks` — endpoint CRUD (secret shown once), delivery log, redeliver, send-test-event.

## 6. OpenAPI at `/api/v1/openapi.json`

Unchanged from v1 (verified sound-adjacent by critique): schema-first from the existing Zod validators via `@asteasolutions/zod-to-openapi` (replaces a hand-spec that would drift); registry module `src/lib/server/openapi.ts`; route `src/routes/api/v1/openapi[.]json.ts`, no auth (spec isn't secret), `Cache-Control: public, max-age=300`; security schemes + `x-required-scope`; docs page `/api/v1/docs` (Scalar from cdnjs); vitest build-and-validate + golden-file test; webhook event shapes documented via OpenAPI 3.1 `webhooks` objects, with `gate.blocked`/`handoff.returned` marked "declared, no emitter until Phase 3".

## 7. RLS & security

- `integration_events`, `integration_sync_log`, `integration_field_maps`, `webhook_endpoints`, `webhook_deliveries`: RLS enabled, `select` policy `using (portal_can_manage())`, no write policies (service-role only) — the `portal_api_keys` posture (verified in 0002/0005). Note `portal_can_manage()` already excludes customer-portal users; the failure mode the critique caught was views/columns, both eliminated:
- `webhook_endpoint_secrets`: RLS enabled, **zero policies** — unreadable by any PostgREST client; service role only. No `_safe` view exists (v1's would have run with owner rights and bypassed RLS for all `authenticated` principals, customer-portal users included).
- Ingest runs on service role like the rest of `/api/v1`; scopes + zod are the guard.
- Retention: dispatch cron prunes `integration_sync_log`/`webhook_deliveries` older than `integration.log_retention_days` (default 90; open question #6, along with whether payload detail should be admin-only given deal amounts).

## 8. Feature flags / phase shipping

Five `portal_app_config` rows, all default `{"enabled":false}`, checked server-side per request; env `SF_INTEGRATION_DISABLED=1` global override: `feature.sf_auto_create` (ingest + customer adoption + **core deal-link**), `feature.sf_presale_bridge` (deal **stage transition** only — the link is core, so the startOnboarding duplicate hole is closed in every flag combination), `feature.sf_template_select` (off until WS1 contract objects exist), `feature.webhooks_out`, `feature.sf_write_back`. Schema is additive and lands dark; the `startOnboarding`/`upsertAccount`/`importDealsCsv` code patches (SF-id stamping + normalization + event emission) ship with the schema and are safe with all flags off — they change no user-visible behavior, only add identity stamps and outbox rows.

## Proposed migrations

Numbered continuing from 0008. Honesty note replacing v1's fabricated claim: 0001-0008 contain **no** rollback sections and no companion-rollback convention exists in this repo — v1 invented it. The brief requires reversible migrations, so this workstream introduces the mechanism explicitly: each forward migration `000N_*.sql` gets a tested down-script committed at `supabase/rollbacks/000N_down.sql` (never auto-applied; run manually as a new numbered migration if ever needed in prod), and each down-script's data-loss consequences are stated below, not hidden.

**0009_sf_identity.sql**
- `create function sf_id_18(text) returns text immutable ...` (deterministic 15→18 normalization; identity for 18-char/null input).
- `alter table customers add column salesforce_account_id text;` + partial unique index `customers_sf_account_uidx (org_id, salesforce_account_id) where salesforce_account_id is not null`.
- `alter table implementations add column salesforce_opportunity_id text, add column salesforce_account_id text, add column sf_closed_won_at timestamptz, add column superseded_by_implementation_id uuid references implementations (id) on delete set null;`
- Partial unique index `implementations_sf_opp_current_uidx` + lookup index `implementations_sf_opp_idx` (DDL in design §1).
- `create function sf_supersede_implementation(...)` (design §1) — security definer, execute granted to service_role only.
- Data fix: normalize existing 15-char `portal_accounts.salesforce_id` via `sf_id_18`, writing old→new pairs to `portal_audit_log` (action `account.sf_id_normalized`, actor_type `system`) first, so the recorded originals survive as evidence.
- Down-script `supabase/rollbacks/0009_down.sql`: drop function `sf_supersede_implementation`; drop the three indexes; drop the four `implementations` columns and `customers.salesforce_account_id`; drop `sf_id_18`. **Data loss stated**: SF identity stamps and supersession pointers are destroyed; the `portal_accounts.salesforce_id` normalization is NOT auto-reverted (the audit rows hold the originals; a revert UPDATE from those rows is included, commented, for deliberate use). Implementations created via SF survive but lose their opportunity linkage.

**0010_integration_core.sql**
- `create table integration_events (...)` + undispatched partial index + `integration_events_dedupe_uidx (org_id, dedupe_key) where dedupe_key is not null and dispatched_at is null` (race-proof dedupe).
- `create table integration_sync_log (...)` + external_id and failed-status indexes.
- `create table integration_field_maps (...)` incl. `fill_policy` + unique (org, provider, direction, source_path, target_field).
- RLS: enable on all three; `create policy "<t> manage select" ... using (portal_can_manage());` no write policies.
- Down-script `supabase/rollbacks/0010_down.sql`: drops the three tables. **Data loss stated explicitly (v1 hid this)**: dropping `integration_sync_log` and `integration_events` destroys the evidence record — template-selection rule evaluations, idempotency decisions, drift reports, replay-fill provenance — for every SF-created implementation that remains in the database. The down-script therefore begins with a guard: `do $$ begin if exists (select 1 from implementations where salesforce_opportunity_id is not null) then raise exception 'integration_sync_log holds the evidence for surviving SF-created implementations. Export first (see header) and re-run with gc.force_drop=on.'; end if; end $$;` bypassable only via `set gc.force_drop = 'on'` after running the documented `copy ... to` export of both tables.

**0011_webhooks.sql**
- `create table webhook_endpoints (...)` (no ciphertext column).
- `create table webhook_endpoint_secrets (...)` — RLS enabled, **zero policies** (service-role-only by construction; see design §4.3/§7). No view is created (v1's `webhook_endpoints_safe` is deleted from the design; any future view must be `with (security_invoker = true)` + explicit grants).
- `create table webhook_deliveries (...)` + `unique (endpoint_id, event_id)` + due partial index.
- RLS on endpoints/deliveries: manage-select, no write policies.
- Down-script `supabase/rollbacks/0011_down.sql`: `drop table webhook_deliveries; drop table webhook_endpoint_secrets; drop table webhook_endpoints;` **Data loss stated**: delivery history and endpoint secrets are unrecoverable (secrets are shown once at creation; consumers must be re-keyed on any re-create).

**0012_integration_seeds.sql**
- `insert into portal_app_config (key, value) values ... on conflict (key) do nothing`: `feature.sf_auto_create`, `feature.sf_presale_bridge`, `feature.sf_template_select`, `feature.webhooks_out`, `feature.sf_write_back` (all `{"enabled": false}`), `sf_fallback_template` (`"none"` pending Q5), `integration.log_retention_days` (`90`).
- Seed `integration_field_maps` rows — the insert **explicitly sets `notes = 'seed:0012'` on every row** (v1's rollback referenced this tag but its seed DDL never set it; fixed): outbound `current_stage→GCHub_Stage__c` (transform `stage_label`), `health_computed→GCHub_Health__c`, `target_launch_date→GCHub_Target_Launch__c` (`date`), `actual_launch_date→GCHub_Actual_Launch__c` (`date`), `portal_url→GCHub_Portal_Link__c`; inbound identity rows for the `opportunityIngestSchema` fields, all `fill_policy='never'`. `on conflict do nothing`.
- The field-maps editor sets `notes = null` (or user text) on any manual save, so an admin-edited row demonstrably loses the tag via an explicit code path in the update handler — not "the UI probably does this" (v1's unspecified inference, fixed).
- Down-script `supabase/rollbacks/0012_down.sql`: `delete from portal_app_config where key in (...); delete from integration_field_maps where notes = 'seed:0012';` — deletes only still-tagged (never-edited) seed rows; edited maps survive by construction.

**Deploy-ordered rollout (code, no migration)**
1. Same PR as 0009: `sfId18` TS twin + patches to `upsertAccount` (accounts.ts) and `importDealsCsv` (normalize before match/store), `startOnboarding` (adopt-by-SF-id + stamp `salesforce_account_id` + emit event), `API_SCOPES` +2, `vercel.json` + `/api/cron/dispatch` (5 min). All behavior-neutral with flags off; reversible by revert.
2. Ship `emitEvent`/`safeCreateAlert`/`recordImplementationCreated`/`recordStageChange` refactor of the three existing writers, ingest route, dispatch cron, admin UI, openapi route — inert while flags are false (outbox rows accumulate harmlessly; dispatch no-ops with zero endpoints).
3. Enable `feature.sf_auto_create` against a test key; verify sync log, adoption behavior against a UI-onboarded account, and the 409/replay branches; then `feature.webhooks_out`; then `feature.sf_write_back` once the Zap + SF custom fields exist; `feature.sf_presale_bridge` and `feature.sf_template_select` independently, last. Flag flips are the per-phase behavioral rollback; the down-scripts exist only for abandoning the schema and carry the data-loss warnings above.

## Risks

- Adoption depends on portal_accounts.salesforce_id being populated: a customer created by startOnboarding from a deal that has NO salesforce_id (manually entered deal) is invisible to SF-id adoption and will still duplicate on first ingest of that account. Mitigation: the 409-adjacent path can't catch this (different key space); the /admin/integrations adopt action and a pre-enablement report (customers with null salesforce_account_id vs. incoming account names) are the manual reconciliation tools. Residual, accepted, and surfaced at flag-flip time.
- Outbox is not transactional over supabase-js REST: a crash between implementation insert and integration_events insert loses the created event. Mitigated (not eliminated) by dispatch-cron pass 3 self-healing sweep for source='salesforce' implementations lacking a created event; non-SF creators (hub manual create, startOnboarding) have no such sweep — their lost events stay lost; consumers must tolerate gaps.
- The sf_supersede_implementation RPC is security definer running as table owner: a bug in it bypasses RLS entirely. Scope is narrow (three updates, one insert) and execute is service-role-only, but it needs the same review rigor as portal_transition_stage.
- Webhook secret KEK (WEBHOOK_SIGNING_KEK env) is a real secret-management obligation on Vercel; rotation requires a re-encrypt job over webhook_endpoint_secrets. Deliberate deviation from the api-key hash pattern because HMAC signing needs the raw secret.
- Zapier write-back has no ground truth: sync log records Zapier's 202, not Salesforce's outcome; a broken Zap looks healthy. No reconciliation possible without SF read access — accepted for Phase 4, revisit when a Connected App exists.
- Vercel function limits: burst events (bulk import) drain at ≤25 deliveries/5min with 10s timeouts; hung endpoints eat the budget. Batch cap and timeout are enforced in code; bulk CSV imports default to emitting no webhook events (config).
- fill_policy='if_blank' remains a footgun even opt-in: an admin enabling it on a field re-opens the silent-fill problem for future replays. Mitigated by the per-fill journal entry + audit row (visible in the implementation timeline) and 'never' defaults on all seeds, but the toggle deserves warning copy.
- Duplicate-meaning surfaces: field_mappings (0003) vs integration_field_maps; journey_* drip (0006) vs WS1 journey templates; and three audit surfaces (audit_log field-level, portal_audit_log action-level, integration_sync_log integration-level). Disambiguation rule documented in the admin UI copy and CLAUDE.md: field-level customer data changes → audit_log; actor actions → portal_audit_log; cross-system exchanges → integration_sync_log.
- Sync-log payload sensitivity: full Opportunity payloads (amounts, emails) readable by every portal_can_manage() user for 90 days. If comp-adjacent amounts are internally sensitive, the select policy must tighten to admin-only (open question #6).
- The startOnboarding/upsertAccount/importDealsCsv patches ship before flags flip and change matching behavior (normalized ids) for the existing presale flow — low risk (normalization is deterministic and the 0009 data-fix aligns stored values) but it is the one pre-flag behavioral change in the rollout and should be verified against production portal_accounts data in staging.
- WS1 sequencing: template selection is dark behind feature.sf_template_select plus a runtime probe for the WS1 RPC. If Phase 4 ships first, every SF implementation lands in the 'needs template' queue with no assignee until Q5 is answered — the queue can silently grow.
- Backfill of decision.se_email into WS2's future assignment model assumes sync-log retention outlives WS2's arrival; with 90-day retention, SE assignments recorded only in pruned logs are gone. If WS2 is more than a quarter out, either extend retention for kind='opportunity.ingest' rows or accept the loss.

## Open questions

- Re-won opportunity against a terminal implementation: is 409 + deduped alert + manual 'Create follow-on' (the sf_supersede_implementation RPC) right, or should certain opportunity_types (e.g. 'Add-On') auto-create a follow-on under the same customer without human review?
- Write-back target and ownership: do GCHub_*__c custom fields go on the Opportunity, the Account, or both — and who at GoCanvas has SF admin rights to create them? Even the Zapier path is blocked if literally nobody can add fields.
- Which 'portal link' is written back: the internal hub URL (do AEs have hub logins?) or a customer-portal link (today per-person magic-link; needs a stable per-implementation share URL from WS4)?
- Should closed-won ingest move the matched presale deal to 'closed_won' automatically (feature.sf_presale_bridge), or stay human/Zapier-driven? (The customer_id deal-link itself is now core and not part of this question.)
- When no default_for rule matches — or WS1 hasn't shipped — implementations land in the 'needs template' triage queue: who owns that queue, and should sf_fallback_template default to the New Logo template instead of 'none'?
- Sync-log retention and visibility: is 90 days right, and may managers see full Opportunity payloads (amounts), or should payload detail be admin-only?
- Do customers.external_id AND implementations.external_ref (0003 line 82) in production actually contain Salesforce ids, and in 15- or 18-char form? This decides whether adopt/backfill is a per-record admin action or a one-time book-wide migration, for BOTH columns — external_ref may already carry opportunity references that should seed salesforce_opportunity_id.
- Webhook endpoint administration: admin-only, or manager self-serve (e.g. a team Slack Zap)? Each endpoint's secret can read every event it subscribes to, including alert payloads.
- Should alert.raised webhooks fire for ALL alert kinds (including existing ticket SLA breaches) or only implementation-lifecycle kinds? Slack noise is a product call.
- fill_policy: is any field a candidate for 'if_blank' at launch (e.g. sf_closed_won_at, amount-derived fields), or should the toggle ship but stay universally 'never' until a concrete need appears?

## Adversarial critique (panel record)

{
  "verdicts": [
    {
      "aspect": "Evidence over inference",
      "verdict": "flawed",
      "reason": "The sync-log/decision-jsonb pattern genuinely satisfies 'computed values show inputs' (template selection records every rule evaluated). But replay null-fill violates the spirit: a Zapier re-fire months later silently writes fields a human deliberately left blank, and the design admits this in its own risks list ('the UI does not currently surface filled-by-replay') yet ships it anyway with only a 'worth a journal entry' hand-wave. A blank left by a human IS recorded state. Same-branch customer null-fill (step 4) has the identical problem. The 0012 rollback trick ('an edited seed row loses the tag via the UI') is unspecified inference about future UI behavior standing in for a real mechanism."
    },
    {
      "aspect": "Every existing URL keeps working",
      "verdict": "sound",
      "reason": "Verified: the design only adds routes (/api/v1/implementations, /admin/integrations/*, /api/v1/openapi.json, /api/cron/dispatch) and never renames or removes any of the existing routes in src/routes/. POST /api/v1/accounts and its contract are untouched. The one caveat — TanStack route-tree collision between the new file-based /admin/integrations children and the existing flat admin.* routes — is a build-time issue, not a URL break."
    },
    {
      "aspect": "Reversible migrations / rollback honesty",
      "verdict": "flawed",
      "reason": "The design cites a 'repo convention: companion -- rollback scripts' that does not exist — grep of supabase/migrations/0001-0008 finds zero rollback/down sections; the convention is invented. Worse, the 0010 rollback ('drop table integration_sync_log; drop table integration_events') destroys the evidence record for every SF-created implementation while leaving those implementations in place — the exact inputs-behind-computed-choices the design brags about become unrecoverable, and the design never says so. 0012's rollback deletes rows 'where notes = seed:0012' but the seed DDL in section 5 never sets that notes value. The DDL itself is additive and safe; the rollback story is dishonest."
    },
    {
      "aspect": "Independently shippable behind a feature flag",
      "verdict": "flawed",
      "reason": "Flags exist and are read server-side, and dark schema-first shipping works. But the flags are not independent in a safe way: with sf_auto_create=on and sf_presale_bridge=off (the documented default), the ingest creates customer+implementation but never sets portal_accounts.customer_id — and startOnboarding() in src/lib/presale.server.ts guards ONLY on account.customer_id, so a human clicking 'Start onboarding' on the same closed-won deal creates a duplicate customer and duplicate implementation. The deal-link write must be part of core auto-create; only the stage transition belongs behind the bridge flag. Also WS1 dependency: 'instantiate via the WS1 instantiation function, pinning template_version' references code and columns (journey_templates.default_for, template_version) that do not exist in 0001-0008, with no interface contract defined — the fallback works, but 'adoptable into a template later' is delegated to WS1 with no mechanism."
    },
    {
      "aspect": "Breakage of existing code paths",
      "verdict": "flawed",
      "reason": "The grounding claim 'nothing post-sale is created' is factually wrong: startOnboarding() (src/lib/presale.server.ts, ~line 447) already creates a customers row (name only, no salesforce_account_id) plus an implementations row + stage-history from the deal page. Because the new endpoint matches customers ONLY on (org_id, salesforce_account_id) and deliberately never name-matches, every account previously onboarded through the UI gets a guaranteed duplicate customer on first SF ingest — the account-level duplication the workstream exists to prevent. More misses: (a) implementations.status real values are 'active' (DDL default, 0003) but startOnboarding writes 'on_track' — the idempotency matrix branches on invented statuses ('closed', 'non-terminal') that don't match production data; (b) implementation.created/stage.changed events are wired only to 'the stage-transition server function', but there are three stage-history writers (hub.server.ts ~1417 manual create, ~1514 transition, presale.server.ts ~497 startOnboarding) and two non-SF implementation creators that would emit nothing — webhook consumers see a partial world; (c) implementations has owner_id (FK team_members) and sales_owner as free text, and NO se_owner column — step 7 resolves se_email 'to team_members' with nowhere to store the result; (d) createAlert() in tickets.server.ts THROWS on insert failure (not the never-throw contract of audit()), so the 409 branch can 500, and it has no dedupe — repeated Zapier re-fires of a re-won opp spam managers with emails (the SLA cron's dedupe idiom queries open alerts first; this design skips it); (e) implementations.external_ref exists and may already hold opportunity references — only customers.external_id got an open question."
    },
    {
      "aspect": "Migration safety — the supersede transaction",
      "verdict": "flawed",
      "reason": "The partial-unique-index-plus-supersede scheme is unimplementable as specified. 'Frees the current slot atomically in one transaction' has a chicken-and-egg ordering: you cannot insert the new implementation with the same opportunity_id while the old row is current (unique indexes are checked per statement and are not deferrable), and you cannot set superseded_by on the old row first because it must point at a row that does not exist yet. And the codebase's data layer is supabase-js REST, which has no multi-statement transactions — the design's own outbox risk admits this, then forgets it here. This needs a Postgres function (the portal_transition_stage precedent exists in 0001) doing insert-without-opp-id → mark old superseded → set opp id, or an is_current boolean. Separately, the integration_events dedupe_key check ('skip enqueue if an undispatched row with the same key exists') is a racy read-then-write with no unique index backing it."
    },
    {
      "aspect": "RLS / authorization",
      "verdict": "flawed",
      "reason": "Two concrete holes. (1) webhook_endpoints_safe: Postgres views in Supabase execute with the owner's privileges by default (security definer semantics) and public-schema views get default grants — without 'with (security_invoker = true)' the view bypasses webhook_endpoints RLS entirely and can leak endpoint names/URLs/event subscriptions to any authenticated principal, including customer-portal users (who ARE role authenticated via customer_users magic-link auth). (2) 'secret_ciphertext is excluded from the UI select list' is not a security boundary: the select policy is portal_can_manage(), and PostgREST lets any client with a passing row policy select any column — every manager can read the ciphertext directly. Needs column privileges or a service-role-only secrets table. Minor: the unauthenticated openapi.json and portal_can_manage read of sync-log payloads (deal amounts) are acknowledged trade-offs, acceptable. The service-role-write / manage-read posture for the new tables does match portal_api_keys precedent — verified in 0002/0005."
    },
    {
      "aspect": "Naming-collision handling",
      "verdict": "sound",
      "reason": "Verified against the schema: field_mappings really exists (0003 line 408, per-implementation customer data mapping) and the design's integration_field_maps rename plus explicit callout is correct; the journey_* drip-email collision (0006) vs WS1 journey_templates is flagged in risks with a UI-copy mitigation. One residual gap — implementations.external_ref and the triple audit surface (audit_log, portal_audit_log, integration_sync_log) get no disambiguation guidance — but the two collisions that would actually cause mis-wiring are handled."
    },
    {
      "aspect": "Definition-of-done / phase fit",
      "verdict": "flawed",
      "reason": "The Phase-2 DoD's item 4 ('both implementations rolled up under one account') is exactly what the customer-matching gap breaks: an add-on opportunity for an account whose customer row was created by startOnboarding, CSV, or manual hub create (none of which set salesforce_account_id) lands on a NEW duplicate customer, so the two implementations never roll up. The design's only remedy is a per-customer manual 'adopt external_id' admin action gated on open question 7, i.e. the happy path requires human data surgery. Brief WS6 requirements themselves: auto-create, idempotency key, account matching on salesforce_account_id, field-map UI, sync log, OpenAPI are all addressed; write-back is honestly scoped to Zapier given zero SF API access, and the 15-vs-18-char normalization risk is correctly identified — but the fix is not applied to the two existing ingest points (importDealsCsv and upsertAccount's salesforce_id match in presale.server.ts/accounts.ts), so the bridge join portal_accounts.salesforce_id = normalized-18-char silently misses on 15-char legacy values, and idempotency remains, in the design's own words, fiction at the seam it depends on."
    }
  ],
  "mustFix": [
    "Reconcile with startOnboarding (src/lib/presale.server.ts): move the portal_accounts.customer_id link into the core sf_auto_create path (bridge flag should gate only the stage transition), make the ingest adopt an existing customer already linked via portal_accounts.salesforce_id before creating one, and stamp salesforce_account_id onto customers created by startOnboarding — otherwise every UI-onboarded account gets a duplicate customer on first SF ingest, and the sf_auto_create-on/bridge-off default lets a human duplicate SF-created records from the deal page.",
    "Replace the 'one transaction' supersede with a Postgres RPC (portal_transition_stage precedent, 0001): the unique partial index is not deferrable, the old row cannot point at a not-yet-existing new row, and supabase-js REST has no transactions. Specify the function: insert new row without opp id → set superseded_by on old → set opp id on new; or switch to an is_current boolean column.",
    "Fix the idempotency status matrix against real data: implementations.status is 'active' (0003 DDL default) but startOnboarding writes 'on_track'; define terminal explicitly as graduations-row-exists OR current_stage='graduate-to-cs' and enumerate the actual status values instead of guessing 'closed'.",
    "Emit implementation.created and stage.changed from ALL writers, not just the SF endpoint: hub manual create (hub.server.ts ~1392-1425), the stage transition function (hub.server.ts ~1504-1520), and startOnboarding (presale.server.ts ~497). Otherwise webhook consumers see only SF-sourced activity.",
    "webhook_endpoints_safe must be created WITH (security_invoker = true) plus explicit grants, and secret_ciphertext must be unreadable by portal_can_manage clients (column privileges or a separate service-role-only table) — a select policy row-passes managers into reading the ciphertext via PostgREST, and a default view bypasses RLS for every authenticated principal including customer-portal users.",
    "Drop the fabricated 'companion -- rollback scripts repo convention' (0001-0008 contain none); write real reversible rollback migrations per the brief, and state explicitly that the 0010 rollback destroys the sync-log evidence for implementations that survive it (require export-first or keep-table). Also make the 0012 seed rows actually set notes='seed:0012', which the section-5 seed DDL omits.",
    "Decide where owner_email/se_email resolution lands: implementations has only owner_id (team_members FK) and sales_owner free text, no se_owner column — either add the columns in 0009 or state that SE assignment is sync-log-only until WS1/WS2.",
    "Wrap the 409-branch createAlert (src/lib/tickets.server.ts throws on failure, unlike audit()) in a never-throw guard, and dedupe sf_rewon_after_completion per opportunity using the SLA cron's open-alert-query idiom — repeated Zapier retries currently 500-risk the handler and email-spam every manager.",
    "Make replay null-fill opt-in per field or record it visibly (audit/journal row surfaced in the implementation UI), not just in decision jsonb — silently writing fields a human left blank months later violates evidence-over-inference.",
    "Back the integration_events dedupe_key check with a unique partial index (dedupe_key) WHERE dispatched_at IS NULL; the proposed read-then-insert is racy.",
    "Apply 18-char SF id normalization to the existing ingest points it depends on — importDealsCsv and the salesforce_id match in upsertAccount (presale.server.ts / lib/server/accounts.ts) — or add a normalized-comparison on the bridge join; otherwise portal_accounts rows holding 15-char ids silently never bridge.",
    "Include implementations.external_ref in the adopt/backfill open question alongside customers.external_id — it exists in 0003 and may already carry opportunity references.",
    "Resolve the WS1 interface concretely: name the instantiation function signature and the template_version column this design pins, and define the 'adopt bare SF-created implementation into a template later' mechanism instead of delegating it to WS1 prose."
  ]
}
