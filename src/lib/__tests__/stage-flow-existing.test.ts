import { describe, expect, it } from "vitest";

import { isServicesOnly, readIntake } from "../intake-answers";
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
    // The handoff's two checks come first, then the pre-kickoff work.
    expect(pk.tasks.map((t) => t.action)).toEqual([
      "handoff",
      "handoff",
      "reply_ae",
      "cadence",
      "book_core",
    ]);
    expect(pk.tasks.find((t) => t.action === "book_core")!.label).toBe(
      "Book all three core meetings",
    );
  });

  it("a new logo also prepares before Stage 1; a Device Magic conversion books one call", () => {
    const nl = stageFlow(input("new_logo")).stages.find((s) => s.key === "pre_kickoff")!;
    expect(nl.tasks.map((t) => t.action)).toEqual([
      "handoff",
      "handoff",
      "reply_ae",
      "cadence",
      "prep",
      "book_core",
    ]);
    const dm = stageFlow(input("dm_conversion")).stages.find((s) => s.key === "pre_kickoff")!;
    expect(dm.tasks.map((t) => t.action)).toEqual([
      "handoff",
      "handoff",
      "reply_ae",
      "cadence",
      "kickoff",
    ]);
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
        handoff: {
          completed_at: "2026-09-22T15:00:00Z",
          customer_ready_override: { at: "2026-09-22T15:00:00Z", by: null, reason: "closing call" },
        },
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

describe("an existing account's Pre-kickoff", () => {
  it("keeps the cadence optional: it never holds the plan", () => {
    const f = stageFlow({
      stage: "onboarding_kickoff",
      intake: { path: "existing", existing: { form_final: false, builder: "us" } },
      owner: "Dana",
      gongReports: 1,
      hasSow: true,
      hasBrief: true,
      hasLink: true,
    });
    const pk = f.stages.find((s) => s.key === "pre_kickoff")!;
    expect(pk.tasks.find((t) => t.key === "cadence")!.optional).toBe(true);
  });

  it("books one walkthrough when the SOW is services only", () => {
    const intake = readIntake({
      path: "existing",
      existing: { form_final: true },
      timeline: {
        services: [{ id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 }],
      },
    });
    expect(isServicesOnly(intake)).toBe(true);
    const f = stageFlow({
      stage: "onboarding_kickoff",
      intake,
      owner: "Dana",
      gongReports: 1,
      hasSow: true,
      hasBrief: true,
      hasLink: true,
    });
    const pk = f.stages.find((s) => s.key === "pre_kickoff")!;
    expect(pk.tasks.map((t) => t.key)).toEqual([
      "handoff",
      "customer_ready",
      "reply_ae",
      "cadence",
      "kickoff",
    ]);
    expect(pk.tasks.find((t) => t.key === "kickoff")!.label).toBe("Book the services walkthrough");
    // A paid form in the SOW brings the three form meetings back.
    const withForm = readIntake({
      path: "existing",
      existing: { form_final: true },
      timeline: {
        services: [{ id: "f", kind: "paid_form", name: "Job ticket", phase: 1 }],
      },
    });
    expect(isServicesOnly(withForm)).toBe(false);
  });
});
