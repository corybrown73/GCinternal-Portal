import { describe, expect, it } from "vitest";

import {
  buildProjectTimeline,
  planTimelineLayout,
  railSummary,
  timelineHeadline,
  type ProjectTimeline,
  type StageInstanceRow,
} from "../project-timeline";

/**
 * The header's whole job is to stop lying: it must show the stages the project
 * actually has, and when it has none it must not pass a house default off as a
 * plan. These are the rules that keep it honest.
 */

const now = new Date("2026-06-15T12:00:00Z");

/** The integration journey seeded in 0016 — deliberately NOT the new-logo eight. */
function integrationStages(overrides: Partial<StageInstanceRow>[] = []): StageInstanceRow[] {
  const base: StageInstanceRow[] = [
    {
      stage_key: "discovery",
      name: "Discovery",
      position: 1,
      status: "done",
      entered_at: "2026-05-01T00:00:00Z",
      exited_at: "2026-05-11T00:00:00Z",
      target_duration_days: 10,
    },
    {
      stage_key: "design",
      name: "Design",
      position: 2,
      status: "done",
      entered_at: "2026-05-11T00:00:00Z",
      exited_at: "2026-06-06T00:00:00Z",
      target_duration_days: 14,
    },
    {
      stage_key: "build",
      name: "Build",
      position: 3,
      status: "active",
      entered_at: "2026-06-06T00:00:00Z",
      exited_at: null,
      target_duration_days: 14,
    },
    {
      stage_key: "validate-iterate",
      name: "Validate / Iterate",
      position: 4,
      status: "pending",
      entered_at: null,
      exited_at: null,
      target_duration_days: 7,
    },
    {
      stage_key: "launch",
      name: "Launch",
      position: 5,
      status: "pending",
      entered_at: null,
      exited_at: null,
      target_duration_days: 3,
    },
  ];
  return base.map((row, i) => ({ ...row, ...(overrides[i] ?? {}) }));
}

describe("buildProjectTimeline — reading the record", () => {
  it("shows the project's own stages, not the new-logo eight", () => {
    const t = buildProjectTimeline(
      {
        id: "i1",
        name: "Salesforce integration",
        current_stage: "build",
        stages: integrationStages(),
      },
      now,
    );
    expect(t.source).toBe("stage_instances");
    expect(t.stages.map((s) => s.name)).toEqual([
      "Discovery",
      "Design",
      "Build",
      "Validate / Iterate",
      "Launch",
    ]);
    expect(t.total).toBe(5);
  });

  it("marks past, current and future from the rows themselves", () => {
    const t = buildProjectTimeline(
      { id: "i1", name: "Integration", current_stage: "build", stages: integrationStages() },
      now,
    );
    expect(t.stages.map((s) => s.state)).toEqual(["past", "past", "current", "future", "future"]);
    expect(t.position).toBe(3);
    expect(timelineHeadline(t)).toBe("Stage 3 of 5 · Build");
  });

  it("keeps a skipped stage visible and distinct from a finished one", () => {
    const t = buildProjectTimeline(
      {
        id: "i1",
        name: "Integration",
        current_stage: "build",
        stages: integrationStages([{}, { status: "skipped" }]),
      },
      now,
    );
    expect(t.stages[1]!.state).toBe("skipped");
    expect(t.stages[2]!.state).toBe("current");
  });

  it("measures dwell against the stage's own target, not a house threshold", () => {
    // Day 9 of a 14-day Build target: comfortably inside it.
    const t = buildProjectTimeline(
      { id: "i1", name: "Integration", current_stage: "build", stages: integrationStages() },
      now,
    );
    expect(t.dwell.level).toBe("on_pace");
    expect(t.dwell.reason).toContain("Day 9 of a 14 days target");
  });

  it("goes late on the stage's own target, and says by how much", () => {
    const t = buildProjectTimeline(
      {
        id: "i1",
        name: "Integration",
        current_stage: "build",
        stages: integrationStages([{}, {}, { target_duration_days: 3 }]),
      },
      now,
    );
    expect(t.dwell.level).toBe("late");
    expect(t.dwell.reason).toContain("6 days over");
  });

  it("is complete only when every stage is finished or skipped", () => {
    const finished = integrationStages().map((s) => ({
      ...s,
      status: "done",
      exited_at: s.exited_at ?? "2026-06-10T00:00:00Z",
    }));
    const t = buildProjectTimeline(
      {
        id: "i1",
        name: "Integration",
        current_stage: "launch",
        stages: finished,
        target_launch_date: "2026-06-12",
        actual_launch_date: "2026-06-10",
      },
      now,
    );
    expect(t.isComplete).toBe(true);
    expect(t.dwell.level).toBe("done");
    expect(t.launch.level).toBe("done");
    expect(t.stages.every((s) => s.state === "past")).toBe(true);
  });

  it("surfaces backfill-inferred rows rather than passing them off as observed", () => {
    const t = buildProjectTimeline(
      {
        id: "i1",
        name: "Integration",
        current_stage: "build",
        stages: integrationStages([{ provenance: "backfill_inferred" }]),
      },
      now,
    );
    expect(t.stages[0]!.inferred).toBe(true);
    expect(t.stages[1]!.inferred).toBe(false);
  });

  it("does not care what order the rows arrive in", () => {
    const shuffled = [...integrationStages()].reverse();
    const t = buildProjectTimeline(
      { id: "i1", name: "Integration", current_stage: "build", stages: shuffled },
      now,
    );
    expect(t.stages.map((s) => s.position)).toEqual([1, 2, 3, 4, 5]);
    expect(t.currentStageName).toBe("Build");
  });
});

describe("buildProjectTimeline — the fallback must announce itself", () => {
  it("falls back to the lifecycle default only when there are no stage instances", () => {
    const t = buildProjectTimeline(
      {
        id: "i1",
        name: "New logo",
        current_stage: "build",
        stage_entered_at: "2026-06-06T00:00:00Z",
      },
      now,
    );
    expect(t.source).toBe("lifecycle_default");
    expect(t.total).toBe(8);
    expect(t.currentStageName).toBe("Build");
    expect(t.position).toBe(4);
  });

  it("never calls a default rail complete — a default is not evidence", () => {
    const t = buildProjectTimeline(
      { id: "i1", name: "New logo", current_stage: "graduate-to-cs" },
      now,
    );
    expect(t.isComplete).toBe(false);
  });

  it("says in words that the stages shown are a default, not a plan", () => {
    const t = buildProjectTimeline({ id: "i1", name: "New logo", current_stage: "build" }, now);
    expect(railSummary(t)).toContain("No plan has been applied");
  });

  it("reports an unrecognised stage honestly instead of guessing a position", () => {
    const t = buildProjectTimeline(
      { id: "i1", name: "New logo", current_stage: "technically-validate" },
      now,
    );
    expect(t.position).toBe(0);
    expect(t.stages.every((s) => s.state === "future")).toBe(true);
    expect(railSummary(t)).toContain("Not yet on the rail");
  });

  it("reads a missing launch target as no target, never as on pace", () => {
    const t = buildProjectTimeline({ id: "i1", name: "New logo", current_stage: "build" }, now);
    expect(t.launch.level).toBe("unknown");
    expect(t.launch.reason).toContain("No target date set");
  });
});

describe("buildProjectTimeline — projects start on different days", () => {
  it("prefers the contract start, then the first stage entry, then creation", () => {
    const withContract = buildProjectTimeline(
      {
        id: "i1",
        name: "A",
        current_stage: "build",
        contract_start_date: "2026-06-05",
        created_at: "2026-01-01T00:00:00Z",
        stages: integrationStages(),
      },
      now,
    );
    expect(withContract.startedAt).toBe("2026-06-05");

    const fromStages = buildProjectTimeline(
      {
        id: "i2",
        name: "B",
        current_stage: "build",
        created_at: "2026-01-01T00:00:00Z",
        stages: integrationStages(),
      },
      now,
    );
    expect(fromStages.startedAt).toBe("2026-05-01T00:00:00Z");

    const fromCreation = buildProjectTimeline(
      { id: "i3", name: "C", current_stage: "build", created_at: "2026-01-01T00:00:00Z" },
      now,
    );
    expect(fromCreation.startedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("marks an add-on as hanging off a parent", () => {
    const t = buildProjectTimeline(
      { id: "i2", name: "Add-on", current_stage: "build", parent_implementation_id: "i1" },
      now,
    );
    expect(t.isAddOn).toBe(true);
  });

  it("takes the worse of dwell and launch for the lane's overall colour", () => {
    const t = buildProjectTimeline(
      {
        id: "i1",
        name: "Integration",
        current_stage: "build",
        target_launch_date: "2026-06-01",
        stages: integrationStages(),
      },
      now,
    );
    expect(t.dwell.level).toBe("on_pace");
    expect(t.overall.level).toBe("late");
  });
});

describe("railSummary — the text alternative", () => {
  it("says where the project is, on what plan, and why the colour", () => {
    const t = buildProjectTimeline(
      {
        id: "i1",
        name: "Salesforce integration",
        current_stage: "build",
        target_launch_date: "2026-07-30",
        stages: integrationStages(),
      },
      now,
    );
    const text = railSummary(t);
    expect(text).toContain("Salesforce integration");
    expect(text).toContain("5-stage plan");
    expect(text).toContain("Stage 3 of 5: Build");
    expect(text).toContain("Target launch:");
  });
});

describe("planTimelineLayout — 1, 3 and 12 projects", () => {
  const make = (id: string, complete = false): ProjectTimeline =>
    buildProjectTimeline(
      {
        id,
        name: id,
        current_stage: "build",
        stages: complete
          ? integrationStages().map((s) => ({ ...s, status: "done", exited_at: "2026-06-01" }))
          : integrationStages(),
      },
      now,
    );

  it("draws the only lane there is", () => {
    const l = planTimelineLayout([make("a")], "a");
    expect(l.visible).toHaveLength(1);
    expect(l.hidden).toHaveLength(0);
  });

  it("draws all three, active first", () => {
    const l = planTimelineLayout([make("a"), make("b"), make("c")], "c");
    expect(l.visible.map((t) => t.id)).toEqual(["c", "a", "b"]);
    expect(l.hidden).toHaveLength(0);
  });

  it("caps twelve, keeping the active one and outstanding work in view", () => {
    const rows = [
      make("done-1", true),
      make("done-2", true),
      make("done-3", true),
      ...["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"].map((id) => make(id)),
      make("active"),
    ];
    const l = planTimelineLayout(rows, "active");
    expect(l.visible).toHaveLength(4);
    expect(l.visible[0]!.id).toBe("active");
    // Finished work is folded before outstanding work is.
    expect(l.visible.some((t) => t.isComplete)).toBe(false);
    expect(l.hidden).toHaveLength(8);
    expect(l.completeCount).toBe(3);
    expect(l.outstandingCount).toBe(9);
  });

  it("never folds a single lane away — the click would buy nothing", () => {
    const rows = ["a", "b", "c", "d", "e"].map((id) => make(id));
    const l = planTimelineLayout(rows, "a");
    expect(l.visible).toHaveLength(5);
    expect(l.hidden).toHaveLength(0);
  });

  it("keeps a finished project visible when there is room for it", () => {
    const l = planTimelineLayout([make("a"), make("old", true)], "a");
    expect(l.visible.map((t) => t.id)).toEqual(["a", "old"]);
    expect(l.completeCount).toBe(1);
  });
});
