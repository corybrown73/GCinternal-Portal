import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

/**
 * Save or reset one implementation's Kickoff deck. The server enforces the test
 * account rule and the role rule (kickoff-slides.server.ts); the page's controls
 * only reflect them.
 */
export const saveKickoffDeckFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        dealId: z.string().uuid(),
        implementationId: z.string().uuid(),
        selection: z
          .object({
            included: z.array(z.string().max(60)).max(20),
            order: z.array(z.string().max(60)).max(20),
          })
          .nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { saveKickoffDeck } = await import("./kickoff-slides.server");
    return saveKickoffDeck({
      actorProfileId: context.profile.id,
      dealId: data.dealId,
      implementationId: data.implementationId,
      selection: data.selection,
    });
  });
