# Monday demo runbook

## Prep (≈30 min, do Sunday)

1. **Apply migrations 0003–0008** in the Supabase SQL editor, in order, one per run (0004 strictly alone). Files in `supabase/migrations/`.
2. **Run `supabase/seed_demo.sql`** — loads 3 implementations at different stages, pipeline deals, a Gong report, milestones/commitments, and an open ticket 6h into its SLA.
3. **Deploy to Vercel** (README §3) or run `npm run dev` locally with a filled `.env`.
4. **Sign up** with your @gocanvas.com email (verify link) → you're super admin #1. Set a colleague as manager in Admin → Users if you want the role switch moment.
5. Optional wow: add `ANTHROPIC_API_KEY` so brief generation runs live. Leave `EMAIL_MODE=log` — emails (TAM approvals, journey steps, SLA notices) print to the Vercel function log, which you can show as "here's the email that just went out."
6. **Invite yourself as a customer** (personal email) via Customer access → open the magic link in an incognito window so you can flip to the customer view instantly.

## Demo script (~12 min)

1. **Home** (30s) — "One system from first call to steady-state. This is the triage queue: what needs attention across every implementation."
2. **Pipeline** (2 min) — the deal board. Drag Ironline from Closed Won → Kickoff ("every move is audited; Salesforce or Zapier can do this over the API with a scoped key — no credentials of ours leave the building"). Open the deal: Gong agent notes are already attached.
3. **The handoff** (2 min) — the money moment. Generate the account brief live (or show a pre-generated one): branded PPTX + discovery questions the implementation team starts from. Click **Start onboarding** — the customer and implementation records appear, stage moves, and you're standing in the Implementation Hub. "Sales context stops dying in inboxes."
4. **Implementation Hub** (2 min) — your existing flow, untouched: lifecycle rail, commitments, success criteria, technical solutions. "Nothing the team learned changes; it now has a front half and a customer face."
5. **Customer portal** (2 min) — flip to the incognito window: stage tracker, progress %, their next steps with overdue items highlighted, and "ask a question." Submit one — "it routed itself to the right role with a 24-hour SLA; at 12 hours the assignee gets warned, at 24 it escalates to managers and lands on the Alerts board."
6. **Tickets + Alerts** (1.5 min) — the queue with SLA countdown chips; the alerts page ("anything out of spec — breached SLAs, stalled implementations, overdue milestones — and external systems can push alerts through the API and managers get emailed").
7. **Journeys** (1.5 min) — open New Logo Welcome: "when a new logo signs, they get the welcome video; the moment they *watch it* — tracked link — the system sends Level 1 training. Nobody sends anything by hand."
8. **Close** (30s) — roles (2 super admins, sales/implementation/TAM-SE/manager/customer), multi-tenant foundation ("built like a product, not a script — org id on every row"), open API + CSV today, Salesforce/Gong direct next.

## Likely questions

- **Security** — customer data behind per-user auth + row-level security; customers cryptographically can't read internal rows; API keys hashed/scoped/revocable/audited; all email links are signed single-use tokens; service credentials never touch the browser; every mutation audit-logged.
- **"Why not Rocketlane?"** — the failure mode of these tools is adoption: admin overhead and customers who won't log in. We built the 60-second-update workflow and passwordless email-first customer access, kept the license cost at zero, and own the roadmap (journeys, briefs, Gong — none of which Rocketlane does).
- **"What's left?"** — Resend domain for branded email, Salesforce/Zapier hook-up (endpoint is live), Microsoft SSO when IT approves (config-only), and the training-video content itself.
