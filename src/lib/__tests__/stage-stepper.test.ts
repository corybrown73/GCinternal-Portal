import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StageStepper } from "@/components/stage-stepper";
import { flowStepperStages, railStatuses, type FlowStageKey } from "../stage-flow";

/**
 * The standard rail through the generic stepper. The standard flow must read
 * exactly as it did before the stepper was generalised: the same statuses, the
 * same check marks, the same skipped stages, and the same recorded dates only.
 */

type Row = { key: FlowStageKey; label: string; done: boolean; tasks: readonly unknown[] };
const NOW = "make_it_run" as FlowStageKey;

const CANON: Row[] = [
  { key: "pre_kickoff", label: "Intake & Process", done: true, tasks: [{}] },
  { key: "kickoff", label: "Kickoff", done: true, tasks: [{}] },
  { key: "get_it_working", label: "Get it working", done: false, tasks: [{}] },
  { key: "make_it_yours", label: "Make it yours", done: false, tasks: [{}] },
  { key: NOW, label: "Make it run", done: false, tasks: [{}] },
  { key: "complete", label: "Graduate", done: false, tasks: [{}] },
];

describe("flowStepperStages — the standard rail", () => {
  it("keeps the rail's own status rule for every stage", () => {
    const stages = flowStepperStages(CANON, NOW);
    const rail = railStatuses(CANON, NOW);
    expect(stages.map((s) => s.status)).toEqual(rail.map((r) => r.status));
    expect(stages.map((s) => s.key)).toEqual(CANON.map((s) => s.key));
  });

  it("checks off the stages before the current one, and marks exactly the current stage", () => {
    const stages = flowStepperStages(CANON, NOW);
    expect(stages.filter((s) => s.passed).map((s) => s.key)).toEqual([
      "pre_kickoff",
      "kickoff",
      "get_it_working",
      "make_it_yours",
    ]);
    expect(stages.filter((s) => s.isCurrent).map((s) => s.key)).toEqual(["make_it_run"]);
  });

  it("keeps a done current stage as the current one, without a check mark", () => {
    const done = CANON.map((r) => (r.key === "make_it_run" ? { ...r, done: true } : r));
    const make = flowStepperStages(done, NOW).find((s) => s.key === NOW)!;
    expect(make.isCurrent).toBe(true);
    expect(make.status).toBe("completed");
    expect(make.passed).toBe(false);
  });

  it("marks a stage passed over without being done as skipped, and draws no date for it", () => {
    const skipped = CANON.map((r) => (r.key === "get_it_working" ? { ...r, done: false } : r));
    const stages = flowStepperStages(skipped, NOW, { history: [] });
    const gi = stages.find((s) => s.key === "get_it_working")!;
    expect(gi.status).toBe("skipped");
    expect(gi.date).toBeNull();
  });

  it("draws no dates at all unless the caller passes the recorded history", () => {
    const stages = flowStepperStages(CANON, NOW);
    expect(stages.every((s) => s.date === null)).toBe(true);
  });
});

describe("StageStepper — the generic rail draws any stage model", () => {
  it("draws a skipped stage with its label and no check mark, and the current stage marked", () => {
    const markup = renderToStaticMarkup(
      createElement(StageStepper, {
        stages: [
          {
            key: "a",
            label: "Alpha",
            status: "completed",
            isCurrent: false,
            passed: true,
            date: { label: "Completed", text: "1 Jan" },
          },
          {
            key: "b",
            label: "Beta",
            status: "skipped",
            isCurrent: false,
            passed: false,
            date: null,
          },
          {
            key: "c",
            label: "Gamma",
            status: "current",
            isCurrent: true,
            passed: false,
            date: { label: "Target", text: "To be confirmed" },
          },
        ],
        shown: "c",
      }),
    );
    expect(markup.match(/<li\b/g)).toHaveLength(3);
    expect(markup).toContain("Skipped");
    expect(markup).toContain("· Completed 1 Jan");
    expect(markup).toContain("· Target To be confirmed");
    expect(markup.match(/aria-current="step"/g)).toHaveLength(1);
  });
});
