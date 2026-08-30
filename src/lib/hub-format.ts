import {
  stageDefinition,
  LIFECYCLE_STAGE_MAP,
  PRE_HANDOFF_STAGE_LABELS,
  STAGE_ALIASES,
  type LifecycleStageId,
} from "./lifecycle";
import { daysSinceInstant, isDateOnly } from "./dates";
import { termLabel } from "./terms";

export const STAGE_FLAG_DAYS = 14;

export function normalizeStage(raw: string | null | undefined): LifecycleStageId | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/_/g, "-");
  if (key in LIFECYCLE_STAGE_MAP) return key as LifecycleStageId;
  return STAGE_ALIASES[key] ?? null;
}

/** True when the value is a pre-sales step rather than a post-sale lifecycle stage. */
export function isPreHandoffStage(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return raw.trim().toLowerCase().replace(/_/g, "-") in PRE_HANDOFF_STAGE_LABELS;
}

/**
 * The name a person should see for a stage.
 *
 * Reads `stageDefinition`, not the compiled map, so a rename made in Admin →
 * Post-sale stages reaches every one of the twenty-two places that renders a
 * stage name. Before this it reached the database and stopped there, while the
 * admin page promised "Renaming a stage changes what people read".
 */
export function stageLabel(raw: string | null | undefined): string {
  const id = normalizeStage(raw);
  if (id) return stageDefinition(id)?.label ?? LIFECYCLE_STAGE_MAP[id].label;
  if (!raw) return "—";
  // A stage somebody added in the admin screen has no compiled id to normalize
  // to, so it is looked up by its own key before falling back to the pre-handoff
  // labels and finally to the raw value.
  const key = raw.trim().toLowerCase().replace(/_/g, "-");
  return stageDefinition(key)?.label ?? PRE_HANDOFF_STAGE_LABELS[key] ?? raw;
}

export function stageIndex(raw: string | null | undefined): number {
  const id = normalizeStage(raw);
  if (!id) return -1;
  return Object.keys(LIFECYCLE_STAGE_MAP).indexOf(id);
}

/**
 * Kept as the name every caller already uses; the counting lives in dates.ts.
 * This one is for INSTANTS — stage entry, escalation raised. A date-only column
 * belongs in `daysUntilDate` or `calendarDaysBetween`, which handle it as a
 * calendar date rather than as midnight somewhere.
 */
export function daysSince(iso: string | null | undefined): number | null {
  return daysSinceInstant(iso);
}

export function isOverdue(due: string | null | undefined): boolean {
  if (!due) return false;
  // Date-only values are due at the end of that day, so today is not yet overdue.
  if (!due.includes("T")) return due.slice(0, 10) < new Date().toISOString().slice(0, 10);
  return new Date(due).getTime() < Date.now();
}

/**
 * A calendar date. Rendered in UTC, unlabelled, on purpose.
 *
 * A `date` column has no time of day and no timezone — "2026-08-12" is the
 * twelfth wherever you read it — so a zone label here would be noise attached
 * to a value that does not have one. UTC is the frame because it is the frame
 * the day arithmetic in src/lib/dates.ts uses, and a date that disagrees with
 * the "12 days to launch" printed under it is the bug that rule exists to
 * prevent.
 */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * An instant — when something actually happened. Rendered in UTC, and SAID SO.
 *
 * THE BUG THIS FIXES. Every timestamp in the app was formatted with
 * `timeZone: "UTC"` and printed bare. "Resolved 30 Aug 18:20" read as 18:20 to
 * the person looking at it, who was in Eastern time, where it was 14:20. There
 * was nothing on screen to suggest otherwise — a four-hour error with no
 * visible cause, on the exact values people use to argue about SLA breaches.
 *
 * WHY THE LABEL RATHER THAN THE VIEWER'S OWN ZONE. Local time is what a person
 * really wants, and this is not the place it can be produced. These pages are
 * server-rendered: the server has no idea what zone the reader is in, so a
 * local render would differ between the server's HTML and the browser's first
 * paint, which is a hydration mismatch on every timestamp on the page. Doing it
 * properly means the zone travelling through React state and every call site
 * becoming a component — worth doing, and much larger than the fix for a
 * mislabelled string. Naming the zone makes every existing timestamp correct
 * now, and stays correct afterwards.
 */
export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  // A date-only value has no time of day. Printing "00:00" for it invents one,
  // and an invented midnight is indistinguishable from a real one.
  if (isDateOnly(value)) return fmtDate(value);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return `${fmtDate(value)} ${time} UTC`;
}

export function fmtMoney(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * An enum key, rendered for a person.
 *
 * Consults src/lib/terms.ts first, so the acronyms this company actually uses
 * come out right — "tam_se" as "TAM / SE" rather than "Tam se". Falls back to
 * underscores-to-spaces for anything the dictionary has no opinion on, which
 * is what makes a newly added enum value read plainly rather than wrongly.
 */
export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return termLabel(value) ?? value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

const OFFSET_BASIS_LABELS: Record<string, string> = {
  project_start: "project start",
  stage_entry: "stage entry",
  target_launch: "target launch",
};

/**
 * A template task's due date as a phrase: "stage entry +3d", "target launch
 * -14d", "on stage entry". The basis is echoed verbatim when it is one this
 * build does not know, so an added enum value degrades to readable rather than
 * to a wrong label.
 */
export function formatTaskOffset(basis: string | null | undefined, days: number | null): string {
  const label = basis ? (OFFSET_BASIS_LABELS[basis] ?? basis.replace(/_/g, " ")) : "stage entry";
  const offset = days ?? 0;
  if (offset === 0) return `on ${label}`;
  return `${label} ${offset > 0 ? "+" : "-"}${Math.abs(offset)}d`;
}
