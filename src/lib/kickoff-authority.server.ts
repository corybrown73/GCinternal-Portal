import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { canChangeKickoffHeld } from "./kickoff-authority";
import { isPartnerJourney } from "./partner-implementation";

const db = () => supabaseAdmin as any;

/**
 * Refuse a change to the held kickoff unless the caller is the implementation's
 * assigned TIS. Called only when the held state is actually changing, so
 * booking, ticking other milestones and every other edit keep their existing
 * rules. Partner implementations keep their own record and are not changed here.
 */
export async function assertKickoffHeldAuthority(userId: string, dealId: string): Promise<void> {
  const [{ data: profile }, { data: impl }] = await Promise.all([
    db().from("portal_profiles").select("team_member_id").eq("id", userId).maybeSingle(),
    db()
      .from("implementations")
      .select("id,owner_id,journey_type,partner_key")
      .eq("deal_id", dealId)
      .is("superseded_by_implementation_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (impl && isPartnerJourney(impl)) return;
  const allowed = canChangeKickoffHeld({
    actorTeamMemberId: (profile?.team_member_id as string | null) ?? null,
    ownerTeamMemberId: (impl?.owner_id as string | null) ?? null,
    hasImplementation: Boolean(impl),
  });
  if (!allowed) {
    throw new Error(
      "Only the TIS assigned to this implementation can record that the kickoff was held, or take that back.",
    );
  }
}
