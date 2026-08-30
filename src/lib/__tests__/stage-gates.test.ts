import { describe, expect, it } from "vitest";

import {
  canAdvance,
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

describe("canAdvance / needsOverride", () => {
  const incomplete = stageGateStatus([item({ status: "done" }), item({ status: "not_started" })]);
  const complete = stageGateStatus([item({ status: "done" })]);

  it("lets an advisory stage through with a gap, and marks it as an override", () => {
    // The app records what happened rather than refusing to let people describe
    // reality. Somebody who really did launch without training the crews must
    // be able to say so — they just should not do it by accident.
    expect(canAdvance(incomplete, "advisory")).toBe(true);
    expect(needsOverride(incomplete, "advisory")).toBe(true);
  });

  it("refuses a blocking stage with a gap", () => {
    expect(canAdvance(incomplete, "blocking")).toBe(false);
    // Nothing to override: it simply cannot be done.
    expect(needsOverride(incomplete, "blocking")).toBe(false);
  });

  it("needs no override once the gates are met, whatever the mode", () => {
    for (const mode of ["advisory", "warn", "blocking", null, undefined]) {
      expect(canAdvance(complete, mode)).toBe(true);
      expect(needsOverride(complete, mode)).toBe(false);
    }
  });

  it("never blocks a stage that has no criteria at all", () => {
    // A stage nobody has defined criteria for must not become an unexplainable
    // dead end just because its mode happens to be 'blocking'.
    const ungated = stageGateStatus([]);
    expect(canAdvance(ungated, "blocking")).toBe(true);
    expect(needsOverride(ungated, "blocking")).toBe(false);
  });
});
