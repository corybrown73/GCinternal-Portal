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
  stakeholders: z.array(
    z.object({ name: z.string(), role: z.string(), notes: z.string() })
  ),
  risks_open_items: z.array(z.string()),
  discovery_questions: z.array(
    z.object({ question: z.string(), why_it_matters: z.string(), category: z.string() })
  ),
  process_gaps: z.array(z.string()),
});
export type BriefJson = z.infer<typeof briefJsonSchema>;
