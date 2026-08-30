import { describe, expect, it } from "vitest";
import {
  BUILTIN_LIFECYCLE_STAGES,
  findLifecycleStage,
  lifecycleLabel,
  lifecycleOrder,
  LIFECYCLE_STAGE_KEY_PATTERN,
  readLifecycleStages,
  REQUIRED_LIFECYCLE_KEYS,
} from "../lifecycle-stages";
import { LIFECYCLE_STAGES } from "../lifecycle";

describe("the built-in lifecycle", () => {
  it("mirrors LIFECYCLE_STAGES exactly, in order", () => {
    // 0031's seed is written from this list. If they ever disagree, a fresh
    // deployment renders different stage names from an existing one.
    expect(BUILTIN_LIFECYCLE_STAGES.map((s) => s.key)).toEqual(LIFECYCLE_STAGES.map((s) => s.id));
    expect(BUILTIN_LIFECYCLE_STAGES.map((s) => s.label)).toEqual(
      LIFECYCLE_STAGES.map((s) => s.label),
    );
  });

  it("gives every stage a key the database will accept", () => {
    for (const s of BUILTIN_LIFECYCLE_STAGES) {
      expect(s.key, s.key).toMatch(LIFECYCLE_STAGE_KEY_PATTERN);
    }
  });

  it("marks all eight as built in", () => {
    // Being built in is what stops them being deleted. A stage the code names
    // as a literal and that is NOT marked built in is deletable, and deleting
    // it disables a rule silently.
    expect(BUILTIN_LIFECYCLE_STAGES.every((s) => s.is_builtin)).toBe(true);
    expect(REQUIRED_LIFECYCLE_KEYS).toHaveLength(8);
  });

  it("names the four stages the application keys off", () => {
    // Pinned deliberately. These four ids appear as string literals in the
    // launch gate, graduation readiness, the CS handoff, the SLA cron and the
    // Salesforce bridge. Renaming a KEY here would break all of them at once.
    for (const key of ["handoff", "launch", "adopt", "graduate-to-cs"]) {
      expect(REQUIRED_LIFECYCLE_KEYS, key).toContain(key);
    }
  });

  it("has no duplicate keys or sort orders", () => {
    const keys = BUILTIN_LIFECYCLE_STAGES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    const orders = BUILTIN_LIFECYCLE_STAGES.map((s) => s.sort_order);
    expect(new Set(orders).size).toBe(orders.length);
  });
});

describe("readLifecycleStages", () => {
  it("falls back to the built-in list for anything unusable", () => {
    // An empty lifecycle would render an app with no stages at all, which reads
    // as data loss rather than as a configuration nobody has touched.
    for (const input of [null, undefined, [], "nonsense", 42, {}]) {
      expect(
        readLifecycleStages(input).map((s) => s.key),
        JSON.stringify(input),
      ).toEqual(REQUIRED_LIFECYCLE_KEYS);
    }
  });

  it("falls back when every row is unusable", () => {
    expect(readLifecycleStages([{ label: "No key" }, {}]).map((s) => s.key)).toEqual(
      REQUIRED_LIFECYCLE_KEYS,
    );
  });

  it("orders by sort_order, not by the order the rows arrived", () => {
    const rows = [
      { key: "b", label: "B", sort_order: 2 },
      { key: "a", label: "A", sort_order: 1 },
    ];
    expect(readLifecycleStages(rows).map((s) => s.key)).toEqual(["a", "b"]);
  });

  it("resolves an unknown colour or phase to something that renders", () => {
    // Config is hand-editable. Whatever is in there, the page must paint.
    const [stage] = readLifecycleStages([
      { key: "x", label: "X", color: "#ff0000", phase: "elsewhere", sort_order: 1 },
    ]);
    expect(stage!.color).toBe("idle");
    expect(stage!.phase).toBe("delivery");
  });

  it("falls back to the key when a label is missing or empty", () => {
    const [stage] = readLifecycleStages([{ key: "x", label: "", sort_order: 1 }]);
    expect(stage!.label).toBe("x");
  });

  it("treats is_builtin as false unless it is exactly true", () => {
    // Anything truthy-but-not-true would make a custom stage undeletable.
    for (const value of ["true", 1, {}, null, undefined]) {
      const [stage] = readLifecycleStages([
        { key: "x", label: "X", sort_order: 1, is_builtin: value },
      ]);
      expect(stage!.is_builtin, String(value)).toBe(false);
    }
    const [real] = readLifecycleStages([{ key: "x", label: "X", sort_order: 1, is_builtin: true }]);
    expect(real!.is_builtin).toBe(true);
  });
});

describe("lookups", () => {
  const stages = readLifecycleStages([
    { key: "handoff", label: "Intake", sort_order: 1 },
    { key: "build", label: "Build it", sort_order: 2 },
  ]);

  it("finds a stage by key", () => {
    expect(findLifecycleStage(stages, "build")?.label).toBe("Build it");
  });

  it("returns null rather than guessing for an unknown or empty key", () => {
    expect(findLifecycleStage(stages, "nope")).toBeNull();
    expect(findLifecycleStage(stages, null)).toBeNull();
    expect(findLifecycleStage(stages, undefined)).toBeNull();
  });

  it("renders the raw key for a stage that no longer exists", () => {
    // A project can sit in a stage that was deleted, and history certainly can.
    // The key is ugly; blank loses the fact that it was somewhere.
    expect(lifecycleLabel(stages, "retired-stage")).toBe("retired-stage");
    expect(lifecycleLabel(stages, "handoff")).toBe("Intake");
    expect(lifecycleLabel(stages, null)).toBe("");
  });

  it("gives -1 for a stage outside the configured order", () => {
    expect(lifecycleOrder(stages, "handoff")).toBe(0);
    expect(lifecycleOrder(stages, "build")).toBe(1);
    expect(lifecycleOrder(stages, "retired-stage")).toBe(-1);
    expect(lifecycleOrder(stages, null)).toBe(-1);
  });
});
