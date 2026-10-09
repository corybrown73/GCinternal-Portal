
import { z } from "zod";

export const stageTargetKeys = [
  "get_it_working",
  "make_it_yours",
  "make_it_run",
  "complete",
] as const;

export const stageTargetChangeSchema = z.object({
  previous_date: z.string().date(),
  new_date: z.string().date(),
  reason: z.string().trim().min(1).max(500),
  category: z.enum([
    "customer_delay",
    "gocanvas_delay",
    "shared_delay",
    "scope_change",
    "other",
  ]),
  changed_by: z.string().uuid(),
  changed_at: z.string().datetime({ offset: true }),
});

export const stageTargetSchema = z.object({
  original_date: z.string().date().nullable().default(null),
  current_date: z.string().date().nullable().default(null),
  history: z.array(stageTargetChangeSchema).default([]),
});

export const stageTargetsSchema = z.object({
  get_it_working: stageTargetSchema.default({}),
  make_it_yours: stageTargetSchema.default({}),
  make_it_run: stageTargetSchema.default({}),
  complete: stageTargetSchema.default({}),
});

export type StageTargets = z.infer<typeof stageTargetsSchema>;
export type StageTargetKey = (typeof stageTargetKeys)[number];
import { stageTargetsSchema } from "./stage-targets";