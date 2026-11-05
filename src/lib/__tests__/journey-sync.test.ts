import { describe, expect, it } from "vitest";

import {
  automaticNextStep,
  kickoffBooked,
  stepsToward,
  targetJourneyStage,
  type JourneySignals,
} from "../journey-sync";

const none: JourneySignals = {
  kickoffScheduled: false,
  kickoffHeld: false,
  workingDone: false,
  formLive: false,
};
const LIVE = [
  "handoff",
  "plan-internal",
  "align-external",
  "build",
  "validate-iterate",
  "launch",
  "graduate-to-cs",
];

describe("the journey follows the plan", () => {
  it("reads the stage from what has happened, the latest fact winning", () => {
    expect(targetJourneyStage(none)).toBe("handoff");
    expect(targetJourneyStage({ ...none, kickoffHeld: true })).toBe("build");
    expect(targetJourneyStage({ ...none, kickoffHeld: true, workingDone: true })).toBe(
      "validate-iterate",
    );
    expect(targetJourneyStage({ ...none, formLive: true })).toBe("launch");
  });

  it("has no signal for an AI brief: a brief moves no stage", () => {
    expect(Object.keys(none).sort()).toEqual(
      ["formLive", "kickoffHeld", "kickoffScheduled", "workingDone"].sort(),
    );
    expect(targetJourneyStage(none)).toBe("handoff");
  });

  it("steps forward through the live order, never back, and never to handover", () => {
    const order = [
      "handoff",
      "plan-internal",
      "build",
      "validate-iterate",
      "launch",
      "graduate-to-cs",
    ];
    expect(stepsToward("handoff", "build", order)).toEqual(["plan-internal", "build"]);
    expect(stepsToward("build", "build", order)).toEqual([]);
    expect(stepsToward("launch", "plan-internal", order)).toEqual([]);
    expect(stepsToward("graduate-to-cs", "launch", order)).toEqual([]);
    const withExtra = ["handoff", "plan-internal", "align-external", "build"];
    expect(stepsToward("plan-internal", "build", withExtra)).toEqual(["align-external", "build"]);
  });
});

describe("kickoff facts are separate", () => {
  it("a booked kickoff is not a held kickoff", () => {
    const booked = { ...none, kickoffScheduled: true };
    expect(booked.kickoffHeld).toBe(false);
    expect(targetJourneyStage(booked)).toBe("plan-internal");
    expect(targetJourneyStage(booked)).not.toBe("build");
  });

  it("a booking needs both a date and a time on the plan", () => {
    expect(
      kickoffBooked({ overrides: { kickoff: "2026-11-10" }, times: { kickoff: "10:00" } }),
    ).toBe(true);
    expect(kickoffBooked({ overrides: { kickoff: "2026-11-10" }, times: {} })).toBe(false);
    expect(kickoffBooked({ overrides: {}, times: { kickoff: "10:00" } })).toBe(false);
    expect(kickoffBooked({})).toBe(false);
  });

  it("a held kickoff moves one stage at most, never a cascade", () => {
    expect(automaticNextStep({ ...none, kickoffHeld: true }, "handoff", LIVE)).toEqual({
      to: "plan-internal",
      target: "build",
    });
    expect(automaticNextStep({ ...none, kickoffHeld: true }, "plan-internal", LIVE)).toEqual({
      to: "align-external",
      target: "build",
    });
  });

  it("a stage already at or past the target has no automatic step", () => {
    expect(automaticNextStep({ ...none, kickoffHeld: true }, "build", LIVE)).toBeNull();
    expect(automaticNextStep({ ...none, kickoffHeld: true }, "launch", LIVE)).toBeNull();
    expect(automaticNextStep(none, "handoff", LIVE)).toBeNull();
  });
});
