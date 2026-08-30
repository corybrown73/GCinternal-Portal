import { z } from "zod";

import { calendarDaysBetween } from "@/lib/dates";

/**
 * P0 Slice 3 — write paths for the six existing delivery records:
 * requirements, risks, issues, escalations, decisions, commitments.
 *
 * Every enum below mirrors the table's own CHECK constraint exactly, so the
 * UI can only offer values the database already accepts. No new columns, no
 * new tables, no invented vocabulary. Optional stays optional: blank means
 * "not known yet" and is stored as NULL, never as a fabricated default.
 */

const optionalText = z.string().trim().min(1).nullable();
const optionalUuid = z.string().uuid().nullable();
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
  .nullable();

/* ---------------- Vocabularies (from DB CHECK constraints) ---------------- */

export const REQUIREMENT_PRIORITIES = ["must_have", "should_have", "nice_to_have"] as const;
export const REQUIREMENT_STATUSES = [
  "open",
  "in_design",
  "built",
  "validated",
  "approved",
  "rejected",
  "deferred",
] as const;
export const REQUIREMENT_SCOPE_STATUSES = ["original", "added", "modified", "removed"] as const;

export const RISK_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const RISK_LIKELIHOODS = ["low", "medium", "high"] as const;
export const RISK_STATUSES = ["open", "mitigated", "accepted", "closed"] as const;

export const ISSUE_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const ISSUE_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

export const ESCALATION_SEVERITIES = ["medium", "high", "critical"] as const;
export const ESCALATION_STATUSES = ["open", "in_progress", "resolved"] as const;

export const DECISION_STATUSES = ["active", "superseded", "reversed"] as const;

export const COMMITMENT_AUDIENCES = ["customer", "internal"] as const;
export const COMMITMENT_STATUSES = ["open", "met", "missed", "renegotiated"] as const;

/* ---------------- Resolution dates ---------------- */

/**
 * A record cannot be resolved before it existed.
 *
 * THE BUG THIS CLOSES. "Resolved on" was a free date field with nothing behind
 * it, so a risk identified on 12 August could be saved resolved on 3 August and
 * every screen would show it that way. Nothing downstream noticed — time-to-
 * resolve came out negative and the row still counted as closed — so the only
 * evidence was a date a person had to read carefully.
 *
 * WHY CALENDAR DAYS AND NOT INSTANTS. `identified_at` and `raised_at` are
 * timestamps set by `now()`; "Resolved on" is a date, stored at UTC midnight.
 * Comparing them as instants would refuse the commonest legitimate entry there
 * is — a risk raised at 14:00 and resolved the same afternoon, whose midnight
 * is six hours earlier than its own identification. So both sides are reduced
 * to the UTC day they fall on, per the rule in src/lib/dates.ts, and only a
 * strictly earlier day is refused.
 */
export function resolutionOrderError(opts: {
  noun: string;
  startLabel: string;
  startedAt: string | Date | null | undefined;
  resolvedAt: string | null | undefined;
}): string | null {
  const { noun, startLabel, startedAt, resolvedAt } = opts;
  if (!resolvedAt || !startedAt) return null;
  const days = calendarDaysBetween(startedAt, resolvedAt);
  if (days === null || days >= 0) return null;
  return `This ${noun} was ${startLabel} on ${utcDay(startedAt)}, so it cannot be resolved on ${utcDay(resolvedAt)}. Pick the day it was actually resolved, or correct the ${startLabel} date.`;
}

/** The YYYY-MM-DD a value falls on in UTC — the frame the rest of the app reads dates in. */
function utcDay(value: string | Date): string {
  const d =
    value instanceof Date ? value : new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
}

/* ---------------- Requirements ---------------- */

export const requirementInput = z.object({
  title: z.string().trim().min(1, "Give the requirement a title"),
  description: optionalText,
  category: optionalText,
  priority: z.enum(REQUIREMENT_PRIORITIES),
  status: z.enum(REQUIREMENT_STATUSES),
  scopeStatus: z.enum(REQUIREMENT_SCOPE_STATUSES),
  /** Where the requirement came from (SOW, kickoff, workshop) — free text. */
  source: optionalText,
  createdBy: optionalUuid,
});

export const createRequirementInput = requirementInput.extend({
  implementationId: z.string().uuid(),
});
export const updateRequirementInput = requirementInput.extend({ id: z.string().uuid() });
export type RequirementInput = z.infer<typeof requirementInput>;

export function toRequirementPatch(data: RequirementInput) {
  return {
    title: data.title,
    description: data.description,
    category: data.category,
    priority: data.priority,
    status: data.status,
    scope_status: data.scopeStatus,
    source: data.source,
    created_by: data.createdBy,
  };
}

/* ---------------- Risks ---------------- */

export const riskInput = z.object({
  title: z.string().trim().min(1, "Give the risk a title"),
  description: optionalText,
  severity: z.enum(RISK_SEVERITIES),
  likelihood: z.enum(RISK_LIKELIHOODS),
  status: z.enum(RISK_STATUSES),
  ownerId: optionalUuid,
  impact: optionalText,
  mitigation: optionalText,
  /**
   * Editable so a risk that was spotted last month can be recorded truthfully.
   * Blank leaves the stored value alone — on a new risk that is `now()`.
   */
  identifiedAt: optionalDate,
  /** Only recorded once the risk actually stops being live. */
  resolvedAt: optionalDate,
});

const checkRiskDates = (data: RiskInput, ctx: z.RefinementCtx) => {
  const message = resolutionOrderError({
    noun: "risk",
    startLabel: "identified",
    startedAt: data.identifiedAt,
    resolvedAt: data.resolvedAt,
  });
  if (message) ctx.addIssue({ code: "custom", message, path: ["resolvedAt"] });
};

export const createRiskInput = riskInput
  .extend({ implementationId: z.string().uuid() })
  .superRefine(checkRiskDates);
export const updateRiskInput = riskInput
  .extend({ id: z.string().uuid() })
  .superRefine(checkRiskDates);
export type RiskInput = z.infer<typeof riskInput>;

export function toRiskPatch(data: RiskInput) {
  return {
    title: data.title,
    description: data.description,
    severity: data.severity,
    likelihood: data.likelihood,
    status: data.status,
    owner_id: data.ownerId,
    impact: data.impact,
    mitigation: data.mitigation,
    // Omitted rather than nulled when blank: the column is NOT NULL, and a
    // blank field means "leave it as it is", not "forget when this started".
    ...(data.identifiedAt ? { identified_at: `${data.identifiedAt}T00:00:00Z` } : {}),
    resolved_at: data.resolvedAt ? `${data.resolvedAt}T00:00:00Z` : null,
  };
}

/* ---------------- Issues ---------------- */

export const issueInput = z.object({
  title: z.string().trim().min(1, "Give the issue a title"),
  description: optionalText,
  severity: z.enum(ISSUE_SEVERITIES),
  status: z.enum(ISSUE_STATUSES),
  ownerId: optionalUuid,
  resolution: optionalText,
  /** See identifiedAt on riskInput — same reason, different column name. */
  raisedAt: optionalDate,
  resolvedAt: optionalDate,
});

const checkIssueDates = (data: IssueInput, ctx: z.RefinementCtx) => {
  const message = resolutionOrderError({
    noun: "issue",
    startLabel: "raised",
    startedAt: data.raisedAt,
    resolvedAt: data.resolvedAt,
  });
  if (message) ctx.addIssue({ code: "custom", message, path: ["resolvedAt"] });
};

export const createIssueInput = issueInput
  .extend({ implementationId: z.string().uuid() })
  .superRefine(checkIssueDates);
export const updateIssueInput = issueInput
  .extend({ id: z.string().uuid() })
  .superRefine(checkIssueDates);
export type IssueInput = z.infer<typeof issueInput>;

export function toIssuePatch(data: IssueInput) {
  return {
    title: data.title,
    description: data.description,
    severity: data.severity,
    status: data.status,
    owner_id: data.ownerId,
    resolution: data.resolution,
    ...(data.raisedAt ? { raised_at: `${data.raisedAt}T00:00:00Z` } : {}),
    resolved_at: data.resolvedAt ? `${data.resolvedAt}T00:00:00Z` : null,
  };
}

/* ---------------- Escalations ---------------- */

export const escalationInput = z.object({
  title: z.string().trim().min(1, "Give the escalation a title"),
  description: optionalText,
  severity: z.enum(ESCALATION_SEVERITIES),
  status: z.enum(ESCALATION_STATUSES),
  /** Free text on the existing column (no constraint) — e.g. commercial, technical. */
  escalationType: optionalText,
  ownerId: optionalUuid,
  raisedBy: optionalUuid,
  /** Existing relationships to an already-recorded risk or issue. */
  relatedIssueId: optionalUuid,
  relatedRiskId: optionalUuid,
  resolutionSummary: optionalText,
  /** See identifiedAt on riskInput — same reason, different column name. */
  raisedAt: optionalDate,
  resolvedAt: optionalDate,
});

const checkEscalationDates = (data: EscalationInput, ctx: z.RefinementCtx) => {
  const message = resolutionOrderError({
    noun: "escalation",
    startLabel: "raised",
    startedAt: data.raisedAt,
    resolvedAt: data.resolvedAt,
  });
  if (message) ctx.addIssue({ code: "custom", message, path: ["resolvedAt"] });
};

export const createEscalationInput = escalationInput
  .extend({ implementationId: z.string().uuid() })
  .superRefine(checkEscalationDates);
export const updateEscalationInput = escalationInput
  .extend({ id: z.string().uuid() })
  .superRefine(checkEscalationDates);
export type EscalationInput = z.infer<typeof escalationInput>;

export function toEscalationPatch(data: EscalationInput) {
  return {
    title: data.title,
    description: data.description,
    severity: data.severity,
    status: data.status,
    escalation_type: data.escalationType,
    owner_id: data.ownerId,
    raised_by: data.raisedBy,
    related_issue_id: data.relatedIssueId,
    related_risk_id: data.relatedRiskId,
    resolution_summary: data.resolutionSummary,
    ...(data.raisedAt ? { raised_at: `${data.raisedAt}T00:00:00Z` } : {}),
    resolved_at: data.resolvedAt ? `${data.resolvedAt}T00:00:00Z` : null,
  };
}

/* ---------------- Decisions ---------------- */

export const decisionInput = z.object({
  title: z.string().trim().min(1, "Give the decision a title"),
  description: optionalText,
  rationale: optionalText,
  /** Free text on the existing column: decisions can be made customer-side. */
  decidedBy: optionalText,
  decisionDate: optionalDate,
  status: z.enum(DECISION_STATUSES),
});

export const createDecisionInput = decisionInput.extend({ implementationId: z.string().uuid() });
export const updateDecisionInput = decisionInput.extend({ id: z.string().uuid() });
export type DecisionInput = z.infer<typeof decisionInput>;

export function toDecisionPatch(data: DecisionInput) {
  return {
    title: data.title,
    description: data.description,
    rationale: data.rationale,
    decided_by: data.decidedBy,
    decision_date: data.decisionDate,
    status: data.status,
  };
}

/* ---------------- Commitments ---------------- */

export const commitmentInput = z.object({
  description: z.string().trim().min(1, "Describe what was committed"),
  committedTo: z.enum(COMMITMENT_AUDIENCES),
  ownerId: optionalUuid,
  madeBy: optionalUuid,
  dueDate: optionalDate,
  status: z.enum(COMMITMENT_STATUSES),
  /** Only set when the commitment is actually fulfilled. */
  fulfilledAt: optionalDate,
});

export const createCommitmentInput = commitmentInput.extend({
  implementationId: z.string().uuid(),
});
export const updateCommitmentInput = commitmentInput.extend({ id: z.string().uuid() });
export type CommitmentInput = z.infer<typeof commitmentInput>;

export function toCommitmentPatch(data: CommitmentInput) {
  return {
    description: data.description,
    committed_to: data.committedTo,
    owner_id: data.ownerId,
    made_by: data.madeBy,
    due_date: data.dueDate,
    status: data.status,
    fulfilled_at: data.fulfilledAt ? `${data.fulfilledAt}T00:00:00Z` : null,
  };
}
