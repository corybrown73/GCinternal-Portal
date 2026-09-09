import { z } from "zod";

/**
 * The onboarding intake: what we ask a customer after the deal closes, and
 * the shape the answers are stored in (`portal_accounts.intake`).
 *
 * THE FORK. The first question is whether they already have forms built.
 * Yes: upload what exists, and the conversation is about mapping. No: a few
 * facts about the company, and the system shows starting points from the
 * form library for their industry. The library is pictures and words, on
 * purpose — a person who has never seen GoCanvas can point at a card and say
 * "that one, but with a signature block", which is a discovery meeting in a
 * sentence.
 *
 * WHY THE SHAPE IS OWNED HERE AND NOT BY COLUMNS. The questions will change
 * the first time three real intakes are run, and a column per question is a
 * migration per edit to a conversation. The database holds an object; this
 * file says what is in it.
 */

/**
 * The industries the form library is filed under. These come from what the
 * customer records already carry in production (Energy, Utilities, Roofing,
 * Environmental…) plus the field-service verticals GoCanvas sells into.
 * Free text is still accepted — a customer is whatever they are — but the
 * list is what the library is organised by.
 */
export const INDUSTRIES = [
  "Construction",
  "Oil & Gas",
  "Utilities",
  "Energy",
  "Environmental",
  "Facilities",
  "HVAC",
  "Roofing",
  "Mining",
  "Pipeline",
  "Field Service",
  "Manufacturing",
  "Logistics",
  "Property Management",
  "Other",
] as const;

export const COMPANY_SIZES = ["1–10", "11–50", "51–200", "201–1,000", "1,000+"] as const;

export const intakeAnswersSchema = z.object({
  /** The fork. null until the question has been asked. */
  forms_built: z.boolean().nullable().default(null),
  /** What they uploaded, when forms_built is true. Paths into the private bucket. */
  uploaded_forms: z
    .array(
      z.object({
        path: z.string().min(1),
        name: z.string().min(1),
        uploaded_at: z.string(),
      }),
    )
    .default([]),
  industry: z.string().trim().max(80).nullable().default(null),
  company_size: z.string().trim().max(20).nullable().default(null),
  /** How many people will actually use it in the field. */
  field_users: z.number().int().nonnegative().nullable().default(null),
  /** The process today, in their words. Feeds the deck's "before". */
  current_process: z.string().trim().max(4000).nullable().default(null),
  /** Templates from the library they pointed at. Ids, so a renamed card still resolves. */
  chosen_templates: z.array(z.string().uuid()).default([]),
  updated_at: z.string().nullable().default(null),
});

export type IntakeAnswers = z.infer<typeof intakeAnswersSchema>;

export const EMPTY_INTAKE: IntakeAnswers = intakeAnswersSchema.parse({});

/** Whatever is in the column, as a well-formed object. Never throws. */
export function readIntake(raw: unknown): IntakeAnswers {
  const r = intakeAnswersSchema.safeParse(raw ?? {});
  return r.success ? r.data : EMPTY_INTAKE;
}

/**
 * The questions on the "no forms yet" branch, in the order they are asked.
 * Kept as data so the panel and the Claude prompt read the same list.
 */
export const NO_FORMS_QUESTIONS = [
  { key: "industry", ask: "What industry are they in?" },
  { key: "company_size", ask: "How big is the company?" },
  { key: "field_users", ask: "How many people will use it in the field?" },
  { key: "current_process", ask: "What is the process today — paper, spreadsheet, whiteboard?" },
] as const;

/** Is there enough to move on? Either branch has one thing it cannot do without. */
export function intakeStatus(a: IntakeAnswers): {
  done: boolean;
  next: string | null;
} {
  if (a.forms_built === null) return { done: false, next: "Do they already have forms built?" };
  if (a.forms_built) {
    return a.uploaded_forms.length > 0
      ? { done: true, next: null }
      : { done: false, next: "Upload the forms they have." };
  }
  if (!a.industry) return { done: false, next: "What industry are they in?" };
  if (!a.current_process) return { done: false, next: "What is the process today?" };
  return { done: true, next: null };
}
