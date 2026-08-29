/**
 * Velocity — what one implementation actually did, in the order it did it.
 *
 * Deliberately NOT a rate. There is no stages-per-week, no projected finish
 * date, no trend line. A rate implies a forecast, and a forecast from this data
 * would be wrong twice over: lifecycle stages are not comparable units (Handoff
 * is a meeting, Build is a quarter), and a handful of implementations is not a
 * sample. Everything a rate would have been computed from is listed here
 * instead, so a reader can see for themselves that one stage took 91 days.
 *
 * Pure: no I/O.
 */
import { LIFECYCLE_STAGES, type LifecycleStageId } from "../lifecycle";
import { normalizeStage } from "../hub-format";
import type { OpenStageSegment, StageSegment } from "./stage-history";

export type Velocity = {
  implementation_id: string;
  /** Completed transitions, oldest first. The evidence, not a summary of it. */
  completed: StageSegment[];
  /** Distinct lifecycle stages this implementation has finished. */
  stages_completed: number;
  /** The stage it is in now, if history has an open row for it. */
  current: OpenStageSegment | null;
  /** Lifecycle stages after the current one. Zero at the end of the lifecycle. */
  stages_remaining: number;
  /** Days across all completed transitions. Not a duration of the project. */
  observed_days: number;
  /** The single slowest completed transition, which is usually the story. */
  slowest: StageSegment | null;
  /** Plain-language summary naming its own inputs. */
  reason: string;
};

const stageOrder = (stage: LifecycleStageId | null): number =>
  stage ? LIFECYCLE_STAGES.findIndex((s) => s.id === stage) : -1;

/**
 * Velocity for one implementation.
 *
 * `currentStage` comes from `implementations.current_stage` and is used only to
 * count what is left; the durations come from history alone.
 */
export function velocityFor(
  implementationId: string,
  completed: readonly StageSegment[],
  open: OpenStageSegment | null,
  currentStage: string | null | undefined,
): Velocity {
  const mine = completed
    .filter((s) => s.implementation_id === implementationId)
    .sort((a, b) => a.entered_at.localeCompare(b.entered_at));
  const observedDays = mine.reduce((sum, s) => sum + s.days, 0);
  const slowest = mine.reduce<StageSegment | null>(
    (worst, s) => (worst == null || s.days > worst.days ? s : worst),
    null,
  );
  const distinct = new Set(mine.map((s) => s.stage)).size;

  const currentIndex = stageOrder(normalizeStage(currentStage ?? open?.stage ?? null));
  const remaining = currentIndex < 0 ? 0 : LIFECYCLE_STAGES.length - currentIndex - 1;

  const reason =
    mine.length === 0
      ? open
        ? `No completed transition recorded yet — ${open.stage_label} has been open ${open.days_so_far}d.`
        : "No stage transition has ever been recorded for this implementation."
      : `${mine.length} recorded transition${mine.length === 1 ? "" : "s"} across ${distinct} stage${
          distinct === 1 ? "" : "s"
        }, ${observedDays}d observed in total${
          slowest ? `; slowest was ${slowest.stage_label} at ${slowest.days}d` : ""
        }${open ? `; currently ${open.days_so_far}d into ${open.stage_label}` : ""}.`;

  return {
    implementation_id: implementationId,
    completed: mine,
    stages_completed: distinct,
    current: open,
    stages_remaining: remaining,
    observed_days: observedDays,
    slowest,
    reason,
  };
}

/** Lifecycle stages strictly between the current stage and `upTo`, inclusive of `upTo`. */
export function stagesBetween(
  currentStage: string | null | undefined,
  upTo: LifecycleStageId,
): LifecycleStageId[] {
  const from = stageOrder(normalizeStage(currentStage));
  const to = stageOrder(upTo);
  if (from < 0 || to < 0 || to <= from) return [];
  return LIFECYCLE_STAGES.slice(from + 1, to + 1).map((s) => s.id);
}
