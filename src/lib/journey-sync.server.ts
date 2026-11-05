import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  automaticNextStep,
  journeyReason,
  kickoffBooked,
  type JourneySignals,
} from "./journey-sync";
import { audit } from "./server/audit";

const db = () => supabaseAdmin as any;

/**
 * Move the implementation behind a deal to the next stage its recorded facts
 * support. Called after anything that changes the plan: a step ticked, the
 * link sent, a brief applied, a kickoff booked or confirmed held.
 *
 * Three rules keep this predictable:
 *   1. Only facts a person has recorded move the stage. An AI brief moves nothing.
 *   2. One step per call. A fact never walks the stage through several stages;
 *      the stage after that waits for its own gate and its own record.
 *   3. No gate is overridden here. advanceStage refuses a move a gate blocks,
 *      and that refusal is recorded (journey.autosync_blocked) for a person to
 *      act on, and shown on the Current Implementation gate panel.
 *
 * It also keeps the two kickoff work items in step with the facts they stand
 * for, so the gate reads what the plan says: a booked kickoff completes
 * "schedule the kickoff call", and a confirmed-held kickoff completes "run the
 * kickoff call". Neither fact completes anything else.
 *
 * Never throws — the plan change already succeeded, and a stage that could not
 * follow is recorded, not fatal.
 */
export async function syncJourneyStage(
  dealId: string,
  actorProfileId: string | null,
): Promise<{ implementationId: string; from: string; to: string; steps: string[] } | null> {
  try {
    const { data: deal } = await db()
      .from("portal_accounts")
      .select("id,intake,customer_id")
      .eq("id", dealId)
      .maybeSingle();
    if (!deal?.customer_id) return null;

    const { data: impl } = await db()
      .from("implementations")
      .select("id,current_stage")
      .eq("deal_id", dealId)
      .is("superseded_by_implementation_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!impl) return null;

    const signals = await signalsFor(dealId, deal.intake);
    await syncKickoffWorkItems(impl.id, signals, actorProfileId);

    // The live lifecycle: the configured order minus hidden stages, so the
    // steps taken are the ones a person sees on the rail.
    const { loadLifecycleStages } = await import("./lifecycle-stages.server");
    const { applyStageOverrides, LIFECYCLE_STAGES } = await import("./lifecycle");
    applyStageOverrides((await loadLifecycleStages()) as never);
    const order = LIFECYCLE_STAGES.map((s) => s.id);

    const from = String(impl.current_stage);
    const next = automaticNextStep(signals, from, order);
    if (!next) return { implementationId: impl.id, from, to: from, steps: [] };

    const { advanceStage } = await import("./hub.server");
    const { teamMemberIdForProfile } = await import("./activity.server");
    // The move is automatic, but a person's action caused it: their name is
    // the one the activity feed shows, not a dash. No `override`: a gate that
    // blocks the move blocks it here too, and the refusal is recorded below.
    const enteredBy = await teamMemberIdForProfile(actorProfileId);
    const why = `Automatic — ${journeyReason(signals)}`;
    try {
      await advanceStage({
        implementationId: impl.id,
        toStage: next.to,
        enteredBy,
        notes: why,
        actorProfileId,
        automatic: true,
      });
    } catch (e) {
      await audit({
        actor_type: actorProfileId ? "user" : "system",
        ...(actorProfileId && { actor_id: actorProfileId }),
        action: "journey.autosync_blocked",
        entity_type: "implementation",
        entity_id: impl.id,
        payload: {
          from,
          target: next.target,
          at: next.to,
          reason: e instanceof Error ? e.message : String(e),
        },
      });
      return { implementationId: impl.id, from, to: from, steps: [] };
    }
    await audit({
      actor_type: actorProfileId ? "user" : "system",
      ...(actorProfileId && { actor_id: actorProfileId }),
      action: "journey.autosync",
      entity_type: "implementation",
      entity_id: impl.id,
      payload: { from, to: next.to, steps: [next.to], because: journeyReason(signals) },
    });
    return { implementationId: impl.id, from, to: next.to, steps: [next.to] };
  } catch (e) {
    console.error("[journey] could not sync the stage for deal", dealId, e);
    return null;
  }
}

/**
 * The two kickoff work items follow the facts they stand for, and only those.
 *
 *   - nl.kickoff_scheduled (handoff gate) is done when the kickoff is booked.
 *     It is never un-done here: it can also be ticked by hand, and a booking
 *     that is later removed is a plan edit a person makes deliberately.
 *   - nl.kickoff_call (align-external gate) is done when a person has confirmed
 *     the kickoff held, and goes back to not started when that confirmation is
 *     removed. Nothing else can complete it.
 *
 * Skipped items are left alone. Items are reused, never duplicated.
 */
async function syncKickoffWorkItems(
  implementationId: string,
  signals: JourneySignals,
  actorProfileId: string | null,
): Promise<void> {
  const { data: items } = await db()
    .from("work_items")
    .select("id,task_key,status")
    .eq("implementation_id", implementationId)
    .in("task_key", ["nl.kickoff_scheduled", "nl.kickoff_call"]);
  if (!items?.length) return;

  const { setWorkItemStatus } = await import("./plan.server");
  for (const it of items as Array<{ id: string; task_key: string; status: string }>) {
    if (it.status === "skipped") continue;
    let want: string | null = null;
    if (it.task_key === "nl.kickoff_scheduled" && signals.kickoffScheduled) want = "done";
    if (it.task_key === "nl.kickoff_call") {
      if (signals.kickoffHeld) want = "done";
      else if (it.status === "done") want = "not_started";
    }
    if (want && it.status !== want) {
      await setWorkItemStatus({
        workItemId: String(it.id),
        status: want,
        actorProfileId,
      });
    }
  }
}

async function signalsFor(dealId: string, rawIntake: unknown): Promise<JourneySignals> {
  const { readIntake } = await import("./intake-answers");
  const { closeDateFor, timelineFor } = await import("./onboarding-plan");
  const { loadPipelineStages } = await import("./pipeline-stages.server");
  const { wonStage } = await import("./pipeline-stages");

  const [{ data: transitions }, stages] = await Promise.all([
    db().from("portal_stage_transitions").select("to_stage, occurred_at").eq("account_id", dealId),
    loadPipelineStages(),
  ]);
  const intake = readIntake(rawIntake);
  const close = closeDateFor({
    intake,
    stageHistory: (transitions ?? []) as Array<{ to_stage: string; occurred_at: string }>,
    wonStageKey: wonStage(stages).key,
  });
  const t = timelineFor(intake, close.date);
  const done = (key: string) => Boolean(t.milestones.find((m) => m.key === key)?.doneOn);
  return {
    kickoffScheduled: kickoffBooked(intake.timeline),
    kickoffHeld: done("kickoff"),
    workingDone: done("working"),
    formLive: Boolean(t.liveDoneOn),
  };
}
