import { describe, expect, it } from "vitest";
import { fmtDate, fmtDateTime, formatTaskOffset } from "../hub-format";

/**
 * Template tasks store a basis plus a signed day offset (0013). Reviewers read
 * the phrase, not the columns, so the sign has to survive the rendering — a
 * "T-14" task shown as "+14d" would read as two weeks after the thing it is
 * supposed to precede.
 */
describe("formatTaskOffset", () => {
  it("names the basis in plain English", () => {
    expect(formatTaskOffset("stage_entry", 3)).toBe("stage entry +3d");
    expect(formatTaskOffset("project_start", 5)).toBe("project start +5d");
    expect(formatTaskOffset("target_launch", 2)).toBe("target launch +2d");
  });

  it("keeps a negative offset negative", () => {
    expect(formatTaskOffset("target_launch", -14)).toBe("target launch -14d");
  });

  it("drops the offset entirely when it is zero", () => {
    expect(formatTaskOffset("stage_entry", 0)).toBe("on stage entry");
    expect(formatTaskOffset("stage_entry", null)).toBe("on stage entry");
  });

  it("falls back readably for an unknown or missing basis", () => {
    expect(formatTaskOffset("first_invoice", 1)).toBe("first invoice +1d");
    expect(formatTaskOffset(null, 1)).toBe("stage entry +1d");
  });
});

describe("fmtDate / fmtDateTime", () => {
  // Bug 10: every timestamp was formatted in UTC and printed bare, so
  // "Resolved 30 Aug 18:20" read as 18:20 to a reader in Eastern time, where
  // it was 14:20. The zone is now on the string.
  it("names the zone on an instant", () => {
    expect(fmtDateTime("2026-08-30T18:20:00Z")).toBe("30 Aug 2026 18:20 UTC");
  });

  it("does not invent a time of day for a date-only value", () => {
    expect(fmtDateTime("2026-08-30")).toBe("30 Aug 2026");
    expect(fmtDateTime("2026-08-30")).not.toContain("00:00");
  });

  // A calendar date has no zone, so labelling one would attach a fact to a
  // value that does not have it.
  it("leaves a calendar date unlabelled", () => {
    expect(fmtDate("2026-08-30")).toBe("30 Aug 2026");
  });

  it("converts an instant to the UTC day it falls on", () => {
    // 23:30 in New York on the 30th is the 31st in UTC. Stated rather than
    // hidden: this is the residual documented in src/lib/dates.ts.
    expect(fmtDate("2026-08-31T03:30:00Z")).toBe("31 Aug 2026");
  });

  it("renders a missing or unparseable value as a dash", () => {
    expect(fmtDateTime(null)).toBe("—");
    expect(fmtDateTime("not a date")).toBe("—");
    expect(fmtDate(undefined)).toBe("—");
  });
});
