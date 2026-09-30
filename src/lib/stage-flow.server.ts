import { supabaseAdmin } from "@/integrations/supabase/client.server";

import type { AccountStage } from "./presale-stages";
import { stageFlow } from "./stage-flow";

const db = () => supabaseAdmin as any;

/**
 * Move the deal to the stage its checklist has earned — forward only.
 *
 * Called after anything that can finish a task: an intake save (a tick, a
 * booked kickoff), and by the page when its own reading says a stage is
 * done (the brief, an upload, an assignment). Reads the record fresh, so a
 * page that is out of date cannot move a deal the record does not support.
 */
export async function syncDealStage(
  dealId: string,
  actorProfileId: string | null,
): Promise<{ moved: AccountStage | null }> {
  const { data: account } = await db()
    .from("portal_accounts")
    .select("id,stage")
    .eq("id", dealId)
    .maybeSingle();
  if (!account) return { moved: null };
  // Only the two automatic moves read anything; skip the reads otherwise.
  if (account.stage !== "closed_won" && account.stage !== "onboarding_kickoff") {
    return { moved: null };
  }
  const built = await flowForDeal(dealId);
  if (!built) return { moved: null };
  const { flow } = built;
  if (!flow.advanceTo) return { moved: null };

  const { transitionStage } = await import("./server/accounts");
  const r = await transitionStage(
    dealId,
    flow.advanceTo,
    { source: actorProfileId ? "ui" : "system", actorProfileId },
    flow.advanceTo === "onboarding_kickoff"
      ? "Welcome brief generated: ready for the kickoff call"
      : "Kickoff call booked: onboarding has started",
  );
  return { moved: r.changed ? flow.advanceTo : null };
}

/**
 * The deal's checklist, read fresh from the record — the same inputs the
 * page gives stageFlow, so a server-side decision (an automatic move, a
 * gate) agrees with what the person sees.
 */
export async function flowForDeal(
  dealId: string,
): Promise<{ account: { id: string; stage: string }; flow: ReturnType<typeof stageFlow> } | null> {
  const { data: account } = await db()
    .from("portal_accounts")
    .select("id,stage,intake,customer_id,sow_document_path,welcome_share_url")
    .eq("id", dealId)
    .maybeSingle();
  if (!account) return null;

  const { implementationForDeal } = await import("./assignment.server");
  const [{ count: reports }, { count: briefs }, implId] = await Promise.all([
    db()
      .from("portal_gong_reports")
      .select("id", { count: "exact", head: true })
      .eq("account_id", dealId),
    db()
      .from("portal_briefs")
      .select("id", { count: "exact", head: true })
      .eq("account_id", dealId)
      .eq("status", "complete")
      .eq("generator", "llm"),
    implementationForDeal(dealId, account.customer_id ?? null),
  ]);
  let owner: string | null = null;
  if (implId) {
    const { data: impl } = await db()
      .from("implementations")
      .select("owner_id")
      .eq("id", implId)
      .maybeSingle();
    owner = impl?.owner_id ? String(impl.owner_id) : null;
  }
  // Before Start onboarding there is no project to carry the owner: the
  // assignment made at the close lives in the ledger. The page reads it
  // from there, so the move must too, or "Assign an owner" is done on the
  // screen and not done here, and the deal never leaves Closed Won.
  if (!owner) {
    const { data: led } = await db()
      .from("portal_assignments")
      .select("team_member_id")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    owner = led?.team_member_id ? String(led.team_member_id) : null;
  }

  // The Onboarding tasks need the plan: the same timeline the page builds.
  const { readIntake } = await import("./intake-answers");
  const { timelineFor, closeDateFor } = await import("./onboarding-plan");
  const { localIso } = await import("./onboarding-timeline");
  const intake = readIntake(account.intake);
  const { data: history } = await db()
    .from("portal_stage_transitions")
    .select("to_stage,occurred_at")
    .eq("account_id", dealId);
  const timeline = timelineFor(
    intake,
    closeDateFor({
      intake,
      stageHistory: (history ?? []) as Array<{ to_stage: string; occurred_at: string }>,
      wonStageKey: "closed_won",
      today: localIso(),
    }).date,
  );
  const flow = stageFlow({
    stage: String(account.stage),
    intake: account.intake,
    owner,
    gongReports: reports ?? 0,
    hasSow: Boolean(account.sow_document_path),
    hasBrief: (briefs ?? 0) > 0,
    hasLink: Boolean(account.welcome_share_url),
    timeline,
  });
  return { account: { id: String(account.id), stage: String(account.stage) }, flow };
}
