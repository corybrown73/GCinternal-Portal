import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { kickoffHeldBasis, type KickoffHeldBasis } from "./kickoff-authority";
import { isPartnerJourney } from "./partner-implementation";
import { audit } from "./server/audit";

const db = () => supabaseAdmin as any;

export const KICKOFF_HELD_REFUSED =
  "Only the TIS assigned to this implementation, or a manager or administrator, can record that the kickoff was held, or take that back.";

/**
 * Check the signed-in caller may record or reverse a kickoff held on this deal.
 * Reads the caller's role and team record from the database (never from the
 * client). Returns who the act is attributed to, or null for a partner
 * implementation, which keeps its own record and is not changed here.
 */
export async function assertKickoffHeldAuthority(
  userId: string,
  dealId: string,
): Promise<{ implementationId: string; role: string; basis: KickoffHeldBasis } | null> {
  const [{ data: profile }, { data: impl }] = await Promise.all([
    db().from("portal_profiles").select("role, team_member_id").eq("id", userId).maybeSingle(),
    db()
      .from("implementations")
      .select("id,owner_id,journey_type,partner_key")
      .eq("deal_id", dealId)
      .is("superseded_by_implementation_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (impl && isPartnerJourney(impl)) return null;
  const role = (profile?.role as string | null) ?? null;
  const basis = kickoffHeldBasis({
    role,
    actorTeamMemberId: (profile?.team_member_id as string | null) ?? null,
    ownerTeamMemberId: (impl?.owner_id as string | null) ?? null,
    hasImplementation: Boolean(impl),
  });
  if (!basis || !impl || !role) throw new Error(KICKOFF_HELD_REFUSED);
  return { implementationId: String(impl.id), role, basis };
}

/**
 * Record who confirmed or reversed the kickoff held, and on what authority. Written
 * after the deal save succeeds, so the trail never describes a change that did not
 * happen. The actor is the signed-in person; the implementation's owner is not touched.
 */
export async function recordKickoffHeldChange(args: {
  userId: string;
  dealId: string;
  implementationId: string;
  held: boolean;
  role: string;
  basis: KickoffHeldBasis;
}): Promise<void> {
  await audit({
    actor_type: "user",
    actor_id: args.userId,
    action: args.held ? "kickoff.held_recorded" : "kickoff.held_reversed",
    entity_type: "implementation",
    entity_id: args.implementationId,
    payload: { deal_id: args.dealId, actor_role: args.role, basis: args.basis },
  });
}
