import { supabaseAdmin } from "@/integrations/supabase/client.server";

import type { ClosureInput } from "./implementation-closure";

const db = () => supabaseAdmin as any;

/**
 * Closes one implementation through portal_close_implementation (0088), which
 * decides who may close it, refuses a second closure and a graduated one, and
 * writes the audit row. The app only passes the caller through and turns the
 * database's refusal into a plain message. Nothing else is written here.
 */
export async function closeImplementation(
  input: ClosureInput,
  actorProfileId: string,
): Promise<{ implementationId: string; closedAt: string }> {
  const { data, error } = await db().rpc("portal_close_implementation", {
    p_implementation_id: input.implementationId,
    p_reason: input.reason,
    p_note: input.note,
    p_actor_profile_id: actorProfileId,
  });
  if (error) throw closureRefusal(error);
  const row = data as { id: string; closed_at: string | null };
  if (!row?.closed_at)
    throw new Error("Could not close the implementation. Nothing has been changed.");
  return { implementationId: String(row.id), closedAt: String(row.closed_at) };
}

/** A database refusal, as the message the person needs. The codes are the ones migration 0088 raises. */
export function closureRefusal(error: { code?: string | null; message?: string | null }): Error {
  switch (error.code) {
    case "42501":
      return new Error(
        "You cannot close this implementation. A manager, an admin, or the implementation specialist it is assigned to can close it.",
      );
    case "23505":
      return new Error("This implementation is already closed.");
    case "P0002":
      return new Error("That implementation no longer exists.");
    case "22023":
      return new Error(
        error.message?.includes("graduated")
          ? "A graduated implementation cannot be closed."
          : (error.message ?? "That closure is not allowed."),
      );
    default:
      return new Error("Could not close the implementation. Nothing has been changed.");
  }
}
