import {
  LIFECYCLE_STAGE_MAP,
  PRE_HANDOFF_STAGE_LABELS,
  STAGE_ALIASES,
  type LifecycleStageId,
} from "./lifecycle";
import { daysSinceInstant } from "./dates";

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

export function stageLabel(raw: string | null | undefined): string {
  const id = normalizeStage(raw);
  if (id) return LIFECYCLE_STAGE_MAP[id].label;
  if (!raw) return "—";
  return PRE_HANDOFF_STAGE_LABELS[raw.trim().toLowerCase().replace(/_/g, "-")] ?? raw;
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

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${fmtDate(value)} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}`;
}

export function fmtMoney(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
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
