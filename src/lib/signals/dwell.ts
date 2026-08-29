/**
 * Dwell — observed stage durations, and their comparison to a target somebody
 * chose in advance.
 *
 * Two rules carry this module:
 *
 * 1. **The target never comes from the observations.** A rolling median as the
 *    benchmark measures every project against itself, so nothing is ever late.
 *    Targets come from the template (`stage_instances.target_duration_days`,
 *    copied at instantiation) or there is no target and the comparison says so.
 *    Reading that column is not a provenance violation: a target is a template
 *    fact, not an observation of what happened.
 * 2. **Median and p90 are nearest-rank**, so the number returned is always one
 *    of the listed observations — you can click p90 and land on the transition
 *    that IS p90. Interpolation would produce a value that never happened.
 *
 * Nothing here returns a percentage. On-time is a triple of counts.
 *
 * Pure: no I/O.
 */
import type { LifecycleStageId } from "../lifecycle";
import { LIFECYCLE_STAGES } from "../lifecycle";
import type { StageSegment } from "./stage-history";

/** Target days per stage, keyed by normalized stage id. Template-sourced only. */
export type StageTargets = ReadonlyMap<LifecycleStageId, number>;

/**
 * Targets can differ per implementation (each carries its own template
 * version), so the lookup is keyed by both.
 */
export type ImplementationTargets = ReadonlyMap<string, StageTargets>;

export function targetFor(
  targets: ImplementationTargets,
  implementationId: string,
  stage: LifecycleStageId,
): number | null {
  return targets.get(implementationId)?.get(stage) ?? null;
}

/**
 * Nearest-rank order statistic: the smallest observation at or above the
 * requested fraction. Always returns a value that is in `values`.
 */
export function nearestRank(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.min(sorted.length, Math.ceil(fraction * sorted.length)));
  return sorted[rank - 1] ?? null;
}

export type DwellDistribution = {
  stage: LifecycleStageId;
  stage_label: string;
  /** The observations themselves. The statistics below are read off this list. */
  observations: StageSegment[];
  count: number;
  min_days: number;
  median_days: number;
  p90_days: number;
  max_days: number;
  /** The transition that IS the median / p90, so the figure can be opened. */
  median_segment: StageSegment;
  p90_segment: StageSegment;
};

/**
 * Observed dwell per stage, in lifecycle order. Stages with no completed
 * transition are omitted rather than shown as zero — zero would read as "fast".
 */
export function dwellByStage(completed: readonly StageSegment[]): DwellDistribution[] {
  const byStage = new Map<LifecycleStageId, StageSegment[]>();
  for (const segment of completed) {
    const list = byStage.get(segment.stage);
    if (list) list.push(segment);
    else byStage.set(segment.stage, [segment]);
  }

  const out: DwellDistribution[] = [];
  for (const stage of LIFECYCLE_STAGES) {
    const rows = byStage.get(stage.id);
    if (!rows || rows.length === 0) continue;
    const sorted = [...rows].sort((a, b) => a.days - b.days);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!first || !last) continue;
    // Nearest-rank on a list already sorted by days: the rank IS the index, so
    // the statistic and the segment behind it cannot disagree.
    const at = (fraction: number) =>
      sorted[Math.max(1, Math.min(sorted.length, Math.ceil(fraction * sorted.length))) - 1] ??
      first;
    const medianSegment = at(0.5);
    const p90Segment = at(0.9);
    out.push({
      stage: stage.id,
      stage_label: stage.label,
      observations: sorted,
      count: sorted.length,
      min_days: first.days,
      median_days: medianSegment.days,
      p90_days: p90Segment.days,
      max_days: last.days,
      median_segment: medianSegment,
      p90_segment: p90Segment,
    });
  }
  return out;
}

export type DwellVerdict = "within_target" | "over_target" | "no_target";

export type DwellComparison = {
  segment: StageSegment;
  verdict: DwellVerdict;
  target_days: number | null;
  /** Positive only when over. Null when there is no target to be over. */
  days_over: number | null;
  /** The sentence this comparison would put on screen. */
  reason: string;
};

/** One completed segment against its own implementation's template target. */
export function dwellVsTarget(segment: StageSegment, targetDays: number | null): DwellComparison {
  if (targetDays == null) {
    return {
      segment,
      verdict: "no_target",
      target_days: null,
      days_over: null,
      reason: `${segment.stage_label} took ${segment.days}d — no target duration is recorded for this stage, so there is nothing to compare it to.`,
    };
  }
  if (segment.days > targetDays) {
    return {
      segment,
      verdict: "over_target",
      target_days: targetDays,
      days_over: segment.days - targetDays,
      reason: `${segment.stage_label} took ${segment.days}d against a ${targetDays}d target — ${segment.days - targetDays}d over.`,
    };
  }
  return {
    segment,
    verdict: "within_target",
    target_days: targetDays,
    days_over: null,
    reason: `${segment.stage_label} took ${segment.days}d against a ${targetDays}d target.`,
  };
}

/**
 * On-time as three counts, never a rate.
 *
 * `no_target` is first-class: a percentage would quietly compute itself over
 * the ones that happen to have targets and present the answer as if it covered
 * everything.
 */
export type OnTimeCounts = {
  within: number;
  over: number;
  no_target: number;
  /** Segments contributing to `over`, so the count can name itself. */
  over_segments: DwellComparison[];
};

export function onTimeCounts(comparisons: readonly DwellComparison[]): OnTimeCounts {
  const over = comparisons.filter((c) => c.verdict === "over_target");
  return {
    within: comparisons.filter((c) => c.verdict === "within_target").length,
    over: over.length,
    no_target: comparisons.filter((c) => c.verdict === "no_target").length,
    over_segments: [...over].sort((a, b) => (b.days_over ?? 0) - (a.days_over ?? 0)),
  };
}

/** Compare every completed segment to its own implementation's targets. */
export function compareAll(
  completed: readonly StageSegment[],
  targets: ImplementationTargets,
): DwellComparison[] {
  return completed.map((s) => dwellVsTarget(s, targetFor(targets, s.implementation_id, s.stage)));
}
