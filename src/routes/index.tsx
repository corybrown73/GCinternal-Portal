import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, Info } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { Panel, StageBadge, StatusChip, StatusDot, NoRows } from "@/components/record";
import { getHome } from "@/lib/hub.functions";
import { fmtDateTime, humanize } from "@/lib/hub-format";
import { deriveHealth, launchStateConflict } from "@/lib/customer360-derive";

type HealthResult = ReturnType<typeof deriveHealth>;
import {
  buildQueue,
  healthByImplementation,
  type QueueRow,
  type TriageBucket,
} from "@/lib/home-triage";
import { cn } from "@/lib/utils";

const homeQuery = queryOptions({
  queryKey: ["home"],
  queryFn: () => getHome(),
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
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(homeQuery);
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
  children,
  className,
}: {
  customerId: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      to="/customers/$customerId"
      params={{ customerId }}
      search={{ tab: "overview" }}
      className={cn("hover:underline", className)}
    >
      {children}
    </Link>
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
    title: "Act now",
    meta: "Blocked, escalated, a critical risk, an overdue promise to the customer, or a launch date already gone by",
    accent: "bg-status-blocked-foreground",
    empty: "Nothing needs immediate action. Everything else is in the lists below.",
  },
  {
    bucket: "needs_attention",
    title: "Needs attention",
    meta: "Open risk or issue, other overdue commitments, no movement for more than 14 days, something due in the next 7 days, or flagged at risk",

    accent: "bg-status-risk-foreground",
    empty: "Nothing to keep an eye on right now.",
  },
  {
    bucket: "moving",
    title: "Moving",
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
        search={{ tab: row.tab }}
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
        </div>
      </Link>
    </li>
  );
}

function HomePage() {
  const { data } = useSuspenseQuery(homeQuery);
  const queue = buildQueue(data.implementations, data.triage);
  const healthByImpl: Map<string, HealthResult> = healthByImplementation(
    data.implementations,
    data.triage,
  );


  return (
    <>
      <PageHeader
        title="Today"
        description="What needs my attention — every implementation sorted by what's driving it, not by task due dates."
        actions={
          <span className="font-mono text-[11px] text-muted-foreground">
            {queue.act_now.length} act now · {queue.needs_attention.length} needs attention ·{" "}
            {queue.moving.length} moving
          </span>
        }
      />
      <PageBody className="space-y-4">
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
                  <QueueRowItem key={row.impl.id} row={row} health={healthByImpl.get(row.impl.id)!} />
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
                        <CustomerLink customerId={s.customer_id} className="font-medium">
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

        <p className="text-[11px] text-muted-foreground">
          <StatusDot status="idle" className="mr-1 align-middle" /> Sign-in isn't set up yet, so this shows
          every implementation regardless of who owns it.
        </p>
      </PageBody>
    </>
  );
}
