import { isKickoffBooked } from "./stage-flow";
import { isPartnerDeal, PARTNER_JOURNEY } from "./partner-implementation";
import { timelineFor } from "./onboarding-plan";
import { TEAM_ZONE } from "./onboarding-timeline";
import { isUnbookedBeforeKickoff } from "./presale-stages";
import type { IntakeAnswers } from "./intake-answers";

/**
 * The Calendar's event model, built only from records the Hub already keeps.
 *
 * Pure: the server reads the records and hands them in, so every rule here is
 * tested without a database. Nothing is invented. A date, a status or a time
 * appears only where a stored record, or the plan's own computation from one,
 * gives it. Where a fact is not recorded the event says so.
 *
 * Dates are calendar days (YYYY-MM-DD) and are never shifted by a time zone.
 * "Today" is the team's day (TEAM_ZONE), computed once on the server, so every
 * viewer sees the same day. A recorded time is kept in the zone it was set in.
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------ days & zones */

/** Adds whole days to a calendar day. Calendar arithmetic only; no zone involved. */
export function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The first day of the month that holds this day. */
export function monthStartIso(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Moves a month's first day by whole months, always landing on the 1st. */
export function addMonthsIso(iso: string, n: number): string {
  const d = new Date(`${monthStartIso(iso)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday = 0 .. Sunday = 6, so the grid starts on a Monday. */
export function mondayIndex(iso: string): number {
  return (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * The calendar day a moment falls on in a zone. `instant` is a Date or an
 * ISO timestamp; a bare day is returned unchanged, so a date column is never
 * moved by converting it.
 */
export function dayInZone(instant: Date | string, zone: string = TEAM_ZONE): string {
  if (typeof instant === "string" && ISO_DAY.test(instant)) return instant;
  const date = instant instanceof Date ? instant : new Date(instant);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** The team's day right now: the single "today" the Calendar uses. */
export function teamToday(now: Date = new Date(), zone: string = TEAM_ZONE): string {
  return dayInZone(now, zone);
}

/** "Tue 14 Oct 2026", read from the calendar day. Never shifted by the viewer's zone. */
export function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "14 Oct", for a compact label. */
export function shortDayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "10:00 America/Chicago", so a recorded time always names its zone. */
export function timeLabel(time: string, zone: string): string {
  return `${time} ${zone}`;
}

/* ----------------------------------------------------------------- types */

export type CalendarKind = "meeting" | "commitment" | "milestone" | "go_live";

/**
 * What the record says about the event. A planned meeting is "planned" even
 * when it has a time: the Hub keeps no confirmation, so none is claimed.
 */
export type CalendarStatus =
  | "completed"
  | "planned"
  | "due"
  | "overdue"
  | "completion_not_recorded"
  | "cancelled"
  | "target_passed"
  | "target_date"
  | "went_live";

export const STATUS_LABEL: Record<CalendarStatus, string> = {
  completed: "Completed",
  planned: "Planned",
  due: "Due",
  overdue: "Overdue",
  completion_not_recorded: "Completion not recorded",
  cancelled: "Cancelled",
  target_passed: "Target passed, go-live not recorded",
  target_date: "Planned target date",
  went_live: "Went live",
};

export const KIND_LABEL: Record<CalendarKind, string> = {
  meeting: "Meeting",
  commitment: "Commitment",
  milestone: "Milestone",
  go_live: "Go-live",
};

/** Where an event's date comes from, so the details can say so. */
export type CalendarSourceKind = "plan" | "record" | "target";

export type CalendarEvent = {
  /** Unique within a build: the same record never yields two events. */
  key: string;
  /** Calendar day, YYYY-MM-DD. */
  date: string;
  /** "HH:MM" as recorded on the plan, else null. */
  time: string | null;
  /** The zone a recorded time was set in. Null for a date-only event. */
  timeZone: string | null;
  kind: CalendarKind;
  title: string;
  status: CalendarStatus;
  /** Short facts the record supports, e.g. "Completed 14 Oct", "Confirmation not recorded". */
  statusDetail: string | null;
  customerId: string | null;
  customerName: string;
  implementationId: string;
  implementationName: string;
  /** The recorded responsible person, else null. Plan calls have none. */
  owner: string | null;
  /** The journey stage the record belongs to, when it is known. */
  stageLabel: string | null;
  source: CalendarSourceKind;
  /** Further recorded facts for the details panel. */
  facts: string[];
  /** Which recorded details are missing, said plainly rather than guessed. */
  missing: string[];
  /** True for a partner implementation's own records. */
  partner: boolean;
};

export type CalendarImplementation = {
  id: string;
  name: string;
  customerId: string | null;
  customerName: string;
  dealId: string | null;
  createdAt: string;
  /** Replaced by a later project; its own records still stand. */
  superseded: boolean;
  partner: boolean;
  targetDate: string | null;
  targetLaunchDate: string | null;
  baselineDate: string | null;
  goLiveAt: string | null;
  actualLaunchDate: string | null;
};

export type CalendarCommitment = {
  id: string;
  implementationId: string;
  description: string;
  dueDate: string | null;
  status: string;
  fulfilledAt: string | null;
  ownerName: string | null;
};

export type CalendarMilestone = {
  id: string;
  implementationId: string;
  name: string;
  stage: string | null;
  status: string;
  targetDate: string | null;
  completedDate: string | null;
  ownerName: string | null;
};

/** One call on a standard plan, as the plan computes it from the close date and what was recorded. */
export type PlanMeeting = {
  key: string;
  label: string;
  date: string;
  time: string | null;
  doneOn: string | null;
  moved: boolean;
  timeZone: string;
};

export type CalendarSource = {
  today: string;
  /** The in-scope implementations. Records for any other implementation are dropped. */
  implementations: ReadonlyArray<CalendarImplementation>;
  /** The plan's calls, one entry per implementation that carries a deal's plan. */
  planMeetings: ReadonlyArray<{ implementationId: string; meetings: ReadonlyArray<PlanMeeting> }>;
  commitments: ReadonlyArray<CalendarCommitment>;
  milestones: ReadonlyArray<CalendarMilestone>;
};

/* ------------------------------------------------------- plan & primaries */

/**
 * A deal's plan is shown once, from one implementation: the newest that
 * carries the deal. Superseded implementations keep their own records, but a
 * deal's plan is never copied onto two projects.
 */
export function primaryImplementationByDeal(
  rows: ReadonlyArray<{ id: string; dealId: string | null; createdAt: string }>,
): Map<string, string> {
  const best = new Map<string, { id: string; createdAt: string }>();
  for (const r of rows) {
    if (!r.dealId) continue;
    const current = best.get(r.dealId);
    if (
      !current ||
      r.createdAt > current.createdAt ||
      (r.createdAt === current.createdAt && r.id > current.id)
    ) {
      best.set(r.dealId, { id: r.id, createdAt: r.createdAt });
    }
  }
  return new Map([...best].map(([dealId, v]) => [dealId, v.id]));
}

/**
 * The plan's calls for one deal, from the same plan the customer's page
 * shows. Empty for a partner implementation: partner dates come only from
 * partner records, never from the standard plan. A call that is only a guess
 * before kickoff (no kickoff booked, no time of its own) is not an event.
 */
export function planMeetingsFor(input: {
  intake: IntakeAnswers;
  closeDate: string;
  dealStage: string | null;
  partner: boolean;
}): PlanMeeting[] {
  if (input.partner || isPartnerDeal(input.intake)) return [];
  const timeline = timelineFor(input.intake, input.closeDate);
  const kickoffBooked = isKickoffBooked(input.intake);
  const timeZone = input.intake.timeline.timezone || TEAM_ZONE;
  return timeline.milestones
    .filter(
      (m) =>
        m.kind === "call" &&
        !m.serviceId &&
        !isUnbookedBeforeKickoff(input.dealStage, m, kickoffBooked),
    )
    .map((m) => ({
      key: m.key,
      label: m.label,
      date: m.date,
      time: m.time,
      doneOn: m.doneOn,
      moved: m.moved,
      timeZone,
    }));
}

/* ------------------------------------------------------------- building */

function partnerStageLabel(stage: string | null): string | null {
  if (!stage) return null;
  return PARTNER_JOURNEY.find((s) => s.key === stage)?.label ?? null;
}

function isCompleted(status: string, completedDate: string | null): boolean {
  return status === "completed" || completedDate !== null;
}

/**
 * Every Calendar event from the records, once each. The same rules apply to
 * every journey: a record decides its own status, and a date only ever comes
 * from a record.
 */
export function buildCalendarEvents(source: CalendarSource): CalendarEvent[] {
  const impls = new Map(source.implementations.map((i) => [i.id, i]));
  const out = new Map<string, CalendarEvent>();
  const add = (e: CalendarEvent) => {
    if (!out.has(e.key)) out.set(e.key, e);
  };

  const base = (impl: CalendarImplementation) => ({
    customerId: impl.customerId,
    customerName: impl.customerName,
    implementationId: impl.id,
    implementationName: impl.name,
    partner: impl.partner,
    facts: [
      ...(impl.superseded ? ["Superseded by a later project; this is its own record."] : []),
      ...(impl.partner ? ["Partner implementation."] : []),
    ] as string[],
  });

  for (const pm of source.planMeetings) {
    const impl = impls.get(pm.implementationId);
    if (!impl) continue;
    for (const m of pm.meetings) {
      if (!ISO_DAY.test(m.date)) continue;
      let status: CalendarStatus;
      let statusDetail: string | null;
      if (m.doneOn) {
        status = "completed";
        statusDetail = `Completed ${dayLabel(m.doneOn)}`;
      } else if (m.date >= source.today) {
        status = "planned";
        statusDetail = "Confirmation not recorded";
      } else {
        status = "completion_not_recorded";
        statusDetail = "No completion recorded for this call";
      }
      const missing = [...(m.time ? [] : ["Time not recorded"]), "Responsible person not recorded"];
      add({
        ...base(impl),
        key: `plan:${impl.dealId ?? impl.id}:${m.key}`,
        date: m.date,
        time: m.time,
        timeZone: m.time ? m.timeZone : null,
        kind: "meeting",
        title: m.label,
        status,
        statusDetail,
        owner: null,
        stageLabel: null,
        source: "plan",
        facts: [...base(impl).facts, ...(m.moved ? ["Date set by hand on the plan."] : [])],
        missing,
      });
    }
  }

  for (const c of source.commitments) {
    const impl = impls.get(c.implementationId);
    if (!impl) continue;
    const fulfilled = c.status === "fulfilled";
    const date = c.dueDate ?? (fulfilled && c.fulfilledAt ? dayInZone(c.fulfilledAt) : null);
    if (!date || !ISO_DAY.test(date)) continue;
    let status: CalendarStatus;
    let statusDetail: string | null = null;
    if (fulfilled) {
      status = "completed";
      statusDetail = c.fulfilledAt ? `Fulfilled ${dayLabel(dayInZone(c.fulfilledAt))}` : null;
    } else if (c.status === "cancelled") {
      status = "cancelled";
    } else if (date < source.today) {
      status = "overdue";
    } else {
      status = "due";
    }
    add({
      ...base(impl),
      key: `commitment:${c.id}`,
      date,
      time: null,
      timeZone: null,
      kind: "commitment",
      title: c.description,
      status,
      statusDetail,
      owner: c.ownerName,
      stageLabel: null,
      source: "record",
      missing: [
        ...(c.ownerName ? [] : ["Owner not recorded"]),
        ...(c.dueDate ? [] : ["Due date not recorded"]),
      ],
    });
  }

  for (const m of source.milestones) {
    const impl = impls.get(m.implementationId);
    if (!impl) continue;
    const date = m.targetDate ?? m.completedDate;
    if (!date || !ISO_DAY.test(date)) continue;
    let status: CalendarStatus;
    let statusDetail: string | null = null;
    if (isCompleted(m.status, m.completedDate)) {
      status = "completed";
      statusDetail = m.completedDate ? `Completed ${dayLabel(m.completedDate)}` : null;
    } else if (date < source.today) {
      status = "overdue";
    } else {
      status = "planned";
    }
    add({
      ...base(impl),
      key: `milestone:${m.id}`,
      date,
      time: null,
      timeZone: null,
      kind: "milestone",
      title: m.name,
      status,
      statusDetail,
      owner: m.ownerName,
      stageLabel: partnerStageLabel(m.stage),
      source: "record",
      missing: [
        ...(m.ownerName ? [] : ["Owner not recorded"]),
        ...(m.targetDate ? [] : ["Target date not recorded"]),
      ],
    });
  }

  for (const impl of source.implementations) {
    const target = impl.targetDate ?? impl.targetLaunchDate;
    const actual = impl.goLiveAt ?? impl.actualLaunchDate;
    const baselineFact =
      impl.baselineDate && impl.baselineDate !== target
        ? [`Agreed baseline: ${dayLabel(impl.baselineDate)}.`]
        : [];
    if (target && ISO_DAY.test(target)) {
      let status: CalendarStatus;
      let statusDetail: string | null;
      // A target stays the planned date even once the real go-live is recorded:
      // it is history, not the customer's go-live. The real day is its own event.
      if (actual) {
        status = "target_date";
        statusDetail =
          actual === target
            ? "Went live on this date"
            : `Actual go-live recorded ${dayLabel(actual)}`;
      } else if (target >= source.today) {
        status = "planned";
        statusDetail = "Go-live not yet recorded";
      } else {
        status = "target_passed";
        statusDetail = null;
      }
      add({
        ...base(impl),
        key: `go-live-target:${impl.id}`,
        date: target,
        time: null,
        timeZone: null,
        kind: "go_live",
        title: "Target go-live",
        status,
        statusDetail,
        owner: null,
        stageLabel: null,
        source: "target",
        facts: [...base(impl).facts, ...baselineFact],
        missing: [],
      });
    }
    if (actual && ISO_DAY.test(actual)) {
      add({
        ...base(impl),
        key: `go-live-actual:${impl.id}`,
        date: actual,
        time: null,
        timeZone: null,
        kind: "go_live",
        title: "Actual go-live",
        status: "went_live",
        statusDetail: !target
          ? null
          : actual === target
            ? "On the planned target date"
            : `Planned target was ${dayLabel(target)}`,
        owner: null,
        stageLabel: null,
        source: "record",
        facts: [...base(impl).facts, ...baselineFact],
        missing: [],
      });
    }
  }

  return sortEvents([...out.values()]);
}

const KIND_ORDER: Record<CalendarKind, number> = {
  meeting: 0,
  go_live: 1,
  milestone: 2,
  commitment: 3,
};

/** By day, then recorded time (undated times last), then kind, then title. */
export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      // An undated time sorts after every recorded time, never among them.
      Number(a.time === null) - Number(b.time === null) ||
      (a.time ?? "").localeCompare(b.time ?? "") ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.title.localeCompare(b.title) ||
      a.key.localeCompare(b.key),
  );
}

/* ------------------------------------------------------------- view model */

/** Events grouped by calendar day, for the grid and the agenda. */
export function eventsByDay(events: ReadonlyArray<CalendarEvent>): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) map.set(e.date, [...(map.get(e.date) ?? []), e]);
  return map;
}

/** The weeks of a month's grid, Monday first, including the days either side. */
export function monthWeeks(viewedMonth: string): string[][] {
  const first = monthStartIso(viewedMonth);
  const last = addDaysIso(addMonthsIso(first, 1), -1);
  const start = addDaysIso(first, -mondayIndex(first));
  const end = addDaysIso(last, 6 - mondayIndex(last));
  const days: string[] = [];
  for (let d = start; d <= end; d = addDaysIso(d, 1)) days.push(d);
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

/** The day the agenda opens on: today when it is in the month shown, else the month's first day. */
export function defaultSelectedDay(today: string, viewedMonth: string): string {
  return today.slice(0, 7) === viewedMonth.slice(0, 7) ? today : monthStartIso(viewedMonth);
}

/**
 * Where the event-details panel links: the customer's record, with the
 * implementation open when there is one. Null when the event has no customer.
 */
export function customerLinkFor(
  e: Pick<CalendarEvent, "customerId" | "implementationId">,
): { customerId: string; implementationId: string | null } | null {
  if (!e.customerId) return null;
  return { customerId: e.customerId, implementationId: e.implementationId };
}

/** A "Label: value" description for the details panel's rows. */
export function detailRows(e: CalendarEvent): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Type", value: KIND_LABEL[e.kind] },
    { label: "Date", value: dayLabel(e.date) },
    {
      label: "Time",
      value: e.time && e.timeZone ? timeLabel(e.time, e.timeZone) : "Not recorded",
    },
    {
      label: "Date basis",
      value:
        e.source === "plan"
          ? "Planned on the implementation plan"
          : e.source === "target"
            ? "Recorded target date"
            : "Recorded",
    },
    { label: "Responsible", value: e.owner ?? "Not recorded" },
    { label: "Customer", value: e.customerName },
    { label: "Implementation", value: e.implementationName },
  ];
  if (e.stageLabel) rows.splice(5, 0, { label: "Stage", value: e.stageLabel });
  return rows;
}
