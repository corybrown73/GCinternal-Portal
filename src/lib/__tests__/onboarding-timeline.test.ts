import { describe, expect, it } from "vitest";

import {
  dayCounter,
  addBusinessDays,
  addWeeks,
  buildTimeline,
  daysToValue,
  dayLabel,
  daysToValueActual,
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

describe("the new-logo plan — three training days, fifteen business days", () => {
  // 2026-09-09 is a Wednesday.
  const t = buildTimeline({ closeDate: "2026-09-09" });

  it("puts the kickoff two business days out, time to reply to the AE and book it", () => {
    const kickoff = t.milestones.find((m) => m.key === "kickoff")!;
    expect(kickoff.date).toBe("2026-09-11");
    expect(kickoff.minutes).toBe(60);
  });

  it("is live within fifteen business days, and the last step is the live one", () => {
    expect(t.milestones[t.milestones.length - 1]!.key).toBe("live");
    expect(t.liveDate).toBe(addBusinessDays("2026-09-09", 15));
  });

  it("has three sixty-minute training calls with work between them", () => {
    const calls = t.milestones.filter((m) => m.kind === "call");
    expect(calls.map((c) => c.key)).toEqual(["kickoff", "working", "adjust"]);
    expect(calls.map((c) => c.minutes)).toEqual([60, 60, 60]);
    expect(calls[0]!.homework?.length).toBeGreaterThanOrEqual(3);
    // Between the stages both sides work: they test, we prepare the next call.
    const homework = t.milestones.find((m) => m.key === "homework")!;
    expect(homework.owner).toBe("both");
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
      overrides: { working: "2026-09-18" },
    });
    const working = t.milestones.find((m) => m.key === "working")!;
    expect(working.date).toBe("2026-09-18");
    expect(working.moved).toBe(true);
    expect(working.plannedDate).toBe("2026-09-16");
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
    expect(t.integration.weeks).toBe(3);
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
  it("counts business days to value, the plan's own unit", () => {
    const t = buildTimeline({ closeDate: "2026-09-09" });
    // Fifteen business days from a Wednesday spans three weekends; the
    // count still reads fifteen, the same number as "Day 15".
    expect(daysToValue(t)).toBe(15);
  });

  it("formats a date the way a slide reads it", () => {
    expect(shortDay("2026-09-10")).toBe("Thu, Sep 10");
  });
});

describe("phase 2 is gated on the form", () => {
  it("is tentative until somebody says the form is dialed in", () => {
    const t = buildTimeline({ closeDate: "2026-09-09", integrationTier: 3 });
    expect(t.integration.tentative).toBe(true);
    expect(t.integration.provenOn).toBeNull();
    expect(t.integration.startsOn).toBe(addBusinessDays(t.liveDate, 1));
  });

  it("re-anchors on the day the form was proven, and is no longer tentative", () => {
    const t = buildTimeline({
      closeDate: "2026-09-09",
      integrationTier: 3,
      formProvenOn: "2026-10-01",
    });
    expect(t.integration.tentative).toBe(false);
    expect(t.integration.startsOn).toBe(addBusinessDays("2026-10-01", 1));
    expect(t.integration.endsOn).toBe(addWeeks(t.integration.startsOn!, 3));
  });

  it("never lets a proven date pull phase 2 before the form is live", () => {
    const t = buildTimeline({
      closeDate: "2026-09-09",
      integrationTier: 2,
      formProvenOn: "2026-09-01",
    });
    expect(t.integration.startsOn! > t.liveDate).toBe(true);
  });

  it("opens with its own kickoff and ends live, in order, and honours an override", () => {
    const t = buildTimeline({
      closeDate: "2026-09-09",
      integrationTier: 3,
      formProvenOn: "2026-09-18",
      overrides: { integ_test: "2026-09-30" },
    });
    const keys = t.integration.milestones.map((m) => m.key);
    expect(keys).toEqual(["integ_kickoff", "integ_build", "integ_test", "integ_live"]);
    expect(t.integration.milestones[0]!.date).toBe(t.integration.startsOn);
    expect(t.integration.milestones[0]!.minutes).toBe(30);
    expect(t.integration.milestones[3]!.date).toBe(t.integration.endsOn);
    expect(t.integration.milestones[2]!.moved).toBe(true);
    expect(t.integration.milestones[2]!.date).toBe("2026-09-30");
  });

  it("has no phase 2 without an integration", () => {
    expect(buildTimeline({ closeDate: "2026-09-09" }).integration.milestones).toEqual([]);
  });
});

describe("phase 2 dates land on business days", () => {
  it("never puts a milestone on a weekend", () => {
    const t = buildTimeline({ closeDate: "2026-09-09", integrationTier: 3 });
    for (const m of t.integration.milestones) {
      const day = new Date(m.date + "T00:00:00Z").getUTCDay();
      expect(day).not.toBe(0);
      expect(day).not.toBe(6);
    }
  });
});

describe("moving a date moves everything after it", () => {
  it("shifts every later milestone by the same number of business days", () => {
    // Kickoff planned Fri Sep 11; moved to Mon Sep 14 = +1 business day.
    const t = buildTimeline({ closeDate: "2026-09-09", overrides: { kickoff: "2026-09-14" } });
    const by = (k: string) => t.milestones.find((m) => m.key === k)!;
    expect(by("kickoff").moved).toBe(true);
    expect(by("homework").date).toBe("2026-09-15");
    expect(by("homework").shifted).toBe(true);
    expect(by("working").date).toBe("2026-09-17");
    expect(by("live").date).toBe("2026-10-01");
    expect(t.liveDate).toBe("2026-10-01");
    // Nothing before it moved.
    expect(by("close").date).toBe("2026-09-09");
    expect(by("close").shifted).toBe(false);
  });

  it("lets a later hand-moved date set its own shift", () => {
    const t = buildTimeline({
      closeDate: "2026-09-09",
      overrides: { kickoff: "2026-09-14", working: "2026-09-15" },
    });
    const by = (k: string) => t.milestones.find((m) => m.key === k)!;
    // Working was planned Thu Sep 17 after the kickoff shift; a person pulled it to Tue.
    expect(by("working").moved).toBe(true);
    expect(by("working").plannedDate).toBe("2026-09-17");
    // Field test follows the working session's shift (−1 from its base of Sep 17 → Sep 16).
    expect(by("fieldtest").date).toBe("2026-09-16");
  });

  it("moves the whole of phase 2 when its kickoff is moved", () => {
    const t = buildTimeline({
      closeDate: "2026-09-09",
      integrationTier: 3,
      formProvenOn: "2026-09-18",
      overrides: { integ_kickoff: "2026-09-28" },
    });
    expect(t.integration.startsOn).toBe("2026-09-28");
    expect(t.integration.milestones[0]!.moved).toBe(true);
    expect(t.integration.milestones.slice(1).every((m) => m.shifted)).toBe(true);
    // Three weeks after the planned Mon Sep 21 was Mon Oct 12; +5 business days → Mon Oct 19.
    expect(t.integration.endsOn).toBe("2026-10-19");
  });
});

describe("done marks", () => {
  it("records what actually happened and counts progress", () => {
    const t = buildTimeline({
      closeDate: "2026-09-09",
      completed: { kickoff: "2026-09-10", homework: "2026-09-12" },
      times: { kickoff: "10:00" },
      timezone: "America/Chicago",
    });
    const by = (k: string) => t.milestones.find((m) => m.key === k)!;
    expect(by("kickoff").doneOn).toBe("2026-09-10");
    expect(by("kickoff").time).toBe("10:00");
    expect(by("working").doneOn).toBeNull();
    expect(t.progress).toEqual({ done: 2, total: 7 });
    expect(t.timezone).toBe("America/Chicago");
  });

  it("marking the form live opens the phase-2 gate and gives the actual days to value", () => {
    const t = buildTimeline({
      closeDate: "2026-09-09",
      integrationTier: 3,
      completed: { live: "2026-09-17" },
    });
    expect(t.liveDoneOn).toBe("2026-09-17");
    expect(t.integration.tentative).toBe(false);
    expect(t.integration.provenOn).toBe("2026-09-17");
    expect(t.integration.startsOn! > "2026-09-17").toBe(true);
    expect(daysToValueActual(t)).toBe(6);
    expect(daysToValueActual(buildTimeline({ closeDate: "2026-09-09" }))).toBeNull();
  });

  it("ignores a done date that is not a date", () => {
    const t = buildTimeline({ closeDate: "2026-09-09", completed: { kickoff: "yesterday" } });
    expect(t.milestones.find((m) => m.key === "kickoff")!.doneOn).toBeNull();
  });
});

describe("phases with several services", () => {
  const services = [
    {
      id: "qb",
      kind: "integration" as const,
      name: "QuickBooks Online",
      phase: 2,
      tier: 3 as const,
    },
    { id: "pdf", kind: "custom_pdf" as const, name: "Invoice PDF", phase: 2 },
    { id: "dash", kind: "analytics" as const, name: "Ops dashboard", phase: 3 },
  ];

  it("runs services in the same phase at the same time, and the next phase after", () => {
    const t = buildTimeline({ closeDate: "2026-09-09", services, formProvenOn: "2026-09-18" });
    expect(t.phases.map((p) => p.phase)).toEqual([2, 3]);
    const p2 = t.phases[0]!;
    expect(p2.services.map((s) => s.name)).toEqual(["QuickBooks Online", "Invoice PDF"]);
    expect(p2.services[0]!.startsOn).toBe(p2.services[1]!.startsOn);
    expect(p2.services[0]!.startsOn).toBe(p2.startsOn);
    expect(p2.services[0]!.weeks).toBe(3);
    expect(p2.services[1]!.weeks).toBe(1);
    expect(p2.endsOn).toBe(p2.services[0]!.endsOn);
    expect(p2.tentative).toBe(false);
    const p3 = t.phases[1]!;
    expect(p3.startsOn! > p2.endsOn!).toBe(true);
    expect(p3.tentative).toBe(true);
    expect(p3.gate).toMatch(/phase 2 is live/);
  });

  it("is on phase 1 until the form is live, then the lowest phase with work left", () => {
    const before = buildTimeline({ closeDate: "2026-09-09", services });
    expect(before.currentPhase).toBe(1);
    expect(before.phases[0]!.tentative).toBe(true);
    const during = buildTimeline({
      closeDate: "2026-09-09",
      services,
      completed: { live: "2026-09-18" },
    });
    expect(during.currentPhase).toBe(2);
    const p2done = buildTimeline({
      closeDate: "2026-09-09",
      services,
      completed: { live: "2026-09-18", "qb:live": "2026-10-02", "pdf:live": "2026-09-28" },
    });
    expect(p2done.phases[0]!.done).toBe(true);
    expect(p2done.currentPhase).toBe(3);
    // Phase 3 now anchors on the day phase 2 actually finished, and is committed.
    expect(p2done.phases[1]!.tentative).toBe(false);
    expect(p2done.phases[1]!.startsOn).toBe(addBusinessDays("2026-10-02", 1));
    expect(p2done.allDone).toBe(false);
  });

  it("keeps the single-integration view for the parts of the app that use it", () => {
    const t = buildTimeline({ closeDate: "2026-09-09", services });
    expect(t.integration.target).toBe("QuickBooks Online");
    expect(t.integration.tier).toBe(3);
    expect(t.integration.milestones.map((m) => m.key)).toEqual([
      "qb:kickoff",
      "qb:build",
      "qb:review",
      "qb:live",
    ]);
    expect(t.integration.tentative).toBe(true);
  });

  it("folds the legacy tier/target knobs into a phase-2 service when no services are set", () => {
    const t = buildTimeline({
      closeDate: "2026-09-09",
      integrationTier: 2,
      integrationTarget: "Dropbox",
    });
    expect(t.phases).toHaveLength(1);
    expect(t.phases[0]!.services[0]!.name).toBe("Dropbox");
    expect(t.integration.milestones[0]!.key).toBe("integ_kickoff");
  });

  it("weights every step with its phase and service", () => {
    const t = buildTimeline({ closeDate: "2026-09-09", services });
    expect(t.milestones.every((m) => m.phase === 1)).toBe(true);
    const qb = t.phases[0]!.services[0]!;
    expect(qb.milestones.every((m) => m.phase === 2 && m.serviceId === "qb")).toBe(true);
    expect(t.progress.total).toBe(7 + 4 + 4 + 4);
  });
});

describe("services alongside the form (phase 1)", () => {
  const services = [
    { id: "haul", kind: "paid_form" as const, name: "Chemical Delivery Ticket", phase: 1 },
    {
      id: "qb",
      kind: "integration" as const,
      name: "QuickBooks Online",
      phase: 2,
      tier: 3 as const,
    },
  ];

  it("starts a phase-1 service on the kickoff call and never gates it", () => {
    const t = buildTimeline({ closeDate: "2026-09-09", services });
    const kickoff = t.milestones.find((m) => m.key === "kickoff")!;
    expect(t.alongside.map((s) => s.name)).toEqual(["Chemical Delivery Ticket"]);
    const haul = t.alongside[0]!;
    expect(haul.phase).toBe(1);
    expect(haul.startsOn).toBe(kickoff.date);
    expect(haul.milestones[0]!.date).toBe(kickoff.date);
    expect(haul.milestones[0]!.key).toBe("haul:kickoff");
    // Phase 1 companions are not phases: the gated list starts at 2.
    expect(t.phases.map((p) => p.phase)).toEqual([2]);
    expect(t.phases[0]!.tentative).toBe(true);
  });

  it("carries what we need from the customer, the catalogue's unless overridden", () => {
    const t = buildTimeline({ closeDate: "2026-09-09", services });
    expect(t.alongside[0]!.needs).toMatch(/form you use for it today/);
    const own = buildTimeline({
      closeDate: "2026-09-09",
      services: [{ ...services[0]!, needs: "The paper ticket book." }],
    });
    expect(own.alongside[0]!.needs).toBe("The paper ticket book.");
  });

  it("follows a moved kickoff and counts its steps in progress", () => {
    const t = buildTimeline({
      closeDate: "2026-09-09",
      services,
      overrides: { kickoff: "2026-09-14" },
      completed: { "haul:kickoff": "2026-09-14" },
    });
    expect(t.alongside[0]!.startsOn).toBe("2026-09-14");
    expect(t.alongside[0]!.milestones[0]!.doneOn).toBe("2026-09-14");
    expect(t.progress.done).toBe(1);
    expect(t.progress.total).toBe(7 + 4 + 4);
  });
});

describe("the existing-account path", () => {
  it("makes phase 1 a form review with the same keys, six business days, and the integration beside it", () => {
    const t = buildTimeline({
      closeDate: "2026-09-09",
      path: "existing",
      services: [{ id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 }],
    });
    expect(t.path).toBe("existing");
    expect(t.milestones.map((m) => m.key)).toEqual([
      "close",
      "kickoff",
      "homework",
      "working",
      "fieldtest",
      "adjust",
      "live",
    ]);
    expect(t.milestones.find((m) => m.key === "kickoff")!.label).toBe(
      "Form review for the integration",
    );
    expect(t.milestones.find((m) => m.key === "kickoff")!.minutes).toBe(45);
    expect(t.milestones[t.milestones.length - 1]!.day).toBe(6);
    expect(t.liveDate).toBe(addBusinessDays("2026-09-09", 6));
    // A final form: the integration starts in week one, beside the review,
    // so a three-week integration is a three-week project.
    expect(t.phases[0]!.gate).toBe("Starts in week one, beside the form review");
    expect(t.phases[0]!.startsOn).toBe(addBusinessDays("2026-09-09", 1));
    expect(t.phases[0]!.tentative).toBe(false);
    const built = buildTimeline({
      closeDate: "2026-09-09",
      path: "existing",
      existingBuild: "customer",
      services: [{ id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 }],
    });
    expect(built.phases[0]!.gate).toBe(
      "Starts once your form is proven or frozen for the integration",
    );
    expect(built.phases[0]!.startsOn! > built.liveDate).toBe(true);
  });

  it("is the new-logo plan when the path is unset or new_logo", () => {
    expect(buildTimeline({ closeDate: "2026-09-09" }).path).toBe("new_logo");
    expect(buildTimeline({ closeDate: "2026-09-09", path: null }).milestones[6]!.day).toBe(15);
  });
});

describe("dayCounter", () => {
  const t = buildTimeline({ closeDate: "2026-09-09" }); // Wed; live Wed Sep 30 (day 15)
  it("counts business days from the close, and to live", () => {
    expect(dayCounter(t, "2026-09-09")).toMatchObject({
      day: 0,
      total: 15,
      toLive: 15,
      state: "during",
    });
    const mid = dayCounter(t, "2026-09-14");
    expect(mid).toMatchObject({ day: 3, toLive: 12, state: "during", label: "Day 3 of 15" });
    expect(mid.detail).toBe("Functional Wed, Sep 30 · in 12 business days");
    // Every other plan ends "live"; only the playbook says "Functional".
    const dm = buildTimeline({ closeDate: "2026-09-09", path: "dm_conversion" });
    expect(dayCounter(dm, "2026-09-14").detail).toMatch(/^Live /);
    expect(dayCounter(t, "2026-09-30")).toMatchObject({
      state: "live_today",
      detail: "Functional today",
    });
    expect(dayCounter(t, "2026-10-02")).toMatchObject({ state: "past_due", toLive: -2 });
    expect(dayCounter(t, "2026-09-07")).toMatchObject({
      state: "before",
      label: "Begins in 2 days",
    });
  });
  it("says how it landed once the form is live", () => {
    const early = buildTimeline({ closeDate: "2026-09-09", completed: { live: "2026-09-16" } });
    expect(dayCounter(early, "2026-09-30")).toMatchObject({
      state: "live",
      actual: 5,
      label: "Functional in 5 days",
      detail: "10 days ahead of the 15-day plan",
    });
    const onPlan = buildTimeline({ closeDate: "2026-09-09", completed: { live: "2026-09-30" } });
    expect(dayCounter(onPlan, "2026-10-01").detail).toBe("On plan — 15 days");
  });
});

describe("service steps read like a plan", () => {
  it("never puts two sequential steps on the same day", () => {
    // Close on a Monday, so a one-week phase-2 service spans a weekend and the
    // old calendar fractions rounded "built" and "you review it" onto the
    // same Monday.
    for (const closeDate of [
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
    ]) {
      const t = buildTimeline({
        closeDate,
        services: [{ id: "dash", kind: "analytics", name: "Analytics dashboard", phase: 2 }],
      });
      const dates = t.phases[0]!.services[0]!.milestones.map((m) => m.date);
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]! > dates[i - 1]!).toBe(true);
      }
    }
  });

  it("takes a call's length from the SOW's own words", () => {
    const t = buildTimeline({
      closeDate: "2026-09-09",
      services: [
        {
          id: "train",
          kind: "training",
          name: "Field user training session (30-minute, recorded)",
          phase: 1,
        },
      ],
    });
    const session = t.alongside[0]!.milestones.find((m) => m.kind === "call")!;
    expect(session.minutes).toBe(30);
  });

  it("names both days of a step that spans two", () => {
    const t = buildTimeline({ closeDate: "2026-09-09" });
    expect(dayLabel(t.milestones.find((m) => m.key === "fieldtest")!)).toBe("Day 6–10");
    expect(dayLabel(t.milestones.find((m) => m.key === "adjust")!)).toBe("Day 11");
  });
});
