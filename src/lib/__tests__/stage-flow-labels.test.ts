import { describe, expect, it } from "vitest";

import { stampDay, whenLabel, zoneShort } from "../stage-flow";

describe("the checklist's dates, in a person's words", () => {
  it("names a booked meeting with its zone", () => {
    expect(whenLabel("2026-09-28", "10:00")).toBe("Mon, Sep 28 at 10:00 AM");
    expect(whenLabel("2026-09-28", "14:30", "America/Chicago")).toBe("Mon, Sep 28 at 2:30 PM CDT");
    expect(whenLabel("2026-12-07", "09:00", "America/New_York")).toBe("Mon, Dec 7 at 9:00 AM EST");
    expect(zoneShort("Not/AZone", "2026-09-28")).toBe("");
  });

  it("dates a tick on the team's day, not UTC's", () => {
    // 9:52 pm Eastern on the 24th is 01:52Z on the 25th.
    expect(stampDay("2026-09-25T01:52:22.969Z")).toBe("Thu, Sep 24");
    expect(stampDay("not a date")).toBe("not a date");
  });
});
