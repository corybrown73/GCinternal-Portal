import { describe, expect, it } from "vitest";

import { calendarDaysBetween, daysSinceInstant, daysUntilDate, isDateOnly } from "../dates";

/**
 * These are the exact numbers from the QA sweep. Under TZ=America/New_York the
 * old `pace.daysBetween` — which normalised with LOCAL setHours — returned one
 * more than Home and Leadership for the same account. Run this file with
 * `npm run test:tz` and it exercises that path; under UTC it still passes,
 * which is precisely why a UTC-only suite let the bug ship.
 */
const AUG_30 = new Date("2026-08-30T18:00:00Z"); // 14:00 in New York

describe("the four screens now agree", () => {
  it("Fairview: target 02 Aug, on 30 Aug, is 28 days past", () => {
    // Home and Leadership said 28. Customer 360 and Signals said 29.
    expect(daysUntilDate("2026-08-02", AUG_30)).toBe(-28);
  });

  it("Sierra: target 24 Aug, on 30 Aug, is 6 days past", () => {
    expect(daysUntilDate("2026-08-24", AUG_30)).toBe(-6);
  });

  it("counts a future target the same way", () => {
    expect(daysUntilDate("2026-09-08", AUG_30)).toBe(9);
  });

  it("calls the target date itself zero, not one", () => {
    // "Target is today" and "1 day past" are different messages to a reader.
    expect(daysUntilDate("2026-08-30", AUG_30)).toBe(0);
  });
});

describe("late in the day, where the local-midnight bug lived", () => {
  // 23:30 in New York on 30 Aug is already 03:30 UTC on 31 Aug. The old helper
  // normalised the target to LOCAL midnight and the clock to UTC, so the two
  // sides of the subtraction were in different frames and the answer moved.
  const LATE = new Date("2026-08-31T03:30:00Z");

  it("does not shift the answer just because the reader is up late", () => {
    expect(daysUntilDate("2026-08-02", LATE)).toBe(-29);
    expect(daysUntilDate("2026-08-02", new Date("2026-08-31T12:00:00Z"))).toBe(-29);
  });

  it("gives the same answer at every hour of a given UTC day", () => {
    const hours = [0, 6, 12, 18, 23].map((h) =>
      daysUntilDate("2026-09-08", new Date(Date.UTC(2026, 7, 30, h))),
    );
    expect(new Set(hours).size).toBe(1);
  });
});

describe("calendarDaysBetween", () => {
  it("compares a completion timestamp against a target date", () => {
    // The mixed comparison pace.ts was making: one side a timestamptz, the
    // other a `date`. Both reduce to their UTC day before subtracting.
    expect(calendarDaysBetween("2026-08-02", "2026-08-05T16:20:00Z")).toBe(3);
    expect(calendarDaysBetween("2026-08-02", "2026-07-31T09:00:00Z")).toBe(-2);
  });

  it("is exact across a daylight-saving boundary", () => {
    // US DST ends 1 Nov 2026. A local-midnight implementation makes one of
    // these 25 hours long and rounds; this must stay whole days.
    expect(calendarDaysBetween("2026-10-30", "2026-11-03")).toBe(4);
    expect(calendarDaysBetween("2026-03-06", "2026-03-10")).toBe(4);
  });

  it("returns null rather than NaN for missing or unparseable input", () => {
    expect(calendarDaysBetween(null, "2026-08-02")).toBeNull();
    expect(calendarDaysBetween("2026-08-02", undefined)).toBeNull();
    expect(calendarDaysBetween("not a date", "2026-08-02")).toBeNull();
  });
});

describe("daysSinceInstant", () => {
  it("counts elapsed time for timestamps, not calendar days", () => {
    // Stage entry is a timestamptz: "2 days in stage" means two elapsed days.
    expect(daysSinceInstant("2026-08-28T18:00:00Z", AUG_30)).toBe(2);
    expect(daysSinceInstant("2026-08-30T06:00:00Z", AUG_30)).toBe(0);
  });

  it("clamps a future instant to zero rather than reporting negative days", () => {
    expect(daysSinceInstant("2026-09-01T00:00:00Z", AUG_30)).toBe(0);
  });

  it("returns null for absent input", () => {
    expect(daysSinceInstant(null)).toBeNull();
    expect(daysSinceInstant("nonsense")).toBeNull();
  });
});

describe("isDateOnly", () => {
  it("separates a date column from a timestamp column", () => {
    expect(isDateOnly("2026-08-24")).toBe(true);
    expect(isDateOnly("2026-08-24T10:00:00Z")).toBe(false);
  });
});
