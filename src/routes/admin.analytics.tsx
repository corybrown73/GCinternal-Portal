import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PageBody, PageHeader } from "@/components/page";
import { Panel } from "@/components/record";
import type { Outcome, Rollup } from "@/lib/delivery-analytics";
import { getDeliveryAnalyticsFn } from "@/lib/delivery-analytics.functions";
import { shortDay } from "@/lib/onboarding-timeline";
import { cn } from "@/lib/utils";

/**
 * Delivery analytics: how long things take against how long we said.
 * Read from every closed-won plan on the spot — there is nothing to enter
 * and nothing to refresh.
 */
export const Route = createFileRoute("/admin/analytics")({
  head: () => ({ meta: [{ title: "Delivery analytics — GoCanvas Handoff Hub" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const load = useServerFn(getDeliveryAnalyticsFn);
  const q = useQuery({ queryKey: ["delivery-analytics"], queryFn: () => load() });
  const d = q.data;
  return (
    <>
      <PageHeader
        title="Delivery analytics"
        description="Planned against actual, in business days, for every closed-won account. Which tools run long, which kinds slip, and the step where the days go."
      />
      <PageBody className="space-y-4">
        {q.isPending ? (
          <p className="text-[13px] text-muted-foreground">Reading every plan…</p>
        ) : null}
        {q.isError ? (
          <p className="text-[13px] text-destructive">{(q.error as Error).message}</p>
        ) : null}
        {d ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Accounts" value={String(d.accounts)} />
              <Stat label="Projects tracked" value={String(d.outcomes.length)} />
              <Stat
                label="Done on time"
                value={pct(
                  d.outcomes.filter((o) => o.status === "done"),
                  (o) => (o.slipDays ?? 0) <= 0,
                )}
              />
              <Stat
                label="Late right now"
                value={String(d.outcomes.filter((o) => o.status === "late").length)}
                tone={d.outcomes.some((o) => o.status === "late") ? "warn" : "ok"}
              />
            </div>
            <RollupPanel
              title="By tool"
              rows={d.byTool}
              hint="A known system counts under its name; anything else under what it was called."
            />
            <RollupPanel title="By kind of work" rows={d.byKind} />
            <RollupPanel title="By path — phase 1 only" rows={d.byPath} />
            <Panel
              title="Where the days go"
              count={d.steps.length}
              meta="Steps ranked by average slip, business days"
            >
              {d.steps.length ? (
                <table className="w-full text-[12px]">
                  <thead className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 text-left">Step</th>
                      <th className="px-3 py-1.5 text-left">Kind</th>
                      <th className="px-3 py-1.5 text-right">Done</th>
                      <th className="px-3 py-1.5 text-right">Avg slip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {d.steps.slice(0, 15).map((s) => (
                      <tr key={`${s.kindLabel}:${s.label}`}>
                        <td className="px-3 py-1.5 font-medium">{s.label}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{s.kindLabel}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{s.n}</td>
                        <td
                          className={cn(
                            "px-3 py-1.5 text-right font-mono",
                            s.avgSlipDays > 0
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-emerald-700 dark:text-emerald-400",
                          )}
                        >
                          {fmtSlip(s.avgSlipDays)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Empty text="No step has been marked done yet. Tick steps on a plan and this fills in." />
              )}
            </Panel>
            <Panel
              title="Every project"
              count={d.outcomes.length}
              meta={`As of ${shortDay(d.asOf)}`}
            >
              <table className="w-full text-[12px]">
                <thead className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 text-left">Account</th>
                    <th className="px-3 py-1.5 text-left">Project</th>
                    <th className="px-3 py-1.5 text-right">Planned</th>
                    <th className="px-3 py-1.5 text-right">Actual</th>
                    <th className="px-3 py-1.5 text-right">Slip</th>
                    <th className="px-3 py-1.5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...d.outcomes]
                    .sort((a, b) => rank(b) - rank(a))
                    .map((o) => (
                      <tr key={`${o.dealId}:${o.tool}:${o.phase}`}>
                        <td className="px-3 py-1.5">
                          <Link
                            to="/deals/$dealId"
                            params={{ dealId: o.dealId }}
                            className="underline"
                          >
                            {o.account}
                          </Link>
                        </td>
                        <td className="px-3 py-1.5">
                          {o.toolLabel}
                          <span className="text-muted-foreground">
                            {" "}
                            · {o.kindLabel} · phase {o.phase}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono">{o.plannedDays}d</td>
                        <td className="px-3 py-1.5 text-right font-mono">
                          {o.actualDays != null ? `${o.actualDays}d` : "—"}
                        </td>
                        <td className={cn("px-3 py-1.5 text-right font-mono", slipTone(o))}>
                          {o.status === "done"
                            ? fmtSlip(o.slipDays ?? 0)
                            : o.status === "late"
                              ? `+${o.overdueDays}d`
                              : "—"}
                        </td>
                        <td className="px-3 py-1.5">
                          <StatusChip o={o} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Panel>
          </>
        ) : null}
      </PageBody>
    </>
  );
}

function rank(o: Outcome): number {
  return o.status === "late" ? 3 : o.status === "on_track" ? 2 : o.status === "done" ? 1 : 0;
}
function pct(rows: Outcome[], pred: (o: Outcome) => boolean): string {
  if (!rows.length) return "—";
  return `${Math.round((rows.filter(pred).length / rows.length) * 100)}%`;
}
function fmtSlip(n: number): string {
  return n > 0 ? `+${n}d` : n < 0 ? `${n}d` : "on time";
}
function slipTone(o: Outcome): string {
  const s = o.status === "done" ? (o.slipDays ?? 0) : o.overdueDays;
  return s > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400";
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-[20px] font-semibold tabular-nums",
          tone === "warn" && "text-amber-700 dark:text-amber-400",
          tone === "ok" && "text-emerald-700 dark:text-emerald-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function StatusChip({ o }: { o: Outcome }) {
  const map = {
    done: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    on_track: "bg-primary/10 text-primary",
    late: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    waiting: "bg-muted text-muted-foreground",
  } as const;
  const label = {
    done: o.doneOn ? `Done ${shortDay(o.doneOn)}` : "Done",
    on_track: "On track",
    late: "Late",
    waiting: `Waiting · ${shortDay(o.plannedEnd)}`,
  }[o.status];
  return (
    <span
      className={cn(
        "rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        map[o.status],
      )}
    >
      {label}
    </span>
  );
}

function RollupPanel({ title, rows, hint }: { title: string; rows: Rollup[]; hint?: string }) {
  return (
    <Panel title={title} count={rows.length} {...(hint ? { meta: hint } : {})}>
      {rows.length ? (
        <table className="w-full text-[12px]">
          <thead className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 text-left">Project</th>
              <th className="px-3 py-1.5 text-right">Count</th>
              <th className="px-3 py-1.5 text-right">Done</th>
              <th className="px-3 py-1.5 text-right">Late</th>
              <th className="px-3 py-1.5 text-right">Planned avg</th>
              <th className="px-3 py-1.5 text-right">Actual avg</th>
              <th className="px-3 py-1.5 text-right">Avg slip</th>
              <th className="px-3 py-1.5 text-right">On time</th>
              <th className="px-3 py-1.5 text-left">Slips most at</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="px-3 py-1.5 font-medium">{r.label}</td>
                <td className="px-3 py-1.5 text-right font-mono">{r.count}</td>
                <td className="px-3 py-1.5 text-right font-mono">{r.done}</td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right font-mono",
                    r.late > 0 && "text-amber-700 dark:text-amber-400",
                  )}
                >
                  {r.late}
                </td>
                <td className="px-3 py-1.5 text-right font-mono">
                  {r.avgPlannedDays != null ? `${r.avgPlannedDays}d` : "—"}
                </td>
                <td className="px-3 py-1.5 text-right font-mono">
                  {r.avgActualDays != null ? `${r.avgActualDays}d` : "—"}
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right font-mono",
                    (r.avgSlipDays ?? 0) > 0
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-emerald-700 dark:text-emerald-400",
                  )}
                >
                  {r.avgSlipDays != null ? fmtSlip(r.avgSlipDays) : "—"}
                </td>
                <td className="px-3 py-1.5 text-right font-mono">
                  {r.onTimePct != null ? `${r.onTimePct}%` : "—"}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {r.worstStep ? `${r.worstStep.label} (+${r.worstStep.avgSlipDays}d)` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty text="Nothing here yet." />
      )}
    </Panel>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-3 py-3 text-[12px] text-muted-foreground">{text}</p>;
}
