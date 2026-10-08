import { allMilestones, type Timeline } from "./onboarding-timeline";

/**
 * Auditable history of account-specific milestone date changes
 * (portal_milestone_date_changes / portal_milestone_date_baselines — see
 * migration 0078). Not to be confused with MilestoneOverride, the
 * plan-template admin knob in onboarding-timeline.ts, or with
 * intake.timeline.overrides itself, which this never replaces: the override
 * stays the one place every scheduling calculation reads "what date is it
 * today" from. This is the append-only record of how it got there.
 */

export type MilestoneDateChange = {
  milestoneKey: string;
  previousDate: string;
  newDate: string;
};

export type MilestoneDateChangePlan = {
  /** The milestone a person explicitly moved. */
  direct: MilestoneDateChange;
  /**
   * Every other milestone whose effective date moved only as a side effect
   * of the direct one's cascade — never a separate human edit, so never
   * given a reason of its own.
   */
  cascades: MilestoneDateChange[];
};

/**
 * What one explicit override does to the plan: pure, from the timeline
 * computed before and after applying it. `before` and `after` must be built
 * from the same intake except for the one new override at `milestoneKey` —
 * this does not re-derive the plan's cascade math, it only reads the two
 * already-computed timelines and reports what differs.
 *
 * Returns null when `milestoneKey` names no milestone on either timeline —
 * a caller mistake (a typo, a key from a different account), never valid
 * input to record.
 */
export function planMilestoneDateChange(
  before: Timeline,
  after: Timeline,
  milestoneKey: string,
): MilestoneDateChangePlan | null {
  const beforeByKey = new Map(allMilestones(before).map((m) => [m.key, m.date]));
  const afterByKey = new Map(allMilestones(after).map((m) => [m.key, m.date]));
  const previousDate = beforeByKey.get(milestoneKey);
  const newDate = afterByKey.get(milestoneKey);
  if (previousDate === undefined || newDate === undefined) return null;

  const cascades: MilestoneDateChange[] = [];
  for (const [key, afterDate] of afterByKey) {
    if (key === milestoneKey) continue;
    const beforeDate = beforeByKey.get(key);
    // A key missing from `before` (a cascaded service step that only exists
    // once the plan the new date unlocks) has nothing earlier to compare
    // against, so it is not a date that "moved" — left out, not invented.
    if (beforeDate !== undefined && beforeDate !== afterDate) {
      cascades.push({ milestoneKey: key, previousDate: beforeDate, newDate: afterDate });
    }
  }
  return { direct: { milestoneKey, previousDate, newDate }, cascades };
}

/**
 * True when `date` had already passed as of `today` — the fact a
 * commitment was overdue at the moment it was changed, preserved by the
 * caller rather than recomputed later, so moving the date can never erase
 * it after the fact.
 */
export function wasOverdueAsOf(date: string, today: string): boolean {
  return date < today;
}
