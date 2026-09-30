import { describe, expect, it } from "vitest";

import { readIntake } from "../intake-answers";
import { timelineFor } from "../onboarding-plan";
import { relativeGoLive, watchOutsFor } from "../watch-outs";

/**
 * "Go-live in two weeks", said on a call, is a date: two weeks from the
 * call. The plan's finish line is compared with it like any other deadline.
 */
describe("a relative go-live in the calls", () => {
  it("is read as a day counted from the call", () => {
    expect(relativeGoLive("They want to go-live in 2 weeks.", "2026-09-18")).toEqual({
      iso: "2026-10-02",
      said: "2 weeks",
    });
    expect(relativeGoLive("Hoping to be live within a month", "2026-09-18")?.iso).toBe(
      "2026-10-18",
    );
    expect(relativeGoLive("We launched in 2019 with a different vendor", "2026-09-18")).toBeNull();
    expect(relativeGoLive("Nothing about timing here.", "2026-09-18")).toBeNull();
  });

  it("is a conflict when the plan goes live later than what they said", () => {
    const intake = readIntake({ path: "new_logo" });
    const t = timelineFor(intake, "2026-09-18");
    const rows = watchOutsFor({
      brief: { dates: [] },
      notes: [
        { text: "Kathy said they need to go-live in 2 weeks for the season.", date: "2026-09-18" },
      ],
      intake,
      timeline: t,
    });
    const hit = rows.find((r) => r.key.startsWith("golive-rel"));
    expect(hit?.severity).toBe("conflict");
    expect(hit?.title).toContain("live in 2 weeks");
    expect(hit?.quote).toContain("go-live in 2 weeks");
  });

  it("counts from the close when the note has no call date, and says so", () => {
    const intake = readIntake({ path: "new_logo" });
    const t = timelineFor(intake, "2026-09-18");
    const rows = watchOutsFor({
      brief: null,
      notes: ["They expect to be up and running in two weeks."],
      intake,
      timeline: t,
    });
    const hit = rows.find((r) => r.key.startsWith("golive-rel"));
    expect(hit?.severity).toBe("conflict");
    expect(hit?.detail).toContain("counted from the close");
  });
});
