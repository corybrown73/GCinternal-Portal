import { describe, expect, it } from "vitest";

import { kickoffCorrectionFor } from "../kickoff-held";
import { buildTimeline } from "../onboarding-timeline";
import { readIntake } from "../intake-answers";
import { stageFlow, type StageFlowInput } from "../stage-flow";

/**
 * Which facts can change what unticking Kickoff does. The correction is decided
 * from the deal's intake and stage. Briefs, SOWs, owners, Gong reports, the
 * welcome link and the close date live elsewhere; these tests fail if any of
 * them starts to decide the outcome, which would need the database guard to
 * cover them too. The Complete stage's outcome is in the intake, so it is
 * covered by the whole-intake comparison.
 */
const newLogo = {
  path: "new_logo",
  forms_built: false,
  wanted_forms: [{ id: "f1", name: "Daily job report", template_id: null }],
  handoff_tasks: { reviewed: "2026-09-22T15:00:00Z" },
};
const GIW_DONE = {
  baseline_locked: "2026-10-03",
  e2e_working: "2026-10-03",
  between_1: "2026-10-03",
};
const KICKOFF = { kickoff: "2026-09-25" };

type External = Partial<
  Pick<StageFlowInput, "owner" | "gongReports" | "hasBrief" | "hasLink" | "hasSow">
>;
const EXTERNAL_VARIANTS: Array<[string, External, string]> = [
  ["the owner is cleared", { owner: null }, "2026-09-22"],
  ["there are no Gong reports", { gongReports: 0 }, "2026-09-22"],
  ["the brief is not complete", { hasBrief: false }, "2026-09-22"],
  ["the welcome link is missing", { hasLink: false }, "2026-09-22"],
  ["there is no SOW on file", { hasSow: false }, "2026-09-22"],
  ["the close date moves later", {}, "2026-10-01"],
];

function decide(
  stage: string,
  completed: Record<string, string>,
  opts: { external?: External; closeDate?: string; intake?: Record<string, unknown> } = {},
) {
  const intake = { ...newLogo, ...(opts.intake ?? {}), timeline: { completed } };
  const parsed = readIntake(intake);
  const closeDate = opts.closeDate ?? "2026-09-22";
  const timeline = buildTimeline({
    closeDate,
    path: "new_logo",
    completed: parsed.timeline.completed,
    services: [],
  });
  const flow = stageFlow({
    stage,
    intake,
    owner: "Dana",
    gongReports: 1,
    hasSow: true,
    hasBrief: true,
    hasLink: true,
    timeline,
    ...(opts.external ?? {}),
  } as StageFlowInput);
  return kickoffCorrectionFor(flow, parsed);
}

const BASELINES: Array<
  [string, string, Record<string, string>, Record<string, unknown> | undefined]
> = [
  ["automatic (Get it working, no later work)", "get_it_working", KICKOFF, undefined],
  ["automatic (still in Kickoff)", "kickoff", KICKOFF, undefined],
  [
    "confirmation (later tasks done)",
    "get_it_working",
    { ...KICKOFF, working: "2026-10-02" },
    undefined,
  ],
  ["blocked (Get it working complete)", "get_it_working", { ...KICKOFF, ...GIW_DONE }, undefined],
];

describe("what the brief, SOW, owner, Gong, link and close date cannot change", () => {
  for (const [label, stage, completed] of BASELINES) {
    it(`leaves the decision for ${label} unchanged`, () => {
      const base = decide(stage, completed);
      for (const [what, external, closeDate] of EXTERNAL_VARIANTS) {
        expect(decide(stage, completed, { external, closeDate }), what).toEqual(base);
      }
    });
  }
});

describe("what the whole intake can change", () => {
  it("is the Complete stage's outcome: no outcome is automatic, a proven outcome is blocked", () => {
    const noOutcome = decide("onboarding_complete", KICKOFF, { intake: { outcome: null } });
    expect(noOutcome).toEqual({ kind: "auto", date: "2026-09-25" });
    const proven = decide("onboarding_complete", KICKOFF, {
      intake: { outcome: { kind: "proven", reason: null, at: "2026-10-01T00:00:00Z", by: null } },
    });
    expect(proven).toEqual({ kind: "blocked", date: "2026-09-25", completedStage: "complete" });
  });
});
