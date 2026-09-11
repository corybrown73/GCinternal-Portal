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
  /**
   * The forms they want built, in priority order: the first is THE first
   * form — the seven-day one. A library card they picked lands here with its
   * template id; a form they named on the call lands here typed. Three or
   * four is normal; we still build one first.
   */
  /** Welcome-page screens the presenter has switched off for this customer, by key. */
  welcome_hidden_screens: z.array(z.string().max(40)).max(20).default([]),
  wanted_forms: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        name: z.string().trim().min(1).max(160),
        template_id: z.string().uuid().nullable().default(null),
      }),
    )
    .default([]),
  /**
   * The seven-day plan's knobs (src/lib/onboarding-timeline.ts). The plan is
   * computed from the close date; only what a person changed is stored, so
   * a moved date survives and everything else follows the rule.
   */
  timeline: z
    .object({
      /** YYYY-MM-DD. Defaults to the deal's closed-won date when absent. */
      close_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .default(null),
      /** milestone key → YYYY-MM-DD, for dates moved by hand. */
      overrides: z.record(z.string(), z.string()).default({}),
      holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
      integration_tier: z.number().int().min(0).max(5).default(0),
      integration_target: z.string().trim().max(120).nullable().default(null),
      /** Who at the customer runs the form on real jobs. */
      field_tester: z.string().trim().max(120).nullable().default(null),
      /** The phase-2 gate: the day a person recorded the form as dialed in. */
      form_proven_on: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .default(null),
      /** Milestone key → ISO date it was actually done. */
      completed: z.record(z.string(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default({}),
      /** Milestone key → "HH:MM", for the calls that are booked. */
      times: z.record(z.string(), z.string().regex(/^\d{2}:\d{2}$/)).default({}),
      /** IANA zone the times are in, e.g. America/Chicago. */
      timezone: z.string().trim().max(64).nullable().default(null),
      /** Everything bought beyond the first form: phase 1 runs alongside it, 2 and up wait. */
      services: z
        .array(
          z.object({
            id: z.string().min(1).max(40),
            kind: z.enum([
              "integration",
              "custom_pdf",
              "paid_form",
              "analytics",
              "data_load",
              "training",
              "other",
            ]),
            name: z.string().trim().min(1).max(120),
            phase: z.number().int().min(1).max(9),
            tier: z.number().int().min(0).max(5).nullable().optional(),
            weeks: z.number().min(0.5).max(52).nullable().optional(),
            needs: z.string().trim().max(300).nullable().optional(),
          }),
        )
        .default([]),
    })
    .default({}),
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

export type WantedForm = IntakeAnswers["wanted_forms"][number];

/**
 * Picking a library card puts it on the wanted list (and takes it off again).
 * Both fields are returned so the older readers of chosen_templates stay in
 * step with the list.
 */
export function toggleWantedTemplate(
  a: Pick<IntakeAnswers, "wanted_forms" | "chosen_templates">,
  template: { id: string; name: string },
): { wanted_forms: WantedForm[]; chosen_templates: string[] } {
  // A deal from before the list existed may have the card chosen with no
  // list entry: picking it again un-chooses it, and the list stays empty.
  if (!a.wanted_forms.length && a.chosen_templates.includes(template.id)) {
    return {
      wanted_forms: [],
      chosen_templates: a.chosen_templates.filter((id) => id !== template.id),
    };
  }
  const has = a.wanted_forms.some((f) => f.template_id === template.id);
  const wanted_forms = has
    ? a.wanted_forms.filter((f) => f.template_id !== template.id)
    : [
        ...a.wanted_forms,
        { id: `t-${template.id.slice(0, 8)}`, name: template.name, template_id: template.id },
      ];
  return { wanted_forms, chosen_templates: templateIds(wanted_forms) };
}

/** A form named on the call, no card behind it. */
export function addWantedForm(
  a: Pick<IntakeAnswers, "wanted_forms" | "chosen_templates">,
  name: string,
): { wanted_forms: WantedForm[]; chosen_templates: string[] } {
  const clean = name.trim();
  if (!clean) return { wanted_forms: a.wanted_forms, chosen_templates: a.chosen_templates };
  const id = `f-${Math.random().toString(36).slice(2, 8)}`;
  const wanted_forms = [...a.wanted_forms, { id, name: clean, template_id: null }];
  return { wanted_forms, chosen_templates: templateIds(wanted_forms) };
}

/** Move one to the front: it becomes the first form. */
export function makeFirstWantedForm(forms: WantedForm[], id: string): WantedForm[] {
  const it = forms.find((f) => f.id === id);
  return it ? [it, ...forms.filter((f) => f.id !== id)] : forms;
}

/** The card ids on the list — what chosen_templates is written as. */
export function templateIds(forms: WantedForm[]): string[] {
  return forms.map((f) => f.template_id).filter((x): x is string => Boolean(x));
}

/** What the grid outlines: the list's cards, or — with no list yet — what was chosen before it existed. */
export function chosenFrom(forms: WantedForm[], previous: string[]): string[] {
  return forms.length ? templateIds(forms) : previous;
}
