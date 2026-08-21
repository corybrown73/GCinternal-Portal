# GCinternal-Portal — Implementation Plan

Internal sales → post-sales handoff portal for GoCanvas. A single Next.js app (App Router, TypeScript) on Vercel, backed by a dedicated Supabase project (Postgres + Auth + Storage), with a public REST API for integrations, Claude-powered Account Brief generation (PPTX), and an email-driven TAM approval workflow.

## Product scope

1. **Account lifecycle tracking** — accounts move through: Prospect → Closed Won → Onboarding Kickoff → In Onboarding → Onboarding Complete. Kanban pipeline board with full stage history.
2. **Open API** — every stage transition and account upsert is triggerable by external tools (Zapier, Salesforce, the Gong agent) via REST with per-integration scoped API keys.
3. **Gong report ingestion** — paste/upload the Gong agent's call-notes report per account; post-onboarding "account map" stored the same way.
4. **Account Brief generation** — Gong notes + account data → GoCanvas-branded short PPTX plus discovery questions / process gaps for the implementation team. LLM-synthesized (Claude) with a deterministic template fallback.
5. **TAM request workflow** — AM submits a web form; manager gets an email with signed one-click Approve/Decline links (no inbound email parsing, no Slack yet); status visible in the portal.
6. **Onboarding notes** — onboarding team adds notes with a needs-review/reviewed state.
7. **Auth** — email/password (Supabase Auth), signup restricted to @gocanvas.com, email verification required. "Sign in with Microsoft" button is built but disabled behind `NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED` until IT approves the Entra app registration — enabling SSO later is pure configuration.

## Stack decisions

| Concern | Choice |
|---|---|
| Framework | Next.js 15, App Router, TypeScript, `src/` dir |
| UI | Tailwind CSS 4 + shadcn/ui; `@dnd-kit` for the Kanban board |
| DB access | `@supabase/supabase-js` + `@supabase/ssr`; no ORM; RLS is the authorization layer; generated types in `src/lib/database.types.ts` |
| Auth | Supabase Auth email+password (verification on, min length 12, leaked-password protection, domain allowlist) + flag-gated Azure/Entra OAuth |
| Migrations | SQL files in `supabase/migrations/`, applied via Supabase CLI or MCP |
| Validation | `zod` — shared schemas for API payloads and LLM structured output |
| PPTX | `pptxgenjs` (pure JS, Node serverless-safe, in-memory buffer) |
| LLM | `@anthropic-ai/sdk`, `claude-opus-5`, structured output validated against the zod BriefJSON schema; template fallback when key unset or call fails |
| Email | `resend` SDK; `EMAIL_MODE=log\|send` for keyless local testing |
| Tokens | `jose` HS256 JWTs for approve/decline links; `crypto.randomBytes` + SHA-256 for API keys |
| CSV | `papaparse` server-side |

**Env vars** — server-only: `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `TAM_TOKEN_SECRET`, `APP_URL`, `ALLOWED_EMAIL_DOMAINS=gocanvas.com`. Public: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED=false`.

**Vercel** — brief-generation route uses `runtime = "nodejs"` and `maxDuration = 300` (LLM call is the long pole; pptx build <1s).

## Data model

Enums: `account_stage`, `transition_source` (`ui|api|csv_import|system`), `user_role` (`admin|am|se|onboarding`), `tam_status`, `brief_status`, `brief_generator` (`llm|template`), `gong_report_type` (`call_notes|account_map`), `note_review_status`.

Tables (UUID PKs, `created_at` defaults):

- **profiles** — mirrors `auth.users`; `email`, `full_name`, `role`. Created by `handle_new_user()` trigger which **enforces the domain allowlist in the database** (covers password signup now and OAuth later).
- **accounts** — `name`, `domain`, `salesforce_id` (unique, upsert key), `stage`, `arr`, `products[]`, `am_owner_id`, `se_owner_id`, `summary`, `stage_entered_at`. Upsert precedence: `salesforce_id` → `lower(name)`.
- **stage_transitions** — append-only history: `from_stage`, `to_stage`, `source`, `actor_profile_id`, `actor_api_key_id`, `note`, `occurred_at`. All stage changes go through one security-definer function `transition_account_stage(...)` — UI, API, and CSV import share it, guaranteeing history. A trigger blocks direct `accounts.stage` writes.
- **gong_reports** — `report_type`, `title`, `content_md`, `uploaded_by`. `account_map` type is the post-onboarding planning doc, pinned in UI.
- **briefs** — `status`, `generator`, `structured_json` (validated BriefJSON), `pptx_storage_path`, `source_report_ids[]`, `error`.
- **tam_requests** — `requested_by`, `justification`, `urgency`, `status`, `token_jti` (single-use link guard), `decided_at`, `decided_via` (`email|portal`), `decision_note`.
- **onboarding_notes** — `body_md`, `review_status`, `reviewed_by`, `reviewed_at`.
- **api_keys** — `name`, `key_prefix` (display), `key_hash` (SHA-256), `scopes[]` (`accounts:read`, `accounts:write`, `transitions:write`, `tam:write`), `last_used_at`, `revoked_at`. Plaintext `gcp_live_` + 32 bytes base64url, shown once.
- **audit_log** — append-only; every API call, transition, decision, key event.

Storage buckets (private, service-role writes, signed-URL downloads): `briefs/{account_id}/{brief_id}.pptx`, `uploads/` for raw CSVs/markdown.

RLS: enabled everywhere; authenticated employees read all (internal tool), write core tables, cannot delete (admins only), cannot touch `api_keys`/`audit_log`/`stage_transitions` directly. Service-role client isolated in `src/lib/supabase/admin.ts` with `import "server-only"`.

## API design

### Public `/api/v1/*` — `Authorization: Bearer gcp_live_...`

- `POST /api/v1/accounts` (scope `accounts:write`) — upsert by `salesforce_id` or name; optional `stage` records a transition. This is the Zapier closed-won hook.
- `POST /api/v1/accounts/{id}/transition` (scope `transitions:write`) — `{ to_stage, note?, occurred_at? }`; `{id}` accepts portal UUID or `sf_<salesforce_id>`.
- `POST /api/v1/tam-requests` (scope `tam:write`) — creates request + sends approval email.
- `GET /api/v1/accounts/{id}` and `GET /api/v1/accounts?stage=&updated_since=` (scope `accounts:read`).

Errors: JSON `{ error: { code, message } }`; 401 bad key, 403 missing scope, 422 validation. Every call audited.

### Email decision route `/api/tam/decision`

Signed JWT claims `{ sub: request_id, act: approve|decline, jti, exp: 7d }`. GET renders an auto-submitting interstitial (defeats mail-client prefetchers); POST verifies signature + pending status + `jti`, applies the decision, rotates `jti` (invalidates the sibling link), audits, emails the requester. Token = one capability, one request, never a session.

### Internal

Server Actions for most mutations; routes for `POST /api/internal/import/csv`, `POST /api/internal/accounts/[id]/briefs`, `GET /api/internal/briefs/[id]/download`.

## App structure

```
src/
├── middleware.ts                  # session refresh; auth + verified-email gate
├── lib/ (stages, supabase clients, api-auth, tokens, email, audit, accounts, schemas, brief/*)
├── components/ (ui, auth/MicrosoftSignInButton, kanban/*, account/*)
└── app/
    ├── (auth)/login, signup, forgot-password
    ├── auth/confirm, reset-password, callback   # callback is provider-agnostic, ships now
    ├── (app)/pipeline                            # Kanban board
    ├── (app)/accounts, accounts/[id]             # tabs: overview|gong|briefs|tam|notes|history
    ├── (app)/tam-requests, tam-requests/new
    ├── (app)/admin/api-keys, admin/import, settings
    ├── tam/decided                               # public confirmation page
    └── api/ (v1/*, tam/decision, internal/*)
```

## Brief generation pipeline

1. Gather account + gong_reports + reviewed notes + stage history; insert `briefs` row (`generating`).
2. Synthesize to **BriefJSON** (zod): `one_liner`, `current_process[]`, `goals[]`, `what_we_know[]`, `stakeholders[]`, `risks_open_items[]`, `discovery_questions[{question, why_it_matters, category}]`, `process_gaps[]`.
   - LLM path: Claude structured output against the schema; system prompt forbids inventing facts — unknowns become discovery questions. One retry on validation failure, then fall back.
   - Template fallback: deterministic markdown sectioning + curated static GoCanvas implementation-discovery checklist. Same BriefJSON shape → same deck code.
3. Store JSON in `briefs.structured_json` (powers in-app discovery-question view + regeneration).
4. pptxgenjs deck from a GoCanvas-branded slide master: Title / Company & Goals / Current Process / What We Know / Stakeholders / Risks / Discovery Questions / Process Gaps.
5. Upload to Storage; download via signed URL.

## Build order

**Phase 0 — Scaffold & infra**: create Supabase project (free tier, $0/mo confirmed) + Auth config; `create-next-app`; deps; `supabase init` + link; `.env.example`; README; Vercel project.

**Phase 1 — MVP milestones**
- **M1 — Auth + schema foundation**: `0001_init.sql` (enums, profiles, accounts, stage_transitions, transition function, triggers, RLS); full auth surface incl. flag-gated Microsoft button and provider-agnostic OAuth callback; app shell; seed data.
- **M2 — Accounts, pipeline board, CSV import**: table, detail page (overview + history), Kanban drag-to-transition, CSV import with column mapping + per-row errors.
- **M3 — Public API + API keys**: api_keys + audit_log migration; key management UI (show-once, revoke); all `/api/v1` routes.
- **M4 — Gong reports**: paste/upload, list/view, pinned account_map.
- **M5 — Brief generation**: full pipeline, both generator paths verified.
- **M6 — TAM workflow**: form, email with signed links (`EMAIL_MODE=log` for keyless testing), decision route, in-portal approve/decline, requester outcome email, public API endpoint.
- **M7 — Onboarding notes + polish**: notes with review states, needs-review badges, empty/error states, README curl cookbook + SSO-enablement runbook, deploy + smoke test.

**Phase 1 explicitly out**: live Microsoft SSO (button ships dark), Slack, direct Salesforce API, job queue, per-account permissions, inbound email.

**Phase 2**
- **Microsoft SSO — config only, no code**: IT approves Entra app → configure Supabase Azure provider (restrict to tenant) → flip `NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED` → redeploy.
- **Salesforce direct**: Zapier/Flow → existing upsert endpoint (zero code) or Named Credential.
- **Slack**: `SLACK_WEBHOOK_URL` calls inside `transitionStage()` and TAM handlers (both single funnels for this reason).
- Nice-to-haves: `reports:write` scope for the Gong agent, brief diffing, per-stage SLA alerts.

## Security notes

- No shared generic logins: call data is sensitive; per-user accounts give attribution, revocation at offboarding, and audit integrity.
- Domain allowlist enforced in the DB trigger, not just the form — also governs future OAuth-created users.
- Salesforce/Gong credentials never enter this app; external tools authenticate *into* the portal with scoped, hashed, revocable keys.
- Decision tokens: action inside the signed payload, single-use via jti rotation, POST-behind-interstitial so mail prefetchers can't approve, 7-day expiry, dedicated secret.
- Service-role key only in server code (`import "server-only"`); browser holds anon key only; RLS backstops it.
- Zod-validate every API body; audit every v1 request with content redacted; rate limiting deferred (documented).

## Verification

Local: `supabase start` (bundled mail catcher for verification/reset emails), `supabase db reset` for migrations + seed, `npm run dev`.

Per milestone: auth flows incl. rejected non-domain signup and flag-off button absence (M1); drag transition + CSV error rows + blocked direct stage write (M2); curl cookbook incl. 401/403/422 negatives (M3); upload/extract (M4); template-vs-LLM generation + pptx opens with ≥7 slides (M5); log-mode link approval, replay rejection, sibling-link invalidation, tamper rejection (M6); prod smoke test of the full curl set + signup→verify→login (M7).

Automated (light): Vitest for `tokens.ts`, `api-auth.ts`, `fallback.ts`, zod schemas; `scripts/smoke-api.sh`. No E2E framework in phase 1.
