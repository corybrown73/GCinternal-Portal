import { describe, expect, it } from "vitest";
import {
  copyQuestionRows,
  copyStageRows,
  copyTaskRows,
  formatIncludeWhenJson,
  isSameIdSet,
  mapStageIdsByKey,
  moveInOrder,
  nextPosition,
  parseIncludeWhen,
  parseKeyList,
  parseOptionList,
  type SourceStageRow,
  type SourceTaskRow,
} from "../template-draft";

/**
 * The write side of the template builder. Published content is frozen in the
 * database, so the ONLY way to change a template is to deep-copy the live
 * version into a new draft — and a copy that loses `stage_key` / `task_key`
 * silently breaks drift matching, conditions and dependencies across versions.
 * These are pinned deliberately.
 */

const TARGET = { templateId: "tpl-v2", orgId: "org-1" };

const SOURCE_STAGES: SourceStageRow[] = [
  {
    id: "stage-old-1",
    org_id: "org-1",
    template_id: "tpl-v1",
    position: 1,
    stage_key: "kickoff",
    name: "Kickoff",
    phase: "intake",
    purpose: "Meet the team",
    gate_mode: "advisory",
    target_duration_days: 5,
    entry_criteria: [],
    exit_criteria: ["kickoff_held"],
    required_artifacts: ["agenda"],
    source_block_id: "block-1",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "stage-old-2",
    org_id: "org-1",
    template_id: "tpl-v1",
    position: 2,
    stage_key: "build",
    name: "Build",
    phase: "delivery",
    purpose: null,
    gate_mode: "blocking",
    target_duration_days: null,
    entry_criteria: [],
    exit_criteria: [],
    required_artifacts: [],
    source_block_id: null,
    created_at: "2026-01-01T00:00:00Z",
  },
];

const SOURCE_TASKS: SourceTaskRow[] = [
  {
    id: "task-old-1",
    org_id: "org-1",
    template_id: "tpl-v1",
    template_stage_id: "stage-old-1",
    position: 1,
    task_key: "send_welcome",
    title: "Send welcome pack",
    description: null,
    role_key: "implementation_manager",
    party: "internal",
    visibility: "shared",
    offset_basis: "stage_entry",
    offset_days: 0,
    duration_days: 2,
    is_optional: false,
    include_when: null,
    depends_on_keys: [],
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "task-old-2",
    org_id: "org-1",
    template_id: "tpl-v1",
    template_stage_id: "stage-old-2",
    position: 1,
    task_key: "build_integration",
    title: "Build the integration",
    description: "Only when they bought one",
    role_key: "tam",
    party: "internal",
    visibility: "internal",
    offset_basis: "project_start",
    offset_days: 14,
    duration_days: 10,
    is_optional: true,
    include_when: { has_integration: true },
    depends_on_keys: ["send_welcome"],
    created_at: "2026-01-01T00:00:00Z",
  },
];

/** What the insert returns: same keys, brand-new uuids. */
const COPIED_STAGES = [
  { id: "stage-new-1", stage_key: "kickoff" },
  { id: "stage-new-2", stage_key: "build" },
];

describe("copyStageRows", () => {
  it("preserves stage_key and every content column", () => {
    const [kickoff] = copyStageRows(SOURCE_STAGES, TARGET);
    expect(kickoff?.["stage_key"]).toBe("kickoff");
    expect(kickoff?.["name"]).toBe("Kickoff");
    expect(kickoff?.["phase"]).toBe("intake");
    expect(kickoff?.["gate_mode"]).toBe("advisory");
    expect(kickoff?.["position"]).toBe(1);
    expect(kickoff?.["exit_criteria"]).toEqual(["kickoff_held"]);
    expect(kickoff?.["required_artifacts"]).toEqual(["agenda"]);
    expect(kickoff?.["source_block_id"]).toBe("block-1");
  });

  it("re-parents the copy and drops the source row's identity", () => {
    const rows = copyStageRows(SOURCE_STAGES, TARGET);
    for (const row of rows) {
      expect(row["template_id"]).toBe("tpl-v2");
      expect(row["org_id"]).toBe("org-1");
      expect(row).not.toHaveProperty("id");
      expect(row).not.toHaveProperty("created_at");
    }
  });

  it("copies every stage, in source order", () => {
    expect(copyStageRows(SOURCE_STAGES, TARGET).map((r) => r["stage_key"])).toEqual([
      "kickoff",
      "build",
    ]);
  });
});

describe("mapStageIdsByKey", () => {
  it("pairs source stages with their copies by key, not by uuid", () => {
    const map = mapStageIdsByKey(SOURCE_STAGES, COPIED_STAGES);
    expect(map.get("stage-old-1")).toBe("stage-new-1");
    expect(map.get("stage-old-2")).toBe("stage-new-2");
  });

  it("pairs correctly even when the insert returns rows in another order", () => {
    const map = mapStageIdsByKey(SOURCE_STAGES, [...COPIED_STAGES].reverse());
    expect(map.get("stage-old-1")).toBe("stage-new-1");
    expect(map.get("stage-old-2")).toBe("stage-new-2");
  });

  it("throws when a key did not survive the copy", () => {
    expect(() => mapStageIdsByKey(SOURCE_STAGES, [COPIED_STAGES[0]!])).toThrow(/build/);
  });
});

describe("copyTaskRows", () => {
  const map = mapStageIdsByKey(SOURCE_STAGES, COPIED_STAGES);

  it("preserves task_key, include_when and depends_on_keys verbatim", () => {
    const [, integration] = copyTaskRows(SOURCE_TASKS, TARGET, map);
    expect(integration?.["task_key"]).toBe("build_integration");
    expect(integration?.["include_when"]).toEqual({ has_integration: true });
    expect(integration?.["depends_on_keys"]).toEqual(["send_welcome"]);
    expect(integration?.["is_optional"]).toBe(true);
    expect(integration?.["offset_basis"]).toBe("project_start");
    expect(integration?.["offset_days"]).toBe(14);
    expect(integration?.["duration_days"]).toBe(10);
    expect(integration?.["position"]).toBe(1);
  });

  it("re-points each task at the COPY of its own stage", () => {
    const rows = copyTaskRows(SOURCE_TASKS, TARGET, map);
    expect(rows[0]?.["template_stage_id"]).toBe("stage-new-1");
    expect(rows[1]?.["template_stage_id"]).toBe("stage-new-2");
    expect(rows.every((r) => r["template_id"] === "tpl-v2")).toBe(true);
  });

  it("a dependency named by task_key still resolves inside the copy", () => {
    const rows = copyTaskRows(SOURCE_TASKS, TARGET, map);
    const keys = new Set(rows.map((r) => r["task_key"]));
    for (const row of rows) {
      for (const dep of (row["depends_on_keys"] as string[]) ?? []) {
        expect(keys.has(dep)).toBe(true);
      }
    }
  });

  it("throws rather than orphaning a task whose stage was not copied", () => {
    expect(() =>
      copyTaskRows(SOURCE_TASKS, TARGET, new Map([["stage-old-1", "stage-new-1"]])),
    ).toThrow(/build_integration/);
  });
});

describe("copyQuestionRows", () => {
  it("preserves the question key that conditions reference", () => {
    const rows = copyQuestionRows(
      [
        {
          id: "q-old",
          org_id: "org-1",
          template_id: "tpl-v1",
          position: 1,
          key: "has_integration",
          prompt: "Did they buy an integration?",
          kind: "boolean",
          options: null,
          required: true,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      TARGET,
    );
    expect(rows[0]?.["key"]).toBe("has_integration");
    expect(rows[0]?.["required"]).toBe(true);
    expect(rows[0]?.["template_id"]).toBe("tpl-v2");
    expect(rows[0]).not.toHaveProperty("id");
  });
});

describe("nextPosition", () => {
  it("appends after the highest position, not after the count", () => {
    expect(nextPosition([{ position: 1 }, { position: 7 }])).toBe(8);
  });
  it("starts at 1 on an empty version", () => {
    expect(nextPosition([])).toBe(1);
  });
});

describe("moveInOrder", () => {
  const ids = ["a", "b", "c"];
  it("swaps with the neighbour in the given direction", () => {
    expect(moveInOrder(ids, "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInOrder(ids, "b", 1)).toEqual(["a", "c", "b"]);
  });
  it("is a no-op at either end, and for an unknown id", () => {
    expect(moveInOrder(ids, "a", -1)).toEqual(ids);
    expect(moveInOrder(ids, "c", 1)).toEqual(ids);
    expect(moveInOrder(ids, "zzz", 1)).toEqual(ids);
  });
  it("never mutates the input", () => {
    const original = [...ids];
    moveInOrder(ids, "b", 1);
    expect(ids).toEqual(original);
  });
});

describe("isSameIdSet", () => {
  it("accepts a permutation", () => {
    expect(isSameIdSet(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
  });
  it("rejects a short, extended or duplicated list", () => {
    expect(isSameIdSet(["a", "b"], ["a"])).toBe(false);
    expect(isSameIdSet(["a", "b"], ["a", "b", "c"])).toBe(false);
    expect(isSameIdSet(["a", "b"], ["a", "a"])).toBe(false);
  });
});

describe("parseIncludeWhen", () => {
  it("treats empty input as unconditional", () => {
    expect(parseIncludeWhen("")).toEqual({ ok: true, value: null });
    expect(parseIncludeWhen("   \n ")).toEqual({ ok: true, value: null });
    expect(parseIncludeWhen("null")).toEqual({ ok: true, value: null });
    expect(parseIncludeWhen("{}")).toEqual({ ok: true, value: null });
  });

  it("accepts an object of clauses", () => {
    expect(parseIncludeWhen('{"seats": {">": 50}}')).toEqual({
      ok: true,
      value: { seats: { ">": 50 } },
    });
  });

  it("rejects malformed JSON with a readable message", () => {
    const result = parseIncludeWhen("{seats: 50}");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not valid JSON/);
  });

  it("rejects a scalar or array, which the evaluator would read as no condition", () => {
    expect(parseIncludeWhen("[1,2]").ok).toBe(false);
    expect(parseIncludeWhen('"yes"').ok).toBe(false);
    expect(parseIncludeWhen("42").ok).toBe(false);
  });

  it("round-trips through the textarea formatter", () => {
    const stored = { has_integration: true };
    const parsed = parseIncludeWhen(formatIncludeWhenJson(stored));
    expect(parsed).toEqual({ ok: true, value: stored });
    expect(formatIncludeWhenJson(null)).toBe("");
  });
});

describe("parseKeyList / parseOptionList", () => {
  it("splits on commas and whitespace, dropping blanks and duplicates", () => {
    expect(parseKeyList(" send_welcome, build_integration ,, send_welcome ")).toEqual([
      "send_welcome",
      "build_integration",
    ]);
    expect(parseKeyList("  ")).toEqual([]);
  });

  it("keeps option labels intact (spaces included) and nulls an empty list", () => {
    expect(parseOptionList("Salesforce, NetSuite , ")).toEqual(["Salesforce", "NetSuite"]);
    expect(parseOptionList("  ")).toBeNull();
  });
});
