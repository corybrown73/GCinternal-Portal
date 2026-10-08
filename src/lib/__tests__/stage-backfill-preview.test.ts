import { describe, expect, it } from "vitest";

import {
  normalizeStageKey,
  previewOneImplementation,
  previewStageBackfill,
  type ExistingStageInstanceRow,
  type ImplementationRow,
  type PublishedTemplateRow,
  type StageHistoryRow,
  type TemplateStageRow,
} from "../server/stage-backfill-preview";

/**
 * This preview answers, read-only, the same question migration 0015 answered
 * once by hand for "new-logo": which legacy implementations would get which
 * stage_instances rows, from which evidence, and which ones it would have
 * to flag rather than guess. These tests build the same eight-stage
 * "new-logo"-shaped template 0015 seeded, so a reader can compare the two
 * side by side.
 */

const NEW_LOGO_TEMPLATE: PublishedTemplateRow = {
  id: "tpl-new-logo-v1",
  key: "new-logo",
  version: 1,
  name: "New Logo",
  journey_type: "new_logo",
  status: "published",
};

const NEW_LOGO_STAGES: TemplateStageRow[] = [
  { template_id: "tpl-new-logo-v1", stage_key: "handoff", name: "Handoff", position: 1 },
  {
    template_id: "tpl-new-logo-v1",
    stage_key: "plan-internal",
    name: "Plan Internally",
    position: 2,
  },
  {
    template_id: "tpl-new-logo-v1",
    stage_key: "align-external",
    name: "Align Externally",
    position: 3,
  },
  { template_id: "tpl-new-logo-v1", stage_key: "build", name: "Build", position: 4 },
  {
    template_id: "tpl-new-logo-v1",
    stage_key: "validate-iterate",
    name: "Validate / Iterate",
    position: 5,
  },
  { template_id: "tpl-new-logo-v1", stage_key: "launch", name: "Launch", position: 6 },
  { template_id: "tpl-new-logo-v1", stage_key: "adopt", name: "Adopt", position: 7 },
  {
    template_id: "tpl-new-logo-v1",
    stage_key: "graduate-to-cs",
    name: "Handover to CS",
    position: 8,
  },
];

function impl(over: Partial<ImplementationRow> = {}): ImplementationRow {
  return {
    id: "impl-1",
    name: "Acme Co",
    current_stage: "build",
    journey_type: "new_logo",
    ...over,
  };
}

function run(
  i: ImplementationRow,
  history: StageHistoryRow[] = [],
  existing: ExistingStageInstanceRow[] = [],
  templates: PublishedTemplateRow[] = [NEW_LOGO_TEMPLATE],
  templateStages: TemplateStageRow[] = NEW_LOGO_STAGES,
) {
  return previewOneImplementation(i, history, existing, templates, templateStages);
}

describe("normalizeStageKey", () => {
  it("lowercases and dashes, matching 0015's own normalisation", () => {
    expect(normalizeStageKey("Plan_Internal")).toBe("plan-internal");
    expect(normalizeStageKey("  BUILD  ")).toBe("build");
  });
  it("is null for nothing to normalise", () => {
    expect(normalizeStageKey(null)).toBeNull();
    expect(normalizeStageKey(undefined)).toBeNull();
    expect(normalizeStageKey("   ")).toBeNull();
  });
});

describe("previewOneImplementation — complete (clean) case", () => {
  it("proposes the single matching published template and previews every stage", () => {
    const history: StageHistoryRow[] = [
      {
        implementation_id: "impl-1",
        stage: "handoff",
        entered_at: "2026-01-01T00:00:00Z",
        exited_at: "2026-01-03T00:00:00Z",
      },
      {
        implementation_id: "impl-1",
        stage: "plan-internal",
        entered_at: "2026-01-03T00:00:00Z",
        exited_at: "2026-01-05T00:00:00Z",
      },
      {
        implementation_id: "impl-1",
        stage: "build",
        entered_at: "2026-01-10T00:00:00Z",
        exited_at: null,
      },
    ];
    const c = run(impl({ current_stage: "build" }), history);

    expect(c.status).toBe("clean");
    expect(c.reviewReasons).toEqual([]);
    expect(c.templateMatch).toEqual({
      templateId: "tpl-new-logo-v1",
      templateKey: "new-logo",
      templateVersion: 1,
      templateName: "New Logo",
    });
    expect(c.stagePreview).toHaveLength(8);

    const handoff = c.stagePreview.find((s) => s.stageKey === "handoff")!;
    expect(handoff).toMatchObject({
      status: "done",
      provenance: "backfill_observed",
      enteredAt: "2026-01-01T00:00:00Z",
      exitedAt: "2026-01-03T00:00:00Z",
    });

    const build = c.stagePreview.find((s) => s.stageKey === "build")!;
    expect(build.status).toBe("active");
    expect(build.provenance).toBe("backfill_observed");

    const launch = c.stagePreview.find((s) => s.stageKey === "launch")!;
    expect(launch.status).toBe("pending");
  });

  it("resolves a legacy spelling (0015's STAGE_ALIASES) to the current stage key", () => {
    const c = run(impl({ current_stage: "graduate" })); // legacy for graduate-to-cs
    expect(c.normalizedCurrentStage).toBe("graduate");
    expect(c.templateMatch?.templateKey).toBe("new-logo");
    const target = c.stagePreview.find((s) => s.stageKey === "graduate-to-cs")!;
    expect(target.status).toBe("active");
  });
});

describe("previewOneImplementation — partial existing records", () => {
  it("still proposes the template but flags the implementation as partial, not clean", () => {
    const existing: ExistingStageInstanceRow[] = [
      { implementation_id: "impl-1" },
      { implementation_id: "impl-1" },
    ];
    const c = run(impl(), [], existing);
    expect(c.status).toBe("partial");
    expect(c.templateMatch).not.toBeNull();
    expect(c.existingStageInstanceCount).toBe(2);
    expect(c.reviewReasons.some((r) => r.includes("already has 2 existing"))).toBe(true);
  });

  it("is left out of the full-list preview once every stage already has a row", () => {
    const existing: ExistingStageInstanceRow[] = Array.from({ length: 8 }, () => ({
      implementation_id: "impl-1",
    }));
    const result = previewStageBackfill({
      implementations: [impl()],
      history: [],
      existingInstances: existing,
      templates: [NEW_LOGO_TEMPLATE],
      templateStages: NEW_LOGO_STAGES,
    });
    expect(result).toEqual([]);
  });
});

describe("previewOneImplementation — ambiguous match", () => {
  it("withdraws the match when two published templates fit, and names both", () => {
    const second: PublishedTemplateRow = {
      id: "tpl-new-logo-v2-fork",
      key: "new-logo-fork",
      version: 1,
      name: "New Logo (fork)",
      journey_type: "new_logo",
      status: "published",
    };
    const c = run(impl(), [], [], [NEW_LOGO_TEMPLATE, second]);
    expect(c.status).toBe("needs_review");
    expect(c.templateMatch).toBeNull();
    expect(c.stagePreview).toEqual([]);
    expect(c.reviewReasons[0]).toMatch(/ambiguous: 2 published templates/);
    expect(c.reviewReasons[0]).toContain("new-logo v1");
    expect(c.reviewReasons[0]).toContain("new-logo-fork v1");
  });

  it("is also ambiguous with no recorded journey_type and more than one published template", () => {
    const other: PublishedTemplateRow = {
      id: "tpl-other",
      key: "add-on-standard",
      version: 1,
      name: "Add-on",
      journey_type: "add_on",
      status: "published",
    };
    const c = run(impl({ journey_type: null }), [], [], [NEW_LOGO_TEMPLATE, other]);
    expect(c.status).toBe("needs_review");
    expect(c.templateMatch).toBeNull();
    expect(c.reviewReasons[0]).toMatch(/no journey_type to narrow by/);
  });
});

describe("previewOneImplementation — unmapped / unsupported stage keys", () => {
  it("flags a current_stage that normalises but matches no stage in the candidate template", () => {
    const c = run(impl({ current_stage: "some_totally_unknown_stage" }));
    expect(c.status).toBe("needs_review");
    expect(c.templateMatch).toBeNull();
    expect(c.unsupportedStageKeys).toEqual([]); // it DID normalise — it just isn't in this template
    expect(c.reviewReasons[0]).toMatch(/is not a stage in template "new-logo"/);
  });

  it("flags a current_stage that does not even normalise to anything", () => {
    const c = run(impl({ current_stage: "   " }));
    expect(c.status).toBe("needs_review");
    expect(c.templateMatch).toBeNull();
    expect(c.unsupportedStageKeys).toContain("   ");
    expect(c.reviewReasons).toContain('current_stage "   " does not normalise to a stage key');
  });

  it("surfaces an unmapped HISTORY stage even when current_stage itself is fine", () => {
    const history: StageHistoryRow[] = [
      {
        implementation_id: "impl-1",
        stage: "",
        entered_at: "2026-01-01T00:00:00Z",
        exited_at: null,
      },
    ];
    const c = run(impl({ current_stage: "build" }), history);
    expect(c.templateMatch).not.toBeNull(); // current stage still matches fine
    expect(c.unsupportedStageKeys).toContain("");
  });
});

describe("previewOneImplementation — missing template", () => {
  it("flags when no published template exists for the recorded journey_type", () => {
    const c = run(impl({ journey_type: "data_migration" }), [], [], [NEW_LOGO_TEMPLATE]);
    expect(c.status).toBe("needs_review");
    expect(c.templateMatch).toBeNull();
    expect(c.reviewReasons[0]).toBe('no published template for journey_type "data_migration"');
  });

  it("flags when there is no journey_type and no published template at all", () => {
    const c = run(impl({ journey_type: null }), [], [], []);
    expect(c.status).toBe("needs_review");
    expect(c.reviewReasons[0]).toMatch(/no published template exists/);
  });

  it("does not propose a draft or archived template, even if the key would otherwise fit", () => {
    const draft: PublishedTemplateRow = { ...NEW_LOGO_TEMPLATE, status: "draft" };
    const c = run(impl(), [], [], [draft]);
    expect(c.templateMatch).toBeNull();
    expect(c.status).toBe("needs_review");
  });
});

describe("previewOneImplementation — never invents timestamps", () => {
  it("marks a stage with no history row as backfill_inferred with null dates, even though it is 'done' by position", () => {
    // No history at all: every stage before "build" is inferred done, never
    // given invented entered_at/exited_at.
    const c = run(impl({ current_stage: "build" }), []);
    const handoff = c.stagePreview.find((s) => s.stageKey === "handoff")!;
    expect(handoff.status).toBe("done");
    expect(handoff.provenance).toBe("backfill_inferred");
    expect(handoff.enteredAt).toBeNull();
    expect(handoff.exitedAt).toBeNull();
  });

  it("never sets exitedAt for the active or a later (pending) stage, even with history on it", () => {
    const history: StageHistoryRow[] = [
      {
        implementation_id: "impl-1",
        stage: "build",
        entered_at: "2026-01-10T00:00:00Z",
        exited_at: "2026-01-20T00:00:00Z",
      },
    ];
    const c = run(impl({ current_stage: "build" }), history);
    const build = c.stagePreview.find((s) => s.stageKey === "build")!;
    expect(build.status).toBe("active");
    // A real exited_at row exists, but the stage is current — never shown as exited.
    expect(build.exitedAt).toBeNull();
    expect(build.enteredAt).toBe("2026-01-10T00:00:00Z");
  });
});

describe("previewStageBackfill — the full list", () => {
  it("includes a zero-instance implementation and a partial one, excludes a fully-instantiated one", () => {
    const zero = impl({ id: "impl-zero", name: "Zero Co" });
    const partial = impl({ id: "impl-partial", name: "Partial Co" });
    const full = impl({ id: "impl-full", name: "Full Co" });
    const existing: ExistingStageInstanceRow[] = [
      { implementation_id: "impl-partial" },
      ...Array.from({ length: 8 }, () => ({ implementation_id: "impl-full" })),
    ];
    const result = previewStageBackfill({
      implementations: [zero, partial, full],
      history: [],
      existingInstances: existing,
      templates: [NEW_LOGO_TEMPLATE],
      templateStages: NEW_LOGO_STAGES,
    });
    const ids = result.map((r) => r.implementationId);
    expect(ids).toContain("impl-zero");
    expect(ids).toContain("impl-partial");
    expect(ids).not.toContain("impl-full");
    expect(result.find((r) => r.implementationId === "impl-zero")!.status).toBe("clean");
    expect(result.find((r) => r.implementationId === "impl-partial")!.status).toBe("partial");
  });
});
