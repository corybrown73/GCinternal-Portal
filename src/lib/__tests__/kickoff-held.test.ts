import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  kickoffConfirmPrompt,
  kickoffCorrectionFor,
  kickoffFocusTask,
  kickoffHeldPatch,
} from "../kickoff-held";
import { buildTimeline } from "../onboarding-timeline";
import { EMPTY_INTAKE, readIntake } from "../intake-answers";
import {
  showKickoffOutcomePrompt,
  stageFlow,
  type FlowTask,
  type StageFlowInput,
} from "../stage-flow";

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

describe("what unticking Kickoff would do", () => {
  const held = (extra: Record<string, string> = {}) => ({
    ...newLogo,
    timeline: { completed: { kickoff: "2026-09-25", ...extra } },
  });

  it("is not_held when Kickoff has not been recorded", () => {
    expect(kickoffCorrectionFor(flowAt("get_it_working", newLogo), readIntake(newLogo))).toEqual({
      kind: "not_held",
    });
  });

  it("is auto when Kickoff is held and no later work exists", () => {
    const intake = readIntake(held());
    expect(kickoffCorrectionFor(flowAt("get_it_working", held()), intake)).toEqual({
      kind: "auto",
      date: "2026-09-25",
    });
  });

  it("is auto while the deal is still in Kickoff", () => {
    const intake = readIntake(held());
    expect(kickoffCorrectionFor(flowAt("kickoff", held()), intake)).toEqual({
      kind: "auto",
      date: "2026-09-25",
    });
  });

  it("asks first when later tasks are done but no later stage is complete", () => {
    // A Make It Yours task is done while Get it working is still open: the
    // later work must be kept, so the correction asks before it returns the deal.
    const withLater = held({ working: "2026-10-02" });
    const flow = flowAt("get_it_working", withLater);
    expect(flow.stages.find((s) => s.key === "get_it_working")!.done).toBe(false);
    expect(kickoffCorrectionFor(flow, readIntake(withLater))).toEqual({
      kind: "confirm_later_work",
      date: "2026-09-25",
      laterTasksDone: 1,
    });
  });

  it("is blocked once a later stage is complete", () => {
    // Every Get it working task done: that stage is complete.
    const giw = flowAt("get_it_working", held()).stages.find((st) => st.key === "get_it_working")!;
    const marks = Object.fromEntries(giw.tasks.map((t) => [t.doneKey ?? t.key, "2026-10-03"]));
    const completedLater = held(marks);
    const flow = flowAt("get_it_working", completedLater);
    expect(flow.stages.find((s) => s.key === "get_it_working")!.done).toBe(true);
    expect(kickoffCorrectionFor(flow, readIntake(completedLater))).toEqual({
      kind: "blocked",
      date: "2026-09-25",
      completedStage: "get_it_working",
    });
  });

  it("is not_applicable to a partner implementation", () => {
    const partner = {
      ...EMPTY_INTAKE,
      path: "partner_implementation" as const,
      timeline: { completed: { kickoff: "2026-09-25" } },
    };
    const flow = flowAt("kickoff", partner, "partner_implementation");
    expect(kickoffCorrectionFor(flow, readIntake(partner))).toEqual({ kind: "not_applicable" });
  });
});

describe("the Kickoff focus card's words", () => {
  const task = (over: Partial<FlowTask> = {}): FlowTask =>
    ({
      key: "kickoff",
      label: "Stage 1 — Get it working",
      hint: "",
      done: false,
      summary: null,
      action: "tick",
      locked: null,
      doneKey: "kickoff",
      next: "Tick the Stage 1 call if it was held",
      ...over,
    }) as FlowTask;

  it("asks to book when the call is not booked", () => {
    const intake = readIntake(newLogo);
    expect(kickoffFocusTask(task(), "kickoff", intake, "2026-09-20").next).toBe(
      "Book the Kickoff call",
    );
  });

  it("names the Kickoff call and holds it while the date is ahead", () => {
    const intake = readIntake({
      ...newLogo,
      timeline: { overrides: { kickoff: "2026-09-25" }, times: { kickoff: "10:00" } },
    });
    expect(
      kickoffFocusTask(task({ date: "2026-09-25" }), "kickoff", intake, "2026-09-20").next,
    ).toMatch(/^Hold the Kickoff call \(/);
  });

  it("asks for the confirmation, not a Stage 1 tick, once the call's day has passed", () => {
    const intake = readIntake({
      ...newLogo,
      timeline: { overrides: { kickoff: "2026-09-25" }, times: { kickoff: "10:00" } },
    });
    const next = kickoffFocusTask(
      task({ date: "2026-09-25" }),
      "kickoff",
      intake,
      "2026-09-30",
    ).next;
    expect(next).toBe("Confirm Kickoff held once the call has happened, or rebook it");
    expect(next).not.toMatch(/Stage 1/);
  });

  it("leaves every other task and stage alone", () => {
    const intake = readIntake(newLogo);
    const other = task({ key: "between_1", action: "tick" });
    expect(kickoffFocusTask(other, "kickoff", intake, "2026-09-30")).toBe(other);
    expect(kickoffFocusTask(task(), "get_it_working", intake, "2026-09-30").next).toBe(
      "Tick the Stage 1 call if it was held",
    );
  });
});
