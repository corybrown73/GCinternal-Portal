import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import { ownerChangeFromRaw } from "./owner-change";

/**
 * Server functions for post-sale ownership and Team Lead authority. Each is
 * signed-in only, and the database decides what the caller may do: the functions
 * never assume a role from the client.
 */

const uuid = z.string().uuid();

export const reassignImplementationOwnerFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => {
    const base = z.object({ implementationId: uuid, teamMemberId: uuid.nullable() }).parse(data);
    const ownerChange = ownerChangeFromRaw((data as { ownerChange?: unknown }).ownerChange);
    if (!ownerChange) throw new Error("Choose why the implementation is being reassigned.");
    return { ...base, ownerChange };
  })
  .handler(async ({ data, context }) => {
    const { reassignImplementationOwner } = await import("./post-sale-access.server");
    return reassignImplementationOwner(
      {
        implementationId: data.implementationId,
        teamMemberId: data.teamMemberId,
        reasonCode: data.ownerChange.reasonCode,
        reason: data.ownerChange.reason,
      },
      context.profile.id,
    );
  });

/**
 * Grants or removes Team Lead authority. Runs on the caller's own session, so the
 * database's guard sees who is signed in. Only an admin or super admin may do this,
 * and never for themselves.
 */
export const setTeamLeadFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z.object({ profileId: uuid, teamLead: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireSuperAdmin } = await import("./presale.server");
    await requireSuperAdmin(context.userId);
    const { setTeamLead } = await import("./post-sale-access.server");
    return setTeamLead(context.supabase as any, data.profileId, data.teamLead);
  });
