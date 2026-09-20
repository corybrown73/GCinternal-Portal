import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  journeyReason,
  stepsToward,
  targetJourneyStage,
  type JourneySignals,
} from "./journey-sync";
import { audit } from "./server/audit";

const db = () => supabaseAdmin as any;

/**
 * Move the implementation behind a deal to the stage the plan says it is
 * in. Called after anything that changes the plan: a brief generated, a
 * step ticked, the link sent. Never throws — the plan change already
 * succeeded, and a stage that could not follow is recorded, not fatal.
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
    const target = targetJourneyStage(signals);

    // The live lifecycle: the configured order minus hidden stages, so the
    // steps taken are the ones a person sees on the rail.
    const { loadLifecycleStages } = await import("./lifecycle-stages.server");
    const { applyStageOverrides, LIFECYCLE_STAGES } = await import("./lifecycle");
    applyStageOverrides((await loadLifecycleStages()) as never);
    const order = LIFECYCLE_STAGES.map((s) => s.id);

    const from = String(impl.current_stage);
    const steps = stepsToward(from, target, order);
    if (steps.length === 0) return { implementationId: impl.id, from, to: from, steps: [] };

    const { advanceStage } = await import("./hub.server");
    const why = `Automatic — ${journeyReason(signals)}`;
    const taken: string[] = [];
    for (const toStage of steps) {
      try {
        await advanceStage({
          implementationId: impl.id,
          toStage,
          enteredBy: null,
          notes: why,
          override: { reason: why },
          actorProfileId,
        });
        taken.push(toStage);
      } catch (e) {
        await audit({
          actor_type: actorProfileId ? "user" : "system",
          ...(actorProfileId && { actor_id: actorProfileId }),
          action: "journey.autosync_blocked",
          entity_type: "implementation",
          entity_id: impl.id,
          payload: {
            from,
            target,
            at: toStage,
            reason: e instanceof Error ? e.message : String(e),
          },
        });
        break;
      }
    }
    if (taken.length) {
      await audit({
        actor_type: actorProfileId ? "user" : "system",
        ...(actorProfileId && { actor_id: actorProfileId }),
        action: "journey.autosync",
        entity_type: "implementation",
        entity_id: impl.id,
        payload: {
          from,
          to: taken[taken.length - 1],
          steps: taken,
          because: journeyReason(signals),
        },
      });
    }
    return { implementationId: impl.id, from, to: taken[taken.length - 1] ?? from, steps: taken };
  } catch (e) {
    console.error("[journey] could not sync the stage for deal", dealId, e);
    return null;
  }
}

async function signalsFor(dealId: string, rawIntake: unknown): Promise<JourneySignals> {
  const { readIntake } = await import("./intake-answers");
  const { closeDateFor, timelineFor } = await import("./onboarding-plan");
  const { loadPipelineStages } = await import("./pipeline-stages.server");
  const { wonStage } = await import("./pipeline-stages");

  const [{ data: transitions }, { count: briefs }, stages] = await Promise.all([
    db().from("portal_stage_transitions").select("to_stage, occurred_at").eq("account_id", dealId),
    db()
      .from("portal_briefs")
      .select("id", { count: "exact", head: true })
      .eq("account_id", dealId)
      .eq("status", "complete"),
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
    briefGenerated: (briefs ?? 0) > 0,
    kickoffDone: done("kickoff"),
    workingDone: done("working"),
    formLive: Boolean(t.liveDoneOn),
  };
}
