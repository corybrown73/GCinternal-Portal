import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDealEditor } from "@/integrations/supabase/internal-middleware";

/**
 * Untick "Kickoff held". Gated by the same deal-editor rule as marking it
 * (saveIntake). The client sends what it showed; the server re-reads the deal
 * and refuses if it has changed.
 */
export const correctKickoffHeld = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z
      .object({
        dealId: z.string().uuid(),
        expected: z.object({
          stage: z.string().min(1).max(40),
          intake: z.record(z.string(), z.unknown()),
          kind: z.enum(["auto", "confirm_later_work"]),
        }),
        confirmLaterWork: z.boolean(),
        note: z.string().trim().max(500).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { correctKickoffHeldForDeal } = await import("./kickoff-correction.server");
    return correctKickoffHeldForDeal({
      dealId: data.dealId,
      actorProfileId: context.profile.id,
      expected: data.expected,
      confirmLaterWork: data.confirmLaterWork,
      note: data.note ?? null,
    });
  });
