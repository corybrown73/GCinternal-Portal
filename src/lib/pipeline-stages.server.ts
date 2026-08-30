import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isFlagOn } from "./app-config.server";
import { audit } from "./server/audit";
import {
  BUILTIN_PIPELINE_STAGES,
  isStageColor,
  PIPELINE_STAGE_KEY_PATTERN,
  type PipelineStage,
  type StageColor,
} from "./pipeline-stages";

/* ------------------------------------------------------------------------- */
/* The configured pre-sale pipeline: one read, one projection.                */
/*                                                                           */
/* Design: docs/design/presale-stages.md.                                    */
/*                                                                           */
/* AUTHORIZATION. Reads are internal-only (the serverFn middleware). Writes   */
/* are manage-level, asserted in pipeline-stages.functions.ts via             */
/* assertCanManage(context.profile) — the templates.functions.ts pattern.     */
/* RLS is not the mechanism and could not be: everything here runs on the     */
/* service-role client and bypasses it. The DB-level guarantees that matter   */
/* (an occupied stage cannot be deleted, a key cannot be rewritten, exactly   */
/* one won stage) are TRIGGERS in 0028, not policies.                        */
/* ------------------------------------------------------------------------- */

const db = () => supabaseAdmin as any;

/** Shorter than the flag cache: an admin edit should show up on the next page. */
const CACHE_MS = 15_000;
let cache: { at: number; stages: PipelineStage[] } | null = null;

/** Test seam, and what the write paths call so an edit is visible immediately. */
export function resetPipelineStageCache(): void {
  cache = null;
}

type StageRow = {
  key: string;
  label: string;
  color: string;
  sort_order: number;
  is_won: boolean;
  is_terminal: boolean;
  enterable: boolean;
};

function toStage(row: StageRow): PipelineStage {
  return {
    key: String(row.key),
    label: String(row.label),
    color: isStageColor(row.color) ? row.color : "idle",
    sort_order: Number(row.sort_order ?? 0),
    is_won: row.is_won === true,
    is_terminal: row.is_terminal === true,
    enterable: row.enterable === true,
  };
}

/**
 * The pipeline every surface reads.
 *
 * Three ways to get the built-in list, and all three are the pre-0028
 * behaviour rather than an error:
 *  - the flag is off — the database is not touched at all, which is what makes
 *    this safe to deploy ahead of its migration;
 *  - the table is empty — an org either has a complete configuration or none;
 *  - the read failed — a pipeline board must not go down because a config
 *    table is missing or unreadable.
 */
export async function loadPipelineStages(): Promise<PipelineStage[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.stages;

  if (!(await isFlagOn("presale_stage_config"))) {
    return [...BUILTIN_PIPELINE_STAGES];
  }

  try {
    const { data, error } = await db()
      .from("portal_pipeline_stages_v")
      .select("key, label, color, sort_order, is_won, is_terminal, enterable")
      .order("sort_order");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as StageRow[];
    if (rows.length === 0) return [...BUILTIN_PIPELINE_STAGES];
    const stages = rows.map(toStage);
    cache = { at: Date.now(), stages };
    return stages;
  } catch (e) {
    console.error("[pipeline-stages] could not read the configured stages; using defaults", e);
    return [...BUILTIN_PIPELINE_STAGES];
  }
}

/* ========================================================================= */
/* Admin                                                                     */
/* ========================================================================= */

export interface PipelineStageAdminRow extends PipelineStage {
  /** Why a delete would be refused, and the number the operator can act on. */
  account_count: number;
  /** Whether the stage appears anywhere in the recorded history. */
  in_history: boolean;
}

export interface PipelineStageAdminView {
  flagOn: boolean;
  configured: boolean;
  stages: PipelineStageAdminRow[];
}

/**
 * With the flag off this returns the built-in list with `configured: false` and
 * no counts, and never touches the new table — so the admin page renders and
 * explains itself on a deployment where 0028 has not been applied.
 */
export async function loadPipelineStageAdminView(): Promise<PipelineStageAdminView> {
  const flagOn = await isFlagOn("presale_stage_config");
  if (!flagOn) {
    return {
      flagOn: false,
      configured: false,
      stages: BUILTIN_PIPELINE_STAGES.map((s) => ({ ...s, account_count: 0, in_history: false })),
    };
  }

  const [stagesResult, accounts, history] = await Promise.all([
    db()
      .from("portal_pipeline_stages_v")
      .select("key, label, color, sort_order, is_won, is_terminal, enterable")
      .order("sort_order"),
    db().from("portal_accounts").select("stage"),
    db().from("portal_stage_transitions").select("to_stage"),
  ]);
  if (stagesResult.error) throw new Error(stagesResult.error.message);

  const counts = new Map<string, number>();
  for (const row of (accounts.data ?? []) as { stage: string }[]) {
    counts.set(row.stage, (counts.get(row.stage) ?? 0) + 1);
  }
  const seen = new Set<string>();
  for (const row of (history.data ?? []) as { to_stage: string }[]) seen.add(row.to_stage);

  const rows = (stagesResult.data ?? []) as StageRow[];
  if (rows.length === 0) {
    return {
      flagOn: true,
      configured: false,
      stages: BUILTIN_PIPELINE_STAGES.map((s) => ({
        ...s,
        account_count: counts.get(s.key) ?? 0,
        in_history: seen.has(s.key),
      })),
    };
  }

  return {
    flagOn: true,
    configured: true,
    stages: rows.map((r) => {
      const stage = toStage(r);
      return {
        ...stage,
        account_count: counts.get(stage.key) ?? 0,
        in_history: seen.has(stage.key),
      };
    }),
  };
}

/**
 * Every write refuses when the flag is off, because the table it writes to may
 * not exist yet on that deployment. This is not an authorization check — those
 * are never flag-gated (0011's header) — it is a schema-presence check.
 */
async function requireConfigEnabled(): Promise<void> {
  if (!(await isFlagOn("presale_stage_config"))) {
    throw new Error(
      "Configurable pipeline stages are not enabled on this deployment. The pipeline is using its built-in stages.",
    );
  }
}

async function afterWrite(
  actorId: string,
  action: string,
  payload: Record<string, unknown>,
): Promise<PipelineStageAdminView> {
  resetPipelineStageCache();
  await audit({
    actor_type: "user",
    actor_id: actorId,
    action,
    entity_type: "pipeline_stage",
    // A stage is keyed by text, not a uuid. This was `entity_id` — a uuid
    // column — so every rename failed its audit write and raised a Critical
    // alert, the same bug as the feature flags. See 0038.
    entity_key: String(payload["key"] ?? ""),
    payload,
  });
  return loadPipelineStageAdminView();
}

export async function createPipelineStage(
  actorId: string,
  input: { key: string; label: string; color: string },
): Promise<PipelineStageAdminView> {
  await requireConfigEnabled();
  const key = input.key.trim().toLowerCase();
  if (!PIPELINE_STAGE_KEY_PATTERN.test(key)) {
    throw new Error(
      "A stage key is 2–40 lowercase letters, digits and underscores, starting with a letter — it is the identity the stage history refers to and it can never be changed.",
    );
  }
  const color: StageColor = isStageColor(input.color) ? input.color : "idle";

  const { data: existing } = await db()
    .from("portal_pipeline_stages")
    .select("key")
    .eq("key", key)
    .maybeSingle();
  if (existing) throw new Error(`A stage with the key "${key}" already exists.`);

  const { data: last } = await db()
    .from("portal_pipeline_stages")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await db()
    .from("portal_pipeline_stages")
    .insert({
      key,
      label: input.label.trim(),
      color,
      sort_order: Number(last?.sort_order ?? 0) + 1,
    });
  if (error) throw new Error(error.message);

  return afterWrite(actorId, "pipeline_stage.create", { key, label: input.label.trim(), color });
}

/**
 * Renames and recolours. `key` is deliberately not settable: the stage history
 * refers to a stage by its key, and 0028's trigger refuses the change anyway.
 */
export async function updatePipelineStage(
  actorId: string,
  input: { key: string; label: string; color: string },
): Promise<PipelineStageAdminView> {
  await requireConfigEnabled();
  const label = input.label.trim();
  if (label.length < 1 || label.length > 60) {
    throw new Error("A stage label is between 1 and 60 characters.");
  }
  const color: StageColor = isStageColor(input.color) ? input.color : "idle";

  const { data, error } = await db()
    .from("portal_pipeline_stages")
    .update({ label, color })
    .eq("key", input.key)
    .select("key")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No stage "${input.key}" is configured.`);

  return afterWrite(actorId, "pipeline_stage.update", { key: input.key, label, color });
}

/**
 * Moving the Closed Won or final mark. Goes through the RPC because it is two
 * updates that must be one transaction — see 0028.
 */
export async function setPipelineStageMark(
  actorId: string,
  input: { key: string; mark: "won" | "terminal" },
): Promise<PipelineStageAdminView> {
  await requireConfigEnabled();
  const { error } = await db().rpc("portal_set_pipeline_stage_mark", {
    p_key: input.key,
    p_mark: input.mark,
  });
  if (error) throw new Error(error.message);
  return afterWrite(actorId, "pipeline_stage.set_mark", { key: input.key, mark: input.mark });
}

/** Reordering is one atomic statement in the RPC; a partial list is refused there. */
export async function reorderPipelineStages(
  actorId: string,
  keys: string[],
): Promise<PipelineStageAdminView> {
  await requireConfigEnabled();
  const { error } = await db().rpc("portal_set_pipeline_stage_order", { p_keys: keys });
  if (error) throw new Error(error.message);
  return afterWrite(actorId, "pipeline_stage.reorder", { key: "", order: keys });
}

/**
 * The count check is repeated here only so the UI gets a good message without a
 * round trip through a raised exception. The GUARANTEE is 0028's before-delete
 * trigger, because every path into this database is service-role.
 */
export async function deletePipelineStage(
  actorId: string,
  key: string,
): Promise<PipelineStageAdminView> {
  await requireConfigEnabled();

  const { data: stage } = await db()
    .from("portal_pipeline_stages_v")
    .select("key, label, is_won, is_terminal, enterable")
    .eq("key", key)
    .maybeSingle();
  if (!stage) throw new Error(`No stage "${key}" is configured.`);
  if (stage.is_won) {
    throw new Error(
      `“${stage.label}” is the Closed Won stage. Mark another stage as Closed Won first, then delete this one.`,
    );
  }
  if (stage.is_terminal) {
    throw new Error(
      `“${stage.label}” is the final stage. Mark another stage as final first, then delete this one.`,
    );
  }

  // Only ask when the question is askable: `portal_accounts.stage` is still the
  // enum, so filtering it by a key that is not an enum label is a type error
  // rather than a count of zero. A stage nobody can enter holds nobody.
  const { count } = stage.enterable
    ? await db()
        .from("portal_accounts")
        .select("id", { count: "exact", head: true })
        .eq("stage", key)
    : { count: 0 };
  if ((count ?? 0) > 0) {
    throw new Error(
      `“${stage.label}” cannot be deleted: ${count} account${count === 1 ? " is" : "s are"} still in it. Move ${count === 1 ? "it" : "them"} to another stage first.`,
    );
  }

  const { error } = await db().from("portal_pipeline_stages").delete().eq("key", key);
  if (error) throw new Error(error.message);

  return afterWrite(actorId, "pipeline_stage.delete", { key, label: stage.label });
}
