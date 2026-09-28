import { describe, expect, it } from "vitest";

import {
  dealStageFor,
  dealStageForLifecycle,
  dealStageIndex,
  dealStageLabel,
  dealStageProgress,
} from "../deal-stage";
import { FLOW_STAGES, stageFlow, type StageFlowInput } from "../stage-flow";

describe("one stage for a deal", () => {
  it("shows the deal's stage when the project has a deal", () => {
    expect(dealStageFor({ deal_stage: "in_onboarding", current_stage: "kickoff" })).toBe(
      "in_onboarding",
    );
    expect(dealStageFor({ deal_stage: "prospect", current_stage: "launch" })).toBe("prospect");
  });

  it("maps a legacy project's lifecycle to the deal stage it implies", () => {
    expect(dealStageForLifecycle("handoff")).toBe("onboarding_kickoff");
    expect(dealStageForLifecycle("build")).toBe("in_onboarding");
    expect(dealStageForLifecycle("graduate-to-cs")).toBe("onboarding_complete");
    expect(dealStageForLifecycle("closed_won")).toBeNull();
    expect(dealStageFor({ deal_stage: null, current_stage: "launch" })).toBe("in_onboarding");
    expect(dealStageFor({ deal_stage: null, current_stage: "nonsense" })).toBe(
      "onboarding_kickoff",
    );
    expect(dealStageFor({ deal_stage: "not-a-stage", current_stage: "build" })).toBe(
      "in_onboarding",
    );
  });

  it("labels from the pipeline's names first, then the built-in ones", () => {
    expect(dealStageLabel("onboarding_kickoff")).toBe("Pre-kickoff");
    expect(
      dealStageLabel("onboarding_kickoff", [{ key: "onboarding_kickoff", label: "Prep" }]),
    ).toBe("Prep");
    expect(dealStageLabel(null)).toBe("—");
    expect(dealStageLabel("mystery")).toBe("mystery");
  });

  it("sorts in pipeline order with unknowns last", () => {
    expect(dealStageIndex("prospect")).toBeLessThan(dealStageIndex("closed_won"));
    expect(dealStageIndex("onboarding_complete")).toBeLessThan(dealStageIndex("zzz"));
  });

  it("counts progress against the rail the deal actually walks", () => {
    expect(dealStageProgress("prospect")).toEqual({ position: 1, total: 5 });
    expect(dealStageProgress("in_onboarding")).toEqual({ position: 4, total: 5 });
    expect(dealStageProgress("field_fusion_setup")).toEqual({ position: 3, total: 6 });
    expect(dealStageProgress("onboarding_complete")).toEqual({ position: 5, total: 5 });
  });

  it("puts Prospect on the checklist rail with the same labels as the badge", () => {
    expect(FLOW_STAGES[0]).toMatchObject({ key: "prospect", stage: "prospect", label: "Prospect" });
    for (const s of FLOW_STAGES) expect(dealStageLabel(s.stage)).toBeTruthy();
  });
});

describe("a prospect's checklist", () => {
  const input: StageFlowInput = {
    stage: "prospect",
    intake: { path: "new_logo" },
    owner: null,
    gongReports: 0,
    hasSow: false,
    hasBrief: false,
    hasLink: false,
  };

  it("is on Prospect, with the Closed Won tasks unlocked except assigning", () => {
    const f = stageFlow(input);
    expect(f.current).toBe("prospect");
    expect(f.stages.map((s) => s.key)).toEqual([
      "prospect",
      "closed_won",
      "pre_kickoff",
      "onboarding",
      "complete",
    ]);
    expect(f.stages[0]!.done).toBe(false);
    const cw = f.stages.find((s) => s.key === "closed_won")!;
    expect(cw.tasks.find((t) => t.key === "assign")!.locked).toMatch(/Closed Won/);
    expect(cw.tasks.filter((t) => !t.locked).length).toBeGreaterThan(0);
    expect(f.advanceTo).toBeNull();
  });

  it("marks Prospect done once the deal is closed", () => {
    expect(stageFlow({ ...input, stage: "closed_won" }).stages[0]!.done).toBe(true);
  });
});
