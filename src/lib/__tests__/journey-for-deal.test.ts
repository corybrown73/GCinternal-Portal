import { describe, expect, it } from "vitest";

import { journeyBandForDeal, journeyTargetForDeal } from "../journey-for-deal";

/**
 * The deal stage is the source of truth: the journey is clamped into the
 * band each deal stage allows, and moves on its own inside it.
 */
const FULL = [
  "handoff",
  "plan-internal",
  "align-external",
  "build",
  "validate-iterate",
  "launch",
  "adopt",
  "graduate-to-cs",
];
const LIVE = FULL.filter((s) => s !== "align-external" && s !== "adopt");

describe("the journey follows the deal", () => {
  it("pulls a journey stuck at handoff up when the deal reaches Get it working", () => {
    expect(journeyTargetForDeal("get_it_working", "handoff", FULL)).toBe("plan-internal");
    expect(journeyTargetForDeal("get_it_working", "handoff", LIVE)).toBe("plan-internal");
    // Make it yours starts at Build; Make it run at Pilot.
    expect(journeyTargetForDeal("make_it_yours", "plan-internal", LIVE)).toBe("build");
    expect(journeyTargetForDeal("make_it_run", "build", LIVE)).toBe("validate-iterate");
  });

  it("leaves a journey alone inside the band", () => {
    expect(journeyTargetForDeal("get_it_working", "build", FULL)).toBeNull();
    expect(journeyTargetForDeal("make_it_yours", "validate-iterate", LIVE)).toBeNull();
    expect(journeyTargetForDeal("make_it_run", "launch", LIVE)).toBeNull();
    expect(journeyTargetForDeal("onboarding_kickoff", "handoff", LIVE)).toBeNull();
  });

  it("takes the journey to Complete when the deal is complete, and back out when it is reopened", () => {
    expect(journeyTargetForDeal("onboarding_complete", "handoff", LIVE)).toBe("graduate-to-cs");
    expect(journeyTargetForDeal("onboarding_complete", "build", FULL)).toBe("graduate-to-cs");
    // Reopened: the journey cannot stay at Complete. With Adopt hidden the
    // ceiling for Onboarding is Launch.
    expect(journeyTargetForDeal("make_it_run", "graduate-to-cs", LIVE)).toBe("launch");
    expect(journeyTargetForDeal("make_it_run", "graduate-to-cs", FULL)).toBe("adopt");
    // Back to Make it yours: Pilot at most.
    expect(journeyTargetForDeal("make_it_yours", "launch", LIVE)).toBe("validate-iterate");
  });

  it("holds the journey at Pre-kickoff until the deal is in Onboarding", () => {
    expect(journeyTargetForDeal("onboarding_kickoff", "build", LIVE)).toBe("handoff");
    expect(journeyTargetForDeal("closed_won", "plan-internal", LIVE)).toBe("handoff");
  });

  it("does nothing for a prospect, and pulls an unknown stage to the floor", () => {
    expect(journeyTargetForDeal("prospect", "handoff", LIVE)).toBeNull();
    expect(journeyTargetForDeal("get_it_working", "mystery", LIVE)).toBe("plan-internal");
  });

  it("names the band", () => {
    expect(journeyBandForDeal("get_it_working", LIVE)).toEqual({
      floor: "plan-internal",
      ceiling: "build",
    });
    expect(journeyBandForDeal("make_it_run", LIVE)).toEqual({
      floor: "validate-iterate",
      ceiling: "launch",
    });
    expect(journeyBandForDeal("prospect", LIVE)).toBeNull();
  });
});
