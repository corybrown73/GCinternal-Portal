import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, X } from "lucide-react";

import { AccountRowList } from "@/components/account-rows";

import { PageBody, PageHeader } from "@/components/page";
import { NoRows, Panel, SeverityChip, StageBadge } from "@/components/record";
import { getLeadership } from "@/lib/hub.functions";
import { fmtDate, fmtMoney, humanize, stageLabel } from "@/lib/hub-format";
import { READINESS_STATE_LABEL } from "@/lib/graduation-readiness";
import {
  HEALTH_LABEL,
  PORTFOLIO_FILTER_LABEL,
  accountRows,
  adoptionCoverage,
  completedStageDwell,
  completedTransitions,
  graduationGate,
  interventions,
  launchBoard,
  ownerLoad,
  portfolioFilterAccounts,
  portfolioRollup,
  stageDistribution,
  stuckWork,
  valueCoverage,
  type PortfolioFilterId,
} from "@/lib/leadership";
import type { ImplementationRow } from "@/lib/hub-types";
import { cn } from "@/lib/utils";

const leadershipQuery = queryOptions({
  queryKey: ["leadership"],
  queryFn: () => getLeadership(),
});

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Leadership — Where the team needs me | Implementation Hub" },
      {
        name: "description",
        content:
          "Portfolio management view: accounts needing intervention, owner workload, work getting stuck in a stage, launch risk, value-proof and adoption coverage, stuck work and readiness to hand over.",
      },
      {
        property: "og:title",
        content: "Leadership — Where the team needs me | Implementation Hub",
      },
      {
        property: "og:description",
        content:
          "Management intervention view across the implementation portfolio — owner workload, work getting stuck in a stage, launch risk and readiness to hand over.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(leadershipQuery);
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load the leadership view: {error.message}
    </div>
  ),
  component: LeadershipPage,
});

function CustomerLink({
  impl,
  tab = "overview",
  className,
  children,
}: {
  impl: { customer_id: string; customer_name: string };
  tab?: "overview" | "journey" | "risks" | "requirements" | "solution" | "decisions" | "evidence" | "history";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      to="/customers/$customerId"
      params={{ customerId: impl.customer_id }}
      search={{ tab }}
      className={cn("font-medium hover:underline", className)}
    >
      {children ?? impl.customer_name}
    </Link>
  );
}

function Owner({ name, emphasis }: { name: string | null; emphasis?: boolean }) {
  const body = (
    <>
      <span
        className={cn(
          "uppercase tracking-[0.08em] text-muted-foreground",
          emphasis && "text-[10px]",
        )}
      >
        Owner
      </span>
      <span className={cn(emphasis && "font-semibold tracking-tight")}>{name ?? "Unassigned"}</span>
    </>
  );
  const base = cn(
    "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium",
    name
      ? "border-border bg-muted text-foreground"
      : "border-dashed border-destructive/50 text-destructive",
    emphasis && name && "border-foreground/25 bg-secondary text-[12px]",
  );

  if (!name) return <span className={base}>{body}</span>;
  return (
    <Link
      to="/owners/$owner"
      params={{ owner: name }}
      className={cn(base, "hover:border-foreground/40 hover:bg-secondary")}
      title={`Open ${name}'s portfolio`}
    >
      {body}
    </Link>
  );
}


function Metric({
  label,
  value,
  tone,
  active,
  onSelect,
}: {
  label: string;
  value: string | number;
  tone?: "bad" | "warn" | "good" | "muted";
  active?: boolean;
  onSelect?: () => void;
}) {
  const body = (
    <>
      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 font-mono text-[18px] font-semibold leading-none",
          tone === "bad" && "text-status-blocked-foreground",
          tone === "warn" && "text-status-risk-foreground",
          tone === "good" && "text-status-on-track-foreground",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
    </>
  );
  const base = "min-w-0 rounded-md border border-border bg-card px-3 py-2 text-left";

  if (!onSelect) return <div className={base}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={!!active}
      className={cn(
        base,
        "transition-colors hover:border-foreground/30 hover:bg-muted/50",
        active && "border-foreground/60 bg-secondary ring-1 ring-foreground/20",
      )}
    >
      {body}
    </button>
  );
}

function implMeta(impl: ImplementationRow) {
  return [
    impl.arr != null ? `${fmtMoney(impl.arr)} ARR` : null,
    impl.tier ?? impl.segment ?? null,
    impl.target_launch_date ? `launch ${fmtDate(impl.target_launch_date)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function LeadershipPage() {
  const { data } = useSuspenseQuery(leadershipQuery);
  const [filter, setFilter] = useState<PortfolioFilterId | null>(null);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [dwellStage, setDwellStage] = useState<string | null>(null);
  const toggleFilter = (id: PortfolioFilterId) =>
    setFilter((cur) => (cur === id ? null : id));

  const rollup = portfolioRollup(data);
  const rows = interventions(data);
  const owners = ownerLoad(data);
  const stages = stageDistribution(data);
  const dwell = completedStageDwell(data.stage_history);
  const launches = launchBoard(data);
  const value = valueCoverage(data);
  const adoption = adoptionCoverage(data);
  const stuck = stuckWork(data);
  const gates = graduationGate(data);

  /* One account list. Without a selection it is the accounts needing
     intervention; a selected card swaps it for exactly the accounts that card
     counted. Same derivations either way — nothing is listed twice. */
  const accounts = filter
    ? portfolioFilterAccounts(data, filter)
    : accountRows(
        data,
        rows.map((r) => r.row.impl),
      );

  const stageRow = stageFilter ? stages.find((s) => s.id === stageFilter) : null;
  const stageAccounts = stageRow ? accountRows(data, stageRow.implementations) : null;
  const transitions = dwellStage ? completedTransitions(data, dwellStage) : null;

  return (
    <>
      <PageHeader
        title="Leadership"
        description="Where the team needs management intervention — concentration, coverage and the calls only a lead can make. Every row deep-links into the account it came from."
        actions={
          <span className="font-mono text-[11px] text-muted-foreground">
            {rollup.total} implementations · {rollup.owners} owners
          </span>
        }
      />
      <PageBody className="space-y-4">
        {/* 1. State of the team */}
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Metric
            label="Act now"
            value={rollup.act_now}
            tone={rollup.act_now ? "bad" : "good"}
            active={filter === "act_now"}
            onSelect={() => toggleFilter("act_now")}
          />
          <Metric
            label="Needs attention"
            value={rollup.needs_attention}
            tone={rollup.needs_attention ? "warn" : "good"}
            active={filter === "needs_attention"}
            onSelect={() => toggleFilter("needs_attention")}
          />
          <Metric
            label="Blocked"
            value={rollup.health.blocked}
            tone={rollup.health.blocked ? "bad" : "muted"}
            active={filter === "blocked"}
            onSelect={() => toggleFilter("blocked")}
          />
          <Metric
            label="At risk"
            value={rollup.health.at_risk}
            tone={rollup.health.at_risk ? "warn" : "muted"}
            active={filter === "at_risk"}
            onSelect={() => toggleFilter("at_risk")}
          />
          <Metric
            label="On track"
            value={rollup.health.on_track}
            tone="good"
            active={filter === "on_track"}
            onSelect={() => toggleFilter("on_track")}
          />
          <Metric
            label="Unassigned"
            value={rollup.unassigned}
            tone={rollup.unassigned ? "bad" : "muted"}
            active={filter === "unassigned"}
            onSelect={() => toggleFilter("unassigned")}
          />
        </div>

        {/* 2. The one account list. A selected card above swaps what it shows. */}
        <Panel
          title={filter ? `${PORTFOLIO_FILTER_LABEL[filter]} accounts` : "Accounts needing attention"}
          count={accounts.length}
          meta={
            <span className="flex items-center gap-2">
              <span>
                {filter
                  ? "Exactly the accounts counted by the selected card"
                  : "Accounts a lead needs to step into · action derived from stored records only"}
              </span>
              {filter ? (
                <button
                  type="button"
                  onClick={() => setFilter(null)}
                  className="flex shrink-0 items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] hover:border-foreground/40 hover:text-foreground"
                >
                  <X className="h-3 w-3" strokeWidth={2} />
                  Show all
                </button>
              ) : null}
            </span>
          }
        >
          <AccountRowList
            accounts={accounts}
            showOwner
            emptyLabel={
              filter
                ? `No ${PORTFOLIO_FILTER_LABEL[filter].toLowerCase()} accounts.`
                : "No account currently needs lead-level attention."
            }
          />
        </Panel>

        {/* 3. Owner load */}
        <Panel
          title="Owner workload"
          count={owners.length}
          meta="Counts and named accounts only — no capacity model, no utilisation"
        >
          <ul className="divide-y divide-border">
            {owners.map((o) => (
              <li key={o.owner} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {o.unassigned ? (
                    <span className="text-[13px] font-semibold text-destructive">{o.owner}</span>
                  ) : (
                    <Link
                      to="/owners/$owner"
                      params={{ owner: o.owner }}
                      className="text-[13px] font-semibold hover:underline"
                    >
                      {o.owner}
                    </Link>
                  )}
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {o.implementations.length} impl · {o.act_now} act now · {o.blocked} blocked ·{" "}
                    {o.at_risk} at risk · {o.launches_30d} launch ≤30d
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {o.arr != null ? `${fmtMoney(o.arr)} ARR` : "ARR not recorded"}
                  </span>
                </div>
                <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[12px]">
                  {o.implementations.map((impl) => (
                    <CustomerLink key={impl.id} impl={impl} className="text-[12px]" />
                  ))}
                </p>
                {o.flags.length ? (
                  <ul className="mt-1 space-y-0.5">
                    {o.flags.map((f) => (
                      <li key={f} className="text-[11px] text-status-risk-foreground">
                        {f}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
            {owners.length === 0 ? <NoRows label="No implementations recorded." /> : null}
          </ul>
        </Panel>

        {/* 4. Lifecycle distribution — each stage opens the work sitting in it */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="Lifecycle distribution"
            meta="Select a stage to see the implementations in it"
          >
            <ul className="divide-y divide-border">
              {stages.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setStageFilter((cur) => (cur === s.id ? null : s.id))
                    }
                    aria-pressed={stageFilter === s.id}
                    disabled={s.implementations.length === 0}
                    className={cn(
                      "flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left",
                      s.implementations.length
                        ? "hover:bg-muted/60"
                        : "cursor-default opacity-70",
                      stageFilter === s.id && "bg-secondary",
                    )}
                  >
                    <span className="w-36 shrink-0 text-[13px] font-medium">{s.label}</span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                      {s.phase}
                    </span>
                    <span className="font-mono text-[12px]">{s.implementations.length}</span>
                    {s.implementations.length ? (
                      <span className="text-[11px] text-muted-foreground">
                        longest {s.longest_dwell_days}d · {s.longest_dwell_customer}
                        {s.over_flag ? ` · ${s.over_flag} over 14d` : ""}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">empty</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="Observed dwell (completed transitions)"
            count={dwell.length}
            meta="Select a stage to see the completed transitions behind it"
          >
            <ul className="divide-y divide-border">
              {dwell.map((d) => (
                <li key={d.stage}>
                  <button
                    type="button"
                    onClick={() => setDwellStage((cur) => (cur === d.stage ? null : d.stage))}
                    aria-pressed={dwellStage === d.stage}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60",
                      dwellStage === d.stage && "bg-secondary",
                    )}
                  >
                    <span className="w-36 shrink-0 text-[13px] font-medium">{d.stage}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {d.transitions} completed · {d.shortest_days}–{d.longest_days}d observed
                    </span>
                  </button>
                </li>
              ))}
              {dwell.length === 0 ? (
                <NoRows label="No completed stage transitions recorded yet." />
              ) : null}
            </ul>
          </Panel>
        </div>

        {/* 4b. Stage drill-down */}
        {stageRow && stageAccounts ? (
          <Panel
            title={`In ${stageRow.label} now`}
            count={stageAccounts.length}
            meta={
              <span className="flex items-center gap-2">
                <span>Implementations currently sitting in this stage</span>
                <button
                  type="button"
                  onClick={() => setStageFilter(null)}
                  className="flex shrink-0 items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] hover:border-foreground/40 hover:text-foreground"
                >
                  <X className="h-3 w-3" strokeWidth={2} />
                  Close
                </button>
              </span>
            }
          >
            <AccountRowList
              accounts={stageAccounts}
              showOwner
              showDaysInStage
              emptyLabel="Nothing is in this stage."
            />
          </Panel>
        ) : null}

        {/* 4c. Dwell drill-down */}
        {dwellStage && transitions ? (
          <Panel
            title={`Completed transitions through ${dwellStage}`}
            count={transitions.length}
            meta={
              <span className="flex items-center gap-2">
                <span>Every entry and exit behind the observed range</span>
                <button
                  type="button"
                  onClick={() => setDwellStage(null)}
                  className="flex shrink-0 items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] hover:border-foreground/40 hover:text-foreground"
                >
                  <X className="h-3 w-3" strokeWidth={2} />
                  Close
                </button>
              </span>
            }
          >
            <ul className="divide-y divide-border">
              {transitions.map((t) => (
                <li key={t.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  {t.impl ? (
                    <CustomerLink impl={t.impl} className="text-[13px]" />
                  ) : (
                    <span className="text-[13px] text-muted-foreground">Customer not recorded</span>
                  )}
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    {t.stage}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {fmtDate(t.entered_at)} → {fmtDate(t.exited_at)} · {t.days}d
                  </span>
                  {t.impl ? <Owner name={t.impl.owner_name} /> : null}
                  {t.impl ? (
                    <Link
                      to="/customers/$customerId"
                      params={{ customerId: t.impl.customer_id }}
                      search={{ tab: "journey" }}
                      className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                    >
                      journey
                      <ArrowRight className="h-3 w-3" strokeWidth={2} />
                    </Link>
                  ) : null}
                </li>
              ))}
              {transitions.length === 0 ? (
                <NoRows label="No completed transitions for this stage." />
              ) : null}
            </ul>
          </Panel>
        ) : null}

        {/* 5. Launch board */}
        <Panel
          title="Launch and delivery risk"
          count={launches.slipped.length + launches.landing_30d.length + launches.conflict.length}
          meta="Slipped · landing ≤30 days · recorded-state conflicts"
        >
          <div className="divide-y divide-border">
            {(
              [
                ["Slipped", launches.slipped, "text-status-blocked-foreground"],
                ["Landing ≤30 days", launches.landing_30d, "text-status-risk-foreground"],
                ["Data conflict", launches.conflict, "text-muted-foreground"],
              ] as const
            ).map(([label, group, tone]) => (
              <div key={label} className="px-3 py-2">
                <p className={cn("text-[11px] font-medium uppercase tracking-[0.08em]", tone)}>
                  {label} · {group.length}
                </p>
                <ul className="mt-1 space-y-1">
                  {group.map(({ impl, detail }) => (
                    <li key={impl.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <CustomerLink impl={impl} tab="journey" className="text-[13px]" />
                      <StageBadge stage={impl.current_stage} />
                      <Owner name={impl.owner_name} />
                      <span className="text-[11px] text-muted-foreground">{detail}</span>
                      <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                        {implMeta(impl) || "No commercial context recorded"}
                      </span>
                    </li>
                  ))}
                  {group.length === 0 ? (
                    <li className="text-[11px] text-muted-foreground">None.</li>
                  ) : null}
                </ul>
              </div>
            ))}
          </div>
        </Panel>

        {/* 6 + 7. Coverage */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="Value-proof coverage"
            count={value.rows.length}
            meta={`${value.no_criteria} of ${value.total} implementations have no success measure recorded`}
          >
            <ul className="divide-y divide-border">
              {value.rows.map((r) => (
                <li key={r.impl.id} className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <CustomerLink impl={r.impl} className="text-[13px]" />
                    <StageBadge stage={r.impl.current_stage} />
                    {r.late ? (
                      <span className="rounded-sm bg-status-risk px-1.5 py-0.5 text-[11px] font-medium text-status-risk-foreground">
                        {r.late} late
                      </span>
                    ) : null}
                    <Owner name={r.impl.owner_name} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{r.summary}</p>
                </li>
              ))}
              {value.rows.length === 0 ? <NoRows label="No implementations recorded." /> : null}
            </ul>
          </Panel>

          <Panel
            title="Adoption coverage"
            count={adoption.length}
            meta="Implementations at or past Build · areas defined vs ever observed"
          >
            <ul className="divide-y divide-border">
              {adoption.map((r) => (
                <li key={r.impl.id} className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <CustomerLink impl={r.impl} className="text-[13px]" />
                    <StageBadge stage={r.impl.current_stage} />
                    <span className="rounded-sm border border-border px-1.5 py-0.5 text-[11px]">
                      {r.level_label}
                    </span>
                    <Owner name={r.impl.owner_name} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {r.areas
                      ? `${r.observed} of ${r.areas} areas observed${
                          r.workarounds ? ` · ${r.workarounds} with a workaround in use` : ""
                        }`
                      : "No usage areas defined"}
                  </p>
                </li>
              ))}
              {adoption.length === 0 ? (
                <NoRows label="No implementations at or past Build." />
              ) : null}
            </ul>
          </Panel>
        </div>

        {/* 8. Stuck work */}
        <Panel
          title="Stuck work across the team"
          count={stuck.length}
          meta="Item level · unowned, older than 14 days, overdue, or any open escalation"
        >
          <ul className="divide-y divide-border">
            {stuck.map((i) => (
              <li key={i.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {i.kind}
                </span>
                {i.severity ? <SeverityChip value={i.severity} /> : null}
                <span className="min-w-0 flex-1 truncate text-[13px]">{i.title}</span>
                <CustomerLink
                  impl={{ customer_id: i.customer_id, customer_name: i.customer_name }}
                  tab="risks"
                  className="text-[12px]"
                />
                <Owner name={i.owner_name} />
                <span className="font-mono text-[11px] text-muted-foreground">
                  {i.age_days != null ? `${i.age_days}d` : "age unknown"}
                  {i.overdue ? " · overdue" : ""}
                  {i.stale ? " · stale" : ""}
                </span>
              </li>
            ))}
            {stuck.length === 0 ? <NoRows label="Nothing stuck across the portfolio." /> : null}
          </ul>
        </Panel>

        {/* 9. Graduation gate */}
        <Panel
          title="Ready to hand over — gate review"
          count={gates.length}
          meta="Scoped to Adopt and Graduate to CS · same readiness assessment as Customer 360"
        >
          <ul className="divide-y divide-border">
            {gates.map((g) => (
              <li key={g.impl.id} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <CustomerLink impl={g.impl} className="text-[13px]" />
                  <StageBadge stage={g.impl.current_stage} />
                  <Owner name={g.impl.owner_name} />
                  <span
                    className={cn(
                      "ml-auto font-mono text-[11px]",
                      g.summary.attention
                        ? "text-status-risk-foreground"
                        : "text-status-on-track-foreground",
                    )}
                  >
                    {g.summary.attention} attention · {g.summary.ready} ready
                  </span>
                </div>
                <p className="mt-1 text-[12px]">{g.summary.line}</p>
                <ul className="mt-1 grid gap-x-6 gap-y-0.5 md:grid-cols-2">
                  {g.areas.map((a) => (
                    <li key={a.id} className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">{a.label}</span> ·{" "}
                      {READINESS_STATE_LABEL[a.state]} · {a.reason}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {gates.length === 0 ? (
              <NoRows label="No implementation is in Adopt or Graduate to CS." />
            ) : null}
          </ul>
        </Panel>

        <p className="text-[11px] text-muted-foreground">
          No auth yet — this is the whole portfolio, not a filtered team. Nothing here is a score,
          forecast or trend: {humanize("stage")} dwell and counts come straight from stored records,
          and stages shown are the eight owned stages from {stageLabel("handoff")} onward.
        </p>
      </PageBody>
    </>
  );
}
