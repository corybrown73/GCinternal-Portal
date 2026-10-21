import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deriveHealth, type HealthResult } from "./customer360-derive";
import type { Customer360 } from "./hub-types";
import { readIntake } from "./intake-answers";
import { liveTickOf } from "./launch-state";
import { businessDaysBetween, localIso } from "./onboarding-timeline";
import { isPartnerJourney } from "./partner-implementation";
import { isStage } from "./presale-stages";

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
      .select(
        "id, deal_id, current_stage, stage_entered_at, target_launch_date, actual_launch_date, go_live_at, journey_type, partner_key",
      )
      .eq("id", implementationId)
      .maybeSingle(),
    db().from("risks").select("*").eq("implementation_id", implementationId),
    db().from("issues").select("*").eq("implementation_id", implementationId),
    db().from("escalations").select("*").eq("implementation_id", implementationId),
    db().from("commitments").select("*").eq("implementation_id", implementationId),
    db().from("milestones").select("*").eq("implementation_id", implementationId),
  ]);
  if (!impl) return null;
  // The deal's stage and its clock: a graduated deal is never "stalled"
  // (QA 21.2), and a project with a deal stalls by the deal's clock, as on Home.
  const { data: deal } = impl.deal_id
    ? await db()
        .from("portal_accounts")
        .select("stage, stage_entered_at, intake")
        .eq("id", impl.deal_id)
        .maybeSingle()
    : { data: null };
  const stage = (deal?.stage as string | undefined) ?? null;

  // deriveHealth reads exactly these collections off the record.
  const record = {
    risks: risks ?? [],
    issues: issues ?? [],
    escalations: escalations ?? [],
    commitments: commitments ?? [],
    milestones: milestones ?? [],
    deal_facts:
      stage && isStage(stage)
        ? {
            stage,
            business_days_in_stage: Math.max(
              0,
              businessDaysBetween(
                String(deal?.stage_entered_at ?? localIso()).slice(0, 10),
                localIso(),
              ),
            ),
            partner: isPartnerJourney(impl),
          }
        : null,
  } as unknown as Customer360;

  // The plan's live tick is a launch, like the Go-Live tick (launch-state.ts).
  const live_done_on = deal?.intake ? liveTickOf(readIntake(deal.intake)) : null;
  return { impl: { ...impl, deal_stage: stage, live_done_on }, record };
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
  const { data: impls } = await db().from("implementations").select("id").is("closed_at", null);
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
