import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { humanize, stageLabel } from "@/lib/hub-format";
import { PACE_CHIP, PACE_LABEL, PACE_TEXT, type Pace } from "@/lib/pace";

const STATUS_CLASS: Record<string, string> = {
  on_track: "bg-status-ontrack text-status-ontrack-foreground",
  at_risk: "bg-status-risk text-status-risk-foreground",
  blocked: "bg-status-blocked text-status-blocked-foreground",
  idle: "bg-status-idle text-status-idle-foreground",
  no_signal: "border border-dashed border-border bg-transparent text-muted-foreground",
};

const DOT_CLASS: Record<string, string> = {
  on_track: "bg-status-ontrack-foreground",
  at_risk: "bg-status-risk-foreground",
  blocked: "bg-status-blocked-foreground",
  idle: "bg-status-idle-foreground",
  no_signal: "bg-muted-foreground/40",
};

export function StatusDot({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <span
        className={cn("h-1.5 w-1.5 rounded-full", DOT_CLASS[status] ?? "bg-muted-foreground")}
      />
      <span className="text-[12px]">{humanize(status)}</span>
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
        STATUS_CLASS[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {humanize(status)}
    </span>
  );
}

/**
 * Pace, shown as a fact rather than a mood.
 *
 * The `reason` is on the element as both `title` and `aria-label`, so the state
 * survives a screen reader, a greyscale print and anyone who cannot separate
 * the hues. The colour is reinforcement; the words are the message.
 *
 * `quiet` renders the on-pace and unknown levels as plain text with no chrome,
 * which is what stops a table of forty rows turning into a traffic jam. Pass it
 * anywhere the pace sits inline next to other text.
 */
export function PaceChip({
  pace,
  label,
  quiet = false,
  className,
}: {
  pace: Pace;
  /** Overrides the level word — e.g. a date, or "Day 9 of 14". */
  label?: ReactNode;
  quiet?: boolean;
  className?: string;
}) {
  const plain = pace.level === "on_pace" || pace.level === "unknown";
  const body = label ?? PACE_LABEL[pace.level];

  if (quiet && plain) {
    return (
      <span className={cn("text-[12px]", PACE_TEXT[pace.level], className)} title={pace.reason}>
        {body}
      </span>
    );
  }

  return (
    <span
      title={pace.reason}
      aria-label={`${PACE_LABEL[pace.level]}. ${pace.reason}`}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
        PACE_CHIP[pace.level],
        plain && "px-0",
        className,
      )}
    >
      {/* A filled dot for the two levels that want attention; a ring for the
          rest. Shape carries the same distinction as the colour does. */}
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          pace.level === "late" && "bg-status-blocked-foreground",
          pace.level === "watch" && "bg-status-risk-foreground",
          pace.level === "done" && "bg-status-ontrack-foreground",
          plain && "border border-muted-foreground/50 bg-transparent",
        )}
      />
      {body}
    </span>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] tracking-tight text-foreground">
      {stageLabel(stage)}
    </span>
  );
}

export function SeverityChip({ value }: { value: string }) {
  const map: Record<string, string> = {
    critical: "bg-status-blocked text-status-blocked-foreground",
    high: "bg-status-blocked text-status-blocked-foreground",
    medium: "bg-status-risk text-status-risk-foreground",
    low: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
        map[value?.toLowerCase()] ?? "bg-muted text-muted-foreground",
      )}
    >
      {humanize(value)}
    </span>
  );
}

/**
 * Attention band: the strongest treatment on a page. The value carries the
 * weight, the label stays a quiet micro-label.
 */
export function AttentionBand({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md bg-muted px-4 py-4", className)}>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function PrimarySignal({
  label,
  value,
  detail,
  emphasis = "high",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  /** high: the single most important line. medium: strong secondary. */
  emphasis?: "high" | "medium";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-foreground",
          emphasis === "high"
            ? "text-[17px] font-semibold leading-snug tracking-tight"
            : "text-[14px] font-medium leading-snug",
        )}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}

export function Panel({
  title,
  count,
  meta,
  action,
  children,
  className,
  id,
  level = "default",
}: {
  title: ReactNode;
  count?: number;
  meta?: ReactNode;
  /** Optional header-level control, e.g. an "Add …" write action. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  /**
   * Visual weight only — no behaviour change.
   * primary: decision-relevant, strongest heading.
   * supporting: shaded container, quieter heading.
   * reference: no card border at all — a quiet divided section that recedes.
   */
  level?: "primary" | "default" | "supporting" | "reference";
}) {
  const bordered = level !== "reference";
  return (
    <section
      id={id}
      className={cn(
        level === "supporting"
          ? "overflow-hidden rounded-md bg-surface"
          : bordered
            ? "overflow-hidden rounded-md border border-border bg-card"
            : "border-t border-border/70 pt-2",
        className,
      )}
    >
      <header
        className={cn(
          "flex items-center justify-between gap-3",
          bordered ? "px-3 py-2" : "px-0 py-1",
          level === "supporting" ? null : bordered ? "border-b border-border" : null,
          level === "primary" ? "bg-surface py-2.5" : null,
        )}
      >
        <h2
          className={cn(
            "flex items-baseline gap-2",
            level === "primary"
              ? "text-[14px] font-semibold tracking-tight text-foreground"
              : level === "supporting"
                ? "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                : level === "reference"
                  ? "text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground/80"
                  : "text-[12px] font-semibold uppercase tracking-[0.08em]",
          )}
        >
          {title}
          {count != null ? (
            <span className="font-mono text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
              {count}
            </span>
          ) : null}
        </h2>
        <div className="flex items-center gap-3">
          {meta ? <div className="text-[11px] text-muted-foreground">{meta}</div> : null}
          {action}
        </div>
      </header>
      {children}
    </section>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[13px]">{value ?? "—"}</dd>
    </div>
  );
}

export function NoRows({ label = "No records" }: { label?: string }) {
  return <p className="px-3 py-4 text-[12px] text-muted-foreground">{label}</p>;
}
