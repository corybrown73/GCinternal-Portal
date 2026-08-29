/**
 * Slip attribution — where a launch date went, named by stage.
 *
 * Three things this refuses to do:
 *
 * 1. **Blame the current stage.** Slip is noticed at the end, so whichever
 *    stage a project is sitting in when someone looks would always take the
 *    blame. Attribution runs over the whole recorded sequence; the current
 *    stage appears only if it too is over its own target.
 * 2. **Blame a person.** A stage that ran long is where the time went, not
 *    whose fault it was. Nothing here reads an owner.
 * 3. **Force the arithmetic to close.** What the stages do not explain is
 *    reported as `unattributed_days`, and when the overruns exceed the slip
 *    that is reported too (`over_explained_days`) rather than silently clamped
 *    into a tidy split.
 *
 * The target is the CURRENT `target_launch_date`. Nothing in the schema records
 * the original one — `audit_log` has no writer — so a slip "against the
 * original plan" would be invented. The caller renders that caveat; this module
 * states it in `basis`.
 *
 * Pure: no I/O.
 */
import { fmtDate } from "../hub-format";
import type { DwellComparison } from "./dwell";
import { dwellVsTarget, targetFor, type ImplementationTargets } from "./dwell";
import type { OpenStageSegment, StageSegment } from "./stage-history";
import { DAY_MS } from "./stage-history";

export type SlipContribution = {
  stage_label: string;
  entered_at: string;
  /** Null while the stage is still open. */
  exited_at: string | null;
  days: number;
  target_days: number;
  days_over: number;
  in_flight: boolean;
};

export type SlipAttribution =
  | {
      slipped: false;
      /** Why there is nothing to attribute. */
      reason: string;
    }
  | {
      slipped: true;
      slip_days: number;
      /** What the slip was measured against, stated so nobody assumes a baseline. */
      basis: string;
      attributable: boolean;
      contributions: SlipContribution[];
      attributed_days: number;
      unattributed_days: number;
      /** Overruns beyond the slip itself — the plan absorbed time somewhere. */
      over_explained_days: number;
      reason: string;
    };

type SlipImpl = {
  id: string;
  target_launch_date?: string | null;
  actual_launch_date?: string | null;
};

const dayDiff = (fromIso: string, toMs: number): number => {
  const from = new Date(fromIso).getTime();
  if (Number.isNaN(from)) return 0;
  return Math.round((toMs - from) / DAY_MS);
};

/**
 * Attribute one implementation's launch slip to the stages that ran over their
 * own template targets.
 */
export function slipAttribution(
  impl: SlipImpl,
  completed: readonly StageSegment[],
  open: OpenStageSegment | null,
  targets: ImplementationTargets,
  now: Date = new Date(),
): SlipAttribution {
  if (!impl.target_launch_date) {
    return { slipped: false, reason: "No target launch date is recorded, so there is no slip." };
  }
  const endMs = impl.actual_launch_date
    ? new Date(impl.actual_launch_date).getTime()
    : now.getTime();
  if (Number.isNaN(endMs)) {
    return { slipped: false, reason: "The recorded launch date could not be read." };
  }
  const slipDays = dayDiff(impl.target_launch_date, endMs);
  if (slipDays <= 0) {
    return {
      slipped: false,
      reason: impl.actual_launch_date
        ? `Launched ${fmtDate(impl.actual_launch_date)}, on or before the ${fmtDate(impl.target_launch_date)} target.`
        : `Target launch ${fmtDate(impl.target_launch_date)} has not passed.`,
    };
  }

  const basis = impl.actual_launch_date
    ? `Actual launch ${fmtDate(impl.actual_launch_date)} against the target of ${fmtDate(impl.target_launch_date)}. Only the current target is stored — a date that was moved leaves no record.`
    : `Today against the target of ${fmtDate(impl.target_launch_date)}, with no actual launch recorded. Only the current target is stored — a date that was moved leaves no record.`;

  const mine = completed.filter((s) => s.implementation_id === impl.id);
  const comparisons: DwellComparison[] = mine.map((s) =>
    dwellVsTarget(s, targetFor(targets, impl.id, s.stage)),
  );
  const hasAnyTarget = comparisons.some((c) => c.target_days != null);

  const contributions: SlipContribution[] = comparisons
    .filter((c) => c.verdict === "over_target" && c.target_days != null && c.days_over != null)
    .map((c) => ({
      stage_label: c.segment.stage_label,
      entered_at: c.segment.entered_at,
      exited_at: c.segment.exited_at,
      days: c.segment.days,
      target_days: c.target_days as number,
      days_over: c.days_over as number,
      in_flight: false,
    }));

  // The stage in flight counts only if it has ALREADY exceeded its own target.
  if (open && open.implementation_id === impl.id) {
    const openTarget = targetFor(targets, impl.id, open.stage);
    if (openTarget != null && open.days_so_far > openTarget) {
      contributions.push({
        stage_label: open.stage_label,
        entered_at: open.entered_at,
        exited_at: null,
        days: open.days_so_far,
        target_days: openTarget,
        days_over: open.days_so_far - openTarget,
        in_flight: true,
      });
    }
  }

  const attributable = hasAnyTarget || contributions.length > 0;
  if (!attributable) {
    return {
      slipped: true,
      slip_days: slipDays,
      basis,
      attributable: false,
      contributions: [],
      attributed_days: 0,
      unattributed_days: slipDays,
      over_explained_days: 0,
      reason: `${slipDays}d late, and it cannot be attributed: no stage on this implementation has a recorded target duration, so there is nothing to have run over.`,
    };
  }

  contributions.sort((a, b) => b.days_over - a.days_over);
  const attributedDays = contributions.reduce((sum, c) => sum + c.days_over, 0);
  const unattributed = Math.max(0, slipDays - attributedDays);
  const overExplained = Math.max(0, attributedDays - slipDays);

  const named = contributions
    .slice(0, 3)
    .map((c) => `${c.stage_label} +${c.days_over}d${c.in_flight ? " (still open)" : ""}`)
    .join(", ");

  const reason =
    contributions.length === 0
      ? `${slipDays}d late, and no stage ran over its target — the time went somewhere the plan does not describe.`
      : `${slipDays}d late. Stages over their target account for ${attributedDays}d (${named})${
          unattributed > 0 ? `; ${unattributed}d is not explained by any stage` : ""
        }${
          overExplained > 0
            ? `; overruns exceed the slip by ${overExplained}d, so time was recovered elsewhere or the target moved`
            : ""
        }.`;

  return {
    slipped: true,
    slip_days: slipDays,
    basis,
    attributable: true,
    contributions,
    attributed_days: attributedDays,
    unattributed_days: unattributed,
    over_explained_days: overExplained,
    reason,
  };
}
