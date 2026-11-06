import { describe, expect, it } from "vitest";

import { recordedTierNumber } from "../complexity-tiers";
import { readIntake } from "../intake-answers";

const intakeWith = (timeline: Record<string, unknown>) =>
  readIntake({ timeline: { services: [], holidays: [], ...timeline } });

describe("the tier an implementation is recorded as", () => {
  it("nothing recorded is unclassified, not Tier 1", () => {
    expect(recordedTierNumber(intakeWith({}))).toBeNull();
  });

  it("Tier 0 (no integration) is unclassified", () => {
    expect(recordedTierNumber(intakeWith({ integration_tier: 0 }))).toBeNull();
  });

  it("Tiers 1 to 5 are recorded as themselves", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(recordedTierNumber(intakeWith({ integration_tier: n }))).toBe(n);
    }
  });

  it("the tier of an integration service counts when the plan does not record one", () => {
    const intake = intakeWith({
      services: [{ id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 }],
    });
    expect(recordedTierNumber(intake)).toBe(3);
  });

  it("the highest recorded valid tier is the implementation's tier", () => {
    const intake = intakeWith({
      integration_tier: 0,
      services: [
        { id: "a", kind: "integration", name: "A", phase: 2, tier: 2 },
        { id: "b", kind: "integration", name: "B", phase: 3, tier: 4 },
      ],
    });
    expect(recordedTierNumber(intake)).toBe(4);
  });

  it("an out-of-range recorded tier makes the implementation unclassified, not the nearest tier", () => {
    expect(recordedTierNumber(intakeWith({ integration_tier: 9 }))).toBeNull();
  });

  it("a non-integration service is never read as a tier", () => {
    const intake = intakeWith({
      services: [{ id: "f", kind: "paid_form", name: "Form build", phase: 1, tier: 3 }],
    });
    expect(recordedTierNumber(intake)).toBeNull();
  });
});
