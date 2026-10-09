
import { z } from "zod";

export const stageTargetKeys = [
  "get_it_working",
  "make_it_yours",
  "make_it_run",
  "complete",
] as const;

export const stageTargetKeySchema = z.enum(stageTargetKeys);

export const stageTargetChangeCategories = [
  "customer_delay",
  "gocanvas_delay",
  "shared_delay",
  "scope_change",
  "other",
] as const;

export const stageTargetChangeSchema = z.object({
  previous_date: z.string().date().nullable(),
  new_date: z.string().date(),
  reason: z.string().trim().min(1).max(500),
  category: z.enum(stageTargetChangeCategories),
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
export const stageTargetUpdateSchema = z
  .object({
    key: stageTargetKeySchema,
    new_date: z.string().date(),
    reason: z.string().trim().min(1).max(500).optional(),
    category: z.enum(stageTargetChangeCategories).optional(),
  })
  .strict();

export type StageTargetUpdate = z.input<typeof stageTargetUpdateSchema>;

/** Establish the first agreed date or append a server-stamped target change. */
export function updateStageTarget(
  current: StageTargets,
  update: StageTargetUpdate,
  changedBy: string,
  changedAt: string,
): StageTargets {
  const parsed = stageTargetUpdateSchema.parse(update);
  const targets = stageTargetsSchema.parse(current);
  const target = targets[parsed.key];
  if (target.current_date === parsed.new_date) return targets;

  const originalDate = target.original_date ?? target.current_date ?? parsed.new_date;
  if (target.current_date === null && target.original_date === null) {
    return stageTargetsSchema.parse({
      ...targets,
      [parsed.key]: { ...target, original_date: parsed.new_date, current_date: parsed.new_date },
    });
  }

  const change = stageTargetChangeSchema.parse({
    previous_date: target.current_date,
    new_date: parsed.new_date,
    reason: parsed.reason,
    category: parsed.category,
    changed_by: changedBy,
    changed_at: changedAt,
  });

  return stageTargetsSchema.parse({
    ...targets,
    [parsed.key]: {
      ...target,
      original_date: originalDate,
      current_date: parsed.new_date,
      history: [...target.history, change],
    },
  });
}