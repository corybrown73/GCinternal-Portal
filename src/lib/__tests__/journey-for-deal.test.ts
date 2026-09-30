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
  it("pulls a journey stuck at handoff up when the deal reaches Onboarding", () => {
    expect(journeyTargetForDeal("in_onboarding", "handoff", FULL)).toBe("plan-internal");
    expect(journeyTargetForDeal("in_onboarding", "handoff", LIVE)).toBe("plan-internal");
  });

  it("leaves a journey alone inside the band", () => {
    expect(journeyTargetForDeal("in_onboarding", "build", FULL)).toBeNull();
    expect(journeyTargetForDeal("in_onboarding", "validate-iterate", LIVE)).toBeNull();
    expect(journeyTargetForDeal("onboarding_kickoff", "handoff", LIVE)).toBeNull();
  });

  it("takes the journey to Complete when the deal is complete, and back out when it is reopened", () => {
    expect(journeyTargetForDeal("onboarding_complete", "handoff", LIVE)).toBe("graduate-to-cs");
    expect(journeyTargetForDeal("onboarding_complete", "build", FULL)).toBe("graduate-to-cs");
    // Reopened: the journey cannot stay at Complete. With Adopt hidden the
    // ceiling for Onboarding is Launch.
    expect(journeyTargetForDeal("in_onboarding", "graduate-to-cs", LIVE)).toBe("launch");
    expect(journeyTargetForDeal("in_onboarding", "graduate-to-cs", FULL)).toBe("adopt");
  });

  it("holds the journey at Pre-kickoff until the deal is in Onboarding", () => {
    expect(journeyTargetForDeal("onboarding_kickoff", "build", LIVE)).toBe("handoff");
    expect(journeyTargetForDeal("closed_won", "plan-internal", LIVE)).toBe("handoff");
  });

  it("does nothing for a prospect, and pulls an unknown stage to the floor", () => {
    expect(journeyTargetForDeal("prospect", "handoff", LIVE)).toBeNull();
    expect(journeyTargetForDeal("in_onboarding", "mystery", LIVE)).toBe("plan-internal");
  });

  it("names the band", () => {
    expect(journeyBandForDeal("in_onboarding", LIVE)).toEqual({
      floor: "plan-internal",
      ceiling: "launch",
    });
    expect(journeyBandForDeal("prospect", LIVE)).toBeNull();
  });
});
