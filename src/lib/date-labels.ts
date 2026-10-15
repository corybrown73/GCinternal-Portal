/**
 * The four dates and their labels, one source each (Nikki, QA follow-ups
 * answer 1), so the same word never names two different dates:
 *
 * - "Functional by": the plan's live date (timeline.liveDate; the day it was
 *   ticked once it is). Internal and customer-facing.
 * - "Plan end": implementations.target_date ?? target_launch_date, the
 *   internal planned completion of all purchased work. Never shown to a
 *   customer under that name: a customer reads "Everything in your plan
 *   live by" (answer 5).
 * - "Target graduation": only the date agreed with the customer,
 *   intake.timeline.stage_targets.complete.
 * - "Actual go-live": implementations.go_live_at, the Go-Live milestone.
 */
export const FUNCTIONAL_BY = "Functional by";
export const PLAN_END = "Plan end";
export const TARGET_GRADUATION = "Target graduation";
export const ACTUAL_GO_LIVE = "Actual go-live";
/** The customer's words for the plan end. */
export const EVERYTHING_LIVE_BY = "Everything in your plan live by";

/** The "Functional by" date: the plan's live date, or the day it was ticked. */
export function functionalByDate(t: {
  liveDate: string | null | undefined;
  liveDoneOn?: string | null | undefined;
}): string | null {
  return t.liveDoneOn ?? t.liveDate ?? null;
}

/**
 * The "Plan end" date: implementations.target_date ?? target_launch_date. Every
 * surface that says "Plan end" (or, to a customer, "Everything in your plan
 * live by") reads it through here, so a hand edit that moved only
 * target_launch_date never puts two dates under the one label.
 */
export function planEndDate(impl: {
  target_date?: string | null;
  target_launch_date?: string | null;
}): string | null {
  return impl.target_date ?? impl.target_launch_date ?? null;
}
