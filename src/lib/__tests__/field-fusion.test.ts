import { describe, expect, it } from "vitest";

import { fieldFusionChecklist, fieldFusionReady } from "../field-fusion";
import { mentionsFieldFusion, prefillFromSynthesis } from "../intake-prefill";
import { EMPTY_INTAKE, intakeStatus, isTrainingOnly, readIntake } from "../intake-answers";
import {
  buildTimeline,
  DM_CONVERSION_PLAN,
  isTrainingPlan,
  planFor,
  SEVEN_DAY_PLAN,
  TRAINING_PLAN,
} from "../onboarding-timeline";
import { timelineFor } from "../onboarding-plan";
import { deliverablesFor } from "../deliverables";

describe("the training plan — no form to build", () => {
  it("keeps the seven-day keys so every screen and every date still works", () => {
    expect(TRAINING_PLAN.map((m) => m.key)).toEqual(SEVEN_DAY_PLAN.map((m) => m.key));
    expect(TRAINING_PLAN[TRAINING_PLAN.length - 1]!.day).toBe(10);
  });

  it("is what a Field Fusion account gets, and what any account gets when training only", () => {
    expect(isTrainingPlan("field_fusion")).toBe(true);
    expect(isTrainingPlan("new_logo", true)).toBe(true);
    expect(isTrainingPlan("existing", true)).toBe(true);
    expect(isTrainingPlan("new_logo", false)).toBe(false);
    expect(planFor("field_fusion")).toBe(TRAINING_PLAN);
    expect(planFor("new_logo", true)).toBe(TRAINING_PLAN);
    expect(planFor("new_logo")).toBe(SEVEN_DAY_PLAN);
  });

  it("is three thirty-minute calls over two weeks, and a crew that is live, not a form", () => {
    const calls = TRAINING_PLAN.filter((m) => m.kind === "call");
    expect(calls).toHaveLength(3);
    expect(calls.map((m) => m.minutes)).toEqual([30, 30, 30]);
    expect(calls.map((m) => m.day)).toEqual([1, 5, 10]);
    const kickoff = TRAINING_PLAN.find((m) => m.key === "kickoff")!;
    expect(kickoff.label).toMatch(/training call/i);
    expect(kickoff.homework).toHaveLength(3);
    const live = TRAINING_PLAN[TRAINING_PLAN.length - 1]!;
    expect(live.label).toMatch(/crew/i);
    expect(live.label).not.toMatch(/form/i);
  });

  it("flows through the timeline and flags it as training", () => {
    const t = buildTimeline({ closeDate: "2026-09-21", path: "field_fusion" });
    expect(t.training).toBe(true);
    expect(t.milestones[1]!.label).toMatch(/^Training call 1/);
    // Ten business days from a Monday close: the Monday two weeks on.
    expect(t.liveDate).toBe("2026-10-05");
    const t2 = buildTimeline({ closeDate: "2026-09-21", path: "new_logo", trainingOnly: true });
    expect(t2.training).toBe(true);
    expect(buildTimeline({ closeDate: "2026-09-21", path: "new_logo" }).training).toBe(false);
  });

  it("a Device Magic conversion takes its own plan on the timeline, not the new-logo one", () => {
    const t = buildTimeline({ closeDate: "2026-09-21", path: "dm_conversion" });
    expect(t.path).toBe("dm_conversion");
    expect(t.milestones[1]!.label).toBe(DM_CONVERSION_PLAN[1]!.label);
  });

  it("the phase-1 tile is the training, with the training mark", () => {
    const intake = readIntake({ path: "new_logo", training_only: true });
    const t = timelineFor(intake, "2026-09-21");
    const first = deliverablesFor(intake, t)[0]!;
    expect(first.id).toBe("form");
    expect(first.kind).toBe("training");
    expect(first.label).toBe("Crew training");
    const ff = readIntake({ path: "field_fusion" });
    expect(deliverablesFor(ff, timelineFor(ff, "2026-09-21"))[0]!.label).toBe(
      "Field Fusion training",
    );
  });
});

describe("the intake, training only", () => {
  it("skips the forms question and asks who they are", () => {
    expect(isTrainingOnly(EMPTY_INTAKE)).toBe(false);
    expect(isTrainingOnly(readIntake({ path: "field_fusion" }))).toBe(true);
    expect(isTrainingOnly(readIntake({ training_only: true }))).toBe(true);
    const s = intakeStatus(readIntake({ path: "field_fusion" }));
    expect(s.done).toBe(false);
    expect(s.next).toMatch(/industry/);
    const done = intakeStatus(
      readIntake({
        path: "new_logo",
        training_only: true,
        industry: "Roofing",
        field_users: 12,
        current_process: "Paper",
      }),
    );
    expect(done.done).toBe(true);
  });

  it("the Field Fusion gate: two ticks, then ready", () => {
    const a = readIntake({ path: "field_fusion" });
    expect(fieldFusionChecklist(a).map((c) => c.done)).toEqual([false, false]);
    expect(fieldFusionReady(a)).toBe(false);
    const b = readIntake({
      path: "field_fusion",
      field_fusion: { ffiq_confirmed: true, account_ready: true, notes: "Train Ray first" },
    });
    expect(fieldFusionReady(b)).toBe(true);
    expect(b.field_fusion.notes).toBe("Train Ray first");
    expect(b.field_fusion.handed_off_at).toBeNull();
  });
});

describe("reading Field Fusion out of the calls", () => {
  it("names the product, or its FFIQ setup — not a stray word", () => {
    expect(mentionsFieldFusion("They bought Field Fusion for the pipeline crews.")).toBe(true);
    expect(mentionsFieldFusion("FieldFusion + 40 seats")).toBe(true);
    expect(mentionsFieldFusion("Liesl to confirm the FFIQ setup Monday.")).toBe(true);
    expect(mentionsFieldFusion("A fusion of paper and spreadsheets in the field.")).toBe(false);
  });

  it("sets the path from the notes, and wins over a Device Magic mention", () => {
    const brief = {
      account_name: "Acme",
      one_liner: "",
      account: { industry: null, company_size: null, field_users: null, website: null },
      current_process: [],
      goals: [],
      what_we_know: [],
      stakeholders: [],
      risks_open_items: [],
      discovery_questions: [],
      process_gaps: [],
    };
    const { patch, filled } = prefillFromSynthesis(
      EMPTY_INTAKE,
      brief as never,
      "Moving off Device Magic; they bought Field Fusion and Liesl is setting up FFIQ.",
    );
    expect(patch.path).toBe("field_fusion");
    expect(filled.join(" ")).toMatch(/Field Fusion/);
  });
});
