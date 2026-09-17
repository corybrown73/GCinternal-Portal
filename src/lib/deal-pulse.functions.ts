import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

export const getDealPulseFn = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ dealId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { loadDealPulse } = await import("./deal-pulse.server");
    return loadDealPulse(data.dealId);
  });

/**
 * An existing customer buys services: start the existing-account path from
 * their record. Creates the closed-won deal, links it, sets the path, and
 * assigns it by rule — the same as a closed-won row arriving from Zapier.
 */
export const startServicesDealFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ customerId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { startServicesDeal } = await import("./deal-pulse.server");
    return startServicesDeal(context.profile.id, data.customerId);
  });
