# Leadership layer — assessment and proposed information architecture

Design only. No schema changes, no seeding, no UI changes in this iteration.

## What already exists (and must be reused, not duplicated)

- `getHome()` already returns everything a portfolio view needs: `implementations` (customer, stage, stage_entered_at, status, owner_name, tier, ARR, launch dates, overdue commitment + open escalation counts), `commitments`, `signal`, and a per-implementation `triage` bundle (commitments, risks, issues, escalations, milestones, decisions, success_criteria).
- `home-triage.ts` — `buildQueue()` / `triageRow()` produce a single triaged row per implementation with bucket, driving reason, impact, next action, deep-link tab. `healthByImplementation()` gives derived health per implementation.
- `customer360-derive.ts` — `deriveHealth`, `waitingOn`, `proveValueGaps` / `proveValueGapSummary`, `adoptionSummary` / `adoptionAreaLevel`, `launchOverdue`, `launchStateConflict`, `nextAction`, `whatMattersNow`, `severityRank`.
- `graduation-readiness.ts` — `graduationReadiness()` + `graduationReadinessSummary()` (needs the full Customer 360 record, not the Home bundle).
- `lifecycle.ts` — 8 owned stages, phases (`intake` / `delivery` / `value` / `steady-state`), boundaries, aliases.
- Components: `Panel`, `StageBadge`, `StatusChip`, `StatusDot`, `NoRows`, `PageHeader` / `PageBody`, `LifecycleRail`.

## Reality check on data volume (verified live)

6 implementations, 4 distinct owners, 7 active team members, 14 stage-history rows, 4 commitments, 4 milestones, 1 open escalation, 3 success criteria with **0 observations**, 6 adoption areas with **0 observations**, 1 graduation, 1 CS handoff, 3 audit rows.

Consequences for honesty:
- Owner workload and stage distribution are supportable but small-n — present as counts and named rows, never as percentages, averages or charts.
- Value-proof and adoption sections are currently mostly "not yet measured". That is the *correct* leadership signal (coverage gap), not a reason to fake progress.
- Trend/velocity: `implementation_stage_history` supports *current dwell* and *completed stage durations*, nothing more. `audit_log` (3 rows) cannot support "deterioration over time".

## Positioning

- **Home** = what needs my attention now (one row per implementation, personally actionable).
- **Customer 360** = why this customer needs attention and what to do.
- **Leadership** (`/portfolio`, replacing the placeholder) = where the *team* needs management intervention: concentration, coverage, boundaries, and the calls only a lead can make (reassign, escalate internally, re-baseline a date, refuse a graduation).

Rule enforced throughout: Leadership never restates a triage row verbatim. It aggregates across implementations, or it surfaces the *management decision* attached to the row. Every row deep-links into Home's target or Customer 360.

## Proposed sections

### 1. Portfolio header strip — "state of the team"
- **Decision:** is the portfolio safe to leave alone this week, and how thinly is it spread?
- **Data:** `implementations` + `healthByImplementation()` + `buildQueue()` counts.
- **Reuse:** `healthByImplementation`, `buildQueue`, `StatusChip`.
- **New logic:** trivial roll-up counts (blocked / at risk / on track / no signal, act-now count, unassigned count).
- **Not built:** health-score index, week-over-week deltas, RAG percentages.

### 2. Accounts needing intervention (the core section)
- **Decision:** which accounts do *I* need to step into, and with what management action.
- **Data:** the `act_now` bucket plus any `needs_attention` row whose driving signal is an escalation, a critical/high risk, a slipped launch, or an unassigned owner.
- **Reuse:** `buildQueue()` rows as-is for reason/impact/next action; `waitingOn` (Home bundle already carries approvals? no — see note) to label the dependency.
- **New logic:** a small `leadershipAction(row, health)` mapper turning an existing signal into a *lead-level* action: reassign owner, join the customer call, escalate internally, agree a new launch date, unblock a cross-team dependency. Derived only from fields already present (owner, severity, dependency party, launch dates).
- **Note:** `waitingOn` needs `technical_solutions` and `approvals`, which the Home `TriageBundle` does not currently include. Either extend the existing loader with those two arrays (no schema change) or omit the dependency label. Recommend extending — it is the highest-value column for a lead.
- **Not built:** any intervention suggestion not traceable to a stored record.

### 3. Owner load and concentration of risk
- **Decision:** who is overloaded, who is carrying all the trouble, what to rebalance.
- **Data:** `implementations.owner_name/owner_id`, derived health, triage bucket, ARR, target launch dates.
- **Reuse:** `healthByImplementation`, `buildQueue`, `StatusChip`, `Panel`.
- **New logic:** `ownerLoad()` — group by owner: implementation count, act-now count, blocked/at-risk count, ARR under management, count of launches inside 30 days, plus an explicit "Unassigned" group. Flags: sole owner of >1 act-now account; sole owner of the only blocked account.
- **Not built:** capacity models, effort/hours estimates, utilisation %. No such data exists.

### 4. Lifecycle distribution and stage friction
- **Decision:** where is work piling up, which stage boundary is failing.
- **Data:** `current_stage`, `stage_entered_at`, `implementation_stage_history`.
- **Reuse:** `LIFECYCLE_STAGES`, phases, `stageLabel`, `LifecycleRail` visual language, `STAGE_FLAG_DAYS`, `daysSince`.
- **New logic:** `stageDistribution()` — per owned stage: implementations in it, longest current dwell, count over the 14-day flag. Optionally per-phase roll-up (delivery vs value vs steady-state) to show whether the team is delivery-bound or value-bound.
- **New logic (small, honest):** completed-stage dwell from `implementation_stage_history` where both `entered_at` and `exited_at` exist — shown as "observed dwell across N completed transitions", never as a benchmark or average cycle time.
- **Not built:** forecasting, throughput/velocity charts, expected-vs-actual stage duration targets.

### 5. Launch and delivery risk (next 30 days + already slipped)
- **Decision:** which dates must be renegotiated now, before the customer notices.
- **Data:** `target_launch_date`, `actual_launch_date`, milestones, `current_stage`.
- **Reuse:** `launchOverdue`, `launchStateConflict`, the existing milestone-missed rule inside triage.
- **New logic:** `launchBoard()` — three groups: slipped (target passed, no actual), landing ≤30 days, and data conflict (stage past Launch with no actual date). Ordered by ARR then date.
- **Not built:** confidence-to-launch scoring, predicted slip.

### 6. Value-proof coverage
- **Decision:** which accounts will reach graduation with nothing provable, and who to task with getting a baseline or an observation.
- **Data:** `success_criteria` (+ kickoff intake fields: baseline_value, baseline_period, target_value, target_date, due_stage, owners) and `success_criteria_observations`.
- **Reuse:** `proveValueGaps` / `proveValueGapSummary`, `PROVE_VALUE_LABEL`.
- **New logic:** `valueCoverage()` — per implementation: criteria count, how many baselined, how many observed, how many late against `due_stage`; plus a portfolio line "N of 6 implementations have no measurable criteria". Sorted worst-first.
- **Not built:** value realised / ROI figures, aggregate outcome claims. Zero observations exist; any aggregate number would be fiction.

### 7. Adoption coverage
- **Decision:** which accounts are heading into Adopt/Graduate with unobserved usage.
- **Data:** `adoption_areas` + `adoption_observations`.
- **Reuse:** `adoptionSummary`, `adoptionAreaLevel`, `ADOPTION_LEVEL_LABEL`.
- **New logic:** `adoptionCoverage()` — areas defined vs areas ever observed, count of areas with a workaround recorded, restricted to implementations at or past Build. Reported as coverage, not as adoption rate.
- **Not built:** adoption trend lines, usage percentages, engagement scores.

### 8. Stuck work and open escalations across the team
- **Decision:** what to raise internally today; which items have no owner or no movement.
- **Data:** open escalations, risks, issues, commitments, decisions from the existing triage bundle.
- **Reuse:** `openItems`, `severityRank`, `isOverdue`, `daysSince`.
- **New logic:** `stuckWork()` — flatten open items across all implementations into one list with age, owner, severity and parent customer; flag unowned and >14-day-old items. This is the one place Leadership goes *below* implementation level, and it is item-level, so it does not duplicate Home's per-implementation rows.
- **Not built:** SLA breach reporting; no SLA is stored.

### 9. Graduation gate review
- **Decision:** should this account be allowed to leave Implementation.
- **Data:** full Customer 360 record (`graduationReadiness` needs it).
- **Reuse:** `graduationReadiness`, `graduationReadinessSummary`, `READINESS_STATE_LABEL`, plus the existing verified/narrative split.
- **New logic:** none in the derivation. Scope-limited to implementations in Adopt or Graduate-to-CS, so the loader only needs the full record for those (typically 1–2 rows) — a targeted server-side extension, not a portfolio-wide fetch.
- **Not built:** a bulk readiness table across every implementation; the loader cost and the data thinness do not justify it.

### 10. Explicitly out of scope for Leadership
- Movement/deterioration over time beyond stage dwell — `audit_log` has 3 rows and nothing snapshots health history. No trend charts, no "improved since last week", no sparklines.
- Any financial reporting beyond echoing stored `arr` / `sow_value`.
- Owner performance ranking or scoring of people.
- A second copy of Home's queue.
- Team-lead identity/filtering ("my team") — there is no auth and no manager relationship in the data. The view is the whole portfolio, stated plainly, exactly as Home does today.

## Technical shape (for the build iteration)

- Route: replace the `/portfolio` placeholder; rename the nav label to **Leadership** (keep the `/portfolio` path).
- Loader: one new server fn, e.g. `getLeadership()`, built on the existing `getHome()` query set. Two additive extensions to the existing loader — `technical_solutions` + `approvals` on the triage bundle (for `waitingOn`), and `stage_history` durations — plus a scoped full-record fetch for graduation candidates. No new tables, columns, RLS or policies.
- New file: `src/lib/leadership.ts` holding only aggregation over existing derivations — `portfolioRollup`, `ownerLoad`, `stageDistribution`, `launchBoard`, `valueCoverage`, `adoptionCoverage`, `stuckWork`, `leadershipAction`. No new health, triage, lifecycle or readiness rules; all severity/health/lateness judgements stay in the current modules.
- UI: existing `Panel` / `StatusChip` / `StageBadge` density, every row deep-linking to Customer 360 with the right tab.
- Stephen's polish notes (prominent status, prominent owner) fold naturally into this layer's chip and owner styling, and are carried into the later refinement pass rather than this design.
