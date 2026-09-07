import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, Info } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { Panel, StageBadge, StatusChip, StatusDot, NoRows } from "@/components/record";
import { ScopeSwitch } from "@/components/scope-switch";
import { AddCommitment, type TeamOption } from "@/components/delivery-write";
import { useScope } from "@/lib/use-scope";
import { getHome, getTeamOptions } from "@/lib/hub.functions";
import { fmtDate, fmtMoney } from "@/lib/hub-format";
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

/** Padding and type weight per bucket — the only things that vary by bucket. */
const CARD_DENSITY: Record<TriageBucket, { pad: string; reason: string; metaGap: string }> = {
  act_now: { pad: "p-3", reason: "text-[13px] font-medium", metaGap: "mt-2" },
  needs_attention: { pad: "p-2.5", reason: "text-[13px]", metaGap: "mt-1.5" },
  moving: { pad: "p-2", reason: "text-[12px] text-muted-foreground", metaGap: "mt-1" },
};

/**
 * The one implementation card used everywhere on Today — Needs action, Keep
 * an eye on and On track alike. Same fields, same rules, in every bucket:
 * what changes is how much there is to say, not how it's said. No eyebrow
 * labels — position and the arrow prefix carry the meaning instead of a
 * repeated "WHAT'S HAPPENING" / "WHAT TO DO" / "OWNER" on every line.
 *
 * `bucket` decides exactly one thing beyond density: whether a missing next
 * step is worth mentioning. On "Needs action" or "Keep an eye on", nobody
 * having written down what to do is itself a gap worth surfacing. On "On
 * track" it's the ordinary case — nothing is open, so there is nothing to
 * schedule — and calling that out on every clean account would be the exact
 * "empty field forced onto an on-track row" this design is trying to avoid.
 */
function ImplementationCard({
  row,
  health,
  team,
  bucket,
  onNextActionSaved,
}: {
  row: QueueRow;
  health: HealthResult;
  team: TeamOption[];
  bucket: TriageBucket;
  onNextActionSaved: () => void;
}) {
  const { impl } = row;
  const conflict = launchStateConflict(impl);
  const waiting = row.dependency.party !== "none" ? row.dependency : null;
  const noNextAction = row.next_action === NEXT_ACTION_UNKNOWN;
  const showNextAction = !noNextAction || bucket !== "moving";
  const density = CARD_DENSITY[bucket];

  return (
    <li className={cn("rounded-lg border border-border bg-card", density.pad)}>
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

      <p className={cn("mt-1.5", density.reason)}>{humanizeReason(row.reason)}</p>

      {showNextAction ? (
        <p className={cn("mt-1 text-[13px]", noNextAction && "italic text-muted-foreground")}>
          → {noNextAction ? "Next step hasn't been recorded yet." : row.next_action}
        </p>
      ) : null}

      {waiting ? (
        <p className="mt-1 text-[12px] text-muted-foreground">
          {waiting.reason}
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

      <p
        className={cn("flex flex-wrap gap-x-3 text-[11px] text-muted-foreground", density.metaGap)}
      >
        <span>{fmtDate(impl.target_launch_date)}</span>
        <span>{fmtMoney(impl.arr)}</span>
        <span>{impl.owner_name ?? "Unassigned"}</span>
      </p>

      <div className="mt-1.5">
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
  level: "primary" | "default" | "supporting";
}> = [
  {
    bucket: "act_now",
    title: "Needs action",
    meta: "Blocked, escalated, a critical risk, an overdue promise to the customer, or a launch date already gone by",
    accent: "bg-status-blocked-foreground",
    empty: "Nothing needs immediate action. Everything else is in the lists below.",
    level: "primary",
  },
  {
    bucket: "needs_attention",
    title: "Keep an eye on",
    meta: "Open risk or issue, other overdue commitments, no movement for more than 14 days, something due in the next 7 days, or flagged at risk",
    accent: "bg-status-risk-foreground",
    empty: "Nothing to keep an eye on right now.",
    level: "default",
  },
  {
    bucket: "moving",
    title: "On track",
    meta: "On track, with nothing open against them",
    accent: "bg-status-ontrack-foreground",
    empty: "No implementations are moving cleanly — check the lists above.",
    level: "supporting",
  },
];

function HomePage() {
  const { param, setScope } = useScope();
  const { data } = useSuspenseQuery(homeQuery(param));
  const queue = buildQueue(data.implementations, data.triage);
  const healthByImpl: Map<string, HealthResult> = healthByImplementation(
    data.implementations,
    data.triage,
  );

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
        {SECTIONS.map((section) => {
          const rows = queue[section.bucket];
          return (
            <Panel
              key={section.bucket}
              level={section.level}
              title={
                <span className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", section.accent)} />
                  {section.title}
                </span>
              }
              count={rows.length}
              meta={section.meta}
            >
              {rows.length === 0 ? (
                <NoRows label={section.empty} />
              ) : (
                <ul className="space-y-2 p-2">
                  {rows.map((row) => (
                    <ImplementationCard
                      key={row.impl.id}
                      row={row}
                      health={healthByImpl.get(row.impl.id)!}
                      team={team.data ?? []}
                      bucket={section.bucket}
                      onNextActionSaved={refreshHome}
                    />
                  ))}
                </ul>
              )}
            </Panel>
          );
        })}

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
