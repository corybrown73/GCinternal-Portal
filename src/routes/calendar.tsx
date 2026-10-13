import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock,
  Flag,
  Rocket,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { ShowTestsToggle } from "@/components/show-tests-toggle";
import { getCalendar } from "@/lib/hub.functions";
import {
  addDaysIso,
  addMonthsIso,
  customerLinkFor,
  dayLabel,
  defaultSelectedDay,
  detailRows,
  eventsByDay,
  KIND_LABEL,
  monthStartIso,
  monthWeeks,
  STATUS_LABEL,
  type CalendarEvent,
  type CalendarKind,
  type CalendarStatus,
} from "@/lib/calendar-events";
import { readShowTests, SHOW_TESTS_PARAM } from "@/lib/test-accounts";
import { useScope } from "@/lib/use-scope";
import { cn } from "@/lib/utils";

const calendarQuery = (scope: string | null, tests: boolean) =>
  queryOptions({
    // The test-account view (0085) is its own cache entry.
    queryKey: tests ? ["calendar", scope, "tests"] : ["calendar", scope],
    queryFn: () =>
      getCalendar({
        data: { ...(scope ? { scope } : {}), ...(tests ? { includeTests: true } : {}) },
      }),
  });

type CalendarSearch = { scope?: string; tests?: boolean };

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Implementation dates | GoCanvas Handoff Hub" },
      {
        name: "description",
        content:
          "What happened, what is happening and what is coming next across your implementations: meetings, commitments, milestones and go-live dates.",
      },
    ],
  }),
  validateSearch: (raw: Record<string, unknown>): CalendarSearch => {
    const out: CalendarSearch = {};
    if (typeof raw["scope"] === "string") out.scope = raw["scope"];
    if (readShowTests(raw[SHOW_TESTS_PARAM])) out.tests = true;
    return out;
  },
  loaderDeps: ({ search }: { search: CalendarSearch }) => ({
    scope: search.scope ?? null,
    tests: search.tests === true,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(calendarQuery(deps.scope, deps.tests)),
  component: CalendarPage,
});

const KIND_DOT: Record<CalendarKind, string> = {
  meeting: "bg-[#2a78d6]",
  commitment: "bg-[#eda100]",
  milestone: "bg-[#0f8a7a]",
  go_live: "bg-[#4a3aa7]",
};

const STATUS_ICON: Record<CalendarStatus, LucideIcon> = {
  completed: CheckCircle2,
  planned: Clock,
  due: Clock,
  overdue: AlertTriangle,
  completion_not_recorded: CircleDashed,
  cancelled: XCircle,
  target_passed: Flag,
  went_live: Rocket,
};

const STATUS_TONE: Record<CalendarStatus, string> = {
  completed: "text-status-ontrack-foreground",
  went_live: "text-status-ontrack-foreground",
  planned: "text-foreground",
  due: "text-foreground",
  overdue: "text-status-risk-foreground",
  target_passed: "text-status-risk-foreground",
  completion_not_recorded: "text-muted-foreground",
  cancelled: "text-muted-foreground line-through",
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

function monthLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function cellLabel(day: string, count: number, isToday: boolean): string {
  const n = count === 0 ? "No events" : `${count} ${count === 1 ? "event" : "events"}`;
  return `${dayLabel(day)}. ${n}${isToday ? ". Today" : ""}`;
}

/** The status as text and an icon, with its recorded detail beneath. Never colour alone. */
function StatusTag({ status, detail }: { status: CalendarStatus; detail?: string | null }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className="flex flex-col gap-0.5">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[13px] font-medium",
          STATUS_TONE[status],
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {STATUS_LABEL[status]}
      </span>
      {detail ? <span className="text-[12px] text-muted-foreground">{detail}</span> : null}
    </span>
  );
}

function CalendarPage() {
  const { param } = useScope();
  const search = Route.useSearch();
  const tests = search.tests === true;
  const navigate = useNavigate({ from: Route.fullPath });
  const setSearch = (patch: Record<string, unknown>) =>
    navigate({ search: (prev: CalendarSearch) => ({ ...prev, ...patch }) });

  const { data } = useSuspenseQuery(calendarQuery(param, tests));
  const today = data.today;
  const events = data.events;
  const byDay = useMemo(() => eventsByDay(events), [events]);

  const [viewedMonth, setViewedMonth] = useState(() => monthStartIso(today));
  const [selectedDay, setSelectedDay] = useState(() => defaultSelectedDay(today, viewedMonth));
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLElement>(null);

  const weeks = useMemo(() => monthWeeks(viewedMonth), [viewedMonth]);
  const dayEvents = byDay.get(selectedDay) ?? [];
  const selected = openKey ? (events.find((e) => e.key === openKey) ?? null) : null;

  const goToMonth = (month: string, day: string) => {
    setViewedMonth(month);
    setSelectedDay(day);
    setOpenKey(null);
  };

  // Arrow keys move the selected day; the grid holds one tab stop, the selected day.
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const delta = step[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const next = addDaysIso(selectedDay, delta);
    if (next.slice(0, 7) !== viewedMonth.slice(0, 7)) setViewedMonth(monthStartIso(next));
    setSelectedDay(next);
    setFocusDay(next);
  };

  useEffect(() => {
    if (!focusDay) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus();
    setFocusDay(null);
  }, [focusDay, viewedMonth]);

  useEffect(() => {
    if (openKey) detailsRef.current?.focus();
  }, [openKey]);

  return (
    <>
      <PageHeader
        title="Calendar"
        description={`Implementation dates across your accounts: what happened, what is happening and what is coming next. Read-only: change a date or a status in Current Implementation.${data.scope?.label ? ` Showing ${data.scope.label}.` : ""}`}
      />
      <PageBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted-foreground">
          {(Object.keys(KIND_LABEL) as CalendarKind[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", KIND_DOT[k])} aria-hidden="true" />
              {KIND_LABEL[k]}
            </span>
          ))}
          <span className="ml-auto">
            <ShowTestsToggle
              checked={tests}
              onChange={(on) => setSearch({ tests: on ? true : undefined })}
            />
          </span>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">{monthLabel(viewedMonth)}</h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                goToMonth(
                  addMonthsIso(viewedMonth, -1),
                  defaultSelectedDay(today, addMonthsIso(viewedMonth, -1)),
                )
              }
              aria-label="Previous month"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => goToMonth(monthStartIso(today), today)}
              className="rounded-md border border-border px-2.5 py-1.5 text-[13px] font-medium hover:bg-muted"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() =>
                goToMonth(
                  addMonthsIso(viewedMonth, 1),
                  defaultSelectedDay(today, addMonthsIso(viewedMonth, 1)),
                )
              }
              aria-label="Next month"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {events.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
            No implementation dates are recorded for the accounts in this scope yet.
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-border">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-7 border-b border-border bg-muted/40">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="px-2 py-1.5 text-center text-[12px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {label}
                </div>
              ))}
            </div>
            <div
              ref={gridRef}
              role="group"
              aria-label={`${monthLabel(viewedMonth)} calendar. Use the arrow keys to move between days.`}
              onKeyDown={onGridKey}
              className="grid grid-cols-7"
            >
              {weeks.flatMap((week) =>
                week.map((d) => {
                  const inMonth = d.slice(0, 7) === viewedMonth.slice(0, 7);
                  const isToday = d === today;
                  const isSelected = d === selectedDay;
                  const items = byDay.get(d) ?? [];
                  return (
                    <button
                      key={d}
                      type="button"
                      data-day={d}
                      aria-pressed={isSelected}
                      aria-current={isToday ? "date" : undefined}
                      aria-label={cellLabel(d, items.length, isToday)}
                      tabIndex={isSelected ? 0 : -1}
                      onClick={() => {
                        setSelectedDay(d);
                        setOpenKey(null);
                      }}
                      className={cn(
                        "flex min-h-[104px] flex-col items-stretch border-b border-r border-border p-1.5 text-left last:border-r-0 hover:bg-muted/50 focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-primary",
                        !inMonth && "bg-muted/20",
                        isSelected && "bg-primary/5 ring-2 ring-inset ring-primary",
                      )}
                    >
                      <span
                        className={cn(
                          "mb-1 inline-flex h-6 min-w-6 items-center justify-center self-start rounded-full px-1 text-[13px]",
                          isToday
                            ? "bg-primary font-semibold text-primary-foreground"
                            : inMonth
                              ? "text-foreground"
                              : "text-muted-foreground",
                        )}
                      >
                        {Number(d.slice(8, 10))}
                      </span>
                      <span className="space-y-0.5">
                        {items.slice(0, MAX_CHIPS).map((e) => (
                          <span
                            key={e.key}
                            className={cn(
                              "flex items-center gap-1 truncate text-[12px] leading-5",
                              e.status === "cancelled" && "line-through text-muted-foreground",
                            )}
                            title={`${e.customerName} · ${e.title}`}
                          >
                            <span
                              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", KIND_DOT[e.kind])}
                              aria-hidden="true"
                            />
                            <span className="truncate">
                              {e.customerName} · {e.title}
                            </span>
                          </span>
                        ))}
                        {items.length > MAX_CHIPS ? (
                          <span className="block px-1 text-[12px] text-primary">
                            +{items.length - MAX_CHIPS} more
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        </div>

        <section aria-labelledby="calendar-agenda-heading" className="space-y-2">
          <h3 id="calendar-agenda-heading" className="text-[15px] font-semibold">
            {dayLabel(selectedDay)}
            {selectedDay === today ? (
              <span className="ml-2 rounded-full bg-primary px-2 py-0.5 align-middle text-[11px] font-semibold text-primary-foreground">
                Today
              </span>
            ) : null}
          </h3>
          {dayEvents.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nothing recorded for this day.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {dayEvents.map((e) => (
                <li key={e.key}>
                  <button
                    type="button"
                    aria-pressed={openKey === e.key}
                    onClick={() => setOpenKey(e.key)}
                    className={cn(
                      "grid w-full grid-cols-[120px_1fr_auto] items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/50",
                      openKey === e.key && "bg-primary/5",
                    )}
                  >
                    <span className="text-[13px] text-muted-foreground">
                      {e.time ?? "No time recorded"}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <span
                          className={cn("h-1.5 w-1.5 rounded-full", KIND_DOT[e.kind])}
                          aria-hidden="true"
                        />
                        {KIND_LABEL[e.kind]}
                      </span>
                      <span className="block truncate text-[14px] font-medium">{e.title}</span>
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {e.customerName} · {e.implementationName}
                      </span>
                    </span>
                    <StatusTag status={e.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {selected ? (
          <EventDetails event={selected} detailsRef={detailsRef} onClose={() => setOpenKey(null)} />
        ) : null}
      </PageBody>
    </>
  );
}

function EventDetails({
  event,
  detailsRef,
  onClose,
}: {
  event: CalendarEvent;
  detailsRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const link = customerLinkFor(event);
  return (
    <section
      ref={detailsRef}
      tabIndex={-1}
      aria-labelledby="calendar-event-title"
      className="space-y-4 rounded-lg border border-border bg-card p-4 outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            {KIND_LABEL[event.kind]}
          </p>
          <h3 id="calendar-event-title" className="text-[16px] font-semibold">
            {event.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-2.5 py-1 text-[13px] hover:bg-muted"
        >
          Close details
        </button>
      </div>

      <StatusTag status={event.status} detail={event.statusDetail} />

      <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-[13px]">
        {detailRows(event).map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 break-words">{row.value}</dd>
          </div>
        ))}
      </dl>

      {event.facts.length ? (
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
          {event.facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}

      {event.missing.length ? (
        <p className="text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">Not recorded: </span>
          {event.missing.join("; ")}.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-[12px] text-muted-foreground">
          To change this date or status, use Current Implementation.
        </p>
        {link ? (
          <Link
            to="/customers/$customerId"
            params={{ customerId: link.customerId }}
            search={link.implementationId ? { impl: link.implementationId } : {}}
            className="rounded-md border border-border px-3 py-1.5 text-[13px] font-medium hover:bg-muted"
          >
            Open Customer 360
          </Link>
        ) : null}
      </div>
    </section>
  );
}
