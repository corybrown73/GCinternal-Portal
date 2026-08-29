import { z } from "zod";
import { LIFECYCLE_STAGES } from "./lifecycle";

const STAGE_IDS = LIFECYCLE_STAGES.map((s) => s.id) as [string, ...string[]];

const optionalText = z.string().trim().min(1).nullable();

/** Fields the Customer 360 criterion editor may write. measured_value / measured_at
 *  / status are deliberately excluded — they belong to observation handling. */
export const successCriterionInput = z.object({
  description: z.string().trim().min(1),
  metric: optionalText,
  baselineValue: optionalText,
  targetValue: optionalText,
  measurementSource: optionalText,
  dueStage: z.enum(STAGE_IDS).nullable(),
  ownerId: z.string().uuid().nullable(),
  /** Kickoff intake — all optional. Blank means "not confirmed yet", never zero. */
  baselinePeriod: optionalText,
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  customerOwnerContactId: z.string().uuid().nullable(),
});

export const createSuccessCriterionInput = successCriterionInput.extend({
  implementationId: z.string().uuid(),
});

export const updateSuccessCriterionInput = successCriterionInput.extend({
  id: z.string().uuid(),
});

export type SuccessCriterionInput = z.infer<typeof successCriterionInput>;

export function toSuccessCriterionPatch(data: SuccessCriterionInput) {
  return {
    description: data.description,
    metric: data.metric,
    baseline_value: data.baselineValue,
    target_value: data.targetValue,
    measurement_source: data.measurementSource,
    due_stage: data.dueStage,
    owner_id: data.ownerId,
    baseline_period: data.baselinePeriod,
    target_date: data.targetDate,
    customer_owner_contact_id: data.customerOwnerContactId,
  };
}
