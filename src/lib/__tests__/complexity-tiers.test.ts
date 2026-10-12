import { describe, expect, it } from "vitest";

import {
  DEFAULT_COMPLEXITY_TIERS,
  expectedGoLive,
  parseComplexityTiers,
  reasonLabel,
  targetOverrideHolds,
  tierForIntake,
} from "../complexity-tiers";
import { readIntake } from "../intake-answers";

/**
 * The complexity tiers: placeholders from the integration tiers until the
 * matrix is pasted in, read defensively, and the expected Go-Live counted
 * in business days from the close.
 */
describe("complexity tiers", () => {
  it("seeds a placeholder per integration tier: 15 business days plus five a week", () => {
    expect(DEFAULT_COMPLEXITY_TIERS.map((t) => [t.tier, t.business_days])).toEqual([
      [0, 15],
      [1, 15],
      [2, 25],
      [3, 30],
      [4, 35],
      [5, 45],
    ]);
  });

  it("reads the stored config and drops what is not a tier", () => {
    const tiers = parseComplexityTiers({
      tiers: [
        { tier: 2, name: " Intermediate ", business_days: 20.4, qualifies: "x" },
        { tier: "nope", name: "Bad", business_days: 1 },
        { tier: 1, name: "", business_days: 10 },
        { tier: 2, name: "Duplicate", business_days: 99 },
        { tier: 3, name: "Advanced", business_days: -4 },
      ],
    });
    expect(tiers).toEqual([
      { tier: 1, name: "Tier 1", business_days: 10, qualifies: "" },
      { tier: 2, name: "Intermediate", business_days: 20, qualifies: "x" },
    ]);
    // Nothing usable: the placeholders, never an empty list.
    expect(parseComplexityTiers(null)).toEqual(DEFAULT_COMPLEXITY_TIERS);
    expect(parseComplexityTiers({ tiers: [{ tier: -1 }] })).toEqual(DEFAULT_COMPLEXITY_TIERS);
  });

  it("tiers a deal by its highest integration, falling to the nearest lower tier", () => {
    const plain = readIntake({});
    expect(tierForIntake(plain)?.tier).toBe(0);
    const bought = readIntake({
      timeline: {
        integration_tier: 1,
        services: [{ id: "s1", kind: "integration", name: "QuickBooks", phase: 2, tier: 3 }],
      },
    });
    expect(tierForIntake(bought)?.tier).toBe(3);
    // The config has no tier 3: the deal is tiered at 2, not left without one.
    const two = [
      { tier: 0, name: "None", business_days: 15, qualifies: "" },
      { tier: 2, name: "Mid", business_days: 25, qualifies: "" },
      { tier: 5, name: "Big", business_days: 45, qualifies: "" },
    ];
    expect(tierForIntake(bought, two)?.tier).toBe(2);
    expect(tierForIntake(plain, [])).toBeNull();
  });

  it("counts the expected Go-Live in business days from the close", () => {
    // Thu Oct 1 + 15 business days = Thu Oct 22.
    expect(expectedGoLive("2026-10-01", DEFAULT_COMPLEXITY_TIERS[1]!)).toBe("2026-10-22");
    expect(expectedGoLive("2026-10-01", DEFAULT_COMPLEXITY_TIERS[0]!)).toBe("2026-10-22");
  });

  it("names the reason a target moved, and says when none was given", () => {
    expect(reasonLabel("customer")).toMatch(/^Customer/);
    expect(reasonLabel(null)).toBe("Reason not given yet");
    expect(reasonLabel("made_up")).toBe("Reason not given yet");
  });

  describe("targetOverrideHolds", () => {
    it("holds for a target set and explained in the same action", () => {
      const at = "2026-10-08T10:00:00.000Z";
      expect(
        targetOverrideHolds("2026-11-01", {
          to_date: "2026-11-01",
          reason_code: "customer",
          changed_at: at,
          explained_at: at,
        }),
      ).toBe(true);
    });

    it("does not hold for an automatic plan shift explained later", () => {
      expect(
        targetOverrideHolds("2026-11-01", {
          to_date: "2026-11-01",
          reason_code: "customer",
          changed_at: "2026-10-01T10:00:00.000Z",
          explained_at: "2026-10-05T09:00:00.000Z",
        }),
      ).toBe(false);
    });

    it("does not hold for an unexplained automatic shift", () => {
      expect(
        targetOverrideHolds("2026-11-01", {
          to_date: "2026-11-01",
          reason_code: null,
          changed_at: "2026-10-01T10:00:00.000Z",
          explained_at: null,
        }),
      ).toBe(false);
    });

    it("does not hold once the target has moved past the explained row", () => {
      const at = "2026-10-08T10:00:00.000Z";
      expect(
        targetOverrideHolds("2026-11-15", {
          to_date: "2026-11-01",
          reason_code: "customer",
          changed_at: at,
          explained_at: at,
        }),
      ).toBe(false);
    });

    it("does not hold with no change on record", () => {
      expect(targetOverrideHolds("2026-11-01", null)).toBe(false);
      expect(targetOverrideHolds("2026-11-01", undefined)).toBe(false);
    });
  });
});
