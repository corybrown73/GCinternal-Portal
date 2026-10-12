import { z } from "zod/v4";

import { handoffQuestion, HANDOFF_QUESTIONS } from "./sales-handoff";

/**
 * Meeting-transcript analysis (V2).
 *
 * Transcript = evidence. Human-confirmed updates = implementation truth. One
 * read-only pass over an uploaded transcript proposes risks, issues,
 * decisions, a target-date change, an owner change, a follow-up note, or an
 * answer to a handoff question — each grounded with a quote and a
 * confidence, and now with what the reading knew about the implementation:
 * a severity and likelihood, an owner picked from the roster by id, a
 * calendar date resolved against the meeting date, and the open record a
 * proposal looks like a repeat of. Nothing here writes to the
 * implementation; every proposal is a row in `evidence_proposals` until a
 * person applies or dismisses it, and applying runs through the Hub's
 * existing risk/issue/decision/record-field/journal/plan/handoff write paths
 * (`transcript-proposals.server.ts`).
 *
 * Deliberately NOT supported, by the shape of this schema alone (reinforced
 * again in the model's own system prompt): a stage change, a checklist task
 * being marked done, or anything touching purchased services or the
 * meeting/timeline model. An intake suggestion lands as a handoff answer
 * marked as the TIS's, and only on a blank or AI-filled question.
 */

/**
 * The evidence row created for an uploaded transcript has no column for the
 * `account_files` id the actual bytes live under, so the upload stores a
 * durable reference in the evidence's own (otherwise-unused) `description`
 * field — the smallest way to keep "this evidence" linked back to "the file
 * it came from" without a new column. Implementation History reads it back
 * to offer an "Open source file" action via the existing attachment-link
 * mechanism (`openAttachment` / `accountFileLink`), and the upload path
 * reads it to queue the background reading.
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
  "intake_suggestion",
] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];

export const PROPOSAL_TYPE_LABEL: Record<ProposalType, string> = {
  risk: "Risk",
  issue: "Issue",
  decision: "Decision",
  target_date: "Target date change",
  owner: "Implementation owner change",
  note: "Follow-up note",
  intake_suggestion: "Handoff answer",
};

export const PROPOSAL_LEVELS = ["low", "medium", "high"] as const;
export type ProposalLevel = (typeof PROPOSAL_LEVELS)[number];

export const PROPOSAL_STATUSES = ["pending", "applied", "dismissed"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

function levelOf(v: unknown): ProposalLevel | null {
  const s = typeof v === "string" ? v.toLowerCase().trim() : "";
  if (s === "critical") return "high";
  return (PROPOSAL_LEVELS as readonly string[]).includes(s) ? (s as ProposalLevel) : null;
}

function isoDateOf(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return isValidIsoDate(s) ? s : null;
}

function nullableText(v: unknown): string | null {
  const s = textOf(v).trim();
  return s === "" ? null : s;
}

const HANDOFF_KEYS = HANDOFF_QUESTIONS.map((q) => q.key);

const duplicateOf = z.object({
  type: z.enum(["risk", "issue", "decision"]),
  id: z.string().min(1),
});

/**
 * One proposal. The preprocess accepts the V1 shape (type, title, text,
 * confidence, quote) and fills the V2 fields with nulls, so a reading kept
 * in an old job result still parses; a V2 reply is taken as given.
 */
const proposal = z.preprocess(
  (v) => {
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const type = typeof o["type"] === "string" ? o["type"].toLowerCase().trim() : "";
    const dup = o["duplicate_of"];
    const dupObj =
      dup && typeof dup === "object"
        ? (dup as Record<string, unknown>)
        : typeof dup === "string" && dup.trim() !== ""
          ? { type: "risk", id: dup.trim() }
          : null;
    const dupType = typeof dupObj?.["type"] === "string" ? dupObj["type"].toLowerCase() : "";
    const dupId = nullableText(dupObj?.["id"]);
    const intakeKey = nullableText(o["intake_key"]);
    return {
      type: (PROPOSAL_TYPES as readonly string[]).includes(type) ? type : "note",
      title: textOf(o["title"]).slice(0, 200) || "Untitled",
      text: textOf(o["text"] ?? o["value"]),
      confidence: o["confidence"] ?? "uncertain",
      quote: nullableText(o["quote"]),
      severity: levelOf(o["severity"]),
      likelihood: levelOf(o["likelihood"]),
      owner_team_member_id: nullableText(o["owner_team_member_id"]),
      owner_name: nullableText(o["owner_name"]),
      proposed_date: isoDateOf(o["proposed_date"]),
      duplicate_of:
        dupId && ["risk", "issue", "decision"].includes(dupType)
          ? { type: dupType, id: dupId }
          : null,
      intake_key: intakeKey && HANDOFF_KEYS.includes(intakeKey) ? intakeKey : null,
    };
  },
  z.object({
    type: z.enum(PROPOSAL_TYPES),
    title: z.string().min(1),
    text: z.string(),
    confidence,
    quote: z.string().nullable(),
    severity: z.enum(PROPOSAL_LEVELS).nullable(),
    likelihood: z.enum(PROPOSAL_LEVELS).nullable(),
    /** One of the roster ids given in the prompt; anything else is dropped server-side. */
    owner_team_member_id: z.string().nullable(),
    owner_name: z.string().nullable(),
    proposed_date: z.string().regex(ISO_DATE).nullable(),
    duplicate_of: duplicateOf.nullable(),
    /** For intake_suggestion: the handoff question the text answers. */
    intake_key: z.string().nullable(),
  }),
);

export const transcriptAnalysisSchema = z.object({
  readable: z.preprocess((v) => (typeof v === "boolean" ? v : true), z.boolean()),
  /** Present when the file could not be read or carried no meeting content. */
  problem: z.preprocess((v) => nullableText(v), z.string().nullable()),
  summary: z.preprocess((v) => textOf(v), z.string()),
  /** The model's best reading of when the meeting happened; null when it cannot tell. */
  meeting_date: z.preprocess((v) => isoDateOf(v), z.string().regex(ISO_DATE).nullable()),
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
  return ISO_DATE.test(t) && !Number.isNaN(new Date(`${t}T00:00:00Z`).getTime());
}

export const analyzeTranscriptInput = z.object({
  implementationId: z.string().uuid(),
  /** The `account_files` row the transcript was stored as. */
  attachmentId: z.string().uuid(),
});
export type AnalyzeTranscriptInput = z.infer<typeof analyzeTranscriptInput>;

/* --------------------------------------------------------------- context */

/**
 * What the reading knows about the implementation before it opens the
 * transcript: enough to name duplicates by id, pick owners by id, and turn
 * "two weeks from now" into a date.
 */
export type TranscriptContext = {
  customerName: string;
  implementationName: string;
  stageLabel: string;
  timeline: {
    closeDate: string | null;
    liveDate: string | null;
    firstForm: string | null;
  };
  open: {
    risks: Array<{ id: string; title: string }>;
    issues: Array<{ id: string; title: string }>;
    decisions: Array<{ id: string; title: string }>;
  };
  roster: Array<{ id: string; name: string; role: string }>;
  /** Who runs the implementation today, so a reading does not propose them as new. */
  owner: { id: string; name: string } | null;
  attachment: { title: string | null; uploadedAt: string | null };
  /**
   * False when the implementation has no deal record: there is no handoff
   * to answer, so no intake_suggestion can ever be applied and none is asked
   * for.
   */
  hasHandoff: boolean;
  /** Answered handoff questions are listed so the model does not re-answer them. */
  handoffAnswered: string[];
};

/**
 * The context block, as text, sent before the transcript. Ids are given in
 * full so the model can echo them; a proposal naming an id not in this
 * block is dropped when the reply is read.
 */
export function buildTranscriptContextText(ctx: TranscriptContext): string {
  const line = (rows: Array<{ id: string; title: string }>) =>
    rows.length ? rows.map((r) => `  - [${r.id}] ${r.title}`).join("\n") : "  (none)";
  const roster = ctx.roster.length
    ? ctx.roster.map((m) => `  - [${m.id}] ${m.name} (${m.role})`).join("\n")
    : "  (nobody listed)";
  const questions = ctx.hasHandoff
    ? HANDOFF_QUESTIONS.filter((q) => !ctx.handoffAnswered.includes(q.key))
        .map((q) => `  - ${q.key}: ${q.label}`)
        .join("\n") || "  (every question is answered; propose no intake_suggestion)"
    : "  (no handoff record on this implementation; propose no intake_suggestion)";
  return [
    `Implementation context (read this before the transcript):`,
    `Customer: ${ctx.customerName}`,
    `Implementation: ${ctx.implementationName}`,
    `Current stage: ${ctx.stageLabel}`,
    `Current implementation owner: ${ctx.owner ? `${ctx.owner.name} [${ctx.owner.id}]` : "nobody yet"} — an "owner" proposal is only for a different person`,
    `Close date: ${ctx.timeline.closeDate ?? "unknown"}`,
    `Planned go-live / target date: ${ctx.timeline.liveDate ?? "unknown"}`,
    `First form: ${ctx.timeline.firstForm ?? "not named yet"}`,
    `Transcript file: ${ctx.attachment.title ?? "untitled"}, uploaded ${ctx.attachment.uploadedAt ?? "unknown date"}`,
    ``,
    `Open risks (id, title):`,
    line(ctx.open.risks),
    `Open issues (id, title):`,
    line(ctx.open.issues),
    `Decisions already recorded (id, title):`,
    line(ctx.open.decisions),
    ``,
    `Team roster (id, name, role) — owner_team_member_id must be one of these ids or null:`,
    roster,
    ``,
    `Handoff questions still unanswered (intake_key, label) — an intake_suggestion must use one of these keys:`,
    questions,
  ].join("\n");
}

/* ----------------------------------------------------------------- rows */

/** A kept proposal as the panel reads it: the table row plus the names it needs. */
export type EvidenceProposalRow = {
  id: string;
  implementation_id: string;
  evidence_id: string | null;
  attachment_id: string | null;
  job_id: string | null;
  type: ProposalType;
  title: string;
  text: string;
  quote: string | null;
  confidence: TranscriptProposal["confidence"];
  severity: ProposalLevel | null;
  likelihood: ProposalLevel | null;
  owner_team_member_id: string | null;
  proposed_date: string | null;
  duplicate_of_type: string | null;
  duplicate_of_id: string | null;
  status: ProposalStatus;
  applied_entity_type: string | null;
  applied_entity_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  /** The evidence row's title and date, for grouping; null when the evidence is gone. */
  source_title: string | null;
  source_at: string | null;
  /** The open record this looks like a repeat of, by title; null when it no longer exists. */
  duplicate_title: string | null;
  /** The name the model heard, for the owner picker when no roster id matched. */
  owner_name: string | null;
  /** For intake_suggestion: the question's key. */
  intake_key: string | null;
};

export function attributionFor(quote: string | null): string {
  return quote
    ? `\n\nFrom the meeting transcript: "${quote}"`
    : "\n\n(From the meeting transcript.)";
}

/* ---------------------------------------------------------------- apply */

/** What the reviewer picked on the row before clicking Apply. */
export type ProposalPicks = {
  ownerTeamMemberId?: string | null | undefined;
  proposedDate?: string | null | undefined;
  severity?: ProposalLevel | null | undefined;
  likelihood?: ProposalLevel | null | undefined;
};

/** The write one applied proposal turns into, in the existing paths' own terms. */
export type ProposalApplyPlan =
  | {
      kind: "risk";
      input: {
        title: string;
        description: string;
        severity: ProposalLevel;
        likelihood: ProposalLevel;
        status: "open";
        ownerId: string | null;
      };
    }
  | {
      kind: "issue";
      input: {
        title: string;
        description: string;
        severity: ProposalLevel;
        status: "open";
        ownerId: string | null;
      };
    }
  | {
      kind: "decision";
      input: {
        title: string;
        rationale: string;
        decisionDate: string | null;
        status: "active";
      };
    }
  | { kind: "note"; input: { note: string } }
  | { kind: "owner"; ownerId: string }
  | { kind: "target_date"; via: "plan" | "record"; date: string }
  | { kind: "intake_suggestion"; key: string; value: string; quote: string | null }
  | { kind: "blocked"; reason: string };

/**
 * Severity, likelihood, owner and date from the proposal, overridden by
 * what the reviewer picked; the entity inputs the existing create paths
 * take. Pure, so the server and the tests agree on every mapping. A
 * target date goes to the plan's live-date override when the plan owns the
 * target (the implementation came from a deal), else to the record column
 * as before.
 */
export function proposalApplyPlan(
  p: Pick<
    EvidenceProposalRow,
    | "type"
    | "title"
    | "text"
    | "quote"
    | "severity"
    | "likelihood"
    | "owner_team_member_id"
    | "proposed_date"
    | "intake_key"
  >,
  picks: ProposalPicks,
  opts: { planOwnsTarget: boolean },
): ProposalApplyPlan {
  const attribution = attributionFor(p.quote);
  // A pick of null is a cleared owner; no pick at all keeps the reading's.
  const ownerId =
    (picks.ownerTeamMemberId !== undefined ? picks.ownerTeamMemberId : p.owner_team_member_id) ||
    null;
  const severity = picks.severity ?? p.severity ?? "medium";
  const likelihood = picks.likelihood ?? p.likelihood ?? "medium";
  const date = (
    (picks.proposedDate !== undefined ? picks.proposedDate : p.proposed_date) ?? ""
  ).trim();
  switch (p.type) {
    case "risk":
      return {
        kind: "risk",
        input: {
          title: p.title,
          description: `${p.text}${attribution}`,
          severity,
          likelihood,
          status: "open",
          ownerId,
        },
      };
    case "issue":
      return {
        kind: "issue",
        input: {
          title: p.title,
          description: `${p.text}${attribution}`,
          severity,
          status: "open",
          ownerId,
        },
      };
    case "decision":
      return {
        kind: "decision",
        input: {
          title: p.title,
          rationale: `${p.text}${attribution}`,
          decisionDate: isValidIsoDate(date) ? date : null,
          status: "active",
        },
      };
    case "target_date":
      if (!isValidIsoDate(date)) {
        return { kind: "blocked", reason: "Enter a calendar date to apply this." };
      }
      return { kind: "target_date", via: opts.planOwnsTarget ? "plan" : "record", date };
    case "owner":
      if (!ownerId) return { kind: "blocked", reason: "Pick who the new owner is to apply this." };
      return { kind: "owner", ownerId };
    case "intake_suggestion": {
      const q = p.intake_key ? handoffQuestion(p.intake_key) : null;
      if (!q) return { kind: "blocked", reason: "This suggestion names no handoff question." };
      if (!p.text.trim()) return { kind: "blocked", reason: "The suggested answer is empty." };
      return { kind: "intake_suggestion", key: q.key, value: p.text.trim(), quote: p.quote };
    }
    case "note":
    default:
      return { kind: "note", input: { note: `${p.title}\n\n${p.text}${attribution}` } };
  }
}

/** Whether a pending row starts ticked: a duplicate or an unresolvable row does not. */
export function proposalDefaultSelected(
  p: Pick<
    EvidenceProposalRow,
    "type" | "owner_team_member_id" | "proposed_date" | "duplicate_of_id" | "intake_key" | "text"
  >,
  resolvedOwnerId: string,
): boolean {
  if (p.duplicate_of_id) return false;
  if (p.type === "target_date") return Boolean(p.proposed_date && isValidIsoDate(p.proposed_date));
  if (p.type === "owner") return resolvedOwnerId !== "";
  if (p.type === "intake_suggestion") return Boolean(p.intake_key) && p.text.trim() !== "";
  return true;
}

export const proposalDecisionInput = z.object({
  id: z.string().uuid(),
  ownerTeamMemberId: z.string().uuid().nullable().optional(),
  proposedDate: z.string().regex(ISO_DATE).nullable().optional(),
  severity: z.enum(PROPOSAL_LEVELS).nullable().optional(),
  likelihood: z.enum(PROPOSAL_LEVELS).nullable().optional(),
});
export type ProposalDecisionInput = z.infer<typeof proposalDecisionInput>;
