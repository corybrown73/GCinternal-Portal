import { CONFIG_DEFAULTS, getConfigValue } from "../app-config";

/**
 * The one place that says which model, how hard it thinks, and how big a
 * document it reads. Every AI call site reads these; none hard-codes a model.
 */

export const AI_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type AiEffort = (typeof AI_EFFORTS)[number];

/** What a call is for — the usage row names it, and the effort may differ by kind. */
export type AiCallKind =
  | "brief"
  | "verify"
  | "sow_plan"
  | "sow_analysis"
  | "transcript"
  | "help_picks"
  | "sow_reading"
  | "brief_core"
  | "brief_plan";

/**
 * One model call may run this long, headers and streamed body together,
 * including the SDK's single connection retry: under Vercel's 300s ceiling
 * with room to write. A reading with a repair turn is two calls, which is
 * why the readings belong in background jobs rather than a web request.
 */
export const AI_CALL_TIMEOUT_MS = 240_000;

/** A PDF or Word document past this is reported, not silently dropped. */
export const MAX_DOC_BYTES = 20_000_000;

export function aiModel(): string {
  return process.env["ANTHROPIC_MODEL"]?.trim() || "claude-opus-5-5";
}

export function aiConfigured(): boolean {
  return Boolean(process.env["ANTHROPIC_API_KEY"]);
}

export function isAiEffort(v: unknown): v is AiEffort {
  return typeof v === "string" && (AI_EFFORTS as readonly string[]).includes(v);
}

/**
 * The effort for a kind of call, from `portal_app_config` key `ai.effort`.
 * The value is one level for everything ("high"), or an object with a
 * `default` and per-kind overrides ({ default: "high", brief: "xhigh" }).
 * The three brief passes (`brief_core`, `brief_plan`, `verify`) all run
 * at the `brief` kind's effort, decided once per brief, so their shared
 * cached prefix is sent with the same parameters every time. Anything
 * else falls back to the seeded default.
 */
export async function aiEffort(kind: AiCallKind): Promise<AiEffort> {
  const value = await getConfigValue("ai.effort");
  if (isAiEffort(value)) return value;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (isAiEffort(o[kind])) return o[kind];
    if (isAiEffort(o["default"])) return o["default"];
  }
  return CONFIG_DEFAULTS["ai.effort"];
}
