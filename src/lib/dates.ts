/**
 * One place where days are counted.
 *
 * THE BUG THIS REPLACES. Four screens quoted two different numbers for the same
 * account. Fairview's target was 2 Aug; on 30 Aug, Home and Leadership said 28
 * days past, Customer 360 and Signals said 29.
 *
 * Three implementations had drifted apart:
 *
 *   * `hub-format.daysSince` — instant maths, floored;
 *   * `pace.daysBetween` — normalised both sides with LOCAL `setHours(0,0,0,0)`;
 *   * two identical `daysUntil` copies in home-triage and leadership —
 *     `Math.ceil` against `Date.now()`, no normalisation at all.
 *
 * The off-by-one came from the second. `target_launch_date` is a Postgres
 * `date`, so it arrives as "2026-08-02" and `new Date()` reads it as UTC
 * midnight. Normalising that with LOCAL midnight in UTC-4 walks it back a day —
 * while `fmtDate` renders the same value with `timeZone: "UTC"`. Arithmetic and
 * display were in different timezones, so the page disagreed with itself.
 *
 * THE RULE HERE. A date-only column is a CALENDAR DATE and is handled entirely
 * in UTC — parsed at UTC midnight, compared against UTC midnight today, and
 * displayed in UTC. Not because UTC is where anyone lives, but because it is
 * the one frame in which the number under a date and the date itself cannot
 * disagree. A timestamp is an INSTANT and is compared as an instant.
 *
 * The residual, stated rather than hidden: for the few hours a day when UTC has
 * rolled over and the Americas have not, "today" here is tomorrow there, so a
 * launch date can tick over early for a west-coast reader. That is a known cost
 * of keeping every surface consistent, and it is much smaller than the bug it
 * replaces. Fixing it properly means storing an intended timezone per project.
 *
 * Pure — no imports — so it runs identically on both sides of the wire.
 */

const DAY_MS = 86_400_000;

/** "2026-08-24" is a calendar date; "2026-08-24T10:00:00Z" is an instant. */
export function isDateOnly(value: string): boolean {
  return !value.includes("T");
}

/**
 * The UTC midnight that starts the day this value falls on.
 *
 * A date-only string is taken at face value. An instant is reduced to the UTC
 * day it happened on, which is what lets a completion timestamp be compared
 * against a target date without one of them silently carrying a time.
 */
function utcMidnight(value: string | Date): number | null {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t)
      ? null
      : Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  if (!value) return null;
  if (isDateOnly(value)) {
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return null;
    return Date.UTC(y, m - 1, d);
  }
  const parsed = new Date(value);
  const t = parsed.getTime();
  if (Number.isNaN(t)) return null;
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

/**
 * Whole calendar days from `from` to `to`. Positive when `to` is later.
 *
 * Both sides are reduced to their UTC day first, so this is exact rather than
 * rounded: two calendar dates are always a whole number of days apart, and any
 * rounding at this step is a bug waiting for a daylight-saving boundary.
 */
export function calendarDaysBetween(
  from: string | Date | null | undefined,
  to: string | Date | null | undefined,
): number | null {
  if (!from || !to) return null;
  const a = utcMidnight(from);
  const b = utcMidnight(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / DAY_MS);
}

/**
 * Days from today until a date-only target. Negative once it is past.
 *
 * This is the number "12 days to launch" and "28 days past target" are both
 * built from, so they can never disagree about the same date again.
 */
export function daysUntilDate(
  target: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!target) return null;
  return calendarDaysBetween(now, target);
}

/**
 * Whole days elapsed since an instant, floored, never negative.
 *
 * For timestamps — when a stage was entered, when an escalation was raised.
 * Clamped at zero because a clock skew that produces "-1 days in stage" is
 * noise, not information.
 */
export function daysSinceInstant(
  iso: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}
