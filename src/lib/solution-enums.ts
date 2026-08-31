/** Live CHECK-constraint values for technical solution records. */
export const SOLUTION_STATUSES = ["draft", "in_review", "approved", "built", "validated"] as const;

/**
 * The end of the line: built AND proven. Named rather than compared against a
 * literal in three places, because "which status means done" is exactly the
 * kind of fact that gets answered differently in each of them.
 */
export const SOLUTION_COMPLETE_STATUS = "validated";

export const NOTE_TYPES = ["assessment", "design", "build", "limitation", "handoff"] as const;

export const TECHNICAL_SOLUTIONS_ROLE = "Technical Solutions";

/**
 * field_mappings.status has no CHECK constraint and all seeded rows are NULL.
 * These are the only status values already recognised by the existing derive
 * layer (customer360-derive MAPPING_COMPLETE) — no new vocabulary invented.
 * NULL is represented in the UI as "Not set".
 */
export const FIELD_MAPPING_STATUSES = ["mapped", "validated", "complete"] as const;
