# GoCanvas Handoff Hub

One portal for the whole account journey: **presale pipeline → sales-to-implementation handoff → implementation lifecycle → customer-visible onboarding → graduation to CS** — with drip-email sequences, routed tickets on a 24h SLA, out-of-spec alerting, and an open API at every stage. Built multi-tenant from day one (`org_id` on every table; GoCanvas is tenant #1).

TanStack Start (React + Vite SSR) · Supabase (Postgres/Auth/Storage) · Vercel. Architecture in `PLAN.md`.

## Roles

| Role | Can |
|---|---|
| `super_admin` (×2, designated in Admin → Users; the **first signup** becomes one) | Everything + API keys, user roles, integrations |
| `manager` | Broad edit, TAM approvals, ticket routing, leadership views, escalation target |
| `sales` | Create deals, Gong notes, onboarding plan, start the handoff |
| `implementation` | Lifecycle, milestones, tickets, sequences |
| `tam_se` | Technical solutions, field mappings, technical notes, tickets |
| `customer` | Customer portal only — magic-link sign-in, invited via **Customer access**, never self-registered |

Internal signup is restricted to `@gocanvas.com` **by a database trigger** (not just the form); customer invites bypass it deliberately.

## One-time setup

### 1. Database — apply pending migrations
Migrations `0001`–`0002` are applied. Apply `0003` → `0008` **in order** in the Supabase SQL editor (Dashboard → SQL), one file per run — **`0004` must run on its own** (it only adds enum values, which Postgres won't let the same transaction use):

`0003_hub_tables.sql` → `0004_roles_and_customers.sql` → `0005_roles_usage.sql` → `0006_tickets_journeys.sql` → `0007_presale_link.sql` → `0008_super_admin_fix.sql` → `0009_rls_profile_exposure.sql` → `0010_account_model.sql` → `0011_portal_implementation_scope.sql` → `0012_sequences_rename.sql` → `0013_journey_templates.sql` → `0014_work_items.sql` → `0015_seed_new_logo_v1.sql` → `0016_seed_more_templates.sql` → `0017_include_when_hardening.sql`

Every migration from 0009 on ships a matching rollback in `supabase/down/`, and CI applies all
migrations then executes every down script up→down→up on a real Postgres — so "reversible" is
demonstrated, not asserted. Rollbacks that would destroy recorded human input (health statements,
issued customer access, authored work items) refuse to run until the data has been exported.

Then optionally run `supabase/seed_demo.sql` for walkthrough data.

### 2. Supabase Auth settings
Authentication → Providers → Email: **Confirm email ON**, min password length 12, leaked-password protection ON. URL Configuration: Site URL = your deployed URL; add `https://<app>/auth/callback` to redirect URLs.

### 3. Deploy (Vercel)
Import the repo (framework: Other; build `npm run build`; the nitro `vercel` preset emits `.vercel/output`). Set env vars from `.env.example` — minimum: the four Supabase vars, `SUPABASE_SERVICE_ROLE_KEY`, `TAM_TOKEN_SECRET`, `CRON_SECRET`, `APP_URL`. Optional: `ANTHROPIC_API_KEY` (AI briefs), `RESEND_API_KEY` + `EMAIL_MODE=send` (real email; otherwise emails print to the function log). `vercel.json` schedules the SLA cron (hourly) and sequence cron (every 30 min).

### 4. First run
Sign up with your `@gocanvas.com` email → verify → you are super admin #1. Designate #2 in **Admin → Users**.

## The flow

- **/pipeline** — deal Kanban (Prospect → Closed Won → Kickoff → In Onboarding → Complete); New deal, CSV import (Salesforce export), drag to move stages (all transitions audited through a SQL funnel).
- **/deals/:id** — Gong agent notes (paste/upload), Claude-generated branded **.pptx account brief** with discovery questions (template fallback without a key), TAM request with one-click email approve/decline (signed, single-use links), sales/onboarding notes, stage history. **Start onboarding** creates the customer + implementation and jumps you into the hub.
- **/customers**, **/technical-solutions**, **/portfolio**, **/** (Home triage) — the Implementation Path hub, unchanged.
- **/tickets** — routed queue (category → role, least-loaded assignee), 24h first-response SLA: warning email at ~12h, breach flag + manager email at 24h, internal notes vs customer replies. Routing table editable at /tickets/routing.
- **/alerts** — everything out-of-spec in one place: SLA breaches, stalled implementations (>14 days in stage), overdue milestones, external reports.
- **/sequences** — drip automation (renamed from Journeys in v2; `/journeys` permanently redirects): steps send a video/doc email with a **tracked link**; the view event advances the enrollment to the next step (or a timed delay does). Seeded "New Logo Welcome" sequence: Welcome → Level 1 → Level 2.
- **/templates** — journey templates: the lifecycle expressed as data. A template *version* is a
  row and a *family* is a key, so publishing a new version leaves the old one untouched and live
  implementations keep the plan they started with. Conditional tasks show the condition that gates
  them in plain English. Behind the `journey_templates` flag.
- **Plan panel** (Customer 360 → Journey) — the stages and work items an implementation is actually
  running. "Waiting on X" names the outstanding predecessor and is computed; an item a person
  *marked* blocked shows separately, so the two never get conflated. Stages whose state was inferred
  during migration rather than observed say so. Behind the `work_items` flag.
- **/access** — invite customer contacts to the portal (magic link, no passwords), see active portal users, revoke.
- **/portal** — what customers see: stage tracker + progress %, next steps (their overdue items highlighted), and "ask a question" that files a routed ticket with a 24h response promise.
- **/admin** — API keys (scoped, hashed, shown once), user roles.

## Open API (`/api/v1`, `Authorization: Bearer gcp_live_…`)

| Endpoint | Scope | Use |
|---|---|---|
| `POST /api/v1/accounts` | accounts:write | Upsert deal — the Zapier/Salesforce closed-won hook |
| `GET /api/v1/accounts[?stage=]`, `GET /api/v1/accounts/:id` | accounts:read | Read deals (`sf_<salesforce_id>` accepted) |
| `POST /api/v1/accounts/:id/transition` | transitions:write | Move a deal's stage |
| `POST /api/v1/tam-requests` | tam:write | File a TAM request (triggers approval email) |
| `POST /api/v1/tickets` | tickets:write | File a ticket from an external system |
| `POST /api/v1/alerts` | alerts:write | **Report something out of spec** — severity ≥ warning emails managers |

Errors: `{ "error": { "code", "message" } }` — 401 bad key, 403 missing scope, 422 validation. Every call audit-logged.

```bash
curl -X POST "$APP/api/v1/accounts" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"salesforce_id":"0061","name":"Acme Mfg","stage":"closed_won","arr":48000}'
curl -X POST "$APP/api/v1/alerts" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"title":"Usage dropped 40% at Corewell","severity":"critical","detail":"Weekly submissions fell from 900 to 540"}'
```

## Enabling Microsoft SSO later (config only)

IT registers the Entra app → configure the Azure provider in Supabase Auth (restrict to tenant) → set `VITE_AUTH_MICROSOFT_ENABLED=true` and redeploy. The button, callback, and domain allowlist already ship.

## Local development

```bash
npm install
cp .env.example .env   # fill in
npm run dev            # http://localhost:3000
```

> The Supabase project is shared with an unrelated prototype: presale tables are `portal_`-prefixed, hub tables are unprefixed (collision-checked), and the app has Supabase Auth + Storage to itself.
