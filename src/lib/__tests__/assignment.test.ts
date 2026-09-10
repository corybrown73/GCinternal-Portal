import { describe, expect, it } from "vitest";

import {
  DEFAULT_ASSIGNMENT_RULES,
  dealWeight,
  describeBreakdown,
  integrationTierFrom,
  normalizeRules,
  pickAssignee,
  rankPool,
} from "../assignment";

const R = DEFAULT_ASSIGNMENT_RULES;

describe("dealWeight", () => {
  it("weighs a small self-serve deal as the base", () => {
    expect(dealWeight({ arr: 8_000, seats: 5, integrationTier: 0 }, R).weight).toBe(1);
  });
  it("adds seats, ARR and the integration tier by band", () => {
    const { weight, breakdown } = dealWeight({ arr: 90_000, seats: 120, integrationTier: 3 }, R);
    expect(breakdown).toEqual({ base: 1, arr: 2, seats: 2, integration: 2 });
    expect(weight).toBe(7);
    expect(describeBreakdown(breakdown)).toBe("1 base · 2 ARR · 2 seats · 2 integration");
  });
  it("treats unknowns as nothing extra", () => {
    expect(dealWeight({ arr: null, seats: null, integrationTier: null }, R).weight).toBe(1);
  });
});

describe("pickAssignee", () => {
  const pool = [
    {
      teamMemberId: "a",
      name: "Ana",
      capacity: 1,
      load: 3,
      lastAssignedAt: "2026-09-01T00:00:00Z",
    },
    {
      teamMemberId: "b",
      name: "Ben",
      capacity: 1,
      load: 1,
      lastAssignedAt: "2026-09-05T00:00:00Z",
    },
    { teamMemberId: "c", name: "Cy", capacity: 1, load: 1, lastAssignedAt: null },
  ];
  it("gives the next account to whoever carries the least, and among equals to whoever waited longest", () => {
    expect(pickAssignee(pool)!.teamMemberId).toBe("c");
    expect(rankPool(pool).map((m) => m.teamMemberId)).toEqual(["c", "b", "a"]);
  });
  it("skips the person who just took the heavy one, until the others catch up", () => {
    // Ana took a weight-6 integration; Ben and Cy have had one small deal each.
    const p = [
      {
        teamMemberId: "a",
        name: "Ana",
        capacity: 1,
        load: 6,
        lastAssignedAt: "2026-09-08T00:00:00Z",
      },
      {
        teamMemberId: "b",
        name: "Ben",
        capacity: 1,
        load: 1,
        lastAssignedAt: "2026-09-02T00:00:00Z",
      },
      {
        teamMemberId: "c",
        name: "Cy",
        capacity: 1,
        load: 1,
        lastAssignedAt: "2026-09-03T00:00:00Z",
      },
    ];
    expect(pickAssignee(p)!.teamMemberId).toBe("b");
    // Four small deals later Ben and Cy are at 3 each; Ana is still skipped.
    const later = p.map((m) => (m.teamMemberId === "a" ? m : { ...m, load: 3 }));
    expect(pickAssignee(later)!.teamMemberId).not.toBe("a");
  });
  it("divides load by capacity, so a half-timer is picked half as often", () => {
    const p = [
      { teamMemberId: "full", name: "Full", capacity: 1, load: 2, lastAssignedAt: null },
      { teamMemberId: "half", name: "Half", capacity: 0.5, load: 1, lastAssignedAt: null },
    ];
    // Both at effective load 2 → longest wait (both null) → name.
    expect(pickAssignee(p)!.teamMemberId).toBe("full");
  });
  it("returns null for an empty pool", () => {
    expect(pickAssignee([])).toBeNull();
  });
});

describe("normalizeRules", () => {
  it("fills in what is missing and drops what is malformed", () => {
    const r = normalizeRules({
      window_days: 14,
      arr_bands: [
        { min: 10, points: "x" },
        { min: 50, points: 3 },
      ],
      integration_points: { "3": 9, "9": 1 },
    });
    expect(r.window_days).toBe(14);
    expect(r.arr_bands).toEqual([{ min: 50, points: 3 }]);
    expect(r.integration_points["3"]).toBe(9);
    expect(r.integration_points["9"]).toBeUndefined();
    expect(r.seat_bands).toEqual(DEFAULT_ASSIGNMENT_RULES.seat_bands);
  });
});

describe("integrationTierFrom", () => {
  it("reads a number or a tier name", () => {
    expect(integrationTierFrom(3)).toBe(3);
    expect(integrationTierFrom("4")).toBe(4);
    expect(integrationTierFrom("Advanced")).toBe(3);
    expect(integrationTierFrom("complex or time consuming")).toBe(4);
    expect(integrationTierFrom("nope")).toBeNull();
    expect(integrationTierFrom("")).toBeNull();
  });
});
