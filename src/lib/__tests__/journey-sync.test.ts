import { describe, expect, it } from "vitest";

import { stepsToward, targetJourneyStage } from "../journey-sync";

const none = { briefGenerated: false, kickoffDone: false, workingDone: false, formLive: false };

describe("the journey follows the plan", () => {
  it("reads the stage from what has happened, the latest fact winning", () => {
    expect(targetJourneyStage(none)).toBe("handoff");
    expect(targetJourneyStage({ ...none, briefGenerated: true })).toBe("plan-internal");
    expect(targetJourneyStage({ ...none, briefGenerated: true, kickoffDone: true })).toBe("build");
    expect(targetJourneyStage({ ...none, kickoffDone: true, workingDone: true })).toBe(
      "validate-iterate",
    );
    expect(targetJourneyStage({ ...none, formLive: true })).toBe("launch");
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
    // A stage the rule does not name but the configuration shows is walked through.
    const withExtra = ["handoff", "plan-internal", "align-external", "build"];
    expect(stepsToward("plan-internal", "build", withExtra)).toEqual(["align-external", "build"]);
  });
});
