import { describe, expect, it } from "vitest";
import { PACE_CHIP, datePace, dwellPace, worstPace } from "../pace";

/**
 * The rules that make the colour worth having. If these slip, the palette
 * becomes decoration and the eye stops trusting it.
 */

const now = new Date("2026-06-15T12:00:00Z");

describe("datePace", () => {
  it("is late, with the number of days, once the target has passed", () => {
    const p = datePace("2026-06-09", null, now);
    expect(p.level).toBe("late");
    expect(p.days).toBe(6);
    expect(p.reason).toContain("6 days past target");
  });

  it("warns inside a week but not beyond it", () => {
    expect(datePace("2026-06-20", null, now).level).toBe("watch");
    expect(datePace("2026-06-30", null, now).level).toBe("on_pace");
  });

  it("keeps a late delivery late after the fact", () => {
    // Delivered, but two days after it was due. Reporting this as plain "done"
    // would erase the slip the moment it stopped hurting.
    const p = datePace("2026-06-01", "2026-06-03", now);
    expect(p.level).toBe("done");
    expect(p.days).toBe(2);
    expect(p.reason).toContain("2 days after target");
  });

  it("says early when it was early", () => {
    expect(datePace("2026-06-10", "2026-06-07", now).reason).toContain("3 days early");
  });

  it("singularises, because '1 days past target' reads as a bug", () => {
    expect(datePace("2026-06-14", null, now).reason).toContain("1 day past target");
  });
});

describe("dwellPace", () => {
  it("is on pace early in the budget and at risk in the last fifth", () => {
    // 14-day target: day 5 is comfortable, day 12 is not.
    expect(dwellPace("2026-06-10", 14, now).level).toBe("on_pace");
    expect(dwellPace("2026-06-03", 14, now).level).toBe("watch");
  });

  it("is late past the target, and says by how much against what", () => {
    const p = dwellPace("2026-05-25", 14, now);
    expect(p.level).toBe("late");
    expect(p.days).toBe(7);
    expect(p.reason).toBe("Day 21 of a 14 days target — 7 days over.");
  });

  it("never reports a missing target as on pace", () => {
    // An absence of evidence is not evidence. This is the rule the whole
    // product is built on, applied to a colour.
    const p = dwellPace("2026-06-13", null, now);
    expect(p.level).toBe("unknown");
    expect(p.reason).toContain("No target duration is set");
  });

  it("still flags a long stall with no target, and says the threshold is generic", () => {
    const p = dwellPace("2026-05-01", null, now);
    expect(p.level).toBe("watch");
    expect(p.reason).toContain("general stall threshold");
  });

  it("is unknown, not on pace, when no entry date was recorded", () => {
    expect(dwellPace(null, 14, now).level).toBe("unknown");
  });
});

describe("the colour contract", () => {
  it("gives on_pace and unknown no tint at all", () => {
    // If everything is green, the green means nothing and there is nowhere for
    // the eye to land. Only the exception is coloured.
    expect(PACE_CHIP.on_pace).toContain("bg-transparent");
    expect(PACE_CHIP.unknown).toContain("bg-transparent");
  });

  it("tints only the two levels that want you to stop", () => {
    expect(PACE_CHIP.late).toContain("bg-status-blocked");
    expect(PACE_CHIP.watch).toContain("bg-status-risk");
  });

  it("gives every level a reason a person can read without seeing the colour", () => {
    const cases = [
      datePace("2026-06-09", null, now),
      datePace("2026-06-20", null, now),
      datePace("2026-06-30", null, now),
      datePace(null, null, now),
      dwellPace("2026-05-25", 14, now),
      dwellPace("2026-06-13", null, now),
    ];
    for (const p of cases) {
      expect(p.reason.length).toBeGreaterThan(8);
      expect(p.reason).toMatch(/[a-z]/);
    }
  });
});

describe("worstPace", () => {
  it("reports the worst signal, because a stage is only as good as that", () => {
    expect(
      worstPace([
        datePace("2026-06-30", null, now),
        datePace("2026-06-01", null, now),
        dwellPace("2026-06-10", 14, now),
      ]).level,
    ).toBe("late");
  });

  it("prefers a real 'unknown' over an unearned 'on pace'", () => {
    // Ranking puts unknown ahead of on_pace deliberately: not knowing is a
    // weaker claim than knowing it is fine, and should not be dressed up as it.
    expect(worstPace([datePace("2026-06-30", null, now), datePace(null, null, now)]).level).toBe(
      "unknown",
    );
  });

  it("does not fall over on an empty list", () => {
    expect(worstPace([]).level).toBe("unknown");
  });
});
