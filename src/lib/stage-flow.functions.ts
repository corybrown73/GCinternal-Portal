import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDealEditor } from "@/integrations/supabase/internal-middleware";

/**
 * The page's own reading says a stage is done: move it, if the record
 * agrees. Harmless to call when nothing is due — it reads and returns.
 */
export const syncDealStageFn = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) => z.object({ dealId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { syncDealStage } = await import("./stage-flow.server");
    return syncDealStage(data.dealId, context.userId);
  });

/**
 * Read the Gong brief and the SOW and prepare the deal. The page fires this
 * when notes or a SOW arrive and does not wait on it: progress is on the
 * record (intake.ai_reading), so any screen can show it.
 */
export const prepareDealFn = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) => z.object({ dealId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { prepareDeal } = await import("./prepare-deal.server");
    return prepareDeal(context.userId, data.dealId);
  });
