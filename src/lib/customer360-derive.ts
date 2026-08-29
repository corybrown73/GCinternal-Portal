import type { Customer360 } from "./hub-types";
import { LIFECYCLE_STAGES, LIFECYCLE_STAGE_MAP } from "./lifecycle";
import {
  STAGE_FLAG_DAYS,
  daysSince,
  fmtDate,
  humanize,
  isOverdue,
  normalizeStage,
  stageIndex,
  stageLabel,
} from "./hub-format";

export const NEXT_ACTION_UNKNOWN = "Next action not recorded";

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function severityRank(value: string | null | undefined) {
  return SEVERITY_RANK[(value ?? "").toLowerCase()] ?? 4;
}

/**
 * Terminal statuses, PER VOCABULARY.
 *
 * These four tables do not share a status vocabulary — `delivery-input.ts`
 * defines a separate enum for each, and the write paths enforce them. One
 * blended list was the bug: it excluded "fulfilled" and "done", which no
 * commitment can ever be, while missing "met", which is the only way a
 * commitment is ever finished. Every met commitment therefore counted as open,
 * on Home, on the 360, in health and in Leadership.
 *
 * `customer360-derive.test.ts` cross-checks these against the write-path enums,
 * so adding a status without deciding whether it is terminal fails CI rather
 * than quietly inflating an open count.
 *
 * Judgement calls, stated: a MISSED commitment stays open (the obligation did
 * not go away by being broken), and a RENEGOTIATED one stays open (the new
 * terms are still owed). An in_progress issue or escalation is open.
 */
export const TERMINAL_STATUSES = {
  commitments: ["met"],
  risks: ["mitigated", "accepted", "closed"],
  issues: ["resolved", "closed"],
  escalations: ["resolved"],
} as const;

const isOpenFor = (kind: keyof typeof TERMINAL_STATUSES, status: string | null | undefined) =>
  !(TERMINAL_STATUSES[kind] as readonly string[]).includes((status ?? "").toLowerCase());

export function openItems(record: Customer360) {
  return {
    commitments: record.commitments.filter((c: any) => isOpenFor("commitments", c.status)),
    risks: record.risks.filter((r: any) => isOpenFor("risks", r.status)),
    issues: record.issues.filter((r: any) => isOpenFor("issues", r.status)),
    escalations: record.escalations.filter((r: any) => isOpenFor("escalations", r.status)),
  };
}

/** "What matters now": most severe live escalation, then risk, then issue. */
export function whatMattersNow(record: Customer360): string {
  const open = openItems(record);
  const bySeverity = (rows: any[]) =>
    [...rows].sort((a, b) => severityRank(a.severity) - severityRank(b.severity))[0];

  const esc = bySeverity(open.escalations);
  if (esc) return `Escalation (${esc.severity}): ${esc.title}`;
  const risk = bySeverity(open.risks);
  if (risk) return `Risk (${risk.severity}/${risk.likelihood} likelihood): ${risk.title}`;
  const issue = bySeverity(open.issues);
  if (issue) return `Issue (${issue.severity}): ${issue.title}`;
  const overdue = open.commitments.filter((c: any) => isOverdue(c.due_date));
  if (overdue.length) return `${overdue.length} overdue commitment(s), nothing escalated`;
  return "No open escalations, risks or issues.";
}

/** "Next action": nearest overdue/upcoming commitment, else an undecided decision. */
export function nextAction(
  record: Customer360,
  impl?: { target_launch_date?: string | null; actual_launch_date?: string | null },
): string {
  const open = openItems(record);
  const dated = open.commitments
    .filter((c: any) => c.due_date)
    .sort((a: any, b: any) => a.due_date.localeCompare(b.due_date));

  const overdue = dated.filter((c: any) => isOverdue(c.due_date));
  if (overdue.length) {
    const c: any = overdue[0];
    return `Close out the overdue commitment — ${c.description} (due ${fmtDate(c.due_date)}${c.owner_name ? `, ${c.owner_name}` : ""})`;
  }
  if (dated.length) {
    const c: any = dated[0];
    return `Deliver the commitment — ${c.description} (due ${fmtDate(c.due_date)}${c.owner_name ? `, ${c.owner_name}` : ""})`;
  }
  const pending = record.decisions.find((d: any) =>
    ["pending", "proposed", "open"].includes((d.status ?? "").toLowerCase()),
  );
  if (pending) return `Resolve the open decision — ${(pending as any).title}`;
  const undated = open.commitments[0] as any;
  if (undated) return `Schedule the commitment — ${undated.description} (no due date set)`;
  if (impl && launchOverdue(impl)) {
    return `Launch date has passed (${fmtDate(impl.target_launch_date)}) — needs a launch review and replan`;
  }
  return NEXT_ACTION_UNKNOWN;
}

/** Target launch date has passed with no actual launch recorded. */
export function launchOverdue(impl: {
  target_launch_date?: string | null;
  actual_launch_date?: string | null;
}) {
  return Boolean(
    !impl.actual_launch_date && impl.target_launch_date && isOverdue(impl.target_launch_date),
  );
}

/**
 * True when the only reason to surface an implementation would be plain steady-state
 * tenure. Phase-based rather than id-based so the Graduate + CS merge keeps working.
 */
export function isCsStage(stage: string | null | undefined) {
  const id = normalizeStage(stage);
  return id ? LIFECYCLE_STAGE_MAP[id].phase === "steady-state" : false;
}

/** Any open signal that justifies surfacing a long-tenured CS implementation. */
export function hasOtherOpenSignal(record: Customer360) {
  const open = openItems(record);
  return (
    open.risks.length > 0 ||
    open.issues.length > 0 ||
    open.escalations.length > 0 ||
    open.commitments.some((c: any) => c.due_date && isOverdue(c.due_date))
  );
}

export function progress(stage: string | null | undefined) {
  const idx = stageIndex(stage);
  const total = LIFECYCLE_STAGES.length;
  return { index: idx + 1, total, pct: idx < 0 ? 0 : ((idx + 1) / total) * 100 };
}

/** Signal-derived implementation health. Never reads implementations.status. */
export type ImplHealth = "blocked" | "at_risk" | "on_track" | "no_signal";

type HealthImpl = {
  current_stage?: string | null;
  stage_entered_at?: string | null;
  target_launch_date?: string | null;
  actual_launch_date?: string | null;
};

/** Same rule triage uses for a milestone that has slipped. */
function milestoneMissed(m: any) {
  const status = (m.status ?? "").toLowerCase();
  return (
    !m.completed_date &&
    (["missed", "overdue", "blocked"].includes(status) ||
      (m.target_date != null && isOverdue(m.target_date) && status !== "completed"))
  );
}

/** The branch of deriveHealth that decided the level. */
export type HealthRule =
  | "escalation_blocked"
  | "risk_blocked"
  | "risk_at_risk"
  | "issue_at_risk"
  | "overdue_commitments"
  | "launch_overdue"
  | "stalled_stage"
  | "milestone_off_track"
  | "no_signal"
  | "clear";

/**
 * Everything the decision turned on, not a summary of it. deriveHealth branches
 * on the identity and severity of specific rows, so counts alone could not
 * explain a verdict — these fields are enough to re-derive the level from the
 * snapshot alone.
 */
export type HealthEvidence = {
  rule: HealthRule;
  top_escalation: { id: string; severity: string; title: string } | null;
  top_risk: { id: string; severity: string; likelihood: string | null; title: string } | null;
  top_issue: { id: string; severity: string; title: string } | null;
  overdue_commitments: Array<{ id: string; title: string; due_date: string | null }>;
  milestone: { id: string; name: string; status: string | null; target_date: string | null } | null;
  stage: string | null;
  stage_entered_at: string | null;
  days_in_stage: number | null;
  target_launch_date: string | null;
  actual_launch_date: string | null;
  counts: {
    open_escalations: number;
    open_risks: number;
    open_issues: number;
    open_commitments: number;
    milestones: number;
  };
};

export type HealthResult = { level: ImplHealth; reason: string | null; evidence: HealthEvidence };

/** At most this many overdue commitments are recorded in the evidence object. */
const MAX_EVIDENCE_COMMITMENTS = 10;

export function deriveHealth(record: Customer360, impl: HealthImpl): HealthResult {
  const open = openItems(record);
  const milestones: any[] = (record as any).milestones ?? [];
  const bySeverity = (rows: any[]) =>
    [...rows].sort((a, b) => severityRank(a.severity) - severityRank(b.severity))[0];

  const esc = bySeverity(open.escalations);
  const topRisk = bySeverity(open.risks);
  const topIssue = bySeverity(open.issues);
  const overdue = open.commitments.filter((c: any) => isOverdue(c.due_date));
  const stalledDays = daysSince(impl.stage_entered_at) ?? 0;
  const badMilestone =
    milestones.find(milestoneMissed) ??
    milestones.find((m: any) => (m.status ?? "").toLowerCase() === "at_risk");

  const base: Omit<HealthEvidence, "rule"> = {
    top_escalation: esc ? { id: esc.id, severity: esc.severity, title: esc.title } : null,
    top_risk: topRisk
      ? {
          id: topRisk.id,
          severity: topRisk.severity,
          likelihood: topRisk.likelihood ?? null,
          title: topRisk.title,
        }
      : null,
    top_issue: topIssue
      ? { id: topIssue.id, severity: topIssue.severity, title: topIssue.title }
      : null,
    overdue_commitments: overdue.slice(0, MAX_EVIDENCE_COMMITMENTS).map((c: any) => ({
      id: c.id,
      title: c.description ?? c.title ?? "",
      due_date: c.due_date ?? null,
    })),
    milestone: badMilestone
      ? {
          id: badMilestone.id,
          name: badMilestone.name,
          status: badMilestone.status ?? null,
          target_date: badMilestone.target_date ?? null,
        }
      : null,
    stage: impl.current_stage ?? null,
    stage_entered_at: impl.stage_entered_at ?? null,
    days_in_stage: daysSince(impl.stage_entered_at),
    target_launch_date: impl.target_launch_date ?? null,
    actual_launch_date: impl.actual_launch_date ?? null,
    counts: {
      open_escalations: open.escalations.length,
      open_risks: open.risks.length,
      open_issues: open.issues.length,
      open_commitments: open.commitments.length,
      milestones: milestones.length,
    },
  };
  const decide = (level: ImplHealth, reason: string | null, rule: HealthRule): HealthResult => ({
    level,
    reason,
    evidence: { ...base, rule },
  });

  // ---- blocked ----
  if (esc && severityRank(esc.severity) <= 1) {
    return decide("blocked", `Escalation (${esc.severity}): ${esc.title}`, "escalation_blocked");
  }
  if (topRisk && severityRank(topRisk.severity) === 0) {
    return decide(
      "blocked",
      `Risk (critical/${topRisk.likelihood ?? "unknown"} likelihood): ${topRisk.title}`,
      "risk_blocked",
    );
  }

  // ---- at risk ----
  if (topRisk && severityRank(topRisk.severity) <= 2) {
    return decide(
      "at_risk",
      `Risk (${topRisk.severity}/${topRisk.likelihood ?? "unknown"} likelihood): ${topRisk.title}`,
      "risk_at_risk",
    );
  }
  if (topIssue && severityRank(topIssue.severity) <= 2) {
    return decide("at_risk", `Issue (${topIssue.severity}): ${topIssue.title}`, "issue_at_risk");
  }
  if (overdue.length) {
    return decide(
      "at_risk",
      `${overdue.length} overdue commitment(s), most recent due ${fmtDate(
        [...overdue].sort((a: any, b: any) =>
          String(a.due_date).localeCompare(String(b.due_date)),
        )[0].due_date,
      )}`,
      "overdue_commitments",
    );
  }
  if (launchOverdue(impl)) {
    return decide(
      "at_risk",
      `Target launch ${fmtDate(impl.target_launch_date)} passed with no actual launch recorded`,
      "launch_overdue",
    );
  }
  const stalled = stalledDays > STAGE_FLAG_DAYS;
  if (stalled && (!isCsStage(impl.current_stage) || hasOtherOpenSignal(record))) {
    return decide("at_risk", `Stalled ${stalledDays} days in current stage`, "stalled_stage");
  }
  if (badMilestone) {
    return decide(
      "at_risk",
      `Milestone ${humanize(badMilestone.status ?? "off track")}: ${badMilestone.name}`,
      "milestone_off_track",
    );
  }

  // ---- no signal (checked before on_track) ----
  const anyData =
    record.risks.length +
      record.issues.length +
      record.escalations.length +
      record.commitments.length +
      milestones.length >
    0;
  if (!anyData) {
    return decide(
      "no_signal",
      "No risks, issues, escalations, commitments or milestones recorded yet",
      "no_signal",
    );
  }

  return decide("on_track", "Nothing open against it", "clear");
}

/**
 * Data-integrity check: stage has moved past Launch but no actual_launch_date recorded.
 * Independent of launchOverdue() — different question, kept separate deliberately.
 */
export function launchStateConflict(impl: {
  current_stage: string | null | undefined;
  actual_launch_date: string | null | undefined;
}): boolean {
  const current = stageIndex(impl.current_stage);
  const launch = stageIndex("launch");
  if (current < 0 || launch < 0) return false;
  return current > launch && !impl.actual_launch_date;
}

export type MeaningfulEvent = {
  key: string;
  at: string;
  kind: string;
  title: string;
  detail: string | null;
  actor: string | null;
};

/** Overview "recent activity": stage changes, decisions, escalations, approvals only. */
export function meaningfulEvents(record: Customer360, limit = 6): MeaningfulEvent[] {
  const events: MeaningfulEvent[] = [
    ...record.stage_history.map((h) => ({
      key: `stage-${h.id}`,
      at: h.entered_at,
      kind: "Stage",
      title: `Entered stage`,
      detail: h.stage,
      actor: h.entered_by_name,
    })),
    ...record.decisions.map((d: any) => ({
      key: `dec-${d.id}`,
      at: d.decision_date ?? d.created_at,
      kind: "Decision",
      title: d.title,
      detail: d.status,
      actor: d.decided_by ?? null,
    })),
    ...record.escalations.map((e: any) => ({
      key: `esc-${e.id}`,
      at: e.raised_at,
      kind: "Escalation",
      title: e.title,
      detail: `${e.severity} · ${e.status}`,
      actor: e.raised_by_name ?? null,
    })),
    ...record.approvals.map((a: any) => ({
      key: `apr-${a.id}`,
      at: a.decided_at ?? a.requested_at,
      kind: "Approval",
      title: a.title,
      detail: a.status,
      actor: a.approver_name ?? null,
    })),
  ].filter((e) => Boolean(e.at));

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, limit);
}

/** Live-data check: field_mappings.status values in use are currently null/unset. */
const MAPPING_COMPLETE = ["complete", "completed", "done", "mapped", "validated", "approved"];
const DECISION_OPEN = ["pending", "proposed", "open", "under_review"];
const APPROVAL_PENDING = ["pending", "requested", "in_review", "awaiting"];

/**
 * "What's needed next" for a technical solution, derived only from signals
 * actually present on the loaded record. Returns NEXT_ACTION_UNKNOWN otherwise.
 */
export function technicalSolutionNextAction(detail: {
  solution: { status: string; title?: string };
  field_mappings: any[];
  notes: any[];
  approvals: any[];
  decisions: any[];
}): string {
  const status = (detail.solution.status ?? "").toLowerCase();

  const incompleteRequired = detail.field_mappings.filter(
    (m: any) =>
      m.required === true && !MAPPING_COMPLETE.includes(String(m.status ?? "").toLowerCase()),
  );
  if (incompleteRequired.length) {
    return `Complete ${incompleteRequired.length} required field mapping(s), starting with ${
      incompleteRequired[0].source_field ?? incompleteRequired[0].target_field ?? "an unnamed field"
    }`;
  }

  const pendingApproval = detail.approvals.find((a: any) =>
    APPROVAL_PENDING.includes(String(a.status ?? "").toLowerCase()),
  );
  if (pendingApproval) {
    return `Approval is still pending — ${pendingApproval.title}${
      pendingApproval.approver_name ? ` (${pendingApproval.approver_name})` : ""
    }`;
  }

  if (
    ["in_review", "review", "build", "in_build", "in_progress"].includes(status) &&
    !detail.approvals.length
  ) {
    return `Status is ${humanize(status)} with no approval linked — request sign-off`;
  }

  if (!detail.notes.length && status !== "draft") {
    return `No journal entries recorded despite ${humanize(status)} status — capture assessment/design/build notes`;
  }

  const openDecision = detail.decisions.find((d: any) =>
    DECISION_OPEN.includes(String(d.status ?? "").toLowerCase()),
  );
  if (openDecision) return `Resolve the linked decision — ${openDecision.title}`;

  return NEXT_ACTION_UNKNOWN;
}

/* ---------------- WAITING ON (derived display only) ---------------- */

export type WaitingOnParty = "technical_solutions" | "customer" | "tis" | "none";
export type WaitingOn = { party: WaitingOnParty; reason: string };

/** Solution statuses that mean technical work is still outstanding. */
const SOLUTION_OPEN = ["draft", "in_review", "review", "in_progress", "in_build", "build"];

const isCustomerSide = (value: string | null | undefined) => {
  const v = (value ?? "").toLowerCase();
  return v.includes("customer") || v.includes("client");
};

export type WaitingOnInput = {
  technical_solutions?: any[];
  approvals?: any[];
  commitments?: any[];
  risks?: any[];
  issues?: any[];
  escalations?: any[];
  decisions?: any[];
};

/**
 * Single shared "who needs to act next" signal. Distinct from health/triage:
 * it answers dependency, not urgency. Derived only from records actually loaded.
 *
 * Precedence: pending customer approval → open technical solution →
 * overdue customer-facing commitment → open implementation-side work → none.
 */
export function waitingOn(input: WaitingOnInput): WaitingOn {
  const solutions = input.technical_solutions ?? [];
  const approvals = input.approvals ?? [];
  const commitments = (input.commitments ?? []).filter((c: any) =>
    isOpenFor("commitments", c.status),
  );
  const risks = (input.risks ?? []).filter((r: any) => isOpenFor("risks", r.status));
  const issues = (input.issues ?? []).filter((r: any) => isOpenFor("issues", r.status));
  const escalations = (input.escalations ?? []).filter((r: any) =>
    isOpenFor("escalations", r.status),
  );
  const decisions = (input.decisions ?? []).filter((d: any) =>
    DECISION_OPEN.includes(String(d.status ?? "").toLowerCase()),
  );

  // 1. Customer-side approval that has not been decided.
  const pendingApproval = approvals.find((a: any) =>
    APPROVAL_PENDING.includes(String(a.status ?? "").toLowerCase()),
  );
  if (pendingApproval) {
    const who = pendingApproval.approver_name ?? pendingApproval.approver_role ?? null;
    return {
      party: "customer",
      reason: `Waiting on the customer to approve ${pendingApproval.title}${
        who ? ` (${who})` : ""
      }`,
    };
  }

  // 2. Technical solution that must land before the implementation can move.
  for (const s of solutions) {
    const status = String(s.status ?? "").toLowerCase();
    const mappings: any[] = s.field_mappings ?? [];
    const incompleteRequired = mappings.filter(
      (m: any) =>
        m.required === true && !MAPPING_COMPLETE.includes(String(m.status ?? "").toLowerCase()),
    );
    if (incompleteRequired.length) {
      return {
        party: "technical_solutions",
        reason: `Waiting on Technical Solutions to finish ${incompleteRequired.length} required field mapping(s) for ${s.title}`,
      };
    }
    if (SOLUTION_OPEN.includes(status)) {
      return {
        party: "technical_solutions",
        reason: `Waiting on Technical Solutions to finish ${s.title} — still ${humanize(status)}`,
      };
    }
  }

  // 3. Customer-facing commitment already past due.
  const customerCommitment = commitments.find(
    (c: any) => isCustomerSide(c.committed_to) && isOverdue(c.due_date),
  );
  if (customerCommitment) {
    return {
      party: "customer",
      reason: `Waiting on the customer for a commitment past due ${fmtDate(customerCommitment.due_date)}: ${customerCommitment.description}`,
    };
  }

  // 4. Implementation-side (TIS) work that is open.
  const bySeverity = (rows: any[]) =>
    [...rows].sort((a, b) => severityRank(a.severity) - severityRank(b.severity))[0];
  const esc = bySeverity(escalations);
  if (esc) {
    return { party: "tis", reason: `Waiting on TIS to resolve the open escalation: ${esc.title}` };
  }
  const issue = bySeverity(issues);
  if (issue) {
    return {
      party: "tis",
      reason: `Waiting on TIS to resolve the open issue: ${issue.title}`,
    };
  }
  const risk = bySeverity(risks);
  if (risk) {
    return { party: "tis", reason: `Waiting on TIS to act on the open risk: ${risk.title}` };
  }
  const tisCommitment = commitments.find((c: any) => !isCustomerSide(c.committed_to));
  if (tisCommitment) {
    return {
      party: "tis",
      reason: `Waiting on TIS to close an open commitment: ${tisCommitment.description}`,
    };
  }
  if (decisions.length) {
    return {
      party: "tis",
      reason: `Waiting on TIS to resolve an open decision: ${decisions[0].title}`,
    };
  }

  return { party: "none", reason: "No current dependency." };
}

/** Customer 360 adapter — same logic, record-shaped input. */
export function waitingOnForCustomer(record: Customer360): WaitingOn {
  return waitingOn({
    technical_solutions: record.technical_solutions,
    approvals: record.approvals,
    commitments: record.commitments,
    risks: record.risks,
    issues: record.issues,
    escalations: record.escalations,
    decisions: record.decisions,
  });
}

/**
 * Technical Solution detail adapter — same logic, scoped to this solution.
 * Returns null unless the solution itself is the current dependency.
 */
export function waitingOnForSolution(detail: {
  solution: { title: string; status: string };
  field_mappings: any[];
  approvals: any[];
  decisions: any[];
}): WaitingOn | null {
  const result = waitingOn({
    technical_solutions: [{ ...detail.solution, field_mappings: detail.field_mappings }],
    approvals: detail.approvals,
    decisions: detail.decisions,
  });
  return result.party === "technical_solutions" ? result : null;
}

export const WAITING_ON_LABEL: Record<WaitingOnParty, string> = {
  technical_solutions: "Technical Solutions",
  customer: "Customer",
  tis: "TIS",
  none: "No current dependency",
};

/* ------------------------------------------------------------------ *
 * Prove Value — standalone derived state.
 * Independent of deriveHealth / whatMattersNow / nextAction / waitingOn.
 * ------------------------------------------------------------------ */

export type ProveValueState =
  "not_baselined" | "not_measured" | "measured_unconfirmed" | "customer_confirmed" | "not_met";

type ProveValueCriterion = { id: string; baseline_value?: string | null };
type ProveValueObservation = {
  success_criteria_id?: string | null;
  observed_at?: string | null;
  assessment?: string | null;
};
type ProveValueApproval = {
  approved_entity_type?: string | null;
  approved_entity_id?: string | null;
  status?: string | null;
};

/**
 * Precedence: no baseline → not_baselined; baseline but no observation →
 * not_measured; latest observation assessed not_met → not_met; approved
 * customer confirmation → customer_confirmed; else measured_unconfirmed.
 * "Latest" is by observed_at, never array order. Confirmation is only ever an
 * approval with status 'approved' — never inferred from evidence or free text.
 */
export function proveValueState(
  criterion: ProveValueCriterion,
  observations: ProveValueObservation[] = [],
  approvals: ProveValueApproval[] = [],
): ProveValueState {
  const baseline = (criterion.baseline_value ?? "").trim();
  if (!baseline) return "not_baselined";

  const mine = (observations ?? []).filter(
    (o) => !o.success_criteria_id || o.success_criteria_id === criterion.id,
  );
  if (!mine.length) return "not_measured";

  const latest = [...mine].sort(
    (a, b) => new Date(b.observed_at ?? 0).getTime() - new Date(a.observed_at ?? 0).getTime(),
  )[0];
  if ((latest?.assessment ?? "").toLowerCase() === "not_met") return "not_met";

  const confirmed = (approvals ?? []).some(
    (a) =>
      (a.status ?? "").toLowerCase() === "approved" &&
      (!a.approved_entity_type || a.approved_entity_type === "success_criterion") &&
      (!a.approved_entity_id || a.approved_entity_id === criterion.id),
  );
  if (confirmed) return "customer_confirmed";

  return "measured_unconfirmed";
}

export const PROVE_VALUE_LABEL: Record<ProveValueState, string> = {
  not_baselined: "No starting point recorded",
  not_measured: "Starting point recorded, not yet measured",
  measured_unconfirmed: "Measured, waiting on customer confirmation",
  customer_confirmed: "Customer-confirmed",
  not_met: "Target not met",
};

/* ---------------- PROVE VALUE: due_stage lateness ---------------- */

/**
 * When a criterion carries no due_stage, the operating model's implicit
 * expectations apply: baseline by Align Externally, first measurement by
 * Launch, customer confirmation by Graduate to CS.
 */
export const DEFAULT_PROVE_VALUE_DUE_STAGE: Record<ProveValueState, string | null> = {
  not_baselined: "align-external",
  not_measured: "launch",
  measured_unconfirmed: "graduate-to-cs",
  not_met: null,
  customer_confirmed: null,
};

/** Lower sorts first — worst gap wins. */
const PROVE_VALUE_GAP_RANK: Record<ProveValueState, number> = {
  not_met: 0,
  not_baselined: 1,
  not_measured: 2,
  measured_unconfirmed: 3,
  customer_confirmed: 9,
};

const PROVE_VALUE_GAP_NEED: Record<ProveValueState, string> = {
  not_baselined: "no starting point recorded",
  not_measured: "not measured yet",
  measured_unconfirmed: "waiting on customer confirmation",
  not_met: "latest observation says target not met",
  customer_confirmed: "confirmed",
};

export type ProveValueGap = {
  id: string;
  description: string;
  state: ProveValueState;
  /** The stage it should have been proven by (explicit due_stage, else implied). */
  due_stage: string | null;
  /** True when due_stage came from the record rather than the implied default. */
  explicit_due_stage: boolean;
  reason: string;
  rank: number;
};

type GapCriterion = ProveValueCriterion & {
  description?: string | null;
  due_stage?: string | null;
  observations?: ProveValueObservation[];
  confirmations?: ProveValueApproval[];
};

/**
 * Criteria that are late against their due stage, given where the
 * implementation actually is. Derived only — nothing is stored.
 */
export function proveValueGaps(
  criteria: GapCriterion[] | null | undefined,
  currentStage: string | null | undefined,
): ProveValueGap[] {
  const current = stageIndex(currentStage);
  if (current < 0) return [];

  const gaps: ProveValueGap[] = [];
  for (const c of criteria ?? []) {
    const state = proveValueState(c, c.observations ?? [], c.confirmations ?? []);
    if (state === "customer_confirmed") continue;

    const explicit = Boolean((c.due_stage ?? "").trim());
    const due = explicit ? c.due_stage! : DEFAULT_PROVE_VALUE_DUE_STAGE[state];
    const dueIdx = due ? stageIndex(due) : -1;
    const late = state === "not_met" || (dueIdx >= 0 && current >= dueIdx);
    if (!late) continue;

    const description = (c.description ?? "").trim() || "Untitled success criterion";
    const dueText = due ? ` — due by ${stageLabel(due)}${explicit ? "" : " (implied)"}` : "";
    gaps.push({
      id: c.id,
      description,
      state,
      due_stage: due ?? null,
      explicit_due_stage: explicit,
      reason: `${description}: ${PROVE_VALUE_GAP_NEED[state]}${dueText}`,
      rank: PROVE_VALUE_GAP_RANK[state],
    });
  }

  return gaps.sort((a, b) => a.rank - b.rank || a.description.localeCompare(b.description));
}

/** One-line summary for headers and the Home queue. Null when nothing is late. */
export function proveValueGapSummary(
  criteria: GapCriterion[] | null | undefined,
  currentStage: string | null | undefined,
): { count: number; reason: string } | null {
  const gaps = proveValueGaps(criteria, currentStage);
  if (!gaps.length) return null;
  const rest = gaps.length - 1;
  const top = gaps[0]!;
  return {
    count: gaps.length,
    reason: `${top.reason}${rest > 0 ? ` (+${rest} more late)` : ""}`,
  };
}

/* ---------------- ADOPTION (behavioural — never inferred from value) ---------------- */

/**
 * Adoption answers "are the intended users and workflows actually using the
 * solution, and are workarounds still happening?". It is derived only from
 * adoption observations — never from success criteria, milestones or health.
 */
export type AdoptionLevel = "not_started" | "progressing" | "established" | "at_risk" | "unknown";

export const ADOPTION_LEVEL_LABEL: Record<AdoptionLevel, string> = {
  not_started: "Not started",
  progressing: "Progressing",
  established: "Established",
  at_risk: "At risk",
  unknown: "Not observed",
};

type AdoptionObservationLike = {
  observed_at?: string | null;
  state?: string | null;
  workaround_in_use?: boolean | null;
  workaround_description?: string | null;
};

type AdoptionAreaLike = {
  id: string;
  kind?: string | null;
  name?: string | null;
  observations?: AdoptionObservationLike[] | null;
};

/** Worst-first: an at-risk area dominates the overall picture. */
const ADOPTION_RANK: Record<AdoptionLevel, number> = {
  at_risk: 0,
  not_started: 1,
  progressing: 2,
  established: 3,
  unknown: 4,
};

const asLevel = (value: string | null | undefined): AdoptionLevel =>
  value && value in ADOPTION_RANK ? (value as AdoptionLevel) : "unknown";

/** Latest observation for one area, by observed date. */
export function latestAdoptionObservation<T extends AdoptionObservationLike>(
  observations: T[] | null | undefined,
): T | null {
  return (
    [...(observations ?? [])].sort(
      (a, b) => new Date(b.observed_at ?? 0).getTime() - new Date(a.observed_at ?? 0).getTime(),
    )[0] ?? null
  );
}

/** State of a single adoption area, from its most recent observation only. */
export function adoptionAreaLevel(area: AdoptionAreaLike): AdoptionLevel {
  return asLevel(latestAdoptionObservation(area.observations)?.state);
}

export type AdoptionSummary = {
  level: AdoptionLevel;
  /** Areas whose latest observation still reports a workaround in use. */
  workarounds: Array<{ id: string; name: string; description: string | null }>;
  counts: Record<AdoptionLevel, number>;
  observed: number;
  total: number;
  reason: string;
};

/** One-line adoption picture for the Customer 360 header. */
export function adoptionSummary(
  areas: AdoptionAreaLike[] | null | undefined,
): AdoptionSummary | null {
  const rows = areas ?? [];
  if (!rows.length) return null;

  const counts: Record<AdoptionLevel, number> = {
    at_risk: 0,
    not_started: 0,
    progressing: 0,
    established: 0,
    unknown: 0,
  };
  const workarounds: AdoptionSummary["workarounds"] = [];
  let worst: AdoptionLevel = "established";

  for (const area of rows) {
    const level = adoptionAreaLevel(area);
    counts[level] += 1;
    if (ADOPTION_RANK[level] < ADOPTION_RANK[worst]) worst = level;
    const latest = latestAdoptionObservation(area.observations);
    if (latest?.workaround_in_use) {
      workarounds.push({
        id: area.id,
        name: (area.name ?? "").trim() || "Unnamed adoption area",
        description: latest.workaround_description ?? null,
      });
    }
  }

  const observed = rows.length - counts.unknown;
  // Nothing observed at all is honest "unknown", not "established".
  const level: AdoptionLevel = observed === 0 ? "unknown" : worst;

  const parts = [`${observed} of ${rows.length} area(s) observed`];
  if (counts.established) parts.push(`${counts.established} established`);
  if (counts.progressing) parts.push(`${counts.progressing} progressing`);
  if (counts.not_started) parts.push(`${counts.not_started} not started`);
  if (counts.at_risk) parts.push(`${counts.at_risk} at risk`);
  if (workarounds.length) parts.push(`${workarounds.length} with workarounds still in use`);

  return {
    level,
    workarounds,
    counts,
    observed,
    total: rows.length,
    reason: parts.join(" · "),
  };
}
