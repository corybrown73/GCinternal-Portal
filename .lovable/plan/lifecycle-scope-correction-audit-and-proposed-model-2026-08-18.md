# Lifecycle scope correction — audit and proposed model

No code, schema or data changes made. This is the impact assessment only.

## 1. Proposed implementation lifecycle (8 stages, we own all of them)

| # | id | label | phase | leads |
|---|---|---|---|---|
| 1 | `handoff` | Handoff | `intake` | Implementation receives the work (AE/SE appear only as inbound context) |
| 2 | `plan-internal` | Plan Internally | `delivery` | Implementation |
| 3 | `align-external` | Align Externally | `delivery` | Implementation |
| 4 | `build` | Build | `delivery` | Implementation (+ PS conditional overlay) |
| 5 | `validate-iterate` | Validate / Iterate | `delivery` | Implementation |
| 6 | `launch` | Launch | `delivery` | Implementation |
| 7 | `adopt` | Adopt | `value` | Implementation |
| 8 | `graduate-to-cs` | Graduate to CS | `steady-state` | Implementation → CS |

Closed/Won is the **entry trigger**, not a stage: the existence of an implementation record already asserts the opportunity was won. Represent it as a caption on the rail before Handoff (e.g. "Closed / Won →") and nothing else — no id, no index, no history row, no filter value.

Stephen's pre-handoff steps (Qualify, Define the Process, Technically Validate) become documentation-only on Settings: a short "Upstream (not owned by this app)" note listing them, with no ids, no ownership, no behaviour.

## 2. Stages: keep / remove / rename

- **Keep unchanged (ids and labels):** `handoff`, `plan-internal`, `align-external`, `build`, `validate-iterate`, `launch`, `adopt`, `graduate-to-cs`.
- **Remove as stages:** `qualify`, `define-process`, `technically-validate` — delete from `LIFECYCLE_STAGES`, `LifecycleStageId`, and the `pre-sale` phase.
- **Renames:** none. Every kept id already matches the target model, so no data rename is needed for `current_stage`.
- **Phase bands:** `pre-sale` disappears; `transition` becomes `intake` (Handoff is now stage 1, an intake step, not a mid-journey transfer). `delivery`, `value`, `steady-state` unchanged.
- **Boundaries:** keep both. `sales-to-implementation` stays on Handoff (it is the app's inbound edge), `implementation-to-cs` stays on Graduate.

## 3. Logic that depends on the current 11-stage model

- `progress()` in `src/lib/customer360-derive.ts` — hardcodes `total: 11`. Must become 8 (or better, derive from `LIFECYCLE_STAGES.length`).
- `stageIndex()` / `normalizeStage()` in `src/lib/hub-format.ts` — index shifts by 3 for every kept stage. Safe because every consumer compares indices to each other, never to a constant.
- `launchStateConflict()` — compares `stageIndex(current) > stageIndex("launch")`. Relative, so unaffected.
- `isCsStage()` — phase-based on `steady-state`. Unaffected.
- `LifecycleRail` (`src/components/lifecycle-rail.tsx`) — renders all stages; drops from 11 to 8 chips, which also relieves the deferred horizontal-overflow issue at narrow widths.
- Customers list (`src/routes/customers.index.tsx`) — stage filter options and stage sort come from `LIFECYCLE_STAGES`; the three removed options disappear.
- Journey tab (`src/routes/customers.$customerId.tsx`) — timeline iterates `LIFECYCLE_STAGES` and matches history rows via `normalizeStage`. Renders 8 rows after the change.
- Success criteria (`src/lib/success-criterion-input.ts`) — the Zod `due_stage` enum is generated from stage ids, so it narrows from 11 to 8 values.
- DB `implementations_current_stage_check` — currently permits all 11 ids including the three pre-handoff ones.

## 4. What happens to the pre-handoff work just added

The stage entries, their `pre-sale` phase, and the BDR/AE/SE role metadata come out of the lifecycle array. The role *vocabulary* (`LifecycleRole`, including `BDR`/`AE`/`SE`) stays in the type so the Handoff stage can still name AE/SE as inbound support without implying ownership. No Sales/SE ownership logic exists today and none gets added.

The three `define-process` rows in `implementation_stage_history` (migrated from the old `scoping`) are real recorded history and must not be deleted or rewritten. They stay readable through `STAGE_ALIASES`, which keeps `scoping`/`define-process` mapping to a label even though the stage is no longer part of the journey — the Journey tab should show them in a small "Pre-handoff (recorded before this app owned the journey)" group above stage 1, not as an owned stage.

## 5. Prove Value / Adopt / Graduate logic

Unchanged. `adopt` and `graduate-to-cs` keep their ids and phases, `proveValueState()`, `waitingOn`, Home triage and the CS-suppression rule all read phases or relative indices. `due_stage` has **0 rows** in the database, so narrowing the enum cannot invalidate stored data.

## 6. Data migration required for the 5 seeded implementations

**None.** Verified against the live database:

- `implementations.current_stage`: `plan-internal`, `build`, `validate-iterate`, `adopt`, `graduate-to-cs` — all five already sit inside the 8-stage model.
- `implementation_stage_history` (14 rows): `handoff` 3, `plan-internal` 3, `align-external` 2, `build` 2, `validate-iterate` 1, `define-process` 3 → only the 3 `define-process` rows fall outside, and they are kept as historical fact.
- `milestones` (4 rows): `plan-internal` 1, `build` 2, `validate-iterate` 1 — all in scope.
- `success_criteria.due_stage`: 0 rows.

The only DB change that will eventually be needed is replacing the CHECK constraint to drop the three pre-handoff ids — schema work, deferred until you approve it.

## 7. Downstream impact

| Area | Impact |
|---|---|
| Home triage | None behaviourally. No record sits in a removed stage; severity ranking uses status/commitments/tenure, not absolute index. |
| Customers list | Stage filter loses 3 options; stage sort ordering identical for existing rows. |
| Customer 360 header | Progress reads "4 of 8" instead of "7 of 11" — a labelling change, same position in the journey. |
| Journey tab | 8 owned rows plus a separate pre-handoff historical group for the 3 `define-process` rows. |
| Technical Solutions | No stage dependency. Untouched. |
| `success_criteria.due_stage` | Enum narrows to 8; no stored rows affected. |
| Stage history | Preserved byte-for-byte; read through the alias layer. |
| Settings | Lifecycle list shows 8 owned stages; pre-handoff steps demoted to a non-owned contextual note. |

## Proposed implementation order (on approval)

1. Code-only: trim `LIFECYCLE_STAGES` to 8, rename the `transition` phase to `intake`, derive `progress()` total from the array, add the pre-handoff historical group on Journey, and update Settings copy.
2. Separately, and only when you say so: replace the `current_stage` CHECK constraint.
