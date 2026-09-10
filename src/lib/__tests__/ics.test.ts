import { describe, expect, it } from "vitest";

import { buildIcs, zonedToUtc } from "../ics";

describe("zonedToUtc", () => {
  it("turns 10:00 Central in September into 15:00Z", () => {
    expect(zonedToUtc("2026-09-10", "10:00", "America/Chicago").toISOString()).toBe(
      "2026-09-10T15:00:00.000Z",
    );
  });
  it("respects standard time in January", () => {
    expect(zonedToUtc("2026-01-15", "10:00", "America/Chicago").toISOString()).toBe(
      "2026-01-15T16:00:00.000Z",
    );
  });
});

describe("buildIcs", () => {
  it("writes a timed call and an all-day date", () => {
    const ics = buildIcs([
      {
        uid: "a@gc",
        summary: "Kickoff & build session",
        date: "2026-09-10",
        time: "10:00",
        timezone: "America/Chicago",
        minutes: 60,
        url: "https://example.com/welcome/x",
      },
      { uid: "b@gc", summary: "Live — first value", date: "2026-09-18" },
    ]);
    expect(ics).toContain("DTSTART:20260910T150000Z");
    expect(ics).toContain("DTEND:20260910T160000Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260918");
    expect(ics).toContain("DTEND;VALUE=DATE:20260919");
    expect(ics).toContain("URL:https://example.com/welcome/x");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });

  it("escapes commas and semicolons, and folds long lines", () => {
    const ics = buildIcs([
      {
        uid: "c@gc",
        summary: "Working session; bring the list, please",
        description: "x".repeat(200),
        date: "2026-09-14",
      },
    ]);
    expect(ics).toContain("SUMMARY:Working session\\; bring the list\\, please");
    for (const line of ics.split("\r\n"))
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
  });
});
