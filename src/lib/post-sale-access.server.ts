import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { audit } from "./server/audit";
import { writeFailure } from "./complete-solutions.server";
import { ownerChangeFrom, ownerChangeReasonInput, type OwnerChangeReason } from "./owner-change";

/**
 * Who may change an implementation's post-sale work. The rule lives in the
 * database (post_sale_may_manage, 0091); this module asks it, and refuses in
 * plain words. It never reads or changes pre-sale records.
 *
 *   admin, super admin, manager ........ any implementation
 *   Team Lead (portal_profiles.team_lead) any implementation
 *   implementation, onboarding ......... implementations they own (owner_id)
 *   everyone else, including technical roles (se, tam_se), customers ... refused
 */

const db = () => supabaseAdmin as any;

export const POST_SALE_REFUSAL =
  "You can change the post-sale work of implementations you own. A Team Lead, a manager or an admin can change any of them.";

/**
 * Whether this person may change this implementation's post-sale work. A failed
 * check is an error, not a no: the caller is refused, and the reason is logged.
 */
export async function canManagePostSale(
  actorProfileId: string,
  implementationId: string,
): Promise<boolean> {
  const { data, error } = await db().rpc("post_sale_may_manage", {
    p_profile: actorProfileId,
    p_implementation: implementationId,
  });
  if (error) {
    console.error(`[post-sale] access check failed: ${error.message ?? "unknown"}`);
    throw new Error(
      "Could not check your access to this implementation. Nothing has been changed.",
    );
  }
  return data === true;
}

/** Throws the plain refusal unless this person may change the implementation's post-sale work. */
export async function assertCanManagePostSale(
  actorProfileId: string,
  implementationId: string,
): Promise<void> {
  if (!(await canManagePostSale(actorProfileId, implementationId))) {
    throw new Error(POST_SALE_REFUSAL);
  }
}

/**
 * Reassigns an implementation's owner, which is the assigned TIS. The database
 * decides who may do it (a Team Lead, a manager or an admin), refuses a change
 * without a reason, and records the change. Nothing is overwritten: the change is
 * appended to implementation_owner_changes.
 */
export async function reassignImplementationOwner(
  input: { implementationId: string; teamMemberId: string | null } & OwnerChangeReason,
  actorProfileId: string,
): Promise<{ ok: true }> {
  // The reason is checked here as well as in the database, so a refusal reads as
  // a sentence before anything is sent.
  const reason = ownerChangeReasonInput.safeParse(ownerChangeFrom(input));
  if (!reason.success) {
    throw new Error(
      reason.error.issues[0]?.message ?? "Choose why the implementation is being reassigned.",
    );
  }
  const { error } = await db().rpc("implementation_set_owner", {
    p_profile: actorProfileId,
    p_implementation: input.implementationId,
    p_team_member: input.teamMemberId,
    p_reason_code: input.reasonCode,
    p_reason: input.reason,
  });
  if (error) throw writeFailure("reassign the implementation", error);
  await audit({
    actor_type: "user",
    actor_id: actorProfileId,
    action: "implementation.owner_reassigned",
    entity_type: "implementation",
    entity_id: input.implementationId,
    payload: { to: input.teamMemberId, reason_code: input.reasonCode },
  });
  return { ok: true };
}

/**
 * Sets or removes Team Lead authority on a profile. Runs on the CALLER'S session,
 * so the database can see who is signed in: only an admin or super admin may do
 * this, and never to themselves (portal_guard_team_lead). The read-back confirms
 * the write, because row-level security can match zero rows without an error.
 */
export async function setTeamLead(
  callerSupabase: { from: (table: string) => any },
  targetProfileId: string,
  teamLead: boolean,
): Promise<{ ok: true }> {
  const { error } = await callerSupabase
    .from("portal_profiles")
    .update({ team_lead: teamLead })
    .eq("id", targetProfileId);
  if (error) {
    if (error.code === "42501" || error.code === "P0001") {
      throw new Error(error.message);
    }
    console.error(`[post-sale] Team Lead update failed: ${error.message ?? "unknown"}`);
    throw new Error("Could not change Team Lead authority. Nothing has been changed.");
  }
  const { data: after, error: readError } = await callerSupabase
    .from("portal_profiles")
    .select("team_lead")
    .eq("id", targetProfileId)
    .maybeSingle();
  if (readError || !after) {
    throw new Error(
      "Could not confirm the Team Lead change. Check the person's access before relying on it.",
    );
  }
  if (after.team_lead !== teamLead) {
    throw new Error("The Team Lead change did not take effect. Nothing has been changed.");
  }
  return { ok: true };
}
