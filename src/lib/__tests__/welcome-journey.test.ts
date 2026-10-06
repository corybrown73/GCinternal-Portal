import { describe, expect, it } from "vitest";

import { readIntake } from "../intake-answers";
import { timelineFor } from "../onboarding-plan";
import { byLabel, customerJourney } from "../welcome-journey";

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
