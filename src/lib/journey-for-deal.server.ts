import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { journeyTargetForDeal } from "./journey-for-deal";
import { isPartnerJourney } from "./partner-implementation";
import type { AccountStage } from "./presale-stages";
import { STAGE_LABELS } from "./presale-stages";
import { automaticMoveBlock, stageGateStatus, type GateItem } from "./stage-gates";

const db = () => supabaseAdmin as any;

/**
 * The deal's band may only move an implementation that has not started yet.
 * Once the kickoff has been held, the journey is driven by its recorded facts
 * and its gates alone: a deal stage never pulls it backwards, never pushes it
 * forward past uncompleted stages, and never graduates it.
 */
const PRE_KICKOFF = "handoff";

/**
 * Pull the deal's implementation into the journey band its stage allows.
 *
 * Called after every deal-stage change (drag, Mark Closed Won, Mark
 * onboarding complete, the API, a sync) and once when the implementation
 * is created. Writes the same three things a manual "Move to next stage"
 * writes — the stage history, implementations.current_stage, the
 * stage_instances mirror — and audits the move. Never throws: the deal's
 * move has already happened, and a journey that could not follow is logged,
 * not a reason to fail the page.
 */
export async function mirrorJourneyToDeal(
  dealId: string,
  dealStage: AccountStage,
  actorProfileId: string | null,
): Promise<{ implementationId: string; from: string; to: string } | null> {
  try {
    const { data: impl } = await db()
      .from("implementations")
      .select("id,current_stage,journey_type,partner_key")
      .eq("deal_id", dealId)
      .is("superseded_by_implementation_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!impl) return null;
    // A partner's progress is its own record: the deal's band never pulls it.
    if (isPartnerJourney(impl)) return null;

    const { loadLifecycleStages } = await import("./lifecycle-stages.server");
    const { applyStageOverrides, LIFECYCLE_STAGES } = await import("./lifecycle");
    applyStageOverrides((await loadLifecycleStages()) as never);
    const order = LIFECYCLE_STAGES.map((s) => s.id);

    const from = String(impl.current_stage);
    const to = journeyTargetForDeal(dealStage, from, order);
    if (!to || to === from) return null;

    // Past the handoff, the deal does not move the journey at all: a backward
    // pull, a jump over stages, or a graduation can only come from the stage's
    // own record and gate, never from where the deal happens to be.
    if (from !== PRE_KICKOFF) return null;
    // Before kickoff the deal may take the journey one stage on, and no further:
    // the stage after that is never skipped on the deal's say-so.
    const next = order[order.indexOf(from) + 1];
    if (to !== next) return null;
    // That one step still has to pass the handoff gate, as any move does.
    const gateBlock = await handoffGateBlock(impl.id, from);
    if (gateBlock) return null;

    const at = new Date().toISOString();
    const { teamMemberIdForProfile } = await import("./activity.server");
    const enteredBy = await teamMemberIdForProfile(actorProfileId);
    const note = `Mirrored from the deal: ${STAGE_LABELS[dealStage] ?? dealStage}`;

    await db()
      .from("implementation_stage_history")
      .update({ exited_at: at })
      .eq("implementation_id", impl.id)
      .is("exited_at", null);
    const { error: histErr } = await db().from("implementation_stage_history").insert({
      implementation_id: impl.id,
      stage: to,
      entered_at: at,
      entered_by: enteredBy,
      notes: note,
      exited_at: null,
    });
    if (histErr) throw new Error(histErr.message);
    const { error: updErr } = await db()
      .from("implementations")
      .update({ current_stage: to, stage_entered_at: at, updated_at: at })
      .eq("id", impl.id);
    if (updErr) throw new Error(updErr.message);
    // The mirror, from current_stage: earlier done, this one active, later
    // pending — a move back out of Complete resets what was ahead of it.
    await db().rpc("resync_stage_instances", { p_implementation_id: impl.id });

    const { recordStageChange } = await import("./server/events");
    await recordStageChange({
      implementationId: String(impl.id),
      fromStage: from,
      toStage: to,
      actor: enteredBy,
      note,
      enteredAt: at,
    });
    const { audit } = await import("./server/audit");
    await audit({
      actor_type: actorProfileId ? "user" : "system",
      actor_id: actorProfileId,
      action: "journey.mirrored",
      entity_type: "implementation",
      entity_id: String(impl.id),
      payload: { from, to, deal_id: dealId, deal_stage: dealStage },
    });
    return { implementationId: String(impl.id), from, to };
  } catch (e) {
    console.error(`[journey] could not mirror deal ${dealId} → ${dealStage}`, e);
    return null;
  }
}

/**
 * Why the stage the journey is leaving is not yet ready to leave, or null when
 * it is. The same reading advanceStage makes: this stage's own criteria,
 * judged by its gate mode. Never throws; a stage that cannot be read is held.
 */
async function handoffGateBlock(
  implementationId: string,
  stageKey: string,
): Promise<string | null> {
  const { data: stageRow } = await db()
    .from("stage_instances")
    .select("id,gate_mode")
    .eq("implementation_id", implementationId)
    .eq("stage_key", stageKey)
    .maybeSingle();
  const { data: rows, error } = stageRow?.id
    ? await db()
        .from("work_items")
        .select("id,task_key,title,status,is_gate,party")
        .eq("implementation_id", implementationId)
        .eq("stage_instance_id", stageRow.id)
    : { data: [], error: null };
  if (error) return "could not read the stage's criteria";
  const gate = stageGateStatus((rows ?? []) as GateItem[]);
  return automaticMoveBlock(gate, (stageRow?.gate_mode as string | null) ?? null);
}
