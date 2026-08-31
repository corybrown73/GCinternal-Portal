import { describe, expect, it } from "vitest";

import {
  advanceLabel,
  gateOutcome,
  overridePrompt,
  requiresReason,
  gateSummary,
  isSettled,
  needsOverride,
  stageGateStatus,
  type GateItem,
} from "../stage-gates";

const item = (over: Partial<GateItem> = {}): GateItem => ({
  id: crypto.randomUUID(),
  task_key: "nl.example",
  title: "Do the thing",
  status: "not_started",
  is_gate: true,
  party: "internal",
  ...over,
});

describe("isSettled", () => {
  it("counts done and skipped, and nothing else", () => {
    expect(isSettled("done")).toBe(true);
    // A criterion somebody deliberately marked not-applicable is settled. The
    // alternative is a project permanently unable to leave a stage because one
    // gate does not apply to it.
    expect(isSettled("skipped")).toBe(true);
    for (const s of ["not_started", "in_progress", "waiting", "blocked"]) {
      expect(isSettled(s)).toBe(false);
    }
  });
});

describe("stageGateStatus", () => {
  it("ignores non-gate work items entirely", () => {
    const s = stageGateStatus([
      item({ status: "done" }),
      item({ is_gate: false, status: "not_started" }),
      item({ is_gate: false, status: "not_started" }),
    ]);
    expect(s.total).toBe(1);
    expect(s.ready).toBe(true);
  });

  it("is not ready while any gate is outstanding", () => {
    const s = stageGateStatus([
      item({ status: "done" }),
      item({ status: "done" }),
      item({ status: "in_progress", title: "Sign off the plan" }),
    ]);
    expect(s.done).toBe(2);
    expect(s.total).toBe(3);
    expect(s.ready).toBe(false);
    expect(s.remaining.map((r) => r.title)).toEqual(["Sign off the plan"]);
  });

  it("reports a stage with no gates as ungated, not as ready", () => {
    // These are different facts and the UI says different things about them.
    // Collapsing them would tell somebody "all criteria complete" about a stage
    // that has none, which is a confident wrong answer.
    const s = stageGateStatus([item({ is_gate: false })]);
    expect(s.ungated).toBe(true);
    expect(s.ready).toBe(true);
    expect(gateSummary(s)).toBe("No core criteria defined for this stage");
  });

  it("treats an empty stage as ungated", () => {
    expect(stageGateStatus([]).ungated).toBe(true);
  });
});

describe("gateSummary", () => {
  it("names the single outstanding criterion rather than counting", () => {
    const s = stageGateStatus([
      item({ status: "done" }),
      item({ status: "done" }),
      item({ status: "waiting", title: "Provide the crew and user list" }),
    ]);
    expect(gateSummary(s)).toBe("Waiting on: Provide the crew and user list");
  });

  it("counts once there is more than one, since naming them all is unreadable", () => {
    const s = stageGateStatus([
      item({ status: "done" }),
      item({ status: "not_started" }),
      item({ status: "not_started" }),
    ]);
    expect(gateSummary(s)).toBe("1 of 3 complete — waiting on 2 criteria");
  });

  it("confirms completion with the count, so the number is visible before advancing", () => {
    const s = stageGateStatus([item({ status: "done" }), item({ status: "skipped" })]);
    expect(gateSummary(s)).toBe("All 2 core criteria complete");
  });
});

describe("gateOutcome / needsOverride / requiresReason", () => {
  const incomplete = stageGateStatus([item({ status: "done" }), item({ status: "not_started" })]);
  const complete = stageGateStatus([item({ status: "done" })]);

  it("lets an advisory stage through with a gap, and marks it as an override", () => {
    // The app records what happened rather than refusing to let people describe
    // reality. Somebody who really did launch without training the crews must
    // be able to say so — they just should not do it by accident.
    expect(gateOutcome(incomplete, "advisory")).toBe("advisory_gap");
    expect(needsOverride(incomplete, "advisory")).toBe(true);
    expect(requiresReason(incomplete, "advisory")).toBe(false);
  });

  // THIS REVERSES AN EARLIER DECISION, deliberately. A blocking stage used to
  // be a dead end: canAdvance said no and needsOverride ALSO said no, because
  // it read `gateMode !== "blocking"`. So there was no override path at all —
  // the panel rendered a permanently disabled button. That was survivable only
  // because one stage in one template was blocking and nothing had reached it;
  // promoting Handoff would have hard-locked every new project at its first
  // stage. A gate nobody can pass stops being a gate and becomes a wall.
  it("lets a blocking stage through only with a stated reason", () => {
    expect(gateOutcome(incomplete, "blocking")).toBe("blocking_gap");
    expect(needsOverride(incomplete, "blocking")).toBe(true);
    expect(requiresReason(incomplete, "blocking")).toBe(true);
  });

  it("needs no override once the gates are met, whatever the mode", () => {
    for (const mode of ["advisory", "warn", "blocking", null, undefined]) {
      expect(gateOutcome(complete, mode)).toBe("clear");
      expect(needsOverride(complete, mode)).toBe(false);
      expect(requiresReason(complete, mode)).toBe(false);
    }
  });

  it("never blocks a stage that has no criteria at all", () => {
    // A stage nobody has defined criteria for must not become an unexplainable
    // dead end just because its mode happens to be 'blocking'.
    const ungated = stageGateStatus([]);
    expect(gateOutcome(ungated, "blocking")).toBe("clear");
    expect(needsOverride(ungated, "blocking")).toBe(false);
  });
});

describe("advanceLabel", () => {
  // "Move to Build" and "Override to advance" are different acts and must not
  // share a word — the label is the last thing read before the click.
  it("names the act, not just the destination", () => {
    expect(advanceLabel("clear", "Build")).toBe("Move to Build");
    expect(advanceLabel("advisory_gap", "Build")).toBe("Advance anyway");
    expect(advanceLabel("blocking_gap", "Build")).toBe("Override to advance");
  });
});

describe("overridePrompt", () => {
  const two = stageGateStatus([
    item({ status: "not_started", title: "Confirm scope against the signed SOW" }),
    item({ status: "not_started", title: "Confirm the champion and the decision maker" }),
  ]);

  // Names them rather than counting them: somebody about to sign their name to
  // skipping two things should read the two things.
  it("lists every outstanding criterion", () => {
    const p = overridePrompt(two, "Plan Internally");
    expect(p).toContain("Confirm scope against the signed SOW");
    expect(p).toContain("Confirm the champion and the decision maker");
    expect(p).toContain("Plan Internally");
  });

  it("says the override is attributed", () => {
    expect(overridePrompt(two, "Build")).toContain("recorded against your name");
  });

  it("reads correctly for a single criterion", () => {
    const one = stageGateStatus([item({ status: "not_started", title: "Sign off the plan" })]);
    expect(overridePrompt(one, "Build")).toContain("1 criterion outstanding");
    expect(overridePrompt(one, "Build")).not.toContain("•");
  });
});
