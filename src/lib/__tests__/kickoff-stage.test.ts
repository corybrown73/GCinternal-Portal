import { describe, expect, it } from "vitest";

import { buildTimeline } from "../onboarding-timeline";
import { dealStageForLifecycle } from "../deal-stage";
import { readIntake } from "../intake-answers";
import { journeyBandForDeal, journeyTargetForDeal } from "../journey-for-deal";
import { isOnboardingStage, isStage, STAGE_LABELS, STAGES } from "../presale-stages";
import { FLOW_STAGES, stageFlow, type StageFlowInput } from "../stage-flow";

/**
 * PR 2: Kickoff gets its own stage — AccountStage "kickoff", FlowStageKey
 * "kickoff" — between Pre-Kickoff and Get it working. These pin the five
 * properties the split must hold, plus the lifecycle.ts/presale-stages.ts
 * interaction this PR touches without resolving.
 */

const ready = {
  path: "new_logo",
  forms_built: false,
  wanted_forms: [{ id: "f1", name: "Daily job report", template_id: null }],
  handoff_tasks: { reviewed: "2026-09-22T15:00:00Z" },
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

const bookedIntake = {
  ...ready,
  handoff: {
    completed_at: "2026-09-22T15:00:00Z",
    customer_ready_override: { at: "2026-09-22T15:00:00Z", by: null, reason: "closing call" },
  },
  handoff_tasks: {
    reviewed: "2026-09-22T15:00:00Z",
    reply_ae: "2026-09-22T15:00:00Z",
    cadence: "2026-09-22T15:05:00Z",
    prep_process: "x",
    prep_form: "x",
    prep_data: "x",
  },
  timeline: {
    overrides: { kickoff: "2026-09-25", working: "2026-09-29", adjust: "2026-10-07" },
    times: { kickoff: "10:00", working: "10:00", adjust: "14:00" },
  },
};

describe("Kickoff as its own stage", () => {
  it("keeps a deal at Pre-Kickoff until the call is booked", () => {
    const unbooked = stageFlow(input({ stage: "onboarding_kickoff", intake: ready }));
    expect(unbooked.current).toBe("pre_kickoff");
    expect(unbooked.advanceTo).toBeNull();
  });

  it("moves a booked, not-yet-held call into Kickoff — its own stage, not Get it working", () => {
    const booked = stageFlow(input({ stage: "onboarding_kickoff", intake: bookedIntake }));
    expect(booked.advanceTo).toBe("kickoff");
    const kickoff = booked.stages.find((s) => s.key === "kickoff")!;
    expect(kickoff.done).toBe(false);
  });

  it("does not advance a deal already sitting in Kickoff until the call is held", () => {
    // No StageFlowInput.timeline (no plan object): the Kickoff stage has
    // nothing to judge it by, so it is not vacuously passed through.
    const f = stageFlow(input({ stage: "kickoff", intake: bookedIntake }));
    expect(f.current).toBe("kickoff");
    expect(f.advanceTo).toBeNull();
  });

  it("reaches Get it working, and the rest of the rail, once Kickoff is held", () => {
    const intake = readIntake({
      ...ready,
      timeline: { completed: { kickoff: "2026-09-25" } },
    });
    const timeline = buildTimeline({
      closeDate: "2026-09-22",
      path: "new_logo",
      completed: intake.timeline.completed,
      services: [],
    });
    const f = stageFlow(input({ stage: "kickoff", intake, timeline }));
    expect(f.current).toBe("kickoff");
    expect(f.stages.find((s) => s.key === "kickoff")!.done).toBe(true);
    expect(f.advanceTo).toBe("get_it_working");

    // Post-Kickoff progression still reaches every existing stage after it,
    // all the way to Implementation Complete, once each gate is met.
    const allTicked = Object.fromEntries(
      f.stages
        .flatMap((s) => s.tasks)
        .filter((t) => t.doneKey && !t.optional)
        .map((t) => [t.doneKey!, "2026-10-14"]),
    );
    const doneIntake = readIntake({ ...ready, timeline: { completed: allTicked } });
    const doneTimeline = buildTimeline({
      closeDate: "2026-09-22",
      path: "new_logo",
      completed: allTicked,
      services: [],
    });
    const done = stageFlow(
      input({ stage: "get_it_working", intake: doneIntake, timeline: doneTimeline }),
    );
    for (const k of ["get_it_working", "make_it_yours", "make_it_run"]) {
      expect(done.stages.find((s) => s.key === k)!.done, k).toBe(true);
    }
    expect(done.advanceTo).toBe("onboarding_complete");
  });

  it("holds the same truth for every caller — stageFlow takes no role or viewer parameter", () => {
    // The input shape itself has no role/viewer field: stage truth cannot
    // vary by who is asking, because nothing here lets it.
    const a = stageFlow(input({ stage: "kickoff", intake: bookedIntake }));
    const b = stageFlow(input({ stage: "kickoff", intake: bookedIntake }));
    expect(a).toEqual(b);
  });

  it("is deterministic: the same facts always produce the same transition", () => {
    const runs = Array.from(
      { length: 5 },
      () => stageFlow(input({ stage: "onboarding_kickoff", intake: bookedIntake })).advanceTo,
    );
    expect(new Set(runs).size).toBe(1);
    expect(runs[0]).toBe("kickoff");
  });
});

describe("audit: the current lifecycle.ts / presale-stages.ts disagreement, pinned (not resolved)", () => {
  it("kickoff is a real AccountStage, counted as onboarding in progress", () => {
    expect(STAGES).toContain("kickoff");
    expect(isStage("kickoff")).toBe(true);
    expect(STAGE_LABELS.kickoff).toBe("Kickoff");
    expect(isOnboardingStage("kickoff")).toBe(true);
  });

  it("sits on the checklist rail between Pre-Kickoff and Get it working", () => {
    const pre = FLOW_STAGES.findIndex((s) => s.key === "pre_kickoff");
    const kickoff = FLOW_STAGES.findIndex((s) => s.key === "kickoff");
    const giw = FLOW_STAGES.findIndex((s) => s.key === "get_it_working");
    expect(kickoff).toBe(pre + 1);
    expect(giw).toBe(kickoff + 1);
    expect(FLOW_STAGES[kickoff]).toMatchObject({ stage: "kickoff", label: "Kickoff" });
  });

  it("a legacy project's lifecycle-implied stage never produces kickoff — dealStageForLifecycle is untouched by this PR", () => {
    // lifecycle.ts's own stage order and ids are a separate taxonomy this PR
    // does not resolve. Its bridge back to AccountStage still only ever
    // names the stages it always has.
    for (const id of [
      "handoff",
      "plan-internal",
      "align-external",
      "build",
      "validate-iterate",
      "launch",
      "adopt",
      "graduate-to-cs",
    ]) {
      expect(dealStageForLifecycle(id)).not.toBe("kickoff");
    }
  });

  it("the lifecycle journey band for kickoff deliberately mirrors onboarding_kickoff's, not the lifecycle's own (differently-ordered) Kickoff stage", () => {
    const order = [
      "handoff",
      "plan-internal",
      "align-external",
      "build",
      "validate-iterate",
      "launch",
      "adopt",
      "graduate-to-cs",
    ];
    expect(journeyBandForDeal("kickoff", order)).toEqual(
      journeyBandForDeal("onboarding_kickoff", order),
    );
    expect(journeyTargetForDeal("kickoff", "handoff", order)).toBeNull();
  });
});
