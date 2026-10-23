import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * The one way the app changes who owns an account, besides a claim (claimDeal) and
 * the rule-based assignments (assignDeal). Every change runs in the database under
 * the ownership locks, and is recorded in the owner history in the same transaction
 * (migration 0087). The database checks the role too; this checks it first so the
 * refusal reads well.
 */

const db = () => supabaseAdmin as any;

/**
 * Whether a signed-in profile may deliberately assign, reassign or clear an owner:
 * exactly the roles canManage names (admin, super admin, manager).
 */
export async function actorMayAssignOwner(profileId: string | null | undefined): Promise<boolean> {
  if (!profileId) return false;
  const { data } = await db()
    .from("portal_profiles")
    .select("role")
    .eq("id", profileId)
    .maybeSingle();
  const { canManage } = await import("@/lib/auth");
  return canManage((data?.role as Parameters<typeof canManage>[0]) ?? undefined);
}

export type OwnerChange = {
  changed: boolean;
  previousOwnerId: string | null;
  newOwnerId: string | null;
};

/**
 * Sets the owner of a project, or clears it (ownerId null). `expectedOwnerId`, when
 * given, is the owner the caller saw: if someone else has changed it since, nothing
 * is written and the caller is told to reload.
 */
export async function changeImplementationOwner(args: {
  implementationId: string;
  ownerId: string | null;
  actorProfileId: string;
  reason: string | null;
  expectedOwnerId?: string | null | undefined;
}): Promise<OwnerChange> {
  const { data, error } = await db().rpc("portal_set_implementation_owner", {
    p_implementation: args.implementationId,
    p_new_owner: args.ownerId,
    p_actor_profile: args.actorProfileId,
    p_reason: args.reason,
    p_check_expected: args.expectedOwnerId !== undefined,
    p_expected_owner: args.expectedOwnerId ?? null,
  });
  if (error) throw new Error(ownerFailure(error.message));
  const row = data as {
    changed?: unknown;
    previous_owner_id?: unknown;
    new_owner_id?: unknown;
  } | null;
  return {
    changed: row?.changed === true,
    previousOwnerId: (row?.previous_owner_id as string | null) ?? null,
    newOwnerId: (row?.new_owner_id as string | null) ?? null,
  };
}

/** The database's refusal, without the code word in front, for the person to read. */
function ownerFailure(message: string): string {
  return message.replace(/^(owner_changed|forbidden|ownership_retry):\s*/, (_m, code: string) =>
    code === "forbidden" ? "Forbidden: " : "",
  );
}
