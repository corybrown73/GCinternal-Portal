import { z } from "zod";

/**
 * A date a source states, typed by the reader that read it — never parsed
 * out of prose. "End of October" is not a day; a date lands here only when
 * the document or the call names one.
 */
export const typedDateSchema = z.object({
  type: z.enum(["signed", "start", "deadline", "absence"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** The last day, for an absence or a window; null for a single day. */
  end: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  /** Who it is about, for an absence. */
  who: z.string().trim().max(120).nullable().default(null),
  /** The words it was read from. */
  quote: z.string().max(300),
});
export type TypedDate = z.infer<typeof typedDateSchema>;

/**
 * One step of this account's plan, as a person changed it. Everything is
 * optional: only what differs from the standard is stored, so a standard
 * that improves later still flows through untouched fields.
 */
export const planStepEditSchema = z.object({
  label: z.string().trim().max(120).optional(),
  kind: z.enum(["call", "homework", "build", "milestone"]).optional(),
  icon: z.string().trim().max(40).optional(),
  owner: z.enum(["gocanvas", "client", "both"]).optional(),
  minutes: z.number().int().min(15).max(240).nullable().optional(),
  detail: z.string().trim().max(400).optional(),
  /** Business days after the close: the step's own base date. */
  day: z.number().int().min(0).max(120).optional(),
  /** For work between calls: the business day it runs through; null clears a span. */
  throughDay: z.number().int().min(0).max(120).nullable().optional(),
});
export type PlanStepEdit = z.infer<typeof planStepEditSchema>;

/**
 * The account's departures from the standard plan. Our standard (Settings →
 * Onboarding plans) is what every account starts from; this is what the
 * implementation team changed for THIS one — a stage that already happened
 * pre-sale taken out, two stages swapped, a step renamed, a call made a
 * working session. Empty means "as standard".
 */
export const planEditsSchema = z.object({
  /** Step keys taken off this account's plan. */
  removed: z.array(z.string().max(40)).max(40).default([]),
  /** The full order of step keys when a person reordered them; null for the standard order. */
  order: z.array(z.string().max(40)).max(40).nullable().default(null),
  /** Per-step changes, by key. */
  steps: z.record(z.string().max(40), planStepEditSchema).default({}),
  /** Steps this account has that the standard does not. */
  added: z
    .array(
      planStepEditSchema.extend({
        key: z.string().min(1).max(40),
        label: z.string().trim().min(1).max(120),
        day: z.number().int().min(0).max(120),
      }),
    )
    .max(20)
    .default([]),
});
export type PlanEdits = z.infer<typeof planEditsSchema>;
export const EMPTY_PLAN_EDITS: PlanEdits = { removed: [], order: null, steps: {}, added: [] };

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
  "Plumbing",
  "Mechanical",
  "Manufacturing",
  "Logistics",
  "Property Management",
  "Other",
] as const;

export const COMPANY_SIZES = ["1–10", "11–50", "51–200", "201–1,000", "1,000+"] as const;

const shortText = z.string().trim().max(300).nullable().default(null);
const longText = z.string().trim().max(6000).nullable().default(null);
const list = z.array(z.string().trim().min(1).max(120)).max(40).default([]);

/**
 * The "New FF Client Request" form in GoCanvas, one submission. Field for
 * field what the form asks, so the deal page can show it as it was written
 * and the handoff to implementation carries it without retyping.
 */
export const fieldFusionRequestSchema = z.object({
  submission_id: shortText,
  submission_no: shortText,
  submitted_at: shortText,
  company_name: shortText,
  logo_url: z.string().trim().max(1000).nullable().default(null),
  admin_first_name: shortText,
  admin_last_name: shortText,
  admin_gcid: shortText,
  admin_email: shortText,
  admin_phone: shortText,
  salesforce_url: z.string().trim().max(1000).nullable().default(null),
  industry: shortText,
  /** The relevant features ticked: Dispatch to Field, Scheduling, Route optimization… */
  features: list,
  analytics_needs: longText,
  output_destinations: list,
  first_use_case: shortText,
  process_description: longText,
  forms_in_progress: shortText,
  pdf_designer: shortText,
  data_sets: list,
  customers_are: list,
  customers_have: list,
  sites_are: list,
  notes: longText,
  requester_name: shortText,
  requester_email: shortText,
});
export type FieldFusionRequest = z.infer<typeof fieldFusionRequestSchema>;

export const intakeAnswersSchema = z.object({
  /**
   * Which path this is. A new logo builds its first form in seven days; an
   * existing account adding services reviews the form the integration reads
   * from. null until somebody says — the plan treats null as a new logo.
   */
  path: z.enum(["new_logo", "existing", "dm_conversion", "field_fusion"]).nullable().default(null),
  /** What the notes suggest the path is. A person confirms; the plan never reads this. */
  path_suggested: z
    .enum(["new_logo", "existing", "dm_conversion", "field_fusion"])
    .nullable()
    .default(null),
  /**
   * The first fact after the notes: were integrations or solutions part of
   * the sale? Yes means the SOW is read into the plan; the notes never add
   * a service on their own. null until asked.
   */
  solutions_involved: z.boolean().nullable().default(null),
  /** Is there a SOW? A small deal has a contract and no SOW; either way the paper travels. */
  has_sow: z.boolean().nullable().default(null),
  /** The signed contract, when there is no SOW (or beside it): seats, term, price. */
  contract: z
    .object({ path: z.string().min(1), name: z.string().min(1), uploaded_at: z.string() })
    .nullable()
    .default(null),
  /**
   * The Account Manager's questions on an existing account. Is the form
   * final? If not, are we building it or is the customer? A customer build
   * has a date and a freeze; the integration waits behind the freeze.
   */
  existing: z
    .object({
      form_final: z.boolean().nullable().default(null),
      builder: z.enum(["us", "customer"]).nullable().default(null),
      customer_build_by: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .default(null),
      form_frozen_on: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .default(null),
    })
    .default({}),
  /**
   * No form to build: the crew just needs training. Phase 1 becomes the
   * training plan and the forms question is skipped. A Field Fusion account
   * is training-only by definition; this flag is for every other kind.
   */
  training_only: z.boolean().default(false),
  /**
   * The Field Fusion gate, before the handoff to implementation. Liesl
   * confirms the product is working and the account is set up, writes what
   * the implementer should know, and presses "Hand to implementation".
   */
  field_fusion: z
    .object({
      form_connected: z.boolean().default(false),
      client_trained: z.boolean().default(false),
      notes: z.string().trim().max(4000).default(""),
      handed_off_at: z.string().nullable().default(null),
      /**
       * A Field Fusion proof of concept: the deal was opened by the "New FF
       * Client Request" form in GoCanvas (via Zapier), before any close. The
       * board marks it so the POCs can be tracked as a group.
       */
      poc: z.boolean().default(false),
      /** The request form's answers, as submitted — what Liesl already typed, kept so nobody types it twice. */
      request: fieldFusionRequestSchema.nullable().default(null),
    })
    .default({}),
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
  /**
   * Who wrote it: the brief's synthesis ("ai") or a person ("person"). The
   * deck quotes it only when a person wrote or confirmed it — an AI
   * paraphrase in quotation marks was read to a customer as their own words.
   */
  current_process_source: z.enum(["ai", "person"]).nullable().default(null),
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
  /**
   * Readiness items that are not part of this implementation — "Updates the
   * datasets" for a customer with no datasets. The owner takes them off; the
   * plan's own signals (a data load, the Field Fusion request) put the data
   * items on to begin with.
   */
  readiness_off: z.array(z.string().max(40)).max(20).default([]),
  /** When a person copied the customer's link to send it. Set by that click only. */
  welcome_shared_at: z.string().nullable().default(null),
  /**
   * The pre-kickoff tasks that live nowhere else, by key ("reply_ae",
   * "cadence") → ISO timestamp they were ticked. See stage-flow.ts.
   */
  handoff_tasks: z.record(z.string().max(40), z.string().max(40)).default({}),
  /**
   * Who owns each answer. The AI reading fills and REFRESHES the fields in
   * `ai_filled`; a field a person has answered (`person_set`) is never
   * written by it again. `ai_sources` keeps the words each AI answer came
   * from, shown beside it. See intake-prefill.ts.
   */
  /**
   * The automatic reading's own state, so every screen can say "reading…"
   * and a reload does not lose it. `again` asks for one more run when new
   * notes or a new SOW arrived while one was in flight.
   */
  ai_reading: z
    .object({
      status: z.enum(["running", "done", "failed"]),
      started_at: z.string(),
      finished_at: z.string().nullable().default(null),
      filled: z.array(z.string().max(120)).max(30).default([]),
      error: z.string().max(500).nullable().default(null),
      again: z.boolean().default(false),
    })
    .nullable()
    .default(null),
  /**
   * The recap after each core meeting (the playbook's close): what was done,
   * what is open and whose, what each side prepares, the next objective.
   * Keyed by the meeting's milestone key.
   */
  recaps: z
    .record(
      z.string().max(40),
      z.object({
        completed: z.string().max(2000).default(""),
        open_items: z.string().max(2000).default(""),
        customer_prep: z.string().max(1000).default(""),
        gocanvas_prep: z.string().max(1000).default(""),
        next_objective: z.string().max(500).default(""),
        at: z.string().max(40),
      }),
    )
    .default({}),
  ai_filled: z.array(z.string().max(40)).max(40).default([]),
  person_set: z.array(z.string().max(40)).max(40).default([]),
  ai_sources: z
    .record(
      z.string().max(40),
      z.object({ quote: z.string().max(400), source: z.string().max(200) }),
    )
    .default({}),
  /**
   * Text on the welcome page a person rewrote in place, by text key
   * ("team.dana-whitfield.does"). The page, the customer's link, the PDF and
   * the PowerPoint all read it; a missing key means the page's own words.
   */
  welcome_text: z.record(z.string().max(80), z.string().max(1200)).default({}),
  /**
   * "Get started on your own": help-centre articles for the features the
   * calls flagged, each with why in the customer's words. The picker fills
   * this after the brief; a person can remove, add, or reword.
   */
  help_picks: z
    .array(
      z.object({
        article_id: z.string().min(1).max(40),
        title: z.string().trim().min(1).max(200),
        url: z.string().url().max(500),
        why: z.string().trim().max(240).default(""),
        source: z.enum(["ai", "person"]).default("ai"),
        feature: z.string().trim().max(60).nullable().optional(),
        when: z
          .enum(["before session 1", "after session 1", "after session 2", "phase 2"])
          .nullable()
          .optional(),
      }),
    )
    .max(8)
    .default([]),
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
      /** When the SOW was read into the plan. Set by that action only; the guide reads it. */
      sow_applied_at: z.string().nullable().default(null),
      /** What the SOW says that the plan cannot hold — named dates, exclusions — kept for the watch-outs. */
      sow_notes: z.array(z.string().max(300)).max(20).default([]),
      /**
       * Dates the SOW states, typed by the reader: a deadline, a start, the
       * signing, an absence. Null on a deal read before the reader typed
       * them (the watch-outs then fall back to reading the notes' words).
       */
      sow_dates: z.array(typedDateSchema).max(20).nullable().default(null),
      /** Service keys (see normalizeServiceKey) a person removed: a re-read never puts them back. */
      removed_services: z.array(z.string().max(160)).max(40).default([]),
      /** The core meetings' length when the SOW states one; null for the plan's own. */
      session_minutes: z.number().int().min(15).max(240).nullable().default(null),
      /** This account's departures from the standard plan (see planEditsSchema). */
      plan_edits: planEditsSchema.default({}),
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
            tool: z.string().trim().max(40).nullable().optional(),
          }),
        )
        .default([]),
    })
    .default({}),
  /**
   * THE SALES → TIS HANDOFF (src/lib/sales-handoff.ts). One question set,
   * two sides: what Sales knows (what was bought, the outcome, what was
   * promised, who the contacts are, timing) and what the customer tells us
   * before kickoff. Each answer remembers who gave it — Sales, the AI
   * reading, the TIS, or the customer on their welcome link — so the TIS
   * can tell a fact from a guess. Questions that already live elsewhere on
   * the intake (industry, field users, the process today) stay there; only
   * the new ones store here.
   */
  handoff: z
    .object({
      answers: z
        .record(
          z.string().max(40),
          z.object({
            value: z.union([
              z.string().max(4000),
              z.array(z.string().max(200)).max(40),
              z.boolean(),
              z.null(),
            ]),
            source: z.enum(["sales", "ai", "tis", "customer"]),
            at: z.string().max(40),
            by: z.string().uuid().nullable().default(null),
            /** The AI's source words, when the AI answered. */
            quote: z.string().max(400).nullable().default(null),
          }),
        )
        .default({}),
      /** Nikki's rule: commitments, or an explicit "none were made". */
      commitments_none: z.boolean().default(false),
      /** The open questions went to the customer on their welcome link. */
      sent_to_customer_at: z.string().nullable().default(null),
      sent_by: z.string().uuid().nullable().default(null),
      /** The question keys the sender chose to ask the customer. */
      asked: z.array(z.string().max(40)).max(40).default([]),
      /** A person said the handoff is complete, whatever the checks say. */
      completed_at: z.string().nullable().default(null),
      completed_by: z.string().uuid().nullable().default(null),
      /** The TIS went ahead without the customer's answers, and said why. */
      customer_ready_override: z
        .object({ at: z.string(), by: z.string().uuid().nullable(), reason: z.string().max(300) })
        .nullable()
        .default(null),
    })
    .default({}),
  /**
   * How Implementation Complete finished (the operating model): Proven, the
   * agreed outcome shown in real use; or Not Proven, with the reason. An
   * internal reporting status, never shown to the customer.
   */
  outcome: z
    .object({
      kind: z.enum(["proven", "not_proven"]),
      reason: z.string().trim().max(600).nullable().default(null),
      at: z.string().max(40),
      by: z.string().uuid().nullable().default(null),
    })
    .nullable()
    .default(null),
  updated_at: z.string().nullable().default(null),
});

export type IntakeAnswers = z.infer<typeof intakeAnswersSchema>;
export type HandoffAnswer = IntakeAnswers["handoff"]["answers"][string];
export type HandoffSource = HandoffAnswer["source"];

/** Phase 1 is training, not a form build: Field Fusion, or the person said so. */
export function isTrainingOnly(a: Pick<IntakeAnswers, "path" | "training_only">): boolean {
  return a.path === "field_fusion" || a.training_only === true;
}

/**
 * The flow is picked AND its own question is answered: a new logo or a
 * conversion has named or uploaded its forms (or is training only); an
 * existing account has the Account Manager's answers; Field Fusion has
 * nothing to ask here — the gate lives on the deal after the close.
 */
export function flowAnswered(a: IntakeAnswers): boolean {
  if (a.path === null) return false;
  if (a.path === "field_fusion") return true;
  if (a.path === "existing") {
    const e = a.existing;
    if (e.form_final === true) return true;
    if (e.form_final === false && e.builder === "us") return true;
    if (e.form_final === false && e.builder === "customer") return Boolean(e.customer_build_by);
    return false;
  }
  if (a.training_only) return true;
  return a.forms_built === true
    ? a.uploaded_forms.length > 0
    : a.forms_built === false && formsOnly(a).length > 0;
}

/**
 * How an existing account's phase 1 runs, from the Account Manager's
 * answers. Unanswered reads as a review — the lightest plan — until it is.
 */
export function existingBuildFor(
  a: Pick<IntakeAnswers, "path" | "existing">,
): "review" | "us" | "customer" | null {
  if (a.path !== "existing") return null;
  if (a.existing.form_final === true) return "review";
  if (a.existing.form_final === false && a.existing.builder === "customer") return "customer";
  if (a.existing.form_final === false && a.existing.builder === "us") return "us";
  return "review";
}

/**
 * An existing account that bought services and no form work: the form is
 * final, nothing named to build, no paid form in the SOW. Phase 1 is then a
 * walkthrough, not three form meetings, and the services start straight
 * after it.
 */
export function isServicesOnly(
  a: Pick<IntakeAnswers, "path" | "existing" | "wanted_forms" | "timeline" | "training_only">,
): boolean {
  if (a.path !== "existing") return false;
  // Said out loud, not defaulted: the Account Manager answered "final".
  if (a.existing.form_final !== true || existingBuildFor(a) !== "review") return false;
  if (formsOnly(a as IntakeAnswers).length > 0) return false;
  return !(a.timeline.services ?? []).some((s) => s.kind === "paid_form");
}

export const EMPTY_INTAKE: IntakeAnswers = intakeAnswersSchema.parse({});

/** The answers the AI reading may fill, and a person may take over. */
export const AI_OWNED_FIELDS = [
  "path",
  "training_only",
  "forms_built",
  "wanted_forms",
  "current_process",
  "solutions_involved",
  "industry",
  "company_size",
  "field_users",
] as const;
export type AiOwnedField = (typeof AI_OWNED_FIELDS)[number];

/**
 * A person answered some of these: they are theirs from now on. The AI
 * stops refreshing them and their quoted source goes, because the answer
 * is no longer the model's.
 */
export function claimByPerson(
  current: Pick<IntakeAnswers, "ai_filled" | "person_set" | "ai_sources">,
  patchKeys: readonly string[],
): Pick<IntakeAnswers, "ai_filled" | "person_set" | "ai_sources"> {
  const touched = AI_OWNED_FIELDS.filter((f) => patchKeys.includes(f));
  // Only these three keys, ever: the caller spreads the result over its
  // patch, and a whole intake returned here would put every old answer back
  // on top of the new one.
  if (!touched.length) {
    return {
      ai_filled: current.ai_filled,
      person_set: current.person_set,
      ai_sources: current.ai_sources,
    };
  }
  const sources = { ...current.ai_sources };
  for (const f of touched) delete sources[f];
  return {
    ai_filled: current.ai_filled.filter((f) => !(touched as readonly string[]).includes(f)),
    person_set: [...new Set([...current.person_set, ...touched])],
    ai_sources: sources,
  };
}

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
  // THE FACTS ONLY. The forms question belongs to the flow (step 3), where
  // it is asked and answered — asking for it here made step 2 wait on an
  // answer step 3 could not give until step 2 finished. See flowAnswered.
  if (a.solutions_involved === null)
    return { done: false, next: "Were integrations or solutions involved?" };
  if (!a.industry) return { done: false, next: "What industry are they in?" };
  if (a.field_users === null)
    return { done: false, next: "How many people will use it in the field?" };
  if (!a.current_process) return { done: false, next: "What is the process today?" };
  return { done: true, next: null };
}

/**
 * A name that is a SERVICE, not a form: an integration, a dispatch add-on,
 * a PDF build, training. The brief's "scope" list mixes them in with the
 * forms, and a service that lands in wanted_forms becomes the phase-1 form
 * build and then appears a second time from the SOW. One rule, used by the
 * prefill, the plan and the deck.
 */
const SERVICE_WORDS =
  /\b(integration|integrate|sync|api|webhook|connector|dispatch|add-?on|module|licen[cs]e|seats?|training|onboarding|analytics|dashboard|reporting|report pack|data (load|migration|import)|pdf (designer|build|template)|custom pdf)\b/i;
const SERVICE_SYSTEMS =
  /\b(quickbooks|qbo|salesforce|zapier|workato|sage|netsuite|xero|hubspot|servicetitan|procore|smartsheet|kronos|sharepoint|onedrive|dropbox|power ?bi|tableau)\b/i;

/** Words that make it a service whatever else the name says. */
const SERVICE_STRONG = /\b(integration|integrate|sync|api|webhook|connector|add-?on)\b/i;
/** Words that make it a form, when nothing stronger says otherwise. */
const FORM_WORDS =
  /\b(form|checklist|inspection|log|sheet|ticket|audit|survey|assessment|work order|timesheet)\b/i;

/**
 * A service, not a form: "Salesforce integration", "Dispatch add-on",
 * "Analytics dashboard". A named system or an integration word always
 * wins; otherwise a form word keeps it a form, so "Dispatch ticket form" and
 * "Safety training sign-in sheet" are not thrown away for saying dispatch
 * or training.
 */
export function isServiceName(name: string): boolean {
  if (SERVICE_STRONG.test(name) || SERVICE_SYSTEMS.test(name)) return true;
  if (FORM_WORDS.test(name)) return false;
  return SERVICE_WORDS.test(name);
}

/**
 * The wanted forms that are really forms: service names dropped, and
 * anything the SOW already holds as a service dropped too (it is planned
 * there, with its own steps and dates).
 */
export function formsOnly(a: IntakeAnswers): IntakeAnswers["wanted_forms"] {
  const services = (a.timeline.services ?? []).map((s) => s.name.trim().toLowerCase());
  return a.wanted_forms.filter((f) => {
    const n = f.name.trim().toLowerCase();
    if (isServiceName(f.name)) return false;
    return !services.some((s) => s === n || s.includes(n) || n.includes(s));
  });
}

/**
 * The first form, the way every screen names it: the first wanted form that
 * really is a form, or the first uploaded one. Never a service a brief once
 * wrote onto the forms list.
 */
export function firstFormName(a: IntakeAnswers): string | null {
  return formsOnly(a)[0]?.name ?? a.uploaded_forms[0]?.name ?? null;
}

export type WantedForm = IntakeAnswers["wanted_forms"][number];

/**
 * Picking a library card marks it for the TALK TRACK, not the plan: the deck
 * and the welcome page show it under "common forms we see in your industry —
 * do you want these on your account?", and nothing is scheduled until the
 * customer says yes. Picking again unmarks it. A card that is also on the
 * wanted list (named as a form to build) stays on the list.
 */
export function toggleWantedTemplate(
  a: Pick<IntakeAnswers, "wanted_forms" | "chosen_templates">,
  template: { id: string; name: string },
): { wanted_forms: WantedForm[]; chosen_templates: string[] } {
  const has = a.chosen_templates.includes(template.id);
  const chosen_templates = has
    ? a.chosen_templates.filter((id) => id !== template.id)
    : [...a.chosen_templates, template.id];
  return { wanted_forms: a.wanted_forms, chosen_templates };
}

/** The library cards to talk about, plus any card that is on the build list. */
export function talkTrackTemplates(
  a: Pick<IntakeAnswers, "wanted_forms" | "chosen_templates">,
): string[] {
  return [...new Set([...a.chosen_templates, ...templateIds(a.wanted_forms)])];
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
  return { wanted_forms, chosen_templates: a.chosen_templates };
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

/** What the grid outlines: every card marked for the talk track, and every card on the build list. */
export function chosenFrom(forms: WantedForm[], previous: string[]): string[] {
  return [...new Set([...previous, ...templateIds(forms)])];
}
