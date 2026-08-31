import { z } from "zod";

import { LIFECYCLE_STAGES, type LifecycleStageId } from "./lifecycle";

/**
 * Stage advancement (P0 Slice 2). Only a single step forward along the existing
 * lifecycle ordering is allowed — no jumps, no rollbacks, no new stages.
 * Notes and "recorded by" are optional: blank means not stated, never invented.
 */
export const advanceStageInput = z.object({
  implementationId: z.string().uuid(),
  toStage: z.string().min(1),
  enteredBy: z.string().uuid().nullable(),
  notes: z.string().trim().min(1).nullable(),
  /**
   * Advancing with core criteria still outstanding.
   *
   * Sent by the client because the client is what showed the person the gap
   * and took their "yes anyway" — but never TRUSTED: the server recomputes the
   * gate state and refuses an override on a blocking stage that arrives
   * without a reason, whatever the flag says.
   */
  override: z
    .object({
      /** Their own words. Required when the stage's gate mode is blocking. */
      reason: z.string().trim().min(1).max(1000).nullable(),
    })
    .nullable(),
});

export type AdvanceStageInput = z.infer<typeof advanceStageInput>;

/** The single stage that follows `stage` in the canonical ordering, if any. */
export function nextLifecycleStage(stage: LifecycleStageId | null): LifecycleStageId | null {
  if (!stage) return null;
  const i = LIFECYCLE_STAGES.findIndex((s) => s.id === stage);
  if (i < 0 || i === LIFECYCLE_STAGES.length - 1) return null;
  return LIFECYCLE_STAGES[i + 1]!.id;
}
