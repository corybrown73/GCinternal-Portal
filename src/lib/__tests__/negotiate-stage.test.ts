import { describe, expect, it } from "vitest";

import { dealStageProgress } from "../deal-stage";
import { journeyTargetForDeal } from "../journey-for-deal";
import { needsAction } from "../needs-action";
import { BUILTIN_PIPELINE_STAGES, stageAfterWon } from "../pipeline-stages";
import { isPreClose, STAGES } from "../presale-stages";
import { FLOW_STAGES, nudgesFor, stageFlow, type StageFlowInput } from "../stage-flow";

/**
 * Negotiate & Finalize: Sales brings the TIS in before the close. The stage
 * sits between Prospect and Closed Won, the Assign task opens there, and a
 * deal left without a TIS for a business day is escalated.
 */
function input(over: Partial<StageFlowInput> = {}): StageFlowInput {
  return {
    stage: "negotiate",
    intake: { path: "new_logo" },
    owner: null,
    gongReports: 0,
    hasSow: false,
    hasBrief: false,
    hasLink: false,
    ...over,
  };
}

const assign = (f: ReturnType<typeof stageFlow>) =>
  f.stages.find((s) => s.key === "closed_won")!.tasks.find((t) => t.key === "assign")!;

describe("Negotiate & Finalize", () => {
  it("sits right after Prospect, before Closed Won, and counts as pre-close", () => {
    expect(STAGES.slice(0, 3)).toEqual(["prospect", "negotiate", "closed_won"]);
    expect(BUILTIN_PIPELINE_STAGES.map((s) => s.key).slice(0, 3)).toEqual([
      "prospect",
      "negotiate",
      "closed_won",
    ]);
    expect(isPreClose("prospect")).toBe(true);
    expect(isPreClose("negotiate")).toBe(true);
    expect(isPreClose("closed_won")).toBe(false);
    expect(isPreClose(null)).toBe(false);
    // The stage after the close is unchanged.
    expect(stageAfterWon(BUILTIN_PIPELINE_STAGES)?.key).toBe("onboarding_kickoff");
  });

  it("opens the Assign task at Negotiate, keeps it locked for a bare Prospect", () => {
    expect(assign(stageFlow(input({ stage: "prospect" }))).locked).toBe(
      "Assigned at Negotiate & Finalize or Closed Won",
    );
    expect(assign(stageFlow(input())).locked).toBeNull();
    expect(assign(stageFlow(input({ owner: "Dana" }))).done).toBe(true);
    expect(assign(stageFlow(input({ stage: "closed_won" }))).locked).toBeNull();
  });

  it("shows on the rail only while the deal is there, and never auto-advances", () => {
    const at = stageFlow(input());
    expect(at.current).toBe("negotiate");
    expect(at.stages.map((s) => s.key).slice(0, 3)).toEqual([
      "prospect",
      "negotiate",
      "closed_won",
    ]);
    expect(at.stages[0]!.done).toBe(true);
    expect(at.advanceTo).toBeNull();
    const closed = stageFlow(input({ stage: "closed_won" }));
    expect(closed.stages.map((s) => s.key)).not.toContain("negotiate");
    expect(FLOW_STAGES.find((s) => s.key === "negotiate")).toMatchObject({
      stage: "negotiate",
      label: "Negotiate & Finalize",
    });
    // "Stage N of M" skips it for everyone else.
    expect(dealStageProgress("negotiate")).toEqual({ position: 2, total: 6 });
    expect(dealStageProgress("closed_won")).toEqual({ position: 2, total: 5 });
  });

  it("asks managers for a TIS after one business day without one", () => {
    const needs = nudgesFor({
      name: "Maverick",
      stage: "negotiate",
      businessDaysInStage: 1,
      enteredAt: "2026-10-01T15:00:00Z",
      flow: stageFlow(input()),
    });
    expect(needs.map((n) => [n.to, n.key, n.subject])).toEqual([
      ["managers", "negotiate@2026-10-01:needs_tis", "Needs a TIS: Maverick"],
    ]);
    expect(needs[0]!.line).toMatch(/closing call/);
    // Assigned: nothing to say, the sales cycle is not "stuck".
    expect(
      nudgesFor({
        name: "Maverick",
        stage: "negotiate",
        businessDaysInStage: 3,
        enteredAt: "2026-10-01T15:00:00Z",
        flow: stageFlow(input({ owner: "Dana" })),
      }),
    ).toEqual([]);
    // Same day: not yet.
    expect(
      nudgesFor({
        name: "Maverick",
        stage: "negotiate",
        businessDaysInStage: 0,
        enteredAt: "2026-10-01T15:00:00Z",
        flow: stageFlow(input()),
      }),
    ).toEqual([]);
  });

  it("is an act-now reason on Home, worded for the closing call", () => {
    const reasons = needsAction({
      id: "d1",
      name: "Maverick",
      stage: "negotiate",
      business_days_in_stage: 1,
      has_notes: true,
      has_sow: true,
      owner_name: null,
      core_booked: false,
      next_step: null,
      overdue_calls: [],
      watch_outs: [],
    });
    expect(reasons[0]).toMatchObject({
      bucket: "act_now",
      next: "Assign a TIS, or ask the pool to claim it",
    });
    expect(reasons[0]!.reason).toMatch(/Needs a TIS/);
    expect(reasons[0]!.reason).not.toMatch(/closed/);
  });

  it("has no journey of its own: nothing exists before the close", () => {
    const FULL = [
      "handoff",
      "plan-internal",
      "build",
      "validate-iterate",
      "launch",
      "graduate-to-cs",
    ];
    expect(journeyTargetForDeal("negotiate", "handoff", FULL)).toBeNull();
  });
});
