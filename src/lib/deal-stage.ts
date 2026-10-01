import { LIFECYCLE_STAGES } from "./lifecycle";
import { isStage, STAGE_LABELS, STAGES, type AccountStage } from "./presale-stages";

/**
 * One stage for a deal, everywhere it is shown.
 *
 * A deal has a pipeline stage (Prospect → Closed Won → Pre-kickoff →
 * Onboarding → Complete). The project it becomes also carries the delivery
 * lifecycle (Kickoff, Build, Pilot, Launch…) that gates, journey templates
 * and history are built on. Showing both on the same card made one deal
 * read as four different stages. Every deal-facing surface — the header
 * badge, the Customers list, Home, "At a glance" — now reads THIS: the
 * linked deal's stage, or for a legacy project with no deal, the deal stage
 * its lifecycle implies. The lifecycle stays as project history under
 * Details.
 */

/** The last lifecycle stage: the project has been handed to CS. */
export const TERMINAL_LIFECYCLE_STAGE = "graduate-to-cs";

/** Lifecycle stage → the deal stage it implies. Null when it is not a lifecycle stage. */
export function dealStageForLifecycle(lifecycleStage: string): AccountStage | null {
  const ids = LIFECYCLE_STAGES.map((s) => s.id) as readonly string[];
  const idx = ids.indexOf(lifecycleStage);
  if (idx < 0) return null;
  if (lifecycleStage === TERMINAL_LIFECYCLE_STAGE) return "onboarding_complete";
  if (idx === 0) return "onboarding_kickoff";
  return "in_onboarding";
}

/**
 * The stage to show for a project: its deal's stage when it has one, else
 * what its lifecycle stage implies. A project always exists after the
 * close, so the fallback never invents a Prospect.
 */
export function dealStageFor(input: {
  deal_stage: string | null | undefined;
  current_stage: string | null | undefined;
}): AccountStage {
  if (input.deal_stage && isStage(input.deal_stage)) return input.deal_stage;
  return dealStageForLifecycle(input.current_stage ?? "") ?? "onboarding_kickoff";
}

/** The label for a deal stage: the pipeline's own name when given, else the built-in one. */
export function dealStageLabel(
  stage: string | null | undefined,
  names?: ReadonlyArray<{ key: string; label: string }>,
): string {
  if (!stage) return "—";
  const named = names?.find((s) => s.key === stage);
  if (named) return named.label;
  return isStage(stage) ? STAGE_LABELS[stage] : stage;
}

/** Position for sorting; unknown values sort last. */
export function dealStageIndex(stage: string | null | undefined): number {
  const i = stage ? (STAGES as readonly string[]).indexOf(stage) : -1;
  return i < 0 ? STAGES.length : i;
}

/** Filter options for a list of deal-linked projects, in pipeline order. */
export const DEAL_STAGE_OPTIONS: ReadonlyArray<{ value: AccountStage; label: string }> = STAGES.map(
  (s) => ({ value: s, label: STAGE_LABELS[s] }),
);

/**
 * "Stage N of M" against the pipeline. Field Fusion setup only counts when
 * the deal is in it, because no other deal ever passes through it; Negotiate
 * & Finalize likewise, since it is a pre-close wait, not a step every closed
 * deal took.
 */
export function dealStageProgress(stage: AccountStage): { position: number; total: number } {
  const rail = STAGES.filter(
    (s) =>
      (s !== "field_fusion_setup" || stage === "field_fusion_setup") &&
      (s !== "negotiate" || stage === "negotiate"),
  );
  return { position: rail.indexOf(stage) + 1, total: rail.length };
}
