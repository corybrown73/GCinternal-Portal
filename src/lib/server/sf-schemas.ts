import { z } from "zod";

/**
 * The inbound Salesforce Opportunity contract for POST /api/v1/implementations.
 *
 * `account_name` is accepted but is used ONLY when creating a customer that
 * does not exist yet. It is never a match key: matching on a name is how two
 * "Acme Corp"s become one customer, and how one "Acme Corp." becomes two.
 * (PLAN.md decision 4.)
 */

const sfId = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/, "must be a 15- or 18-character Salesforce id");

const isoish = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), "must be an ISO-8601 date or timestamp");

export const lineItemSchema = z.object({
  product_code: z.string().trim().max(120).optional(),
  product_family: z.string().trim().max(120).optional(),
  name: z.string().trim().max(300).optional(),
  quantity: z.number().optional(),
  unit_price: z.number().optional(),
});

export const opportunityIngestSchema = z.object({
  salesforce_opportunity_id: sfId,
  salesforce_account_id: sfId,
  /** Creation-only. Never used to match an existing customer. */
  account_name: z.string().trim().min(1).max(300),
  opportunity_name: z.string().trim().min(1).max(300),
  opportunity_type: z.string().trim().max(120).optional(),
  stage_name: z.string().trim().max(120).optional(),
  amount: z.number().nonnegative().optional(),
  currency: z.string().trim().max(8).optional(),
  close_date: isoish.optional(),
  /** Recorded evidence of when Salesforce says the deal closed. Never computed. */
  closed_won_at: isoish.optional(),
  owner_email: z.string().trim().email().optional(),
  se_email: z.string().trim().email().optional(),
  line_items: z.array(lineItemSchema).max(200).optional(),
  /** The untouched source record, kept as evidence alongside what we mapped. */
  raw: z.record(z.unknown()).optional(),
});

export type OpportunityIngestInput = z.infer<typeof opportunityIngestSchema>;

export const implementationsQuerySchema = z.object({
  salesforce_opportunity_id: z.string().trim().optional(),
  updated_since: isoish.optional(),
  limit: z.number().int().positive().max(200).optional(),
});
