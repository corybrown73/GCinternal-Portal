import { z } from "zod";

import { planEditsSchema, typedDateSchema } from "./intake-answers";

/**
 * The plan's knobs as the save accepts them.
 *
 * The plan panel and the booking form send the timeline WHOLE — the record's
 * object spread with the change — so a cleared override is a cleared
 * override. That means every key the record can hold has to be a key this
 * schema accepts, or the save is refused for a field nobody touched: booking
 * the kickoff once failed on `sow_dates`, a key the SOW reader had written.
 * `intake-save.test.ts` round-trips the record's default timeline through
 * this to keep the two in step.
 */
export const timelinePatchSchema = z
  .object({
    close_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    overrides: z.record(z.string(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(30),
    integration_tier: z.number().int().min(0).max(5),
    integration_target: z.string().trim().max(120).nullable(),
    field_tester: z.string().trim().max(120).nullable(),
    form_proven_on: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    completed: z.record(z.string().max(40), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    times: z.record(z.string().max(40), z.string().regex(/^\d{2}:\d{2}$/)).optional(),
    timezone: z.string().trim().max(64).nullable().optional(),
    sow_applied_at: z.string().nullable().optional(),
    sow_notes: z.array(z.string().max(300)).max(20).optional(),
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
          /** The person on our side who delivers it (team_members). */
          owner_id: z.string().uuid().nullable().optional(),
          /** Must be Accepted before Operational Go-Live. */
          launch_critical: z.boolean().optional(),
          /** How it will be accepted, in one sentence, from the SOW. */
          acceptance: z.string().trim().max(400).nullable().optional(),
          /** The customer's date for their part (testing, feedback). */
          due: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .nullable()
            .optional(),
          /** We do not yet know it can be done: a Feasibility step first. */
          feasibility_needed: z.boolean().optional(),
          /** It changes something already live: baseline, switch-over, nothing broke. */
          modifies_production: z.boolean().optional(),
          /** Who has the ball, when a person set it; derived from the steps otherwise. */
          ball: z
            .object({
              who: z.enum(["us", "customer", "blocked_customer", "blocked_internal"]),
              person: z.string().trim().max(120).nullable().default(null),
              date: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}$/)
                .nullable()
                .default(null),
              note: z.string().trim().max(300).nullable().default(null),
            })
            .nullable()
            .optional(),
          /** How it ended. The TIS cannot decide alone: descoped and transferred need a manager or the AM. */
          disposition: z
            .object({
              kind: z.enum(["accepted", "descoped", "transferred"]),
              at: z.string().max(40),
              by: z.string().uuid().nullable().default(null),
              reason: z.string().trim().max(400).nullable().default(null),
            })
            .nullable()
            .optional(),
        }),
      )
      .max(20)
      .optional(),
    sow_dates: z.array(typedDateSchema).max(20).nullable().optional(),
    removed_services: z.array(z.string().max(160)).max(40).optional(),
    session_minutes: z.number().int().min(15).max(240).nullable().optional(),
    plan_edits: planEditsSchema.optional(),
  })
  .strict();
