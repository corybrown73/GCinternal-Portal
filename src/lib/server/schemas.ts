import { z } from "zod";
// The brief schema is handed to the Anthropic SDK's zod helper, which reads
// zod v4 internals (`_zod.def`) to build the JSON schema for structured
// output. A v3 schema there fails at runtime with "cannot read properties of
// undefined (reading 'def')". zod 3.25 ships v4 alongside v3, so this one
// schema is built with v4 and everything else in the file stays as it was.
import { z as z4 } from "zod/v4";
import { STAGES } from "../presale-stages";

/**
 * A stage on the wire. The retired "in_onboarding" is accepted and read as
 * the first of the three stages that replaced it, so a Zap built last month
 * keeps working.
 */
export const stageSchema = z.preprocess(
  (v) => (v === "in_onboarding" ? "get_it_working" : v),
  z.enum(STAGES),
);

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "must be an ISO-8601 timestamp");

export const accountUpsertSchema = z.object({
  salesforce_id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1, "name is required"),
  domain: z.string().trim().toLowerCase().optional(),
  stage: stageSchema.optional(),
  arr: z.number().nonnegative().optional(),
  products: z.array(z.string().trim()).optional(),
  am_owner_email: z.string().email().optional(),
  se_owner_email: z.string().email().optional(),
  summary: z.string().max(10000).optional(),
});
export type AccountUpsertInput = z.infer<typeof accountUpsertSchema>;

export const transitionSchema = z.object({
  to_stage: stageSchema,
  note: z.string().max(2000).optional(),
  occurred_at: isoDate.optional(),
});
export type TransitionInput = z.infer<typeof transitionSchema>;

export const tamRequestCreateSchema = z.object({
  account_id: z.string().trim().min(1),
  requester_email: z.string().email(),
  justification: z.string().trim().min(10, "justification must be at least 10 characters"),
  urgency: z.enum(["low", "medium", "high"]).default("medium"),
});
export type TamRequestCreateInput = z.infer<typeof tamRequestCreateSchema>;

/** POST /api/v1/tickets — a ticket from an external system. */
export const createTicketBody = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  implementation_id: z.string().uuid().nullable().optional(),
  category: z.enum(["technical", "training", "billing", "data", "integration", "other"]),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20_000),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  submitter_email: z.string().email(),
});
export type CreateTicketInput = z.infer<typeof createTicketBody>;

/** POST /api/v1/alerts — something out of spec, reported from outside. */
export const createAlertBody = z.object({
  kind: z.string().min(1).max(60).optional(),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  title: z.string().min(1).max(300),
  detail: z.string().max(20_000).nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  implementation_id: z.string().uuid().nullable().optional(),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type CreateAlertInput = z.infer<typeof createAlertBody>;

/*
 * The brief, in three shapes from one set of pieces: `briefCoreSchema` is
 * what the first model pass writes (who they are, how they work, what they
 * want), `briefPlanSchema` what the second writes against it (the deck, the
 * expansion, the intake, the welcome page), and `briefJsonSchema` what is
 * stored — the two together, with everything that arrived later optional
 * so a brief written last year still reads.
 */

/** The four facts the intake asks first; the industry is the app's own list or null. */
const briefAccountSchema = z4.object({
  industry: z4.string().nullable(),
  company_size: z4.string().nullable(),
  field_users: z4.number().int().nullable(),
  website: z4.string().nullable(),
});

/** Who a stakeholder is to the rollout; the handoff's contact questions read it. */
export const STAKEHOLDER_ROLE_KINDS = [
  "decision_maker",
  "admin_builder",
  "day_to_day",
  "it",
  "sponsor",
  "other",
] as const;
export type StakeholderRoleKind = (typeof STAKEHOLDER_ROLE_KINDS)[number];

/** The model always says which kind and whether an email was given; a stored brief may predate both. */
const stakeholderSchema = z4.object({
  name: z4.string(),
  role: z4.string(),
  notes: z4.string(),
  role_kind: z4.enum(STAKEHOLDER_ROLE_KINDS).nullable(),
  email: z4.string().nullable(),
});
const storedStakeholderSchema = stakeholderSchema.extend({
  role_kind: z4.enum(STAKEHOLDER_ROLE_KINDS).nullable().optional(),
  email: z4.string().nullable().optional(),
});

/**
 * Dates the calls state, typed: a deadline the customer named, a start,
 * a stakeholder's absence. Only explicit statements; an ISO day only when
 * a day was said.
 */
const briefDateSchema = z4.object({
  type: z4.enum(["signed", "start", "deadline", "absence"]),
  date: z4.string(),
  end: z4.string().nullable(),
  who: z4.string().nullable(),
  quote: z4.string(),
});

const discoveryQuestionSchema = z4.object({
  question: z4.string(),
  why_it_matters: z4.string(),
  category: z4.string(),
});

/**
 * What the kickoff deck needs and the brief proper does not carry.
 *
 * WHY IT IS HERE. The deck has 124 named fields and the portal can only
 * record a fraction of them — roles, seat counts, what each workflow
 * replaces, which systems are being connected. All of that is discussed on
 * the sales calls, so it is read out of the same notes rather than left for
 * somebody to retype from a transcript they no longer remember.
 *
 * EVERY FIELD IS NULLABLE, AND NULL IS THE RIGHT ANSWER when the notes do
 * not say. These land on a slide a customer reads: an invented seat count or
 * a guessed owner is worse than a blank the presenter fills in.
 */
const kickoffSchema = z4.object({
  /** One sentence: what "good" looks like ninety days after go-live. */
  day_90_definition: z4.string().nullable(),
  /** Workflows in phase one, in the client's own words. */
  scope: z4.array(
    z4.object({
      workflow: z4.string(),
      /** The paper or manual process this retires. */
      replaces: z4.string().nullable(),
      /** Who uses it, and how many, e.g. "All crews · 240". */
      teams: z4.string().nullable(),
    }),
  ),
  /** What the client said is NOT in phase one. */
  out_of_scope: z4.string().nullable(),
  /** Systems to connect, e.g. "QuickBooks · invoice from closed work orders". */
  integrations: z4.array(z4.string()),
  /** Named owners for the five responsibilities the deck's RACI slide lists. */
  roles: z4.array(
    z4.object({
      /** One of: build, accounts, devices, change management, reporting. */
      responsibility: z4.string(),
      owner: z4.string(),
      support: z4.string().nullable(),
    }),
  ),
  /** Licensing as stated, e.g. "310 on the Business plan". */
  licensed_seats: z4.string().nullable(),
  renewal_date: z4.string().nullable(),
  /** The technical contact, if the notes name one. */
  it_contact: z4.string().nullable(),
  /** Training as discussed: who is trained, how, and for how long. */
  training: z4.array(z4.object({ title: z4.string(), who: z4.string() })),
  /** The qualifier under each success number, e.g. "by end of quarter two". */
  kpi_qualifiers: z4.array(z4.string()),
  /** The next scheduled touchpoint, if one was agreed. */
  next_meeting: z4.string().nullable(),
});

/**
 * The expansion deck's own reading, when this is work for a customer we
 * already have rather than a first rollout.
 *
 * A DIFFERENT MEETING. Nobody needs "here is what GoCanvas does" — they run
 * it. They need to know what connecting their accounting system to the forms
 * their crews already fill in will take, and what it gives back. The four
 * questions below are the ones an account manager is actually asked, and
 * three of them have answers sitting in the SOW and the call notes.
 *
 * Null throughout when this is a new logo, or when the notes do not say.
 */
const expansionSchema = z4.object({
  /** The system being connected, as the client names it: "QuickBooks Online". */
  integration_target: z4.string().nullable(),
  /** Is the form already built and in use? The whole plan hinges on it. */
  form_already_built: z4.string().nullable(),
  /** Historical data to bring across, and roughly how much. */
  historical_data: z4.string().nullable(),
  /** How the work gets done today, before this connection exists. */
  current_process: z4.string().nullable(),
  /** The time this saves, in the client's own numbers. Never estimated here. */
  time_saved: z4.string().nullable(),
  /** What has to move, and which way, e.g. "Approved job -> QBO invoice". */
  data_flows: z4.array(z4.object({ what: z4.string(), direction: z4.string() })),
  /** Anything the notes say about their instance: version, edition, add-ons. */
  environment_notes: z4.array(z4.string()),
  /** Open questions this integration cannot start without. */
  blockers: z4.array(z4.string()),
});

/**
 * The onboarding intake, read out of the calls AND the signed SOW together,
 * every fact with the words it came from. This is what fills the flow, the
 * forms and the process on the deal, so nobody retypes them.
 */
export const onboardingSchema = z4.object({
  /** Which kind of onboarding this is. Null when neither source says. */
  flow: z4.enum(["new_logo", "existing", "dm_conversion", "field_fusion"]).nullable(),
  flow_evidence: z4.object({ quote: z4.string(), source: z4.string() }).nullable(),
  /** True when they need training only — no form to build. */
  training_only: z4.boolean().nullable(),
  /** True when integrations or other services were bought. */
  solutions_involved: z4.boolean().nullable(),
  /**
   * The FORMS to build, first form first — never an integration, a
   * dispatch add-on, a dashboard or any other service.
   */
  forms: z4.array(
    z4.object({
      name: z4.string(),
      quote: z4.string(),
      source: z4.string(),
    }),
  ),
  /** How the work is done today, two or three sentences. */
  current_process: z4
    .object({ summary: z4.string(), quote: z4.string(), source: z4.string() })
    .nullable(),
});

/** A customer-side answer the welcome page asks for, with the words it rests on. */
const quotedValueSchema = z4.object({ value: z4.string(), quote: z4.string() }).nullable();

/**
 * What the welcome page and the Kickoff View show the customer, read from
 * the same sources: who tests the form, the answers the customer-side
 * handoff asks, the workflow story in three beats, and what this
 * implementation is for. Everything here is shown as "to confirm" until a
 * person says it is their words.
 */
export const welcomeSchema = z4.object({
  /** Who at the customer runs the form on real jobs, when the sources name them. */
  field_tester: z4.object({ name: z4.string(), role: z4.string(), quote: z4.string() }).nullable(),
  customer_side: z4.object({
    /** The forms they fill in today and how. */
    forms_today: quotedValueSchema,
    /** Lists the forms need: customers, assets, crews, price lists. */
    data_lists: quotedValueSchema,
    /** What the crews carry: phones, tablets, whose. */
    devices: quotedValueSchema,
    /** Who should be in the kickoff from their side. */
    kickoff_attendees: quotedValueSchema,
  }),
  /** Before the field work, during it, after submission — in the customer's words. */
  workflow_story: z4.object({
    before: z4.string().nullable(),
    during: z4.string().nullable(),
    after: z4.string().nullable(),
  }),
  /** What this implementation delivers, each item typed by where it was read. Eight at most; the code cuts the rest. */
  focus_items: z4.array(
    z4.object({
      text: z4.string(),
      source_type: z4.enum(["sow", "gong", "intake"]),
      source_label: z4.string(),
      quote: z4.string(),
    }),
  ),
});
export type BriefWelcome = z4.infer<typeof welcomeSchema>;

/**
 * What the verifier found for each customer-facing item, by its path in
 * the brief ("kickoff.scope[0]", "goals[2]"): grounded when its quote was
 * found in the sources, unverified when it was kept without one, dropped
 * when the sources did not support it. An index past a stored list is an
 * item the verifier removed.
 */
export const VERIFICATION_STATUSES = ["grounded", "unverified", "dropped"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export const verificationSchema = z4.object({
  checked_at: z4.string(),
  fields: z4.record(z4.string(), z4.enum(VERIFICATION_STATUSES)),
});
export type BriefVerification = z4.infer<typeof verificationSchema>;

/** The first pass: who they are, how they work today, what they want, who is who. */
export const briefCoreSchema = z4.object({
  account_name: z4.string(),
  one_liner: z4.string(),
  account: briefAccountSchema,
  current_process: z4.array(z4.object({ title: z4.string(), bullets: z4.array(z4.string()) })),
  goals: z4.array(z4.string()),
  what_we_know: z4.array(z4.object({ topic: z4.string(), detail: z4.string() })),
  stakeholders: z4.array(stakeholderSchema),
  risks_open_items: z4.array(z4.string()),
  dates: z4.array(briefDateSchema),
  discovery_questions: z4.array(discoveryQuestionSchema),
  process_gaps: z4.array(z4.string()),
});
export type BriefCore = z4.infer<typeof briefCoreSchema>;

/** The second pass, written against the core: the deck, the expansion, the intake, the welcome page. */
export const briefPlanSchema = z4.object({
  kickoff: kickoffSchema,
  expansion: expansionSchema,
  onboarding: onboardingSchema,
  welcome: welcomeSchema,
});
export type BriefPlan = z4.infer<typeof briefPlanSchema>;

// The contract between the LLM (or template fallback) and the deck builder.
export const briefJsonSchema = z4.object({
  account_name: z4.string(),
  one_liner: z4.string(),
  /**
   * The four facts the intake asks first, read out of the notes so the
   * person does not retype them. Null when the notes do not say; the
   * industry is one of the app's own list or null, never a paraphrase.
   */
  account: briefAccountSchema,
  current_process: z4.array(z4.object({ title: z4.string(), bullets: z4.array(z4.string()) })),
  goals: z4.array(z4.string()),
  what_we_know: z4.array(z4.object({ topic: z4.string(), detail: z4.string() })),
  stakeholders: z4.array(storedStakeholderSchema),
  risks_open_items: z4.array(z4.string()),
  /** Absent on briefs read before this field existed. */
  dates: z4.array(briefDateSchema).optional(),
  discovery_questions: z4.array(discoveryQuestionSchema),
  process_gaps: z4.array(z4.string()),
  kickoff: kickoffSchema,
  expansion: expansionSchema,
  /** Optional so briefs written before it existed still read. */
  onboarding: onboardingSchema.optional(),
  welcome: welcomeSchema.optional(),
  verification: verificationSchema.optional(),
});
export type BriefJson = z4.infer<typeof briefJsonSchema>;

/** The two passes, as the one brief that is stored. Pure. */
export function assembleBrief(core: BriefCore, plan: BriefPlan): BriefJson {
  return { ...core, ...plan };
}
