import { z } from "zod";

/** The only assessment values the schema's CHECK constraint accepts. */
export const OBSERVATION_ASSESSMENTS = ["improving", "met", "not_met", "inconclusive"] as const;

/** Approval statuses used for customer confirmation of a success criterion. */
export const CONFIRMATION_STATUSES = ["pending", "approved", "rejected"] as const;

const optionalText = z.string().trim().min(1).nullable();
const optionalUuid = z.string().uuid().nullable();

/** Append-only observation write. observed_at is a date (YYYY-MM-DD) from the UI. */
export const createObservationInput = z.object({
  successCriteriaId: z.string().uuid(),
  observedValue: z.string().trim().min(1),
  observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observedBy: optionalUuid,
  source: optionalText,
  assessment: z.enum(OBSERVATION_ASSESSMENTS),
  notes: optionalText,
  evidenceId: optionalUuid,
});

export type CreateObservationInput = z.infer<typeof createObservationInput>;

export function toObservationRow(data: CreateObservationInput) {
  return {
    success_criteria_id: data.successCriteriaId,
    observed_value: data.observedValue,
    // Stored as timestamptz; anchor the calendar date at UTC midnight.
    observed_at: `${data.observedAt}T00:00:00Z`,
    observed_by: data.observedBy,
    source: data.source,
    assessment: data.assessment,
    notes: data.notes,
    evidence_id: data.evidenceId,
  };
}

/** Customer confirmation is an approvals row scoped to one success criterion. */
export const createConfirmationInput = z.object({
  implementationId: z.string().uuid(),
  successCriteriaId: z.string().uuid(),
  customerContactId: z.string().uuid(),
  evidenceId: optionalUuid,
  status: z.enum(CONFIRMATION_STATUSES),
});

export const updateConfirmationInput = z.object({
  id: z.string().uuid(),
  evidenceId: optionalUuid,
  status: z.enum(CONFIRMATION_STATUSES),
});
