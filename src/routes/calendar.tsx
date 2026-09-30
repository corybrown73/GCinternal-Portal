import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { getHome } from "@/lib/hub.functions";
import { buildQueue } from "@/lib/home-triage";
import { addDaysIso, collectEvents, dayTitle, type UpcomingEvent } from "@/lib/home-today";
import { localIso } from "@/lib/onboarding-timeline";
import { useScope } from "@/lib/use-scope";
import { cn } from "@/lib/utils";

const homeQuery = (scope: string | null) =>
  queryOptions({
    queryKey: ["home", scope],
    queryFn: () => getHome({ data: scope ? { scope } : {} }),
  });

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Key dates & meetings | GoCanvas Handoff Hub" },
      {
        name: "description",
        content:
          "Every customer meeting, commitment and target launch across your accounts, by day.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { scope?: string } =>
    typeof search["scope"] === "string" ? { scope: search["scope"] as string } : {},
  loaderDeps: ({ search }: { search: { scope?: string } }) => ({ scope: search.scope ?? null }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(homeQuery(deps.scope)),
  component: CalendarPage,
});

const KIND: Record<UpcomingEvent["kind"], { label: string; dot: string }> = {
  meeting: { label: "Meeting", dot: "bg-[#2a78d6]" },
  commitment: { label: "Due", dot: "bg-[#eda100]" },
  launch: { label: "Launch", dot: "bg-[#4a3aa7]" },
};

/**
 * The calendar: the next six weeks of customer meetings, commitments and
 * target launches across the accounts in scope, one row per day that has
 * something on it. Read from the same plans the customer pages show, so a
 * meeting moved on a plan moves here.
 */
function CalendarPage() {
  const { param } = useScope();
  const { data } = useSuspenseQuery(homeQuery(param));
  const queue = buildQueue(data.implementations, data.triage);
  const rows = [...queue.act_now, ...queue.needs_attention, ...queue.moving];
  const today = localIso();
  const horizon = addDaysIso(today, 42);
  const events = collectEvents(rows, data.commitments, today, horizon);
  const days = [...new Set(events.map((e) => e.date))];
  const weeks: Array<{ start: string; days: string[] }> = [];
  for (const d of days) {
    const last = weeks[weeks.length - 1];
    if (last && d <= addDaysIso(last.start, 6)) last.days.push(d);
    else weeks.push({ start: d, days: [d] });
  }

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Key dates and meetings across your accounts for the next six weeks: the plan's calls, commitments due, target launches."
      />
      <PageBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          {(Object.keys(KIND) as Array<keyof typeof KIND>).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", KIND[k].dot)} /> {KIND[k].label}
            </span>
          ))}
          <span className="ml-auto">
            {events.length} {events.length === 1 ? "date" : "dates"} · a planned call with no time
            is shown as its planned day
          </span>
        </div>
        {events.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center text-[13px] text-muted-foreground">
            Nothing on the calendar for these accounts in the next six weeks.
          </p>
        ) : (
          weeks.map((w) => (
            <section key={w.start} className="rounded-lg border border-border bg-card">
              <h2 className="border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Week of {dayTitle(w.start)}
              </h2>
              <ul className="divide-y divide-border">
                {w.days.map((d) => (
                  <li key={d} className="grid gap-2 px-4 py-2.5 md:grid-cols-[150px_minmax(0,1fr)]">
                    <p className={cn("text-[13px] font-semibold", d === today && "text-primary")}>
                      {d === today ? "Today · " : ""}
                      {dayTitle(d)}
                    </p>
                    <ul className="space-y-1.5">
                      {events
                        .filter((e) => e.date === d)
                        .map((e) => (
                          <li key={e.key} className="flex items-start gap-2 text-[13px]">
                            <span
                              className={cn(
                                "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                                KIND[e.kind].dot,
                              )}
                            />
                            <span className="w-14 shrink-0 text-[12px] text-muted-foreground tabular-nums">
                              {e.time ?? "—"}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="font-medium">{e.label}</span>
                              <span className="text-muted-foreground"> · {e.account}</span>
                            </span>
                            {"customerId" in e.link ? (
                              <Link
                                to="/customers/$customerId"
                                params={{ customerId: e.link.customerId }}
                                className="inline-flex shrink-0 items-center gap-1 text-[12px] text-primary hover:underline"
                              >
                                Open <ArrowRight className="h-3 w-3" />
                              </Link>
                            ) : null}
                          </li>
                        ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </PageBody>
    </>
  );
}
