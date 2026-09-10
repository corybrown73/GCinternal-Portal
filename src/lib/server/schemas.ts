import { z } from "zod";
// The brief schema is handed to the Anthropic SDK's zod helper, which reads
// zod v4 internals (`_zod.def`) to build the JSON schema for structured
// output. A v3 schema there fails at runtime with "cannot read properties of
// undefined (reading 'def')". zod 3.25 ships v4 alongside v3, so this one
// schema is built with v4 and everything else in the file stays as it was.
import { z as z4 } from "zod/v4";
import { STAGES } from "../presale-stages";

export const stageSchema = z.enum(STAGES);

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

// The contract between the LLM (or template fallback) and the deck builder.
export const briefJsonSchema = z4.object({
  account_name: z4.string(),
  one_liner: z4.string(),
  current_process: z4.array(z4.object({ title: z4.string(), bullets: z4.array(z4.string()) })),
  goals: z4.array(z4.string()),
  what_we_know: z4.array(z4.object({ topic: z4.string(), detail: z4.string() })),
  stakeholders: z4.array(z4.object({ name: z4.string(), role: z4.string(), notes: z4.string() })),
  risks_open_items: z4.array(z4.string()),
  discovery_questions: z4.array(
    z4.object({ question: z4.string(), why_it_matters: z4.string(), category: z4.string() }),
  ),
  process_gaps: z4.array(z4.string()),
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
  kickoff: z4.object({
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
  }),
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
  expansion: z4.object({
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
  }),
});
export type BriefJson = z4.infer<typeof briefJsonSchema>;
