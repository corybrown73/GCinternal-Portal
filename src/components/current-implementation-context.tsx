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
 * Who holds the next step, and what the implementation is waiting on. Standard
 * journeys pass the workspace's own next step and waiting list; partner journeys
 * pass the partner's own values, so the card never mixes the two.
 */
export function NextActionCard({
  nextAction,
  owner,
  ball,
  waiting,
  waitingText,
  healthWhy,
}: {
  nextAction: string;
  owner: string | null;
  ball: { who: "customer" | "us"; detail: string } | null;
  waiting: Array<{ who: "customer" | "gocanvas"; what: string }>;
  /** A partner's own waiting statement, shown in place of the standard list. */
  waitingText: string | null;
  healthWhy: string | null;
}) {
  return (
    <section className="rounded-md border border-border bg-card px-4 py-3" aria-label="Next action">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Next action
      </p>
      <p className="mt-1 text-[14px] font-semibold text-foreground">{nextAction}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Owner <span className="text-foreground">{owner ?? "Nobody yet"}</span>
        {ball ? (
          <>
            {" · "}
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
          </>
        ) : null}
      </p>

      <div className="mt-3 border-t border-border pt-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Waiting on
        </p>
        {waitingText !== null ? (
          <p className="mt-1 text-[12px] text-foreground">{waitingText}</p>
        ) : waiting.length === 0 ? (
          <p className="mt-1 text-[12px] text-muted-foreground">Nothing on anyone's desk</p>
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
      </div>

      {healthWhy ? (
        <p className="mt-3 border-t border-border pt-2.5 text-[12px] text-muted-foreground">
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
    <section className="rounded-md border border-border bg-card px-4 py-3" aria-label="Key dates">
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

/**
 * Outstanding parking-lot items for this implementation, visible from the
 * workspace. The full editor opens in the stage column, so the list here stays
 * a short summary rather than a second place to edit.
 */
export function ParkingLotSummary({
  openCount,
  items,
  open,
  onToggle,
}: {
  openCount: number;
  items: Array<{ id: string; request: string }>;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="rounded-md border border-border bg-card px-4 py-3" aria-label="Parking lot">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Parking lot
        </p>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="text-[12px] font-medium text-primary hover:underline"
        >
          {open ? "Hide the parking lot" : "Manage the parking lot"}
        </button>
      </div>
      {openCount === 0 ? (
        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Check className="h-3 w-3" aria-hidden /> Nothing open on our side
        </p>
      ) : (
        <>
          <p className="mt-1 text-[12px] text-foreground">{openCount} open on our side</p>
          <ul className="mt-1 space-y-0.5 text-[12px] text-muted-foreground">
            {items.slice(0, 3).map((i) => (
              <li key={i.id} className="truncate">
                {i.request}
              </li>
            ))}
          </ul>
          {openCount > 3 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              +{openCount - 3} more in the lot
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * The quick actions into the update panels and the customer preview. Each
 * opens its existing panel in place; the panels stay mounted, so a half-written
 * recap or update is not lost when the panel is closed.
 */
export function QuickActions({
  open,
  onOpen,
  showPlanDates,
  dashboardLink,
}: {
  open: "meeting" | "update" | "dates" | null;
  onOpen: (which: "meeting" | "update" | "dates") => void;
  showPlanDates: boolean;
  dashboardLink: ReactNode;
}) {
  const btn = (which: "meeting" | "update" | "dates", label: string) => (
    <button
      type="button"
      onClick={() => onOpen(which)}
      aria-expanded={open === which}
      className={cn(
        "rounded-sm border px-2.5 py-1.5 text-left text-[12px] font-medium transition-colors",
        open === which
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
  return (
    <section
      className="rounded-md border border-border bg-card px-4 py-3"
      aria-label="Quick actions"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Update
      </p>
      <div className="mt-2 grid gap-1.5">
        {btn("meeting", "Update from a customer meeting")}
        {btn("update", "Add an implementation update")}
        {showPlanDates ? btn("dates", "Adjust plan dates") : null}
        {dashboardLink}
      </div>
    </section>
  );
}
