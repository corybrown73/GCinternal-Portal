import { cn } from "@/lib/utils";
import { humanize } from "@/lib/hub-format";

export const TICKET_CATEGORIES = [
  "technical",
  "training",
  "billing",
  "data",
  "integration",
  "other",
] as const;

export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const TICKET_STATUSES = [
  "open",
  "in_progress",
  "waiting_customer",
  "resolved",
  "closed",
] as const;

/**
 * First-response SLA countdown. Green while >12h remain, amber under 12h,
 * red once overdue. A responded ticket shows the quiet "responded" state.
 */
export function SlaChip({
  slaDueAt,
  firstResponseAt,
  breached,
}: {
  slaDueAt: string;
  firstResponseAt: string | null;
  breached: boolean;
}) {
  if (firstResponseAt) {
    return (
      <span className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Responded
      </span>
    );
  }
  const msLeft = new Date(slaDueAt).getTime() - Date.now();
  const overdue = msLeft <= 0;
  const cls = overdue
    ? "bg-status-blocked text-status-blocked-foreground"
    : msLeft < 12 * 3600_000
      ? "bg-status-risk text-status-risk-foreground"
      : "bg-status-ontrack text-status-ontrack-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        cls,
      )}
    >
      {overdue ? `Overdue ${fmtDuration(-msLeft)}` : `${fmtDuration(msLeft)} left`}
      {breached ? <span title="SLA breached">·B</span> : null}
    </span>
  );
}

export function fmtDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h >= 48) return `${Math.floor(h / 24)}d`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function BreachBadge() {
  return (
    <span className="inline-flex items-center rounded-sm bg-status-blocked px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-status-blocked-foreground">
      Breach
    </span>
  );
}

const PRIORITY_CLASS: Record<string, string> = {
  urgent: "bg-status-blocked text-status-blocked-foreground",
  high: "bg-status-risk text-status-risk-foreground",
  normal: "bg-muted text-muted-foreground",
  low: "bg-muted text-muted-foreground/70",
};

export function PriorityChip({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
        PRIORITY_CLASS[value] ?? "bg-muted text-muted-foreground",
      )}
    >
      {humanize(value)}
    </span>
  );
}

const TICKET_STATUS_CLASS: Record<string, string> = {
  open: "bg-status-risk text-status-risk-foreground",
  in_progress: "bg-status-ontrack text-status-ontrack-foreground",
  waiting_customer: "bg-status-idle text-status-idle-foreground",
  resolved: "bg-muted text-muted-foreground",
  closed: "bg-muted text-muted-foreground/70",
};

export function TicketStatusChip({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
        TICKET_STATUS_CLASS[value] ?? "bg-muted text-muted-foreground",
      )}
    >
      {humanize(value)}
    </span>
  );
}

export const inputClass =
  "w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
export const selectClass =
  "h-6 rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
export const microLabelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
export const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50";
export const primaryButtonClass =
  "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50";
