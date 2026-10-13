import { describe, expect, it } from "vitest";

import {
  attentionItems,
  blockerItems,
  dashboardHeader,
  dashboardResources,
  gocanvasWork,
  homeworkTexts,
  ideasForLater,
  nextBookedSession,
  tisContact,
} from "../customer-dashboard";
import { customerWelcomeView, type WelcomeView } from "../welcome";

/** A WelcomeView with nothing recorded, overridden per test. */
function viewWith(overrides: Record<string, unknown> = {}): WelcomeView {
  return {
    dealId: "deal-1",
    clientName: "Aquatic Facility Services",
    industry: "Pools",
    icon: "Waves",
    timeline: {
      closeDate: "2026-10-01",
      path: "new_logo",
      milestones: [],
      liveDate: "2026-10-26",
      timezone: "America/New_York",
    },
    lead: "Priya Lead",
    fieldTester: null,
    fieldTesterDue: null,
    fieldTesterSource: null,
    team: {
      lead: "Priya Lead",
      leadEmail: "priya@gocanvas.com",
      leadCard: null,
      accountManager: null,
      solutionsEngineer: null,
      champion: null,
    },
    firstForm: { name: "Pool Service Ticket", objective: null, source: "library" },
    helpPicks: [],
    goBase: null,
    homeworkDone: {},
    parkingLot: [],
    workflowStory: null,
    implementationFocus: null,
    implementationFocusFallback: [],
    customerScope: { state: "empty", items: [] },
    intake: null,
    journey: null,
    ...overrides,
  } as unknown as WelcomeView;
}

const stage = (key: string, label: string, state: "done" | "now" | "later", target?: object) => ({
  key,
  label,
  state,
  blurb: "",
  ...(target ? { target } : {}),
});

const journey = (
  current: string,
  complete?: { original: string | null; current: string | null },
  getItWorking: string | null = null,
) => {
  const order = [
    "pre_kickoff",
    "kickoff",
    "get_it_working",
    "make_it_yours",
    "make_it_run",
    "complete",
  ];
  const at = order.indexOf(current);
  return {
    current: { key: current, label: "x" },
    headline: "",
    solutions: [],
    yours: [],
    stages: [
      stage("pre_kickoff", "Intake & Process", at > 0 ? "done" : at === 0 ? "now" : "later"),
      stage("kickoff", "Kickoff", at > 1 ? "done" : at === 1 ? "now" : "later"),
      stage("get_it_working", "Get It Working", at > 2 ? "done" : at === 2 ? "now" : "later", {
        originalDate: getItWorking,
        currentDate: getItWorking,
        actualDate: null,
      }),
      stage("make_it_yours", "Make It Yours", at > 3 ? "done" : at === 3 ? "now" : "later"),
      stage("make_it_run", "Make It Run", at > 4 ? "done" : at === 4 ? "now" : "later"),
      stage(
        "complete",
        "Graduate",
        at > 5 ? "done" : at === 5 ? "now" : "later",
        complete
          ? { originalDate: complete.original, currentDate: complete.current, actualDate: null }
          : undefined,
      ),
    ],
  } as never;
};

const call = (
  key: string,
  date: string,
  time: string | null,
  extra: Record<string, unknown> = {},
) => ({
  key,
  kind: "call",
  label: key === "kickoff" ? "Kickoff call" : `Session ${key}`,
  date,
  time,
  doneOn: null,
  detail: `Purpose of ${key}`,
  homework: [`Prepare for ${key}`],
  ...extra,
});

describe("dashboardHeader — progress comes from the stage state, never from days or percentages", () => {
  it("shows six segments with the states the journey holds, and the current stage by name", () => {
    const header = dashboardHeader(viewWith({ journey: journey("get_it_working") }));
    expect(header.started).toBe(true);
    expect(header.currentLabel).toBe("x");
    expect(header.stages.map((s) => s.state)).toEqual([
      "done",
      "done",
      "now",
      "later",
      "later",
      "later",
    ]);
    expect(header.stages.map((s) => s.label)).toEqual([
      "Intake & Process",
      "Kickoff",
      "Get It Working",
      "Make It Yours",
      "Make It Run",
      "Graduate",
    ]);
  });

  it("before the account is set up, there is no stage: every segment is upcoming and the page says it has not started", () => {
    const header = dashboardHeader(viewWith({ journey: null }));
    expect(header.started).toBe(false);
    expect(header.currentLabel).toBeNull();
    expect(header.stages.every((s) => s.state === "later")).toBe(true);
  });

  it("the next milestone is the earliest recorded step not done yet", () => {
    const header = dashboardHeader(
      viewWith({
        timeline: {
          ...viewWith().timeline,
          milestones: [
            {
              key: "live",
              kind: "milestone",
              label: "Functional",
              date: "2026-10-26",
              doneOn: null,
            },
            {
              key: "homework",
              kind: "homework",
              label: "Done step",
              date: "2026-10-10",
              doneOn: "2026-10-10",
            },
          ],
        } as never,
      }),
    );
    expect(header.nextMilestone).toEqual({
      label: "Functional",
      date: "2026-10-26",
      status: "planned",
    });
  });

  it("a call with no booked time is 'to be scheduled', never a confirmed date", () => {
    const header = dashboardHeader(
      viewWith({
        timeline: {
          ...viewWith().timeline,
          milestones: [call("adjust", "2026-10-20", null)],
        } as never,
      }),
    );
    expect(header.nextMilestone).toEqual({
      label: "Session adjust",
      date: null,
      status: "to_schedule",
    });
  });

  it("the Graduation target is the agreed Graduate date, with the first agreed date kept when it moved", () => {
    const header = dashboardHeader(
      viewWith({
        journey: journey("make_it_yours", { original: "2026-11-20", current: "2026-12-04" }),
      }),
    );
    expect(header.graduation).toEqual({
      current: "2026-12-04",
      original: "2026-11-20",
      moved: true,
    });
  });

  it("an unmoved Graduation target is not described as moved", () => {
    const header = dashboardHeader(
      viewWith({
        journey: journey("make_it_yours", { original: "2026-12-04", current: "2026-12-04" }),
      }),
    );
    expect(header.graduation.moved).toBe(false);
  });

  it("a missing Graduation target is reported as missing, not invented", () => {
    const header = dashboardHeader(viewWith({ journey: journey("make_it_yours") }));
    expect(header.graduation).toEqual({ current: null, original: null, moved: false });
  });
});

describe("attentionItems — customer-owned work from the records the customer's controls already write", () => {
  it("always lists the three homework ticks, with the plan's copy and the homework due date", () => {
    const items = attentionItems(
      viewWith({
        timeline: {
          ...viewWith().timeline,
          milestones: [
            {
              key: "kickoff",
              kind: "call",
              label: "Kickoff",
              date: "2026-10-05",
              time: "09:00",
              doneOn: "2026-10-05",
              homework: ["Run one job", "Send the list", "Add a user"],
            },
            {
              key: "homework",
              kind: "homework",
              label: "Homework",
              date: "2026-10-12",
              time: null,
              doneOn: null,
            },
          ],
        } as never,
        homeworkDone: { app: "2026-10-06T10:00:00Z" },
      }),
    );
    const homework = items.filter((i) => i.kind === "homework");
    expect(homework.map((h) => h.what)).toEqual(["Run one job", "Send the list", "Add a user"]);
    expect(homework.map((h) => h.done)).toEqual([true, false, false]);
    expect(homework.every((h) => h.due === "2026-10-12")).toBe(true);
  });

  it("homework falls back to the standard three when the plan has no copy for them", () => {
    expect(homeworkTexts(viewWith())).toEqual({
      app: "Download the GoCanvas app and log in",
      user: "Add one field user who will test on a real job",
      list: "Send us the customer or site list to load",
    });
  });

  it("solutions the customer tests are listed, carry the named owner, and can be confirmed when the record allows", () => {
    const items = attentionItems(
      viewWith({
        journey: {
          solutions: [
            {
              id: "s1",
              name: "Custom PDF",
              who: "you",
              status: "Your turn to test it",
              when: "2026-10-16",
              responsiblePerson: "Dana Ortiz",
              canConfirm: true,
            },
            {
              id: "s2",
              name: "Integration",
              who: "us",
              status: "Being built",
              when: "2026-10-20",
              responsiblePerson: null,
              canConfirm: false,
            },
          ],
          yours: [],
        } as never,
      }),
    );
    const solution = items.filter((i) => i.kind === "solution");
    expect(solution.map((s) => s.what)).toEqual(["Test Custom PDF on real work"]);
    expect(solution[0]).toMatchObject({
      owner: "Dana Ortiz",
      due: "2026-10-16",
      canConfirm: true,
      solutionId: "s1",
    });
  });

  it("changes are the customer's only when the customer owns them; shared and GoCanvas changes are not put on the customer's list", () => {
    const items = attentionItems(
      viewWith({
        parkingLot: [
          {
            request: "Mine",
            target: "2026-10-16",
            status: "open",
            neededForLaunch: true,
            owner: "customer",
          },
          { request: "Shared", target: "", status: "open", neededForLaunch: true, owner: "both" },
          {
            request: "Theirs",
            target: "",
            status: "open",
            neededForLaunch: true,
            owner: "gocanvas",
          },
          {
            request: "Done one",
            target: "",
            status: "done",
            neededForLaunch: true,
            owner: "customer",
          },
        ],
      }),
    );
    const changes = items.filter((i) => i.kind === "change");
    expect(changes.map((c) => c.what)).toEqual(["Mine"]);
  });

  it("a change target that is not a date is shown as written, never turned into a due date", () => {
    const items = attentionItems(
      viewWith({
        parkingLot: [
          {
            request: "Sign-off line",
            target: "Before the test",
            status: "open",
            neededForLaunch: false,
            owner: "customer",
          },
        ],
      }),
    );
    const change = items.find((i) => i.kind === "change")!;
    expect(change.due).toBeNull();
    expect(change.dueText).toBe("Before the test");
  });

  it("the field tester is shown as a responsibility, marked to confirm only when the reading proposed the name", () => {
    const items = attentionItems(
      viewWith({
        fieldTester: "Dana Ortiz",
        fieldTesterDue: "2026-11-02",
        fieldTesterSource: "ai",
      }),
    );
    const testing = items.find((i) => i.kind === "testing")!;
    expect(testing).toMatchObject({ owner: "Dana Ortiz", due: "2026-11-02", toConfirm: true });
  });

  it("dated items come first, earliest first", () => {
    const items = attentionItems(
      viewWith({
        parkingLot: [
          {
            request: "Later",
            target: "2026-12-01",
            status: "open",
            neededForLaunch: false,
            owner: "customer",
          },
          {
            request: "Sooner",
            target: "2026-10-16",
            status: "open",
            neededForLaunch: false,
            owner: "customer",
          },
        ],
      }),
    );
    const dated = items.filter((i) => i.due);
    expect(dated.map((i) => i.what)).toEqual(["Sooner", "Later"]);
  });
});

describe("gocanvasWork — GoCanvas's work, in customer words, with no internal notes or blockers", () => {
  it("lists GoCanvas solutions with the customer's status and the recorded date only", () => {
    const work = gocanvasWork(
      viewWith({
        journey: {
          solutions: [
            {
              id: "s2",
              name: "Integration",
              who: "us",
              status: "Being built",
              when: "2026-10-20",
              responsiblePerson: "Lee Build",
              note: "internal note",
              blocked: "internal",
            },
          ],
        } as never,
      }),
    );
    expect(work).toEqual([
      {
        id: "solution:s2",
        what: "Integration",
        status: "Being built",
        owner: "Lee Build",
        due: "2026-10-20",
        dueText: null,
        shared: false,
      },
    ]);
    expect(JSON.stringify(work)).not.toContain("internal");
  });

  it("includes GoCanvas-owned and shared changes, marking the shared ones, and not the customer's", () => {
    const work = gocanvasWork(
      viewWith({
        parkingLot: [
          {
            request: "Map the export",
            target: "",
            status: "scheduled",
            neededForLaunch: true,
            owner: "gocanvas",
          },
          {
            request: "Pick users",
            target: "",
            status: "open",
            neededForLaunch: true,
            owner: "both",
          },
          {
            request: "Customer only",
            target: "",
            status: "open",
            neededForLaunch: true,
            owner: "customer",
          },
        ],
      }),
    );
    expect(work.map((w) => [w.what, w.status, w.shared])).toEqual([
      ["Map the export", "Scheduled", false],
      ["Pick users", "Open", true],
    ]);
  });
});

describe("nextBookedSession — only a booked, unfinished session counts", () => {
  const milestones = [
    call("kickoff", "2026-10-05", "09:00", { doneOn: "2026-10-05" }),
    call("working", "2026-10-12", "14:00", { doneOn: "2026-10-12" }),
    call("unbooked", "2026-10-15", null),
    call("service", "2026-10-16", "10:00", { serviceId: "svc-1" }),
    call("adjust", "2026-10-20", "11:30"),
    call("later", "2026-11-02", "09:00"),
  ] as never;

  it("returns the earliest booked session that is not yet held, with its purpose and what to prepare", () => {
    expect(nextBookedSession(milestones, "2026-10-12")).toEqual({
      key: "adjust",
      label: "Session adjust",
      date: "2026-10-20",
      time: "11:30",
      purpose: "Purpose of adjust",
      prepare: ["Prepare for adjust"],
    });
  });

  it("an unbooked planned date is never returned as a meeting", () => {
    expect(
      nextBookedSession([call("unbooked", "2026-10-15", null)] as never, "2026-10-12"),
    ).toBeNull();
  });

  it("returns null when nothing is booked, so the page says it is to be scheduled", () => {
    expect(nextBookedSession([] as never, "2026-10-12")).toBeNull();
  });
});

describe("ideasForLater — the stored classification, never a guess at scope", () => {
  it("separates items needed for launch from other requests, and leaves finished items off", () => {
    const ideas = ideasForLater([
      {
        request: "Launch blocker",
        target: "",
        status: "open",
        neededForLaunch: true,
        owner: "customer",
      },
      {
        request: "Nice to have",
        target: "Later",
        status: "open",
        neededForLaunch: false,
        owner: "customer",
      },
      {
        request: "Already done",
        target: "",
        status: "done",
        neededForLaunch: false,
        owner: "customer",
      },
    ]);
    expect(ideas.map((i) => [i.what, i.category])).toEqual([
      ["Launch blocker", "needed_for_launch"],
      ["Nice to have", "other_request"],
    ]);
  });
});

describe("dashboardResources and tisContact — tracked links, and a contact only when the address is valid", () => {
  it("uses the tracked customer link for each help pick when there is one", () => {
    const resources = dashboardResources({
      goBase: "https://hub.example/go/token-1",
      helpPicks: [
        {
          article_id: "a1",
          title: "Start here",
          url: "https://help.example/a1",
          why: "For your first form",
          when: null,
        },
      ],
    } as never);
    expect(resources).toEqual([
      {
        id: "a1",
        title: "Start here",
        why: "For your first form",
        when: null,
        href: "https://hub.example/go/token-1/a1",
      },
    ]);
  });

  it("the contact email becomes a mailto link with a customer-specific subject", () => {
    const contact = tisContact(viewWith());
    expect(contact.name).toBe("Priya Lead");
    expect(contact.mailto).toBe(
      "mailto:priya@gocanvas.com?subject=Aquatic%20Facility%20Services%20implementation%3A%20a%20question",
    );
  });

  it("a missing or malformed address gives no link, so the page can say it is unavailable", () => {
    expect(tisContact(viewWith({ team: { leadEmail: null } })).mailto).toBeNull();
    expect(tisContact(viewWith({ team: { leadEmail: "not an address" } })).mailto).toBeNull();
    expect(tisContact(viewWith({ team: { leadEmail: "  " } })).email).toBeNull();
  });
});

describe("customerWelcomeView — the customer's copy carries no internal provenance or notes", () => {
  it("removes focus sources, quotes, fallback candidates, solution notes, blockers and who validated the workflow", () => {
    const internal = viewWith({
      implementationFocus: {
        items: [
          {
            id: "1",
            text: "Gong-only item",
            status: "proposed",
            sources: [{ type: "gong", label: "call", quote: "private words" }],
            reviewFlag: "gong_only",
          },
        ],
        validatedAt: null,
        validatedBy: null,
      },
      implementationFocusFallback: [
        {
          id: "2",
          text: "Fallback",
          status: "proposed",
          sources: [{ type: "sow", label: "SOW", quote: "contract words" }],
          reviewFlag: null,
        },
      ],
      workflowStory: {
        before: "a",
        during: "b",
        after: "c",
        validatedAt: "2026-10-07T12:00:00Z",
        validatedBy: "Internal Person",
      },
      journey: {
        current: { key: "kickoff", label: "Kickoff" },
        stages: [],
        headline: "",
        yours: [],
        solutions: [
          {
            id: "s1",
            name: "Integration",
            who: "us",
            status: "Being built",
            note: "internal note",
            blocked: "internal",
          },
        ],
      },
    });
    const customer = customerWelcomeView(internal);
    const text = JSON.stringify(customer);
    expect(customer.implementationFocus).toBeNull();
    expect(customer.implementationFocusFallback).toEqual([]);
    expect(customer.workflowStory?.validatedBy).toBeNull();
    expect(customer.journey?.solutions[0]).toMatchObject({
      note: null,
      blocked: null,
      name: "Integration",
    });
    expect(text).not.toContain("private words");
    expect(text).not.toContain("contract words");
    expect(text).not.toContain("Internal Person");
    expect(text).not.toContain("internal note");
  });

  it("keeps everything the customer's page needs: the journey, the intake answers and the changes", () => {
    const customer = customerWelcomeView(
      viewWith({
        parkingLot: [
          {
            request: "A change",
            target: "",
            status: "open",
            neededForLaunch: true,
            owner: "customer",
          },
        ],
        intake: { known: [{ key: "k", ask: "Q", value: "A", confirmed: true }], needed: [] },
      }),
    );
    expect(customer.parkingLot?.[0]?.request).toBe("A change");
    expect(customer.intake?.known[0]?.ask).toBe("Q");
  });
});

describe("dashboardHeader — the next milestone is the next one still ahead of today", () => {
  it("skips a step whose date has already passed when today is known", () => {
    const view = viewWith({
      timeline: {
        ...viewWith().timeline,
        milestones: [
          {
            key: "close",
            kind: "milestone",
            label: "Deal closes",
            date: "2026-10-01",
            doneOn: null,
          },
          { key: "live", kind: "milestone", label: "Functional", date: "2026-10-26", doneOn: null },
        ] as never,
      } as never,
    });
    expect(dashboardHeader(view, "2026-10-12").nextMilestone).toEqual({
      label: "Functional",
      date: "2026-10-26",
      status: "planned",
    });
    // With today unknown, the close is still history: the next step is Functional.
    expect(dashboardHeader(view, null).nextMilestone?.label).toBe("Functional");
  });
});

describe("nextBookedSession — a past meeting is never presented as upcoming", () => {
  const meeting = (key: string, date: string, extra: Record<string, unknown> = {}) =>
    ({
      key,
      kind: "call",
      label: `Session ${key}`,
      date,
      time: "10:00",
      doneOn: null,
      detail: "",
      homework: [],
      ...extra,
    }) as never;

  it("skips a booked meeting whose date has passed, even with no completion recorded", () => {
    expect(nextBookedSession([meeting("working", "2026-10-07")], "2026-10-13")).toBeNull();
  });

  it("takes a meeting dated today, and the earliest upcoming one after it", () => {
    const next = nextBookedSession(
      [
        meeting("late", "2026-10-30"),
        meeting("today", "2026-10-13"),
        meeting("past", "2026-10-07"),
      ],
      "2026-10-13",
    );
    expect(next?.key).toBe("today");
  });

  it("ignores an unbooked upcoming date, a completed meeting, and a service call", () => {
    expect(
      nextBookedSession([meeting("unbooked", "2026-10-20", { time: null })], "2026-10-13"),
    ).toBeNull();
    expect(
      nextBookedSession([meeting("done", "2026-10-20", { doneOn: "2026-10-19" })], "2026-10-13"),
    ).toBeNull();
    expect(
      nextBookedSession([meeting("svc", "2026-10-20", { serviceId: "svc-1" })], "2026-10-13"),
    ).toBeNull();
  });

  it("returns nothing while today is not yet known, rather than guessing", () => {
    expect(nextBookedSession([meeting("any", "2026-10-20")], null)).toBeNull();
  });

  it("leaves the historical meeting in the plan, unchanged", () => {
    const milestones = [meeting("working", "2026-10-07")];
    nextBookedSession(milestones, "2026-10-13");
    expect(milestones[0]).toMatchObject({ date: "2026-10-07", time: "10:00", doneOn: null });
  });
});

describe("progress and blockers — each recorded blocker is shown once", () => {
  const solution = (id: string, who: string, blocked: string | null, name = `Service ${id}`) => ({
    id,
    name,
    who,
    status: "Your turn to test it",
    when: "2026-10-20",
    responsiblePerson: null,
    canConfirm: true,
    note: null,
    blocked,
  });

  it("lists a service blocked on the customer under blockers, and not again under attention", () => {
    const view = viewWith({
      journey: { solutions: [solution("s1", "you", "customer")], yours: [] } as never,
    });
    expect(blockerItems(view).map((b) => b.what)).toEqual(["Service s1"]);
    expect(attentionItems(view).filter((i) => i.kind === "solution")).toEqual([]);
  });

  it("keeps an unblocked customer service under attention", () => {
    const view = viewWith({
      journey: { solutions: [solution("s2", "you", null)], yours: [] } as never,
    });
    expect(blockerItems(view)).toEqual([]);
    expect(
      attentionItems(view)
        .filter((i) => i.kind === "solution")
        .map((i) => i.solutionId),
    ).toEqual(["s2"]);
  });

  it("a blocker recorded on the GoCanvas side never appears, even if it reaches this view", () => {
    const view = viewWith({
      journey: { solutions: [solution("s3", "us", "internal")], yours: [] } as never,
    });
    expect(blockerItems(view)).toEqual([]);
  });
});

describe("the recorded tester responsibility is not merged with plan copy", () => {
  it("keeps the recorded tester's name and deadline on their own item, and never borrows the plan's date", () => {
    const view = viewWith({
      fieldTester: "Dana Ortiz",
      fieldTesterDue: "2026-10-30",
      fieldTesterSource: "person",
      timeline: {
        ...viewWith().timeline,
        milestones: [
          {
            key: "kickoff",
            kind: "call",
            label: "Kickoff",
            date: "2026-10-05",
            time: "09:00",
            doneOn: "2026-10-05",
            homework: ["Test the form on real jobs"],
          },
          {
            key: "homework",
            kind: "homework",
            label: "Homework",
            date: "2026-10-08",
            time: null,
            doneOn: null,
          },
        ],
      } as never,
    });
    const items = attentionItems(view);
    const testing = items.find((i) => i.kind === "testing")!;
    expect(testing).toMatchObject({ owner: "Dana Ortiz", due: "2026-10-30" });
    // The plan's copy stays a separate preparation item with the plan's date, not the tester's.
    const plan = items.find(
      (i) => i.kind === "homework" && i.what === "Test the form on real jobs",
    )!;
    expect(plan.due).toBe("2026-10-08");
    expect(
      items.filter((i) => i.what === "Test the form on real jobs" && i.kind === "testing"),
    ).toEqual([]);
  });
});

describe("dashboardHeader — sales milestones are never the next milestone", () => {
  const sales = {
    key: "close",
    kind: "milestone",
    label: "Deal closes",
    date: "2026-07-01",
    doneOn: null,
  };
  const stage = (currentDate: string | null, current = "make_it_run") =>
    ({
      stages: [
        {
          key: current,
          state: "now",
          label: "Make it run",
          target: { originalDate: currentDate, currentDate, actualDate: null },
        },
      ],
      current: {
        key: current,
        label: "Make it run",
        state: "now",
        target: { originalDate: currentDate, currentDate, actualDate: null },
      },
    }) as never;

  it("an unticked close from months ago is never shown as the next milestone", () => {
    const view = viewWith({
      journey: stage(null),
      timeline: { ...viewWith().timeline, milestones: [sales] } as never,
    });
    expect(dashboardHeader(view, "2026-10-13").nextMilestone).toBeNull();
  });

  it("with no unfinished implementation step, the current stage's recorded target is shown", () => {
    const view = viewWith({
      journey: stage("2026-11-02"),
      timeline: { ...viewWith().timeline, milestones: [sales] } as never,
    });
    expect(dashboardHeader(view, "2026-10-13").nextMilestone).toEqual({
      label: "Make it run target",
      date: "2026-11-02",
      status: "planned",
    });
  });

  it("an unfinished implementation step ahead of today wins over the stage target", () => {
    const view = viewWith({
      journey: stage("2026-11-02"),
      timeline: {
        ...viewWith().timeline,
        milestones: [
          sales,
          { key: "live", kind: "milestone", label: "Functional", date: "2026-10-26", doneOn: null },
        ],
      } as never,
    });
    expect(dashboardHeader(view, "2026-10-13").nextMilestone).toEqual({
      label: "Functional",
      date: "2026-10-26",
      status: "planned",
    });
  });

  it("nothing recorded at all is an honest empty state, never an invented date", () => {
    const view = viewWith({
      journey: null,
      timeline: { ...viewWith().timeline, milestones: [sales] } as never,
    });
    expect(dashboardHeader(view, "2026-10-13").nextMilestone).toBeNull();
  });
});
