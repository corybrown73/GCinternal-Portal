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
    .select("id,stage,intake,customer_id,sow_document_path,welcome_share_url")
    .eq("id", dealId)
    .maybeSingle();
  if (!account) return { moved: null };
  // Only the two automatic moves read anything; skip the reads otherwise.
  if (account.stage !== "closed_won" && account.stage !== "onboarding_kickoff") {
    return { moved: null };
  }

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

  const flow = stageFlow({
    stage: String(account.stage),
    intake: account.intake,
    owner,
    gongReports: reports ?? 0,
    hasSow: Boolean(account.sow_document_path),
    hasBrief: (briefs ?? 0) > 0,
    hasLink: Boolean(account.welcome_share_url),
  });
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
