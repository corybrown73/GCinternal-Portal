import type { Customer360, ImplementationRow, TriageBundle } from "./hub-types";
import {
  deriveHealth,
  hasOtherOpenSignal,
  isCsStage,
  launchOverdue,
  nextAction,
  openItems,
  proveValueGapSummary,
  severityRank,
  whatMattersNow,
} from "./customer360-derive";
import { launchAcceptanceGate } from "./launch-gate";
import { nextLifecycleStage } from "./stage-advance-input";
import { normalizeStage } from "./hub-format";
import { STAGE_FLAG_DAYS, daysSince, fmtDate, fmtMoney, humanize, isOverdue, stageLabel } from "./hub-format";

export type TriageBucket = "act_now" | "needs_attention" | "moving";

export type QueueRow = {
  impl: ImplementationRow;
  bucket: TriageBucket;
  /** Plain-language driving signal. */
  reason: string;
  /** What's at stake, from real fields only. */
  impact: string;
  next_action: string;
  /** Deep-link target tab on Customer 360. */
  tab: "overview" | "journey" | "risks" | "requirements" | "solution" | "evidence" | "history";
  /** Lower sorts first within a section. */
  rank: number;
};

const DAY = 86_400_000;

const daysUntil = (date: string | null | undefined) =>
  date ? Math.ceil((new Date(date).getTime() - Date.now()) / DAY) : null;

/** Build the Customer360-shaped subset the existing derivations consume. */
function asRecord(bundle: TriageBundle | undefined): Customer360 {
  return {
    commitments: bundle?.commitments ?? [],
    risks: bundle?.risks ?? [],
    issues: bundle?.issues ?? [],
    escalations: bundle?.escalations ?? [],
    decisions: bundle?.decisions ?? [],
    milestones: bundle?.milestones ?? [],
    stage_history: [],
    approvals: [],
  } as unknown as Customer360;
}

/**
 * Derived health per implementation id, using the single deriveHealth source of truth.
 * Shared by Home and the Customers list so both agree with Customer 360.
 */
export function healthByImplementation(
  implementations: ImplementationRow[],
  triage: TriageBundle[],
): Map<string, ReturnType<typeof deriveHealth>> {
  const byImpl = new Map(triage.map((t) => [t.implementation_id, t]));
  return new Map(
    implementations.map((impl) => [impl.id, deriveHealth(asRecord(byImpl.get(impl.id)), impl)]),
  );
}

const milestoneMissed = (m: any) =>
  !m.completed_date &&
  (["missed", "overdue", "blocked"].includes((m.status ?? "").toLowerCase()) ||
    (m.target_date != null && isOverdue(m.target_date) && m.status !== "completed"));

/** One triaged row per implementation, reusing customer360-derive signal logic. */
export function triageRow(impl: ImplementationRow, bundle: TriageBundle | undefined): QueueRow {
  const record = asRecord(bundle);
  const open = openItems(record);
  const stalledDays = daysSince(impl.stage_entered_at) ?? 0;

  const bySeverity = (rows: any[]) =>
    [...rows].sort((a, b) => severityRank(a.severity) - severityRank(b.severity))[0];

  const topEscalation = bySeverity(open.escalations);
  const topRisk = bySeverity(open.risks);
  const topIssue = bySeverity(open.issues);
  const overdueCommitment = open.commitments
    .filter((c: any) => isOverdue(c.due_date))
    .sort((a: any, b: any) => String(a.due_date).localeCompare(String(b.due_date)))[0];
  const soonCommitment = open.commitments
    .filter((c: any) => {
      const d = daysUntil(c.due_date);
      return d != null && d >= 0 && d <= 7;
    })
    .sort((a: any, b: any) => String(a.due_date).localeCompare(String(b.due_date)))[0];
  const missedMilestone = (bundle?.milestones ?? []).filter(milestoneMissed)[0];
  const atRiskMilestone = (bundle?.milestones ?? []).find(
    (m: any) => (m.status ?? "").toLowerCase() === "at_risk",
  );

  const severeEscalation =
    topEscalation && severityRank(topEscalation.severity) <= 1 ? topEscalation : null;
  const criticalRisk = topRisk && severityRank(topRisk.severity) === 0 ? topRisk : null;
  const highSignalPresent =
    Boolean(severeEscalation) || (topRisk != null && severityRank(topRisk.severity) <= 1);
  const customerFacingOverdue =
    overdueCommitment &&
    (String(overdueCommitment.committed_to ?? "").toLowerCase().includes("customer") ||
      highSignalPresent)
      ? overdueCommitment
      : null;
  const launchSlipped = launchOverdue(impl);

  // ---------- ACT NOW ----------
  if (severeEscalation) {
    return row(impl, "act_now", severityRank(severeEscalation.severity), "risks", {
      reason: `${humanize(severeEscalation.severity)} escalation: ${severeEscalation.title}`,
      impact: impactLine(impl, `escalation open ${daysSince(severeEscalation.raised_at) ?? 0}d`),
      record,
    });
  }
  if (impl.status === "blocked") {
    return row(impl, "act_now", 0.5, "overview", {
      reason: `Blocked in ${stageLabel(impl.current_stage)} — ${whatMattersNow(record)}`,
      impact: impactLine(impl, `${stalledDays}d in stage`),
      record,
    });
  }
  if (criticalRisk) {
    return row(impl, "act_now", 0.8, "risks", {
      reason: `Critical risk: ${criticalRisk.title} (${criticalRisk.likelihood ?? "unknown"} likelihood)`,
      impact: impactLine(impl, criticalRisk.impact ?? `owner ${criticalRisk.owner_name ?? "unassigned"}`),
      record,
    });
  }
  if (customerFacingOverdue) {
    return row(impl, "act_now", 1.5, "overview", {
      reason: `Commitment overdue${
        String(customerFacingOverdue.committed_to ?? "").toLowerCase().includes("customer")
          ? " to customer"
          : " alongside a high-severity signal"
      }: ${customerFacingOverdue.description} (due ${fmtDate(customerFacingOverdue.due_date)})`,
      impact: impactLine(
        impl,
        `promised to ${customerFacingOverdue.committed_to ?? "unspecified"}${
          customerFacingOverdue.owner_name ? ` · ${customerFacingOverdue.owner_name}` : ""
        }`,
      ),
      record,
    });
  }
  if (launchSlipped) {
    return row(impl, "act_now", 2, "journey", {
      reason: `Target launch passed ${fmtDate(impl.target_launch_date)} — not launched (${Math.abs(
        daysUntil(impl.target_launch_date) ?? 0,
      )}d over)`,
      impact: impactLine(impl, "launch date slipped, no actual launch recorded"),
      record,
    });
  }

  // ---------- NEEDS ATTENTION ----------
  const midRisk = topRisk && severityRank(topRisk.severity) <= 2 ? topRisk : null;
  const midIssue = topIssue && severityRank(topIssue.severity) <= 2 ? topIssue : null;
  const stalled = stalledDays > STAGE_FLAG_DAYS;
  const csStalled = stalled && isCsStage(impl.current_stage);
  const stalledCounts = stalled && (!csStalled || hasOtherOpenSignal(record));

  if (midRisk) {
    return row(impl, "needs_attention", 2 + severityRank(midRisk.severity) / 10, "risks", {
      reason: `Open risk (${midRisk.severity}/${midRisk.likelihood ?? "unknown"} likelihood): ${midRisk.title}`,
      impact: impactLine(impl, midRisk.impact ?? `owner ${midRisk.owner_name ?? "unassigned"}`),
      record,
    });
  }
  if (midIssue) {
    return row(impl, "needs_attention", 2.4 + severityRank(midIssue.severity) / 10, "risks", {
      reason: `Open issue (${midIssue.severity}): ${midIssue.title}`,
      impact: impactLine(impl, `owner ${midIssue.owner_name ?? "unassigned"}`),
      record,
    });
  }
  if (overdueCommitment) {
    return row(impl, "needs_attention", 2.7, "overview", {
      reason: `Internal commitment overdue: ${overdueCommitment.description} (due ${fmtDate(
        overdueCommitment.due_date,
      )})`,
      impact: impactLine(
        impl,
        `owed to ${overdueCommitment.committed_to ?? "unspecified"}${
          overdueCommitment.owner_name ? ` · ${overdueCommitment.owner_name}` : ""
        }`,
      ),
      record,
    });
  }
  if (stalledCounts) {
    return row(impl, "needs_attention", 3, "journey", {
      reason: csStalled
        ? `In CS stage ${stalledDays}d — review if still needs implementation-side attention`
        : `Stalled ${stalledDays} days in ${stageLabel(impl.current_stage)}`,
      impact: impactLine(impl, `threshold ${STAGE_FLAG_DAYS}d`),
      record,
    });
  }
  if (missedMilestone) {
    return row(impl, "needs_attention", 3.1, "journey", {
      reason: `Milestone missed: ${missedMilestone.name}${
        missedMilestone.target_date ? ` (target ${fmtDate(missedMilestone.target_date)})` : ""
      }`,
      impact: impactLine(impl, `stage ${stageLabel(missedMilestone.stage ?? impl.current_stage)}`),
      record,
    });
  }
  if (soonCommitment) {
    return row(impl, "needs_attention", 3.2, "overview", {
      reason: `Commitment due in ${daysUntil(soonCommitment.due_date)}d: ${soonCommitment.description}`,
      impact: impactLine(impl, `due ${fmtDate(soonCommitment.due_date)}`),
      record,
    });
  }
  if (atRiskMilestone) {
    return row(impl, "needs_attention", 3.4, "journey", {
      reason: `Milestone at risk: ${atRiskMilestone.name}`,
      impact: impactLine(
        impl,
        atRiskMilestone.target_date ? `target ${fmtDate(atRiskMilestone.target_date)}` : "no target date",
      ),
      record,
    });
  }
  const valueGap = proveValueGapSummary(bundle?.success_criteria, impl.current_stage);
  if (valueGap) {
    return row(impl, "needs_attention", 3.5, "overview", {
      reason: `Value proof late — ${valueGap.reason}`,
      impact: impactLine(
        impl,
        `${valueGap.count} success criteri${valueGap.count > 1 ? "a" : "on"} unproven in ${stageLabel(
          impl.current_stage,
        )}`,
      ),
      record,
    });
  }
  // Solution acceptance is the only thing standing between this implementation
  // and Launch — surfaced here so the blocker is visible before someone tries.
  const acceptanceGate = launchAcceptanceGate({
    toStage: nextLifecycleStage(normalizeStage(impl.current_stage)),
    solutions: bundle?.technical_solutions ?? [],
    approvals: bundle?.approvals ?? [],
  });
  if (acceptanceGate.blocked) {
    return row(impl, "needs_attention", 3.55, "solution", {
      reason: `Solution acceptance is preventing the move to Launch — ${acceptanceGate.reason}`,
      impact: impactLine(impl, `${stalledDays}d in ${stageLabel(impl.current_stage)}`),
      record,
      next: acceptanceGate.outstanding[0] ?? "Record solution acceptance before moving to Launch",
    });
  }
  if (impl.status === "at_risk") {
    return row(impl, "needs_attention", 3.6, "overview", {
      reason: `Flagged at risk — ${whatMattersNow(record)}`,
      impact: impactLine(impl, `${stalledDays}d in ${stageLabel(impl.current_stage)}`),
      record,
    });
  }

  // ---------- MOVING ----------
  return row(impl, "moving", 4, "overview", {
    reason:
      impl.status === "idle"
        ? `Idle in ${stageLabel(impl.current_stage)} — nothing open against it`
        : `On track in ${stageLabel(impl.current_stage)} — nothing open against it`,
    impact: impactLine(impl, `${stalledDays}d in stage`),
    record,
  });
}

function impactLine(impl: ImplementationRow, extra: string | null) {
  const parts = [
    impl.arr != null ? `${fmtMoney(impl.arr)} ARR` : null,
    impl.tier ?? impl.segment ?? null,
    impl.target_launch_date ? `launch ${fmtDate(impl.target_launch_date)}` : null,
    extra,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No commercial context recorded.";
}

function row(
  impl: ImplementationRow,
  bucket: TriageBucket,
  rank: number,
  tab: QueueRow["tab"],
  parts: { reason: string; impact: string; record: Customer360; next?: string },
): QueueRow {
  return {
    impl,
    bucket,
    rank,
    tab,
    reason: parts.reason,
    impact: parts.impact,
    next_action: parts.next ?? nextAction(parts.record, impl),
  };
}

export function buildQueue(
  implementations: ImplementationRow[],
  triage: TriageBundle[],
): Record<TriageBucket, QueueRow[]> {
  const byImpl = new Map(triage.map((t) => [t.implementation_id, t]));
  const rows = implementations
    .map((i) => triageRow(i, byImpl.get(i.id)))
    .sort((a, b) => a.rank - b.rank || a.impl.customer_name.localeCompare(b.impl.customer_name));

  return {
    act_now: rows.filter((r) => r.bucket === "act_now"),
    needs_attention: rows.filter((r) => r.bucket === "needs_attention"),
    moving: rows.filter((r) => r.bucket === "moving"),
  };
}
