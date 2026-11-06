# Solutions and Training & Readiness: implementation plan

Status: branch `claude/solutions-training-workspace`, stacked on the PR #101 tip
(`complete-solutions-workspace`). Nothing here is merged, deployed or applied to
production. Migration 0092 is for staging and local replay only until a human
approves production sequencing.

This plan supersedes the earlier draft. It records the corrections made after
review.

## 1. Navigation

The customer workspace gets two new top-level tabs:

    Overview | Current Implementation | Solutions | Training & Readiness | Resources | Details

- **Solutions** and **Training & Readiness** are tabs, not sections inside
  Current Implementation.
- **Current Implementation** keeps the existing journey, risks, next steps and
  stage guidance. It shows a short summary of solution delivery and training
  readiness, linking to the new tabs for detail. It does not host their
  management UI.
- Old links (`?tab=...`) keep working. The legacy-tab mapping in
  `customers.$customerId.tsx` is extended, not replaced.

## 2. Source-of-truth relationships

| Fact | Owner | How it relates |
|---|---|---|
| Purchased scope, including training commitments | `intake.timeline.services` | Authoritative. Nothing copies it. |
| Contractual wording for scope and responsibility | The signed SOW quote, stored verbatim on the row that cites it | Quoted, never rewritten |
| Solution lifecycle: Define → Build → Accept → Accepted | Derived from the intake service (`solutionStatus`) | The primary customer-facing status |
| Solution delivery detail: components, dependencies, history | `complete_solutions`, `solution_components`, `solution_events` (PR #101) | Linked to scope by `purchased_service_id` |
| Solution-level `status` and `readiness` columns (PR #101) | Stored, not shown as a status | See section 7 |
| Training needs and their progress | `implementation_training` (new, 0092) | Belongs to the implementation. Optional links to a purchased service, a solution component and an adoption area. |
| Customer capability baseline | `adoption_areas` (existing) | Reused |
| Readiness evidence | `evidence` (existing) | Reused. Training readiness must point at a row here. |
| Implementation owner | `implementations.owner_id` (PR #101 owner-change history) | Reused |
| Stage and checklist | `implementations` stage, `stage-gates`, journey tasks | Untouched. Training never changes them. |
| History | `portal_audit_log` (the table the application's `audit()` writes) | Reused. Training changes are written in the same transaction as the change. No new events table. |
| Suggestions | `evidence_proposals` (0079, plus 0091 columns) | Extended with training types |

## 3. Responsibility

Supported responsibilities: **GoCanvas**, **Customer**, **Partner**.

- Purchased training does **not** assign GoCanvas responsibility automatically.
- Responsibility is taken from documented contractual scope where it exists. A
  row then carries `responsibility_source = 'sow'` and the SOW quote, verbatim.
- Otherwise a TIS confirms it. The row carries `responsibility_source = 'tis_confirmed'`.
- A row with no confirmed responsibility is shown as **needs confirmation**. It
  is never filled in with a default.
- A transcript may propose a responsibility. Approval by an authorised TIS sets
  it as `tis_confirmed`. A transcript can never set the `sow` source.
- The training plan belongs to the implementation. It works without any purchased
  training service (training-only engagements), and it can hold rows that the
  customer delivers for themselves (customer-owned enablement).

## 4. Training model

Table `implementation_training` (migration 0092):

- Identity: `id`, `org_id`, `implementation_id`, `created_at`, `updated_at` (the version), `archived_at`.
- Writes: none directly. Signed-in users may read; every write is a service-role function (see section 11).
- Content: `topic` (required), `audience`, `outcome` (the capability the customer should reach), `method` (`session | self_paced | recorded | document | other`, optional).
- Responsibility: `responsibility` (`gocanvas | customer | partner`, nullable), `responsibility_source` (`sow | tis_confirmed`, nullable), `sow_quote` (text, nullable). Rule: a responsibility is set only with its source, and a `sow` source needs a quote.
- Links (all optional): `purchased_service_id` (text, a reference into the intake services), `solution_component_id` (PR #101), `adoption_area_id`.
- Delivery, kept separate from readiness: `delivered_at` (date, nullable), `delivered_by`.
- Readiness, kept separate from delivery: `demonstrated_status` (`not_assessed | not_yet | practice_needed | demonstrated`, default `not_assessed`), `demonstrated_evidence_id` (FK to `evidence`), `demonstrated_at`, `demonstrated_by`. Rule: `demonstrated` requires an evidence row on the same implementation.
- Follow-up: `next_step` (text, nullable). Practice still needed is recorded here and as `practice_needed`.

Derived, never stored:

- **Coverage:** a purchased training service with no linked active row is flagged as uncovered.
- **Responsibility needing confirmation:** active rows with no confirmed responsibility.
- **Progress counts:** topics, delivered, demonstrated, practice needed.

Deliberately absent: due dates per row (scheduling stays in the existing plan
milestones), per-row owners (the row inherits the implementation owner), and any
task board. This is not a second project-management system.

## 5. Transcript proposals

Five proposal types, each with a transcript quote and an authorised TIS approval:

| Type | Suggests | Approval effect |
|---|---|---|
| `training_add` | A new training need: topic, and optionally audience, outcome, responsibility, method | Creates a row. Responsibility, if suggested, is `tis_confirmed`. |
| `training_update` | One field changed: topic, audience, outcome, responsibility, or method | Updates that field if the version still matches |
| `training_delivered` | Training was delivered, with an optional date | Sets `delivered_at`. Does not touch readiness. |
| `training_demonstrated` | Readiness demonstrated, practice still needed, or not yet | Demonstrated: creates an evidence row from the quote and links it. Practice/not-yet: sets the status only. |
| `training_follow_up` | Additional practice or follow-up needed | Sets `next_step` |

Rules:

- Every suggestion needs a quote. A suggestion without one is dropped when parsed.
- Nothing applies automatically. Each suggestion stays pending until an authorised
  TIS approves or dismisses it.
- Authorised means the same rule as the solution writes (`post_sale_may_manage`):
  the implementation's owner, a Team Lead, a manager, an admin or a super admin.
  Technical roles (`se`, `tam_se`) and customers are refused.
- Approval is conditional on the row version the suggestion was made against.
  A stale suggestion is refused and nothing is written.
- Approved suggestions may change training progress and completion. They must never
  change an implementation stage, a journey or checklist task, or a purchased
  solution's acceptance. The prompt keeps forbidding those, and the apply path
  has no code that writes them.

Prompt change: the existing rule forbids "a checklist task being marked done". The
carve-out allows the five training types above and nothing else.

## 6. Screen changes

1. **Solutions tab** (new). With `complete_solutions` on: a compact overview per
   purchased solution (lifecycle label, owner, blocker, next action, purchase link),
   expanding to PR #101's detail (components, dependencies, history). With the flag
   off, the tab explains that Solutions is not on for this Hub.
2. **Training & Readiness tab** (new, behind `training_plan`). Compact summary:
   topics, delivered, demonstrated, uncovered purchased training, needs
   confirmation. Expanded table: topic, audience, outcome, responsibility and its
   source, method, delivered date, demonstrated status and its evidence link.
   "Delivered" and "Demonstrated" are separate columns. Uncovered purchased training
   gets a one-click Add, which only pre-fills the form.
3. **Current Implementation** (existing tab, small addition): a summary strip
   showing the solution count with its lifecycle counts, and training readiness
   with a link to each tab. Nothing else in the journey changes.
4. **Transcript review** (`transcript-update-panel.tsx`): labels and quote display
   for the five types, with approve and dismiss.
5. **Customer-facing views**: none. `CUSTOMER_VIEW` in `welcome.ts` stays as it is.

## 7. Status vocabulary

- The Define → Build → Accept → Accepted lifecycle is the only solution-level status
  shown to customers and TIS users.
- PR #101's `complete_solutions.status` (`not_started | in_progress | waiting | complete`)
  and `readiness` (`not_ready | at_risk | ready`) remain in the database but are not
  displayed as a solution status. They would be a second status system.
- Component statuses (`solution_components.status`) are delivery detail and stay
  visible inside the Solutions detail, labelled as component work.
- **Decision to confirm:** whether PR #101's solution-level `status` and `readiness`
  columns should later be removed or redefined. This plan does not remove them.

## 8. Migrations and PR dependencies

Order:

`main` (0086) → PR #100 (file `0087`, runbook says `0090`, to be corrected) →
issue-83 (`0088`, sharing 0087's identical blob) → kickoff-held (`0089`) →
PR #101 (`0091`, after staging acceptance) → **this branch: `0092`**.

- 0092 depends on 0091's helper functions (`post_sale_may_manage`) and on its
  widened `evidence_proposals.type` check.
- 0092 adds the training table, its functions, the `evidence_proposals` training
  columns, and a further widened type check that keeps every 0091 type.
- The Kickoff Deck Builder is not modified.
- Production: 0092 is not applied. Production sequencing and merge approval stay
  with the release owner.

Shared files that need careful coordination (the branches' tips are the ones checked):

- `src/lib/transcript-proposals.server.ts`, `transcript-analysis.ts`,
  `transcript-analysis.server.ts`, `transcript-update-panel.tsx`: touched by
  release-a, issue-83 and Focus Mode, and by PR #101. The training changes are
  additive: new cases and new functions, with minimal edits to shared lines.
- `src/routes/customers.$customerId.tsx`: touched by issue-83, no-ai-stage-progression
  and kickoff-deck-builder. The change here is only the tab list and the two new
  tab bodies.
- `stage-flow.tsx` and `implementation-workspace.tsx`: touched by Focus Mode. This
  branch does not change them beyond the summary strip, which is added last.

## 9. Build sequence

Each step ends with typecheck, lint, the unit tests and, for database steps, the
schema replay and invariant tests.

1. **Plan** (this document).
2. **Migration 0092**: table, functions, `evidence_proposals` columns, and the
   down and verify files. Replay on a local Postgres and run every schema test.
3. **Domain module** `training-plan.ts`: rules, coverage, parsing, and the apply
   plan. Unit tests for each rule.
4. **Transcript types**: the five types in `transcript-analysis.ts`, the parser,
   and the prompt carve-out. Tests that existing types parse exactly as before.
5. **Server functions** and the approval path in `transcript-proposals.server.ts`,
   gated by `training_plan`.
6. **Navigation**: the two tabs and the Current Implementation summary strip.
7. **Transcript review UI** labels.
8. **Full verification**, then a report.

## 10. Acceptance tests

1. A purchased training service with no linked row is flagged. No row is created.
2. A row with no confirmed responsibility is shown as needing confirmation, and no
   default is filled.
3. A SOW-sourced responsibility keeps its quote exactly as entered.
4. A training-only implementation (no solutions, no integrations) holds training rows
   and reaches demonstrated readiness.
5. A customer-owned row shows responsibility Customer and is never counted as GoCanvas.
6. `delivered` without a demonstration shows delivered and "not assessed" side by side.
7. `demonstrated` without evidence is refused in the database and in the domain module.
8. A transcript "training delivered" creates a pending proposal only. The row is
   unchanged until an authorised TIS approves.
9. Approving creates the audit row and, for a demonstration, the linked evidence row.
10. Dismissing changes nothing.
11. A stale `training_version` is refused on approval.
12. A suggestion without a quote is dropped when parsed.
13. A transcript cannot produce a stage change, a checklist completion, a purchased
    solution change or a lifecycle status. Tested at the prompt and at the parser.
14. Non-owning TIS, technical roles and customers are refused for writes. Customers
    cannot read the table.
15. With `training_plan` and `complete_solutions` off, no new UI or server action
    runs, and the data is kept.
16. Training changes never change an implementation's stage, the journey, or the
    `completed.live` cascade.
17. The Define → Build → Accept → Accepted derivation is unchanged for every
    purchased solution.

## 11. Implementation notes (added during the build)

- **History table.** The application's `audit()` writes `portal_audit_log`, not the older `audit_log` from 0003. Training history uses `portal_audit_log`.
- **Direct writes closed.** PR #101's solution tables have `for all` policies for internal users, which lets a signed-in internal user write them directly and skip the permission functions. The application writes them only through the service role. Migration 0092 removes direct writes (`insert`, `update`, `delete`) from `authenticated` and `anon` on the four 0091 tables, and makes their policies read-only for signed-in users. The down file restores the 0091 state. This is a change to reused PR #101 code and is called out for review.
- **Responsibility.** `responsibility` and `responsibility_source` are set together, or not at all. A `sow` source needs its quote. Both rules are enforced in the functions and in the table constraints.
- **Verification.** Migration 0092 is replayed with 0001–0091 on a local Postgres 16 (stubs for the Supabase `auth`, `storage` and `extensions` schema, in the scratchpad only, not in the repo). All 52 schema test files pass, including `0092_implementation_training_invariants.sql` with 42 probes. The CI-style down, re-up and test cycle also passes.

## 12. Build status

Built on this branch, each step checked with typecheck, lint, the unit tests, and the
schema replay where a migration changed:

- Migration 0092 (table, functions, proposal columns and types, grants, down and verify
  files) with a 42-probe invariant file. Replayed on a local Postgres 16 after 0001–0091,
  with the CI-style down, re-up and test cycle.
- Domain rules (`training-plan.ts`): responsibility, coverage, delivered and shown kept
  apart, purchased training shown as uncovered and never created.
- Transcript suggestions: five types, prompt carve-out, listed-need and quote validation,
  failed suggestions kept as notes, reviewed delivery date, and approval through the 0092
  functions with the version check.
- Server functions behind `training_plan`; reads return `enabled: false` while it is off.
- Navigation: Solutions and Training & Readiness are top-level tabs in the approved order.
  Current Implementation shows a training readiness line that links to the tab.
- Solutions tab: the lifecycle card (purchase record) above PR #101's delivery detail. The
  solution-level status select in PR #101 is replaced by the lifecycle label.

Not yet built, or partly built:

- The Current Implementation summary is training only. A solutions summary line is not added.
- The Training tab shows the implementation's needs for the Hub's own users; it is not
  customer-visible, and no decision has been taken to make it so.
- Staging acceptance has not run. The feature flags are off everywhere.
- The release runbook (`docs/RELEASE-PR101.md`) refers to migration `0090`, which does not
  exist. The file is `0087` on the PR #100 branch. This needs correcting by the release owner.
