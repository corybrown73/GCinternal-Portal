# Design: Salesforce Integration

> Produced by the v2 Step-0 design panel (workflow wf_f952802b-e7e, 2026-08-29).
> Each design was drafted, adversarially critiqued, and revised. Status: UNREVISED (critique attached).

> **Status note:** the revision agent for this design failed on a session limit, so this is the original design with the adversarial critique attached but NOT yet folded in. Read the critique as open review comments.

# Workstream 6 — Salesforce auto-create, idempotency, write-back, webhooks

## 0. What exists today (grounding)

- **Inbound**: Zapier already POSTs closed-won deals to `POST /api/v1/accounts` (`src/routes/api/v1/accounts.ts` → `upsertAccount` in `src/lib/server/accounts.ts`), which matches on `portal_accounts.salesforce_id` then falls back to case-insensitive name (`ilike`, backed by the unique `lower(name)` index from `0001`). That endpoint touches the **presale** record only; nothing post-sale is created.
- **Auth**: `requireApiKey(req, scope)` in `src/lib/server/api-auth.ts`; keys in `portal_api_keys` with `scopes text[]`, sha256 hash lookup, fire-and-forget `last_used_at`.
- **Audit**: `audit()` → `portal_audit_log` (actor_type user/api_key/email_token/system). Hub-side `audit_log` (0003) is field-level; portal_audit_log is action-level — this workstream uses `portal_audit_log`, matching the API layer's existing habit.
- **Alerts**: `alerts` table (0006) + `createAlert()` in `src/lib/tickets.server` (notify managers, dedupe patterns in `/api/cron/sla`).
- **Cron**: Vercel crons in `vercel.json`, `CRON_SECRET` bearer auth (`cron-auth`), stamped-guard idempotent sweeps.
- **Tenancy**: every table carries `org_id default '00000000-0000-4000-8000-000000000001'`.
- **Dependency on Workstream 1**: `journey_templates.default_for jsonb` is the template-selection input. This design defines the `default_for` rule schema and the selection algorithm, and degrades gracefully (flag-guarded fallback) if Phase 4 ships before/without templates on a given install.

Naming note: the new integration-config table is **`integration_field_maps`**, NOT `field_mappings` — that name is already taken (0003) for per-implementation customer data mapping.

## 1. Identity & idempotency schema

### customers gets a real Salesforce key (account matching, never name)

```sql
alter table customers add column salesforce_account_id text;
-- SF ids arrive as 15-char case-sensitive or 18-char case-safe; we normalize
-- to 18-char on ingest (pure function, sf15to18) and store only the 18 form.
create unique index customers_sf_account_uidx
  on customers (org_id, salesforce_account_id)
  where salesforce_account_id is not null;
```

No automatic backfill from `external_id` — whether that column actually holds SF ids is a production-data question (open question #7). Provide an admin one-off "adopt external_id as salesforce_account_id" action per customer instead of a blind migration.

### implementations get the opportunity key + supersession pointer

```sql
alter table implementations
  add column salesforce_opportunity_id text,          -- 18-char normalized
  add column salesforce_account_id text,              -- denormalized for write-back payloads
  add column sf_closed_won_at timestamptz,            -- from the payload; evidence, never computed
  add column superseded_by_implementation_id uuid
    references implementations (id) on delete set null;

-- THE idempotency constraint: at most one *current* implementation per opportunity.
create unique index implementations_sf_opp_current_uidx
  on implementations (org_id, salesforce_opportunity_id)
  where salesforce_opportunity_id is not null
    and superseded_by_implementation_id is null;
create index implementations_sf_opp_idx on implementations (salesforce_opportunity_id);
```

**Why partial, not plain unique**: a plain unique constraint makes the legitimate "recovery / re-implementation" motion (brief, motions table) impossible to ever attach to the same opportunity. The partial index gives replay-safety for machines while letting a *human* explicitly supersede: creating a follow-on implementation sets `superseded_by_implementation_id` on the old row (pointing at the new one), which frees the "current" slot atomically in one transaction.

### Re-won-opportunity semantics (the behavior matrix for `POST /api/v1/implementations`)

Let `existing` = current (non-superseded) implementation for the normalized opp id:

| State | Behavior | HTTP |
|---|---|---|
| No `existing` | Create customer (by `salesforce_account_id`) if absent, create implementation, instantiate template | `201 {created:true}` |
| `existing.status` active-ish (`active`, anything non-terminal) | **Replay.** No mutation of recorded fields; only null-fill of empty columns (evidence over inference — the API never overwrites what a human recorded). Return existing ids | `200 {created:false, replay:true}` |
| `existing` terminal (`status` closed/`graduations` row present/`current_stage` = graduate-to-cs) | **No auto-duplicate.** Log sync row, `createAlert(kind:'sf_rewon_after_completion', severity:'warning')`, return existing id + machine-readable guidance | `409 {code:'opportunity_already_delivered', existing_implementation_id}` |
| Concurrent double-fire (Zapier retries) | DB unique index wins; on `23505` re-select and fall through to the replay branch | `200` |

The 409 is deliberate: whether a re-won opp is an add-on, a recovery, or an SF hygiene error is a business judgment (open question #1). The alert deep-links to a UI action "Create follow-on implementation", which performs the supersede transaction with a required reason written to `portal_audit_log` and `implementation_stage_history` notes.

`Idempotency-Key` header is also accepted and stored on the sync-log row for request-level dedupe (same key + same body hash within 24h → return cached response), but the *durable* key is the opportunity id — headers protect against network retries, the opp id protects against process retries months apart.

## 2. `POST /api/v1/implementations` — endpoint contract

New file `src/routes/api/v1/implementations.ts`, following the exact shape of `accounts.ts` (dynamic imports, `requireApiKey`, `apiError`). New scopes appended to `API_SCOPES`: `implementations:read`, `implementations:write` (text[] column — no migration; existing keys unaffected until an admin grants the scope in `/admin/api-keys`).

Zod schema (in `src/lib/server/schemas.ts`, alongside `accountUpsertSchema`):

```ts
opportunityIngestSchema = z.object({
  salesforce_opportunity_id: z.string().min(15).max(18),   // normalized server-side to 18
  salesforce_account_id: z.string().min(15).max(18),
  account_name: z.string().min(1),                          // used ONLY to create, never to match
  opportunity_name: z.string().min(1),
  opportunity_type: z.string().optional(),                  // "New Business" | "Add-On" | ...
  stage_name: z.string().optional(),                        // SF stage at time of fire (evidence)
  amount: z.number().nullable().optional(),
  currency: z.string().optional(),
  close_date: z.string().optional(),                        // ISO date
  owner_email: z.string().email().optional(),               // AE
  se_email: z.string().email().optional(),
  line_items: z.array(z.object({
    product_code: z.string(),
    product_name: z.string().optional(),
    quantity: z.number().optional(),
    total_price: z.number().optional(),
    family: z.string().optional(),
  })).default([]),
  raw: z.record(z.string(), z.unknown()).optional(),        // full SF payload passthrough → sync log only
})
```

Pipeline (all inside one server handler; every branch writes an `integration_sync_log` row):

1. Feature flag `feature.sf_auto_create` (a `portal_app_config` row, jsonb `{"enabled":true}`) — off → `503 feature_disabled`. This is the phase-4 kill switch.
2. Normalize both SF ids to 18-char.
3. Apply **inbound field map** (`integration_field_maps`, direction `inbound`, see §5) to translate payload keys → columns; unmapped known fields use the schema defaults above, so the map is an override layer not a prerequisite.
4. Upsert `customers` keyed **only** on `(org_id, salesforce_account_id)`. Update = null-fill only (name/arr/industry/segment fill blanks, never clobber). No name matching — deliberately stricter than presale `upsertAccount`.
5. Idempotency matrix (§1).
6. **Template selection** (§3): evaluate `journey_templates.default_for` against `{line_items, opportunity_type, amount}`. Record the matched rule id + the exact inputs in the sync-log row (evidence: the choice can always show its inputs). Matched → instantiate via the WS1 instantiation function, pinning `template_version`. No match, or templates feature absent → fallback per `portal_app_config['sf_fallback_template']`: either a named template key or `"none"` (create bare implementation at `current_stage='handoff'`, `source='salesforce'`, exactly like today's manual create) — which of these is the default is open question #5.
7. Resolve `owner_email`/`se_email` → `team_members` by email (mirror of `profileIdByEmail`); store unresolved emails in the sync log rather than dropping them.
8. Bridge to presale: if a `portal_accounts` row has `salesforce_id = salesforce_account_id`, set its `customer_id` link (0007 column) and call `portal_transition_stage(..., 'closed_won', 'api', actor_api_key)` — reusing the single stage funnel so history is guaranteed. **No name-fallback on this path.** Flag-guarded (`feature.sf_presale_bridge`) since it changes presale board behavior.
9. Write `implementation_stage_history` seed row (`stage='handoff'` or template's first stage), `audit()` action `implementation.sf_create`, and enqueue outbox event `implementation.created` (§4).
10. Response: `{ implementation: {...}, customer: {...}, template: { id, key, version, matched_rule } | null, created, replay }`.

Also: `GET /api/v1/implementations?salesforce_opportunity_id=&updated_since=` (scope `implementations:read`) so Zapier/scripts can poll — mirrors `GET /accounts`.

## 3. Template auto-selection: `default_for` rule schema

Stored on `journey_templates.default_for` (WS1 table), edited in the template builder; **evaluation logic lives in one pure function** `selectTemplate(rules, inputs)` in `src/lib/server/template-select.ts` so it is unit-testable and reusable by the CSV import later.

```jsonc
// journey_templates.default_for
{
  "priority": 100,                      // higher wins; ties → newest published version
  "match": {
    "product_code_any": ["GC-INT-*", "API-*"],   // glob against line_items[].product_code
    "product_code_all": [],                       // every listed glob must match some line
    "product_family_any": ["Integrations"],
    "opportunity_type_any": ["Add-On", "Existing Business"],
    "min_amount": null, "max_amount": null
  }
}
```

Rules: only `status='published'` templates participate; all present clauses must pass (AND across clauses, OR within `_any` lists); highest priority wins; the winner + every rule evaluated (pass/fail per clause) is stored in the sync log — so "why did this deal get the Integration template?" is answerable from the record, not from re-running code. A read-only "test a payload" box in `/admin/integrations` runs `selectTemplate` against a pasted payload without creating anything.

## 4. Outbound: outbox → webhooks → Zapier write-back

### 4.1 Recommendation: **outbound webhook consumed by Zapier** for Phase 4

Direct SF REST with a Named Credential/Connected App requires an SF admin to provision a Connected App, an integration user, OAuth secrets, and custom fields — the team currently has **zero SF API access** (CSV + Zapier only). Zapier is already trusted in the closed-won direction, "Update Salesforce Record by Id" is a stock Zapier action the ops team can own, and secrets stay inside Zapier. So: Phase 4 write-back = a signed webhook (`salesforce.write_back`) whose payload already carries **SF-shaped field names** (from the outbound field map), so the Zap is a dumb pipe: catch hook → update record by `salesforce_opportunity_id`. The seam is clean: a later `direct_sf_rest` delivery mode is a new dispatcher branch writing to the same `integration_sync_log`, no schema change. Trade-offs recorded: Zapier gives no read-back verification (we log Zapier's 200, not SF's), adds ~seconds latency, and per-task Zapier billing — all acceptable for stage/health/date/link write-back cadence.

### 4.2 Event outbox (single source for webhooks AND write-back)

```sql
create table integration_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  event_type text not null,          -- 'implementation.created','stage.changed','gate.blocked',
                                     -- 'alert.raised','handoff.returned','salesforce.write_back'
  entity_type text not null, entity_id uuid not null,
  implementation_id uuid references implementations (id) on delete set null,
  payload jsonb not null,            -- full event body incl. inputs (evidence)
  dedupe_key text,                   -- e.g. 'wb:{opp_id}:{sha256(fields)}' — skip enqueue if an
                                     -- undispatched row with the same key exists
  created_at timestamptz not null default now(),
  dispatched_at timestamptz
);
create index integration_events_undispatched_idx on integration_events (created_at)
  where dispatched_at is null;
```

`emitEvent()` helper in `src/lib/server/events.ts` (same never-throw contract as `audit()`). Emission points: this endpoint (`implementation.created`); the stage-transition server function that writes `implementation_stage_history` (`stage.changed` — payload includes from/to, actor, note); `createAlert()` in `tickets.server` gains one line (`alert.raised`); WS3's gate override + handoff return call it when they land (`gate.blocked`, `handoff.returned`) — the event layer ships first and those two types simply have no emitters until Phase 3 code calls them. `salesforce.write_back` is emitted whenever a mapped outbound field's value changes (stage change, `health_computed` change, `target/actual_launch_date` edit, creation → portal link), payload = `{salesforce_opportunity_id, salesforce_account_id, fields: {<SF field API name>: value, ...}, inputs: {...}}` built from the outbound field map, deduped via `dedupe_key`.

### 4.3 Webhook endpoints + delivery log

```sql
create table webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  name text not null,
  url text not null,
  secret_hash text not null,          -- sha256, same pattern as portal_api_keys; shown once
  secret_last4 text not null,
  event_types text[] not null default '{}',   -- empty = all
  active boolean not null default true,
  created_by uuid references portal_profiles (id),
  created_at timestamptz not null default now(),
  disabled_at timestamptz, disabled_reason text          -- auto-disable after sustained failure
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
  response_status int, response_body text,     -- truncated to 4KB
  last_error text,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (endpoint_id, event_id)
);
create index webhook_deliveries_due_idx on webhook_deliveries (next_attempt_at)
  where status in ('pending','failed');
```

**Signing** (Stripe-style, verifiable in a Zapier code step): body is the canonical JSON `{id, type, created_at, data}`; headers `X-GCHub-Event-Id`, `X-GCHub-Event-Type`, `X-GCHub-Timestamp`, `X-GCHub-Signature: v1=hex(hmac_sha256(secret, "{timestamp}.{body}"))`. Receivers reject if |now − timestamp| > 5 min. The raw secret is generated with the existing `generateApiKey`-style helper (`whsec_` prefix), displayed once, stored hashed. **Because only the hash is stored, signing needs the raw secret at dispatch time — so the secret is stored encrypted, not hashed**: `secret_ciphertext` (AES-256-GCM under env `WEBHOOK_SIGNING_KEK`), with `secret_last4` for display. (This is the one place the api-key pattern can't be copied verbatim; a webhook signer must be able to recover the secret.)

**Dispatch**: new cron `/api/cron/dispatch` every 5 min (`vercel.json` addition), guarded by `authenticateCronRequest` like `/api/cron/sla`. Pass 1: fan out undispatched `integration_events` → one `webhook_deliveries` row per active endpoint whose `event_types` matches, stamp `dispatched_at` (stamped-guard, same concurrency idiom as the SLA sweep). Pass 2: POST due deliveries (batch ≤ 25, 10s timeout each, ordered by `next_attempt_at`) — 2xx → `succeeded`; else `failed`, `attempt+1`, backoff schedule `1m, 5m, 30m, 2h, 6h, 24h`; after 6 attempts → `exhausted` + `createAlert(kind:'webhook_exhausted', severity:'warning')`. An endpoint with 20 consecutive exhaustions auto-disables (`disabled_reason`) + critical alert. Manual **redeliver** button creates a fresh pending delivery row (new attempt chain), preserving the failed one as history.

**Ordering caveat documented in the API docs**: delivery is at-least-once and not order-guaranteed; consumers must treat `created_at` + entity id as the ordering key.

## 5. Field-mapping UI + sync log (`/admin/integrations`)

```sql
create table integration_field_maps (        -- NOT 'field_mappings' (taken, 0003)
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  provider text not null default 'salesforce',
  direction text not null check (direction in ('inbound','outbound')),
  source_path text not null,     -- inbound: JSON path in payload ('raw.StageName');
                                 -- outbound: hub field key ('current_stage','health_computed',
                                 --   'target_launch_date','actual_launch_date','portal_url')
  target_field text not null,    -- inbound: hub column; outbound: SF field API name
                                 --   ('GCHub_Stage__c', 'GCHub_Health__c', ...)
  transform text,                -- 'none'|'date'|'number'|'stage_label'|'lowercase' (fixed menu,
                                 --   pure functions in src/lib/server/transforms.ts — no eval)
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
  kind text not null,                 -- 'opportunity.ingest','write_back.dispatch','replay',...
  external_id text,                   -- opp id / account id
  implementation_id uuid references implementations (id) on delete set null,
  customer_id uuid references customers (id) on delete set null,
  api_key_id uuid references portal_api_keys (id),
  idempotency_key text,
  request_payload jsonb,              -- full inbound body / outbound event body
  decision jsonb,                     -- matched template rule, idempotency branch, mapped fields
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

**Retry**: a failed/rejected *inbound* row gets a "Re-run" button that re-executes the pipeline against the stored `request_payload` (safe because of §1 idempotency), writing a new row with `retried_from_id`. Outbound retry = webhook redeliver (§4).

**UI surfaces** (all under existing `/admin` shell, gated `portal_can_manage()` read / admin write, next to `admin.api-keys.tsx`):
- `/admin/integrations` — status cards (last inbound, last write-back, failures last 7d), feature-flag toggles (writing `portal_app_config` rows `feature.sf_auto_create`, `feature.sf_write_back`, `feature.webhooks_out`, `feature.sf_presale_bridge`).
- `/admin/integrations/field-maps` — table editor per direction, transform dropdown, "test with sample payload" preview showing mapped output (and, inbound, the template-selection result).
- `/admin/integrations/sync-log` — filterable list, row detail with pretty-printed payload + decision, re-run button.
- `/admin/integrations/webhooks` — endpoint CRUD (secret shown once), per-endpoint delivery log, redeliver, "send test event".
- Seeded defaults (migration seed, `on conflict do nothing`): the six outbound rows (stage, computed health, target/actual launch, portal_url → `GCHub_*__c`) and inbound identity rows, so the UI starts populated and the hardcoded-map smell never exists.

## 6. OpenAPI at `/api/v1/openapi.json`

TanStack Start file routes have no route-schema introspection, so generation is **schema-first from the Zod objects that already validate every body** (`src/lib/server/schemas.ts`, `createAlertBody`, etc.):

- Add `@asteasolutions/zod-to-openapi` (dev-adjacent runtime dep; it *replaces* a hand-maintained duplicate spec that would drift — the brief's new-dependency rule satisfied). Zod is already the validator, so request/response shapes stay single-sourced.
- `src/lib/server/openapi.ts`: a registry module that imports each route's zod schemas + a small per-route metadata object (method, path, scope, description, response schemas incl. the `apiError` envelope `{error:{code,message}}` and the documented error codes), builds the `OpenAPIObject` once at module load, caches it.
- Route file `src/routes/api/v1/openapi[.]json.ts` (TanStack's `[.]` escape for a literal dot) serving the cached JSON, **no auth** (the spec is not secret; keys are), `Cache-Control: public, max-age=300`.
- Security scheme: `bearerAuth` + `x-api-key`, with per-operation `x-required-scope` extension so docs show which scope each call needs.
- Docs page `/api/v1/docs`: server-rendered page loading Scalar or Stoplight Elements from cdnjs against `/api/v1/openapi.json` — zero build-time deps.
- CI check: a vitest test that builds the spec and validates it (the registry throws on duplicate paths), plus one golden-file assertion so spec changes show up in PR diffs.
- Webhook event shapes are documented in the same spec via `webhooks`/`callbacks` objects (OpenAPI 3.1), so Slack/Zapier consumers read one document.

## 7. RLS & security summary

- New tables: RLS enabled; `select` for `portal_can_manage()` (managers see sync health), all writes via service-role only (no insert/update/delete policies for `authenticated`) — matching the `portal_api_keys`/`portal_audit_log` posture. `webhook_endpoints.secret_ciphertext` is excluded from the UI select list; only `secret_last4` renders.
- The ingest endpoint runs on `supabaseAdmin` (service role) like the rest of `/api/v1` — RLS is not the guard there; scope checks + zod are.
- Sync-log payloads contain deal amounts and contact emails → retention job in the dispatch cron: prune `integration_sync_log`/`webhook_deliveries` older than N days (config row `integration.log_retention_days`, default 90 — confirm, open question #6).

## 8. Feature flags / phase shipping

All of Phase 4 WS6 ships dark behind four `portal_app_config` rows (checked server-side per request; env var `SF_INTEGRATION_DISABLED=1` as a global emergency override): `feature.sf_auto_create`, `feature.webhooks_out`, `feature.sf_write_back`, `feature.sf_presale_bridge`. Migrations are additive-only (new columns nullable, new tables), so the schema can land well before enablement, and rollback never touches existing rows.

## Proposed migrations

Numbered continuing from 0008; each file is additive and independently reversible. Rollbacks are written as companion `-- rollback` scripts (repo convention: never edit a shipped migration; the rollback is a new numbered migration if it ever runs in prod).

**0009_sf_identity.sql**
- `alter table customers add column salesforce_account_id text;`
- `create unique index customers_sf_account_uidx on customers (org_id, salesforce_account_id) where salesforce_account_id is not null;`
- `alter table implementations add column salesforce_opportunity_id text, add column salesforce_account_id text, add column sf_closed_won_at timestamptz, add column superseded_by_implementation_id uuid references implementations (id) on delete set null;`
- `create unique index implementations_sf_opp_current_uidx on implementations (org_id, salesforce_opportunity_id) where salesforce_opportunity_id is not null and superseded_by_implementation_id is null;`
- `create index implementations_sf_opp_idx on implementations (salesforce_opportunity_id);`
- Rollback: drop the three indexes, then `alter table implementations drop column superseded_by_implementation_id, drop column sf_closed_won_at, drop column salesforce_account_id, drop column salesforce_opportunity_id; alter table customers drop column salesforce_account_id;` (safe: columns nullable, no data loss for pre-existing rows).

**0010_integration_core.sql**
- `create table integration_events (...)` + partial index on undispatched (DDL in design §4.2).
- `create table integration_sync_log (...)` + `external_id` and failed-status indexes (design §5).
- `create table integration_field_maps (...)` + unique (org, provider, direction, source_path, target_field).
- RLS: enable on all three; `create policy "<t> manage select" ... using (portal_can_manage());` — no write policies (service-role only).
- Rollback: `drop table integration_field_maps; drop table integration_sync_log; drop table integration_events;` (order irrelevant — no cross-FKs between them; sync_log self-FK cascades on drop).

**0011_webhooks.sql**
- `create table webhook_endpoints (...)` with `secret_ciphertext text not null`, `secret_last4 text not null` (design §4.3, encrypted-not-hashed note).
- `create table webhook_deliveries (...)` + `unique (endpoint_id, event_id)` + due-partial-index.
- RLS: enable; select for `portal_can_manage()`; a column-restricted view `webhook_endpoints_safe` (no ciphertext) if the UI reads via authenticated client rather than server loader.
- Rollback: `drop view if exists webhook_endpoints_safe; drop table webhook_deliveries; drop table webhook_endpoints;`

**0012_integration_seeds.sql**
- Insert `portal_app_config` rows (all `{"enabled": false}`): `feature.sf_auto_create`, `feature.webhooks_out`, `feature.sf_write_back`, `feature.sf_presale_bridge`; plus `sf_fallback_template` (`"none"` until PO answers Q5) and `integration.log_retention_days` (`90`). All `on conflict (key) do nothing`.
- Seed default `integration_field_maps` rows: outbound (`current_stage→GCHub_Stage__c` transform `stage_label`, `health_computed→GCHub_Health__c`, `target_launch_date→GCHub_Target_Launch__c` transform `date`, `actual_launch_date→GCHub_Actual_Launch__c` transform `date`, `portal_url→GCHub_Portal_Link__c`) and inbound identity rows for the `opportunityIngestSchema` fields. `on conflict do nothing`.
- Rollback: `delete from portal_app_config where key in (...); delete from integration_field_maps where notes = 'seed:0012';` (seed rows tagged via `notes` so the rollback never deletes admin-edited maps — an edited seed row loses the tag via the UI).

**Deploy-ordered rollout (code, no migration)**
1. Extend `API_SCOPES` in `src/lib/server/api-auth.ts` (+2 scopes) and `vercel.json` (+ `/api/cron/dispatch` every 5 min). Reversible by revert.
2. Ship `emitEvent`, ingest route, dispatch cron, admin UI, openapi route — all inert while flags are false.
3. Enable `feature.sf_auto_create` with Zapier pointed at a test key; verify sync log; then `feature.webhooks_out`; then `feature.sf_write_back` once the Zap + SF custom fields exist. Each flag flips independently and instantly (config row), which is the per-phase rollback for behavior; the SQL rollbacks above are only for abandoning the schema.

## Risks

- Presale name-fallback contamination: upsertAccount (src/lib/server/accounts.ts) still matches portal_accounts by lower(name) when salesforce_id misses; if the same Zap feeds both /api/v1/accounts and the new endpoint, a renamed SF account can link the wrong presale record to a customer. The new endpoint never name-matches, but the bridge step inherits presale data quality — mitigated by matching the bridge strictly on portal_accounts.salesforce_id.
- SF 15-vs-18-char ID mismatch: CSV exports emit 15-char case-sensitive ids, API/Zapier usually 18-char. Without normalization the unique index silently permits duplicates (15 and 18 forms of the same opp). Normalization to 18 must be applied everywhere ids enter (ingest, CSV import, admin adopt-external_id action) or idempotency is fiction.
- Outbox is not transactional: Supabase REST calls are separate statements, so a crash between implementation insert and integration_events insert loses the implementation.created event (at-least-once only from the event row onward). Mitigation: dispatch cron also sweeps for implementations with source='salesforce' lacking a created event (self-healing pass); consumers must tolerate late events.
- Webhook secret storage is encrypted, not hashed, because HMAC signing needs the raw secret — WEBHOOK_SIGNING_KEK becomes a real secret-management obligation on Vercel; KEK rotation requires a re-encrypt job. This is a deliberate deviation from the api-key hash pattern and should be called out in review.
- Zapier write-back gives no ground-truth confirmation: the sync log records Zapier's 202, not Salesforce's result; a broken Zap looks healthy from our side. Mitigation: a low-frequency reconciliation is impossible without SF read access — accept the gap for phase 4, revisit when a Connected App exists.
- Vercel cron/function limits: 5-minute dispatch cadence + 10s per delivery + batch cap 25 means a burst (bulk import firing hundreds of events) drains slowly and can exceed function duration if endpoints hang; batch size and timeout must be enforced, and bulk CSV imports should default to emitting no webhook events (config decision).
- Duplicate-meaning tables invite mis-wiring: field_mappings (0003, per-implementation customer data) vs integration_field_maps, and 'Journeys' (email drip) vs journey templates (WS1). Code review checklist item, and the admin UI copy must say 'Salesforce field mapping' explicitly.
- Sync-log payload sensitivity: full Opportunity payloads (amounts, contact emails) land in integration_sync_log readable by every portal_can_manage() user and retained 90 days by default; if sales comp data is sensitive internally this needs an admin-only policy instead.
- Replay null-fill semantics can surprise: a re-fired Zap months later will fill columns a human deliberately left blank (e.g. se_owner). The decision jsonb records exactly which fields were filled, but the UI does not currently surface 'filled by replay' — worth a journal entry per replay.
- WS1 sequencing: template auto-selection depends on journey_templates.default_for existing (Phase 2). The flag-guarded fallback path (bare implementation at 'handoff') keeps WS6 shippable independently, but if Phase 4 ships first, every SF-created implementation lands template-less and must be adoptable into a template later — WS1's migration must handle source='salesforce' rows the same as legacy rows.

## Open questions

- Re-won opportunity against a completed implementation: is the 409-plus-alert-plus-manual-follow-on flow right, or should certain opportunity_types (e.g. 'Add-On') auto-create a new implementation under the same customer without human review?
- Write-back target and ownership: do the custom fields (GCHub_Stage__c etc.) go on the Opportunity, the Account, or both — and who inside GoCanvas has the SF admin rights to create them? (Even the Zapier path needs someone to add fields; if literally no one can, write-back is blocked regardless of mechanism.)
- Which 'portal link' gets written back to Salesforce: the internal hub URL (do AEs have hub logins?), or a customer-portal share link (which is per-person magic-link today and would need a stable per-implementation share URL from WS4)?
- Should closed-won ingest automatically move the matching presale portal_accounts record to 'closed_won' (the feature.sf_presale_bridge behavior), or does the sales ops team want to keep presale stage moves human/Zapier-only?
- When no default_for rule matches the line items, should the implementation be created on the New Logo template by default, or created bare and parked in a 'needs template' triage state that someone owns? (Who is that someone?)
- Retention and visibility for integration sync-log payloads: is 90 days right, and may managers see full Opportunity payloads (amounts) or should payload detail be admin-only?
- Does customers.external_id in production actually contain Salesforce Account IDs (and in 15- or 18-char form)? This decides whether the one-off adopt/backfill action is offered per-customer or run once across the book.
- Webhook endpoint administration: admin-only, or may managers self-serve endpoints (e.g. a team Slack Zap)? Each endpoint's secret can read every event including alert payloads.
- Do you want alert.raised webhooks to fire for ALL alert kinds (including ticket SLA breaches from the existing cron), or only implementation-lifecycle kinds? Slack noise level is a product call.

## Adversarial critique (panel record)

{
  "verdicts": [
    {
      "aspect": "Evidence over inference (brief non-negotiable)",
      "verdict": "flawed",
      "reason": "The template-selection decision ('why did this deal get the Integration template?') and the SF line items live ONLY in integration_sync_log, which the design's own retention job prunes at 90 days — after that the computed choice can no longer show its inputs, directly violating 'every computed value must show its inputs on demand'. Line items are also never persisted anywhere durable, yet WS1's include_when conditional tasks and later template drift pull-in are specified by the brief to evaluate against SF line-item data. Replay null-fill writing machine values into human-editable columns with no UI provenance is acknowledged in the risks list but not fixed. Credit: sf_closed_won_at as recorded evidence, never overwriting recorded fields, and logging every rule evaluation are genuinely in the right spirit."
    },
    {
      "aspect": "Every existing URL keeps working",
      "verdict": "sound",
      "reason": "All routes are additive (/api/v1/implementations, /admin/integrations/*, /api/v1/openapi.json, /api/cron/dispatch); nothing existing is moved or removed. Verified against src/routes — no conflicts with existing admin.* or api/v1/* files."
    },
    {
      "aspect": "Reversible migrations / rollback honesty",
      "verdict": "flawed",
      "reason": "Three dishonest or wrong claims. (a) 0010's rollback says 'order irrelevant — no cross-FKs', but 0011's webhook_deliveries has an FK to integration_events, so dropping 0010's tables with 0011 in place fails; 0011 must roll back first. (b) 0009's rollback claim 'no data loss for pre-existing rows' hides the real cost: once ingest has run, dropping salesforce_opportunity_id orphans every SF-created implementation and destroys the idempotency key — re-running Zapier after a re-apply duplicates the entire book. Rollback is only safe pre-enablement and the design doesn't say so. (c) Dropping integration_sync_log destroys the inbound evidence trail the design elsewhere leans on. Also the repo has no 'companion -- rollback script' convention — no existing migration contains one — so that claimed convention is invented."
    },
    {
      "aspect": "Feature-flag / independently shippable",
      "verdict": "flawed",
      "reason": "The flag story covers the ingest endpoint but not the event layer: emitEvent instrumentation in advanceStage and createAlert runs unconditionally once deployed, integration_events has NO retention (the prune job covers only sync_log and webhook_deliveries) and no flag gate, so months of events accumulate while feature.webhooks_out is off, then pass-1 fan-out floods every newly-registered endpoint with the entire backlog the moment the flag flips. Also 503 on flag-off makes Zapier mark tasks as errored and retry — the shipped-dark state generates noise in the very system it integrates with. Minor: portal_app_config has an UPDATE-only admin policy (no INSERT), so the flag UI works only because 0012 seeds every row — true but never stated as a constraint."
    },
    {
      "aspect": "Breakage of existing code paths",
      "verdict": "flawed",
      "reason": "The biggest miss in the design: startOnboarding() in src/lib/presale.server.ts already implements human-triggered closed-won conversion — it creates a customer by NAME with no salesforce_account_id, creates an implementation with status 'on_track', and links portal_accounts.customer_id. The design never mentions it. Human clicks the button, Zapier fires the new endpoint (or vice versa) → two customers and two implementations for one deal, and the bridge step's customer_id write collides with the existing link. Second: the presale bridge calls portal_transition_stage(..., 'closed_won') but that function (0001) has no forward-only guard — a deal a human already moved to onboarding_kickoff/in_onboarding gets regressed to closed_won on the presale board. Third: the idempotency matrix reads implementations.status as a lifecycle field ('active'/'closed'); in the actual code status holds HEALTH values — 'on_track', 'at_risk', 'blocked', 'idle' (hub-format.ts:85, startOnboarding writes 'on_track') — so the 'terminal status' branch tests values that never occur. Fourth: step 7 resolves owner/se emails but implementations has only owner_id (FK team_members) and sales_owner (text) — there is no se_owner column and 0009 doesn't add one; the design's own risks list even references a nonexistent 'se_owner' column."
    },
    {
      "aspect": "Migration safety",
      "verdict": "sound",
      "reason": "The DDL itself is safe: additive nullable columns, new tables, partial unique indexes created against presumably tiny tables (no concurrent-index concern at this scale), seeds with on-conflict-do-nothing, correct avoidance of a plain unique on salesforce_opportunity_id. The problems are in the rollback story (scored separately) and in one mechanism claim: the supersede flow 'frees the current slot atomically in one transaction' cannot work in the order described — partial unique INDEXES are enforced per-statement and can never be deferrable in Postgres, so inserting the follow-on row with the opp id while the old row is still current raises 23505. It is fixable (insert new with NULL opp id → point old.superseded_by at new → set new opp id) but the design as written specifies an impossible transaction."
    },
    {
      "aspect": "RLS / authorization",
      "verdict": "flawed",
      "reason": "Two real holes. (1) Customer-portal leak: RLS policy 'implementations customer select' (0005) plus portal.server.ts:125 ('.in(customer_id, customerIds)') means every SF-auto-created implementation for an existing customer is INSTANTLY visible to that customer's portal users — a 3am Zapier-created record with a raw SF opportunity name appears in the customer-facing portal before any human reviews it. The design never addresses portal visibility of auto-created rows. (2) webhook_endpoints gets a portal_can_manage() SELECT policy while holding secret_ciphertext; 'excluded from the UI select list' and an optional _safe view are not a boundary — any manager can read the ciphertext column directly via PostgREST on the base table. Needs no-authenticated-select or a column-level REVOKE. Also self-flagged but unresolved: managers reading full Opportunity payloads (deal amounts) in the sync log. The service-role ingest posture itself correctly matches the existing /api/v1 pattern."
    },
    {
      "aspect": "Naming-collision handling",
      "verdict": "sound",
      "reason": "Verified: field_mappings genuinely exists in 0003 (per-implementation customer data mapping, plus an updateFieldMapping function in hub.server.ts), so integration_field_maps is a necessary and correctly-flagged rename; audit_log vs portal_audit_log is resolved correctly in favor of the API layer's habit; new scopes don't collide with API_SCOPES; integration_events/webhook_* are clean. One gap keeps this from being fully clean: the design builds on 'journey_templates.default_for' while 0006's email-drip tables are journeys/journey_steps/journey_enrollments — the design notes the confusion as a review-checklist risk but doesn't require the brief's Phase-1 rename (Sequences/Campaigns) to land before a table literally named journey_templates ships next to journeys."
    },
    {
      "aspect": "Phase-2 definition-of-done compatibility (brief DoD + WS8 tests)",
      "verdict": "flawed",
      "reason": "The partial unique index correctly permits DoD item 2 (second implementation under one account), and defining the default_for rule schema + a pure selectTemplate() with a test box is a good WS1 seam. But: (a) because line items are not persisted on the implementation, WS1's conditional-task evaluation and the v1→v2 'pull this task in' drift flow cannot re-evaluate include_when against SF product data for SF-created records once the sync log is pruned; (b) WS8 explicitly requires tests for 'the Salesforce idempotency path' — the design specifies tests only for selectTemplate and the OpenAPI golden file, none for replay/concurrent-23505/supersede/re-won-409; (c) the write-back map seeds health_computed and portal_url, columns/concepts that don't exist until WS5 and WS4 respectively — the design declares its WS1 dependency but is silent that write-back is equally gated on two other Phase 3/4 workstreams, and names no emitter for date/health edits (the actual edit path is the generic updateImplementation(id, patch) in hub.server.ts, which the design never instruments)."
    }
  ],
  "mustFix": [
    "Reconcile with startOnboarding() in src/lib/presale.server.ts: it already creates a name-keyed customer (no salesforce_account_id) + implementation at closed-won and sets portal_accounts.customer_id. The ingest pipeline must adopt an already-linked customer (stamp salesforce_account_id onto it) instead of inserting a duplicate, and startOnboarding must be taught to reuse/stamp SF ids — otherwise the human path and the Zapier path create two customers and two implementations per deal.",
    "Make the presale bridge forward-only and create-branch-only: portal_transition_stage has no direction guard, so calling it with 'closed_won' regresses deals a human already moved to onboarding_kickoff/in_onboarding; startOnboarding's 'only forward, never backward' check is the pattern to copy.",
    "Rewrite the idempotency matrix's terminal/active detection to use current_stage ('graduate-to-cs') and the graduations table exclusively. implementations.status holds health values ('on_track','at_risk','blocked','idle'); 'active' and 'closed' never occur in app writes.",
    "Close the customer-portal leak: SF-auto-created implementations for existing customers are instantly visible to customer_users via RLS ('implementations customer select', 0005) and portal.server.ts's unfiltered per-customer listing. Create ingested rows in a portal-hidden state (e.g. a visibility/reviewed flag the portal query and RLS respect) until a human publishes them.",
    "Persist the template-selection decision (matched rule, inputs, version) and the SF line items durably on/under the implementation, not solely in integration_sync_log — the 90-day prune deletes the evidence the brief requires computed choices to show, and WS1's include_when and drift pull-in need the line items later.",
    "Gate or bound integration_events: either suppress emission while feature.webhooks_out is off, or add expiry/retention for undispatched events, and make pass-1 fan-out skip events older than endpoint registration — otherwise flipping the flag replays months of backlog into every endpoint, and the table grows unbounded (the retention job covers only sync_log and webhook_deliveries).",
    "Fix the supersede transaction: a partial unique index is enforced per-statement and can never be deferrable, so 'insert follow-on, then mark old superseded' raises 23505. Specify the working order: insert new row with NULL salesforce_opportunity_id, update old.superseded_by_implementation_id, then set the opp id on the new row, all in one transaction.",
    "Resolve the §4.3 contradiction (DDL says secret_hash not null; the prose and migration 0011 say secret_ciphertext) and remove the authenticated SELECT path to the ciphertext: no portal_can_manage() select policy on webhook_endpoints (server-loader via service role only) or a column-level REVOKE — a 'safe view' does not restrict the base table under PostgREST.",
    "Correct the rollback claims: 0011 must be rolled back before 0010 (webhook_deliveries FK → integration_events makes 'order irrelevant' false); state explicitly that 0009's rollback is only safe before enablement, since dropping salesforce_opportunity_id after ingest orphans SF-created implementations and re-running Zapier then duplicates them all.",
    "Define where owner_email/se_email actually land: implementations has owner_id (FK team_members) and sales_owner (text) only — there is no se_owner column and 0009 doesn't add one. Either add the columns in 0009 or delete the resolution step from the pipeline and the 'se_owner' reference from the risks list.",
    "Add the WS8-mandated tests for the Salesforce idempotency path: replay returns 200/created:false, concurrent double-fire resolves via 23505 re-select, re-won-after-terminal returns 409, supersede frees the slot, and normalization treats 15- and 18-char ids as one opportunity.",
    "Name the write-back emitters and dependencies: instrument updateImplementation(id, patch) in src/lib/hub.server.ts for target/actual_launch_date changes, declare that health_computed write-back is dead until WS5 ships the column and portal_url until WS4 ships a stable share URL, and define seed-map behavior (skip, not fail) when a mapped hub field does not exist yet."
  ]
}
