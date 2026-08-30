import { afterEach, describe, expect, it } from "vitest";

import { applyStageOverrides, resetStageOverrides, stageDefinition } from "../lifecycle";
import { stageLabel } from "../hub-format";

afterEach(() => resetStageOverrides());

describe("stage label configuration", () => {
  it("renders the compiled-in label when nothing is configured", () => {
    expect(stageLabel("plan-internal")).toBe("Plan Internally");
  });

  it("renders a configured rename — the thing that did not work", () => {
    // The admin page says "Renaming a stage changes what people read". The
    // rename reached the database and stopped there, because all 22 render
    // sites read the compiled map.
    applyStageOverrides([{ key: "plan-internal", label: "Internal Planning" }]);
    expect(stageLabel("plan-internal")).toBe("Internal Planning");
  });

  it("leaves the stages nobody renamed alone", () => {
    applyStageOverrides([{ key: "plan-internal", label: "Internal Planning" }]);
    expect(stageLabel("build")).toBe("Build");
  });

  it("keeps resolving legacy aliases after a rename", () => {
    // implementation_stage_history is append-only, so old rows carry the old
    // vocabulary. A rename must not orphan them.
    applyStageOverrides([{ key: "plan-internal", label: "Internal Planning" }]);
    expect(stageLabel("plan")).toBe("Internal Planning");
  });

  it("renders a stage that exists only in configuration", () => {
    // Somebody can add a stage in the admin screen; it has no compiled
    // definition at all and still has to render.
    applyStageOverrides([{ key: "pilot", label: "Pilot" }]);
    expect(stageLabel("pilot")).toBe("Pilot");
  });

  it("ignores a blank label rather than rendering an empty chip", () => {
    applyStageOverrides([{ key: "build", label: "   " }]);
    expect(stageLabel("build")).toBe("Build");
  });

  it("carries the configured intent, and keeps the compiled one otherwise", () => {
    applyStageOverrides([
      { key: "build", label: "Build", intent: "Ours, not the seeded wording." },
    ]);
    expect(stageDefinition("build")?.intent).toBe("Ours, not the seeded wording.");
    expect(stageDefinition("adopt")?.intent).toBeTruthy();
  });

  it("falls back to the compiled list when configuration is empty", () => {
    // A failed config read must leave the app readable, not blank every label.
    applyStageOverrides([]);
    expect(stageLabel("graduate-to-cs")).toBe("Handover to Customer Success");
  });

  it("still renders an unknown stage as itself", () => {
    expect(stageLabel("something-nobody-configured")).toBe("something-nobody-configured");
    expect(stageLabel(null)).toBe("—");
  });
});
