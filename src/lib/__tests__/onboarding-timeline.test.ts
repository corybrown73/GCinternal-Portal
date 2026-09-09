import { describe, expect, it } from "vitest";

import {
  addBusinessDays,
  buildTimeline,
  daysToValue,
  INTEGRATION_TIERS,
  SEVEN_DAY_PLAN,
  shortDay,
} from "../onboarding-timeline";

/**
 * The plan drives the pace: kickoff the next business day, live by day
 * seven, integrations only after. These pin the rule, not the prose.
 */

describe("business days", () => {
  it("skips the weekend", () => {
    // 2026-09-11 is a Friday.
    expect(addBusinessDays("2026-09-11", 1)).toBe("2026-09-14");
    expect(addBusinessDays("2026-09-11", 3)).toBe("2026-09-16");
  });

  it("skips a holiday when told one", () => {
    expect(addBusinessDays("2026-09-11", 1, ["2026-09-14"])).toBe("2026-09-15");
  });
});

describe("the seven-day plan", () => {
  // 2026-09-09 is a Wednesday.
  const t = buildTimeline({ closeDate: "2026-09-09" });

  it("puts the kickoff on the next business day", () => {
    const kickoff = t.milestones.find((m) => m.key === "kickoff")!;
    expect(kickoff.date).toBe("2026-09-10");
    expect(kickoff.minutes).toBe(60);
  });

  it("is live within seven business days, and the last step is the live one", () => {
    expect(t.milestones[t.milestones.length - 1]!.key).toBe("live");
    expect(t.liveDate).toBe(addBusinessDays("2026-09-09", 7));
  });

  it("has two calls with homework between them, and the second is thirty minutes", () => {
    const calls = t.milestones.filter((m) => m.kind === "call");
    expect(calls.map((c) => c.key)).toEqual(["kickoff", "working"]);
    expect(calls[1]!.minutes).toBe(30);
    expect(calls[0]!.homework?.length).toBeGreaterThanOrEqual(3);
    const homework = t.milestones.find((m) => m.key === "homework")!;
    expect(homework.owner).toBe("client");
  });

  it("is a two-way street: most steps are shared or the customer's", () => {
    const ours = SEVEN_DAY_PLAN.filter((m) => m.owner === "gocanvas").length;
    expect(ours).toBeLessThan(SEVEN_DAY_PLAN.length / 2);
  });

  it("keeps the milestones in date order", () => {
    const dates = t.milestones.map((m) => m.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("has no integration by default", () => {
    expect(t.integration.tier).toBe(0);
    expect(t.integration.startsOn).toBeNull();
  });
});

describe("moving a date by hand", () => {
  it("wins over the plan and is reported as moved", () => {
    const t = buildTimeline({
      closeDate: "2026-09-09",
      overrides: { working: "2026-09-16" },
    });
    const working = t.milestones.find((m) => m.key === "working")!;
    expect(working.date).toBe("2026-09-16");
    expect(working.moved).toBe(true);
    expect(working.plannedDate).toBe("2026-09-14");
    // Everything else is untouched.
    expect(t.milestones.filter((m) => m.moved)).toHaveLength(1);
  });

  it("ignores an override that is not a date", () => {
    const t = buildTimeline({ closeDate: "2026-09-09", overrides: { working: "next tuesday" } });
    expect(t.milestones.find((m) => m.key === "working")!.moved).toBe(false);
  });

  it("moves the live date when the live milestone is moved", () => {
    const t = buildTimeline({ closeDate: "2026-09-09", overrides: { live: "2026-09-25" } });
    expect(t.liveDate).toBe("2026-09-25");
  });
});

describe("integrations", () => {
  it("start the business day AFTER the form is live, never before", () => {
    const t = buildTimeline({
      closeDate: "2026-09-09",
      integrationTier: 3,
      integrationTarget: "QuickBooks Online",
    });
    expect(t.integration.startsOn).toBe(addBusinessDays(t.liveDate, 1));
    expect(t.integration.startsOn! > t.liveDate).toBe(true);
    expect(t.integration.weeks).toBe(2);
    expect(t.integration.target).toBe("QuickBooks Online");
  });

  it("extend by the tier's weeks", () => {
    for (const tier of INTEGRATION_TIERS) {
      const t = buildTimeline({ closeDate: "2026-09-09", integrationTier: tier.tier });
      if (tier.weeks === 0) {
        expect(t.integration.startsOn).toBeNull();
      } else {
        const start = new Date(t.integration.startsOn! + "T00:00:00Z").getTime();
        const end = new Date(t.integration.endsOn! + "T00:00:00Z").getTime();
        expect((end - start) / 86_400_000).toBe(tier.weeks * 7);
      }
    }
  });

  it("still start after a hand-moved live date", () => {
    const t = buildTimeline({
      closeDate: "2026-09-09",
      overrides: { live: "2026-09-30" },
      integrationTier: 2,
    });
    expect(t.integration.startsOn! > "2026-09-30").toBe(true);
  });
});

describe("presentation helpers", () => {
  it("counts calendar days to value", () => {
    const t = buildTimeline({ closeDate: "2026-09-09" });
    // Seven business days from a Wednesday spans two weekends.
    expect(daysToValue(t)).toBe(9);
  });

  it("formats a date the way a slide reads it", () => {
    expect(shortDay("2026-09-10")).toBe("Thu, Sep 10");
  });
});
