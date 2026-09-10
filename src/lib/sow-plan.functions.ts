import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

/** Read the deal's SOW into a services proposal. Read-only; applying is the panel's save. */
export const proposePlanFromSowFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ dealId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { proposePlanFromSow } = await import("./sow-plan.server");
    return proposePlanFromSow(context.userId, data.dealId);
  });
