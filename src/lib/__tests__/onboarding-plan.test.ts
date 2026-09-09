import { describe, expect, it } from "vitest";

import { readIntake } from "../intake-answers";
import { closeDateFor, timelineFor } from "../onboarding-plan";

/** The close date decides every other date, so where it comes from is pinned. */
describe("closeDateFor", () => {
  const history = [
    { to_stage: "prospect", occurred_at: "2026-08-01T10:00:00Z" },
    { to_stage: "closed_won", occurred_at: "2026-09-09T15:30:00Z" },
    { to_stage: "onboarding_kickoff", occurred_at: "2026-09-10T09:00:00Z" },
  ];

  it("uses the day the deal entered the won stage", () => {
    const r = closeDateFor({
      intake: readIntake(null),
      stageHistory: history,
      wonStageKey: "closed_won",
    });
    expect(r).toEqual({ date: "2026-09-09", source: "stage" });
  });

  it("lets a date set by hand win over the stage history", () => {
    const intake = readIntake({ timeline: { close_date: "2026-09-14" } });
    const r = closeDateFor({ intake, stageHistory: history, wonStageKey: "closed_won" });
    expect(r).toEqual({ date: "2026-09-14", source: "intake" });
  });

  it("takes the first of several won transitions, not the latest re-delivery", () => {
    const twice = [...history, { to_stage: "closed_won", occurred_at: "2026-09-20T15:30:00Z" }];
    expect(
      closeDateFor({ intake: readIntake(null), stageHistory: twice, wonStageKey: "closed_won" })
        .date,
    ).toBe("2026-09-09");
  });

  it("plans from today when the deal has not closed", () => {
    const r = closeDateFor({
      intake: readIntake(null),
      stageHistory: history.slice(0, 1),
      wonStageKey: "closed_won",
      today: "2026-09-30",
    });
    expect(r).toEqual({ date: "2026-09-30", source: "today" });
  });
});

describe("timelineFor", () => {
  it("applies every knob on the intake", () => {
    const intake = readIntake({
      timeline: {
        overrides: { working: "2026-09-16" },
        holidays: ["2026-09-10"],
        integration_tier: 2,
        integration_target: "Dropbox",
      },
    });
    const t = timelineFor(intake, "2026-09-09");
    // The holiday pushes the kickoff to Friday; the override still wins for the working session.
    expect(t.milestones.find((m) => m.key === "kickoff")!.date).toBe("2026-09-11");
    expect(t.milestones.find((m) => m.key === "working")!.date).toBe("2026-09-16");
    expect(t.integration.target).toBe("Dropbox");
    expect(t.integration.weeks).toBe(1);
  });
});
