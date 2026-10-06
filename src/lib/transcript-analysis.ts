import { z } from "zod";

/**
 * Meeting-transcript analysis (V1).
 *
 * Transcript = evidence. Human-confirmed updates = implementation truth. One
 * read-only pass over an uploaded transcript proposes risks, issues,
 * decisions, a target-date change, an owner change, or a general follow-up
 * note — each grounded with a quote and a confidence. Nothing here writes to
 * the implementation; applying a reviewed selection goes through the Hub's
 * existing risk/issue/decision/record-field/journal write paths, in
 * `transcript-update-panel.tsx`.
 *
 * Deliberately NOT supported, by the shape of this schema alone (reinforced
 * again in the model's own system prompt): a stage change, a checklist task
 * being marked done, or anything touching intake, purchased services, or the
 * meeting/timeline model.
 */

/**
 * The evidence row created for an uploaded transcript has no column for the
 * `account_files` id the actual bytes live under, so the upload stores a
 * durable reference in the evidence's own (otherwise-unused) `description`
 * field — the smallest way to keep "this evidence" linked back to "the file
 * it came from" without a new column. Implementation History reads it back
 * to offer an "Open source file" action via the existing attachment-link
 * mechanism (`openAttachment` / `accountFileLink`).
 */
const ATTACHMENT_REFERENCE_PREFIX = "attachment:";

export function attachmentReferenceFor(attachmentId: string): string {
  return `${ATTACHMENT_REFERENCE_PREFIX}${attachmentId}`;
}

export function attachmentIdFromDescription(description: string | null): string | null {
  if (!description || !description.startsWith(ATTACHMENT_REFERENCE_PREFIX)) return null;
  const id = description.slice(ATTACHMENT_REFERENCE_PREFIX.length).trim();
  return id || null;
}

export const PROPOSAL_TYPES = [
  "risk",
  "issue",
  "decision",
  "target_date",
  "owner",
  "note",
] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];

export const PROPOSAL_TYPE_LABEL: Record<ProposalType, string> = {
  risk: "Risk",
  issue: "Issue",
  decision: "Decision",
  target_date: "Target date change",
  owner: "Implementation owner change",
  note: "Follow-up note",
};

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

/** The model sometimes returns an object where we expect plain text. */
function textOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["text", "title", "value"]) {
      if (typeof o[k] === "string" && o[k] !== "") return o[k] as string;
    }
  }
  return "";
}

const proposal = z.preprocess(
  (v) => {
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const type = typeof o["type"] === "string" ? o["type"].toLowerCase().trim() : "";
    const quote = textOf(o["quote"] ?? null);
    return {
      type: (PROPOSAL_TYPES as readonly string[]).includes(type) ? type : "note",
      title: textOf(o["title"]).slice(0, 200) || "Untitled",
      text: textOf(o["text"] ?? o["value"]),
      confidence: o["confidence"] ?? "uncertain",
      quote: quote === "" ? null : quote,
    };
  },
  z.object({
    type: z.enum(PROPOSAL_TYPES),
    title: z.string().min(1),
    text: z.string(),
    confidence,
    quote: z.string().nullable(),
  }),
);

export const transcriptAnalysisSchema = z.object({
  readable: z.preprocess((v) => (typeof v === "boolean" ? v : true), z.boolean()),
  /** Present when the file could not be read or carried no meeting content. */
  problem: z.preprocess(
    (v) => (typeof v === "string" && v !== "" ? v : null),
    z.string().nullable(),
  ),
  summary: z.preprocess((v) => textOf(v), z.string()),
  proposals: z.preprocess((v) => (Array.isArray(v) ? v.slice(0, 40) : []), z.array(proposal)),
});

export type TranscriptAnalysis = z.infer<typeof transcriptAnalysisSchema>;
export type TranscriptProposal = z.infer<typeof proposal>;

export const CONFIDENCE_LABEL: Record<TranscriptProposal["confidence"], string> = {
  stated: "Stated in the transcript",
  implied: "Implied",
  uncertain: "Uncertain",
};

/** A proposed target date must parse as a real calendar date before it can be applied. */
export function isValidIsoDate(s: string): boolean {
  const t = s.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(new Date(`${t}T00:00:00Z`).getTime());
}

export const analyzeTranscriptInput = z.object({
  implementationId: z.string().uuid(),
  /** The `account_files` row the transcript was stored as. */
  attachmentId: z.string().uuid(),
});
export type AnalyzeTranscriptInput = z.infer<typeof analyzeTranscriptInput>;
