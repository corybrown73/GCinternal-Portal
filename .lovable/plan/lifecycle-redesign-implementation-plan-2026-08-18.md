# Lifecycle Redesign — Implementation Plan

Adopting Stephen's 11-stage journey without destabilising Home triage, Customer 360, Technical Solutions or Prove Value. No schema, data, code or UI changes are made by this plan.

---

## 1. Lifecycle redesign

### Proposed stages (exact)

| # | id | label | phase | intent (stage "done" means) |
|---|---|---|---|---|
| 1 | `qualify` | Qualify | `pre-sale` | Opportunity qualified by BDR/AE; fit, urgency and budget established. |
| 2 | `define-process` | Define the Process | `pre-sale` | Current process, desired future process and intended outcome captured end-to-end. |
| 3 | `technically-validate` | Technically Validate | `pre-sale` | Feasibility, integrations, dependencies, workflow requirements and field mapping confirmed; this output is the agreed scope. |
| 4 | `handoff` | Handoff | `transition` | Sales-to-implementation transfer of context, promises and risks accepted by TIS. |
| 5 | `plan-internal` | Plan Internally | `delivery` | Internal implementation plan, owners and target dates committed. |
| 6 | `align-external` | Align Externally | `delivery` | Customer stakeholders, success criteria and decision rights confirmed. |
| 7 | `build` | Build | `delivery` | Configuration, integrations and data migration executed. |
| 8 | `validate-iterate` | Validate / Iterate | `delivery` | UAT and iteration loops closed; readiness sign-off complete. |
| 9 | `launch` | Launch | `delivery` | Go-live executed and hypercare window opened. |
| 10 | `adopt` | Adopt | `value` | Usage breadth/depth at the agreed bar and success criteria showing measured movement. |
| 11 | `graduate-to-cs` | Graduate to CS | `steady-state` | Exit criteria met, CS handoff accepted, account self-sufficient. |

Phase bands change from four to five: `pre-sale` (1-3), `transition` (4), `delivery` (5-9), `value` (10), `steady-state` (11). Handoff gets its own band because it is now the ownership boundary, not just another step.

Ids for `handoff`, `build`, `launch`, `adopt` are deliberately **unchanged** — that preserves `launchStateConflict()` and every phase-derived check without touching them.

### Old → new mapping

| Current id | New id | Kind |
|---|---|---|
| `scoping` | `define-process` | reframed (commercial scope → process definition) |
| — | `qualify` | **new** |
| — | `technically-validate` | **new** |
| `handoff` | `handoff` | unchanged |
| `plan` | `plan-internal` | rename |
| `align` | `align-external` | rename |
| `build` | `build` | unchanged |
| `validate` | `validate-iterate` | rename + widened |
| `launch` | `launch` | unchanged |
| `prove_value` / `prove-value` | *(removed as a stage)* → alias to `adopt` | **removed** |
| `adopt` | `adopt` | unchanged |
| `graduate` | `graduate-to-cs` | merged |
| `cs` | `graduate-to-cs` | merged |

### Coherence of the linear 11-stage model

The count stays at 11 (two added at the front, two collapsed at the back), so `progress()` still reads `n / 11` and the rail still renders a single left-to-right spine. Ordering remains strictly linear and derived from array position in `LIFECYCLE_STAGES` — `stageIndex()` needs no change in shape. The meaningful shift is that the spine now starts before the deal exists, so "stage 4 of 11" means *entering implementation*, not *nearly a third done*. That is why Handoff gets its own phase band: it gives the UI a way to say "pre-sale" vs "in delivery" without doing arithmetic on the index.

---

## 2. Backward compatibility

### The four stage-bearing columns

- `implementations.current_stage` — constrained by `implementations_current_stage_check`. New ids are rejected until that constraint is replaced. Old ids must keep rendering until then.
- `implementation_stage_history.stage` — free text, 16 rows on old ids. The Journey timeline matches history rows to stage ids by `normalizeStage()`; unmatched rows make every stage look never-entered.
- `milestones.stage` — free text, 4 rows on old ids. Used in triage copy (`missedMilestone.stage`) and the Journey per-stage grouping.
- `success_criteria.due_stage` — free text, **0 rows today**, but the Zod enum in `success-criterion-input.ts` is generated from stage ids, so old stored values would fail validation on save.

### Recommendation: alias layer first, migrate second

Add an alias map inside `normalizeStage()` in `hub-format.ts`:

```text
scoping      -> define-process
plan         -> plan-internal
align        -> align-external
validate     -> validate-iterate
prove_value  -> adopt
prove-value  -> adopt
graduate     -> graduate-to-cs
cs           -> graduate-to-cs
```

`normalizeStage()` is already the single funnel for `stageLabel()`, `stageIndex()`, the Customers-list filter/sort and the Journey timeline lookup, so one map fixes every read path at once. Ship the alias layer **before** any data migration. That makes the rename a pure code change that is fully verifiable against untouched data — if anything renders wrong, no data has moved and rollback is a revert. The migration then becomes a no-op cosmetically, which is exactly the property that makes it safe to run.

Keep the alias map permanently, not as a temporary shim: `implementation_stage_history` is an append-only historical record, and rows written under the old vocabulary are legitimately old. Aliasing is the honest way to read them.

**No fabrication.** Norwood and Kettlewell have zero history rows, and no implementation has ever passed through a `qualify` or `technically-validate` stage. We will not synthesise entered/exited timestamps for stages that never happened. Those stages simply render as never-entered on the timeline for all five existing records, and the Journey tab should read that as "not recorded" rather than "skipped".

---

## 3. Ownership model

### The boundary

Stages 1-3 are Sales-led (BDR/AE qualifies, AE defines the process, SE joins for technical depth). Stage 4 is the transfer. Stages 5-11 are Implementation/TIS-led. This is a real accountability boundary, and the app currently cannot express it.

### What the schema can represent

- `implementations.owner_id` → a single implementation owner (`team` FK).
- `implementations.sales_owner` → **free text**, currently populated for all five records (Dylan Reyes, Priya Nathan ×2, Marcus Webb). This already carries the AE identity.
- `team` exists and can be joined for names.

### What it cannot represent

1. **No SE identity.** `sales_owner` is one text field; the SE who does Technical Validation has nowhere to live.
2. **No stage-scoped accountability.** For a record in Qualify, `owner_id` names a TIS person who is not yet accountable. There is no way to ask "who owns this record *right now*".
3. **`sales_owner` is unlinked text**, so pre-sale owners cannot be counted, filtered or joined the way `owner_id` can.

### Minimum genuine gap (later slice, not now)

The smallest honest fix is a way to resolve *responsible party for the current stage*. Two candidate shapes, decision deferred:

- **Derived-only (zero schema):** a `responsibleParty(stage)` helper returning `"sales" | "se" | "tis"` from the stage's phase, with the display name taken from `sales_owner` for pre-sale and `owner_id` for post-handoff. Covers triage and capacity correctly with no schema work.
- **Additive (one column):** link the SE — e.g. a nullable `se_owner_id` FK on `implementations` — only if we actually need SE workload views.

Start derived. Only add the column when a screen genuinely needs to count SE load.

### Keeping pre-handoff work out of TIS workload

Rules to apply when the triage slice lands (not now):

- **Home triage:** records in `qualify` / `define-process` / `technically-validate` must not produce TIS action items. Either exclude the pre-sale phase from `buildQueue()` entirely, or route them to a separate, clearly-labelled slice. Today's staleness rule (`> STAGE_FLAG_DAYS` in stage) would otherwise fire on a deal sitting in Qualify and read as an implementation failure.
- **Waiting On:** the current precedence is Customer → TS → TIS with no Sales/SE actor. A record blocked on AE process definition or SE feasibility currently renders as "waiting on TIS", which is actively misleading. Add `sales` / `se` actors to the precedence chain in the same slice that gates triage.
- **Workload / capacity / Portfolio:** any count of "implementations in flight" must filter to `phase !== "pre-sale"`. Pre-sale records are pipeline, not capacity.
- **Customers list:** pre-sale records should stay visible (they are real journeys) but their derived health must not be computed from delivery-oriented rules like launch-date slippage.

---

## 4. Define the Process

### Can the current model represent it?

Available today: `implementations.customer_goals` (free text), `requirements` (title, description, category, priority, status, source, `scope_status`), and `success_criteria` (metric/baseline/target).

| Concept | Representable today? |
|---|---|
| **Intended outcome** | **Yes.** `customer_goals` plus `success_criteria` (description/metric/baseline/target) already carry this properly, and Prove Value derives from it. No gap. |
| **Current customer process** | **No.** Nothing models "how the customer works today". `requirements` describes what the product must do, which is a different assertion. Cramming as-is state into `requirements` would corrupt the requirements → solution traceability spine. |
| **Desired future process** | **Partially, and wrongly.** Requirements are the *implications* of the future process, not the process itself. There is no ordered narrative of the future workflow. |

### Smallest additive model (do not build yet)

One table, two rows per implementation — a process description keyed by which side of the change it describes:

```text
process_definitions
  id, implementation_id
  kind          -- 'current' | 'future'
  summary       -- narrative
  created_at, updated_at
```

Requirements then link to the future process via the existing `trace_links` (`from_entity_type='requirement'`, `to_entity_type='process_definition'`, `relationship='derived_from'`), which extends the traceability spine rather than duplicating it. Intended outcome stays where it already lives — `customer_goals` + `success_criteria`. No new outcome model.

Explicitly out of scope: stakeholders, deal stages, competitors, ordered process steps, swimlanes, diagrams. This is a process *description* attached to an implementation, not a CRM or a process-modelling tool. If two rows of narrative turn out to be too coarse, that is a later, evidenced change.

---

## 5. Technical Validation

### What the existing model already covers

| Concern | Existing home | Adequate? |
|---|---|---|
| **Field mapping** | `field_mappings` (source_system, source_field, target_field, required, status, transformation_notes) | Yes — fully covers it, already has a write path. |
| **Integrations** | `requirements.category = 'Integration'` (one row today) + `technical_solutions.design_summary` / `configuration_details` | Adequate. Integrations are requirements with a category; no new model needed. |
| **Workflow requirements** | `requirements` (category `Functional`) | Yes. |
| **Feasibility** | `technical_solutions.status` (currently `in_review`) + `decisions` (title, rationale, decided_by, status) + `approvals` (`approved_entity_type`) | See verdict question below. |
| **Agreed scope** | `requirements.scope_status` (all four rows = `original`) + `approvals` on `approved_entity_type='requirement'` (one row today) | Yes — see below. |
| **Dependencies** | — | **Genuine gap.** |

### Is an explicit Technical Validation verdict required?

**No — and we should not add one.** The verdict is already expressible as the composition of three existing facts:

1. `technical_solutions.status` reaching a terminal validated state,
2. a `decisions` row carrying the rationale (`decided_by`, `rationale`, `decision_date`),
3. an `approvals` row with `approved_entity_type = 'technical_solution'` and `status = 'approved'`.

That is exactly the pattern the Technical Solutions write layer already implements, and `technicalSolutionNextAction` already derives "missing mappings or approvals" from it. Adding a `verdict` column would create a second source of truth that can silently disagree with the approval record. Instead, the lifecycle slice should define a **derived** `technicalValidationComplete(record)` predicate over those three facts, and use it as the exit criterion for the `technically-validate` stage.

The one thing the current statuses may not distinguish is *conditional* feasibility ("feasible if the customer upgrades their ERP"). That is a `decisions` row with a rationale, plus a dependency — not a new enum value. Confirm with Stephen before assuming we need it.

### Agreed scope — where it lives

**In `requirements`, via `scope_status`, frozen by approval at Handoff.** Do not create a scope table or a scope snapshot entity. The existing `scope_status` field already distinguishes original scope from later additions, and `approvals` on `approved_entity_type='requirement'` already records customer agreement. The lifecycle change means only that the *moment* scope is considered agreed moves to the exit of `technically-validate`, which is a derived-logic statement, not a data-model one. Removing Scope as a stage therefore costs nothing structurally.

### Smallest genuine gaps

1. **Dependencies** — nothing models "this depends on a customer-side prerequisite" (ERP upgrade, SSO provisioning, data cleanup). Today it would land in `risks_issues` or a `requirements` description, neither of which is honest. Smallest fix: reuse `trace_links` with `relationship='depends_on'` if the dependency is another tracked entity; a genuinely external prerequisite with an owner and a due date needs its own small additive table. Decide only once we see real examples.
2. **SE identity** on the validation (see §3).

---

## 6. Prove Value

### Relationship to Adopt and Graduate under the new lifecycle

Prove Value stops being a *stage* and becomes what it always was in the data model: a continuous measurement layer over `success_criteria` and `success_criteria_observations`. Its natural placement:

- Observations begin at **Launch** (first real usage produces first measurements).
- **Adopt** is where proving value is the primary work — the stage is not exitable while criteria remain unmet or unconfirmed.
- **Graduate to CS** requires criteria met *and* customer-confirmed (the `approvals` row with `approved_entity_type='success_criterion'`). That confirmation becomes the strongest graduation exit criterion we have.

Nothing about the Prove Value feature is deleted or redesigned. `proveValueState()`, the observation write path, and the confirmation flow all keep working unchanged — they never read `current_stage`.

### What `due_stage` should mean

`due_stage` = *the stage by which this criterion must show a measured result*. Under the new lifecycle the meaningful values narrow to `launch`, `adopt`, and `graduate-to-cs` (a criterion can also be *defined* earlier, during `align-external`, but that is when it is agreed, not when it is due). The field stays free text with the Zod enum regenerated from the new ids, and `prove_value` aliases to `adopt` for any historical value. There are **zero rows** today, so this carries no migration cost.

### Code that assumes `prove_value` is a lifecycle stage

- `src/lib/lifecycle.ts` — the `prove-value` entry, its `LifecycleStageId` union member, and the `value` phase band (which would otherwise be left holding only `adopt`).
- DB `implementations_current_stage_check` — includes `'prove_value'`.
- `src/components/success-criterion-write.tsx` + `src/lib/success-criterion-input.ts` — the `due_stage` select options and Zod enum are generated from `LIFECYCLE_STAGES`, so `prove-value` is currently an offerable value.
- `src/routes/settings.tsx` — renders the stage list including Prove Value and its intent.
- `src/components/lifecycle-rail.tsx`, `src/routes/customers.index.tsx` (filter options) — render it as a position on the spine.
- `customer360-derive.ts:209 launchStateConflict()` — treats every stage after `launch` as post-launch; `prove-value` is currently one of those. Behaviour is preserved because `launch` keeps its id and Adopt/Graduate-to-CS remain after it.

Notably, **no derived logic keys off the `prove-value` id itself** — no `isProveValueStage()` equivalent exists. Removal is therefore low-risk.

---

## 7. Graduate to CS

### Is the Graduate/CS distinction operationally meaningful?

Yes, and the code already relies on it. Today `isCsStage()` (`customer360-derive.ts:83`) suppresses stalled-in-stage noise specifically for `cs`, and `home-triage.ts` has a dedicated `csStalled` branch. Kettlewell & Co sits in `cs`, launched, with zero history rows — it is quiet *because* `cs` means "no longer our problem". `graduate` means something different: exit criteria met, but implementation still accountable.

Merging the two into one stage collapses "we are finishing up" and "CS owns this" into a single state. The consequence is concrete: on merge, Kettlewell's suppression must be preserved or it flips to a genuine at-risk entry on Home and Customer 360.

### Smallest non-stage mechanism (do not add yet)

The distinction is a *transfer event*, not a stage. Two options, cheapest first:

- **Derived (zero schema):** treat CS ownership as established when an `approvals` row exists with `approved_entity_type = 'implementation'` (or a `decisions` row recording the CS handoff). Reuses existing entities exactly as the Technical Validation verdict does.
- **Additive (one column):** a nullable `cs_handoff_at` timestamp on `implementations` — trivially honest, trivially queryable, and gives the Journey timeline a real date.

Recommendation: `cs_handoff_at` is the cleaner of the two and is one nullable column, but it is a **separate slice**. Within the lifecycle slice, the required change is narrower and non-negotiable: replace `isCsStage()`'s literal `"cs"` check with a phase check (`phase === "steady-state"`), so suppression survives the merge without depending on any new mechanism.

---

## 8. File-by-file impact map

| File | What changes | Why | Kind | Slice |
|---|---|---|---|---|
| `src/lib/lifecycle.ts` | Rewrite `LIFECYCLE_STAGES` and `LifecycleStageId` union to the 11 new ids/labels/intents; add `transition` to the `phase` union; drop `prove-value` | Single source of truth for ids, ordering, labels, phases | code-only | **Phase 1** |
| `src/lib/hub-format.ts` | Add `STAGE_ALIASES` map consulted by `normalizeStage()`; no change to `stageLabel`/`stageIndex` shape | One funnel makes every read path tolerate old ids | code-only | **Phase 1** |
| `src/lib/customer360-derive.ts` | Replace `isCsStage()` literal `"cs"` with a `phase === "steady-state"` check; add derived `technicalValidationComplete()` and `responsibleParty()` helpers; extend `waitingOn` precedence with sales/SE actors | Literal id breaks on the Graduate+CS merge; pre-sale stages need actors | code-only | rename in Phase 1; new helpers + waitingOn deferred to triage slice |
| `src/lib/home-triage.ts` | `csStalled` follows the new `isCsStage`; gate/exclude pre-sale phase from `buildQueue()`; stage labels flow through `stageLabel()` already | Keeps Kettlewell quiet; stops Qualify records generating TIS noise | code-only | suppression fix in Phase 1; pre-sale gating deferred |
| `src/routes/customers.index.tsx` | Filter options regenerate from `LIFECYCLE_STAGES` automatically; verify sort via `stageIndex` with aliased values; later, exclude pre-sale from delivery-oriented health | Mostly free; health scoping is a triage concern | code-only | verify in Phase 1; health scoping deferred |
| `src/routes/customers.$customerId.tsx` | Header badge, `progress()`, Overview Stage/Progress, Journey timeline, History rows all read through `normalizeStage`/`stageLabel` — verify only; Journey must show never-entered stages honestly | New stages have no history rows and must not look like failures | code-only | verify in Phase 1; Journey copy polish deferred |
| `src/components/lifecycle-rail.tsx` | Renders from `LIFECYCLE_STAGES`; check 11 labels still fit at 1154px (labels are longer: "Technically Validate", "Validate / Iterate") | Layout risk from longer labels | code-only (UI) | **Phase 1** (verify), visual tuning deferred |
| `src/routes/index.tsx` | `StageBadge` and the launch-state-conflict copy — verify only | Reads derived values | code-only | verify in Phase 1 |
| `src/routes/technical-solutions.$id.tsx` | `StageBadge` only — verify; later surfaces the derived validation verdict | No stage literals present | code-only | verify in Phase 1; verdict deferred |
| `src/routes/settings.tsx` | Renders new stage list + intents automatically; may want phase grouping shown | It is the lifecycle spec screen | code-only | **Phase 1** |
| `src/components/record.tsx` | `StageBadge` — verify only | Consumes `stageLabel` | code-only | verify in Phase 1 |
| `src/components/success-criterion-write.tsx` | `due_stage` options regenerate; consider narrowing to `launch`/`adopt`/`graduate-to-cs` | Offering all 11 stages as "due" is noise | code-only | options auto-update in Phase 1; narrowing deferred |
| `src/lib/success-criterion-input.ts` | Zod enum regenerates from new ids | Old stored values would fail validation (0 rows today) | code-only | **Phase 1** |
| `src/lib/hub.server.ts` | No stage literals — passes `current_stage`, `stage_entered_at`, history, `milestones.stage`, `due_stage` through | Read layer is already id-agnostic | no change | — |
| DB constraint `implementations_current_stage_check` | Drop and recreate with new ids | Blocks any write of a new id | **schema** | Phase 2 |

---

## 9. Data migration (based on currently seeded data — nothing changed)

### `implementations.current_stage` — 3 of 5 rows change

| Customer | Current | New |
|---|---|---|
| Meridian Logistics | `build` | `build` (no change) |
| Brightfield Health | `validate` | `validate-iterate` |
| Halyard Construction | `plan` | `plan-internal` |
| Norwood Utilities | `adopt` | `adopt` (no change) |
| Kettlewell & Co | `cs` | `graduate-to-cs` |

The CHECK constraint must be dropped and recreated with the new id list **before** these UPDATEs, in the same migration.

### `implementation_stage_history` — 16 rows, 8 change

`scoping` ×3 → `define-process`; `plan` ×3 → `plan-internal`; `align` ×2 → `align-external`; `validate` ×1 → `validate-iterate`; `handoff` ×3 and `build` ×2 unchanged.

Norwood and Kettlewell have **zero** history rows and will stay empty. No `qualify` or `technically-validate` rows will be created for any record.

### `milestones.stage` — 4 rows, 2 change

`plan` ×1 → `plan-internal`; `validate` ×1 → `validate-iterate`; `build` ×2 unchanged.

### `success_criteria.due_stage` — 0 rows

No migration. The database is empty of success criteria entirely, so Prove Value carries no migration cost.

### Other stage-bearing data found

- **`requirements.source` = `'scoping'` on all 4 rows.** This is not a lifecycle FK — it is a provenance note that happens to use the old stage vocabulary. Migrating it to `define-process` is optional and cosmetic. Recommendation: leave it for now and decide deliberately; changing it is not required for correctness and it is displayed as humanised text.
- `requirements.scope_status` = `original` ×4 — unaffected.
- No enum types, no FKs, no triggers reference stage values. The only constraint is the one CHECK.

---

## 10. Risks and decisions

### Must decide now

1. **Exact stage ids** — `plan-internal` vs `plan_internal`, `technically-validate` vs `technical-validation`. Ids leak into stored history rows, so churn here is expensive later.
2. **Keep `launch`, `build`, `adopt`, `handoff` ids stable?** Recommended yes; this is what keeps `launchStateConflict()` and the phase bands untouched.
3. **Graduate + CS merge, and how suppression is preserved.** Without the `isCsStage()` phase fix, Kettlewell starts alarming on Home. This must ship inside the lifecycle slice.
4. **Does `prove_value` alias to `adopt`?** Affects how any future historical row reads. Recommended yes.
5. **Are pre-sale records in scope for this app at all?** If Qualify-stage deals will never exist as `implementations` rows, stages 1-3 are documentation-only and several §3 concerns evaporate. This single answer changes the size of the whole programme and should be confirmed with Stephen first.

### Can defer

- SE identity / `se_owner_id`.
- `process_definitions` table (Define the Process).
- Dependencies model.
- `cs_handoff_at` timestamp.
- Narrowing `due_stage` options.
- Pre-sale exclusion from Portfolio/capacity views.
- Migrating `requirements.source = 'scoping'`.
- Journey-tab copy for never-entered stages.

### Should NOT be changed as part of the lifecycle redesign

- The Prove Value feature — criteria, observations, confirmations, `proveValueState()`.
- Technical Solutions write layer, field-mapping editing, Save/Cancel patterns.
- Home triage severity ranking and the ACT NOW / NEEDS ATTENTION / MOVING structure.
- `deriveHealth()` thresholds and `STAGE_FLAG_DAYS`.
- The requirements → decisions → solutions traceability spine and `trace_links`.
- `launchOverdue()` / `launchStateConflict()` semantics.
- Any UI redesign of Home or Customer 360.

---

## 11. Implementation sequence

| Phase | Scope | Verifiable by |
|---|---|---|
| **1. Lifecycle compatibility** | New `lifecycle.ts`; alias map in `normalizeStage()`; `isCsStage()` → phase check; Zod enum regenerates. **No data touched.** | Every screen renders correctly against untouched old-id data; Kettlewell still suppressed; rail fits at 1154px |
| **2. Lifecycle data migration** | Replace CHECK constraint; UPDATE 3 implementations, 8 history rows, 2 milestones — all in one migration | Cosmetically a no-op: screens identical before and after |
| **3. Triage / derived logic** | Pre-sale gating in `buildQueue()`; sales/SE actors in `waitingOn`; derived `responsibleParty()`; derived `technicalValidationComplete()` | Pre-sale records generate no TIS actions; a validation-blocked record says "waiting on SE" |
| **4. Ownership** | Only if Phase 3 proves derived ownership insufficient: `se_owner_id` | SE resolvable by name on pre-sale records |
| **5. Technical Validation model** | Dependencies model (only with real examples); surface the derived verdict on TS detail | Feasibility answerable without a new verdict column |
| **6. Define the Process model** | `process_definitions` (current/future) + `trace_links` from requirements | Current vs future process readable on Customer 360 |
| **7. UI changes** | Journey-tab treatment of never-entered stages; phase-banded rail; Portfolio pre-sale exclusion; `due_stage` narrowing | Visual review |

---

## Recommended Phase 1 slice (safe to build first)

**Lifecycle compatibility — code only, zero data and zero schema changes.**

1. Rewrite `src/lib/lifecycle.ts` with the 11 new ids, labels, intents and the five phase bands, keeping `handoff` / `build` / `launch` / `adopt` ids unchanged and dropping `prove-value`.
2. Add `STAGE_ALIASES` in `src/lib/hub-format.ts`, consulted by `normalizeStage()`, mapping all eight legacy ids forward.
3. Replace the literal `"cs"` in `isCsStage()` (`customer360-derive.ts:83`) with a `phase === "steady-state"` check so the Graduate+CS merge does not un-suppress Kettlewell.
4. Verify — do not restructure — every stage consumer: rail, Customers list filter/sort, Customer 360 header/Overview/Journey/History, Home badges and launch-conflict copy, Technical Solution header, Settings stage list, `due_stage` select.

Why this is the safest first move: the database still holds only old ids, so the alias layer is exercised in full by real data on every screen. If any rendering is wrong we find out with nothing migrated and a revert as the rollback. Phase 2's migration then becomes a change that should be invisible — and if it isn't, we know Phase 1 was incomplete rather than debugging both at once.

**Open question blocking Phase 1:** confirm the exact stage ids and whether pre-sale records will exist as `implementations` rows at all (§10, item 5).
