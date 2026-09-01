import { z } from "zod";
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
export const briefJsonSchema = z.object({
  account_name: z.string(),
  one_liner: z.string(),
  current_process: z.array(z.object({ title: z.string(), bullets: z.array(z.string()) })),
  goals: z.array(z.string()),
  what_we_know: z.array(z.object({ topic: z.string(), detail: z.string() })),
  stakeholders: z.array(z.object({ name: z.string(), role: z.string(), notes: z.string() })),
  risks_open_items: z.array(z.string()),
  discovery_questions: z.array(
    z.object({ question: z.string(), why_it_matters: z.string(), category: z.string() }),
  ),
  process_gaps: z.array(z.string()),
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
  kickoff: z.object({
    /** One sentence: what "good" looks like ninety days after go-live. */
    day_90_definition: z.string().nullable(),
    /** Workflows in phase one, in the client's own words. */
    scope: z.array(
      z.object({
        workflow: z.string(),
        /** The paper or manual process this retires. */
        replaces: z.string().nullable(),
        /** Who uses it, and how many, e.g. "All crews · 240". */
        teams: z.string().nullable(),
      }),
    ),
    /** What the client said is NOT in phase one. */
    out_of_scope: z.string().nullable(),
    /** Systems to connect, e.g. "QuickBooks · invoice from closed work orders". */
    integrations: z.array(z.string()),
    /** Named owners for the five responsibilities the deck's RACI slide lists. */
    roles: z.array(
      z.object({
        /** One of: build, accounts, devices, change management, reporting. */
        responsibility: z.string(),
        owner: z.string(),
        support: z.string().nullable(),
      }),
    ),
    /** Licensing as stated, e.g. "310 on the Business plan". */
    licensed_seats: z.string().nullable(),
    renewal_date: z.string().nullable(),
    /** The technical contact, if the notes name one. */
    it_contact: z.string().nullable(),
    /** Training as discussed: who is trained, how, and for how long. */
    training: z.array(z.object({ title: z.string(), who: z.string() })),
    /** The qualifier under each success number, e.g. "by end of quarter two". */
    kpi_qualifiers: z.array(z.string()),
    /** The next scheduled touchpoint, if one was agreed. */
    next_meeting: z.string().nullable(),
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
  expansion: z.object({
    /** The system being connected, as the client names it: "QuickBooks Online". */
    integration_target: z.string().nullable(),
    /** Is the form already built and in use? The whole plan hinges on it. */
    form_already_built: z.string().nullable(),
    /** Historical data to bring across, and roughly how much. */
    historical_data: z.string().nullable(),
    /** How the work gets done today, before this connection exists. */
    current_process: z.string().nullable(),
    /** The time this saves, in the client's own numbers. Never estimated here. */
    time_saved: z.string().nullable(),
    /** What has to move, and which way, e.g. "Approved job -> QBO invoice". */
    data_flows: z.array(z.object({ what: z.string(), direction: z.string() })),
    /** Anything the notes say about their instance: version, edition, add-ons. */
    environment_notes: z.array(z.string()),
    /** Open questions this integration cannot start without. */
    blockers: z.array(z.string()),
  }),
});
export type BriefJson = z.infer<typeof briefJsonSchema>;
