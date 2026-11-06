import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

/**
 * Save or reset one implementation's Kickoff deck choice (the deck type and whether
 * the first form is ready). The server enforces the role rule
 * (kickoff-slides.server.ts); the page's controls only reflect it.
 */
export const saveKickoffDeckFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        dealId: z.string().uuid(),
        implementationId: z.string().uuid(),
        choice: z
          .object({
            deckType: z.enum(["standard", "partner"]),
            formReady: z.boolean(),
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
      choice: data.choice,
    });
  });
