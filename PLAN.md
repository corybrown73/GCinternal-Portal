# GoCanvas Handoff Hub — Architecture (v2)

One product covering the account journey end to end: **presale pipeline → sales-to-implementation handoff → implementation lifecycle → customer-visible onboarding → graduation to CS**, with automations, tickets/SLA, and an open API throughout. Built to standalone-product quality: multi-tenant seams (`org_id` on every table), role-based access, and email-first customer experience.

## Foundation

- **App**: TanStack Start (React + Vite, SSR + server functions), shadcn/ui, IBM Plex design system inherited from the Implementation Path app (its post-sale flow and 12K lines of domain UI are preserved verbatim).
- **Data**: Supabase Postgres/Auth/Storage (project `rqsfxtoojtlxuwrrfrsi`, shared with an unrelated prototype — presale tables carry the `portal_` prefix; hub tables are unprefixed and collision-checked).
- **Deploy**: Vercel (nitro `vercel` preset), hourly cron for SLA + journeys.

## Roles

`super_admin` (2, user-designated — systems, keys, users), `manager` (broad edit + approvals + escalation targets), `sales` (create deals, notes, onboarding plan, start handoff), `implementation` (lifecycle, milestones, tickets), `tam_se` (technical solutions, field mappings, technical notes), `customer` (portal only, magic-link sign-in, invited — never self-registered). Legacy roles (admin/am/se/onboarding) map onto these. First signup = super admin. Internal signup is domain-allowlisted **in a database trigger**; customer invites bypass it deliberately.

## The journey

1. **Pipeline** (`/pipeline`): presale deals (portal_accounts) on a five-stage board — Prospect → Closed Won → Onboarding Kickoff → In Onboarding → Onboarding Complete. Fed by CSV import, the open API (Zapier/Salesforce), or by hand. Gong agent reports attach per deal; Claude generates the branded PPTX **account brief** with discovery questions (template fallback without a key).
2. **Handoff**: "Start onboarding" on a closed-won deal creates the `customers` + `implementations` records, links them to the deal, and moves the deal stage — the structured sales→implementation handoff the research calls the top upstream fix for onboarding failure.
3. **Implementation lifecycle** (preserved from the Implementation Path app): stages handoff → plan-internal → align-external → build → validate-iterate → launch → adopt → graduate-to-cs, with commitments, risks/issues/escalations, milestones, success criteria + observations, technical solutions + field mappings, adoption areas, journal, approvals, and the Home triage queue.
4. **Customer portal** (`/portal`): magic-link sign-in (no passwords for customers), one plan rendered two ways — stage tracker + progress %, "your next steps" with customer-owed items highlighted, and embedded "ask a question" that files a routed ticket.
5. **Tickets** (`/tickets`): category → role routing table, least-loaded assignee, auto-acknowledgement, **24h first-response SLA** with a warning at ~50% elapsed and breach flagging + manager email at 24h (cron), internal notes vs customer-visible replies.
6. **Alerts**: `POST /api/v1/alerts` lets any external system raise an out-of-spec report; severity ≥ warning emails managers. Cron also raises stalled-implementation and overdue-milestone alerts (transition-based, not daily noise).
7. **Journeys** (`/journeys`): drip automation for new logos — ordered steps send a video/doc email; a signed tracked link records the view and **advances to the next step only after engagement** (or a timed delay). Default journey: Welcome → Level 1 → Level 2.

## Open API (`/api/v1`, scoped hashed keys, audit-logged)

accounts upsert (Zapier closed-won hook) · accounts read/list · stage transition · TAM request · ticket create · alert create. Keys minted in Admin, scopes: accounts:read/write, transitions:write, tam:write, tickets:write, alerts:write, reports:write.

## Migrations

`supabase/migrations/`: 0001–0002 presale core (applied) · 0003 hub tables (+`orgs`, org_id everywhere) · 0004 role enum values · 0005 role helpers, customer_users/invites, RLS tightening (customers see only their own rows; internal-only elsewhere) · 0006 tickets/routing/alerts/journeys · 0007 deal→customer link. 0003+ pending application (Supabase MCP outage at build time); apply in order — 0004 must run alone. `seed_demo.sql` loads the Monday walkthrough data.

## Security posture

Service-role key server-only; browser holds publishable key under RLS; all hub server functions require a Supabase bearer token; API keys hashed at rest, shown once, scoped, revocable; TAM/journey links are signed single-purpose JWTs; stage changes forced through an audited SQL funnel; cron endpoints bearer-protected; audit log on every mutation path.
