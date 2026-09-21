import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

/**
 * The Field Fusion handoff: both checks ticked, the deal moves to Onboarding
 * Kickoff and implementation gets it with the use case, goals and setup
 * notes. A named person, or nobody — then the pool is told to claim it.
 */
export const handToImplementationFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        dealId: z.string().uuid(),
        teamMemberId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { handToImplementation } = await import("./field-fusion.server");
    return handToImplementation(context.profile.id, data.dealId, data.teamMemberId ?? null);
  });
