import { describe, expect, it } from "vitest";

import { showsLegacyFlag } from "@/components/health-note";

describe("showsLegacyFlag", () => {
  // The bug: nine of nine implementations in production carried status
  // 'on_track' with no recorded health, and every one printed "Legacy flag: On
  // track (unconfirmed)". Every creation path writes 'on_track' by default, so
  // the note was rendering the absence of a statement as a statement.
  it("stays silent on the value every creation path writes", () => {
    expect(showsLegacyFlag("on_track", "no_signal")).toBe(false);
    expect(showsLegacyFlag("on_track", "at_risk")).toBe(false);
  });

  // Nothing writes these automatically, so one of them in the column means
  // somebody set it — even though we cannot say who, which is what the
  // "(unconfirmed)" caveat is for.
  it("still surfaces a flag somebody must have set", () => {
    expect(showsLegacyFlag("at_risk", "no_signal")).toBe(true);
    expect(showsLegacyFlag("blocked", "on_track")).toBe(true);
  });

  it("says nothing when the flag agrees with the signals", () => {
    expect(showsLegacyFlag("at_risk", "at_risk")).toBe(false);
    expect(showsLegacyFlag("blocked", "blocked")).toBe(false);
  });

  it("defers to a human statement when there is one", () => {
    expect(showsLegacyFlag("blocked", "no_signal", "on_track")).toBe(false);
  });

  it("ignores values outside the health vocabulary", () => {
    expect(showsLegacyFlag("active", "no_signal")).toBe(false);
    expect(showsLegacyFlag(null, "no_signal")).toBe(false);
  });
});
