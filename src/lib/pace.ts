import { STAGE_FLAG_DAYS } from "./hub-format";

/**
 * Is this on pace, or is it slipping?
 *
 * One place decides, so Home, the Customers list and the 360 cannot disagree
 * about whether the same account is late — the same failure the "Waiting on"
 * backbone was built to prevent.
 *
 * THREE RULES THIS ENCODES, and they are what keep the colour useful:
 *
 * 1. ON PACE IS NOT A COLOUR. Only the exception is tinted. If every row is
 *    green the green stops meaning anything, and the eye has nowhere to land.
 *    `on_pace` and `unknown` render in the ordinary text colour.
 *
 * 2. COLOUR IS NEVER THE ONLY CHANNEL. Every level carries a `reason` written
 *    for a person — "6d over a 14d target", not "late". Anyone who cannot
 *    distinguish the hues reads exactly the same fact, and the reason is what
 *    goes in the tooltip and the screen-reader label.
 *
 * 3. NO TARGET IS NOT GOOD NEWS. Something with nothing to be measured against
 *    is `unknown`, never `on_pace`. The product's whole argument is that an
 *    absence of evidence is not evidence — so a missing target says "no target
 *    set" rather than quietly passing.
 */

export type PaceLevel = "done" | "on_pace" | "watch" | "late" | "unknown";

export type Pace = {
  level: PaceLevel;
  /** Why, in words, for the tooltip, the aria-label and colour-blind readers. */
  reason: string;
  /** Signed days past the target where meaningful: positive = over. */
  days?: number;
};

const dayMs = 86_400_000;

/** Whole days between two instants, floored, ignoring clock time. */
function daysBetween(a: Date, b: Date): number {
  const x = new Date(a);
  const y = new Date(b);
  x.setHours(0, 0, 0, 0);
  y.setHours(0, 0, 0, 0);
  return Math.round((x.getTime() - y.getTime()) / dayMs);
}

function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * A dated commitment: a launch date, a milestone, a due date.
 *
 * `completedAt` matters as much as the target — something delivered two days
 * late is a fact worth keeping, and reporting it as simply "done" would erase
 * the slip the moment it stopped hurting.
 */
export function datePace(
  target: string | null | undefined,
  completedAt?: string | null,
  now: Date = new Date(),
): Pace {
  const targetDate = parse(target);
  const done = parse(completedAt);

  if (done) {
    if (!targetDate) return { level: "done", reason: "Delivered. No target date was set." };
    const over = daysBetween(done, targetDate);
    if (over > 0) {
      return {
        level: "done",
        days: over,
        reason: `Delivered ${plural(over, "day")} after target.`,
      };
    }
    if (over < 0) {
      return {
        level: "done",
        days: over,
        reason: `Delivered ${plural(-over, "day")} early.`,
      };
    }
    return { level: "done", days: 0, reason: "Delivered on target." };
  }

  if (!targetDate) return { level: "unknown", reason: "No target date set." };

  const remaining = daysBetween(targetDate, now);
  if (remaining < 0) {
    return {
      level: "late",
      days: -remaining,
      reason: `${plural(-remaining, "day")} past target, not yet delivered.`,
    };
  }
  if (remaining === 0) return { level: "watch", days: 0, reason: "Target is today." };
  if (remaining <= 7) {
    return { level: "watch", days: -remaining, reason: `Due in ${plural(remaining, "day")}.` };
  }
  return { level: "on_pace", days: -remaining, reason: `Due in ${plural(remaining, "day")}.` };
}

/**
 * Time spent in a stage against the template's expectation.
 *
 * `target_duration_days` has existed on stage_instances since 0014 and nothing
 * has ever read it — so "8 days in Build" has been shown with no way to tell
 * whether that is early or twice as long as it should be.
 *
 * Without a target this falls back to STAGE_FLAG_DAYS, the stall threshold the
 * triage queue already uses. That fallback is reported honestly: the reason
 * says it is a general threshold, not this stage's own target, so nobody reads
 * a house default as a plan.
 */
export function dwellPace(
  enteredAt: string | null | undefined,
  targetDays: number | null | undefined,
  now: Date = new Date(),
): Pace {
  const entered = parse(enteredAt);
  if (!entered) return { level: "unknown", reason: "No stage-entry date recorded." };

  const days = Math.max(0, daysBetween(now, entered));
  const target = targetDays && targetDays > 0 ? targetDays : null;

  if (!target) {
    if (days >= STAGE_FLAG_DAYS) {
      return {
        level: "watch",
        days,
        reason: `${plural(days, "day")} in this stage. No target is set for it; ${STAGE_FLAG_DAYS} days is the general stall threshold.`,
      };
    }
    return {
      level: "unknown",
      days,
      reason: `${plural(days, "day")} in this stage. No target duration is set for it.`,
    };
  }

  const over = days - target;
  if (over > 0) {
    return {
      level: "late",
      days: over,
      reason: `Day ${days} of a ${plural(target, "day")} target — ${plural(over, "day")} over.`,
    };
  }
  // The last fifth of the budget is where a stage stops being comfortable.
  if (days >= target * 0.8) {
    return {
      level: "watch",
      days: over,
      reason: `Day ${days} of a ${plural(target, "day")} target.`,
    };
  }
  return {
    level: "on_pace",
    days: over,
    reason: `Day ${days} of a ${plural(target, "day")} target.`,
  };
}

/** The worst of several — a stage is only as on-pace as its worst signal. */
export function worstPace(paces: Pace[]): Pace {
  const rank: Record<PaceLevel, number> = { late: 0, watch: 1, unknown: 2, on_pace: 3, done: 4 };
  return (
    [...paces].sort((a, b) => rank[a.level] - rank[b.level])[0] ?? {
      level: "unknown",
      reason: "Nothing to measure.",
    }
  );
}

/**
 * Tailwind classes per level. Text-weight only for the quiet levels — a tinted
 * background is reserved for the two that want you to stop and look.
 */
export const PACE_TEXT: Record<PaceLevel, string> = {
  late: "text-status-blocked-foreground",
  watch: "text-status-risk-foreground",
  on_pace: "text-muted-foreground",
  done: "text-status-ontrack-foreground",
  unknown: "text-muted-foreground",
};

export const PACE_CHIP: Record<PaceLevel, string> = {
  late: "bg-status-blocked text-status-blocked-foreground",
  watch: "bg-status-risk text-status-risk-foreground",
  on_pace: "bg-transparent text-muted-foreground",
  done: "bg-status-ontrack text-status-ontrack-foreground",
  unknown: "bg-transparent text-muted-foreground",
};

/** A short word for the level, so the state is legible without the colour. */
export const PACE_LABEL: Record<PaceLevel, string> = {
  late: "Late",
  watch: "At risk",
  on_pace: "On pace",
  done: "Done",
  unknown: "No target",
};
