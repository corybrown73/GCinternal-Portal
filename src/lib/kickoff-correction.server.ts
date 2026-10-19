import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { readIntake } from "./intake-answers";
import { kickoffCorrectionFor } from "./kickoff-held";
import { decideKickoffCorrection, type KickoffCorrectionSnapshot } from "./kickoff-correction";
import { dealHasPartnerJourney } from "./partner-implementation.server";
import { flowLabel } from "./stage-flow";
import { flowForDeal } from "./stage-flow.server";

const db = () => supabaseAdmin as any;

const STALE = "The deal changed while this was open. Look at Kickoff again before unticking it.";

/**
 * Untick Kickoff held. The decision is made here from the record as it is now,
 * never from what the page showed. The write is one database function call,
 * so the Kickoff record, the stage, the stage history and the audit row change
 * together or not at all.
 */
export async function correctKickoffHeldForDeal(input: {
  dealId: string;
  actorProfileId: string;
  expected: KickoffCorrectionSnapshot;
  confirmLaterWork: boolean;
  note: string | null;
}): Promise<{ stage: "kickoff"; fromStage: string }> {
  const { data: account, error } = await db()
    .from("portal_accounts")
    .select("id,stage,intake")
    .eq("id", input.dealId)
    .maybeSingle();
  if (error) throw new Error(`Could not read the deal: ${error.message}`);
  if (!account) throw new Error("This deal no longer exists.");

  if (await dealHasPartnerJourney(input.dealId)) {
    throw new Error("Partner implementations are not corrected here.");
  }
  const built = await flowForDeal(input.dealId);
  if (!built) throw new Error("This deal no longer exists.");

  const intake = readIntake(account.intake);
  const decision = decideKickoffCorrection({
    stage: String(account.stage),
    intake: account.intake as Record<string, unknown>,
    correction: kickoffCorrectionFor(built.flow, intake),
    expected: input.expected,
    confirmLaterWork: input.confirmLaterWork,
  });
  if (!decision.ok) throw new Error(refusalMessage(decision));

  const { data, error: rpcError } = await db().rpc("portal_correct_kickoff_held", {
    p_deal_id: input.dealId,
    p_expected_stage: input.expected.stage,
    p_expected_intake: input.expected.intake,
    p_actor_profile: input.actorProfileId,
    p_note: input.note,
    p_later_tasks_done: decision.laterTasksDone,
  });
  if (rpcError) throw new Error(databaseMessage(rpcError.message));
  return { stage: "kickoff", fromStage: String((data as { from_stage: string }).from_stage) };
}

function refusalMessage(
  d: Extract<ReturnType<typeof decideKickoffCorrection>, { ok: false }>,
): string {
  switch (d.reason) {
    case "stale":
      return STALE;
    case "not_held":
      return "Kickoff is not held, so there is nothing to untick.";
    case "not_applicable":
      return "Partner implementations are not corrected here.";
    case "needs_confirmation":
      return "Confirm the correction first: later tasks are already done and would stay as they are.";
    case "blocked":
      return `${flowLabel(d.completedStage)} is already complete, so this cannot be unticked here. Ask for a stage-correction review.`;
  }
}

/** The database function's refusals, by the code it puts at the front of its message. */
function databaseMessage(message: string): string {
  if (message.includes("kickoff_correction_stale")) return STALE;
  if (message.includes("kickoff_correction_not_held")) {
    return "Kickoff is not held, so there is nothing to untick.";
  }
  if (message.includes("kickoff_correction_not_applicable")) {
    return "Partner implementations are not corrected here.";
  }
  if (message.includes("kickoff_correction_forbidden")) {
    return "Your account may not change this deal's stage.";
  }
  if (message.includes("kickoff_correction_not_found")) return "This deal no longer exists.";
  return `Could not untick Kickoff: ${message}`;
}
