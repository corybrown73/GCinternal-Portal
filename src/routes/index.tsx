import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, Info } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { Panel, StageBadge, StatusChip, StatusDot, NoRows } from "@/components/record";
import { ScopeSwitch } from "@/components/scope-switch";
import { AddCommitment, type TeamOption } from "@/components/delivery-write";
import { useScope } from "@/lib/use-scope";
import { getHome, getTeamOptions } from "@/lib/hub.functions";
import { fmtDate, fmtDateTime, fmtMoney, humanize } from "@/lib/hub-format";
import { NEXT_ACTION_UNKNOWN, deriveHealth, launchStateConflict } from "@/lib/customer360-derive";

type HealthResult = ReturnType<typeof deriveHealth>;
import {
  buildQueue,
  healthByImplementation,
  type QueueRow,
  type TriageBucket,
} from "@/lib/home-triage";
import { cn } from "@/lib/utils";

// The scope is part of the key: switching whose accounts you are looking at
// has to refetch, and two scopes must never share a cache entry.
const homeQuery = (scope: string | null) =>
  queryOptions({
    queryKey: ["home", scope],
    queryFn: () => getHome({ data: scope ? { scope } : {} }),
  });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today — What needs my attention | Implementation Hub" },
      {
        name: "description",
        content:
          "Every implementation sorted by what needs doing: act now, needs attention, or moving — with the reason, the impact, the owner and the next action.",
      },
      { property: "og:title", content: "Today — What needs my attention | Implementation Hub" },
      {
        property: "og:description",
        content: "The daily working list for the onboarding and implementation team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { scope?: string } =>
    typeof search["scope"] === "string" ? { scope: search["scope"] as string } : {},
  loaderDeps: ({ search }: { search: { scope?: string } }) => ({ scope: search.scope ?? null }),
  loader: ({ context, deps }) => {
    context.queryClient.ensureQueryData(homeQuery(deps.scope));
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      We couldn't load today's list: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-[13px]">Nothing to show.</div>,

  component: HomePage,
});

function CustomerLink({
  customerId,
  implementationId,
  children,
  className,
}: {
  customerId: string;
  implementationId?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      to="/customers/$customerId"
      params={{ customerId }}
      search={{ tab: "overview", ...(implementationId ? { impl: implementationId } : {}) }}
      className={cn("hover:underline", className)}
    >
      {children}
    </Link>
  );
}

/**
 * Reword the handful of reason strings that read as a system report rather
 * than something a person would say — only the two phrasings called out
 * explicitly. Everything else in row.reason already reads as plain English
 * and is left untouched. Presentation only: never changes which bucket a
 * row lands in, only how this one card describes it.
 */
function humanizeReason(reason: string): string {
  const overdueLaunch = reason.match(/^Target launch passed .+\((\d+)d over\)$/);
  if (overdueLaunch) return `Launch is ${overdueLaunch[1]} days overdue.`;

  const stalled = reason.match(/^Stalled (\d+) days? in /);
  if (stalled) return `No movement for ${stalled[1]} days.`;

  return reason;
}

/**
 * The "WHAT NEEDS ME" card — the same QueueRow/health data the lists below
 * use, presented as one answerable unit: what's happening, what to do next,
 * what it's waiting for, and a one-click way to update the next step.
 *
 * Deliberately does not wrap the whole card in a Link the way QueueRowItem
 * does below: the quick-action form needs its own clicks (inputs, Save,
 * Cancel), and a button nested inside an anchor is both invalid HTML and a
 * click-handling trap.
 */
function MyWorkCard({
  row,
  health,
  team,
  onNextActionSaved,
}: {
  row: QueueRow;
  health: HealthResult;
  team: TeamOption[];
  onNextActionSaved: () => void;
}) {
  const { impl } = row;
  const conflict = launchStateConflict(impl);
  const waiting = row.dependency.party !== "none" ? row.dependency : null;
  const noNextAction = row.next_action === NEXT_ACTION_UNKNOWN;

  return (
    <li className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CustomerLink
          customerId={impl.customer_id}
          implementationId={impl.id}
          className="text-[14px] font-semibold"
        >
          {impl.customer_name}
        </CustomerLink>
        <StageBadge stage={impl.current_stage} />
        <StatusChip status={health.level} />
        <Link
          to="/customers/$customerId"
          params={{ customerId: impl.customer_id }}
          search={{ tab: row.tab, impl: impl.id }}
          className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
        >
          Open
          <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
        <span>
          <span className="uppercase tracking-[0.08em]">Target launch</span> ·{" "}
          {fmtDate(impl.target_launch_date)}
        </span>
        <span>
          <span className="uppercase tracking-[0.08em]">ARR</span> · {fmtMoney(impl.arr)}
        </span>
        <span>
          <span className="uppercase tracking-[0.08em]">Owner</span> ·{" "}
          {impl.owner_name ?? "Unassigned"}
        </span>
      </div>

      <p className="mt-2 text-[13px] font-medium">
        <span className="text-[11px] font-normal uppercase tracking-[0.08em] text-muted-foreground">
          What's happening
        </span>{" "}
        · {humanizeReason(row.reason)}
      </p>

      <p className={cn("mt-1 text-[13px]", noNextAction && "italic text-muted-foreground")}>
        <span className="text-[11px] font-normal uppercase tracking-[0.08em] text-muted-foreground">
          What to do
        </span>{" "}
        · {noNextAction ? "Next step hasn't been recorded yet." : row.next_action}
      </p>

      {waiting ? (
        <p className="mt-1 text-[12px] text-muted-foreground">
          <span className="uppercase tracking-[0.08em]">Waiting for</span> ·{" "}
          {waiting.reason.replace(/^Waiting on /i, "")}
          {waiting.since ? ` (since ${fmtDate(waiting.since)})` : ""}
        </p>
      ) : null}

      {/* Data-quality note, deliberately subordinate: this is a missing-field
          flag, not a claim that anything is actually blocked. */}
      {conflict ? (
        <p className="mt-1 inline-flex items-center gap-1.5 rounded-sm border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
          <Info className="h-3 w-3" strokeWidth={1.75} />
          Data quality: past the launch stage, but no actual launch date recorded.
        </p>
      ) : null}

      <div className="mt-2">
        <AddCommitment
          customerId={impl.customer_id}
          implementationId={impl.id}
          team={team}
          addLabel="Update next step"
          onSaved={onNextActionSaved}
        />
      </div>
    </li>
  );
}

const SECTIONS: Array<{
  bucket: TriageBucket;
  title: string;
  meta: string;
  accent: string;
  empty: string;
}> = [
  {
    bucket: "act_now",
    title: "Needs action",
    meta: "Blocked, escalated, a critical risk, an overdue promise to the customer, or a launch date already gone by",
    accent: "bg-status-blocked-foreground",
    empty: "Nothing needs immediate action. Everything else is in the lists below.",
  },
  {
    bucket: "needs_attention",
    title: "Keep an eye on",
    meta: "Open risk or issue, other overdue commitments, no movement for more than 14 days, something due in the next 7 days, or flagged at risk",

    accent: "bg-status-risk-foreground",
    empty: "Nothing to keep an eye on right now.",
  },
  {
    bucket: "moving",
    title: "On track",
    meta: "On track, with nothing open against them",
    accent: "bg-status-on-track-foreground",
    empty: "No implementations are moving cleanly — check the lists above.",
  },
];

function QueueRowItem({ row, health }: { row: QueueRow; health: HealthResult }) {
  const { impl } = row;
  const conflict = launchStateConflict(impl);
  return (
    <li className="group relative hover:bg-muted/60">
      <Link
        to="/customers/$customerId"
        params={{ customerId: impl.customer_id }}
        search={{ tab: row.tab, impl: impl.id }}
        className="block px-3 py-2.5"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[13px] font-medium group-hover:underline">
            {impl.customer_name}
          </span>
          <StageBadge stage={impl.current_stage} />
          <StatusChip status={health.level} />
          {impl.status !== "on_track" ? (
            <span className="text-[11px] text-muted-foreground">
              Marked as: {humanize(impl.status)}
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
            {row.tab}
            <ArrowRight className="h-3 w-3" strokeWidth={2} />
          </span>
        </div>

        <p className="mt-1 text-[13px]">{row.reason}</p>

        {conflict ? (
          <p className="mt-1 inline-flex items-center gap-1.5 rounded-sm border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
            <Info className="h-3 w-3" strokeWidth={1.75} />
            This is past the launch stage, but no actual launch date has been recorded.
          </p>
        ) : null}

        <div className="mt-1 grid gap-x-6 gap-y-0.5 text-[11px] text-muted-foreground md:grid-cols-[1fr_1fr_10rem]">
          <span>
            <span className="uppercase tracking-[0.08em]">Impact</span> · {row.impact}
          </span>
          <span>
            <span className="uppercase tracking-[0.08em]">Next</span> · {row.next_action}
          </span>
          <span>
            <span className="uppercase tracking-[0.08em]">Owner</span> ·{" "}
            {impl.owner_name ?? "Unassigned"}
          </span>
          {/* Phase 6: the dependency is the spine — who owes the next move, and
              since when. Dated from the deciding record, never from stage entry. */}
          <span className="md:col-span-3">
            <span className="uppercase tracking-[0.08em]">Waiting on</span> ·{" "}
            {row.dependency.reason}
            {row.dependency.since ? ` (since ${fmtDate(row.dependency.since)})` : ""}
          </span>
        </div>
      </Link>
    </li>
  );
}

function HomePage() {
  const { param, setScope } = useScope();
  const { data } = useSuspenseQuery(homeQuery(param));
  const queue = buildQueue(data.implementations, data.triage);
  const healthByImpl: Map<string, HealthResult> = healthByImplementation(
    data.implementations,
    data.triage,
  );

  // The same rank order buildQueue already produced, just not cut into
  // buckets: highest priority first, whichever bucket it landed in.
  const myWork = [...queue.act_now, ...queue.needs_attention, ...queue.moving].slice(0, 5);

  const queryClient = useQueryClient();
  const team = useQuery({ queryKey: ["team-options"], queryFn: () => getTeamOptions() });
  const refreshHome = () => queryClient.invalidateQueries({ queryKey: ["home", param] });

  return (
    <>
      <PageHeader
        title="Today"
        description="What needs my attention — every implementation sorted by what's driving it, not by task due dates."
        actions={
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              {queue.act_now.length} needs action · {queue.needs_attention.length} keep an eye on ·{" "}
              {queue.moving.length} on track
            </span>
            <ScopeSwitch scope={data.scope} onChange={setScope} />
          </div>
        }
      />
      <PageBody className="space-y-4">
        <Panel
          title="What needs me"
          count={myWork.length}
          meta="Implementations that need you to do something."
        >
          {myWork.length === 0 ? (
            <NoRows label="Nothing in your book right now. Use the scope control above to see everyone else's." />
          ) : (
            <ul className="space-y-2 p-2">
              {myWork.map((row) => (
                <MyWorkCard
                  key={row.impl.id}
                  row={row}
                  health={healthByImpl.get(row.impl.id)!}
                  team={team.data ?? []}
                  onNextActionSaved={refreshHome}
                />
              ))}
            </ul>
          )}
        </Panel>

        {SECTIONS.map((section) => {
          const rows = queue[section.bucket];
          return (
            <Panel
              key={section.bucket}
              title={
                <span className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", section.accent)} />
                  {section.title}
                </span>
              }

              count={rows.length}
              meta={section.meta}
            >
              <ul className="divide-y divide-border">
                {rows.map((row) => (
                  <QueueRowItem
                    key={row.impl.id}
                    row={row}
                    health={healthByImpl.get(row.impl.id)!}
                  />
                ))}
                {rows.length === 0 ? <NoRows label={section.empty} /> : null}
              </ul>
            </Panel>
          );
        })}

        <Panel
          title="Recent activity"
          count={data.signal.length}
          meta="Newest first · the context behind the lists above"
        >
          <ul className="divide-y divide-border">
            {data.signal.slice(0, 12).map((s) => (
              <li key={s.key} className="flex gap-3 px-3 py-2">
                <Clock
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  strokeWidth={1.75}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px]">
                    {s.title}
                    {s.customer_id && s.customer_name ? (
                      <>
                        {" — "}
                        <CustomerLink
                          customerId={s.customer_id}
                          implementationId={s.implementation_id}
                          className="font-medium"
                        >
                          {s.customer_name}
                        </CustomerLink>
                      </>
                    ) : null}
                  </p>
                  {s.detail ? (
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{s.detail}</p>
                  ) : null}
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {fmtDateTime(s.at)}
                  {s.actor ? ` · ${s.actor}` : ""}
                </span>
              </li>
            ))}
            {data.signal.length === 0 ? <NoRows label="No activity recorded yet." /> : null}
          </ul>
        </Panel>

        {/* This used to claim "sign-in isn't set up yet, so this shows every
            implementation regardless of who owns it". Sign-in has been set up
            for a long time and the page was in fact showing the viewer's own
            book — which for an admin who owns nothing meant zero of everything,
            under a footer insisting it was showing all of it. A caption that
            contradicts the numbers above it costs more trust than no caption. */}
        <p className="text-[11px] text-muted-foreground">
          <StatusDot status="idle" className="mr-1 align-middle" />{" "}
          {data.scope.mode === "all"
            ? "Showing every project. Use the scope control above to narrow to one person's accounts."
            : "Showing a subset. Use the scope control above to see every project."}
        </p>
      </PageBody>
    </>
  );
}
