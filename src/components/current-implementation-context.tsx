import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, TriangleAlert } from "lucide-react";

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
 */

type Impl = NonNullable<Customer360["implementation"]>;

/**
 * The exceptional thing, when there is one: the same triage row Home runs for
 * this implementation. Deal-linked projects get no header band, so this is the
 * only place their attention signal appears on the tab. Renders nothing when
 * the implementation is moving normally.
 */
export function NeedsAttentionCard({ record, dealId }: { record: Customer360; dealId: string }) {
  const row = triageRowForCustomer360(record);
  const pulse = useQuery({
    queryKey: ["deal-pulse", dealId],
    queryFn: () => getDealPulseFn({ data: { dealId } }),
  });
  if (!row || row.bucket === "moving") return null;
  const guide = pulse.data?.next ?? null;
  return (
    <section
      className="rounded-md border border-status-risk/40 bg-status-risk/5 px-4 py-3"
      aria-label="Needs attention"
    >
      <p className="text-[13px] font-semibold tracking-tight text-foreground">{row.reason}</p>
      {row.impact ? <p className="mt-0.5 text-[12px] text-muted-foreground">{row.impact}</p> : null}
      {row.dependency.party !== "none" ? (
        <p className="mt-1 text-[12px] text-muted-foreground">{row.dependency.reason}</p>
      ) : null}
      {guide ? (
        <p className="mt-2 text-[12px] italic text-muted-foreground">
          {guide.label}: {guide.hint}
        </p>
      ) : null}
      <Link
        to="/how-it-works"
        className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
      >
        How this works <ArrowRight className="h-3 w-3" />
      </Link>
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
    <section className="border-t border-border pt-3" aria-label="Ownership">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Owner
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-foreground">
        <span className="font-medium">{owner ?? "Nobody yet"}</span>
        {ball ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              ball.who === "customer"
                ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                : "bg-primary/10 text-primary",
            )}
            title={ball.detail}
          >
            {ball.who === "customer" ? "With the customer" : "With us"}
          </span>
        ) : null}
      </p>

      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Waiting on
      </p>
      {waitingText !== null ? (
        <p className="mt-1 text-[12px] text-foreground">{waitingText}</p>
      ) : waiting.length === 0 ? (
        <p className="mt-1 text-[12px] text-muted-foreground">Nothing on anyone&apos;s desk</p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-[12px]">
          {waiting.map((w, i) => (
            <li key={i}>
              <span className="font-medium text-foreground">
                {w.who === "customer" ? "Customer" : "GoCanvas"}:
              </span>{" "}
              {w.what}
            </li>
          ))}
        </ul>
      )}

      {healthWhy ? (
        <p className="mt-3 text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground">Why it is flagged:</span> {healthWhy}
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
    <section className="border-t border-border pt-3" aria-label="Key dates">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Key dates
      </p>
      <dl className="mt-1.5 space-y-1 text-[12px]">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-3" title={r.hint}>
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="font-medium tabular-nums text-foreground">{r.value}</dd>
          </div>
        ))}
        {impl.complete_outcome ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Outcome</dt>
            <dd className="font-medium text-foreground">
              {impl.complete_outcome === "proven" ? "Proven" : "Not Proven"}
            </dd>
          </div>
        ) : null}
        {next ? (
          <div className="flex justify-between gap-3 border-t border-border pt-1.5">
            <dt className="text-muted-foreground">{next.label}</dt>
            <dd className="text-right font-medium text-foreground">{next.detail}</dd>
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
    <div className="mt-2 border-t border-border pt-2 text-[12px]">
      {c ? (
        <div className="flex flex-col gap-2">
          <span className="inline-flex items-center gap-1.5">
            <TriangleAlert className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" aria-hidden />
            The target moved {c.from_date ? `from ${shortDay(c.from_date)} ` : ""}to{" "}
            <span className="font-medium">{shortDay(c.to_date)}</span> after the baseline. Why?
          </span>
          <select
            className="h-8 rounded-sm border border-border bg-background px-1.5 text-[12px]"
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
            className="h-8 rounded-sm border border-border bg-background px-2 text-[12px]"
            placeholder="One line of why (optional)"
            aria-label="Why the target moved"
            value={note}
            disabled={m.isPending}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            type="button"
            className="self-start rounded-sm bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
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

/** One line of progress: "2 of 5 tasks done", with a bar that only shows actual completion. */
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
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
      <span className="tabular-nums">
        {done} of {total} {label}
      </span>
      <span aria-hidden className="block h-1 w-28 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

/**
 * The journey in Focus Mode: where the implementation is, how far its current
 * stage has got, and the full journey one click away. The skip control stays
 * here so it is never hidden behind the expanded journey.
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
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-md border border-border bg-card px-4 py-3"
      aria-label="Implementation journey summary"
    >
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Implementation journey
        </p>
        <p className="mt-0.5 text-[14px] font-semibold text-foreground">
          {position ? `Stage ${position.index} of ${position.total}` : fallbackLabel}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {skip}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls="current-implementation-journey"
          className="rounded-sm border border-primary/40 px-2.5 py-1 text-[12px] font-medium text-primary hover:bg-primary/5"
        >
          {expanded ? "Hide full journey" : "View full journey"}
        </button>
      </div>
    </section>
  );
}

/**
 * The tools that sit beside the work, compact: updates, plan dates, the Parking
 * Lot and the customer dashboard preview. Each opens its existing panel in place.
 * The panels stay mounted, so a half-written update survives closing the panel.
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
        "flex w-full items-center justify-between gap-2 py-1.5 text-left text-[12px] font-medium transition-colors",
        open === which ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span aria-hidden className="text-[11px]">
        {open === which ? "Close" : "Open"}
      </span>
    </button>
  );
  return (
    <section className="border-t border-border pt-3" aria-label="Updates and tools">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Updates and tools
      </p>
      <div className="mt-1 divide-y divide-border">
        {row("meeting", "Update from a customer meeting")}
        {row("update", "Add an implementation update")}
        {showPlanDates ? row("dates", "Adjust plan dates") : null}
        {parking ? (
          <button
            type="button"
            onClick={parking.onToggle}
            aria-expanded={parking.expanded}
            className={cn(
              "flex w-full items-center justify-between gap-2 py-1.5 text-left text-[12px] font-medium transition-colors",
              parking.expanded ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>
              Parking Lot
              <span className="ml-2 font-normal text-muted-foreground">
                · {parking.openCount === 0 ? "none open" : `${parking.openCount} open on our side`}
              </span>
            </span>
            <span aria-hidden className="text-[11px]">
              {parking.expanded ? "Close" : "Open"}
            </span>
          </button>
        ) : null}
        <div className="py-1.5">{dashboardLink}</div>
      </div>
    </section>
  );
}
