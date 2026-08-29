import { describe, expect, it } from "vitest";
import {
  compareAll,
  dwellByStage,
  dwellVsTarget,
  nearestRank,
  onTimeCounts,
  type ImplementationTargets,
} from "../signals/dwell";
import { velocityFor, stagesBetween } from "../signals/velocity";
import { slipAttribution } from "../signals/slip";
import type { StageSegment } from "../signals/stage-history";
import type { LifecycleStageId } from "../lifecycle";

const seg = (
  over: Partial<StageSegment> & { stage: LifecycleStageId; days: number },
): StageSegment => ({
  implementation_id: "impl-1",
  stage_label: over.stage,
  entered_at: "2026-01-01T00:00:00.000Z",
  exited_at: "2026-01-11T00:00:00.000Z",
  ...over,
});

const targets = (
  map: Record<string, Partial<Record<LifecycleStageId, number>>>,
): ImplementationTargets =>
  new Map(
    Object.entries(map).map(([impl, stages]) => [
      impl,
      new Map(Object.entries(stages).map(([k, v]) => [k as LifecycleStageId, v as number])),
    ]),
  );

describe("nearestRank", () => {
  it("always returns a value that is actually in the list", () => {
    const values = [1, 4, 9, 20];
    for (const f of [0.1, 0.5, 0.9, 1]) {
      expect(values).toContain(nearestRank(values, f));
    }
  });

  it("returns null for an empty list rather than zero", () => {
    // Zero would read as "fast". Nothing observed is not the same as fast.
    expect(nearestRank([], 0.5)).toBeNull();
  });
});

describe("dwellByStage", () => {
  it("reports the transition behind median and p90, not an interpolation", () => {
    const rows = [
      seg({ stage: "build", days: 2 }),
      seg({ stage: "build", days: 5 }),
      seg({ stage: "build", days: 40, entered_at: "2026-02-01T00:00:00.000Z" }),
    ];
    const [dist] = dwellByStage(rows);
    expect(dist?.count).toBe(3);
    expect(dist?.median_days).toBe(5);
    expect(dist?.p90_days).toBe(40);
    // The statistic and the segment behind it cannot disagree.
    expect(dist?.median_segment.days).toBe(dist?.median_days);
    expect(dist?.p90_segment.days).toBe(dist?.p90_days);
  });

  it("omits a stage with no completed transition rather than showing it as zero", () => {
    expect(dwellByStage([seg({ stage: "build", days: 3 })]).map((d) => d.stage)).toEqual(["build"]);
  });
});

describe("dwellVsTarget", () => {
  it("says 'no target' instead of inventing one from the observations", () => {
    // A rolling median as the benchmark means nothing is ever late.
    const c = dwellVsTarget(seg({ stage: "build", days: 90 }), null);
    expect(c.verdict).toBe("no_target");
    expect(c.days_over).toBeNull();
    expect(c.reason).toContain("no target duration is recorded");
  });

  it("names the overrun in days when a target exists", () => {
    const c = dwellVsTarget(seg({ stage: "build", days: 30 }), 20);
    expect(c.verdict).toBe("over_target");
    expect(c.days_over).toBe(10);
  });
});

describe("onTimeCounts", () => {
  it("is three counts with no percentage anywhere on the object", () => {
    const rows = [
      seg({ stage: "build", days: 30 }),
      seg({ stage: "handoff", days: 1 }),
      seg({ stage: "adopt", days: 5 }),
    ];
    const counts = onTimeCounts(compareAll(rows, targets({ "impl-1": { build: 20, handoff: 5 } })));
    expect(counts).toMatchObject({ within: 1, over: 1, no_target: 1 });
    expect(Object.keys(counts)).not.toContain("pct");
    expect(counts.over_segments[0]?.days_over).toBe(10);
  });
});

describe("velocityFor", () => {
  it("reports the sequence and never a rate", () => {
    const v = velocityFor(
      "impl-1",
      [
        seg({ stage: "handoff", days: 3 }),
        seg({ stage: "build", days: 41, entered_at: "2026-02-01T00:00:00.000Z" }),
      ],
      null,
      "build",
    );
    expect(v.completed).toHaveLength(2);
    expect(v.observed_days).toBe(44);
    expect(v.slowest?.days).toBe(41);
    expect(Object.keys(v)).not.toContain("stages_per_week");
    expect(v.reason).toContain("2 recorded transitions");
  });

  it("says so plainly when nothing has ever been recorded", () => {
    const v = velocityFor("impl-9", [], null, "handoff");
    expect(v.completed).toEqual([]);
    expect(v.reason).toContain("No stage transition has ever been recorded");
  });
});

describe("stagesBetween", () => {
  it("excludes the stage in flight, so the estimate understates rather than over", () => {
    expect(stagesBetween("plan-internal", "launch")).toEqual([
      "align-external",
      "build",
      "validate-iterate",
      "launch",
    ]);
    expect(stagesBetween("launch", "launch")).toEqual([]);
  });
});

describe("slipAttribution", () => {
  const NOW = new Date("2026-06-01T00:00:00.000Z");

  it("returns nothing to attribute when the target has not passed", () => {
    const out = slipAttribution(
      { id: "impl-1", target_launch_date: "2026-12-01" },
      [],
      null,
      targets({}),
      NOW,
    );
    expect(out.slipped).toBe(false);
  });

  it("refuses to attribute a slip when no stage has a target", () => {
    // The honest answer beats a plausible-looking split.
    const out = slipAttribution(
      { id: "impl-1", target_launch_date: "2026-05-01" },
      [seg({ stage: "build", days: 90 })],
      null,
      targets({}),
      NOW,
    );
    expect(out.slipped).toBe(true);
    if (!out.slipped) return;
    expect(out.attributable).toBe(false);
    expect(out.unattributed_days).toBe(out.slip_days);
    expect(out.reason).toContain("cannot be attributed");
  });

  it("names the stages that ran over and leaves the rest unattributed", () => {
    const out = slipAttribution(
      { id: "impl-1", target_launch_date: "2026-05-01" },
      [seg({ stage: "build", days: 30 }), seg({ stage: "handoff", days: 2 })],
      null,
      targets({ "impl-1": { build: 20, handoff: 5 } }),
      NOW,
    );
    expect(out.slipped).toBe(true);
    if (!out.slipped) return;
    expect(out.slip_days).toBe(31);
    expect(out.contributions.map((c) => c.stage_label)).toEqual(["build"]);
    expect(out.attributed_days).toBe(10);
    expect(out.unattributed_days).toBe(21);
    // Never negative, and never silently closed.
    expect(out.over_explained_days).toBe(0);
  });

  it("counts the stage in flight only once it is already over its own target", () => {
    const open = {
      implementation_id: "impl-1",
      stage: "build" as LifecycleStageId,
      stage_label: "Build",
      entered_at: "2026-01-01T00:00:00.000Z",
      days_so_far: 40,
    };
    const under = slipAttribution(
      { id: "impl-1", target_launch_date: "2026-05-01" },
      [],
      open,
      targets({ "impl-1": { build: 90 } }),
      NOW,
    );
    expect(under.slipped && under.contributions).toEqual([]);

    const over = slipAttribution(
      { id: "impl-1", target_launch_date: "2026-05-01" },
      [],
      open,
      targets({ "impl-1": { build: 10 } }),
      NOW,
    );
    expect(over.slipped && over.contributions[0]?.in_flight).toBe(true);
    expect(over.slipped && over.contributions[0]?.days_over).toBe(30);
  });

  it("states that the basis is the current target, since a moved date leaves no record", () => {
    const out = slipAttribution(
      { id: "impl-1", target_launch_date: "2026-05-01" },
      [seg({ stage: "build", days: 30 })],
      null,
      targets({ "impl-1": { build: 20 } }),
      NOW,
    );
    expect(out.slipped && out.basis).toContain("a date that was moved leaves no record");
  });
});
