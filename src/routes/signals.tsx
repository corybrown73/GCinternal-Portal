import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { PageBody, PageHeader } from "@/components/page";
import { NoRows, Panel } from "@/components/record";
import { getSignals } from "@/lib/signals.functions";
import { fmtDate, fmtDateTime, humanize, stageLabel } from "@/lib/hub-format";
import { WAITING_ON_LABEL } from "@/lib/customer360-derive";
import { EXCLUSION_LABEL } from "@/lib/signals/stage-history";
import {
  CHAMPION_QUIET_DAYS,
  LAUNCH_AT_RISK_HORIZON_DAYS,
  SIGNAL_ALERT_LABEL,
} from "@/lib/signals/alert-rules";
import { cn } from "@/lib/utils";

const signalsQuery = queryOptions({
  queryKey: ["signals"],
  queryFn: () => getSignals(),
});

export const Route = createFileRoute("/signals")({
  head: () => ({
    meta: [
      { title: "Signals — velocity, dwell and what is waiting | Implementation Hub" },
      {
        name: "description",
        content:
          "Observed stage dwell against target, launch slip attributed to the stages that ran over, who is waiting on whom, and the alerts that would fire — every figure naming the records it came from.",
      },
      {
        property: "og:title",
        content: "Signals — velocity, dwell and what is waiting | Implementation Hub",
      },
      {
        property: "og:description",
        content:
          "Velocity, dwell-vs-target, slip attribution and waiting-on across the portfolio, computed from recorded stage history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(signalsQuery);
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load signals: {error.message}
    </div>
  ),
  component: SignalsPage,
});

function AccountLink({
  customerId,
  implementationId,
  children,
}: {
  customerId: string | null;
  implementationId: string;
  children: React.ReactNode;
}) {
  if (!customerId) return <span className="text-[13px]">{children}</span>;
  return (
    <Link
      to="/customers/$customerId"
      params={{ customerId }}
      search={{ tab: "journey", impl: implementationId }}
      className="text-[13px] font-medium underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-2 text-[11px] text-muted-foreground">{children}</p>;
}

function SignalsPage() {
  const { data } = useSuspenseQuery(signalsQuery);
  const [openImpl, setOpenImpl] = useState<string | null>(null);

  const excluded = Object.entries(data.segments.excluded_by_reason).filter(([, n]) => n > 0);
  const slipped = data.implementations.filter((r) => r.slip.slipped);
  const detail = data.implementations.find((r) => r.implementation_id === openImpl) ?? null;

  return (
    <>
      <PageHeader
        title="Signals"
        description="Velocity, dwell against target, where a launch date went, and who is waiting on whom — from recorded stage history only."
      />
      <PageBody className="space-y-4">
        {/* Provenance statement. This is the load-bearing caveat, not fine print. */}
        <Panel title="What these numbers are made of" level="supporting">
          <div className="space-y-1.5 px-3 py-2 text-[12px] text-muted-foreground">
            <p>
              Every duration comes from{" "}
              <code className="font-mono">implementation_stage_history</code>, the authoritative
              record of stage transitions.{" "}
              <strong className="font-medium text-foreground">
                No timestamp is read from the templated plan
              </strong>{" "}
              — those rows were backfilled, and a state deduced from stage order is not an observed
              dwell. Stage targets are read from the plan, because a target is a number somebody
              chose in advance, not an observation.
            </p>
            <p>
              {data.segments.rows_read} history row(s) read → {data.segments.completed} completed
              transition(s) observed, {data.segments.open} stage(s) still open.
              {excluded.length
                ? ` Excluded: ${excluded.map(([reason, n]) => `${n} ${EXCLUSION_LABEL[reason as keyof typeof EXCLUSION_LABEL].toLowerCase()}`).join("; ")}.`
                : " Nothing was excluded."}
            </p>
            <p>
              Engagement telemetry:{" "}
              {data.engagement.available
                ? `available — ${data.engagement.reason}`
                : `not available — ${data.engagement.reason}. That is an absent source, not evidence that nobody is engaged.`}
            </p>
            <p>Generated {fmtDateTime(data.generated_at)}.</p>
          </div>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Dwell distribution */}
          <Panel
            title="Observed dwell by stage"
            count={data.dwell_by_stage.length}
            meta="Median and p90 are real transitions, not interpolations"
          >
            <ul className="divide-y divide-border">
              {data.dwell_by_stage.map((d) => (
                <li key={d.stage} className="px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="w-40 shrink-0 text-[13px] font-medium">{d.stage_label}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      n={d.count} · min {d.min_days}d · median {d.median_days}d · p90 {d.p90_days}d
                      · max {d.max_days}d
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    p90 is the transition entered {fmtDate(d.p90_segment.entered_at)} and left{" "}
                    {fmtDate(d.p90_segment.exited_at)}.
                  </p>
                </li>
              ))}
              {data.dwell_by_stage.length === 0 ? (
                <NoRows label="No completed stage transition has been recorded yet." />
              ) : null}
            </ul>
          </Panel>

          {/* On time — counts, never a rate */}
          <Panel title="Completed transitions against their target" level="default">
            <div className="space-y-1 px-3 py-2 text-[13px]">
              <p>
                <span className="font-mono">{data.on_time.within}</span> finished within the stage
                target.
              </p>
              <p>
                <span className="font-mono">{data.on_time.over}</span> ran over it.
              </p>
              <p>
                <span className="font-mono">{data.on_time.no_target}</span> had no target recorded,
                so they are not counted either way.
              </p>
            </div>
            <Note>
              Deliberately three counts and no percentage. A rate would compute itself over the
              transitions that happen to carry a target and then read as if it covered all of them.
            </Note>
            <ul className="divide-y divide-border border-t border-border">
              {data.on_time.over_segments.slice(0, 8).map((c) => (
                <li
                  key={`${c.segment.implementation_id}-${c.segment.entered_at}`}
                  className="px-3 py-1.5 text-[12px]"
                >
                  {c.reason}
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* Waiting on — the backbone */}
        <Panel
          title="Waiting on"
          count={data.implementations.length}
          meta="Who owes the next move, and since when"
        >
          <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
            {data.waiting_on.map((group) => (
              <div key={group.party} className="bg-card px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {WAITING_ON_LABEL[group.party]}
                </p>
                <p className="font-mono text-[18px]">{group.implementations.length}</p>
                <ul className="mt-1 space-y-1">
                  {group.implementations.slice(0, 6).map((row) => (
                    <li key={row.implementation_id} className="text-[12px]">
                      <AccountLink
                        customerId={row.customer_id}
                        implementationId={row.implementation_id}
                      >
                        {row.customer_name}
                      </AccountLink>
                      <span className="block text-[11px] text-muted-foreground">
                        {row.since
                          ? `since ${fmtDate(row.since)}${row.source ? ` · ${humanize(row.source)}` : ""}`
                          : "no date on the deciding record"}
                      </span>
                    </li>
                  ))}
                  {group.implementations.length === 0 ? (
                    <li className="text-[11px] text-muted-foreground">None.</li>
                  ) : null}
                </ul>
              </div>
            ))}
          </div>
        </Panel>

        {/* Slip attribution */}
        <Panel
          title="Launch slip, attributed to the stages that ran over"
          count={slipped.length}
          meta="Measured against the current target — a date that moved leaves no record"
        >
          <ul className="divide-y divide-border">
            {slipped.map((row) => (
              <li key={row.implementation_id} className="px-3 py-2">
                <AccountLink customerId={row.customer_id} implementationId={row.implementation_id}>
                  {row.customer_name}
                </AccountLink>
                <p className="mt-0.5 text-[12px]">{row.slip.slipped ? row.slip.reason : null}</p>
                {row.slip.slipped && row.slip.contributions.length ? (
                  <ul className="mt-1 space-y-0.5">
                    {row.slip.contributions.map((c) => (
                      <li
                        key={`${c.stage_label}-${c.entered_at}`}
                        className="text-[11px] text-muted-foreground"
                      >
                        {c.stage_label}: {c.days}d against a {c.target_days}d target (+{c.days_over}
                        d)
                        {c.in_flight ? " — still open" : ` · left ${fmtDate(c.exited_at)}`}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {row.slip.slipped ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">{row.slip.basis}</p>
                ) : null}
              </li>
            ))}
            {slipped.length === 0 ? (
              <NoRows label="No implementation is past its recorded target launch date." />
            ) : null}
          </ul>
        </Panel>

        {/* Alerts that would fire */}
        <Panel
          title={
            data.alerts_enabled
              ? "Signal alerts (emitting)"
              : "Signal alerts that would fire (flag off)"
          }
          count={data.would_fire.length}
          meta={`Quiet window ${CHAMPION_QUIET_DAYS}d · launch horizon ${LAUNCH_AT_RISK_HORIZON_DAYS}d`}
        >
          <ul className="divide-y divide-border">
            {data.would_fire.map((f) => (
              <li key={`${f.kind}-${f.implementation_id}`} className="px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {SIGNAL_ALERT_LABEL[f.kind]}
                </p>
                <p className="text-[13px] font-medium">{f.title}</p>
                <ul className="mt-1 space-y-0.5">
                  {f.evidence.map((e, i) => (
                    <li key={`${e.source}-${i}`} className="text-[11px] text-muted-foreground">
                      <span className="font-mono">{e.source}</span> — {e.fact}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {data.would_fire.length === 0 ? (
              <NoRows label="Nothing meets the evidence bar for either alert kind." />
            ) : null}
          </ul>
          {data.withheld.length ? (
            <div className="border-t border-border">
              <Note>
                Considered and refused — kept visible, because an alert that was withheld is a
                judgement someone may want to disagree with:
              </Note>
              <ul className="pb-2">
                {data.withheld.map((w, i) => (
                  <li
                    key={`${w.kind}-${w.implementation_id}-${i}`}
                    className="px-3 pb-1 text-[11px] text-muted-foreground"
                  >
                    <span className="font-mono">{SIGNAL_ALERT_LABEL[w.kind]}</span> — {w.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>

        {/* Per-implementation velocity */}
        <Panel
          title="Velocity by implementation"
          count={data.implementations.length}
          meta="Recorded transitions in order — no rate, no forecast"
        >
          <ul className="divide-y divide-border">
            {data.implementations.map((row) => {
              const open = openImpl === row.implementation_id;
              return (
                <li key={row.implementation_id}>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenImpl((cur) =>
                        cur === row.implementation_id ? null : row.implementation_id,
                      )
                    }
                    aria-expanded={open}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted/60",
                      open && "bg-secondary",
                    )}
                  >
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-[13px] font-medium">{row.customer_name}</span>
                      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                        {stageLabel(row.current_stage)}
                      </span>
                      {row.health_recorded ? (
                        <span className="text-[11px] text-muted-foreground">
                          recorded health {humanize(row.health_recorded)}
                          {row.health_computed && row.health_computed !== row.health_recorded
                            ? ` · computed says ${humanize(row.health_computed)}`
                            : ""}
                        </span>
                      ) : row.health_computed ? (
                        <span className="text-[11px] text-muted-foreground">
                          computed health {humanize(row.health_computed)} · none recorded
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[12px] text-muted-foreground">{row.velocity.reason}</span>
                  </button>
                </li>
              );
            })}
            {data.implementations.length === 0 ? <NoRows label="No implementations." /> : null}
          </ul>
        </Panel>

        {detail ? (
          <Panel
            title={`${detail.customer_name} — every recorded transition`}
            count={detail.velocity.completed.length}
            meta={detail.dependency.reason}
          >
            <ul className="divide-y divide-border">
              {detail.dwell.map((c) => (
                <li key={`${c.segment.entered_at}-${c.segment.stage}`} className="px-3 py-1.5">
                  <p className="text-[12px]">{c.reason}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtDate(c.segment.entered_at)} → {fmtDate(c.segment.exited_at)}
                  </p>
                </li>
              ))}
              {detail.velocity.current ? (
                <li className="px-3 py-1.5 text-[12px]">
                  {detail.velocity.current.stage_label} is still open —{" "}
                  {detail.velocity.current.days_so_far}d so far, entered{" "}
                  {fmtDate(detail.velocity.current.entered_at)}. Not counted as an observed dwell.
                </li>
              ) : null}
              {detail.dwell.length === 0 && !detail.velocity.current ? (
                <NoRows label="No stage transition has ever been recorded for this implementation." />
              ) : null}
            </ul>
            <Note>Engagement: {detail.engagement.reason}</Note>
          </Panel>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          Nothing here is a score, forecast or trend. Every figure names the records it came from,
          and no computed value on this page is ever written back over something a person recorded.
        </p>
      </PageBody>
    </>
  );
}
