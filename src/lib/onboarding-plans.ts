import { z } from "zod";

import {
  basePlanFor,
  PLAN_KEYS,
  type MilestoneOverride,
  type PlanKey,
  type PlanOverrides,
} from "./onboarding-timeline";

/**
 * The shape an admin's plan changes are stored in: one `portal_app_config`
 * row, keyed `onboarding_plans`, holding for each plan the milestones that
 * differ from the code — a day, a last day, a length, a label. What is not
 * here is the plan as written. Read forgivingly on the way in, so a stale
 * or hand-edited row can never take a page down; checked strictly on the
 * way out of the Settings form, so a person hears what is wrong.
 */

const milestoneOverrideSchema = z
  .object({
    day: z.number().int().min(0).max(90).optional(),
    throughDay: z.number().int().min(0).max(120).nullable().optional(),
    minutes: z.number().int().min(15).max(240).nullable().optional(),
    label: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

const planSchema = z.record(z.string().min(1).max(40), milestoneOverrideSchema);

export const planOverridesSchema = z
  .object({
    new_logo: planSchema.optional(),
    existing_review: planSchema.optional(),
    existing_us: planSchema.optional(),
    existing_customer: planSchema.optional(),
    dm_conversion: planSchema.optional(),
    training: planSchema.optional(),
  })
  .strict();

/** True when the override changes nothing. */
function empty(o: MilestoneOverride): boolean {
  return (
    o.day === undefined &&
    o.throughDay === undefined &&
    o.minutes === undefined &&
    o.label === undefined
  );
}

/**
 * Whatever is in the column, as overrides the plan can use: unknown plans
 * and unknown milestones dropped, empty entries dropped, garbage → {}.
 */
export function readPlanOverrides(raw: unknown): PlanOverrides {
  const parsed = planOverridesSchema.safeParse(raw ?? {});
  if (!parsed.success) return {};
  const out: PlanOverrides = {};
  for (const key of PLAN_KEYS) {
    const plan = parsed.data[key];
    if (!plan) continue;
    const known = new Set(basePlanFor(key).map((m) => m.key));
    const kept: Record<string, MilestoneOverride> = {};
    for (const [k, v] of Object.entries(plan)) {
      if (known.has(k) && !empty(v)) kept[k] = v;
    }
    if (Object.keys(kept).length) out[key] = kept;
  }
  return out;
}

/**
 * What a person has to fix before the form saves: a step that would run
 * before the one above it, a step ending before it starts, a length on a
 * step that is not a call. The plan module would silently drop these; the
 * form says them out loud instead.
 */
export function planProblems(o: PlanOverrides): string[] {
  const problems: string[] = [];
  for (const key of PLAN_KEYS) {
    const plan = o[key];
    if (!plan) continue;
    const base = basePlanFor(key);
    const byKey = new Map(base.map((m) => [m.key, m]));
    for (const [k, v] of Object.entries(plan)) {
      const m = byKey.get(k);
      if (!m) {
        problems.push(`${key}: "${k}" is not a step of this plan.`);
        continue;
      }
      if (v.day !== undefined && (!Number.isInteger(v.day) || v.day < 0 || v.day > 90)) {
        problems.push(`${key}: "${m.label}" needs a whole day between 0 and 90 (got ${v.day}).`);
      }
      if (
        v.throughDay != null &&
        (!Number.isInteger(v.throughDay) || v.throughDay < 0 || v.throughDay > 120)
      ) {
        problems.push(`${key}: "${m.label}" needs a whole last day between 0 and 120.`);
      }
      if (v.minutes != null && m.kind !== "call") {
        problems.push(`${key}: "${m.label}" is not a call, so it has no length.`);
      } else if (
        v.minutes != null &&
        (!Number.isInteger(v.minutes) || v.minutes < 15 || v.minutes > 240)
      ) {
        problems.push(`${key}: "${m.label}" needs a length between 15 and 240 minutes.`);
      }
      if (v.label !== undefined && (v.label.trim() === "" || v.label.trim().length > 120)) {
        problems.push(`${key}: "${m.label}" needs a label of 1 to 120 characters.`);
      }
      const day = v.day ?? m.day;
      const through = v.throughDay === undefined ? m.throughDay : v.throughDay;
      if (through != null && through < day) {
        problems.push(
          `${key}: "${m.label}" ends on day ${through}, before it starts on day ${day}.`,
        );
      }
    }
    const days = base.map((m) => plan[m.key]?.day ?? m.day);
    for (let i = 1; i < days.length; i += 1) {
      if (days[i]! < days[i - 1]!) {
        problems.push(
          `${key}: "${base[i]!.label}" (day ${days[i]}) would run before "${base[i - 1]!.label}" (day ${days[i - 1]}).`,
        );
      }
    }
  }
  return problems;
}

export type { PlanKey, PlanOverrides, MilestoneOverride };
