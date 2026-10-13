import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ChevronRight, TriangleAlert } from "lucide-react";

import { getDealPulseFn } from "@/lib/deal-pulse.functions";
import { triageRowForCustomer360 } from "@/lib/home-triage";
import type { Customer360 } from "@/lib/hub-types";
import { TIER_REASON_CODES, reasonLabel, type TargetReasonCode } from "@/lib/complexity-tiers";
import { shortDay } from "@/lib/onboarding-timeline";
import { explainTargetChange } from "@/lib/presale.functions";
import { cn } from "@/lib/utils";

/**
 * The right-hand context of Current Implementation: what needs attention, who
 * holds the next step, the dates that matter, and the quick actions into the
 * existing panels. Every value is read from a record the tab already holds;
 * nothing here is a second source of truth, and nothing here writes except
 * the target-move explanation, which is the existing `explainTargetChange`.
 *
 * Presentation follows Home: soft white cards with a light border, 16px section
 * headings, semantic pastel chips, and Home's inset colour bar on a row that
 * needs attention. The tones below are Home's own values (its tone maps are not
 * exported, and Home is not changed for this).
 */

type Impl = NonNullable<Customer360["implementation"]>;

/** Home's semantic tones: the chip ink and tint, and the inset bar that marks a row. */
export const TONE = {
  critical: { chip: "bg-[#fde8e6] text-[#b42318]", bar: "#d03b3b", fill: "#d03b3b" },
  warning: { chip: "bg-[#fff1d6] text-[#93500a]", bar: "#fab219", fill: "#fab219" },
  info: { chip: "bg-[#e3eefc] text-[#1c5cab]", bar: "#2a78d6", fill: "#2a78d6" },
  good: { chip: "bg-[#e3f5e3] text-[#006300]", bar: "#0ca30c", fill: "#0ca30c" },
  muted: { chip: "bg-muted text-muted-foreground", bar: "", fill: "" },
} as const;

/** The card every block sits in, as Home's sections do. */
export const CARD = "rounded-lg border border-border bg-card";

/**
 * The exceptional thing, when there is one: the same triage row Home runs for
 * this implementation. Shown as a concise row, with the full detail behind a
 * disclosure. Renders nothing when the implementation is moving normally.
 */
export function NeedsAttentionCard({ record, dealId }: { record: Customer360; dealId: string }) {
  const row = triageRowForCustomer360(record);
  const pulse = useQuery({
    queryKey: ["deal-pulse", dealId],
    queryFn: () => getDealPulseFn({ data: { dealId } }),
  });
  if (!row || row.bucket === "moving") return null;
  const guide = pulse.data?.next ?? null;
  const tone = row.bucket === "act_now" ? TONE.critical : TONE.warning;
  return (
    <section
      className={cn(CARD, "px-4 py-3.5")}
      aria-label="Needs attention"
      style={{ boxShadow: `inset 3px 0 0 0 ${tone.bar}` }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-sm px-1.5 py-px text-[12px] font-medium", tone.chip)}>
          {row.bucket === "act_now" ? "Act now" : "Needs attention"}
        </span>
      </div>
      <p className="mt-2 text-[15px] font-semibold leading-snug text-foreground">{row.reason}</p>
      <details className="group mt-2.5">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-primary hover:underline">
          <ChevronRight
            className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90"
            aria-hidden
          />
          Full risk details
        </summary>
        <div className="mt-2.5 space-y-2 text-[13px] leading-relaxed text-muted-foreground">
          {row.impact ? <p>{row.impact}</p> : null}
          {row.dependency.party !== "none" ? <p>{row.dependency.reason}</p> : null}
          {guide ? (
            <p className="italic">
              {guide.label}: {guide.hint}
            </p>
          ) : null}
          <Link
            to="/how-it-works"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            How this works <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </details>
    </section>
  );
}

/**
 * Who holds the next move, and what is waiting on whom. The task to do is the
 * focus on the left, so it is not repeated here. A risk only appears when the
 * implementation is genuinely flagged.
 */
export function OwnershipCard({
  owner,
  ball,
  waiting,
  waitingText,
  healthWhy,
}: {
  owner: string | null;
  ball: { who: "customer" | "us"; detail: string } | null;
  waiting: Array<{ who: "customer" | "gocanvas"; what: string }>;
  /** A partner's own waiting statement, shown in place of the standard list. */
  waitingText: string | null;
  healthWhy: string | null;
}) {
  return (
    <section className={cn(CARD, "px-4 py-3.5")} aria-label="Ownership">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] text-muted-foreground">Owner</p>
          <p className="text-[15px] font-semibold text-foreground">{owner ?? "Nobody yet"}</p>
        </div>
        {ball ? (
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[12px] font-medium",
              ball.who === "customer" ? TONE.warning.chip : TONE.info.chip,
            )}
            title={ball.detail}
          >
            {ball.who === "customer" ? "With the customer" : "With us"}
          </span>
        ) : null}
      </div>

      <div className="mt-3.5">
        <p className="text-[13px] font-semibold text-foreground">Waiting on</p>
        {waitingText !== null ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-foreground">{waitingText}</p>
        ) : waiting.length === 0 ? (
          <p className="mt-1.5 text-[13px] text-muted-foreground">Nothing on anyone&apos;s desk</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {waiting.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] leading-snug">
                <span
                  className={cn(
                    "mt-px shrink-0 rounded-sm px-1.5 py-px text-[12px] font-medium",
                    w.who === "customer" ? TONE.warning.chip : TONE.info.chip,
                  )}
                >
                  {w.who === "customer" ? "Customer" : "GoCanvas"}
                </span>
                <span className="text-foreground">{w.what}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {healthWhy ? (
        <p
          className={cn(
            "mt-3.5 rounded-md px-3 py-2 text-[13px] leading-relaxed",
            TONE.warning.chip,
          )}
        >
          <span className="font-semibold">Why it is flagged:</span> {healthWhy}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Dates that matter beside the work: the tier's expected go-live, the recorded
 * go-live, the outcome, and the next dated item. The partner journey passes
 * `tierExpected={false}` because the tier is a standard-plan concept.
 */
export function KeyDatesCard({
  impl,
  customerId,
  next,
  showTierExpected,
}: {
  impl: Impl;
  customerId: string;
  next: { label: string; detail: string } | null;
  showTierExpected: boolean;
}) {
  const d = impl.dates;
  const rows: Array<{ label: string; value: string; hint: string }> = [];
  if (showTierExpected && d?.tier_expected) {
    rows.push({
      label: "Tier expected",
      value: shortDay(d.tier_expected),
      hint: "Go-Live the complexity tier expected, set at the close",
    });
  }
  if (d?.go_live) {
    rows.push({
      label: "Went live",
      value: shortDay(d.go_live),
      hint: "Operational Go-Live: the day TTV ends",
    });
  }
  return (
    <section className={cn(CARD, "px-4 py-3.5")} aria-label="Key dates">
      <h2 className="text-[16px] font-semibold">Key dates</h2>
      <dl className="mt-2.5 space-y-2.5 text-[13px]">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-3" title={r.hint}>
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="font-semibold tabular-nums text-foreground">{r.value}</dd>
          </div>
        ))}
        {impl.complete_outcome ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Outcome</dt>
            <dd className="font-semibold text-foreground">
              {impl.complete_outcome === "proven" ? "Proven" : "Not Proven"}
            </dd>
          </div>
        ) : null}
        {next ? (
          <div className="flex justify-between gap-3 rounded-md bg-muted/50 px-2.5 py-2">
            <dt className="text-muted-foreground">{next.label}</dt>
            <dd className="text-right font-semibold text-foreground">{next.detail}</dd>
          </div>
        ) : null}
      </dl>
      <TargetMoveNotice impl={impl} customerId={customerId} />
    </section>
  );
}

/**
 * A target that moved after the baseline and nobody has said why. Ported from
 * the retired workspace file: it is the only place a pending target-move reason
 * is answered, through the existing `explainTargetChange`. Once answered the
 * move stays in the history and stops asking.
 */
export function TargetMoveNotice({ impl, customerId }: { impl: Impl; customerId: string }) {
  const qc = useQueryClient();
  const explain = useServerFn(explainTargetChange);
  const [code, setCode] = useState<TargetReasonCode | "">("");
  const [note, setNote] = useState("");
  const pending = (impl.target_changes ?? []).filter((c) => !c.reason_code);
  const m = useMutation({
    mutationFn: (changeId: string) =>
      explain({
        data: { changeId, reasonCode: code as TargetReasonCode, note: note.trim() || null },
      }),
    onSuccess: async () => {
      setCode("");
      setNote("");
      await qc.invalidateQueries({ queryKey: ["customer360", customerId] });
    },
  });
  const explained = (impl.target_changes ?? []).filter((c) => c.reason_code);
  if (!pending.length && !explained.length) return null;
  const c = pending[0];
  return (
    <div className="mt-3.5 text-[13px]">
      {c ? (
        <div className={cn("flex flex-col gap-2.5 rounded-md p-3", TONE.warning.chip)}>
          <span className="inline-flex items-start gap-1.5 leading-snug">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            The target moved {c.from_date ? `from ${shortDay(c.from_date)} ` : ""}to{" "}
            <span className="font-semibold">{shortDay(c.to_date)}</span> after the baseline. Why?
          </span>
          <select
            className="h-9 rounded-md border border-border bg-card px-2 text-[13px] text-foreground"
            aria-label="Reason the target moved"
            value={code}
            disabled={m.isPending}
            onChange={(e) => setCode(e.target.value as TargetReasonCode | "")}
          >
            <option value="">Pick a reason…</option>
            {TIER_REASON_CODES.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
          <input
            className="h-9 rounded-md border border-border bg-card px-2 text-[13px] text-foreground"
            placeholder="One line of why (optional)"
            aria-label="Why the target moved"
            value={note}
            disabled={m.isPending}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            type="button"
            className="self-start rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
            disabled={!code || m.isPending}
            onClick={() => m.mutate(c.id)}
          >
            {m.isPending ? "Saving…" : "Save reason"}
          </button>
          {m.isError ? (
            <span className="text-destructive">
              {m.error instanceof Error ? m.error.message : "That did not save."}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground">
          Target moved {explained.length} time{explained.length === 1 ? "" : "s"} since the baseline
          · last: {reasonLabel(explained[0]!.reason_code)}
          {explained[0]!.note ? ` — ${explained[0]!.note}` : ""}
        </p>
      )}
    </div>
  );
}

/**
 * Progress from actual completion: "2 of 5 tasks done", with a bar that fills
 * only by what is done. Home's stage bars use the same track and tone.
 */
export function ProgressLine({
  done,
  total,
  label,
}: {
  done: number;
  total: number;
  label: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const complete = total > 0 && done === total;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted-foreground">
      <span className="tabular-nums">
        {done} of {total} {label}
      </span>
      <span aria-hidden className="block h-1.5 w-32 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, background: complete ? TONE.good.fill : TONE.info.fill }}
        />
      </span>
    </div>
  );
}

/**
 * The journey in Focus Mode: where the implementation is, with the full journey
 * one click away. It is an expandable header in Home's pattern: a chevron that
 * turns when open. The skip control stays on the bar, never behind the expanded
 * journey.
 */
export function JourneyBar({
  position,
  fallbackLabel,
  expanded,
  onToggle,
  skip,
}: {
  /** Where the current stage sits on the journey. Null before the journey starts. */
  position: { index: number; total: number } | null;
  fallbackLabel: string;
  expanded: boolean;
  onToggle: () => void;
  skip: ReactNode;
}) {
  return (
    <section
      className={cn(CARD, "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3")}
      aria-label="Implementation journey summary"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls="current-implementation-journey"
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 text-left"
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90",
          )}
          aria-hidden
        />
        <span className="text-[16px] font-semibold text-foreground">Implementation journey</span>
        <span className={cn("rounded-full px-2 py-px text-[12px] font-semibold", TONE.info.chip)}>
          {position ? `Stage ${position.index} of ${position.total}` : fallbackLabel}
        </span>
        <span className="ml-auto text-[13px] font-medium text-primary">
          {expanded ? "Hide full journey" : "View full journey"}
        </span>
      </button>
      {skip ? <div className="flex items-center">{skip}</div> : null}
    </section>
  );
}

/**
 * The tools that sit beside the work, as quiet secondary actions: updates, plan
 * dates, the Parking Lot and the customer dashboard preview. Each opens its
 * existing panel in place. The panels stay mounted, so a half-written update
 * survives closing the panel. They are text rows, not buttons that compete with
 * the task.
 */
export function ToolsCard({
  open,
  onOpen,
  showPlanDates,
  parking,
  dashboardLink,
}: {
  open: "meeting" | "update" | "dates" | null;
  onOpen: (which: "meeting" | "update" | "dates") => void;
  showPlanDates: boolean;
  /** Null when the Parking Lot is not offered on this journey. */
  parking: { openCount: number; expanded: boolean; onToggle: () => void } | null;
  dashboardLink: ReactNode;
}) {
  const row = (which: "meeting" | "update" | "dates", label: string) => (
    <button
      type="button"
      onClick={() => onOpen(which)}
      aria-expanded={open === which}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-muted",
        open === which ? "bg-muted font-medium text-foreground" : "text-foreground",
      )}
    >
      <span>{label}</span>
      <ChevronRight
        className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", open === which && "rotate-90")}
        aria-hidden
      />
    </button>
  );
  return (
    <section className={cn(CARD, "px-4 py-3.5")} aria-label="Updates and tools">
      <h2 className="text-[16px] font-semibold">Updates and tools</h2>
      <div className="mt-2.5 grid gap-0.5">
        {row("meeting", "Update from a customer meeting")}
        {row("update", "Add an implementation update")}
        {showPlanDates ? row("dates", "Adjust plan dates") : null}
        {parking ? (
          <button
            type="button"
            onClick={parking.onToggle}
            aria-expanded={parking.expanded}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-muted",
              parking.expanded ? "bg-muted font-medium text-foreground" : "text-foreground",
            )}
          >
            <span>Parking Lot</span>
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2 py-px text-[12px] font-medium",
                  parking.openCount > 0 ? TONE.warning.chip : TONE.muted.chip,
                )}
              >
                {parking.openCount === 0 ? "none open" : `${parking.openCount} open on our side`}
              </span>
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground",
                  parking.expanded && "rotate-90",
                )}
                aria-hidden
              />
            </span>
          </button>
        ) : null}
        <div className="px-2.5 py-2 text-[13px]">{dashboardLink}</div>
      </div>
    </section>
  );
}
