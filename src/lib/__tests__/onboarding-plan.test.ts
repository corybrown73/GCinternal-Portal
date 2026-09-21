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

  it("moves a weekend close onto the next business day — day 0 is a working day", () => {
    // 2026-09-20 is a Sunday.
    const sunday = [{ to_stage: "closed_won", occurred_at: "2026-09-20T15:30:00Z" }];
    expect(
      closeDateFor({ intake: readIntake(null), stageHistory: sunday, wonStageKey: "closed_won" }),
    ).toEqual({ date: "2026-09-21", source: "stage" });
    expect(
      closeDateFor({
        intake: readIntake(null),
        stageHistory: [],
        wonStageKey: "closed_won",
        today: "2026-09-19",
      }),
    ).toEqual({ date: "2026-09-21", source: "today" });
    // A date a person set on a weekend plans from the Monday too.
    const intake = readIntake({ timeline: { close_date: "2026-09-20" } });
    expect(closeDateFor({ intake, stageHistory: [], wonStageKey: "closed_won" }).date).toBe(
      "2026-09-21",
    );
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

describe("implementationNameFor", () => {
  it("names the project by what it is, not by the customer", async () => {
    const { implementationNameFor } = await import("../presale.server");
    expect(
      implementationNameFor(
        readIntake({
          path: "new_logo",
          wanted_forms: [{ id: "f", name: "Storm Damage Assessment" }],
        }),
        "Northbridge",
      ),
    ).toBe("Storm Damage Assessment — first form");
    expect(
      implementationNameFor(
        readIntake({
          path: "new_logo",
          wanted_forms: [{ id: "f", name: "Daily Timesheet" }],
          timeline: { services: [{ id: "a", kind: "custom_pdf", name: "Invoice PDF", phase: 2 }] },
        }),
        "Northbridge",
      ),
    ).toBe("Daily Timesheet + 1 more");
    expect(
      implementationNameFor(
        readIntake({
          path: "existing",
          timeline: {
            services: [
              { id: "a", kind: "integration", name: "Kronos", phase: 2, tier: 3 },
              { id: "b", kind: "training", name: "Admin training", phase: 1 },
            ],
          },
        }),
        "Northbridge",
      ),
    ).toBe("Kronos + 1 more");
    expect(implementationNameFor(readIntake(null), "Northbridge")).toBe("Northbridge onboarding");
  });
});
