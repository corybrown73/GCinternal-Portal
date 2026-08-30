/**
 * The editable post-sale lifecycle, as the rest of the app sees it.
 *
 * Design: docs/design/lifecycle-stages.md.
 *
 * `lifecycle.ts` next door stays the structural definition — the eight stage
 * IDS, their phases, and the descriptive role model. Those ids are named as
 * literals in roughly twenty-five places (`launch` gates the launch check,
 * `adopt` and `graduate-to-cs` drive graduation readiness and the CS handoff,
 * `handoff` is where a new project lands). This module is the layer above:
 * what each of those stages is CALLED, what it says it means, what colour it
 * is, and what order they come in.
 *
 * That split is the whole design. Renaming "Adopt" to "Embed" changes what
 * people read and nothing else, because nothing keys off the label.
 *
 * Everything downstream reads one shape, `LifecycleStageConfig[]`, whether it
 * came from `portal_lifecycle_stages` or from the built-in defaults below.
 *
 * Client-safe. No database, no flags — see lifecycle-stages.server.ts.
 */

import { LIFECYCLE_STAGES, type LifecyclePhase } from "./lifecycle";
import { STAGE_COLORS, type StageColor } from "./pipeline-stages";

export { STAGE_COLORS, type StageColor };

/** Mirrors `portal_lifecycle_stages_key_shape` in 0031. Hyphens, not underscores:
 *  the existing lifecycle ids are hyphenated and the key has to accept them. */
export const LIFECYCLE_STAGE_KEY_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;

export interface LifecycleStageConfig {
  key: string;
  label: string;
  intent: string | null;
  phase: LifecyclePhase;
  color: StageColor;
  sort_order: number;
  /**
   * True for the eight stages application code names as literals. They can be
   * renamed, recoloured and reordered; they cannot be deleted, and their key
   * cannot change. 0031 enforces both.
   */
  is_builtin: boolean;
}

const DEFAULT_COLORS: Record<string, StageColor> = {
  handoff: "primary",
  "plan-internal": "idle",
  "align-external": "primary",
  build: "primary",
  "validate-iterate": "risk",
  launch: "ontrack",
  adopt: "ontrack",
  "graduate-to-cs": "ontrack",
};

/**
 * The compiled-in lifecycle: LIFECYCLE_STAGES, in order, with the labels and
 * intents the UI has always rendered. It is what 0031 seeds, and what the app
 * falls back to when the flag is off, the table is empty, or the read fails —
 * so a deploy landing ahead of its migration behaves exactly like today.
 */
export const BUILTIN_LIFECYCLE_STAGES: readonly LifecycleStageConfig[] = LIFECYCLE_STAGES.map(
  (s, i) => ({
    key: s.id,
    label: s.label,
    intent: s.intent,
    phase: s.phase,
    color: DEFAULT_COLORS[s.id] ?? "idle",
    sort_order: i + 1,
    is_builtin: true,
  }),
);

/** The eight keys the application names directly. Mirrors the 0031 trigger. */
export const REQUIRED_LIFECYCLE_KEYS: readonly string[] = BUILTIN_LIFECYCLE_STAGES.map(
  (s) => s.key,
);

export function findLifecycleStage(
  stages: readonly LifecycleStageConfig[],
  key: string | null | undefined,
): LifecycleStageConfig | null {
  if (!key) return null;
  return stages.find((s) => s.key === key) ?? null;
}

/**
 * Label for display, falling back to the raw key.
 *
 * The fallback is load-bearing rather than defensive: a project can sit in a
 * stage that has since been deleted, and history certainly can. Rendering the
 * key is ugly; rendering blank loses the fact that it was somewhere.
 */
export function lifecycleLabel(
  stages: readonly LifecycleStageConfig[],
  key: string | null | undefined,
): string {
  if (!key) return "";
  return findLifecycleStage(stages, key)?.label ?? key;
}

/** Position in the configured order, or -1 for a stage nobody configured. */
export function lifecycleOrder(
  stages: readonly LifecycleStageConfig[],
  key: string | null | undefined,
): number {
  if (!key) return -1;
  return stages.findIndex((s) => s.key === key);
}

/**
 * Rows from the database, projected and ordered — or the built-in list when
 * there is nothing configured.
 *
 * Falling back on an EMPTY list rather than returning one is deliberate: an
 * empty lifecycle would render an app with no stages at all, which looks like
 * a data loss rather than a configuration nobody has touched.
 */
export function readLifecycleStages(rows: unknown): LifecycleStageConfig[] {
  if (!Array.isArray(rows) || rows.length === 0) return [...BUILTIN_LIFECYCLE_STAGES];
  const out: LifecycleStageConfig[] = [];
  for (const raw of rows as Record<string, unknown>[]) {
    const key = typeof raw["key"] === "string" ? raw["key"] : null;
    if (!key) continue;
    const color = raw["color"];
    const phase = raw["phase"];
    out.push({
      key,
      label: typeof raw["label"] === "string" && raw["label"].length > 0 ? raw["label"] : key,
      intent: typeof raw["intent"] === "string" ? raw["intent"] : null,
      // An unrecognised value from hand-edited config resolves to something
      // that renders rather than to undefined.
      phase: isPhase(phase) ? phase : "delivery",
      color: isColor(color) ? color : "idle",
      sort_order: typeof raw["sort_order"] === "number" ? raw["sort_order"] : out.length + 1,
      is_builtin: raw["is_builtin"] === true,
    });
  }
  if (out.length === 0) return [...BUILTIN_LIFECYCLE_STAGES];
  return out.sort((a, b) => a.sort_order - b.sort_order);
}

const PHASES: readonly LifecyclePhase[] = ["intake", "delivery", "value", "steady-state"];

function isPhase(v: unknown): v is LifecyclePhase {
  return typeof v === "string" && (PHASES as readonly string[]).includes(v);
}

function isColor(v: unknown): v is StageColor {
  return typeof v === "string" && (STAGE_COLORS as readonly string[]).includes(v);
}

export const LIFECYCLE_PHASE_LABELS: Record<LifecyclePhase, string> = {
  intake: "Intake",
  delivery: "Delivery",
  value: "Value",
  "steady-state": "Steady state",
};
