import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

/** Super admin only; the role is checked on the server, not by the button. */
export const deleteCustomerFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        customerId: z.string().uuid(),
        /** Must equal the customer's name: the confirmation is typed, not clicked. */
        confirmName: z.string().trim().min(1),
        deleteDeals: z.boolean().default(true),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireSuperAdmin } = await import("./presale.server");
    const actor = await requireSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: customer } = await (supabaseAdmin as any)
      .from("customers")
      .select("name")
      .eq("id", data.customerId)
      .maybeSingle();
    if (!customer) throw new Error("That customer no longer exists");
    if (String(customer.name).trim().toLowerCase() !== data.confirmName.toLowerCase()) {
      throw new Error("The name typed does not match the customer");
    }
    const { deleteCustomer } = await import("./customer-delete.server");
    return deleteCustomer(actor.id, data.customerId, { deleteDeals: data.deleteDeals });
  });
