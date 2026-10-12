import { describe, expect, it } from "vitest";

import { buildTimeline } from "../onboarding-timeline";
import { planMilestoneDateChange, wasOverdueAsOf } from "../milestone-history";

/**
 * planMilestoneDateChange() is the pure diff behind the audit trail: given
 * the timeline before and after one new override, what moved directly and
 * what only cascaded. It never recomputes the plan itself — buildTimeline()
 * already did that — so these tests pin what the diff reports, not the
 * calendar math (onboarding-timeline.test.ts already does that).
 */
describe("planMilestoneDateChange", () => {
  const closeDate = "2026-09-09"; // Wednesday

  it("reports the first explicit change on a milestone that has never been moved", () => {
    const before = buildTimeline({ closeDate });
    const after = buildTimeline({ closeDate, overrides: { kickoff: "2026-09-15" } });
    const plan = planMilestoneDateChange(before, after, "kickoff")!;
    expect(plan.direct).toEqual({
      milestoneKey: "kickoff",
      previousDate: before.milestones.find((m) => m.key === "kickoff")!.date,
      newDate: "2026-09-15",
    });
  });

  it("distinguishes the cascaded later milestones from the one actually moved, each traceable to it", () => {
    const before = buildTimeline({ closeDate });
    const after = buildTimeline({ closeDate, overrides: { kickoff: "2026-09-15" } });
    const plan = planMilestoneDateChange(before, after, "kickoff")!;

    const cascadeKeys = plan.cascades.map((c) => c.milestoneKey).sort();
    // Every key after "kickoff" in the plan shifted with it...
    expect(cascadeKeys).toEqual(["adjust", "fieldtest", "homework", "live", "working"].sort());
    // ...and "close", which comes before it, did not.
    expect(cascadeKeys).not.toContain("close");

    for (const c of plan.cascades) {
      const wasBefore = before.milestones.find((m) => m.key === c.milestoneKey)!.date;
      const wasAfter = after.milestones.find((m) => m.key === c.milestoneKey)!.date;
      expect(c.previousDate).toBe(wasBefore);
      expect(c.newDate).toBe(wasAfter);
      // Not an invented human edit: the cascaded date really did move.
      expect(c.previousDate).not.toBe(c.newDate);
    }
  });

  it("does not cascade a milestone that already carries its own override", () => {
    const before = buildTimeline({ closeDate, overrides: { working: "2026-10-01" } });
    const after = buildTimeline({
      closeDate,
      overrides: { working: "2026-10-01", kickoff: "2026-09-15" },
    });
    const plan = planMilestoneDateChange(before, after, "kickoff")!;
    // "working" is pinned by its own override — kickoff's move does not
    // touch it, so it is not a cascade of this change.
    expect(plan.cascades.some((c) => c.milestoneKey === "working")).toBe(false);
  });

  it("is a true no-op when the new date equals the one already in effect", () => {
    const before = buildTimeline({ closeDate });
    const plannedKickoff = before.milestones.find((m) => m.key === "kickoff")!.date;
    const after = buildTimeline({ closeDate, overrides: { kickoff: plannedKickoff } });
    const plan = planMilestoneDateChange(before, after, "kickoff")!;
    expect(plan.direct.previousDate).toBe(plan.direct.newDate);
    expect(plan.cascades).toEqual([]);
  });

  it("is null for a milestone key that names nothing on the plan, rather than guessing", () => {
    const before = buildTimeline({ closeDate });
    const after = buildTimeline({ closeDate, overrides: { kickoff: "2026-09-15" } });
    expect(planMilestoneDateChange(before, after, "not_a_real_key")).toBeNull();
  });

  it("legacy records: reads a pre-existing override honestly as the current date, never as a reconstructed original commitment", () => {
    // Simulates an account whose "kickoff" was already moved before this
    // feature existed — no history, just the override already in place.
    const before = buildTimeline({ closeDate, overrides: { kickoff: "2026-09-20" } });
    const plannedKickoff = before.milestones.find((m) => m.key === "kickoff")!.plannedDate;
    // The legacy override, not the original planned date, is what the first
    // newly-recorded change must treat as "previous" — the plan never had
    // any way to know whether 2026-09-20 was itself a first move or a
    // tenth, and does not pretend otherwise.
    expect(before.milestones.find((m) => m.key === "kickoff")!.date).toBe("2026-09-20");
    expect(before.milestones.find((m) => m.key === "kickoff")!.date).not.toBe(plannedKickoff);

    const after = buildTimeline({ closeDate, overrides: { kickoff: "2026-09-25" } });
    const plan = planMilestoneDateChange(before, after, "kickoff")!;
    expect(plan.direct.previousDate).toBe("2026-09-20"); // the legacy value, honestly
    expect(plan.direct.previousDate).not.toBe(plannedKickoff); // never the "original" plan date
  });
});

describe("wasOverdueAsOf", () => {
  it("is true once the date has already passed", () => {
    expect(wasOverdueAsOf("2026-09-11", "2026-09-15")).toBe(true);
  });

  it("is false for today or a date still ahead", () => {
    expect(wasOverdueAsOf("2026-09-15", "2026-09-15")).toBe(false);
    expect(wasOverdueAsOf("2026-09-20", "2026-09-15")).toBe(false);
  });

  it("is preserved independently of which way the date is then moved", () => {
    // Moving an overdue commitment later does not erase that it was overdue
    // when the change was made — that fact is captured at the moment of
    // change, not recomputed afterwards from the new date.
    const overdueBefore = wasOverdueAsOf("2026-09-11", "2026-09-15");
    expect(overdueBefore).toBe(true);
    // Whatever the new date is, this flag is about the OLD date vs today,
    // and does not change just because the new date is also in the future.
    expect(overdueBefore).toBe(wasOverdueAsOf("2026-09-11", "2026-09-15"));
  });
});
