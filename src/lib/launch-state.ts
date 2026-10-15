import { isOverdue } from "./hub-format";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

/**
 * Everything that records a launch. Any one of them means it happened:
 *
 * - `actual_launch_date`: typed by a person on the Edit implementation form.
 * - `go_live_at`: the plan's Go-Live tick (stampDealDates).
 * - `live_done_on`: the plan's live milestone ticked
 *   (intake.timeline.completed.live, the timeline's liveDoneOn).
 *
 * No automated path writes actual_launch_date, so reading it alone kept every
 * project whose target had passed in "not launched", ticks and all.
 */
export type LaunchRecord = {
  actual_launch_date?: string | null;
  go_live_at?: string | null;
  live_done_on?: string | null;
};

const day = (value: string | null | undefined): string | null =>
  value && ISO_DAY.test(value) ? value.slice(0, 10) : null;

/**
 * The day the project launched, or null when nothing records a launch. The
 * typed actual launch first, then the Go-Live tick, then the plan's live tick.
 * `plan` is the deal's facts, when the reader has them rather than the row.
 */
export function launchedOn(
  impl: LaunchRecord,
  plan?: { live_done_on?: string | null } | null,
): string | null {
  return (
    day(impl.actual_launch_date) ??
    day(impl.go_live_at) ??
    day(impl.live_done_on) ??
    day(plan?.live_done_on) ??
    null
  );
}

/** Plan end date (target_launch_date) has passed and nothing records a launch. */
export function launchOverdue(
  impl: LaunchRecord & { target_launch_date?: string | null },
  plan?: { live_done_on?: string | null } | null,
): boolean {
  return Boolean(
    !launchedOn(impl, plan) && impl.target_launch_date && isOverdue(impl.target_launch_date),
  );
}

/** The plan's live tick from a deal's intake, as an ISO day, or null. */
export function liveTickOf(intake: { timeline?: { completed?: Record<string, string> } } | null) {
  return day(intake?.timeline?.completed?.["live"] ?? null);
}
