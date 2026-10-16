import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { kickoffConfirmPrompt, kickoffHeldPatch } from "../kickoff-held";
import { buildTimeline } from "../onboarding-timeline";
import { EMPTY_INTAKE, readIntake } from "../intake-answers";
import { showKickoffOutcomePrompt, stageFlow, type StageFlowInput } from "../stage-flow";

const ROOT = join(__dirname, "..", "..", "..");

const newLogo = {
  path: "new_logo",
  forms_built: false,
  wanted_forms: [{ id: "f1", name: "Daily job report", template_id: null }],
  handoff_tasks: { reviewed: "2026-09-22T15:00:00Z" },
};

const DEAL = "00000000-0000-4000-8000-0000000000d1";
const TODAY = "2026-10-15";

function flowAt(stage: string, intake: unknown, path = "new_logo") {
  const parsed = readIntake(intake);
  const timeline = buildTimeline({
    closeDate: "2026-09-22",
    path: path as "new_logo",
    completed: parsed.timeline.completed,
    services: [],
  });
  const over: Partial<StageFlowInput> = {
    stage,
    intake,
    owner: "Dana",
    gongReports: 1,
    hasSow: true,
    hasBrief: true,
    hasLink: true,
    timeline,
  };
  return stageFlow(over as StageFlowInput);
}

describe("the Kickoff-held write", () => {
  it("marks only the kickoff tick, keeping every other completed step and the plan's overrides", () => {
    const intake = readIntake({
      ...newLogo,
      timeline: {
        overrides: { kickoff: "2026-09-25" },
        times: { kickoff: "10:00" },
        completed: { intake_done: "2026-09-20" },
        form_proven_on: "2026-10-01",
      },
    });
    const patch = kickoffHeldPatch(intake, TODAY);
    expect(patch.completed).toEqual({ intake_done: "2026-09-20", kickoff: TODAY });
    expect(patch.overrides).toEqual({ kickoff: "2026-09-25" });
    expect(patch.times).toEqual({ kickoff: "10:00" });
    expect(patch.form_proven_on).toBe("2026-10-01");
  });

  it("is the write the confirmation sends, through the existing saveIntake action", () => {
    const source = readFileSync(join(ROOT, "src/components/kickoff-held-confirm.tsx"), "utf8");
    expect(source).toContain('import { saveIntake } from "@/lib/presale.functions";');
    expect(source).toContain("kickoffHeldPatch(intake, localIso())");
    // The component writes the record and nothing else: no separate stage call.
    expect(source).not.toMatch(/transitionStage|syncDealStage|portal_transition_stage/);
  });
});

describe("when the confirmation is offered", () => {
  it("offers it in the Kickoff focus card while Kickoff is the current stage and not yet held", () => {
    const intake = readIntake(newLogo);
    const flow = flowAt("kickoff", newLogo);
    expect(flow.current).toBe("kickoff");
    expect(flow.stages.find((s) => s.key === "kickoff")!.done).toBe(false);
    expect(kickoffConfirmPrompt(flow, "kickoff", DEAL, intake)).toEqual({ dealId: DEAL, intake });
  });

  it("does not offer it again once Kickoff is held", () => {
    const held = { ...newLogo, timeline: { completed: { kickoff: "2026-09-25" } } };
    const intake = readIntake(held);
    const flow = flowAt("kickoff", held);
    expect(flow.stages.find((s) => s.key === "kickoff")!.done).toBe(true);
    expect(kickoffConfirmPrompt(flow, "kickoff", DEAL, intake)).toBeNull();
    expect(showKickoffOutcomePrompt(flow)).toBe(false);
  });

  it("is not shown when the viewer is looking at another stage", () => {
    const intake = readIntake(newLogo);
    const flow = flowAt("kickoff", newLogo);
    expect(kickoffConfirmPrompt(flow, "get_it_working", DEAL, intake)).toBeNull();
    expect(kickoffConfirmPrompt(flow, "pre_kickoff", DEAL, intake)).toBeNull();
  });

  it("is not shown outside the Kickoff stage", () => {
    const intake = readIntake(newLogo);
    for (const stage of ["closed_won", "onboarding_kickoff", "get_it_working"]) {
      const flow = flowAt(stage, newLogo);
      expect(kickoffConfirmPrompt(flow, stage, DEAL, intake)).toBeNull();
    }
  });

  it("is never offered to a partner implementation, which has no open Kickoff task", () => {
    const partner = { ...EMPTY_INTAKE, path: "partner_implementation" as const };
    const intake = readIntake(partner);
    const flow = flowAt("kickoff", partner, "partner_implementation");
    expect(flow.stages.find((s) => s.key === "kickoff")!.done).toBe(true);
    expect(showKickoffOutcomePrompt(flow)).toBe(false);
    expect(kickoffConfirmPrompt(flow, "kickoff", DEAL, intake)).toBeNull();
  });
});

describe("confirming moves the stage through the existing sync", () => {
  it("makes Kickoff done and points the stage at Get it working, using the existing stage rules", () => {
    const intake = readIntake(newLogo);
    const confirmed = readIntake({ ...newLogo, timeline: kickoffHeldPatch(intake, TODAY) });
    const flow = flowAt("kickoff", confirmed);
    expect(flow.stages.find((s) => s.key === "kickoff")!.done).toBe(true);
    expect(flow.advanceTo).toBe("get_it_working");
  });

  it("does not move the stage before the confirmation", () => {
    const flow = flowAt("kickoff", newLogo);
    expect(flow.advanceTo).toBeNull();
  });
});

describe("a transcript does not complete Kickoff", () => {
  it("leaves the stage where it was with a transcript on file", () => {
    // Attaching a brief, a Gong report or a transcript changes none of the
    // inputs that decide Kickoff; only the Kickoff tick does.
    const withEverything = flowAt("kickoff", newLogo);
    expect(withEverything.stages.find((s) => s.key === "kickoff")!.done).toBe(false);
    expect(withEverything.advanceTo).toBeNull();
  });

  it("is enforced in the transcript code: nothing in it writes the Kickoff completion", () => {
    const files = [
      "src/components/transcript-update-panel.tsx",
      "src/lib/transcript-proposals.server.ts",
      "src/lib/transcript-analysis.server.ts",
      "src/lib/transcript-analysis.ts",
    ];
    for (const rel of files) {
      const source = readFileSync(join(ROOT, rel), "utf8");
      // Any write to the completed record, or any reference to the kickoff tick
      // being set, from the transcript code is a regression.
      expect(source, rel).not.toMatch(/completed\s*[:[]\s*[^;\n]*kickoff/);
      expect(source, rel).not.toMatch(/completedAfterTick\([^)]*kickoff/);
    }
  });
});
