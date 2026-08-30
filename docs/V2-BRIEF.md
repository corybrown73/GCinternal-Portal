# Implementation Hub v2 — deep-dive improvement brief

## Who you are and what this is

You are working on an internal post-sale delivery tool ("Implementation Hub" / "GoCanvas Handoff Hub", deployed at gcinternalportal.com — Next.js + Supabase). It tracks a customer from Closed/Won through implementation to handover to Customer Success.

V1 works and has a real point of view. Your job is **not** to rewrite it. Your job is to take it from "a tracker for one kind of project" to "a delivery system that handles every kind of post-sale motion we run, and that customers can see."

**Do not write application code until Step 0 is complete and I have approved the plan.**

---

## Step 0 — orient before you build

1. Read the repo end to end. Produce `docs/AUDIT.md` containing:
   - Route map (page → purpose → data it reads/writes).
   - The current Supabase schema as actual DDL, plus an ER diagram in Mermaid.
   - Where the eight lifecycle stages are defined. Are they a DB table, an enum, a TS constant, or hardcoded in more than one place? List every location.
   - Where "health" (`on_track` / `at_risk` / `blocked` / `no_signal`) is set and read.
   - What `/api/v1/*` currently exposes, how API keys are authenticated, and what the CSV import maps.
   - Every place a customer-facing string uses inconsistent vocabulary ("Handoff Hub" vs "Implementation Hub", "Handover to Customer Success" vs "Graduate to CS", the unexplained acronym "TIS").
   - Dead code, unused tables, TODOs.
2. Tell me the top 5 things you found that I did not list below.
3. Then produce `docs/PLAN.md`: the phased implementation plan, with migration strategy and rollback per phase. Wait for approval.

---

## Non-negotiables — preserve these, they are the reason v1 is good

- **Evidence over inference.** The app never invents state. Portfolio explicitly says "Nothing here is a score, forecast or trend." When you add computed signals (Workstream 5), every computed value must be able to show its inputs on demand, and must be visually distinguishable from recorded fact. Never silently replace a recorded value with a computed one.
- **The readiness/gate-review pattern** (Delivery / Value / Adoption / Open work / Handover record) is excellent. Extend it, don't replace it.
- **"Waiting on"** as a first-class concept (currently "Waiting on TIS to close an open commitment") is the single best idea in v1. It should become the backbone of nudges, alerts and the customer portal.
- Keep every existing URL working, or 301 it. People will have bookmarks.
- Server-side rendering and fast page loads. No client-side data waterfalls on the account page.

---

## The core problem to solve

Today there is exactly **one** journey: a hardcoded eight-stage lifecycle (Handoff → Plan Internally → Align Externally → Build → Validate/Iterate → Launch → Adopt → Handover to CS), identical for every record, with no work items under the stages.

That is wrong for the business. The real motions are at least:

| Motion | Shape |
|---|---|
| New logo implementation | Full eight stages, weeks-to-months, SE + PS involvement |
| Existing account buys an add-on module | 3–4 stages, days-to-weeks, no re-onboarding, no CS handover — the CSM already owns it |
| Existing account buys an integration | Technical-heavy: scoping, field mapping, sandbox, UAT, cutover. Different tasks entirely |
| Multi-site / phased rollout | Same template applied N times under one account, with a parent rollup |
| Data migration | Gated on customer-supplied data; long "waiting on customer" periods |
| Recovery / re-implementation | Triggered by CS, not by a closed deal |

An account can have **several of these running at once**. The current model — one row per customer, keyed by customer — cannot express that.

---

## Workstream 1 — Journey templates (the foundation; everything else depends on it)

Make the journey a **configurable, versioned template** instead of a constant.

### Schema (adapt names to repo conventions, keep the semantics)

```
account
  id, salesforce_account_id, name, industry, segment, tier, arr, csm_owner_id

implementation                      -- was "customer"; now MANY per account
  id, account_id, name, journey_type, journey_template_id, template_version,
  parent_implementation_id,          -- for phased rollouts
  status, health_recorded, health_computed, health_computed_at,
  owner_id, sales_owner_id, se_owner_id,
  kickoff_at, target_launch_at, actual_launch_at, handover_at, closed_at,
  salesforce_opportunity_id, source

journey_template
  id, key, name, journey_type, version, status(draft|published|archived),
  supersedes_id, description, default_for jsonb   -- auto-selection rules

journey_template_stage
  id, template_id, position, name, category(intake|delivery|value|steady_state),
  purpose, target_duration_days,
  entry_criteria jsonb, exit_criteria jsonb,
  gate_mode(advisory|warn|blocking),
  required_artifacts text[]

journey_template_task
  id, stage_id, position, title, description,
  role_key,                          -- resolved to a person at instantiation
  party(internal|customer|partner),
  visibility(internal|shared),
  offset_basis(project_start|stage_entry|target_launch), offset_days, duration_days,
  is_optional, include_when jsonb,   -- conditional inclusion
  depends_on uuid[]

scoping_question / scoping_answer    -- drives include_when
```

### Behaviour

- **Instantiate, don't reference.** Creating an implementation copies the template into concrete `stage_instance` and `work_item` rows, and pins `template_version`. Later template edits never mutate live projects.
- **Versioning + drift.** When a template is republished, show me every live implementation on an older version and let me *choose* per-project whether to pull in specific added tasks. (This is a real gap across the commercial market — Dock is the only vendor that does anything like it. Building it is a genuine advantage.)
- **Conditional tasks.** `include_when` evaluates against scoping answers and Salesforce product/line-item data. Example: `{"integration_type": "erp"}` includes the sandbox + field-mapping task block; `{"plants": {">": 1}}` includes a per-site rollout block.
- **Reusable stage blocks.** A stage defined once (e.g. "Integration cutover") can be dropped into multiple templates. Follow GuideCX's model where phases are independently reusable.
- **Role-based assignment.** Templates assign to a *role* ("Implementation Manager", "Solutions Engineer", "Customer Data Owner"), resolved to a person when the project is created. Never hardcode names into templates.
- **Template builder UI** at `/settings/templates` — drag to reorder stages and tasks, edit criteria, preview the resulting plan against sample scoping answers, publish with a version note. Non-engineers must be able to change a journey without a deploy. This is the flexibility requirement; if it needs a PR to change a stage, the tool has failed.
- Seed four published templates: **New Logo Implementation** (the current 8 stages, migrated verbatim), **Add-On Module**, **Integration**, **Data Migration**.

### Migration

Every existing implementation gets `journey_type = new_logo` and is pinned to v1 of the New Logo template, with its stage history preserved exactly. Nothing in `/portfolio` or `/customers` may change behaviour for existing records.

---

## Workstream 2 — A work-item layer under the stages

Today stages are empty containers and `commitment` is the only work object. There is no plan, so the tool can never answer "what happens next, who has it, and what is it waiting on."

- Add `work_item`: title, description, stage_instance_id, owner_id, party (internal / customer / partner), status (`not_started | in_progress | waiting | blocked | done | skipped`), `waiting_on_party`, `waiting_since`, due_at, completed_at, visibility, `depends_on[]`, template_task_id, evidence/attachment links.
- **Dependency gating**: a task whose predecessors are open shows as `blocked` and cannot be marked done without an explicit override that is recorded with a reason.
- **Relative dates**: due dates computed from `project_start` / `stage_entry` / `target_launch` plus offset. When the target launch moves, recalculate downstream dates and show me the diff before saving.
- Keep `commitment` as its own object — a promise made to a customer is not the same as a plan task, and that distinction is worth preserving. But let a commitment be linked to a work item.
- Views on the account page: checklist grouped by stage (default), plus a timeline/Gantt view. Not a Kanban — the stage board already covers that.
- **Bulk actions**: reassign, shift dates, mark done, on multi-select.

---

## Workstream 3 — Turn the handoff into a real gate

The market universally handles handoff quality as a *retrospective audit*, not a *gate*. Build the gate.

- **Handoff packet** as a structured record created at Closed/Won, with required fields: business outcome the customer bought; success measures (measure, baseline, target, owner); stakeholder map (economic buyer, champion, day-to-day owner, and explicitly *skeptics*) with contact details and comms preference; commitments the AE made (verbally or in the SOW); known technical risks; integration dependencies; data-migration needs; product-roadmap promises; links to SOW, recorded discovery calls, and the Miro board.
- **Completeness score** shown to the AE while they fill it in, and to leadership as a rolled-up metric per AE.
- **Accept / return.** The implementation owner explicitly accepts the handoff or returns it with named gaps. The implementation clock (time-in-Handoff) keeps running while it is returned, and the return is visible in `/portfolio`. This is the accountability mechanism that no commercial tool has.
- **Stage gates generally.** Right now the readiness panel says "Nothing here blocks stage movement." Make `gate_mode` per stage configurable: `advisory` (current behaviour), `warn` (confirm dialog listing what's unmet), `blocking` (requires a named override with a reason, written to history). Default the migrated New Logo template to `warn` — do not silently make anything blocking.
- **Success measures must not stay empty.** All 3 of 3 seeded accounts have zero success measures and zero usage areas; those structures are dead weight until they arrive pre-populated from the template and are required at the Align Externally gate. Empty-by-default structures never get filled in.

---

## Workstream 4 — The external view (this is the biggest missing feature)

`/access` invites customer contacts, but **there is nothing for them to see**. "Easy to share status internally and externally" is a stated requirement and today the external half is zero.

Build a customer-facing shared plan:

- **Access model:** signed magic link, no account creation, per-implementation, expiring and revocable, with an optional passcode for enterprise accounts. Keep an authenticated route for accounts whose IT requires it. Never expose internal object IDs in the URL.
- **What the customer sees:** their tasks first (due today / this week / overdue), the milestone timeline, what *we* owe them, what *they* owe us, who to contact, and shared documents. Internal-only work items and the entire TIS journal are never rendered.
- **Customer-side ownership:** customer contacts can complete their tasks, add a comment, upload a file, and — importantly — **reassign a task to a colleague**, which invites that person automatically. This is how GuideCX removes chasing from the CSM's plate.
- **Engagement telemetry:** record who opened the plan and when, and surface "champion has not opened this in 12 days" as a health signal internally. Do not show this to the customer.
- **Branding:** GoCanvas-branded by default, with a per-account logo. Mobile-first — a plant ops director will open this on a phone.
- **A weekly status snapshot** that can be exported as a shareable read-only page or PDF: stage, what moved, what is at risk, what we need from you, next milestone. Both an exec inside GoCanvas and the customer sponsor should be able to consume it in 30 seconds.

---

## Workstream 5 — Signals: stop relying on self-reported health

Health is currently a manually-set field, and `/portfolio` has no way to know a project is quietly dying.

Compute a **signal set** (not a single opaque score) with each signal independently visible and explainable:

| Signal | Definition |
|---|---|
| Velocity | Work items closed in last 14d vs. this project's own prior rate and vs. peer projects on the same template. Catches slowdown *before* a date is missed. |
| Dwell | Days in stage vs. the template's `target_duration_days` for that stage. |
| Slip | Days of movement in `target_launch_at` since baseline, with **attribution** — vendor-caused vs. customer-caused, derived from which party owned the blocking items. |
| Engagement | Days since the champion last opened the portal / replied / attended. |
| Open risk load | Count and age of open risks, issues, escalations, overdue commitments. |
| Value coverage | Success measures recorded and moving. |
| Waiting | Cumulative days in `waiting_on_customer` vs `waiting_on_us`. |

Rules:
- Show the **computed** health alongside the **recorded** health, and flag disagreement ("Owner says On track; velocity and engagement say At risk"). Never overwrite the human.
- When flagging a project, say *which signal* fired and give a concrete next action tied to the actual blocker — not a generic "this project is red."
- Follow Precursive's pattern: any manual health rating of At Risk or Blocked requires a short written reason. A colour with no narrative becomes noise.
- Wire `/alerts` for real: SLA breach, stage dwell over target, overdue customer task, champion gone quiet, launch date at risk, handoff returned. Every alert deep-links to the record and is acknowledgeable with a note.

---

## Workstream 6 — Salesforce and the open API

Today: CSV import from a Salesforce export, plus scoped API keys on `/api/v1/*`. That is one-way and manual.

- **Closed/Won → auto-create.** `POST /api/v1/implementations` accepts an Opportunity payload including **line items / product codes**, and selects the journey template from those line items. This is the mechanism that makes "new logo" vs "add-on integration" automatic rather than a human choice. TaskRay does exactly this and it is the right pattern.
- **Idempotency**: keyed on `salesforce_opportunity_id`, so a reopened-and-re-won opportunity does not create a duplicate implementation. This is the single most common failure in this integration class.
- **Write-back**: implementation stage, computed health, target and actual launch date, and portal link pushed back onto the Opportunity/Account so AEs and leadership see delivery status without leaving Salesforce. Sales losing visibility at the moment of close is the whole problem this tool exists to fix.
- **Account matching** on `salesforce_account_id`, never on name.
- **Webhooks out** for `implementation.created`, `stage.changed`, `gate.blocked`, `alert.raised`, `handoff.returned` — so Slack and anything else can subscribe without polling.
- **Field mapping UI** in `/admin` rather than hardcoded mappings, plus a sync log showing every inbound/outbound call, payload and failure, with retry.
- Publish OpenAPI at `/api/v1/openapi.json` and generate docs from it.

---

## Workstream 7 — Metrics leadership will actually ask for

`/portfolio` today shows counts and observed dwell, and explicitly disclaims trends. Add a metrics layer, still evidence-based, with every number clicking through to its underlying records:

- **Time to first value** — Closed/Won to first defined value milestone (not go-live). Define the milestone per template.
- **Time to live** — Closed/Won to `actual_launch_at`. Median and p90, split by journey type, segment and template version.
- **On-time launch rate** — launched on or before the *baselined* target, not the most recently edited one. Baseline the target at kickoff and never let it be silently overwritten.
- **Stage dwell vs. target** per template, so template durations can be tuned from evidence.
- **Slip attribution** — days lost to us vs. to the customer.
- **Handoff completeness** by AE.
- **Onboarding CSAT** at three trigger points (post-kickoff, mid-build, post-launch) rather than one survey at the end, so you can locate where satisfaction drops.
- Simple owner load (count, ARR, launches within 30 days) is enough for now. **Do not build a utilisation/capacity model yet** — flag it as Phase 5 and leave the disclaimer in place until real timekeeping data exists.

---

## Workstream 8 — Platform hygiene (do this in Phase 1, it is not optional)

- **`/tickets` is broken in production**: "Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY." Fix the config, and add a startup-time env check that fails loudly with a named list of what is missing rather than a runtime crash inside a page. Every data-fetching page needs a real error and empty state.
- **Auth and RBAC do not exist.** `/portfolio` says "No auth yet — this is the whole portfolio, not a filtered team." `/settings` says "Team & roles — NOT AVAILABLE YET." Ship: SSO or Supabase Auth, roles (Admin, Implementation Lead, Implementation Manager, SE, Sales, CS, Read-only), row-level security in Supabase, and "my accounts" vs "all accounts" filtering. Customer portal identities are a separate principal type and must never be able to reach internal routes.
- **Naming.** Pick one product name. "Journeys" currently means email sequences while the implementation lifecycle is also called a journey — rename the email feature to "Sequences" or "Campaigns". Expand or drop "TIS". Use one term for the final stage.
- **Audit trail** on every mutation: who, what, before, after, when. Extend the existing stage history to all objects.
- **Search and saved views**: global search across accounts, implementations, work items, risks; saved filter sets per user on `/customers` and `/technical-solutions`.
- **Empty states that teach.** Several pages currently show "No X recorded" with no path forward. Every empty state should name the next action and why it matters.
- Seed data + a demo mode, so this can be shown internally without real customer data.
- Tests: schema migrations, template instantiation, dependency/date recalculation, gate evaluation, portal authorisation (a customer must never read another account's data), and the Salesforce idempotency path.

---

## Sequencing

1. **Phase 1 — Foundation.** Audit, auth/RBAC, env + `/tickets` fix, naming cleanup, `account` → many `implementation` model change, audit trail.
2. **Phase 2 — Templates + work items.** Journey templates, template builder, work-item layer, dependencies, relative dates, four seeded templates, migration of existing records.
3. **Phase 3 — Handoff gate + external portal.** Handoff packet with accept/return, configurable gates, magic-link customer plan, weekly status snapshot.
4. **Phase 4 — Signals + Salesforce + metrics.** Computed signals, working alerts, closed-won auto-create with line-item template selection, write-back, webhooks, metrics layer.
5. **Phase 5 — Later.** Capacity/resourcing, time tracking, portfolio rollups for multi-site programmes, in-app scoping questionnaire for the customer.

Each phase must be independently shippable behind a feature flag, with a reversible migration.

---

## How I want you to work

- Small, reviewable PRs. One concern per PR.
- Every schema change is a numbered, reversible migration. Never edit a shipped migration.
- Update `docs/PLAN.md` as you go — it is the source of truth for where we are.
- If a requirement above conflicts with something you find in the code, stop and ask. Do not guess at the business rule.
- No new dependency without telling me what it replaces and why.
- Show me screenshots of any new UI before wiring it to real data.

## Definition of done for Phase 2 (the phase that matters most)

I can, without touching code:

1. Create a new journey template called "Integration — ERP", give it four stages and twenty tasks, mark six of those tasks customer-owned and four internal-only, set two dependencies, publish it as v1.
2. Create an implementation for an **existing** account that already has a live new-logo implementation, choose the Integration template, answer three scoping questions, and see the correct conditional tasks generated with dates relative to kickoff.
3. Move the target launch date by two weeks and see all downstream due dates recalculate, with a diff shown before I commit.
4. See both implementations rolled up under one account, and see them separately in `/portfolio`.
5. Edit the template to add a task, publish v2, and be told which live projects are on v1 and offered the choice to pull that task in.
