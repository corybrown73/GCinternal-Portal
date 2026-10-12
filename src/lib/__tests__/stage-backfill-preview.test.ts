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

function existingRow(stage_key: string): ExistingStageInstanceRow {
  return { implementation_id: "impl-1", stage_key };
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
    expect(c.historyConflicts).toEqual([]);
    // Zero existing rows: every template key is technically "missing", but
    // that is simply "not yet backfilled" — status "clean" already says so,
    // and it is not surfaced as a reviewReason (see the test below).
    expect(c.mismatch?.missing).toHaveLength(8);
    expect(c.mismatch).toMatchObject({ extra: [], duplicates: [] });
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

describe("previewOneImplementation — existing stage_instances compared by key, never by count", () => {
  it("flags a MISSING stage key even though the row count looks plausible", () => {
    // 7 existing rows, one short of the template's 8 — but critically, the
    // one missing is "build" (the active stage), not an arbitrary one.
    const existing = NEW_LOGO_STAGES.filter((s) => s.stage_key !== "build").map((s) =>
      existingRow(s.stage_key),
    );
    const c = run(impl(), [], existing);
    expect(c.status).toBe("partial");
    expect(c.mismatch).toEqual({ missing: ["build"], extra: [], duplicates: [] });
    expect(c.reviewReasons.some((r) => r.includes("missing build"))).toBe(true);
  });

  it("flags an EXTRA stage key that isn't in the template at all", () => {
    const existing = [
      ...NEW_LOGO_STAGES.map((s) => existingRow(s.stage_key)),
      existingRow("some-retired-stage-key"),
    ];
    const c = run(impl(), [], existing);
    expect(c.mismatch?.extra).toEqual(["some-retired-stage-key"]);
    expect(c.status).toBe("partial");
    expect(c.reviewReasons.some((r) => r.includes("extra some-retired-stage-key"))).toBe(true);
  });

  it("flags a DUPLICATED stage key rather than counting it as two legitimate rows", () => {
    const existing = [
      ...NEW_LOGO_STAGES.map((s) => existingRow(s.stage_key)),
      existingRow("build"),
    ];
    const c = run(impl(), [], existing);
    // 9 rows total — the same count a naive "existingCount >= 8" check would
    // have called "more than fully populated" and silently excluded.
    expect(c.existingStageInstanceCount).toBe(9);
    expect(c.mismatch?.duplicates).toEqual(["build"]);
    expect(c.status).toBe("partial");
    expect(c.reviewReasons.some((r) => r.includes("duplicated build"))).toBe(true);
  });

  it("is never excluded from the full-list preview while mismatched, even with 8+ rows", () => {
    // Exactly 8 rows (matching the template's count), but the wrong set:
    // every stage except "handoff", plus one extra. A row-count check would
    // call this "fully populated"; a key-set check must not.
    const existing = [
      ...NEW_LOGO_STAGES.filter((s) => s.stage_key !== "handoff").map((s) =>
        existingRow(s.stage_key),
      ),
      existingRow("some-retired-stage-key"),
    ];
    const result = previewStageBackfill({
      implementations: [impl()],
      history: [],
      existingInstances: existing,
      templates: [NEW_LOGO_TEMPLATE],
      templateStages: NEW_LOGO_STAGES,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe("partial");
    expect(result[0]!.mismatch).toEqual({
      missing: ["handoff"],
      extra: ["some-retired-stage-key"],
      duplicates: [],
    });
  });

  it("is excluded only when the existing keys exactly match the template's, with no duplicates", () => {
    const existing = NEW_LOGO_STAGES.map((s) => existingRow(s.stage_key));
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
  it("withdraws the match when two published templates fit the same journey_type, and names both", () => {
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
});

describe("previewOneImplementation — missing journey_type is never guessed", () => {
  it("does NOT auto-assign the only published template when journey_type is missing", () => {
    // Exactly one published template exists — the scenario a naive
    // "no journey_type? fall back to the only published template" rule
    // would treat as safely unambiguous. It must not be.
    const c = run(impl({ journey_type: null }), [], [], [NEW_LOGO_TEMPLATE]);
    expect(c.templateMatch).toBeNull();
    expect(c.status).toBe("needs_review");
    expect(c.stagePreview).toEqual([]);
    expect(c.reviewReasons).toContain(
      "no journey_type recorded — matching a template without it would be a guess, not evidence",
    );
  });

  it("still does not match with no journey_type even if several published templates could narrow to one by elimination", () => {
    const other: PublishedTemplateRow = {
      id: "tpl-other",
      key: "add-on-standard",
      version: 1,
      name: "Add-on",
      journey_type: "add_on",
      status: "published",
    };
    const c = run(impl({ journey_type: null }), [], [], [NEW_LOGO_TEMPLATE, other]);
    expect(c.templateMatch).toBeNull();
    expect(c.status).toBe("needs_review");
  });

  it("surfaces any existing stage_instances rows for visibility even though no template could be confirmed", () => {
    const c = run(impl({ journey_type: null }), [], [existingRow("handoff")], [NEW_LOGO_TEMPLATE]);
    expect(c.templateMatch).toBeNull();
    expect(c.mismatch).toBeNull(); // nothing to compare against — never fabricated
    expect(c.existingStageKeys).toEqual(["handoff"]);
    expect(
      c.reviewReasons.some((r) => r.includes("1 existing stage_instances row(s) (handoff)")),
    ).toBe(true);
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

describe("previewOneImplementation — conflicting history is flagged, never silently clean", () => {
  it("flags more than one stage recorded with no exit, and keeps both recorded timestamps as-is", () => {
    const history: StageHistoryRow[] = [
      {
        implementation_id: "impl-1",
        stage: "plan-internal",
        entered_at: "2026-01-05T00:00:00Z",
        exited_at: null, // never recorded as exited...
      },
      {
        implementation_id: "impl-1",
        stage: "build", // ...yet "build" is also open. Cannot both be true.
        entered_at: "2026-01-12T00:00:00Z",
        exited_at: null,
      },
    ];
    const c = run(impl({ current_stage: "build" }), history);
    expect(c.status).toBe("needs_review"); // never "clean" despite an otherwise-fine match
    expect(c.templateMatch).not.toBeNull(); // the proposal is still shown, for review
    expect(c.historyConflicts).toHaveLength(1);
    expect(c.historyConflicts[0]).toMatch(
      /more than one stage has a history row with no recorded exit/,
    );
    expect(c.historyConflicts[0]).toContain("plan-internal");
    expect(c.historyConflicts[0]).toContain("build");
    // The real recorded dates are preserved verbatim, not altered or dropped.
    const planInternal = c.stagePreview.find((s) => s.stageKey === "plan-internal")!;
    expect(planInternal.enteredAt).toBe("2026-01-05T00:00:00Z");
    expect(planInternal.exitedAt).toBeNull();
  });

  it("flags a later stage recorded entered before an earlier one, without inventing a resolution", () => {
    const history: StageHistoryRow[] = [
      {
        implementation_id: "impl-1",
        stage: "handoff",
        entered_at: "2026-02-01T00:00:00Z",
        exited_at: "2026-02-03T00:00:00Z",
      },
      {
        implementation_id: "impl-1",
        // "build" (a later stage) is recorded as entered BEFORE "handoff" —
        // contradicts the template's own order.
        stage: "build",
        entered_at: "2026-01-10T00:00:00Z",
        exited_at: null,
      },
    ];
    const c = run(impl({ current_stage: "build" }), history);
    expect(c.status).toBe("needs_review");
    expect(c.historyConflicts.some((r) => r.includes('"build" is recorded entered'))).toBe(true);
    expect(c.historyConflicts.some((r) => r.includes("out of the template's order"))).toBe(true);
    // Both original timestamps are still exactly what was recorded.
    const handoff = c.stagePreview.find((s) => s.stageKey === "handoff")!;
    expect(handoff.enteredAt).toBe("2026-02-01T00:00:00Z");
    const build = c.stagePreview.find((s) => s.stageKey === "build")!;
    expect(build.enteredAt).toBe("2026-01-10T00:00:00Z");
  });

  it("is never excluded from the full-list preview while conflicted, even with a perfectly matching key set", () => {
    const history: StageHistoryRow[] = [
      {
        implementation_id: "impl-1",
        stage: "plan-internal",
        entered_at: "2026-01-05T00:00:00Z",
        exited_at: null,
      },
      {
        implementation_id: "impl-1",
        stage: "build",
        entered_at: "2026-01-12T00:00:00Z",
        exited_at: null,
      },
    ];
    const existing = NEW_LOGO_STAGES.map((s) => existingRow(s.stage_key)); // exact match, would otherwise be excluded
    const result = previewStageBackfill({
      implementations: [impl({ current_stage: "build" })],
      history,
      existingInstances: existing,
      templates: [NEW_LOGO_TEMPLATE],
      templateStages: NEW_LOGO_STAGES,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe("needs_review");
  });

  it("has no conflicts for ordinary sequential history", () => {
    const history: StageHistoryRow[] = [
      {
        implementation_id: "impl-1",
        stage: "handoff",
        entered_at: "2026-01-01T00:00:00Z",
        exited_at: "2026-01-03T00:00:00Z",
      },
      {
        implementation_id: "impl-1",
        stage: "build",
        entered_at: "2026-01-10T00:00:00Z",
        exited_at: null,
      },
    ];
    const c = run(impl({ current_stage: "build" }), history);
    expect(c.historyConflicts).toEqual([]);
    expect(c.status).toBe("clean");
  });
});

describe("previewStageBackfill — the full list", () => {
  it("includes a zero-instance implementation and a mismatched one, excludes an exactly-matching one", () => {
    const zero = impl({ id: "impl-zero", name: "Zero Co" });
    const partial = impl({ id: "impl-partial", name: "Partial Co" });
    const full = impl({ id: "impl-full", name: "Full Co" });
    const existing: ExistingStageInstanceRow[] = [
      { implementation_id: "impl-partial", stage_key: "handoff" },
      ...NEW_LOGO_STAGES.map((s) => ({ implementation_id: "impl-full", stage_key: s.stage_key })),
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
