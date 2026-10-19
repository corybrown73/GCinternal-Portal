import { businessDaysBetween } from "./onboarding-timeline";

/**
 * "Someone is working this deal": the one definition the hourly reminders and
 * the daily report share (owner decision, QA item 6).
 *
 * A deal counts as worked when a PERSON logged something on it, or on its
 * live project, in the last WORKED_WITHIN business days: a note, an action
 * ticked, a plan tick, a file, a stage move or a date change. System writes
 * (the AI filling fields, a sync, the hourly sweep itself) never count, so a
 * deal nobody has touched cannot look busy because a job wrote to it.
 *
 * The server half (deal-activity.server.ts) reads where the app already
 * records those things; this half only decides.
 */
export const WORKED_WITHIN = 3;

/** One recorded moment of person activity on a deal (by deal id). */
export type ActivityStamp = { dealId: string; at: string };

/** The newest stamp per deal. Empty or malformed timestamps are ignored. */
export function newestActivity(stamps: Iterable<ActivityStamp>): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of stamps) {
    if (!s.dealId || typeof s.at !== "string" || s.at.length < 10) continue;
    const prev = out.get(s.dealId);
    if (!prev || prev < s.at) out.set(s.dealId, s.at);
  }
  return out;
}

/** Business days since the last activity (0 = today), or null when there was none. */
export function businessDaysQuiet(lastAt: string | null | undefined, today: string): number | null {
  if (!lastAt) return null;
  return Math.max(0, businessDaysBetween(lastAt.slice(0, 10), today));
}

/**
 * True when a person logged work within the window: the 'Waiting:' reminder
 * is then spared (the 'Stuck:' escalation still fires), and the deal is not
 * listed as untouched in the daily report.
 */
export function workedRecently(
  lastAt: string | null | undefined,
  today: string,
  within: number = WORKED_WITHIN,
): boolean {
  const quiet = businessDaysQuiet(lastAt, today);
  return quiet !== null && quiet < within;
}
