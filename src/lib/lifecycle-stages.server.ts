import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isFlagOn } from "./app-config.server";
import { audit } from "./server/audit";
import {
  BUILTIN_LIFECYCLE_STAGES,
  LIFECYCLE_STAGE_KEY_PATTERN,
  readLifecycleStages,
  STAGE_COLORS,
  type LifecycleStageConfig,
  type StageColor,
} from "./lifecycle-stages";
import type { LifecyclePhase } from "./lifecycle";

/* ------------------------------------------------------------------------- */
/* The configured post-sale lifecycle: one read, one projection.              */
/*                                                                           */
/* Design: docs/design/lifecycle-stages.md.                                  */
/*                                                                           */
/* AUTHORIZATION. Reads are internal-only (the serverFn middleware). Writes   */
/* are manage-level, asserted in lifecycle-stages.functions.ts. RLS is not    */
/* the mechanism and could not be: everything here runs on the service-role   */
/* client and bypasses it. The guarantees that matter — a built-in stage      */
/* cannot be deleted, a key cannot be rewritten, an occupied stage cannot be  */
/* dropped — are TRIGGERS in 0031, not policies.                             */
/* ------------------------------------------------------------------------- */

const db = () => supabaseAdmin as any;

const COLUMNS = "key, label, intent, phase, color, sort_order, is_builtin";

/** Shorter than the flag cache: an admin edit should show on the next page. */
const CACHE_MS = 15_000;
let cache: { at: number; stages: LifecycleStageConfig[] } | null = null;

export function resetLifecycleStageCache(): void {
  cache = null;
}

function isColor(v: string): v is StageColor {
  return (STAGE_COLORS as readonly string[]).includes(v);
}

/**
 * The lifecycle every surface reads.
 *
 * Three ways to get the built-in list, all of them the pre-0031 behaviour
 * rather than an error:
 *  - the flag is off — the table is not touched at all, which is what makes
 *    this safe to deploy ahead of its migration;
 *  - the table is empty — an org has a complete configuration or none;
 *  - the read failed — the stage rail must not take a page down because a
 *    config table is unreadable.
 */
export async function loadLifecycleStages(): Promise<LifecycleStageConfig[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.stages;

  if (!(await isFlagOn("lifecycle_stage_config"))) {
    return [...BUILTIN_LIFECYCLE_STAGES];
  }

  try {
    const { data, error } = await db()
      .from("portal_lifecycle_stages")
      .select(COLUMNS)
      .order("sort_order");
    if (error) throw new Error(error.message);
    const stages = readLifecycleStages(data);
    cache = { at: Date.now(), stages };
    return stages;
  } catch (e) {
    console.error("[lifecycle-stages] could not read the configured stages; using defaults", e);
    return [...BUILTIN_LIFECYCLE_STAGES];
  }
}

/* ========================================================================= */
/* Admin                                                                     */
/* ========================================================================= */

export interface LifecycleStageAdminRow extends LifecycleStageConfig {
  /** Why a delete would be refused, and a number the operator can act on. */
  project_count: number;
  /** Whether the stage appears anywhere in the recorded history. */
  in_history: boolean;
}

export interface LifecycleStageAdminView {
  flagOn: boolean;
  configured: boolean;
  stages: LifecycleStageAdminRow[];
}

/**
 * With the flag off this returns the built-in list with `configured: false` and
 * no counts, and never touches the new table — so the admin page renders and
 * explains itself on a deployment where 0031 has not been applied.
 */
export async function loadLifecycleStageAdminView(): Promise<LifecycleStageAdminView> {
  const flagOn = await isFlagOn("lifecycle_stage_config");
  if (!flagOn) {
    return {
      flagOn: false,
      configured: false,
      stages: BUILTIN_LIFECYCLE_STAGES.map((s) => ({
        ...s,
        project_count: 0,
        in_history: false,
      })),
    };
  }

  const [stagesResult, projects, history] = await Promise.all([
    db().from("portal_lifecycle_stages").select(COLUMNS).order("sort_order"),
    db().from("implementations").select("current_stage"),
    db().from("implementation_stage_history").select("stage"),
  ]);
  if (stagesResult.error) throw new Error(stagesResult.error.message);

  const counts = new Map<string, number>();
  for (const row of (projects.data ?? []) as { current_stage: string }[]) {
    counts.set(row.current_stage, (counts.get(row.current_stage) ?? 0) + 1);
  }
  const seen = new Set<string>();
  for (const row of (history.data ?? []) as { stage: string }[]) seen.add(row.stage);

  const rows = (stagesResult.data ?? []) as unknown[];
  const configured = rows.length > 0;
  const stages = readLifecycleStages(rows);

  return {
    flagOn: true,
    configured,
    stages: stages.map((s) => ({
      ...s,
      project_count: counts.get(s.key) ?? 0,
      in_history: seen.has(s.key),
    })),
  };
}

/**
 * Every write refuses when the flag is off, because the table it writes to may
 * not exist on that deployment. This is a schema-presence check, not an
 * authorization check — those are never flag-gated.
 */
async function requireConfigEnabled(): Promise<void> {
  if (!(await isFlagOn("lifecycle_stage_config"))) {
    throw new Error(
      "Editable post-sale stages are not enabled on this deployment. The lifecycle is using its built-in stages.",
    );
  }
}

async function afterWrite(
  actorId: string,
  action: string,
  payload: Record<string, unknown>,
): Promise<LifecycleStageAdminView> {
  resetLifecycleStageCache();
  await audit({
    actor_type: "user",
    actor_id: actorId,
    action,
    entity_type: "lifecycle_stage",
    entity_id: String(payload["key"] ?? ""),
    payload,
  });
  return loadLifecycleStageAdminView();
}

/**
 * Renaming, re-intenting, recolouring. `key` is deliberately not settable: the
 * stage history and twenty-five call sites refer to a stage by its key, and
 * 0031's trigger refuses the change anyway.
 */
export async function updateLifecycleStage(
  actorId: string,
  input: { key: string; label: string; intent: string | null; color: string },
): Promise<LifecycleStageAdminView> {
  await requireConfigEnabled();
  const label = input.label.trim();
  if (label.length < 1 || label.length > 60) {
    throw new Error("A stage label is between 1 and 60 characters.");
  }
  const intent = input.intent?.trim() ? input.intent.trim().slice(0, 400) : null;
  const color: StageColor = isColor(input.color) ? input.color : "idle";

  const { data, error } = await db()
    .from("portal_lifecycle_stages")
    .update({ label, intent, color })
    .eq("key", input.key)
    .select("key")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No stage "${input.key}" is configured.`);

  return afterWrite(actorId, "lifecycle_stage.update", { key: input.key, label, color });
}

const PHASES: readonly LifecyclePhase[] = ["intake", "delivery", "value", "steady-state"];

export async function createLifecycleStage(
  actorId: string,
  input: { key: string; label: string; intent: string | null; phase: string; color: string },
): Promise<LifecycleStageAdminView> {
  await requireConfigEnabled();
  const key = input.key.trim().toLowerCase();
  if (!LIFECYCLE_STAGE_KEY_PATTERN.test(key)) {
    throw new Error(
      "A stage key is 2–40 lowercase letters, digits and hyphens, starting with a letter — it is the identity the history refers to and it can never be changed.",
    );
  }

  const { data: existing } = await db()
    .from("portal_lifecycle_stages")
    .select("key")
    .eq("key", key)
    .maybeSingle();
  if (existing) throw new Error(`A stage with the key "${key}" already exists.`);

  const { data: last } = await db()
    .from("portal_lifecycle_stages")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await db()
    .from("portal_lifecycle_stages")
    .insert({
      key,
      label: input.label.trim(),
      intent: input.intent?.trim() ? input.intent.trim().slice(0, 400) : null,
      phase: (PHASES as readonly string[]).includes(input.phase) ? input.phase : "delivery",
      color: isColor(input.color) ? input.color : "idle",
      sort_order: Number(last?.sort_order ?? 0) + 1,
      // Never true from here. Being built in is a fact about the application
      // code, and 0031's trigger refuses to let an UPDATE change it either.
      is_builtin: false,
    });
  if (error) throw new Error(error.message);

  return afterWrite(actorId, "lifecycle_stage.create", { key, label: input.label.trim() });
}

/** Reordering is one atomic statement in the RPC; a partial list is refused there. */
export async function reorderLifecycleStages(
  actorId: string,
  keys: string[],
): Promise<LifecycleStageAdminView> {
  await requireConfigEnabled();
  const { error } = await db().rpc("portal_set_lifecycle_stage_order", { p_keys: keys });
  if (error) throw new Error(error.message);
  return afterWrite(actorId, "lifecycle_stage.reorder", { key: "", order: keys });
}

/**
 * The two checks are repeated here only so the UI gets a good message without a
 * round trip through a raised exception. The GUARANTEE is 0031's before-delete
 * trigger, because every path into this database is service-role.
 */
export async function deleteLifecycleStage(
  actorId: string,
  key: string,
): Promise<LifecycleStageAdminView> {
  await requireConfigEnabled();

  const { data: stage } = await db()
    .from("portal_lifecycle_stages")
    .select("key, label, is_builtin")
    .eq("key", key)
    .maybeSingle();
  if (!stage) throw new Error(`No stage "${key}" is configured.`);
  if (stage.is_builtin) {
    throw new Error(
      `“${stage.label}” cannot be deleted: the application keys off it — launch gates, graduation readiness, the CS handoff and the Salesforce bridge all name specific stages. Rename it instead; that changes what people read and nothing else.`,
    );
  }

  const { count } = await db()
    .from("implementations")
    .select("id", { count: "exact", head: true })
    .eq("current_stage", key);
  if ((count ?? 0) > 0) {
    throw new Error(
      `“${stage.label}” cannot be deleted: ${count} project${count === 1 ? " is" : "s are"} in it. Move ${count === 1 ? "it" : "them"} to another stage first.`,
    );
  }

  const { error } = await db().from("portal_lifecycle_stages").delete().eq("key", key);
  if (error) throw new Error(error.message);

  return afterWrite(actorId, "lifecycle_stage.delete", { key, label: stage.label });
}
