import { describe, expect, it } from "vitest";

import {
  buildCalendarEvents,
  chipLabel,
  chipTitle,
  customerLinkFor,
  customersWithSeveralImplementations,
  dayInZone,
  dayLabel,
  defaultSelectedDay,
  detailRows,
  eventsByDay,
  monthWeeks,
  planMeetingsFor,
  primaryImplementationByDeal,
  sortEvents,
  STATUS_LABEL,
  teamToday,
  addDaysIso,
  addMonthsIso,
  type CalendarCommitment,
  type CalendarEvent,
  type CalendarImplementation,
  type CalendarMilestone,
  type CalendarSource,
  type PlanMeeting,
} from "@/lib/calendar-events";
import { EMPTY_INTAKE } from "@/lib/intake-answers";
import { PARTNER_JOURNEY } from "@/lib/partner-implementation";

const TODAY = "2026-10-13";

function impl(over: Partial<CalendarImplementation> = {}): CalendarImplementation {
  return {
    id: "impl-1",
    name: "Field Forms",
    customerId: "cust-1",
    customerName: "Aquatic Facility Services",
    dealId: "deal-1",
    createdAt: "2026-09-01T00:00:00Z",
    superseded: false,
    partner: false,
    targetDate: null,
    targetLaunchDate: null,
    baselineDate: null,
    goLiveAt: null,
    actualLaunchDate: null,
    ...over,
  };
}

function meeting(over: Partial<PlanMeeting> = {}): PlanMeeting {
  return {
    key: "call.stage1",
    label: "Stage 1 — Get it working",
    date: "2026-10-20",
    time: null,
    doneOn: null,
    moved: false,
    timeZone: "America/New_York",
    ...over,
  };
}

function commitment(over: Partial<CalendarCommitment> = {}): CalendarCommitment {
  return {
    id: "c-1",
    implementationId: "impl-1",
    description: "Send the signed SOW",
    dueDate: "2026-10-20",
    status: "open",
    fulfilledAt: null,
    ownerName: "Priya Lead",
    ...over,
  };
}

function milestone(over: Partial<CalendarMilestone> = {}): CalendarMilestone {
  return {
    id: "m-1",
    implementationId: "impl-1",
    name: "Implementation Ready",
    stage: "partner_setup",
    status: "not_started",
    targetDate: null,
    completedDate: null,
    ownerName: null,
    ...over,
  };
}

function source(over: Partial<CalendarSource> = {}): CalendarSource {
  return {
    today: TODAY,
    implementations: [impl()],
    planMeetings: [],
    commitments: [],
    milestones: [],
    ...over,
  };
}

function find(events: CalendarEvent[], key: string): CalendarEvent {
  const e = events.find((x) => x.key === key);
  if (!e) throw new Error(`no event ${key}`);
  return e;
}

/* ------------------------------------------------- days, zones and the grid */

describe("calendar days and time zones", () => {
  it("places an instant on the team's day, not the UTC day", () => {
    // 02:30 UTC on the 14th is still the 13th in New York.
    expect(dayInZone("2026-10-14T02:30:00Z", "America/New_York")).toBe("2026-10-13");
    expect(dayInZone("2026-10-14T14:30:00Z", "America/New_York")).toBe("2026-10-14");
  });

  it("never shifts a bare calendar day, whatever the zone", () => {
    expect(dayInZone("2026-10-14", "Pacific/Auckland")).toBe("2026-10-14");
    expect(dayInZone("2026-10-14", "America/Los_Angeles")).toBe("2026-10-14");
  });

  it("takes today in the team zone, so every viewer agrees", () => {
    const justAfterMidnightUtc = new Date("2026-10-14T03:00:00Z");
    expect(teamToday(justAfterMidnightUtc, "America/New_York")).toBe("2026-10-13");
    expect(teamToday(justAfterMidnightUtc, "UTC")).toBe("2026-10-14");
  });

  it("builds a Monday-first month grid of full weeks that holds the whole month", () => {
    const weeks = monthWeeks("2026-10-01");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]![0]).toBe("2026-09-28"); // Monday before 1 Oct
    const flat = weeks.flat();
    expect(flat).toContain("2026-10-01");
    expect(flat).toContain("2026-10-31");
    expect(flat[flat.length - 1]!.slice(0, 7)).not.toBe("2026-10"); // trails into November
  });

  it("moves between months across a year boundary", () => {
    expect(addMonthsIso("2026-12-15", 1)).toBe("2027-01-01");
    expect(addMonthsIso("2027-01-10", -1)).toBe("2026-12-01");
  });

  it("opens the agenda on today when today is in the month shown", () => {
    expect(defaultSelectedDay(TODAY, "2026-10-01")).toBe(TODAY);
    expect(defaultSelectedDay(TODAY, "2026-11-01")).toBe("2026-11-01");
  });
});

/* ------------------------------------------------------- meetings & status */

describe("planned and completed meetings", () => {
  it("reads a future meeting with a recorded time as booked, and never calls it confirmed", () => {
    const events = buildCalendarEvents(
      source({
        planMeetings: [{ implementationId: "impl-1", meetings: [meeting({ time: "10:00" })] }],
      }),
    );
    const e = find(events, "plan:deal-1:call.stage1");
    expect(e.status).toBe("booked");
    expect(STATUS_LABEL[e.status]).toBe("Booked");
    expect(e.statusDetail).toBe("10:00 America/New_York · Confirmation not recorded");
    expect(e.time).toBe("10:00");
    expect(e.timeZone).toBe("America/New_York");
    expect(Object.values(STATUS_LABEL)).not.toContain("Confirmed");
  });

  it("reads a future meeting with no recorded time as not booked yet", () => {
    const events = buildCalendarEvents(
      source({
        planMeetings: [{ implementationId: "impl-1", meetings: [meeting({ time: null })] }],
      }),
    );
    const e = find(events, "plan:deal-1:call.stage1");
    expect(e.status).toBe("not_booked");
    expect(STATUS_LABEL[e.status]).toBe("Not booked yet");
    expect(e.statusDetail).toBe("No time recorded on the plan");
    expect(chipTitle(e)).toContain("Status: Not booked yet");
  });

  it("keeps past calls as completed or completion not recorded, booked or not", () => {
    const events = buildCalendarEvents(
      source({
        planMeetings: [
          {
            implementationId: "impl-1",
            meetings: [
              meeting({ key: "a", date: "2026-10-01", time: "10:00" }),
              meeting({ key: "b", date: "2026-10-02", time: null }),
              meeting({ key: "c", date: "2026-10-03", time: "10:00", doneOn: "2026-10-03" }),
            ],
          },
        ],
      }),
    );
    expect(find(events, "plan:deal-1:a").status).toBe("completion_not_recorded");
    expect(find(events, "plan:deal-1:b").status).toBe("completion_not_recorded");
    expect(find(events, "plan:deal-1:c").status).toBe("completed");
  });

  it("keeps a past call that was never ticked as 'completion not recorded', not overdue or completed", () => {
    const events = buildCalendarEvents(
      source({
        planMeetings: [{ implementationId: "impl-1", meetings: [meeting({ date: "2026-10-01" })] }],
      }),
    );
    const e = find(events, "plan:deal-1:call.stage1");
    expect(e.status).toBe("completion_not_recorded");
    expect(STATUS_LABEL[e.status]).toBe("Completion not recorded");
  });

  it("keeps a completed call on its day, with the date it was marked done", () => {
    const events = buildCalendarEvents(
      source({
        planMeetings: [
          {
            implementationId: "impl-1",
            meetings: [meeting({ date: "2026-10-01", doneOn: "2026-10-01" })],
          },
        ],
      }),
    );
    const e = find(events, "plan:deal-1:call.stage1");
    expect(e.status).toBe("completed");
    expect(e.statusDetail).toContain("Completed");
  });

  it("says plainly when a call has no time and no responsible person", () => {
    const events = buildCalendarEvents(
      source({
        planMeetings: [{ implementationId: "impl-1", meetings: [meeting({ time: null })] }],
      }),
    );
    const e = find(events, "plan:deal-1:call.stage1");
    expect(e.time).toBeNull();
    expect(e.timeZone).toBeNull();
    expect(e.owner).toBeNull();
    expect(e.missing).toEqual(["Time not recorded", "Responsible person not recorded"]);
    const rows = detailRows(e);
    expect(rows.find((r) => r.label === "Time")?.value).toBe("Not recorded");
    expect(rows.find((r) => r.label === "Responsible")?.value).toBe("Not recorded");
  });

  it("does not invent cancelled meetings: a call with no record of cancellation is not shown as one", () => {
    const events = buildCalendarEvents(source({ planMeetings: [] }));
    expect(events.some((e) => e.status === "cancelled" && e.kind === "meeting")).toBe(false);
  });

  it("drops an unbooked pre-kickoff guess, but keeps the same plan once kickoff is under way", () => {
    const intake = { ...EMPTY_INTAKE, path: "new_logo" as const };
    const before = planMeetingsFor({
      intake,
      closeDate: "2026-10-05",
      dealStage: "closed_won",
      partner: false,
    });
    const after = planMeetingsFor({
      intake,
      closeDate: "2026-10-05",
      dealStage: "get_it_working",
      partner: false,
    });
    // Before kickoff, an untimed call is only the playbook's guess from the close: not an event.
    expect(before.every((m) => m.time !== null || m.doneOn !== null)).toBe(true);
    // Once the deal has moved on, the same untimed calls are the plan, and are kept.
    expect(after.some((m) => m.time === null)).toBe(true);
  });

  it("keeps a completed call before Kickoff, even when the kickoff was never booked", () => {
    const intake = {
      ...EMPTY_INTAKE,
      path: "new_logo" as const,
      timeline: { ...EMPTY_INTAKE.timeline, completed: { kickoff: "2026-10-07" } },
    };
    const meetings = planMeetingsFor({
      intake,
      closeDate: "2026-10-05",
      dealStage: "onboarding_kickoff",
      partner: false,
    });
    const kickoff = meetings.find((m) => m.key === "kickoff");
    expect(kickoff?.doneOn).toBe("2026-10-07");
    expect(kickoff?.time).toBeNull();
    // The other, unbooked sessions are still only guesses and stay out.
    expect(meetings.every((m) => m.time !== null || m.doneOn !== null)).toBe(true);
  });

  it("drops an unbooked call the plan dated before the deal entered Kickoff, once it is there", () => {
    const intake = { ...EMPTY_INTAKE, path: "new_logo" as const };
    const all = planMeetingsFor({
      intake,
      closeDate: "2026-09-01",
      dealStage: "kickoff",
      partner: false,
    });
    const kickoffOn = "2026-10-12";
    const guessed = all.filter((m) => m.date < kickoffOn);
    expect(guessed.length).toBeGreaterThan(0);

    const kept = planMeetingsFor({
      intake,
      closeDate: "2026-09-01",
      dealStage: "kickoff",
      partner: false,
      kickoffOn,
    });
    expect(kept.some((m) => m.date < kickoffOn)).toBe(false);
    expect(kept.length).toBe(all.length - guessed.length);
    // So nothing the close guessed comes back as a call whose completion is missing.
    const events = buildCalendarEvents(
      source({ planMeetings: [{ implementationId: "impl-1", meetings: kept }] }),
    );
    expect(events.some((e) => e.status === "completion_not_recorded")).toBe(false);
  });

  it("keeps a booked or completed call dated before the deal entered Kickoff", () => {
    const first = planMeetingsFor({
      intake: { ...EMPTY_INTAKE, path: "new_logo" as const },
      closeDate: "2026-09-01",
      dealStage: "kickoff",
      partner: false,
    })[0]!;
    const kickoffOn = addDaysIso(first.date, 7);
    const withTimeline = (timeline: Partial<typeof EMPTY_INTAKE.timeline>) => ({
      ...EMPTY_INTAKE,
      path: "new_logo" as const,
      timeline: { ...EMPTY_INTAKE.timeline, ...timeline },
    });
    const booked = planMeetingsFor({
      intake: withTimeline({ times: { [first.key]: "10:00" } }),
      closeDate: "2026-09-01",
      dealStage: "kickoff",
      partner: false,
      kickoffOn,
    });
    expect(booked.find((m) => m.key === first.key)?.time).toBe("10:00");
    const completed = planMeetingsFor({
      intake: withTimeline({ completed: { [first.key]: first.date } }),
      closeDate: "2026-09-01",
      dealStage: "kickoff",
      partner: false,
      kickoffOn,
    });
    expect(completed.find((m) => m.key === first.key)?.doneOn).toBe(first.date);
  });
});

/* ------------------------------------------------------------- commitments */

describe("commitments", () => {
  it("keeps a fulfilled commitment on its due day, even after the day has passed", () => {
    const events = buildCalendarEvents(
      source({
        commitments: [
          commitment({
            status: "fulfilled",
            dueDate: "2026-09-02",
            fulfilledAt: "2026-09-01T15:00:00Z",
          }),
        ],
      }),
    );
    const e = find(events, "commitment:c-1");
    expect(e.date).toBe("2026-09-02");
    expect(e.status).toBe("completed");
    expect(e.statusDetail).toMatch(/^Fulfilled /);
  });

  it("marks an open commitment past its due day as overdue, and a future one as due", () => {
    const events = buildCalendarEvents(
      source({
        commitments: [
          commitment({ id: "late", dueDate: "2026-10-01" }),
          commitment({ id: "soon", dueDate: "2026-10-20" }),
        ],
      }),
    );
    expect(find(events, "commitment:late").status).toBe("overdue");
    expect(find(events, "commitment:soon").status).toBe("due");
  });

  it("shows a cancelled commitment only because a cancellation is recorded", () => {
    const events = buildCalendarEvents(
      source({ commitments: [commitment({ status: "cancelled", dueDate: "2026-10-02" })] }),
    );
    expect(find(events, "commitment:c-1").status).toBe("cancelled");
  });

  it("places a fulfilled commitment with no due date on the team's day it was fulfilled", () => {
    const events = buildCalendarEvents(
      source({
        commitments: [
          commitment({ status: "fulfilled", dueDate: null, fulfilledAt: "2026-10-14T02:30:00Z" }),
        ],
      }),
    );
    const e = find(events, "commitment:c-1");
    expect(e.date).toBe("2026-10-13");
    expect(e.missing).toEqual(["Due date not recorded"]);
  });

  it("does not place an open commitment with no due date on the calendar", () => {
    const events = buildCalendarEvents(source({ commitments: [commitment({ dueDate: null })] }));
    expect(events.some((e) => e.key === "commitment:c-1")).toBe(false);
  });

  it("says who is responsible when it is recorded, and that it is not when it is not", () => {
    const events = buildCalendarEvents(
      source({
        commitments: [commitment({ id: "named" }), commitment({ id: "anon", ownerName: null })],
      }),
    );
    expect(find(events, "commitment:named").missing).toEqual([]);
    expect(find(events, "commitment:anon").missing).toEqual(["Owner not recorded"]);
  });
});

/* -------------------------------------------------- milestones & partner */

describe("standard and partner milestones", () => {
  it("keeps a completed partner milestone on its completion day, however old", () => {
    const stage = PARTNER_JOURNEY.find((s) => s.key === "partner_setup")!.label;
    const events = buildCalendarEvents(
      source({
        implementations: [impl({ partner: true })],
        milestones: [
          milestone({ status: "completed", completedDate: "2026-09-10", stage: "partner_setup" }),
        ],
      }),
    );
    const e = find(events, "milestone:m-1");
    expect(e.date).toBe("2026-09-10");
    expect(e.status).toBe("completed");
    expect(e.stageLabel).toBe(stage);
    expect(e.partner).toBe(true);
    expect(e.facts).toContain("Partner implementation.");
  });

  it("marks an open milestone with a past target as overdue, and a future one as planned", () => {
    const events = buildCalendarEvents(
      source({
        milestones: [
          milestone({ id: "late", targetDate: "2026-10-01" }),
          milestone({ id: "ahead", targetDate: "2026-11-02" }),
        ],
      }),
    );
    expect(find(events, "milestone:late").status).toBe("overdue");
    expect(find(events, "milestone:ahead").status).toBe("planned");
  });

  it("gives a partner milestone no date it was never given", () => {
    const events = buildCalendarEvents(
      source({ implementations: [impl({ partner: true })], milestones: [milestone()] }),
    );
    expect(events.some((e) => e.key === "milestone:m-1")).toBe(false);
  });

  it("never gives a partner implementation a standard meeting, even with a plan", () => {
    const meetings = planMeetingsFor({
      intake: { ...EMPTY_INTAKE, path: "partner_implementation" },
      closeDate: "2026-10-05",
      dealStage: "get_it_working",
      partner: true,
    });
    expect(meetings).toEqual([]);
  });

  it("shows a standard plan's meetings for a standard deal", () => {
    const meetings = planMeetingsFor({
      intake: { ...EMPTY_INTAKE, path: "new_logo" },
      closeDate: "2026-10-05",
      dealStage: "get_it_working",
      partner: false,
    });
    expect(meetings.length).toBeGreaterThan(0);
    for (const m of meetings) expect(m.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/* ----------------------------------------------------------- go-live dates */

describe("go-live dates", () => {
  it("shows the authoritative target as planned while it is ahead", () => {
    const events = buildCalendarEvents(
      source({ implementations: [impl({ targetDate: "2026-11-02" })] }),
    );
    const e = find(events, "go-live-target:impl-1");
    expect(e.date).toBe("2026-11-02");
    expect(e.status).toBe("planned");
    expect(e.statusDetail).toBe("Go-live not yet recorded");
  });

  it("falls back to the documented target launch date when no current target is set", () => {
    const events = buildCalendarEvents(
      source({ implementations: [impl({ targetDate: null, targetLaunchDate: "2026-11-09" })] }),
    );
    expect(find(events, "go-live-target:impl-1").date).toBe("2026-11-09");
  });

  it("says the target passed when no go-live was recorded", () => {
    const events = buildCalendarEvents(
      source({ implementations: [impl({ targetDate: "2026-09-30" })] }),
    );
    const e = find(events, "go-live-target:impl-1");
    expect(e.status).toBe("target_passed");
    expect(STATUS_LABEL[e.status]).toBe("Target passed, go-live not recorded");
  });

  it("shows the actual go-live on its own day, separate from the target", () => {
    const events = buildCalendarEvents(
      source({
        implementations: [impl({ targetDate: "2026-10-01", goLiveAt: "2026-10-03" })],
      }),
    );
    const target = find(events, "go-live-target:impl-1");
    const actual = find(events, "go-live-actual:impl-1");
    expect(target.date).toBe("2026-10-01");
    expect(actual.date).toBe("2026-10-03");
    expect(actual.status).toBe("went_live");
    expect(actual.title).toBe("Actual go-live");
  });

  describe("target and actual go-live when the dates differ (regression)", () => {
    const events = buildCalendarEvents(
      source({
        implementations: [impl({ targetDate: "2026-10-01", goLiveAt: "2026-10-03" })],
      }),
    );

    it("keeps the target event as the planned, historical date, not a go-live", () => {
      const target = find(events, "go-live-target:impl-1");
      expect(target.status).toBe("target_date");
      expect(target.status).not.toBe("went_live");
      expect(target.title).toBe("Target go-live");
      expect(target.date).toBe("2026-10-01");
      expect(STATUS_LABEL[target.status]).toBe("Planned target date");
      expect(target.statusDetail).toBe(`Actual go-live recorded ${dayLabel("2026-10-03")}`);
    });

    it("gives the real go-live its own event on the day it happened, referring to the plan", () => {
      const actual = find(events, "go-live-actual:impl-1");
      expect(actual.status).toBe("went_live");
      expect(actual.title).toBe("Actual go-live");
      expect(actual.date).toBe("2026-10-03");
      expect(actual.statusDetail).toBe(`Planned target was ${dayLabel("2026-10-01")}`);
    });

    it("keeps both events, never merged into one", () => {
      const goLive = events.filter((e) => e.kind === "go_live");
      expect(goLive.map((e) => e.key).sort()).toEqual([
        "go-live-actual:impl-1",
        "go-live-target:impl-1",
      ]);
    });
  });

  it("says so plainly when the real go-live landed on the planned day", () => {
    const events = buildCalendarEvents(
      source({
        implementations: [impl({ targetDate: "2026-10-01", goLiveAt: "2026-10-01" })],
      }),
    );
    expect(find(events, "go-live-target:impl-1").statusDetail).toBe("Went live on this date");
    expect(find(events, "go-live-actual:impl-1").statusDetail).toBe("On the planned target date");
  });

  it("does not use the target status for a target that is still ahead", () => {
    const events = buildCalendarEvents(
      source({ implementations: [impl({ targetDate: "2026-11-02" })] }),
    );
    expect(find(events, "go-live-target:impl-1").status).toBe("planned");
  });

  it("notes an agreed baseline only when it differs from the current target", () => {
    const moved = buildCalendarEvents(
      source({ implementations: [impl({ targetDate: "2026-11-02", baselineDate: "2026-10-26" })] }),
    );
    expect(
      find(moved, "go-live-target:impl-1").facts.some((f) => f.startsWith("Agreed baseline")),
    ).toBe(true);
    const same = buildCalendarEvents(
      source({ implementations: [impl({ targetDate: "2026-11-02", baselineDate: "2026-11-02" })] }),
    );
    expect(
      find(same, "go-live-target:impl-1").facts.some((f) => f.startsWith("Agreed baseline")),
    ).toBe(false);
  });
});

/* -------------------------------------------------- scope, history & dups */

describe("scope, history and duplicates", () => {
  it("drops every record for an implementation outside the scope", () => {
    const events = buildCalendarEvents({
      today: TODAY,
      implementations: [impl({ id: "in-scope" })],
      planMeetings: [{ implementationId: "out-of-scope", meetings: [meeting()] }],
      commitments: [commitment({ id: "x", implementationId: "out-of-scope" })],
      milestones: [
        milestone({ id: "y", implementationId: "out-of-scope", targetDate: "2026-10-30" }),
      ],
    });
    expect(events).toEqual([]);
  });

  it("keeps a superseded implementation's own completed records, marked as such", () => {
    const events = buildCalendarEvents(
      source({
        implementations: [impl({ superseded: true })],
        commitments: [
          commitment({
            status: "fulfilled",
            dueDate: "2026-08-20",
            fulfilledAt: "2026-08-19T12:00:00Z",
          }),
        ],
      }),
    );
    const e = find(events, "commitment:c-1");
    expect(e.status).toBe("completed");
    expect(e.facts.some((f) => f.startsWith("Superseded"))).toBe(true);
  });

  it("shows one deal's plan once, from its newest implementation", () => {
    const rows = [
      { id: "old", dealId: "deal-1", createdAt: "2026-08-01T00:00:00Z" },
      { id: "new", dealId: "deal-1", createdAt: "2026-09-01T00:00:00Z" },
      { id: "other", dealId: "deal-2", createdAt: "2026-07-01T00:00:00Z" },
      { id: "no-deal", dealId: null, createdAt: "2026-07-01T00:00:00Z" },
    ];
    const primary = primaryImplementationByDeal(rows);
    expect(primary.get("deal-1")).toBe("new");
    expect(primary.get("deal-2")).toBe("other");
    expect(primary.has("null")).toBe(false);
  });

  it("creates one event per record even when the same plan call is supplied twice", () => {
    const m = meeting();
    const events = buildCalendarEvents({
      today: TODAY,
      implementations: [impl({ id: "a", dealId: "deal-1" }), impl({ id: "b", dealId: "deal-1" })],
      planMeetings: [
        { implementationId: "a", meetings: [m] },
        { implementationId: "b", meetings: [m] },
      ],
      commitments: [],
      milestones: [],
    });
    expect(events.filter((e) => e.kind === "meeting")).toHaveLength(1);
  });

  it("keeps every event key unique", () => {
    const events = buildCalendarEvents(
      source({
        planMeetings: [{ implementationId: "impl-1", meetings: [meeting(), meeting()] }],
        commitments: [commitment(), commitment()],
      }),
    );
    const keys = events.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("returns nothing for an empty scope or an empty book", () => {
    expect(buildCalendarEvents(source({ implementations: [] }))).toEqual([]);
  });
});

/* ------------------------------------------------ agenda, details & links */

describe("selected day, agenda, details and navigation", () => {
  it("groups events by day and orders each day by recorded time, undated times last", () => {
    const events = buildCalendarEvents(
      source({
        planMeetings: [
          {
            implementationId: "impl-1",
            meetings: [
              meeting({ key: "late", label: "Later", date: "2026-10-20", time: "15:00" }),
              meeting({ key: "early", label: "Earlier", date: "2026-10-20", time: "09:00" }),
              meeting({ key: "undated", label: "No time", date: "2026-10-20", time: null }),
            ],
          },
        ],
      }),
    );
    const day = eventsByDay(sortEvents(events)).get("2026-10-20")!;
    expect(day.map((e) => e.title)).toEqual(["Earlier", "Later", "No time"]);
  });

  it("links to the customer record, opening the implementation when there is one", () => {
    const events = buildCalendarEvents(source({ commitments: [commitment()] }));
    expect(customerLinkFor(find(events, "commitment:c-1"))).toEqual({
      customerId: "cust-1",
      implementationId: "impl-1",
    });
    expect(customerLinkFor({ customerId: null, implementationId: "impl-1" })).toBeNull();
  });

  it("names the stage only when the record has one", () => {
    const events = buildCalendarEvents(
      source({ milestones: [milestone({ stage: null, targetDate: "2026-10-30" })] }),
    );
    expect(detailRows(find(events, "milestone:m-1")).some((r) => r.label === "Stage")).toBe(false);
  });
});

describe("month grid chips", () => {
  const twoDeals = () =>
    buildCalendarEvents(
      source({
        implementations: [
          impl({ id: "impl-1", name: "Field Forms", dealId: "deal-1", targetDate: "2026-10-20" }),
          impl({ id: "impl-2", name: "Safety Audits", dealId: "deal-2", targetDate: "2026-10-20" }),
        ],
      }),
    );

  it("names the customer, then the implementation, when a customer has two in view", () => {
    const events = twoDeals();
    const several = customersWithSeveralImplementations(events);
    const a = find(events, "go-live-target:impl-1");
    const b = find(events, "go-live-target:impl-2");
    expect(chipLabel(a, several)).toBe("Aquatic Facility Services · Field Forms · Target go-live");
    expect(chipLabel(b, several)).toBe(
      "Aquatic Facility Services · Safety Audits · Target go-live",
    );
    expect(chipTitle(a)).toBe(
      "Go-live: Aquatic Facility Services · Field Forms · Target go-live. Status: Planned",
    );
    expect(chipTitle(a)).not.toBe(chipTitle(b));
  });

  it("keeps the customer's name in the chip when it has one implementation in view", () => {
    const events = buildCalendarEvents(
      source({ implementations: [impl({ targetDate: "2026-10-20" })] }),
    );
    const e = find(events, "go-live-target:impl-1");
    expect(chipLabel(e, customersWithSeveralImplementations(events))).toBe(
      "Aquatic Facility Services · Target go-live",
    );
  });

  it("counts only the events in view: a second implementation elsewhere does not change the chip", () => {
    const events = twoDeals();
    const inView = events.filter((e) => e.implementationId === "impl-1");
    expect(customersWithSeveralImplementations(inView).size).toBe(0);
  });

  it("tells two customers with the same implementation name apart by customer", () => {
    const events = buildCalendarEvents(
      source({
        implementations: [
          impl({ id: "impl-1", targetDate: "2026-10-20" }),
          impl({
            id: "impl-2",
            customerId: "cust-2",
            customerName: "Ridgeline HVAC",
            dealId: "deal-2",
            targetDate: "2026-10-20",
          }),
        ],
      }),
    );
    expect(customersWithSeveralImplementations(events).size).toBe(0);
  });

  it("puts a missed target's status in words in the chip's title", () => {
    const events = buildCalendarEvents(
      source({ implementations: [impl({ targetDate: "2026-10-01" })] }),
    );
    const e = find(events, "go-live-target:impl-1");
    expect(e.status).toBe("target_passed");
    expect(chipTitle(e)).toContain("Status: Target passed, go-live not recorded");
  });
});
