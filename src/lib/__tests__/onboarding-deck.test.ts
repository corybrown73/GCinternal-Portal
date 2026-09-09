import { describe, expect, it } from "vitest";

import { buildTimeline } from "../onboarding-timeline";
import { buildOnboardingDeckFile } from "../server/brief/onboarding-deck";

/**
 * The deck renders six slides for either variant and never throws on the
 * sparse case — a deal with no intake, no form chosen, no tester named.
 * What the slides look like is checked by eye (scripts/onboarding-deck-qa.ts).
 */

function slideCount(buf: Buffer): number {
  const names = new Set(buf.toString("latin1").match(/ppt\/slides\/slide\d+\.xml/g) ?? []);
  return names.size;
}

describe("the onboarding deck", () => {
  it("renders six slides with the next use cases when there is no integration", async () => {
    const buf = await buildOnboardingDeckFile({
      clientName: "Maverick Well Pluggers",
      industry: "Oil & Gas",
      timeline: buildTimeline({ closeDate: "2026-09-09" }),
      lead: "Priya Nair",
      fieldTester: "Dale",
      firstForm: {
        name: "Daily Water Haul Ticket",
        objective: "The ticket that becomes the invoice.",
        source: "library",
      },
      nextUseCases: [{ name: "Well Site Inspection", objective: null }],
    });
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    expect(slideCount(buf)).toBe(6);
  }, 30_000);

  it("renders six slides with the tier strip when there is one, and survives an empty intake", async () => {
    const buf = await buildOnboardingDeckFile({
      clientName: "Somebody",
      industry: null,
      timeline: buildTimeline({
        closeDate: "2026-09-09",
        integrationTier: 3,
        integrationTarget: "QuickBooks Online",
      }),
      lead: null,
      fieldTester: null,
      firstForm: null,
      nextUseCases: [],
    });
    expect(slideCount(buf)).toBe(6);
    expect(buf.toString("latin1")).toContain("QuickBooks Online");
  }, 30_000);
});
