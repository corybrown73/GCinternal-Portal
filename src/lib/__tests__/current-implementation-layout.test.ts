import { describe, expect, it } from "vitest";

import { currentImplementationLayout } from "@/lib/current-implementation-layout";

/**
 * Which parts of Current Implementation a deal shows. A partner implementation
 * must never show the standard plan's meeting, plan-date control, tier date or
 * the standard journey strip, whatever stage it is on. A standard implementation
 * keeps all of them. These are the rules the tab reads; the tab does not decide
 * them inline.
 */

const STANDARD_JOURNEY = [
  "pre_kickoff",
  "kickoff",
  "get_it_working",
  "make_it_yours",
  "make_it_run",
];

describe("currentImplementationLayout — partner implementations", () => {
  it.each([null, "prospect", "onboarding_kickoff", "get_it_working", "graduate"])(
    "suppresses every standard-only part on stage %s",
    (stage) => {
      expect(currentImplementationLayout({ partner: true, currentStage: stage })).toEqual({
        leftBranch: "partner",
        journeyStrip: false,
        nextLine: "milestone",
        showTierExpected: false,
        showPlanDates: false,
        parkingAccess: false,
      });
    },
  );

  it("never offers the standard meeting line, even mid-journey", () => {
    const layout = currentImplementationLayout({ partner: true, currentStage: "kickoff" });
    expect(layout.nextLine).toBe("milestone");
    expect(layout.showPlanDates).toBe(false);
  });
});

describe("currentImplementationLayout — standard implementations", () => {
  it.each(STANDARD_JOURNEY)("shows the full canonical workspace on %s", (stage) => {
    expect(currentImplementationLayout({ partner: false, currentStage: stage })).toEqual({
      leftBranch: "canonical",
      journeyStrip: true,
      nextLine: "meeting",
      showTierExpected: true,
      showPlanDates: true,
      parkingAccess: true,
    });
  });

  it("opens the parking lot on the canonical journey only after the journey starts", () => {
    for (const stage of [null, "prospect", "negotiate"]) {
      expect(
        currentImplementationLayout({ partner: false, currentStage: stage }).parkingAccess,
      ).toBe(false);
    }
  });

  it("keeps the journey strip and parking lot for a stage with no special branch", () => {
    const layout = currentImplementationLayout({ partner: false, currentStage: "kickoff" });
    expect(layout.journeyStrip).toBe(true);
    expect(layout.parkingAccess).toBe(true);
  });

  it("gives Closed Won its own branch, with no strip and no parking lot here", () => {
    expect(currentImplementationLayout({ partner: false, currentStage: "closed_won" })).toEqual({
      leftBranch: "closed_won",
      journeyStrip: false,
      nextLine: "meeting",
      showTierExpected: true,
      showPlanDates: true,
      parkingAccess: false,
    });
  });

  it("gives Field Fusion its own branch, with no strip and no parking lot here", () => {
    expect(currentImplementationLayout({ partner: false, currentStage: "field_fusion" })).toEqual({
      leftBranch: "field_fusion",
      journeyStrip: false,
      nextLine: "meeting",
      showTierExpected: true,
      showPlanDates: true,
      parkingAccess: false,
    });
  });
});
