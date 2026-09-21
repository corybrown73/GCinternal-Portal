import { describe, expect, it } from "vitest";

import { guideSteps } from "../deal-guide";

const history = [{ to_stage: "closed_won", occurred_at: "2026-09-09T15:00:00Z" }];

describe("guideSteps", () => {
  it("starts with the notes and points at one next thing", () => {
    const steps = guideSteps({
      intake: null,
      gongReports: 0,
      aiBriefs: 0,
      hasSow: false,
      shareUrl: null,
      stageHistory: history,
      wonStageKey: "closed_won",
    });
    expect(steps.map((s) => s.done)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(steps.map((s) => s.key)).toEqual([
      "gong",
      "synth",
      "paper",
      "intake",
      "path",
      "sow",
      "times",
      "share",
    ]);
    expect(steps[0]!.panel.id).toBe("panel-intake");
  });

  it("ticks steps off the record, never by hand", () => {
    const steps = guideSteps({
      intake: {
        path: "existing",
        solutions_involved: true,
        has_sow: true,
        industry: "Roofing",
        field_users: 12,
        current_process: "Paper tickets",
        existing: { form_final: true },
        forms_built: true,
        uploaded_forms: [{ path: "p", name: "Haul.pdf", uploaded_at: "2026-09-09" }],
        welcome_shared_at: "2026-09-10T15:00:00Z",
        timeline: {
          services: [
            { id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 },
          ],
          times: { kickoff: "10:00", working: "14:30" },
          timezone: "America/Chicago",
          sow_applied_at: "2026-09-10T15:00:00Z",
        },
      },
      gongReports: 2,
      aiBriefs: 1,
      hasSow: true,
      shareUrl: "https://example.com/welcome/x",
      stageHistory: history,
      wonStageKey: "closed_won",
    });
    expect(steps.every((s) => s.done)).toBe(true);
  });

  it("leaves the SOW step open until the plan has actually read the SOW", () => {
    const steps = guideSteps({
      intake: {
        timeline: {
          services: [{ id: "x", kind: "paid_form", name: "Timesheet", phase: 1 }],
        },
      },
      gongReports: 1,
      aiBriefs: 0,
      hasSow: true,
      shareUrl: null,
      stageHistory: history,
      wonStageKey: "closed_won",
    });
    expect(steps.find((s) => s.key === "sow")!.done).toBe(false);
  });
});

describe("guideSteps · the share step and the page's readiness", () => {
  it("does not tick the share step while the welcome page still has blanks", () => {
    const steps = guideSteps({
      intake: { path: "new_logo" },
      gongReports: 0,
      aiBriefs: 0,
      hasSow: false,
      shareUrl: "https://example.com/welcome/x",
      stageHistory: history,
      wonStageKey: "closed_won",
      readiness: [
        { key: "industry", label: "Industry" },
        { key: "tester", label: "Their field tester" },
      ],
    });
    const share = steps.find((s) => s.key === "share")!;
    expect(share.done).toBe(false);
    // Even with no blanks, a link that exists but was never copied or opened
    // is not "sent".
    const quiet = guideSteps({
      intake: { path: "new_logo" },
      gongReports: 0,
      aiBriefs: 0,
      hasSow: false,
      shareUrl: "https://example.com/welcome/x",
      stageHistory: history,
      wonStageKey: "closed_won",
      readiness: [],
    });
    expect(quiet.find((s) => s.key === "share")!.done).toBe(false);
    expect(share.blockers.map((b) => b.label)).toEqual(["Industry", "Their field tester"]);
    expect(steps.filter((s) => s.key !== "share").every((s) => s.blockers.length === 0)).toBe(true);
  });
});
