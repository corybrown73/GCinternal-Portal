import type { JsonValue } from "./journey-conditions";

/**
 * Pure helpers for the journey-template WRITE path. Type-only imports, no I/O:
 * safe in the client bundle and directly testable.
 *
 * The load-bearing rule lives in the copy helpers. A new template VERSION is a
 * deep copy of an existing one, and `stage_key` / `task_key` are the identity
 * that MUST survive that copy: uuids are storage (they are regenerated per
 * copy), keys are what drift matching across versions compares and what
 * `include_when` and `depends_on_keys` name. So the copy carries every column
 * verbatim and rewrites only the three that are storage — the row's own id,
 * its parent template, and (for tasks) its parent stage.
 */

/** Columns that are storage or bookkeeping and must never be carried over. */
const NEVER_COPIED = new Set(["id", "created_at", "updated_at"]);

export type TemplateChildRow = Record<string, unknown> & { id: string };
export type SourceStageRow = TemplateChildRow & { stage_key: string };
export type SourceTaskRow = TemplateChildRow & { template_stage_id: string; task_key: string };
export type SourceQuestionRow = TemplateChildRow & { key: string };

export interface CopyTarget {
  templateId: string;
  orgId: string;
}

/** Everything except the never-copied columns, then the explicit rewrites. */
function carryOver(
  row: Readonly<Record<string, unknown>>,
  overrides: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    if (NEVER_COPIED.has(column)) continue;
    out[column] = value;
  }
  return { ...out, ...overrides };
}

export function copyStageRows(
  stages: readonly SourceStageRow[],
  target: CopyTarget,
): Record<string, unknown>[] {
  return stages.map((stage) =>
    carryOver(stage, { template_id: target.templateId, org_id: target.orgId }),
  );
}

export function copyQuestionRows(
  questions: readonly SourceQuestionRow[],
  target: CopyTarget,
): Record<string, unknown>[] {
  return questions.map((question) =>
    carryOver(question, { template_id: target.templateId, org_id: target.orgId }),
  );
}

/**
 * Old stage id -> new stage id, matched by `stage_key`.
 *
 * The copied rows come back from the insert with fresh uuids, so the ONLY
 * thing that can pair a source stage with its copy is the key. A key that did
 * not survive is a corrupt copy, not a recoverable state: it would silently
 * strand every task in that stage, so it throws.
 */
export function mapStageIdsByKey(
  sourceStages: readonly { id: string; stage_key: string }[],
  copiedStages: readonly { id: string; stage_key: string }[],
): Map<string, string> {
  const newIdByKey = new Map(copiedStages.map((stage) => [stage.stage_key, stage.id]));
  const byOldId = new Map<string, string>();
  for (const stage of sourceStages) {
    const copiedId = newIdByKey.get(stage.stage_key);
    if (!copiedId) {
      throw new Error(`Copy lost stage "${stage.stage_key}" — the new version was not created.`);
    }
    byOldId.set(stage.id, copiedId);
  }
  return byOldId;
}

export function copyTaskRows(
  tasks: readonly SourceTaskRow[],
  target: CopyTarget,
  stageIdByOldId: ReadonlyMap<string, string>,
): Record<string, unknown>[] {
  return tasks.map((task) => {
    const stageId = stageIdByOldId.get(task.template_stage_id);
    if (!stageId) {
      throw new Error(
        `Task "${task.task_key}" belongs to a stage that was not copied — the new version was not created.`,
      );
    }
    return carryOver(task, {
      template_id: target.templateId,
      org_id: target.orgId,
      template_stage_id: stageId,
    });
  });
}

/* ------------------------------------------------------------------------- */
/* Ordering                                                                   */
/* ------------------------------------------------------------------------- */

/** 1-based next position for an append. */
export function nextPosition(rows: readonly { position: number }[]): number {
  return rows.reduce((max, row) => Math.max(max, row.position), 0) + 1;
}

/**
 * The full new order after nudging one id by `delta`. Returns a copy of the
 * input unchanged when the move would fall off either end, so a "move up" on
 * the first row is a no-op rather than an error.
 */
export function moveInOrder(ids: readonly string[], id: string, delta: number): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  const moved = next[from] as string;
  next[from] = next[to] as string;
  next[to] = moved;
  return next;
}

/**
 * A reorder must be a permutation of exactly what is there — no additions, no
 * omissions, no duplicates. The RPC renumbers by position in the array, so a
 * short list would leave rows behind at stale positions.
 */
export function isSameIdSet(existing: readonly string[], ordered: readonly string[]): boolean {
  if (existing.length !== ordered.length) return false;
  if (new Set(ordered).size !== ordered.length) return false;
  const have = new Set(existing);
  return ordered.every((id) => have.has(id));
}

/* ------------------------------------------------------------------------- */
/* include_when authoring                                                     */
/* ------------------------------------------------------------------------- */

export type ParsedIncludeWhen =
  { ok: true; value: Record<string, JsonValue> | null } | { ok: false; error: string };

/**
 * The editor writes `include_when` as raw JSON, so this is the one place a
 * typo can reach the database. Empty means "always included" (a SQL null);
 * anything else must be a JSON object keyed by scoping-question key, because
 * the evaluator treats a scalar or array as "no condition at all" — an author
 * who pasted a list would silently get an unconditional task.
 */
export function parseIncludeWhen(raw: string): ParsedIncludeWhen {
  const text = raw.trim();
  if (!text) return { ok: true, value: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `That is not valid JSON: ${detail}` };
  }

  if (parsed === null) return { ok: true, value: null };
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error:
        'A condition must be a JSON object keyed by scoping-question key, e.g. {"has_integration": true}. Leave the box empty for a task that is always included.',
    };
  }
  if (Object.keys(parsed).length === 0) return { ok: true, value: null };
  return { ok: true, value: parsed as Record<string, JsonValue> };
}

/** The textarea's starting value for a stored condition. */
export function formatIncludeWhenJson(value: unknown): string {
  if (value == null) return "";
  return JSON.stringify(value, null, 2);
}

/* ------------------------------------------------------------------------- */
/* Small authoring conversions                                                */
/* ------------------------------------------------------------------------- */

/** "a, b b2 ,, c" -> ["a", "b", "b2", "c"]; order kept, duplicates dropped. */
export function parseKeyList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,]+/)) {
    const key = part.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Comma-separated scoping-question options; empty means "no option list". */
export function parseOptionList(raw: string): string[] | null {
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const option = part.trim();
    if (option) out.push(option);
  }
  return out.length > 0 ? out : null;
}

export function formatOptionList(options: unknown): string {
  return Array.isArray(options) ? options.map((o) => String(o)).join(", ") : "";
}

/* ------------------------------------------------------------------------- */
/* The schema's enumerations                                                  */
/*                                                                            */
/* Mirrors of 0013's CHECK constraints. They live in this pure module because */
/* both the zod validators (server) and the authoring form (client) need them */
/* and neither may import the other's module.                                 */
/* ------------------------------------------------------------------------- */

export const JOURNEY_TYPES = [
  "new_logo",
  "add_on",
  "integration",
  "data_migration",
  "rollout",
  "recovery",
] as const;
export const STAGE_PHASES = ["intake", "delivery", "value", "steady_state"] as const;
export const GATE_MODES = ["advisory", "warn", "blocking"] as const;
export const PARTIES = ["internal", "customer", "partner"] as const;
export const VISIBILITIES = ["internal", "shared"] as const;
export const OFFSET_BASES = ["project_start", "stage_entry", "target_launch"] as const;
export const QUESTION_KINDS = ["boolean", "select", "multi_select", "number", "text"] as const;

export type JourneyType = (typeof JOURNEY_TYPES)[number];
export type StagePhase = (typeof STAGE_PHASES)[number];
export type GateMode = (typeof GATE_MODES)[number];
export type Party = (typeof PARTIES)[number];
export type Visibility = (typeof VISIBILITIES)[number];
export type OffsetBasis = (typeof OFFSET_BASES)[number];
export type QuestionKind = (typeof QUESTION_KINDS)[number];

/** Keys are identity across versions, so they are slug-shaped and stable. */
export const TEMPLATE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
