# GoCanvas Handoff Portal

Internal sales → post-sales handoff portal: a pipeline board that tracks accounts from
**Prospect → Closed Won → Onboarding Kickoff → In Onboarding → Onboarding Complete**,
ingests Gong agent reports, generates GoCanvas-branded PowerPoint **account briefs**
with discovery questions for the implementation team, and runs the **TAM request →
email approval** workflow.

Built with Next.js (App Router, TypeScript) + Supabase (Postgres, Auth, Storage).
See `PLAN.md` for the full design.

> **Shared database note:** the Supabase project also hosts an unrelated prototype.
> Every portal object is prefixed `portal_` (tables, enums, functions) — that prefix
> is the namespace boundary. The portal has Supabase Auth and Storage to itself.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values (see table below)
npm run dev
```

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase project (RLS makes the anon key safe in the browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | for API/briefs/TAM | Server-only. Dashboard → Project Settings → API Keys |
| `TAM_TOKEN_SECRET` | for TAM emails | Signs approve/decline links. `openssl rand -base64 32` |
| `APP_URL` | prod | Public base URL used inside email links |
| `ANTHROPIC_API_KEY` | optional | AI-synthesized briefs (template fallback without it) |
| `RESEND_API_KEY` + `EMAIL_MODE=send` | optional | Real email delivery; default `EMAIL_MODE=log` prints emails to the server log |
| `EMAIL_FROM` | optional | Verified sender, e.g. `Handoff Portal <portal@gocanvas.com>` |
| `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS` | yes | Signup form hint; real enforcement is the DB trigger |
| `NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED` | yes (`false`) | Shows the "Sign in with Microsoft" button when `true` |

Database migrations live in `supabase/migrations/` and have been applied to the
project. Apply future ones with the Supabase CLI (`supabase db push`) or MCP.

## Deploying to Vercel

1. Import this GitHub repo into Vercel (framework auto-detects Next.js).
2. Add every environment variable from the table above (Production scope).
3. In Supabase → Authentication → URL Configuration: set **Site URL** to the Vercel
   URL and add `https://<your-app>.vercel.app/auth/callback` to Redirect URLs.
4. In Supabase → Authentication → Providers → Email: enable **Confirm email**, set
   minimum password length to 12, and turn on leaked-password protection.
5. Deploy. The first person to sign up becomes the portal **admin** (approves TAM
   requests, mints API keys, promotes other admins).

## Auth

- Email + password, signup restricted to `@gocanvas.com` — enforced by a database
  trigger, so it also covers OAuth users created later.
- Email verification required before sign-in; password reset built in.
- First signup becomes admin; admins can change roles in the DB (`portal_profiles.role`).

### Enabling Microsoft SSO later (config only, no code)

1. IT registers an app in Microsoft Entra ID and supplies tenant ID, client ID, secret.
2. Supabase → Authentication → Providers → Azure: enable, paste credentials, restrict
   to the GoCanvas tenant. Add the Supabase callback URL shown there to the Entra app.
3. Set `NEXT_PUBLIC_AUTH_MICROSOFT_ENABLED=true` in Vercel and redeploy.
   The sign-in button, OAuth callback route, and domain allowlist already ship dark.
4. Optionally disable email signups in Supabase afterward.

## Open API

Admins mint keys at **Admin → API keys** (scoped, hashed at rest, shown once,
revocable). Authenticate with `Authorization: Bearer gcp_live_…` (or `x-api-key`).
Errors return `{ "error": { "code", "message" } }` — 401 bad key, 403 missing scope,
422 validation. Account ids accept the portal UUID or `sf_<salesforce_id>`.

```bash
BASE="https://<your-app>.vercel.app"
KEY="gcp_live_..."

# Upsert an account (the Zapier / Salesforce closed-won hook) — scope accounts:write
curl -X POST "$BASE/api/v1/accounts" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"salesforce_id":"0018b00002QzXyz","name":"Acme Manufacturing","stage":"closed_won","arr":48000,"domain":"acme.com"}'

# Trigger a stage transition — scope transitions:write
curl -X POST "$BASE/api/v1/accounts/sf_0018b00002QzXyz/transition" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"to_stage":"onboarding_kickoff","note":"Kickoff booked 9/2"}'

# Read accounts — scope accounts:read
curl "$BASE/api/v1/accounts?stage=in_onboarding" -H "Authorization: Bearer $KEY"
curl "$BASE/api/v1/accounts/sf_0018b00002QzXyz" -H "Authorization: Bearer $KEY"

# Create a TAM request — scope tam:write
curl -X POST "$BASE/api/v1/tam-requests" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"account_id":"sf_0018b00002QzXyz","requester_email":"am@gocanvas.com","justification":"Complex integration footprint","urgency":"high"}'
```

**Zapier recipe (closed won):** Salesforce "Opportunity updated → Stage = Closed Won"
trigger → Webhooks by Zapier POST to `/api/v1/accounts` with the JSON above and the
`Authorization` header. No portal code changes needed.

## Account briefs

On an account's **Briefs** tab, "Generate account brief" gathers all Gong reports +
reviewed onboarding notes, synthesizes them with Claude (strict schema; facts not in
the notes become discovery questions, never claims), renders a branded `.pptx`
(pptxgenjs) into private Storage, and shows the discovery questions in-app. Without
an `ANTHROPIC_API_KEY` — or if the model call fails — a deterministic template
generator produces the same deck shape from the raw notes, so generation never blocks
a handoff. Downloads go through 1-hour signed URLs.

## TAM approvals

AMs submit the form; every admin gets an email with one-click **Approve/Decline**
links. Links are HS256-signed (action inside the payload), single-use (a `jti`
rotated on decision — deciding via email or portal invalidates all outstanding
links), expire in 7 days, and mutate only on POST behind an auto-submitting
interstitial so mail-client prefetchers can't decide requests. The requester is
emailed the outcome. With `EMAIL_MODE=log`, the full email (links included) is
printed to the server log for testing.

## Future (pre-wired)

- **Slack**: add a `SLACK_WEBHOOK_URL` call inside `src/lib/accounts.ts`
  (`transitionStage`) and `src/lib/tam.ts` — both are single funnels for this reason.
- **Gong agent push**: add a `reports:write` scope and a
  `POST /api/v1/accounts/{id}/gong-reports` route (scopes are data, not schema).
- **Salesforce direct**: point a Salesforce Flow / Named Credential at the existing
  upsert endpoint.
