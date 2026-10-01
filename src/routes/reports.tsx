import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { Panel, NoRows } from "@/components/record";
import { getLeadership } from "@/lib/hub.functions";
import { getPipelineReport } from "@/lib/pipeline-report.functions";
import { getTtvReport } from "@/lib/ttv-report.functions";
import { TTV_TIMINGS, type Variance } from "@/lib/ttv-report";
import { ownerLoad, portfolioRollup } from "@/lib/leadership";
import type { Timing } from "@/lib/pipeline-report";
import { fmtMoney } from "@/lib/hub-format";
import { useScope } from "@/lib/use-scope";
import { cn } from "@/lib/utils";

const leadershipQuery = (scope: string | null) =>
  queryOptions({
    queryKey: ["leadership", scope],
    queryFn: () => getLeadership({ data: scope ? { scope } : {} }),
  });

const reportQuery = queryOptions({
  queryKey: ["pipeline-report"],
  queryFn: () => getPipelineReport(),
  staleTime: 5 * 60_000,
});

const ttvQuery = queryOptions({
  queryKey: ["ttv-report"],
  queryFn: () => getTtvReport(),
  staleTime: 5 * 60_000,
});

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Team & portfolio | GoCanvas Handoff Hub" },
      {
        name: "description",
        content:
          "The book as numbers: health, where the accounts sit, who carries what, how long a deal takes to reach onboarding and its first form live.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { scope?: string } =>
    typeof search["scope"] === "string" ? { scope: search["scope"] as string } : {},
  loaderDeps: ({ search }: { search: { scope?: string } }) => ({ scope: search.scope ?? null }),
  loader: ({ context, deps }) => {
    void context.queryClient.prefetchQuery(reportQuery);
    void context.queryClient.prefetchQuery(ttvQuery);
    return context.queryClient.ensureQueryData(leadershipQuery(deps.scope));
  },
  component: ReportsPage,
});

/* The status palette (dataviz reference): fixed, never reused for a series. */
const HEALTH = [
  { key: "blocked", label: "Blocked", color: "#d03b3b" },
  { key: "at_risk", label: "At risk", color: "#fab219" },
  { key: "on_track", label: "On track", color: "#0ca30c" },
  { key: "no_signal", label: "No signal", color: "#c3c2b7" },
] as const;

function ReportsPage() {
  const { param } = useScope();
  const { data } = useSuspenseQuery(leadershipQuery(param));
  const report = useQuery(reportQuery);
  const ttv = useQuery(ttvQuery);
  const rollup = portfolioRollup(data);
  const owners = ownerLoad(data);
  const maxOwner = Math.max(1, ...owners.map((o) => o.implementations.length));

  return (
    <>
      <PageHeader
        title="Reports"
        description="Team & portfolio: the book as numbers. Health, where the accounts sit, who carries what, and how long a deal takes."
      />
      <PageBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat
            label="Accounts"
            value={rollup.total}
            sub={`${rollup.owners} owner${rollup.owners === 1 ? "" : "s"}`}
          />
          <Stat label="Need attention" value={rollup.act_now} sub="Act now" tone="critical" />
          <Stat
            label="Keep an eye on"
            value={rollup.needs_attention}
            sub="Needs attention"
            tone="warning"
          />
          <Stat label="On track" value={rollup.moving} sub="Moving" tone="good" />
          <Stat
            label="Unassigned"
            value={rollup.unassigned}
            sub="No owner yet"
            tone={rollup.unassigned ? "critical" : "muted"}
          />
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-2">
          <Panel
            title="Health across the book"
            level="primary"
            meta="From the same derivation Home and Leadership use"
          >
            <div className="space-y-3 px-3 py-3">
              <StackedBar
                total={rollup.total}
                parts={HEALTH.map((h) => ({ ...h, value: rollup.health[h.key] }))}
              />
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                {HEALTH.map((h) => (
                  <li key={h.key} className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: h.color }}
                    />
                    <span className="font-semibold tabular-nums">{rollup.health[h.key]}</span>
                    <span className="text-muted-foreground">{h.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel
            title="Deals by stage"
            level="primary"
            meta={
              report.data
                ? `Pipeline as of ${report.data.asOf.slice(0, 10)} · every deal, whoever owns it`
                : "Loading the pipeline…"
            }
          >
            {report.data ? (
              <ul className="space-y-2.5 px-3 py-3">
                {report.data.stages.map((s) => {
                  const max = Math.max(1, ...report.data!.stages.map((x) => x.count));
                  return (
                    <li
                      key={s.stage}
                      className="grid grid-cols-[110px_minmax(0,1fr)_32px] items-center gap-2 text-[12px]"
                    >
                      <span className="truncate">{s.label}</span>
                      <span className="flex h-3 overflow-hidden rounded-full bg-muted">
                        <span
                          className="h-full bg-[#2a78d6]"
                          style={{ width: `${((s.count - s.warn - s.escalate) / max) * 100}%` }}
                          title={`${s.count - s.warn - s.escalate} on pace`}
                        />
                        <span
                          className="ml-px h-full bg-[#fab219]"
                          style={{ width: `${(s.warn / max) * 100}%` }}
                          title={`${s.warn} waiting`}
                        />
                        <span
                          className="ml-px h-full bg-[#d03b3b]"
                          style={{ width: `${(s.escalate / max) * 100}%` }}
                          title={`${s.escalate} stuck`}
                        />
                      </span>
                      <span className="text-right font-semibold tabular-nums">{s.count}</span>
                    </li>
                  );
                })}
                <li className="flex flex-wrap gap-x-4 pt-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#2a78d6]" /> On pace
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#fab219]" /> Past the warn limit
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#d03b3b]" /> Stuck
                  </span>
                </li>
              </ul>
            ) : (
              <NoRows label="Loading…" />
            )}
          </Panel>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-2">
          <Panel
            title="Who carries what"
            level="primary"
            meta="Accounts per owner; the act-now ones in red"
          >
            {owners.length === 0 ? (
              <NoRows label="No accounts in this scope." />
            ) : (
              <ul className="space-y-2.5 px-3 py-3">
                {owners.map((o) => (
                  <li
                    key={o.owner}
                    className="grid grid-cols-[140px_minmax(0,1fr)_60px] items-center gap-2 text-[12px]"
                  >
                    <span className={cn("truncate", o.unassigned && "text-[#b42318]")}>
                      {o.owner}
                    </span>
                    <span className="flex h-3 overflow-hidden rounded-full bg-muted">
                      <span
                        className="h-full bg-[#d03b3b]"
                        style={{ width: `${(o.act_now / maxOwner) * 100}%` }}
                        title={`${o.act_now} need action`}
                      />
                      <span
                        className="ml-px h-full bg-[#2a78d6]"
                        style={{
                          width: `${((o.implementations.length - o.act_now) / maxOwner) * 100}%`,
                        }}
                      />
                    </span>
                    <span className="text-right tabular-nums">
                      <span className="font-semibold">{o.implementations.length}</span>
                      <span className="text-muted-foreground"> · {fmtMoney(o.arr)}</span>
                    </span>
                    {o.flags.length ? (
                      <span className="col-span-3 -mt-1 text-[11px] text-amber-800 dark:text-amber-300">
                        {o.flags.join(" · ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="grid gap-4 sm:grid-cols-2">
            <TimingTile label="Close → Onboarding" timing={report.data?.timeToOnboarding ?? null} />
            <TimingTile
              label="Close → first form live"
              timing={report.data?.timeToFirstFormLive ?? null}
            />
            <Panel
              title="Stuck deals"
              count={report.data?.stuck.length ?? 0}
              className="sm:col-span-2"
            >
              {!report.data ? (
                <NoRows label="Loading…" />
              ) : report.data.stuck.length === 0 ? (
                <NoRows label="Nothing is past its stage limit." />
              ) : (
                <ul className="divide-y divide-border">
                  {report.data.stuck.slice(0, 8).map((d) => (
                    <li
                      key={`${d.name}:${d.stage}`}
                      className="flex flex-wrap items-baseline gap-x-3 px-3 py-2 text-[12px]"
                    >
                      <span className="font-medium">{d.name}</span>
                      <span className="text-muted-foreground">
                        {d.label} · {d.businessDaysInStage} business days ·{" "}
                        {d.owner ?? "Unassigned"}
                      </span>
                      {d.nextStep ? (
                        <span className="basis-full text-muted-foreground">→ {d.nextStep}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>

        <Panel
          title="Time to value"
          level="primary"
          meta={
            ttv.data
              ? `${ttv.data.live} of ${ttv.data.closed} closed deal${ttv.data.closed === 1 ? "" : "s"} live · Proven ${ttv.data.outcomes.proven} · Not Proven ${ttv.data.outcomes.notProven}`
              : "Loading…"
          }
        >
          <div className="space-y-3 px-3 py-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {TTV_TIMINGS.map((t) => (
                <TimingTile
                  key={t.key}
                  label={t.label}
                  hint={t.hint}
                  timing={ttv.data?.[t.key] ?? null}
                />
              ))}
            </div>
            {ttv.data ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <VarianceTile label="Go-Live vs tier expected" v={ttv.data.variance.vsTier} />
                <VarianceTile label="Go-Live vs baseline" v={ttv.data.variance.vsBaseline} />
                <VarianceTile label="Go-Live vs target" v={ttv.data.variance.vsTarget} />
              </div>
            ) : null}
            {ttv.data ? (
              <p className="text-[11px] text-muted-foreground">
                Coverage after launch — named AM: {ttv.data.coverage.namedAm.count} deal
                {ttv.data.coverage.namedAm.count === 1 ? "" : "s"}
                {ttv.data.coverage.namedAm.ttv.median !== null
                  ? ` (TTV median ${ttv.data.coverage.namedAm.ttv.median} bd)`
                  : ""}{" "}
                · Customer Success: {ttv.data.coverage.customerSuccess.count}
                {ttv.data.coverage.customerSuccess.ttv.median !== null
                  ? ` (TTV median ${ttv.data.coverage.customerSuccess.ttv.median} bd)`
                  : ""}
                . Business days, from the stage history and the project dates; a deal counts once
                its Go-Live is ticked.
              </p>
            ) : null}
          </div>
        </Panel>

        <p className="text-[11px] text-muted-foreground">
          The fuller leadership view — interventions, dwell by stage, launch risk, value proof,
          adoption — is under{" "}
          <Link to="/portfolio" className="underline">
            Leadership
          </Link>
          ; delivery timings by tool and kind under Admin → Delivery analytics.{" "}
          <Link to="/signals" className="inline-flex items-center gap-1 underline">
            Signals <ArrowRight className="h-3 w-3" />
          </Link>
        </p>
      </PageBody>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "muted",
}: {
  label: string;
  value: number;
  sub: string;
  tone?: "critical" | "warning" | "good" | "muted";
}) {
  const color: Record<typeof tone, string> = {
    critical: "text-[#b42318]",
    warning: "text-[#93500a]",
    good: "text-[#006300]",
    muted: "text-foreground",
  };
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-[26px] font-semibold leading-none tracking-tight", color[tone])}>
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

/** One bar, its segments separated by a 2px gap in the surface colour. */
function StackedBar({
  total,
  parts,
}: {
  total: number;
  parts: Array<{ key: string; label: string; color: string; value: number }>;
}) {
  if (!total)
    return <p className="text-[12px] text-muted-foreground">No accounts in this scope.</p>;
  return (
    <div
      className="flex h-5 overflow-hidden rounded-md bg-muted"
      role="img"
      aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}
    >
      {parts
        .filter((p) => p.value > 0)
        .map((p, i) => (
          <span
            key={p.key}
            className={cn("h-full", i > 0 && "ml-0.5")}
            style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }}
            title={`${p.label}: ${p.value}`}
          />
        ))}
    </div>
  );
}

function VarianceTile({ label, v }: { label: string; v: Variance }) {
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      {v.count === 0 ? (
        <p className="mt-1 text-[12px] text-muted-foreground">No live deal has that date yet.</p>
      ) : (
        <>
          <p
            className={cn(
              "mt-1 text-[22px] font-semibold leading-none tracking-tight",
              (v.median ?? 0) > 0 ? "text-[#93500a]" : "text-[#006300]",
            )}
          >
            {sign(v.median ?? 0)}{" "}
            <span className="text-[13px] font-normal text-muted-foreground">
              business days median
            </span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {v.late} of {v.count} late · average {sign(v.average ?? 0)}
            {v.worst ? ` · latest ${v.worst.name} (+${v.worst.days})` : ""}
          </p>
        </>
      )}
    </div>
  );
}

function TimingTile({
  label,
  hint,
  timing,
}: {
  label: string;
  hint?: string;
  timing: Timing | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      {!timing ? (
        <p className="mt-1 text-[12px] text-muted-foreground">Loading…</p>
      ) : timing.count === 0 ? (
        <p className="mt-1 text-[12px] text-muted-foreground">No deal has made that move yet.</p>
      ) : (
        <>
          <p className="mt-1 text-[26px] font-semibold leading-none tracking-tight">
            {timing.median ?? "—"}{" "}
            <span className="text-[13px] font-normal text-muted-foreground">
              business days median
            </span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Average {timing.average ?? "—"} · over {timing.count} deal
            {timing.count === 1 ? "" : "s"}
            {timing.slowest ? ` · slowest ${timing.slowest.name} (${timing.slowest.days})` : ""}
          </p>
        </>
      )}
    </div>
  );
}
