import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import { MANAGE_ROLES } from "./roles";

export const getComplexityTiers = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadComplexityTiers } = await import("./complexity-tiers.server");
    return loadComplexityTiers();
  });

export const setComplexityTiers = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        tiers: z
          .array(
            z.object({
              tier: z.number().int().min(0).max(99),
              name: z.string().trim().min(1).max(60),
              business_days: z.number().int().min(0).max(400),
              qualifies: z.string().trim().max(500),
            }),
          )
          .min(1)
          .max(12),
      })
      .parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    if (!MANAGE_ROLES.includes(context.profile.role)) {
      throw new Error("Forbidden: the tiers are set by an admin or manager.");
    }
    const { saveComplexityTiers } = await import("./complexity-tiers.server");
    return saveComplexityTiers(data.tiers);
  });
