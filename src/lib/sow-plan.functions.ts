import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  requireDealEditor,
  requireInternalAuth,
} from "@/integrations/supabase/internal-middleware";

/**
 * Read the deal's SOW into a services proposal. Read-only; applying is the
 * panel's save. The kept reading is served when the document is the one
 * that was read; `force` asks the model again.
 */
export const proposePlanFromSowFn = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z.object({ dealId: z.string().uuid(), force: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { proposePlanFromSow } = await import("./sow-plan.server");
    return proposePlanFromSow(context.userId, data.dealId, { force: data.force ?? false });
  });
