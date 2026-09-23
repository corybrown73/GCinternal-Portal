import { describe, expect, it } from "vitest";

import { readIntake } from "../intake-answers";
import { buildTimeline } from "../onboarding-timeline";
import { stageFlow, type StageFlowInput } from "../stage-flow";

const ready = {
  path: "new_logo",
  forms_built: false,
  wanted_forms: [{ id: "f1", name: "Daily job report", template_id: null }],
};

function input(over: Partial<StageFlowInput> = {}): StageFlowInput {
  return {
    stage: "closed_won",
    intake: ready,
    owner: "Dana",
    gongReports: 1,
    hasSow: true,
    hasBrief: true,
    hasLink: true,
    ...over,
  };
}

describe("the stage checklist", () => {
  it("keeps a closed deal in Closed Won until every task is done", () => {
    const f = stageFlow(input({ owner: null }));
    expect(f.current).toBe("closed_won");
    expect(f.advanceTo).toBeNull();
    expect(f.stages[0]!.tasks.find((t) => t.key === "assign")!.done).toBe(false);
  });

  it("moves to Pre-kickoff once the welcome brief is generated", () => {
    expect(stageFlow(input()).advanceTo).toBe("onboarding_kickoff");
    expect(stageFlow(input({ hasLink: false })).advanceTo).toBeNull();
  });

  it("locks the brief until the recording, the SOW and the flow are in, and names what is missing", () => {
    const f = stageFlow(input({ gongReports: 0, hasSow: false, intake: {} }));
    const gen = f.stages[0]!.tasks.find((t) => t.key === "generate")!;
    expect(gen.locked).toBe("Needs the Gong recording, the SOW and the flow first");
  });

  it("counts no SOW as answered", () => {
    const f = stageFlow(input({ hasSow: false, intake: { ...ready, has_sow: false } }));
    expect(f.stages[0]!.tasks.find((t) => t.key === "sow")!.done).toBe(true);
  });

  it("moves Pre-kickoff to Onboarding when the AE reply, the cadence and the booked kickoff are all in", () => {
    const base = {
      ...ready,
      handoff_tasks: { reply_ae: "2026-09-22T15:00:00Z", cadence: "2026-09-22T15:05:00Z" },
    };
    expect(stageFlow(input({ stage: "onboarding_kickoff", intake: base })).advanceTo).toBeNull();
    const booked = {
      ...base,
      timeline: { overrides: { kickoff: "2026-09-25" }, times: { kickoff: "10:00" } },
    };
    expect(stageFlow(input({ stage: "onboarding_kickoff", intake: booked })).advanceTo).toBe(
      "in_onboarding",
    );
    // Everything done at once skips straight through.
    expect(stageFlow(input({ intake: booked })).advanceTo).toBe("in_onboarding");
  });

  it("never moves a deal back or on from Onboarding by itself", () => {
    expect(stageFlow(input({ stage: "in_onboarding" })).advanceTo).toBeNull();
    expect(stageFlow(input({ stage: "prospect" })).advanceTo).toBeNull();
    // Nothing to assign before the close makes the project.
    const pre = stageFlow(input({ stage: "prospect", owner: null }));
    expect(pre.stages[0]!.tasks[0]!.locked).toMatch(/Closed Won/);
    expect(stageFlow(input({ stage: "field_fusion_setup" })).advanceTo).toBeNull();
  });

  it("lists the three training days, the form, the field test, the first process and each SOW service", () => {
    const intake = readIntake({
      ...ready,
      timeline: {
        completed: { kickoff: "2026-09-24" },
        services: [{ id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 }],
      },
    });
    const t = buildTimeline({
      closeDate: "2026-09-22",
      path: "new_logo",
      completed: intake.timeline.completed,
      services: intake.timeline.services as never,
    });
    const f = stageFlow(input({ stage: "in_onboarding", intake, timeline: t }));
    const tasks = f.stages.find((s) => s.key === "onboarding")!.tasks;
    expect(tasks.map((x) => x.key)).toEqual([
      "kickoff",
      "working",
      "form_built",
      "fieldtest",
      "adjust",
      "live",
      "svc:qb",
    ]);
    expect(tasks[0]!.done).toBe(true);
    expect(tasks[0]!.label).toMatch(/Training day 1/);
    expect(tasks.at(-1)!.label).toBe("QuickBooks Online complete");
  });

  it("skips the form task on a training plan", () => {
    const intake = readIntake({ path: "field_fusion" });
    const t = buildTimeline({ closeDate: "2026-09-22", path: "field_fusion" });
    const f = stageFlow(input({ stage: "in_onboarding", intake, timeline: t }));
    const keys = f.stages.find((s) => s.key === "onboarding")!.tasks.map((x) => x.key);
    expect(keys).not.toContain("form_built");
  });
});

describe("the new-logo plan", () => {
  it("is three sixty-minute training days, first form live fifteen business days from the close", () => {
    const t = buildTimeline({ closeDate: "2026-09-22", path: "new_logo" });
    const calls = t.milestones.filter((m) => m.kind === "call");
    expect(calls.map((c) => c.minutes)).toEqual([60, 60, 60]);
    expect(calls.map((c) => c.label)).toEqual([
      expect.stringMatching(/^Training day 1/),
      expect.stringMatching(/^Training day 2/),
      expect.stringMatching(/^Training day 3/),
    ]);
    // Tue 22 Sep + 15 business days = Tue 13 Oct.
    expect(t.liveDate).toBe("2026-10-13");
  });
});
