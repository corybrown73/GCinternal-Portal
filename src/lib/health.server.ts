import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deriveHealth, type HealthResult } from "./customer360-derive";
import type { Customer360 } from "./hub-types";

const db = () => supabaseAdmin as any;

/**
 * Computed health cache.
 *
 * `health_computed` is a cache of deriveHealth() — never a second algorithm.
 * The stored `health_computed_inputs` is the very evidence object deriveHealth
 * returned, so the snapshot always reproduces the verdict rather than
 * summarising it.
 *
 * It never touches `health_recorded`: that column is the human's statement and
 * only the implementation editor writes it.
 */

/** Signals deriveHealth actually reads, for one implementation. */
async function loadHealthInputs(implementationId: string) {
  const [
    { data: impl },
    { data: risks },
    { data: issues },
    { data: escalations },
    { data: commitments },
    { data: milestones },
  ] = await Promise.all([
    db()
      .from("implementations")
      .select("id, current_stage, stage_entered_at, target_launch_date, actual_launch_date")
      .eq("id", implementationId)
      .maybeSingle(),
    db().from("risks").select("*").eq("implementation_id", implementationId),
    db().from("issues").select("*").eq("implementation_id", implementationId),
    db().from("escalations").select("*").eq("implementation_id", implementationId),
    db().from("commitments").select("*").eq("implementation_id", implementationId),
    db().from("milestones").select("*").eq("implementation_id", implementationId),
  ]);
  if (!impl) return null;

  // deriveHealth reads exactly these collections off the record.
  const record = {
    risks: risks ?? [],
    issues: issues ?? [],
    escalations: escalations ?? [],
    commitments: commitments ?? [],
    milestones: milestones ?? [],
  } as unknown as Customer360;

  return { impl, record };
}

/** Recompute and cache health for one implementation. Returns null if it is gone. */
export async function recomputeHealth(implementationId: string): Promise<HealthResult | null> {
  const inputs = await loadHealthInputs(implementationId);
  if (!inputs) return null;

  const result = deriveHealth(inputs.record, inputs.impl);
  const { error } = await db()
    .from("implementations")
    .update({
      health_computed: result.level,
      health_computed_at: new Date().toISOString(),
      health_computed_inputs: result.evidence,
    })
    .eq("id", implementationId);
  if (error) throw new Error(`Could not cache computed health: ${error.message}`);
  return result;
}

/**
 * Fire-and-forget recompute for use inside write paths. A stale cache is a far
 * smaller problem than a failed save, so this never rejects — the cron sweep is
 * the backstop that repairs anything missed here.
 */
export function recomputeHealthSoon(implementationId: string | null | undefined): void {
  if (!implementationId) return;
  void recomputeHealth(implementationId).catch((e) => {
    console.error(`[health] recompute failed for ${implementationId}`, e);
  });
}

/** Sweep every implementation. Used by the cron as the staleness backstop. */
export async function recomputeAllHealth(): Promise<{ updated: number; failed: number }> {
  const { data: impls } = await db().from("implementations").select("id");
  let updated = 0;
  let failed = 0;
  for (const i of impls ?? []) {
    try {
      await recomputeHealth(i.id);
      updated += 1;
    } catch (e) {
      failed += 1;
      console.error(`[health] sweep failed for ${i.id}`, e);
    }
  }
  return { updated, failed };
}
