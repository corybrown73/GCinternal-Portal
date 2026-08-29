import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The authenticated door onto the shared plan. Scope is resolved from the
 * caller's `customer_users` rows, never from the request — the portal key in
 * the URL only says which plan is being asked for.
 */

const portalKey = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{18}$/);

export const getPortalPlan = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ portalKey }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { loadPortalPlan } = await import("./portal-plan.server");
    return loadPortalPlan(context.userId, data.portalKey);
  });

export const completePortalPlanTask = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ portalKey, ref: z.string().trim().min(8).max(64) }).parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { completePortalTask } = await import("./portal-plan.server");
    return completePortalTask(context.userId, data.portalKey, data.ref);
  });
