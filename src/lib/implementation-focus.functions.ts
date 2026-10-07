import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDealEditor } from "@/integrations/supabase/internal-middleware";

const dealIdInput = (data: unknown) => z.object({ dealId: z.string().uuid() }).parse(data);

/** "Generate proposed focus" / "Refresh proposal" — see implementation-focus.server.ts. */
export const generateImplementationFocusFn = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator(dealIdInput)
  .handler(async ({ data, context }) => {
    const { generateImplementationFocus } = await import("./implementation-focus.server");
    return generateImplementationFocus(context.profile.id, data.dealId);
  });

/** "Confirm implementation focus" — see implementation-focus.server.ts. */
export const confirmImplementationFocusFn = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator(dealIdInput)
  .handler(async ({ data, context }) => {
    const { confirmImplementationFocus } = await import("./implementation-focus.server");
    return confirmImplementationFocus(context.profile.id, data.dealId);
  });
