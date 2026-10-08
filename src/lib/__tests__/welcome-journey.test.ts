import { describe, expect, it } from "vitest";

import { readIntake } from "../intake-answers";
import { timelineFor } from "../onboarding-plan";
import { shortDay } from "../onboarding-timeline";
import { byLabel, customerJourney, dueLabel, journeyOverviewItems } from "../welcome-journey";

/**
 * The customer's "where we are": the five stages from the deal's stage,
 * who has the ball on each solution, and the dated list that is theirs.
 */
const CLOSE = "2026-09-14";

function build(stage: string, over: Record<string, unknown> = {}, homework = {}) {
  const intake = readIntake({
    path: "new_logo",
    wanted_forms: [{ id: "f1", name: "Daily job report", template_id: null }],
    timeline: {
      overrides: { kickoff: "2026-09-17", working: "2026-09-22", adjust: "2026-09-30" },
      times: { kickoff: "10:00", working: "10:00", adjust: "10:00" },
      completed: {},
      services: [
        {
          id: "s1",
          kind: "integration",
          name: "QuickBooks Online",
          phase: 2,
          tier: 3,
          launch_critical: true,
          due: "2026-10-09",
        },
      ],
      ...over,
    },
  });
  return customerJourney({
    stage,
    intake,
    timeline: timelineFor(intake, CLOSE),
    homeworkDone: homework,
    parkingLot: [],
    leadName: "Dana",
  });
}

describe("the customer's journey", () => {
  it("is nothing before the close, and six stages with one 'now' after it", () => {
    expect(build("negotiate")).toBeNull();
    const j = build("make_it_yours")!;
    expect(j.stages.map((s) => s.state)).toEqual(["done", "done", "done", "now", "later", "later"]);
    expect(j.stages.map((s) => s.label)).toEqual([
      "Intake & Process",
      "Kickoff",
      "Get it working",
      "Make it yours",
      "Make it run",
      "Graduate",
    ]);
    expect(j.current.label).toBe("Make it yours");
    expect(j.headline).toMatch(/^You are in Make it yours/);
    // Closed Won is Intake & Process to the customer: the first stage is where they are.
    expect(build("closed_won")!.stages[0]!.state).toBe("now");
    // Kickoff is its own stage to the customer, as it is to the team.
    expect(build("kickoff")!.current.key).toBe("kickoff");
    expect(build("onboarding_complete")!.headline).toMatch(/complete/);
  });

  it("says who has the ball on each solution, in the customer's words", () => {
    const defining = build("get_it_working")!;
    expect(defining.solutions).toEqual([
      expect.objectContaining({
        name: "QuickBooks Online",
        kind: "Integration",
        who: "us",
        status: "Being defined with you",
        canConfirm: false,
      }),
    ]);
    const testing = build("make_it_yours", {
      completed: { "s1:kickoff": "2026-09-20", "s1:build": "2026-09-28" },
    })!;
    expect(testing.solutions[0]).toMatchObject({
      who: "you",
      status: "Your turn to test it",
      when: "2026-10-09",
      canConfirm: true,
    });
    // Once they said it works, the ball is back with us and the button is gone.
    const confirmed = build("make_it_yours", {
      completed: {
        "s1:kickoff": "2026-09-20",
        "s1:build": "2026-09-28",
        "s1:review": "2026-10-01",
      },
      services: [
        {
          id: "s1",
          kind: "integration",
          name: "QuickBooks Online",
          phase: 2,
          tier: 3,
          ball: { who: "us", person: null, date: null, note: "The customer said it works" },
        },
      ],
    })!;
    expect(confirmed.solutions[0]).toMatchObject({ who: "us", canConfirm: false });
    const done = build("make_it_run", {
      completed: {
        "s1:kickoff": "2026-09-20",
        "s1:build": "2026-09-28",
        "s1:review": "2026-10-01",
        "s1:live": "2026-10-02",
      },
    })!;
    expect(done.solutions[0]).toMatchObject({ who: "done", status: "Accepted — it works" });
  });

  it("lists what is theirs, dated first: the next meeting, the homework, their tests", () => {
    const j = build(
      "get_it_working",
      {
        completed: {
          kickoff: "2026-09-17",
          "s1:kickoff": "2026-09-20",
          "s1:build": "2026-09-28",
        },
      },
      { app: "2026-09-18T09:00:00Z" },
    )!;
    const whats = j.yours.map((y) => `${y.kind}:${y.what}`);
    expect(whats[0]).toMatch(/^meeting:/);
    expect(whats).toContain("homework:Add one field user who will test on a real job");
    expect(whats).toContain("homework:Send us the customer or site list to load");
    expect(whats).not.toContain("homework:Download the GoCanvas app and log in");
    expect(whats).toContain("solution:Test QuickBooks Online on real work");
    const dates = j.yours.map((y) => y.by);
    expect(dates.slice(0, -1).every((d, i) => d! <= dates[i + 1]!)).toBe(true);
    expect(j.headline).toMatch(/things are yours to do/);
  });

  it("gives the next meeting a date only once it is booked", () => {
    const booked = build("get_it_working")!;
    expect(booked.yours.find((y) => y.kind === "meeting")).toMatchObject({ by: "2026-09-17" });
    // The plan has a day for the kickoff but nobody has booked it: no date
    // for the customer — the page says "date to be set" instead.
    const planned = build("get_it_working", { times: {} })!;
    expect(planned.yours.find((y) => y.kind === "meeting")).toMatchObject({ by: null });
  });

  it("says when nothing is waiting on them, and who has the ball instead", () => {
    const j = build("make_it_run", {
      completed: {
        kickoff: "2026-09-17",
        working: "2026-09-22",
        adjust: "2026-09-30",
        "s1:kickoff": "2026-09-20",
        "s1:build": "2026-09-28",
        "s1:review": "2026-10-01",
        "s1:live": "2026-10-02",
      },
    })!;
    expect(j.yours).toEqual([]);
    expect(j.headline).toMatch(/Nothing is waiting on you right now — Dana has the ball/);
  });

  it("writes a date or a phrase after 'by'", () => {
    expect(byLabel("2026-10-09")).toMatch(/^by /);
    expect(byLabel("Week 4")).toBe("by Week 4");
    expect(byLabel(null)).toBe("");
  });
});

/**
 * The accountability fields (responsiblePerson, blocked, ballDate,
 * dueDate) are additive to SolutionBallView — they preserve explicit
 * source truth (service.ball, service.due) alongside the existing
 * who/when/status/note summary, which these tests never change.
 */
describe("the solution ball's accountability fields — explicit source truth only", () => {
  it("names the explicitly-recorded responsible person", () => {
    const j = build("get_it_working", {
      services: [
        {
          id: "s1",
          kind: "integration",
          name: "QuickBooks Online",
          phase: 2,
          tier: 3,
          ball: { who: "us", person: "Priya Nair", date: "2026-09-25", note: null },
        },
      ],
    })!;
    expect(j.solutions[0]).toMatchObject({
      responsiblePerson: "Priya Nair",
      ballDate: "2026-09-25",
    });
  });

  it("does not infer a responsible person from the project lead when none is explicitly recorded", () => {
    // No `ball` at all: solutionBall() computes a default that, for an
    // "us"-owned solution, stands in the project lead's name (Dana) for
    // the existing `who`/`status` summary — responsiblePerson must stay
    // null rather than silently adopting that stand-in.
    const j = build("get_it_working")!;
    expect(j.solutions[0]!.who).toBe("us"); // the computed default still applies here
    expect(j.solutions[0]!.responsiblePerson).toBeNull();
  });

  it("preserves blocked_customer and blocked_internal as distinct states, never collapsed", () => {
    const customerBlocked = build("get_it_working", {
      services: [
        {
          id: "s1",
          kind: "integration",
          name: "QuickBooks Online",
          phase: 2,
          tier: 3,
          ball: { who: "blocked_customer", person: null, date: null, note: "Waiting on API keys" },
        },
      ],
    })!;
    expect(customerBlocked.solutions[0]).toMatchObject({
      who: "you", // existing summary: unchanged, still collapses to "you"
      blocked: "customer", // new: the actual recorded state, preserved
    });

    const internalBlocked = build("get_it_working", {
      services: [
        {
          id: "s1",
          kind: "integration",
          name: "QuickBooks Online",
          phase: 2,
          tier: 3,
          ball: { who: "blocked_internal", person: "Priya Nair", date: null, note: null },
        },
      ],
    })!;
    expect(internalBlocked.solutions[0]).toMatchObject({
      who: "us", // existing summary: unchanged, still collapses to "us"
      blocked: "internal", // new: distinct from blocked_customer
    });
  });

  it("is null, not inferred, when no ball marks either side as blocked", () => {
    const j = build("get_it_working")!;
    expect(j.solutions[0]!.blocked).toBeNull();
  });

  it("keeps the ball's own date separate from the solution's due date, neither invented from the other", () => {
    const j = build("get_it_working", {
      services: [
        {
          id: "s1",
          kind: "integration",
          name: "QuickBooks Online",
          phase: 2,
          tier: 3,
          due: "2026-10-09",
          ball: { who: "us", person: null, date: "2026-09-20", note: null },
        },
      ],
    })!;
    expect(j.solutions[0]).toMatchObject({
      when: "2026-09-20", // existing field: ball.date wins over due, unchanged behavior
      ballDate: "2026-09-20",
      dueDate: "2026-10-09",
    });
    // The two new fields are never each other's fallback.
    expect(j.solutions[0]!.ballDate).not.toBe(j.solutions[0]!.dueDate);
  });

  it("is null for both ball-sourced fields when no ball was ever recorded, even though `when` still falls back to the due date", () => {
    const j = build("get_it_working")!; // default fixture: due "2026-10-09", no ball
    expect(j.solutions[0]).toMatchObject({
      when: "2026-10-09", // existing behavior: falls back to the due date, unchanged
      ballDate: null, // new: no ball was ever explicitly recorded
      dueDate: "2026-10-09",
    });
  });

  it("does not turn a missing ball date into a 'waiting since' value or the due date into a stage deadline", () => {
    const j = build("get_it_working", {
      services: [{ id: "s1", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 }],
    })!;
    // No due, no ball at all.
    expect(j.solutions[0]).toMatchObject({ ballDate: null, dueDate: null, when: null });
  });

  it("still carries the accountability fields once a solution is completed, from whatever ball was last recorded", () => {
    const done = build("make_it_run", {
      completed: {
        "s1:kickoff": "2026-09-20",
        "s1:build": "2026-09-28",
        "s1:review": "2026-10-01",
        "s1:live": "2026-10-02",
      },
      services: [
        {
          id: "s1",
          kind: "integration",
          name: "QuickBooks Online",
          phase: 2,
          tier: 3,
          ball: { who: "us", person: "Priya Nair", date: "2026-10-01", note: "Confirmed live" },
        },
      ],
    })!;
    expect(done.solutions[0]).toMatchObject({
      who: "done", // existing summary: unchanged
      responsiblePerson: "Priya Nair",
      ballDate: "2026-10-01",
    });
  });

  it("is backward compatible — every existing field keeps its old value and shape alongside the new ones", () => {
    const j = build("get_it_working")!;
    expect(j.solutions[0]).toMatchObject({
      id: "s1",
      name: "QuickBooks Online",
      kind: "Integration",
      who: "us",
      status: "Being defined with you",
      when: "2026-10-09",
      canConfirm: false,
      note: null,
    });
    // And the new fields are present (not undefined) on the same object.
    const keys = Object.keys(j.solutions[0]!);
    for (const k of ["responsiblePerson", "blocked", "ballDate", "dueDate"]) {
      expect(keys).toContain(k);
    }
  });
});

/**
 * journeyOverviewItems() shapes the active solutions for the compact
 * "status at a glance" band at the top of the Plan. It never collapses
 * several active items into one implied owner, never infers a missing
 * date or person, keeps a ball's own date and a solution's due date as
 * distinct fields (never merged), and leaves finished solutions out
 * entirely.
 */
describe("journeyOverviewItems — the top-of-plan status overview", () => {
  it("lists each active solution separately, with its own side, person, ball date and due date — never one global owner", () => {
    const j = build("get_it_working", {
      services: [
        {
          id: "s1",
          kind: "integration",
          name: "QuickBooks Online",
          phase: 2,
          tier: 3,
          due: "2026-10-09",
          ball: { who: "us", person: "Priya Nair", date: "2026-09-25", note: null },
        },
        {
          id: "s2",
          kind: "custom_pdf",
          name: "Daily job report PDF",
          phase: 2,
          tier: 1,
          due: "2026-10-01",
          ball: { who: "customer", person: null, date: null, note: null },
        },
      ],
    })!;
    const items = journeyOverviewItems(j.solutions);
    expect(items).toEqual([
      expect.objectContaining({
        id: "s1",
        side: "gocanvas",
        person: "Priya Nair",
        blocked: null,
        ballDate: "2026-09-25",
        dueDate: "2026-10-09",
      }),
      expect.objectContaining({
        id: "s2",
        side: "customer",
        person: null,
        blocked: null,
        ballDate: null,
        dueDate: "2026-10-01",
      }),
    ]);
    // The two are never the same value standing in for each other.
    expect(items[0]!.ballDate).not.toBe(items[0]!.dueDate);
  });

  it("marks explicitly blocked solutions distinctly from ordinary in-progress work, naming which side", () => {
    const j = build("get_it_working", {
      services: [
        {
          id: "s1",
          kind: "integration",
          name: "QuickBooks Online",
          phase: 2,
          tier: 3,
          ball: { who: "blocked_customer", person: null, date: null, note: "Waiting on API keys" },
        },
        {
          id: "s2",
          kind: "custom_pdf",
          name: "Daily job report PDF",
          phase: 2,
          tier: 1,
          ball: { who: "blocked_internal", person: "Priya Nair", date: null, note: null },
        },
      ],
    })!;
    const items = journeyOverviewItems(j.solutions);
    expect(items[0]).toMatchObject({ id: "s1", blocked: "customer" });
    expect(items[1]).toMatchObject({ id: "s2", blocked: "internal" });
  });

  it("labels the responsible side when no person is named, never inventing one", () => {
    const j = build("get_it_working")!; // default fixture: no ball recorded
    const items = journeyOverviewItems(j.solutions);
    expect(items).toEqual([
      expect.objectContaining({ side: "gocanvas", person: null, blocked: null }),
    ]);
  });

  it("carries a missing ball date and a missing due date as null, never inferring one from the generated timeline", () => {
    const j = build("get_it_working", {
      services: [{ id: "s1", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 }],
    })!; // no due, no ball at all
    expect(journeyOverviewItems(j.solutions)).toEqual([
      expect.objectContaining({ ballDate: null, dueDate: null }),
    ]);
  });

  it("keeps a recorded ball date distinct from a missing due date — a ball date is never shown as a due date", () => {
    const j = build("get_it_working", {
      services: [
        {
          id: "s1",
          kind: "integration",
          name: "QuickBooks Online",
          phase: 2,
          tier: 3,
          // No `due` at all: only the ball carries a date.
          ball: { who: "us", person: null, date: "2026-09-20", note: null },
        },
      ],
    })!;
    expect(journeyOverviewItems(j.solutions)).toEqual([
      expect.objectContaining({ ballDate: "2026-09-20", dueDate: null }),
    ]);
  });

  it("leaves out finished solutions, so a completed item never shows as still active", () => {
    const j = build("make_it_run", {
      completed: {
        "s1:kickoff": "2026-09-20",
        "s1:build": "2026-09-28",
        "s1:review": "2026-10-01",
        "s1:live": "2026-10-02",
      },
    })!;
    expect(j.solutions[0]!.who).toBe("done"); // sanity: the source solution is finished
    expect(journeyOverviewItems(j.solutions)).toEqual([]);
  });

  it("is empty, not fabricated, when there are no solutions at all", () => {
    expect(journeyOverviewItems([])).toEqual([]);
  });
});

/**
 * dueLabel() is the only place a solution's own due date is ever worded as
 * a due date — it never takes a ball date, and never fabricates one when
 * none was recorded.
 */
describe("dueLabel — wording a due date, and only a due date", () => {
  it("writes an ISO due date as 'Due <short day>'", () => {
    expect(dueLabel("2026-10-09")).toBe(`Due ${shortDay("2026-10-09")}`);
  });

  it("writes a non-ISO due phrase as 'Due <phrase>'", () => {
    expect(dueLabel("Week 4")).toBe("Due Week 4");
  });

  it("says the due date is not set, rather than fabricating one, when none was recorded", () => {
    expect(dueLabel(null)).toBe("Due date not set");
  });
});
