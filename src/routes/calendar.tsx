import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { getHome } from "@/lib/hub.functions";
import { buildQueue } from "@/lib/home-triage";
import { addDaysIso, collectEvents, type UpcomingEvent } from "@/lib/home-today";
import { localIso } from "@/lib/onboarding-timeline";
import { shortMeeting } from "@/lib/workspace";
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

/** The shortest existing label that still means something, for the compact
 * grid cell: "Stage 1 — Get it working" → "Stage 1" (via the same
 * `shortMeeting` the workspace page already uses), "Target launch" → the
 * kind's own short word, "Launch" — a commitment's description is already
 * short. Never a new label, only a shorter cut of the existing one. */
function shortEventLabel(e: UpcomingEvent): string {
  if (e.kind === "meeting") return shortMeeting(e.label);
  if (e.kind === "launch") return KIND.launch.label;
  return e.label;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Month-grid date math, local to this presentation layer only — none of it
 * touches how an event is generated, just which day it's drawn on. */
function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}
function addMonths(iso: string, n: number): string {
  const d = new Date(`${monthStart(iso)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
/** Monday = 0 .. Sunday = 6, so the grid can start on a Monday. */
function isoWeekday(iso: string): number {
  return (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
}
function monthYearLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
const MAX_VISIBLE_PER_DAY = 3;

/**
 * The calendar: a real month grid of customer meetings, commitments and
 * target launches across the accounts in scope. Read from the same plans
 * the customer pages show, so a meeting moved on a plan moves here.
 * Navigating months only changes which date range the existing event list
 * is asked for — the same `collectEvents` this page always called, with no
 * change to what counts as an event or how one is dated.
 */
function CalendarPage() {
  const { param } = useScope();
  const { data } = useSuspenseQuery(homeQuery(param));
  const queue = buildQueue(data.implementations, data.triage);
  const rows = [...queue.act_now, ...queue.needs_attention, ...queue.moving];
  const today = localIso();

  const [viewedMonth, setViewedMonth] = useState(() => monthStart(today));
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggleExpanded = (day: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });

  const gridStart = addDaysIso(viewedMonth, -isoWeekday(viewedMonth));
  const nextMonth = addMonths(viewedMonth, 1);
  const lastOfMonth = addDaysIso(nextMonth, -1);
  const gridEnd = addDaysIso(lastOfMonth, 6 - isoWeekday(lastOfMonth));

  const events = collectEvents(rows, data.commitments, gridStart, gridEnd);
  const eventsByDay = new Map<string, UpcomingEvent[]>();
  for (const e of events) eventsByDay.set(e.date, [...(eventsByDay.get(e.date) ?? []), e]);

  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDaysIso(d, 1)) days.push(d);
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Key dates and meetings across your accounts: the plan's calls, commitments due, target launches."
      />
      <PageBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          {(Object.keys(KIND) as Array<keyof typeof KIND>).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", KIND[k].dot)} /> {KIND[k].label}
            </span>
          ))}
          <span className="ml-auto">A planned call with no time is shown as its planned day.</span>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">{monthYearLabel(viewedMonth)}</h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setViewedMonth((m) => addMonths(m, -1))}
              aria-label="Previous month"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewedMonth(monthStart(today))}
              className="rounded-md border border-border px-2.5 py-1.5 text-[12px] font-medium hover:bg-muted"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setViewedMonth((m) => addMonths(m, 1))}
              aria-label="Next month"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-7 border-b border-border bg-muted/40">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {weeks.flatMap((week) =>
              week.map((d) => {
                const inMonth = d.slice(0, 7) === viewedMonth.slice(0, 7);
                const isToday = d === today;
                const dayEvents = eventsByDay.get(d) ?? [];
                const isExpanded = expanded.has(d);
                const visible = isExpanded ? dayEvents : dayEvents.slice(0, MAX_VISIBLE_PER_DAY);
                const hiddenCount = dayEvents.length - visible.length;
                return (
                  <div
                    key={d}
                    className={cn(
                      "min-h-[92px] border-b border-r border-border p-1.5 last:border-r-0",
                      !inMonth && "bg-muted/20",
                    )}
                  >
                    <span
                      className={cn(
                        "mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[12px]",
                        isToday
                          ? "bg-primary font-semibold text-primary-foreground"
                          : inMonth
                            ? "text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {Number(d.slice(8, 10))}
                    </span>
                    <ul className="space-y-0.5">
                      {visible.map((e) => {
                        const content = (
                          <>
                            <span
                              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", KIND[e.kind].dot)}
                            />
                            <span className="truncate">
                              {e.account} · {shortEventLabel(e)}
                            </span>
                          </>
                        );
                        return (
                          <li key={e.key}>
                            {"customerId" in e.link ? (
                              <Link
                                to="/customers/$customerId"
                                params={{ customerId: e.link.customerId }}
                                search={
                                  e.link.implementationId ? { impl: e.link.implementationId } : {}
                                }
                                className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] hover:bg-muted"
                              >
                                {content}
                              </Link>
                            ) : (
                              <span className="flex items-center gap-1 px-1 py-0.5 text-[11px] text-muted-foreground">
                                {content}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {hiddenCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(d)}
                        className="mt-0.5 px-1 text-[11px] text-primary hover:underline"
                      >
                        +{hiddenCount} more
                      </button>
                    ) : isExpanded && dayEvents.length > MAX_VISIBLE_PER_DAY ? (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(d)}
                        className="mt-0.5 px-1 text-[11px] text-muted-foreground hover:underline"
                      >
                        Show less
                      </button>
                    ) : null}
                  </div>
                );
              }),
            )}
          </div>
        </div>
      </PageBody>
    </>
  );
}
