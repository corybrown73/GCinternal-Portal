import { z } from "zod";
import { FIELD_MAPPING_STATUSES, NOTE_TYPES, SOLUTION_STATUSES } from "./solution-enums";

/**
 * A working note written from inside a solution. The solution is taken from the
 * page the writer is on — never picked in the form — so the entry stays with the
 * solution it was written against.
 */
export const createSolutionNoteInput = z.object({
  technicalSolutionId: z.string().uuid(),
  noteType: z.enum(NOTE_TYPES),
  content: z.string().trim().min(1),
  authorId: z.string().uuid().nullable(),
  /** One link per line. */
  links: z.string().trim().min(1).nullable(),
  attachmentUrl: z.string().trim().min(1).nullable(),
  attachmentName: z.string().trim().min(1).nullable(),
});

const nullableText = z.string().trim().min(1).nullable();

const mappingFields = {
  sourceField: nullableText,
  sourceSystem: nullableText,
  targetField: nullableText,
  transformationNotes: nullableText,
  required: z.boolean().nullable(),
  status: z.enum(FIELD_MAPPING_STATUSES).nullable(),
};

export const createFieldMappingInput = z.object({
  technicalSolutionId: z.string().uuid(),
  ...mappingFields,
});

export const updateFieldMappingInput = z.object({
  id: z.string().uuid(),
  ...mappingFields,
});

export type FieldMappingFormInput = z.infer<typeof updateFieldMappingInput>;

/** Maps the form shape onto the field_mappings columns. */
export function toFieldMappingPatch(input: {
  sourceField: string | null;
  sourceSystem: string | null;
  targetField: string | null;
  transformationNotes: string | null;
  required: boolean | null;
  status: string | null;
}) {
  return {
    source_field: input.sourceField,
    source_system: input.sourceSystem,
    target_field: input.targetField,
    transformation_notes: input.transformationNotes,
    required: input.required,
    status: input.status,
  };
}

/** The design write-up kept against a solution. */
export const updateSolutionDesignInput = z.object({
  id: z.string().uuid(),
  designSummary: z.string().trim().min(1).nullable(),
  configurationDetails: z.string().trim().min(1).nullable(),
});

/**
 * A new solution on an account.
 *
 * WHY THIS DID NOT EXIST. Every part of a solution was already built — the
 * design summary, the working notes, the field mappings, the per-solution
 * record page — and there was no way to make one. Production held zero
 * solutions, zero notes and zero field mappings, which is why the tab read as
 * pointless: it was a fully furnished room with no door.
 *
 * NO REQUIREMENT NEEDED. `requirement_id` is nullable and stays null here.
 * Tying creation to a requirement meant a team had to write a formal
 * requirement before they could record what they were building, and with zero
 * requirements on file that made the whole surface unreachable. A solution can
 * be linked to a requirement later; it should not have to start as one.
 *
 * The implementation is taken from the account being viewed rather than picked
 * in the form, for the same reason a note takes its solution from the page it
 * is written on.
 */
export const createSolutionInput = z.object({
  implementationId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  /** What this integration actually does, in the engineer's words. */
  designSummary: z.string().trim().min(1).nullable(),
  /** How it is set up — endpoints, credentials location, sync cadence. */
  configurationDetails: z.string().trim().min(1).nullable(),
  ownerId: z.string().uuid().nullable(),
  status: z.enum(SOLUTION_STATUSES),
});
