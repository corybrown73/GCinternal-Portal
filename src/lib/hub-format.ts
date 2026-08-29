import {
  LIFECYCLE_STAGE_MAP,
  PRE_HANDOFF_STAGE_LABELS,
  STAGE_ALIASES,
  type LifecycleStageId,
} from "./lifecycle";

export const STAGE_FLAG_DAYS = 14;

export function normalizeStage(raw: string | null | undefined): LifecycleStageId | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/_/g, "-");
  if (key in LIFECYCLE_STAGE_MAP) return key as LifecycleStageId;
  return STAGE_ALIASES[key] ?? null;
}

/** True when the value is an upstream (pre-handoff) step this app does not own. */
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

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
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
