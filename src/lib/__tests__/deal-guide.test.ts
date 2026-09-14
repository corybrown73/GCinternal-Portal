import { describe, expect, it } from "vitest";

import { guideSteps } from "../deal-guide";

const history = [{ to_stage: "closed_won", occurred_at: "2026-09-09T15:00:00Z" }];

describe("guideSteps", () => {
  it("starts at the path and points at one next thing", () => {
    const steps = guideSteps({
      intake: null,
      gongReports: 0,
      aiBriefs: 0,
      hasSow: false,
      shareUrl: null,
      stageHistory: history,
      wonStageKey: "closed_won",
    });
    expect(steps.map((s) => s.done)).toEqual([false, false, false, false, false, false, false]);
    expect(steps[0]!.key).toBe("path");
    expect(steps[0]!.panel.id).toBe("panel-intake");
  });

  it("ticks steps off the record, never by hand", () => {
    const steps = guideSteps({
      intake: {
        path: "existing",
        forms_built: true,
        uploaded_forms: [{ path: "p", name: "Haul.pdf", uploaded_at: "2026-09-09" }],
        timeline: {
          services: [
            { id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 },
          ],
          times: { kickoff: "10:00", working: "14:30" },
          timezone: "America/Chicago",
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

  it("leaves the SOW step open until the services are on the plan", () => {
    const steps = guideSteps({
      intake: { timeline: { services: [] } },
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
