import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ------------------------------------------------------------------------- */
/* Customer access management — internal-only server functions.              */
/* ------------------------------------------------------------------------- */

export const getAccessOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireInternal } = await import("./portal.server");
    await requireInternal(context.userId);
    const { loadAccessOverview } = await import("./access.server");
    return loadAccessOverview();
  });

export const inviteContact = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        customerId: z.string().uuid(),
        email: z.string().trim().email(),
        contactId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { requireInternal } = await import("./portal.server");
    const inviter = await requireInternal(context.userId);
    const { inviteCustomerContact } = await import("./access.server");
    return inviteCustomerContact(inviter, {
      customerId: data.customerId,
      email: data.email,
      contactId: data.contactId ?? null,
    });
  });

export const revokeCustomerInvite = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ inviteId: z.string().uuid() }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { requireInternal } = await import("./portal.server");
    const actor = await requireInternal(context.userId);
    const { revokeInvite } = await import("./access.server");
    await revokeInvite(data.inviteId, actor.id);
    return { ok: true };
  });

export const removeCustomerAccess = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ linkId: z.string().uuid() }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { requireInternal } = await import("./portal.server");
    const actor = await requireInternal(context.userId);
    const { removeCustomerUser } = await import("./access.server");
    await removeCustomerUser(data.linkId, actor.id);
    return { ok: true };
  });
