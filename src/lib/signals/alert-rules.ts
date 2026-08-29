/**
 * The two new alert kinds, as pure evaluators.
 *
 * The governing rule for both: **an alert that cries wolf is worse than no
 * alert.** Neither fires on an absence. Each requires a positive, dated, NAMED
 * stored fact, and each returns that fact as evidence — never a level alone.
 *
 * Both are evaluated here and emitted by `signals.server.ts`, so the metrics
 * surface can show exactly what would fire while the flag is still off.
 *
 * Pure: no I/O.
 */
import { launchAcceptanceGate } from "../launch-gate";
import { LAUNCH_STAGE } from "../launch-gate";
import { fmtDate, normalizeStage, stageLabel } from "../hub-format";
import type { WaitingOn } from "../customer360-derive";
import type { LifecycleStageId } from "../lifecycle";
import { DAY_MS } from "./stage-history";
import { stagesBetween } from "./velocity";
import type { EngagementSignal } from "./engagement";
import { refutesSilence } from "./engagement";

/** A customer-side ask must be unanswered this long before it is "gone quiet". */
export const CHAMPION_QUIET_DAYS = 21;
/** How near a launch has to be before a named blocker makes it "at risk". */
export const LAUNCH_AT_RISK_HORIZON_DAYS = 30;

export type SignalAlertKind = "champion_gone_quiet" | "launch_date_at_risk";

export const SIGNAL_ALERT_LABEL: Record<SignalAlertKind, string> = {
  champion_gone_quiet: "Champion gone quiet",
  launch_date_at_risk: "Launch date at risk",
};

/** One named fact. A finding always carries at least one. */
export type EvidenceItem = {
  /** Which stored record this came from, e.g. "approvals" or "escalations". */
  source: string;
  id: string | null;
  fact: string;
  at: string | null;
};

/** Alert payloads are stored as jsonb and cross a serialization boundary. */
export type AlertPayloadValue = string | number | boolean | null | string[];

export type AlertFinding = {
  kind: SignalAlertKind;
  implementation_id: string;
  customer_id: string | null;
  severity: "warning";
  title: string;
  detail: string;
  evidence: EvidenceItem[];
  /** Everything needed to re-derive the finding from the row alone. */
  payload: Record<string, AlertPayloadValue>;
};

/** A finding that was considered and refused, with the reason. Rendered, not hidden. */
export type AlertWithheld = {
  kind: SignalAlertKind;
  implementation_id: string;
  reason: string;
};

export type AlertEvaluation = {
  findings: AlertFinding[];
  withheld: AlertWithheld[];
};

type ImplLike = {
  id: string;
  name?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  current_stage?: string | null;
  target_launch_date?: string | null;
  actual_launch_date?: string | null;
};

type ApprovalLike = {
  id?: string | null;
  title?: string | null;
  status?: string | null;
  requested_at?: string | null;
  decided_at?: string | null;
  approver_name?: string | null;
  approver_role?: string | null;
  approved_entity_type?: string | null;
  approved_entity_id?: string | null;
};

type CommitmentLike = {
  id?: string | null;
  description?: string | null;
  status?: string | null;
  due_date?: string | null;
  committed_to?: string | null;
  owner_name?: string | null;
};

type EscalationLike = {
  id?: string | null;
  title?: string | null;
  severity?: string | null;
  status?: string | null;
  raised_at?: string | null;
};

const OPEN_APPROVAL = ["pending", "requested", "awaiting", "in_review"];
const CLOSED = [
  "resolved",
  "closed",
  "fulfilled",
  "cancelled",
  "mitigated",
  "accepted",
  "done",
  "complete",
  "completed",
];
const isOpenStatus = (value: string | null | undefined) =>
  !CLOSED.includes(String(value ?? "").toLowerCase());
const isCustomerSide = (value: string | null | undefined) => {
  const v = String(value ?? "").toLowerCase();
  return v.includes("customer") || v.includes("client");
};

const daysOld = (iso: string | null | undefined, now: Date): number | null => {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor((now.getTime() - ms) / DAY_MS);
};

const accountLabel = (impl: ImplLike) =>
  impl.customer_name?.trim() || impl.name?.trim() || "This implementation";

/* ------------------------------------------------------------------ */
/* champion_gone_quiet                                                 */
/* ------------------------------------------------------------------ */

export type ChampionInput = {
  impl: ImplLike;
  /** The already-derived dependency. Condition 2 is that it points at the customer. */
  dependency: WaitingOn;
  approvals: ApprovalLike[];
  commitments: CommitmentLike[];
  /** Phase 4 telemetry, if the table exists. Refutes only; never originates. */
  engagement?: EngagementSignal | undefined;
};

/**
 * Silence is not observable. An unanswered question is.
 *
 * Fires only when: the implementation is live, the dependency is on the
 * customer, a NAMED customer-side ask has gone unanswered for
 * CHAMPION_QUIET_DAYS, and telemetry does not positively contradict it.
 */
export function championGoneQuiet(input: ChampionInput, now: Date = new Date()): AlertEvaluation {
  const { impl, dependency } = input;
  const withheld: AlertWithheld[] = [];
  const stage = normalizeStage(impl.current_stage);

  // Condition 1: the implementation is still live.
  if (stage === "graduate-to-cs") {
    return { findings: [], withheld };
  }
  if (dependency.party !== "customer") {
    return { findings: [], withheld };
  }

  // Condition 3: a dated, unanswered, customer-side ask past the window.
  const staleApproval = input.approvals
    .filter(
      (a) =>
        !a.decided_at &&
        OPEN_APPROVAL.includes(String(a.status ?? "").toLowerCase()) &&
        (daysOld(a.requested_at, now) ?? -1) >= CHAMPION_QUIET_DAYS,
    )
    .sort((a, b) => String(a.requested_at).localeCompare(String(b.requested_at)))[0];

  const staleCommitment = input.commitments
    .filter(
      (c) =>
        isOpenStatus(c.status) &&
        isCustomerSide(c.committed_to) &&
        (daysOld(c.due_date, now) ?? -1) >= CHAMPION_QUIET_DAYS,
    )
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0];

  if (!staleApproval && !staleCommitment) {
    return { findings: [], withheld };
  }

  // Condition 4: somebody must be named, or this is a data-quality problem
  // rather than a champion problem, and the alert would be unactionable.
  const approvalName = staleApproval
    ? ((staleApproval.approver_name?.trim() || staleApproval.approver_role?.trim()) ?? null)
    : null;
  const commitmentName = staleCommitment ? (staleCommitment.committed_to?.trim() ?? null) : null;
  const champion = approvalName || commitmentName;
  if (!champion) {
    withheld.push({
      kind: "champion_gone_quiet",
      implementation_id: impl.id,
      reason:
        "A customer-side ask is past the quiet window, but nobody is named on it — that is a data-quality gap, not a champion who went quiet.",
    });
    return { findings: [], withheld };
  }

  const askedAt = staleApproval?.requested_at ?? staleCommitment?.due_date ?? null;
  const evidence: EvidenceItem[] = [];
  if (staleApproval) {
    evidence.push({
      source: "approvals",
      id: staleApproval.id ?? null,
      fact: `Approval "${staleApproval.title ?? "untitled"}" requested ${fmtDate(staleApproval.requested_at)} with ${approvalName ?? "nobody"} named, still undecided after ${daysOld(staleApproval.requested_at, now)}d.`,
      at: staleApproval.requested_at ?? null,
    });
  }
  if (staleCommitment) {
    evidence.push({
      source: "commitments",
      id: staleCommitment.id ?? null,
      fact: `Commitment "${staleCommitment.description ?? "untitled"}" owed by ${commitmentName ?? "the customer"} was due ${fmtDate(staleCommitment.due_date)}, ${daysOld(staleCommitment.due_date, now)}d ago and still open.`,
      at: staleCommitment.due_date ?? null,
    });
  }
  evidence.push({
    source: "waiting_on",
    id: null,
    fact: dependency.reason,
    at: dependency.since ?? null,
  });

  // Telemetry may REFUTE. Absence of telemetry refutes nothing.
  if (input.engagement && askedAt) {
    const refutation = refutesSilence(input.engagement, askedAt);
    if (refutation.refuted) {
      withheld.push({
        kind: "champion_gone_quiet",
        implementation_id: impl.id,
        reason: refutation.reason ?? "Portal telemetry shows the customer acted after the ask.",
      });
      return { findings: [], withheld };
    }
    evidence.push({
      source: "external_plan_events",
      id: null,
      fact: input.engagement.reason,
      at: null,
    });
  } else {
    evidence.push({
      source: "external_plan_events",
      id: null,
      fact: "Engagement telemetry was not consulted for this finding — it neither supports nor contradicts it.",
      at: null,
    });
  }

  const days = daysOld(askedAt, now) ?? CHAMPION_QUIET_DAYS;
  const finding: AlertFinding = {
    kind: "champion_gone_quiet",
    implementation_id: impl.id,
    customer_id: impl.customer_id ?? null,
    severity: "warning",
    title: `Champion gone quiet: ${accountLabel(impl)} — ${champion}, ${days}d`,
    detail: [
      `${accountLabel(impl)} has been waiting on the customer for ${days} days.`,
      ...evidence.map((e) => `• ${e.fact}`),
    ].join("\n"),
    evidence,
    payload: {
      rule: "champion_gone_quiet",
      champion,
      quiet_days: days,
      quiet_window_days: CHAMPION_QUIET_DAYS,
      asked_at: askedAt,
      approval_id: staleApproval?.id ?? null,
      commitment_id: staleCommitment?.id ?? null,
      waiting_on_party: dependency.party,
      engagement_available: input.engagement?.available ?? false,
    },
  };
  return { findings: [finding], withheld };
}

/* ------------------------------------------------------------------ */
/* launch_date_at_risk                                                 */
/* ------------------------------------------------------------------ */

export type LaunchRiskInput = {
  impl: ImplLike;
  solutions: Array<{ id: string; title?: string | null }>;
  approvals: ApprovalLike[];
  escalations: EscalationLike[];
  /** Template target days per lifecycle stage for THIS implementation. */
  stageTargets: ReadonlyMap<LifecycleStageId, number>;
};

/**
 * Fires BEFORE the date passes (`launch_overdue` already covers after), and
 * only with a named blocker. Firing on proximity alone would alert on every
 * healthy project with a launch next month, hourly, until nobody read /alerts.
 */
export function launchDateAtRisk(input: LaunchRiskInput, now: Date = new Date()): AlertEvaluation {
  const { impl } = input;
  const withheld: AlertWithheld[] = [];
  if (!impl.target_launch_date || impl.actual_launch_date) return { findings: [], withheld };

  const target = new Date(impl.target_launch_date).getTime();
  if (Number.isNaN(target)) return { findings: [], withheld };
  const daysRemaining = Math.ceil((target - now.getTime()) / DAY_MS);
  // Already past is launch_overdue's job, not this one.
  if (daysRemaining < 0 || daysRemaining > LAUNCH_AT_RISK_HORIZON_DAYS) {
    return { findings: [], withheld };
  }

  const stage = normalizeStage(impl.current_stage);
  if (stage === LAUNCH_STAGE || stage === "adopt" || stage === "graduate-to-cs") {
    return { findings: [], withheld };
  }

  const evidence: EvidenceItem[] = [];

  // Blocker A — the server-enforced gate. Not an opinion: advanceStage refuses.
  const gate = launchAcceptanceGate({
    toStage: LAUNCH_STAGE,
    solutions: input.solutions,
    approvals: input.approvals,
  });
  if (gate.blocked) {
    evidence.push({
      source: "launch_gate",
      id: null,
      fact: `The Launch gate is blocked and is enforced on the server: ${gate.reason ?? ""} ${gate.outstanding.join(" ")}`.trim(),
      at: null,
    });
  }

  // Blocker B — the remaining plan does not fit, using targets only.
  // Stages strictly AFTER the current one: the stage in flight has already
  // consumed an unknown part of its own target, and counting it in full would
  // overstate. Understating is the right direction for an alert.
  const remaining = stagesBetween(impl.current_stage, LAUNCH_STAGE);
  const targets = remaining.map((s) => input.stageTargets.get(s) ?? null);
  const everyStageHasTarget = remaining.length > 0 && targets.every((t) => t != null);
  if (everyStageHasTarget) {
    const needed = targets.reduce<number>((sum, t) => sum + (t ?? 0), 0);
    if (needed > daysRemaining) {
      evidence.push({
        source: "stage_targets",
        id: null,
        fact: `The ${remaining.length} stage(s) still to come after ${stageLabel(impl.current_stage)} carry ${needed}d of target duration, and only ${daysRemaining}d remain before ${fmtDate(impl.target_launch_date)}.`,
        at: null,
      });
    }
  }

  // Blocker C — an open severe escalation.
  const severeEscalation = input.escalations.find(
    (e) =>
      isOpenStatus(e.status) &&
      ["critical", "high"].includes(String(e.severity ?? "").toLowerCase()),
  );
  if (severeEscalation) {
    evidence.push({
      source: "escalations",
      id: severeEscalation.id ?? null,
      fact: `Open ${String(severeEscalation.severity).toLowerCase()} escalation: ${severeEscalation.title ?? "untitled"} (raised ${fmtDate(severeEscalation.raised_at)}).`,
      at: severeEscalation.raised_at ?? null,
    });
  }

  if (evidence.length === 0) {
    withheld.push({
      kind: "launch_date_at_risk",
      implementation_id: impl.id,
      reason: `Launch is ${daysRemaining}d away, but nothing names a blocker — proximity alone is not a risk.`,
    });
    return { findings: [], withheld };
  }

  const finding: AlertFinding = {
    kind: "launch_date_at_risk",
    implementation_id: impl.id,
    customer_id: impl.customer_id ?? null,
    severity: "warning",
    title: `Launch at risk: ${accountLabel(impl)} — ${fmtDate(impl.target_launch_date)}, ${daysRemaining}d away`,
    detail: [
      `Target launch ${fmtDate(impl.target_launch_date)} is ${daysRemaining} day(s) away, in ${stageLabel(impl.current_stage)}, with ${evidence.length} named blocker(s):`,
      ...evidence.map((e) => `• ${e.fact}`),
    ].join("\n"),
    evidence,
    payload: {
      rule: "launch_date_at_risk",
      days_remaining: daysRemaining,
      horizon_days: LAUNCH_AT_RISK_HORIZON_DAYS,
      target_launch_date: impl.target_launch_date,
      current_stage: stage,
      blockers: evidence.map((e) => e.source),
    },
  };
  return { findings: [finding], withheld };
}
