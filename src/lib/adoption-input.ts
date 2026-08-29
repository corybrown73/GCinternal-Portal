import { z } from "zod";

/**
 * Adoption is behavioural: "are the intended users and workflows actually
 * using the solution as intended?". It is deliberately separate from Prove
 * Value ("did the intended business outcome happen?") — neither is derived
 * from the other.
 */
export const ADOPTION_KINDS = ["user_group", "workflow"] as const;
export type AdoptionKind = (typeof ADOPTION_KINDS)[number];

export const ADOPTION_KIND_LABEL: Record<AdoptionKind, string> = {
  user_group: "Users / team",
  workflow: "Workflow",
};

/** The only state values the schema's CHECK constraint accepts. */
export const ADOPTION_STATES = [
  "not_started",
  "progressing",
  "established",
  "at_risk",
] as const;
export type AdoptionStateValue = (typeof ADOPTION_STATES)[number];

const optionalText = z.string().trim().min(1).nullable();
const optionalUuid = z.string().uuid().nullable();

export const adoptionAreaInput = z.object({
  kind: z.enum(ADOPTION_KINDS),
  name: z.string().trim().min(1),
  /** SOW-derived source context — preserved verbatim, never reinterpreted. */
  intendedUsage: optionalText,
  ownerId: optionalUuid,
  notes: optionalText,
  /** Kickoff intake — all optional. Blank means "not confirmed yet". */
  intendedUsers: optionalText,
  expectedFrequency: optionalText,
  inUseDefinition: optionalText,
  customerOwnerContactId: optionalUuid,
});

export const createAdoptionAreaInput = adoptionAreaInput.extend({
  implementationId: z.string().uuid(),
});

export const updateAdoptionAreaInput = adoptionAreaInput.extend({
  id: z.string().uuid(),
});

export type AdoptionAreaInput = z.infer<typeof adoptionAreaInput>;

export function toAdoptionAreaPatch(data: AdoptionAreaInput) {
  return {
    kind: data.kind,
    name: data.name,
    intended_usage: data.intendedUsage,
    owner_id: data.ownerId,
    notes: data.notes,
    intended_users: data.intendedUsers,
    expected_frequency: data.expectedFrequency,
    in_use_definition: data.inUseDefinition,
    customer_owner_contact_id: data.customerOwnerContactId,
  };
}

/** Append-only: adoption observations are never updated or deleted. */
export const createAdoptionObservationInput = z.object({
  adoptionAreaId: z.string().uuid(),
  observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observedBy: optionalUuid,
  state: z.enum(ADOPTION_STATES),
  workaroundInUse: z.boolean(),
  workaroundDescription: optionalText,
  source: optionalText,
  notes: optionalText,
  evidenceId: optionalUuid,
});

export type CreateAdoptionObservationInput = z.infer<typeof createAdoptionObservationInput>;

export function toAdoptionObservationRow(data: CreateAdoptionObservationInput) {
  return {
    adoption_area_id: data.adoptionAreaId,
    // Stored as timestamptz; anchor the calendar date at UTC midnight.
    observed_at: `${data.observedAt}T00:00:00Z`,
    observed_by: data.observedBy,
    state: data.state,
    workaround_in_use: data.workaroundInUse,
    workaround_description: data.workaroundInUse ? data.workaroundDescription : null,
    source: data.source,
    notes: data.notes,
    evidence_id: data.evidenceId,
  };
}
