import { describe, expect, it } from "vitest";

import { stageFlow } from "../stage-flow";

const input = (path: string) => ({
  stage: "onboarding_kickoff",
  intake: { path },
  owner: "Cory",
  gongReports: 1,
  hasSow: true,
  hasBrief: true,
  hasLink: true,
});

describe("Pre-kickoff on an existing account", () => {
  it("books all three core meetings, like a new logo, and has no internal prep task", () => {
    const pk = stageFlow(input("existing")).stages.find((s) => s.key === "pre_kickoff")!;
    expect(pk.tasks.map((t) => t.action)).toEqual(["reply_ae", "cadence", "book_core"]);
    expect(pk.tasks.find((t) => t.action === "book_core")!.label).toBe(
      "Book all three core meetings",
    );
  });

  it("a new logo also prepares before Stage 1; a Device Magic conversion books one call", () => {
    const nl = stageFlow(input("new_logo")).stages.find((s) => s.key === "pre_kickoff")!;
    expect(nl.tasks.map((t) => t.action)).toEqual(["reply_ae", "cadence", "prep", "book_core"]);
    const dm = stageFlow(input("dm_conversion")).stages.find((s) => s.key === "pre_kickoff")!;
    expect(dm.tasks.map((t) => t.action)).toEqual(["reply_ae", "cadence", "kickoff"]);
  });

  it("does not move to Onboarding until all three are booked", () => {
    const partly = stageFlow({
      ...input("existing"),
      intake: {
        path: "existing",
        handoff_tasks: { reply_ae: "2026-09-25T00:00:00Z", cadence: "2026-09-25T00:00:00Z" },
        timeline: {
          overrides: { kickoff: "2026-09-29" },
          times: { kickoff: "10:00" },
          timezone: "America/Chicago",
        },
      },
    });
    expect(partly.advanceTo).toBeNull();
    const all = stageFlow({
      ...input("existing"),
      intake: {
        path: "existing",
        handoff_tasks: { reply_ae: "2026-09-25T00:00:00Z", cadence: "2026-09-25T00:00:00Z" },
        timeline: {
          overrides: { kickoff: "2026-09-29", working: "2026-10-02", adjust: "2026-10-09" },
          times: { kickoff: "10:00", working: "10:00", adjust: "10:00" },
          timezone: "America/Chicago",
        },
      },
    });
    expect(all.advanceTo).toBe("in_onboarding");
  });
});
