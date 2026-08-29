import { z } from "zod";

/**
 * SOW analysis (POC). One read-only pass over the SOW already attached to an
 * implementation: extract what the document actually says, then propose a
 * journey. Nothing here is written back to the implementation automatically.
 */
export const analyzeSowInput = z.object({
  implementationId: z.string().uuid(),
});

const confidence = z.preprocess(
  (v) => {
    const s = typeof v === "string" ? v.toLowerCase().trim() : "";
    if (s === "stated" || s === "implied" || s === "uncertain") return s;
    if (s === "explicit" || s === "high") return "stated";
    if (s === "medium" || s === "inferred") return "implied";
    return "uncertain";
  },
  z.enum(["stated", "implied", "uncertain"]),
);

/** The model sometimes returns an object or a bare string where we expect text. */
function textOf(
  v: unknown,
  keys: string[] = ["text", "description", "value", "name", "item"],
): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of keys) if (typeof o[k] === "string" && o[k] !== "") return o[k] as string;
    const first = Object.values(o).find((x) => typeof x === "string" && x !== "");
    if (typeof first === "string") return first;
  }
  return "";
}

const looseString = z.preprocess((v) => textOf(v), z.string());

/** One grounded finding. `quote` is the SOW wording it came from, when present. */
const finding = z.preprocess(
  (v) => {
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const quote = textOf(o["quote"] ?? o["evidence"] ?? o["source"] ?? null, ["quote", "text"]);
    return {
      text: textOf(v),
      confidence: o["confidence"] ?? "uncertain",
      quote: quote === "" ? null : quote,
    };
  },
  z.object({
    text: z.string(),
    confidence,
    quote: z.string().nullable(),
  }),
);

const num = z.preprocess((v) => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string") {
    const m = /-?\d+(\.\d+)?/.exec(v);
    if (m) return Math.round(Number(m[0]));
  }
  return null;
}, z.number().int().min(0).max(520).nullable());

/** Timing for one stage: either stated by the SOW, estimated by the AI, or absent. */
const stageTiming = z.preprocess(
  (v) => {
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const stated = textOf(o["statedText"] ?? o["stated"] ?? o["text"] ?? null, [
      "statedText",
      "text",
    ]);
    const rationale = textOf(o["rationale"] ?? o["reason"] ?? null, ["rationale", "text"]);
    const driver = textOf(o["dependencyDriver"] ?? o["driver"] ?? null, [
      "dependencyDriver",
      "text",
    ]);
    return {
      startWeek: o["startWeek"] ?? null,
      endWeek: o["endWeek"] ?? null,
      statedText: stated === "" ? null : stated,
      fromSow: o["fromSow"] === true || o["source"] === "sow",
      rationale: rationale === "" ? null : rationale,
      dependencyDriver: driver === "" ? null : driver,
      parallelWith: Array.isArray(o["parallelWith"])
        ? (o["parallelWith"] as unknown[]).map((x) => textOf(x)).filter((s) => s !== "")
        : [],
      insufficientInfo: o["insufficientInfo"] === true,
    };
  },
  z.object({
    startWeek: num,
    endWeek: num,
    /** The SOW's own wording for this stage's timing, when it has any. */
    statedText: z.string().nullable(),
    /** True when the SOW gives timing for this stage rather than it being estimated. */
    fromSow: z.preprocess((v) => v === true, z.boolean()),
    /** Why this duration is credible for the work described. */
    rationale: z.string().nullable(),
    /** The dependency that drives when this stage can run. */
    dependencyDriver: z.string().nullable(),
    /** Names of stages this one deliberately runs alongside. */
    parallelWith: z.array(z.string()),
    /** True when the SOW gives too little to estimate this stage credibly. */
    insufficientInfo: z.preprocess((v) => v === true, z.boolean()),
  }),
);

const proposedStage = z.preprocess(
  (v) => {
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const list = (x: unknown) =>
      Array.isArray(x) ? x.map((i) => textOf(i)).filter((s) => s !== "") : [];
    return {
      name: textOf(o["name"] ?? o["stage"] ?? o["title"] ?? v),
      lifecycleStage:
        typeof o["lifecycleStage"] === "string" && o["lifecycleStage"] !== ""
          ? o["lifecycleStage"]
          : null,
      purpose: textOf(o["purpose"] ?? o["goal"] ?? o["description"] ?? ""),
      workstreams: list(o["workstreams"] ?? o["activities"]),
      dependencies: list(o["dependencies"] ?? o["dependsOn"]),
      customerResponsibilities: list(o["customerResponsibilities"] ?? o["customerActions"]),
      acceptanceCriteria: list(o["acceptanceCriteria"] ?? o["acceptance"]),
      timing: o["timing"] ?? {},
      confidence: o["confidence"] ?? "uncertain",
    };
  },
  z.object({
    /** Free-form: the SOW decides the stages, not our lifecycle list. */
    name: z.string(),
    /** Closest existing lifecycle stage id, or null when there is no good match. */
    lifecycleStage: z.string().nullable(),
    purpose: z.string(),
    workstreams: z.array(z.string()),
    dependencies: z.array(z.string()),
    /** What the customer has to do for this stage, taken from the SOW. */
    customerResponsibilities: z.array(z.string()),
    /** How this stage is judged complete, where the SOW says so. */
    acceptanceCriteria: z.array(z.string()),
    /** Proposed relative timing — planning only, never a commitment. */
    timing: stageTiming,
    confidence,
  }),
);

/** The delivery window the SOW states overall, e.g. "16 to 22 weeks". */
const deliveryWindow = z.preprocess(
  (v) => {
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const stated = textOf(o["statedText"] ?? o["text"] ?? null, ["statedText", "text"]);
    const quote = textOf(o["quote"] ?? null, ["quote", "text"]);
    return {
      statedText: stated === "" ? null : stated,
      minWeeks: o["minWeeks"] ?? o["weeksMin"] ?? null,
      maxWeeks: o["maxWeeks"] ?? o["weeksMax"] ?? null,
      startDateStated: textOf(o["startDateStated"] ?? null) || null,
      startCondition:
        textOf(o["startCondition"] ?? o["startTrigger"] ?? null, ["startCondition", "text"]) ||
        null,
      delayConditions: Array.isArray(o["delayConditions"])
        ? (o["delayConditions"] as unknown[]).map((x) => textOf(x)).filter((s) => s !== "")
        : [],
      stageTimingProvided: o["stageTimingProvided"] === true,
      quote: quote === "" ? null : quote,
    };
  },
  z.object({
    statedText: z.string().nullable(),
    minWeeks: num,
    maxWeeks: num,
    /** A calendar start the SOW names, if any (free text — never invented). */
    startDateStated: z.string().nullable(),
    /** What the SOW says the clock starts on, e.g. "signature and kickoff". */
    startCondition: z.string().nullable(),
    /** Conditions the SOW says would delay or extend delivery. */
    delayConditions: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(looseString)),
    stageTimingProvided: z.preprocess((v) => v === true, z.boolean()),
    quote: z.string().nullable(),
  }),
);

const findings = z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(finding));
const strings = z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(looseString));

export const sowAnalysisSchema = z.object({
  readable: z.preprocess((v) => (typeof v === "boolean" ? v : true), z.boolean()),
  /** Present when the document could not be read or carried no SOW content. */
  problem: z.preprocess(
    (v) => (typeof v === "string" && v !== "" ? v : null),
    z.string().nullable(),
  ),
  summary: looseString,
  extraction: z.preprocess(
    (v) => (v && typeof v === "object" ? v : {}),
    z.object({
      objectives: findings,
      scope: findings,
      deliverables: findings,
      integrations: findings,
      customerResponsibilities: findings,
      providerResponsibilities: findings,
      trainingAndAdoption: findings,
      acceptanceCriteria: findings,
      timeline: findings,
      dependencies: findings,
      outOfScope: findings,
      requirements: findings,
      technicalSolutions: findings,
      successMeasures: findings,
      risksAndQuestions: findings,
    }),
  ),
  proposedJourney: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(proposedStage)),
  /** Delivery timing the SOW states overall. */
  deliveryWindow: z.preprocess((v) => (v && typeof v === "object" ? v : {}), deliveryWindow),
  assumptions: strings,

  gaps: strings,
});

export type SowAnalysis = z.infer<typeof sowAnalysisSchema>;
export type SowFinding = z.infer<typeof finding>;
export type SowProposedStage = z.infer<typeof proposedStage>;

export const EXTRACTION_SECTIONS: {
  key: keyof SowAnalysis["extraction"];
  label: string;
}[] = [
  { key: "objectives", label: "What the customer wants to achieve" },
  { key: "scope", label: "What is in scope" },
  { key: "outOfScope", label: "Explicitly out of scope" },
  { key: "requirements", label: "Requirements" },
  { key: "deliverables", label: "What has to be delivered" },
  { key: "integrations", label: "Systems and integrations" },
  { key: "technicalSolutions", label: "Where Technical Solutions is involved" },
  { key: "successMeasures", label: "How success is measured" },
  { key: "risksAndQuestions", label: "Risks and open questions" },
  { key: "customerResponsibilities", label: "What the customer has to do" },
  { key: "providerResponsibilities", label: "What we have to do" },
  { key: "trainingAndAdoption", label: "Training, rollout and adoption" },
  { key: "acceptanceCriteria", label: "How completion is judged" },
  { key: "timeline", label: "Dates, milestones and sequencing" },
  { key: "dependencies", label: "Dependencies the SOW names" },
];

/** Proposed timing for one stage — an AI planning recommendation, never a commitment. */
export type ProposedTiming = {
  startWeek: number;
  endWeek: number;
  /** Relative weeks, e.g. "Weeks 3–5". */
  weeks: string;
  /** Calendar range, only when the implementation has a known start date. */
  dates: string | null;
  /** The SOW's own wording, when it gave timing for this stage. */
  statedText: string | null;
  /** Where this timing came from. */
  source: "sow" | "estimated" | "adjusted";
  /** Why this duration is credible for the described work. */
  rationale: string | null;
  /** The dependency that drives when the stage can start. */
  dependencyDriver: string | null;
  /** Other proposed stages whose weeks overlap this one. */
  overlapsWith: string[];
  /** True when the estimate runs past the SOW's stated window. */
  beyondSowWindow: boolean;
};

/** A TIS adjustment to one stage's proposed weeks, keyed by journey index. */
export type TimingOverride = { startWeek: number; endWeek: number };

function weekLabel(start: number, end: number) {
  return start === end ? `Week ${start}` : `Weeks ${start}–${end}`;
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function dateRange(startDate: string, startWeek: number, endWeek: number) {
  const from = addDays(startDate, (startWeek - 1) * 7);
  const to = addDays(startDate, endWeek * 7 - 1);
  if (!from || !to) return null;
  const f = (d: Date) =>
    d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  return `${f(from)} – ${f(to)}`;
}

/** Total weeks the SOW allows, preferring the upper bound so the plan fits inside it. */
export function sowTotalWeeks(analysis: SowAnalysis): number | null {
  const { minWeeks, maxWeeks } = analysis.deliveryWindow;
  return maxWeeks ?? minWeeks ?? null;
}

/** One-line description of the delivery window the SOW states. */
export function deliveryWindowLabel(analysis: SowAnalysis): string | null {
  const w = analysis.deliveryWindow;
  if (w.statedText) return w.statedText;
  if (w.minWeeks && w.maxWeeks && w.minWeeks !== w.maxWeeks)
    return `${w.minWeeks}–${w.maxWeeks} weeks`;
  const total = sowTotalWeeks(analysis);
  return total ? `${total} weeks` : null;
}

/**
 * Proposed timing per stage, in the same order as `analysis.proposedJourney`.
 * Timing is used exactly as the SOW states it, or as the analysis estimated it
 * from the described scope — nothing is spread evenly across the stages, and a
 * stage with no credible estimate returns null rather than an invented span.
 * Calendar ranges appear only when the implementation has a start date.
 */
export function proposedTimings(
  analysis: SowAnalysis,
  startDate: string | null | undefined,
  overrides: Record<number, TimingOverride> = {},
): (ProposedTiming | null)[] {
  const stages = analysis.proposedJourney;
  if (stages.length === 0) return [];

  const spans = stages.map((s, i) => {
    const o = overrides[i];
    if (o && o.startWeek >= 1 && o.endWeek >= o.startWeek) {
      return { start: o.startWeek, end: o.endWeek, adjusted: true };
    }
    if (s.timing.insufficientInfo) return null;
    const start = s.timing.startWeek;
    const end = s.timing.endWeek ?? start;
    if (start == null || end == null || start < 1 || end < start) return null;
    return { start, end, adjusted: false };
  });

  const total = sowTotalWeeks(analysis);

  return stages.map((s, i) => {
    const span = spans[i];
    if (!span) return null;
    const overlapsWith = stages
      .map((other, j) => {
        const o = spans[j];
        if (j === i || !o) return null;
        return o.start <= span.end && span.start <= o.end ? other.name : null;
      })
      .filter((n): n is string => Boolean(n));
    return {
      startWeek: span.start,
      endWeek: span.end,
      weeks: weekLabel(span.start, span.end),
      dates: startDate ? dateRange(startDate, span.start, span.end) : null,
      statedText: s.timing.statedText,
      source: span.adjusted ? "adjusted" : s.timing.fromSow ? "sow" : "estimated",
      rationale: s.timing.rationale,
      dependencyDriver: s.timing.dependencyDriver,
      overlapsWith,
      beyondSowWindow: total != null && span.end > total,
    };
  });
}

export const TIMING_SOURCE_LABEL: Record<ProposedTiming["source"], string> = {
  sow: "per SOW",
  estimated: "AI estimate",
  adjusted: "adjusted by TIS",
};

/**
 * Applying a reviewed proposal. Every part is opt-in: the TIS ticks what should
 * be written, and anything not ticked is left exactly as it is.
 */
export const applySowProposalInput = z.object({
  implementationId: z.string().uuid(),
  authorId: z.string().uuid().nullable(),
  /** Appended to existing goals — never replaces them. */
  goals: z.string().trim().min(1).nullable(),
  requirements: z.array(z.string().trim().min(1)).max(60),
  successMeasures: z.array(z.string().trim().min(1)).max(60),
  /** The reviewed journey, saved as a working note. */
  journeyNote: z.string().trim().min(1).nullable(),
});

export type ApplySowProposalInput = z.infer<typeof applySowProposalInput>;

export const CONFIDENCE_LABEL: Record<SowFinding["confidence"], string> = {
  stated: "Stated in the SOW",
  implied: "Implied",
  uncertain: "Uncertain",
};

/**
 * The confirmed proposal is kept as a working note — no new tables, and the
 * TIS stays the author of record.
 */
export function proposalAsNote(
  analysis: SowAnalysis,
  sowName: string | null,
  startDate?: string | null,
  overrides: Record<number, TimingOverride> = {},
): string {
  const lines: string[] = [
    `Proposed implementation journey — AI-proposed from the SOW${sowName ? ` (${sowName})` : ""}, reviewed and saved by the TIS.`,
    "",
  ];
  const window = deliveryWindowLabel(analysis);
  if (window) {
    lines.push(`Delivery window stated in the SOW: ${window}.`);
  }
  const dw = analysis.deliveryWindow;
  if (dw.startCondition) lines.push(`SOW start condition: ${dw.startCondition}.`);
  for (const d of dw.delayConditions) lines.push(`SOW delay condition: ${d}`);
  lines.push(
    startDate
      ? `Proposed dates below are counted from the recorded start date (${startDate.slice(0, 10)}) — AI planning recommendation, not committed dates.`
      : "Timing below is in relative weeks because no start date is recorded — AI planning recommendation, not committed dates.",
    "",
  );
  const timings = proposedTimings(analysis, startDate ?? null, overrides);
  analysis.proposedJourney.forEach((stage, i) => {
    const t = timings[i];
    const when = t
      ? `${t.weeks}${t.dates ? ` · ${t.dates}` : ""} (${TIMING_SOURCE_LABEL[t.source]}) — `
      : "timing not proposed — ";
    lines.push(`${String(i + 1).padStart(2, "0")} ${when}${stage.name} — ${stage.purpose}`);
    if (!t) lines.push("  Insufficient information in the SOW to propose a credible window.");
    if (t?.statedText) lines.push(`  SOW timing: ${t.statedText}`);
    if (t?.rationale) lines.push(`  why: ${t.rationale}`);
    if (t?.dependencyDriver) lines.push(`  timing depends on: ${t.dependencyDriver}`);
    if (t && t.overlapsWith.length > 0)
      lines.push(`  runs alongside: ${t.overlapsWith.join("; ")}`);
    if (t?.beyondSowWindow) lines.push("  note: extends past the SOW's stated delivery window");
    for (const w of stage.workstreams) lines.push(`  • ${w}`);
    for (const d of stage.dependencies) lines.push(`  depends on: ${d}`);
    for (const c of stage.customerResponsibilities) lines.push(`  customer: ${c}`);
    for (const a of stage.acceptanceCriteria) lines.push(`  accepted when: ${a}`);
  });

  if (analysis.extraction.outOfScope.length > 0) {
    lines.push("", "Out of scope per the SOW:");
    for (const o of analysis.extraction.outOfScope) lines.push(`  • ${o.text}`);
  }

  if (analysis.assumptions.length > 0) {
    lines.push("", "Assumptions carried over:");
    for (const a of analysis.assumptions) lines.push(`  • ${a}`);
  }
  if (analysis.gaps.length > 0) {
    lines.push("", "Still unclear from the SOW:");
    for (const g of analysis.gaps) lines.push(`  • ${g}`);
  }
  return lines.join("\n");
}

/** Replacing just the attached SOW document, without touching anything else. */
export const setSowDocumentInput = z.object({
  implementationId: z.string().uuid(),
  documentUrl: z.string().min(1),
  documentName: z.string().min(1),
});
