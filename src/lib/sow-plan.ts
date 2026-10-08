import { z } from "zod/v4";

import { typedDateSchema, type TypedDate } from "./intake-answers";
import {
  SERVICE_KIND_LIST,
  normalizeServiceKey,
  normalizeServices,
  SERVICE_KINDS,
  serviceWeeks,
  type ServiceKind,
  type ServiceSpec,
} from "./onboarding-services";
import { INTEGRATION_TIERS, type IntegrationTier } from "./onboarding-timeline";
import { toolFromName } from "./onboarding-tools";

/**
 * The SOW, read into the plan.
 *
 * WHAT THE MODEL IS ASKED FOR. Not dates — never dates. The model reads the
 * SOW and says what was bought, in the catalogue's terms: kind, the name the
 * SOW uses, the tier or length where the SOW says, and which phase it
 * belongs in. The timeline then computes every date from the close date
 * and the rule, the same way it does when a person ticks the list by hand.
 * The model's job is the reading; the plan's job is the calendar.
 *
 * EVERY ROW IS A PROPOSAL. A person reviews the rows, unticks what is
 * wrong, changes a phase, and applies. The SOW stays attached as the
 * record; if it cannot be read, the answer is "manual", not a guess.
 */

const kindEnum = z.enum(SERVICE_KIND_LIST.map((k) => k.kind) as [ServiceKind, ...ServiceKind[]]);

/*
 * The model's JSON is read forgivingly. A reading that names the right
 * services must not be thrown away because a value came as "$12,500", a
 * date as "on signature", a quote ran past 300 characters or a tier was
 * written on a form row: each of those is a field to tidy, not a failed
 * reading. What cannot be tidied becomes null; the person sees the rows.
 */

/** A number, or a number written as text ("$12,500", "150 users"); else null. */
const looseNumber = (v: unknown): unknown => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.-]/g, ""));
    return v.trim() && Number.isFinite(n) ? n : null;
  }
  return null;
};
/** A string cut to fit; anything else null. */
const looseText = (max: number) => (v: unknown) =>
  typeof v === "string" ? v.trim().slice(0, max) || null : null;
const inRange = (min: number, max: number) => (v: unknown) =>
  typeof v === "number" && v >= min && v <= max ? v : null;

export const sowPlanRowSchema = z.object({
  kind: kindEnum,
  /** The name the SOW uses: "QuickBooks Online", "Invoice PDF", "JSA form". */
  name: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().slice(0, 120) : v),
    z.string().min(1).max(120),
  ),
  /** Integrations only: 2 intermediate, 3 advanced, 4 complex, 5 unknown. Null elsewhere. */
  tier: z.preprocess(
    (v) => inRange(2, 5)(Math.round(Number(looseNumber(v) ?? NaN))),
    z.number().int().min(2).max(5).nullable(),
  ),
  /** Length in weeks when the SOW states one; null to use the catalogue. */
  weeks: z.preprocess((v) => inRange(0.5, 52)(looseNumber(v)), z.number().nullable()),
  /** 1 = alongside the form from kickoff; 2 and up wait for the phase before. */
  phase: z.preprocess(
    (v) => inRange(1, 4)(Math.round(Number(looseNumber(v) ?? NaN))) ?? 1,
    z.number().int().min(1).max(4),
  ),
  /** What we need from the customer, when the SOW says; null for the catalogue line. */
  needs: z.preprocess(looseText(300), z.string().nullable()),
  /** A short verbatim quote from the SOW that this row rests on. */
  evidence: z.preprocess(looseText(300), z.string().nullable()),
  confidence: z.preprocess(
    (v) => (v === "stated" || v === "implied" || v === "uncertain" ? v : "implied"),
    z.enum(["stated", "implied", "uncertain"]),
  ),
});
export type SowPlanRow = z.infer<typeof sowPlanRowSchema>;

const isoDate = z.preprocess(
  (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null),
  z.string().nullable(),
);
const textList = (max: number) =>
  z.preprocess(
    (v) =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, max)
        : [],
    z.array(z.string()).max(max),
  );

/**
 * `typedDateSchema` twice over: the intake's is zod v3, and this schema is
 * zod v4 because the Anthropic helper that turns it into the model's output
 * grammar reads v4 internals. Same shape, same output type; the preprocess
 * still filters rows with the intake's own schema.
 */
const typedDate = z.object({
  type: z.enum(["signed", "start", "deadline", "absence"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  who: z.string().trim().max(120).nullable().default(null),
  quote: z.string().max(300),
});

export const sowPlanProposalSchema = z.object({
  readable: z.preprocess((v) => (typeof v === "boolean" ? v : true), z.boolean()),
  problem: z.preprocess(looseText(500), z.string().nullable()),
  /** The SOW's own reference or quote number, as printed. */
  reference: z.preprocess(looseText(60), z.string().nullable()),
  /** The day it was signed, ISO. */
  signed_date: isoDate,
  /** The day the work starts, when the SOW names one; the plan's day 0. */
  start_date: isoDate,
  /** Total contract value, as a number, in the currency the SOW states. */
  value: z.preprocess((v) => {
    const n = looseNumber(v);
    return typeof n === "number" && n >= 0 ? n : null;
  }, z.number().nullable()),
  /** The customer contact the SOW names (a bare name is a contact too). */
  contact: z.preprocess(
    (v) => (typeof v === "string" ? { name: v } : v && typeof v === "object" ? v : null),
    z
      .object({
        name: z.preprocess(looseText(120), z.string().nullable()),
        role: z.preprocess(looseText(120), z.string().nullable()),
        email: z.preprocess(looseText(160), z.string().nullable()),
      })
      .nullable(),
  ),
  /** One line: what was bought. */
  summary: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string()),
  /** The first form, when the SOW names it. */
  first_form: z.preprocess(looseText(160), z.string().nullable()),
  /** Licensed seats as stated, or null. */
  seats: z.preprocess(
    (v) => inRange(0, 1_000_000)(Math.round(Number(looseNumber(v) ?? NaN))),
    z.number().int().nullable(),
  ),
  /** Rows the plan can hold; one the model could not shape is dropped, not fatal. */
  services: z.preprocess(
    (v) =>
      Array.isArray(v)
        ? v.filter((row) => sowPlanRowSchema.safeParse(row).success).slice(0, 20)
        : [],
    z.array(sowPlanRowSchema).max(20),
  ),
  /** Things the SOW says that the plan cannot hold: exclusions, conditions, dates it names. */
  notes: textList(20),
  /**
   * Dates the SOW states, typed: a deadline the customer must hit, a start,
   * the signing, a named absence. Only rows with a printed ISO date survive;
   * "end of October" is a note, never a day.
   */
  dates: z.preprocess(
    (v) =>
      Array.isArray(v)
        ? v.filter((row) => typedDateSchema.safeParse(row).success).slice(0, 20)
        : [],
    z.array(typedDate).max(20),
  ),
  /** What the SOW does not say that the plan needs. */
  gaps: textList(20),
});
export type SowPlanProposal = z.infer<typeof sowPlanProposalSchema>;

/** The catalogue, in words the model reads. */
export function catalogueForPrompt(): string {
  const kinds = SERVICE_KIND_LIST.map(
    (k) =>
      `- ${k.kind}: "${k.label}". Default phase ${k.defaultPhase} (${k.defaultPhase === 1 ? "runs alongside the form from the kickoff call" : "waits until the first form is proven"}). Default length ${k.weeks} week${k.weeks === 1 ? "" : "s"}.`,
  ).join("\n");
  const tiers = INTEGRATION_TIERS.filter((t) => t.tier >= 2)
    .map((t) => `- tier ${t.tier}: ${t.name}, ${t.weeks} weeks. ${t.summary}`)
    .join("\n");
  return `Service kinds:\n${kinds}\n\nIntegration tiers (integrations only):\n${tiers}`;
}

/**
 * The model's phases, brought back to the rule. A form build, a data load
 * or a training block starts with the form — phase 1 — whatever order the
 * SOW happens to list things in. A person can still move one later in the
 * review; the default is what fifteen years say works.
 */
export function normalizeProposal(p: SowPlanProposal): SowPlanProposal {
  return {
    ...p,
    services: p.services.map((row) =>
      SERVICE_KINDS[row.kind].defaultPhase === 1 && row.phase !== 1 ? { ...row, phase: 1 } : row,
    ),
  };
}

/** A proposal row → the service the plan stores. Ids are fresh; the plan computes the dates. */
export function rowToService(row: SowPlanRow, id: string): ServiceSpec {
  const spec: ServiceSpec = { id, kind: row.kind, name: row.name, phase: row.phase };
  const tool = toolFromName(row.name);
  if (tool && tool.kind === row.kind) spec.tool = tool.key;
  if (row.kind === "integration") spec.tier = (row.tier ?? tool?.tier ?? 3) as IntegrationTier;
  else if (row.weeks && row.weeks !== SERVICE_KINDS[row.kind].weeks) spec.weeks = row.weeks;
  if (row.needs) spec.needs = row.needs;
  return spec;
}

/**
 * Merge accepted rows into the list a person already has. A row whose name
 * matches an existing service (case-insensitive) updates that service's
 * phase, tier, weeks and needs rather than adding a twin.
 */
export function mergeProposal(
  existing: ServiceSpec[],
  rows: SowPlanRow[],
  makeId: (row: SowPlanRow) => string,
): ServiceSpec[] {
  const out = [...existing];
  for (const row of rows) {
    // Same kind, same name once case, punctuation and filler are gone: one
    // row, however the SOW reader worded it this time.
    const key = normalizeServiceKey(row.name, row.kind);
    const i = out.findIndex((s) => normalizeServiceKey(s.name, s.kind) === key);
    const next = rowToService(row, i >= 0 ? out[i]!.id : makeId(row));
    if (i >= 0) out[i] = { ...out[i]!, ...next };
    else out.push(next);
  }
  return out;
}

/**
 * A training row that describes the plan's own calls — "3 training sessions
 * (30-minute, recorded)" — is not a block beside them: it is their length.
 * Returns the minutes when the row names some and either names no session
 * count or names three; null for a training block that stands on its own.
 */
export function trainingSessionMinutes(row: SowPlanRow): number | null {
  if (row.kind !== "training") return null;
  const text = `${row.name} ${row.evidence ?? ""}`;
  const minutes = text.match(/(\d{2,3})\s*-?\s*min/i);
  if (!minutes) return null;
  // "Three (3) training sessions", "3 x 30-minute sessions", "two 45-minute
  // admin sessions": the count is the number nearest the word.
  const count = text.match(
    /\b(\d+|one|two|three|four|five|six)\s*(?:\(\d+\)\s*)?(?:x|×)?\s*(?:[a-z0-9-]+\s+){0,3}?(?:sessions?|calls?)\b/i,
  );
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const n = count ? (words[count[1]!.toLowerCase()] ?? Number(count[1])) : null;
  if (n !== null && n !== 3) return null;
  const m = Number(minutes[1]);
  return m >= 15 && m <= 240 ? m : null;
}

/** The length the plan will use for a row, for the review table. */
export function rowWeeks(row: SowPlanRow): number {
  return serviceWeeks(rowToService(row, "preview"));
}

/**
 * What a SOW reading puts on the plan: every row it is sure of, merged into
 * the services by name. The uncertain rows wait for a person on the plan
 * panel; a paid form the intake already names is not added twice. Returns
 * the timeline keys to merge, and how many rows went on.
 */
export function sowTimelinePatch(
  intake: {
    wanted_forms: Array<{ name: string }>;
    timeline: { services?: unknown; removed_services?: string[]; session_minutes?: number | null };
  } & { timeline: Parameters<typeof normalizeServices>[1] },
  proposal: { services: SowPlanRow[]; notes: string[]; dates?: TypedDate[] },
  makeId: (row: SowPlanRow) => string,
): { timeline: Record<string, unknown>; accepted: number; sessionMinutes: number | null } {
  const wanted = new Set(intake.wanted_forms.map((f) => normalizeServiceKey(f.name, "paid_form")));
  const removed = new Set(intake.timeline.removed_services ?? []);
  // The plan's own calls, sized by the SOW: not a block beside them.
  let sessionMinutes: number | null = null;
  const accepted = proposal.services.filter((row) => {
    if (row.confidence === "uncertain") return false;
    const key = normalizeServiceKey(row.name, row.kind);
    if (row.kind === "paid_form" && wanted.has(key)) return false;
    if (removed.has(key)) return false;
    const minutes = trainingSessionMinutes(row);
    if (minutes) {
      sessionMinutes = minutes;
      return false;
    }
    return true;
  });
  return {
    accepted: accepted.length,
    sessionMinutes,
    timeline: {
      services: mergeProposal(
        normalizeServices((intake.timeline.services ?? []) as ServiceSpec[], intake.timeline),
        accepted,
        makeId,
      ),
      integration_tier: 0,
      integration_target: null,
      sow_applied_at: new Date().toISOString(),
      sow_notes: proposal.notes.map((n) => n.slice(0, 300)).slice(0, 20),
      sow_dates: (proposal.dates ?? []).slice(0, 20),
      ...(sessionMinutes ? { session_minutes: sessionMinutes } : {}),
    },
  };
}
