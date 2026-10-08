import { z } from "zod/v4";

import {
  typedDateSchema,
  type AiOwnedField,
  type IntakeAnswers,
  type TypedDate,
} from "./intake-answers";
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

/* ------------------------------------------------------ the deep reading */

/**
 * One grounded line from the document: what it says, the words it says it
 * in, and the page when the reader could tell. A line the model could not
 * shape is dropped, never fatal.
 */
const groundedItem = z.object({
  text: z.preprocess((v) => (typeof v === "string" ? v.trim().slice(0, 500) : v), z.string()),
  quote: z.preprocess(looseText(400), z.string().nullable()),
  page: z.preprocess(
    (v) => inRange(1, 2000)(Math.round(Number(looseNumber(v) ?? NaN))),
    z.number().int().nullable(),
  ),
});
export type SowGroundedItem = z.infer<typeof groundedItem>;

const groundedList = (max: number) =>
  z.preprocess(
    (v) =>
      Array.isArray(v)
        ? v.filter((row) => groundedItem.safeParse(row).success && textOf(row)).slice(0, max)
        : [],
    z.array(groundedItem),
  );
const textOf = (row: unknown): boolean =>
  Boolean(row && typeof row === "object" && String((row as { text?: unknown }).text ?? "").trim());

const nullableObject = <T extends z.ZodRawShape>(shape: T) =>
  z.preprocess((v) => (v && typeof v === "object" ? v : null), z.object(shape).nullable());

const sideEnum = z.preprocess(
  (v) => (v === "gocanvas" ? "gocanvas" : "customer"),
  z.enum(["customer", "gocanvas"]),
);

/**
 * The whole document, read once and kept: the plan's proposal, and what
 * the plan cannot hold but the welcome page, the kickoff deck, the
 * implementation's journey and the handoff context all need — what is
 * delivered, what is excluded, what the customer owes, how done is judged,
 * the term, the money, the people, the signature, the systems, the forms.
 */
export const sowReadingSchema = sowPlanProposalSchema.extend({
  deliverables: groundedList(40),
  out_of_scope: groundedList(30),
  customer_responsibilities: groundedList(30),
  acceptance_criteria: groundedList(30),
  assumptions: groundedList(30),
  /** The contract term as printed: start, end, length in months. */
  term: nullableObject({
    start: isoDate,
    end: isoDate,
    months: z.preprocess(
      (v) => inRange(0, 600)(Math.round(Number(looseNumber(v) ?? NaN))),
      z.number().int().nullable(),
    ),
  }),
  pricing: nullableObject({
    total: z.preprocess(looseNumber, z.number().nullable()),
    currency: z.preprocess(looseText(10), z.string().nullable()),
    recurring: z.preprocess(looseNumber, z.number().nullable()),
    one_time: z.preprocess(looseNumber, z.number().nullable()),
    payment_terms: z.preprocess(looseText(300), z.string().nullable()),
  }),
  /** Everyone the document names, on either side. */
  contacts: z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((c) => c && typeof c === "object").slice(0, 10) : []),
    z.array(
      z.object({
        name: z.preprocess(looseText(120), z.string().nullable()),
        role: z.preprocess(looseText(120), z.string().nullable()),
        email: z.preprocess(looseText(160), z.string().nullable()),
        side: sideEnum,
        quote: z.preprocess(looseText(300), z.string().nullable()),
      }),
    ),
  ),
  signature: nullableObject({
    date: isoDate,
    signer_name: z.preprocess(looseText(120), z.string().nullable()),
    signer_title: z.preprocess(looseText(120), z.string().nullable()),
  }),
  /** Systems to connect, each with the direction and tier the document supports. */
  integrations: z.preprocess(
    (v) =>
      Array.isArray(v)
        ? v
            .filter((c) => c && typeof c === "object" && String((c as any).system ?? "").trim())
            .slice(0, 10)
        : [],
    z.array(
      z.object({
        system: z.preprocess(looseText(120), z.string()),
        direction: z.preprocess(looseText(160), z.string().nullable()),
        tier: z.preprocess(
          (v) => inRange(2, 5)(Math.round(Number(looseNumber(v) ?? NaN))),
          z.number().int().nullable(),
        ),
        quote: z.preprocess(looseText(300), z.string().nullable()),
      }),
    ),
  ),
  /** Every form the document names, the first form included. */
  forms: z.preprocess(
    (v) =>
      Array.isArray(v)
        ? v
            .filter((c) => c && typeof c === "object" && String((c as any).name ?? "").trim())
            .slice(0, 20)
        : [],
    z.array(
      z.object({
        name: z.preprocess(looseText(160), z.string()),
        purpose: z.preprocess(looseText(300), z.string().nullable()),
        quote: z.preprocess(looseText(300), z.string().nullable()),
      }),
    ),
  ),
});
export type SowReading = z.infer<typeof sowReadingSchema>;

/**
 * A kept reading, whatever its age: one written before the deep fields
 * existed parses with them empty, so nothing the plan needs is lost to a
 * newer shape.
 */
export function parseSowReading(output: unknown): SowReading | null {
  if (!output || typeof output !== "object") return null;
  const deep = sowReadingSchema.safeParse(output);
  if (deep.success) return normalizeProposal(deep.data) as SowReading;
  const plan = sowPlanProposalSchema.safeParse(output);
  if (!plan.success) return null;
  return {
    ...normalizeProposal(plan.data),
    deliverables: [],
    out_of_scope: [],
    customer_responsibilities: [],
    acceptance_criteria: [],
    assumptions: [],
    term: null,
    pricing: null,
    contacts: [],
    signature: null,
    integrations: [],
    forms: [],
  };
}

/** The slice of a reading the handoff context and a deck prompt carry: what was sold, in the document's words. */
export function sowReadingSummary(r: SowReading): {
  summary: string;
  deliverables: SowGroundedItem[];
  out_of_scope: SowGroundedItem[];
  customer_responsibilities: SowGroundedItem[];
  acceptance_criteria: SowGroundedItem[];
  term: SowReading["term"];
  contacts: SowReading["contacts"];
} {
  return {
    summary: r.summary,
    deliverables: r.deliverables,
    out_of_scope: r.out_of_scope,
    customer_responsibilities: r.customer_responsibilities,
    acceptance_criteria: r.acceptance_criteria,
    term: r.term,
    contacts: r.contacts,
  };
}

/**
 * What the SOW itself puts on the intake, beside the plan: the seat count
 * as the people in the field, and the forms it names when no call has
 * named any. Blanks and the AI's own earlier answers only — a person's
 * answer stands (`person_set`) — and every write carries the words it
 * rests on, as the brief's prefill does. Pure.
 */
export function sowIntakePatch(
  intake: Pick<
    IntakeAnswers,
    | "field_users"
    | "wanted_forms"
    | "forms_built"
    | "training_only"
    | "path"
    | "ai_filled"
    | "person_set"
    | "ai_sources"
  >,
  reading: Pick<SowReading, "seats" | "forms" | "first_form">,
  opts: { hasReports: boolean },
): { patch: Partial<IntakeAnswers>; filled: string[] } {
  const patch: Partial<IntakeAnswers> = {};
  const filled: string[] = [];
  const aiFilled = new Set(intake.ai_filled);
  const sources = { ...intake.ai_sources };
  const owned = (f: AiOwnedField) => !intake.person_set.includes(f);

  if (
    reading.seats !== null &&
    reading.seats > 0 &&
    intake.field_users == null &&
    owned("field_users")
  ) {
    patch.field_users = reading.seats;
    aiFilled.add("field_users");
    sources["field_users"] = { quote: `${reading.seats} seats`, source: "SOW" };
    filled.push("people in the field");
  }

  // The forms the SOW names, only where no call could: the calls say what
  // the customer wants built, the SOW what was bought — the calls' names
  // are the better ones when both exist.
  const formsOwned =
    !intake.person_set.includes("wanted_forms") &&
    (intake.wanted_forms.length === 0 ||
      aiFilled.has("wanted_forms") ||
      intake.wanted_forms.every((f) => /^(syn|sow)-/.test(f.id)));
  const named = reading.forms.map((f) => f.name.trim()).filter(Boolean);
  if (
    !opts.hasReports &&
    named.length &&
    formsOwned &&
    !intake.training_only &&
    intake.path !== "existing" &&
    intake.path !== "field_fusion"
  ) {
    // The first form first, where the reader named one.
    const first = reading.first_form?.trim().toLowerCase() ?? null;
    const ordered = [...named].sort((a, b) =>
      a.toLowerCase() === first ? -1 : b.toLowerCase() === first ? 1 : 0,
    );
    const seen = new Set<string>();
    const forms = ordered
      .filter((n) => {
        const key = normalizeServiceKey(n, "paid_form");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8)
      .map((name, i) => ({ id: `sow-${i + 1}`, name: name.slice(0, 160), template_id: null }));
    if (JSON.stringify(forms) !== JSON.stringify(intake.wanted_forms)) {
      patch.wanted_forms = forms;
      const quote = reading.forms.find((f) => f.name.trim() === ordered[0])?.quote ?? null;
      if (quote) sources["wanted_forms"] = { quote: quote.slice(0, 400), source: "SOW" };
      else delete sources["wanted_forms"];
      filled.push(forms.length === 1 ? "the first form" : `${forms.length} forms to build`);
    }
    aiFilled.add("wanted_forms");
    if (intake.forms_built === null && !intake.person_set.includes("forms_built")) {
      patch.forms_built = false;
      aiFilled.add("forms_built");
    }
  }

  if (filled.length) {
    patch.ai_filled = [...aiFilled];
    patch.ai_sources = sources;
  }
  return { patch, filled };
}

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
