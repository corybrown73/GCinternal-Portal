import { z } from "zod";
import { FIELD_MAPPING_STATUSES, NOTE_TYPES } from "./solution-enums";

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
