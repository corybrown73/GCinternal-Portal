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
  waitingOn,
  whatMattersNow,
  type WaitingOn,
} from "./customer360-derive";
import { launchAcceptanceGate } from "./launch-gate";
import { nextLifecycleStage } from "./stage-advance-input";
import { normalizeStage } from "./hub-format";
import { dealStageLabel } from "./deal-stage";
import { healthFloor, needsAction, type DealFacts } from "./needs-action";
import { daysUntilDate } from "./dates";
import {
  STAGE_FLAG_DAYS,
  daysSince,
  fmtDate,
  fmtMoney,
  humanize,
  isOverdue,
  stageLabel,
} from "./hub-format";

export type TriageBucket = "act_now" | "needs_attention" | "moving";

export type QueueRow = {
  impl: ImplementationRow;
  bucket: TriageBucket;
  /** Plain-language driving signal. */
  reason: string;
  /** What's at stake, from real fields only. */
  impact: string;
  next_action: string;
  /**
   * Phase 6: who owes the next move, and since when. Carried on every queue row
   * so Home, the Customers list and Leadership all read one derivation instead
   * of three that can disagree.
   */
  dependency: WaitingOn;
  /** Deep-link target tab on Customer 360. */
  tab: "overview" | "journey" | "risks" | "requirements" | "solution" | "evidence" | "history";
  /** Lower sorts first within a section. */
  rank: number;
  /** The deal's own facts (plan calls, close and live dates), when the row has a deal. */
  facts: DealFacts | null;
};

const DAY = 86_400_000;

// Was a local `Math.ceil` against Date.now(). target_launch_date is a Postgres
// `date`, so it is a calendar date and belongs in the shared helper — which is
// also what stops this file and leadership.ts drifting apart again.
const daysUntil = (date: string | null | undefined) => daysUntilDate(date);

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
    implementations.map((impl) => {
      const bundle = byImpl.get(impl.id);
      const derived = deriveHealth(asRecord(bundle), impl);
      // The deal's own trouble — a missed SOW date, a call nobody ticked —
      // is never "on track", whatever the logged risks say.
      const reasons = needsAction(bundle?.deal);
      const floor = healthFloor(reasons);
      if (floor && (derived.level === "on_track" || derived.level === "no_signal")) {
        return [impl.id, { ...derived, level: floor, reason: reasons[0]!.reason }];
      }
      return [impl.id, derived];
    }),
  );
}

const milestoneMissed = (m: any) =>
  !m.completed_date &&
  (["missed", "overdue", "blocked"].includes((m.status ?? "").toLowerCase()) ||
    (m.target_date != null && isOverdue(m.target_date) && m.status !== "completed"));

/**
 * One triaged row per implementation: the logged signals (risks, issues,
 * escalations, commitments, milestones) and the deal's own facts (watch-out
 * conflicts, overdue plan calls, no owner, stuck, missing SOW or brief)
 * compete, and the most urgent wins. A row with nothing at all says what
 * comes next — never "on track", which nobody here has checked.
 */
export function triageRow(impl: ImplementationRow, bundle: TriageBundle | undefined): QueueRow {
  const record = asRecord(bundle);
  const stalledDays = daysSince(impl.stage_entered_at) ?? 0;
  const fromSignals = signalRow(impl, bundle);
  const reasons = needsAction(bundle?.deal);
  const top = reasons[0];
  const fromDeal = top
    ? row(impl, top.bucket, top.rank, top.tab, {
        reason: top.reason,
        impact: impactLine(impl, top.impact),
        record,
        bundle,
        ...(top.next ? { next: top.next } : {}),
      })
    : null;
  if (fromSignals && fromDeal) return fromSignals.rank <= fromDeal.rank ? fromSignals : fromDeal;
  if (fromSignals) return fromSignals;
  if (fromDeal) return fromDeal;

  // ---------- MOVING ----------
  const next = bundle?.deal?.next_step ?? null;
  return row(impl, "moving", 4, "overview", {
    reason: next
      ? `Nothing open · next: ${next}`
      : `Nothing open against it in ${dealStageLabel(impl.deal_stage)}`,
    impact: impactLine(impl, `${stalledDays}d in stage`),
    record,
    bundle,
    ...(next ? { next } : {}),
  });
}

/**
 * The same triage Home runs, for one implementation already loaded on its
 * own Customer 360 page — so the two surfaces can never disagree about
 * what's exceptional here. Pure, viewer-agnostic, exactly like `triageRow`
 * itself: no login, role or "current user" enters this function.
 *
 * The one thing Home has that a single Customer 360 load doesn't: `DealFacts`
 * (the presale checklist/watch-out layer), which needs its own query this
 * page does not run today. Its absence only changes the *pre-kickoff*
 * fallback reason; every signal-based branch — risks, issues, escalations,
 * commitments, milestones, the launch date, the solution-acceptance gate —
 * reads the exact same way either side.
 */
export function triageRowForCustomer360(record: Customer360): QueueRow | null {
  const impl = record.implementation;
  if (!impl) return null;

  const implRow: ImplementationRow = {
    id: impl.id,
    name: impl.name,
    customer_id: record.customer.id,
    customer_name: record.customer.name,
    segment: record.customer.segment,
    industry: record.customer.industry,
    arr: impl.deal_arr ?? record.customer.arr,
    current_stage: impl.current_stage,
    deal_stage: impl.deal_stage,
    deal_id: impl.deal_id,
    stage_entered_at: impl.stage_entered_at,
    status: impl.status,
    health_recorded: impl.health_recorded,
    health_recorded_reason: impl.health_recorded_reason,
    owner_name: impl.owner_name,
    tier: impl.tier,
    target_launch_date: impl.target_launch_date,
    actual_launch_date: impl.actual_launch_date,
    overdue_commitments: (record.commitments ?? []).filter(
      (c: any) => c.due_date && isOverdue(c.due_date),
    ).length,
    open_escalations: (record.escalations ?? []).filter(
      (e: any) => (e.status ?? "").toLowerCase() !== "resolved",
    ).length,
  };

  const bundle: TriageBundle = {
    implementation_id: impl.id,
    commitments: record.commitments ?? [],
    risks: record.risks ?? [],
    issues: record.issues ?? [],
    escalations: record.escalations ?? [],
    milestones: record.milestones ?? [],
    decisions: record.decisions ?? [],
    success_criteria: record.success_criteria ?? [],
    technical_solutions: record.technical_solutions ?? [],
    approvals: record.approvals ?? [],
    adoption: record.adoption ?? [],
    deal: null,
  };

  return triageRow(implRow, bundle);
}

/** The row the logged signals call for, or null when none of them fires. */
function signalRow(impl: ImplementationRow, bundle: TriageBundle | undefined): QueueRow | null {
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
    (String(overdueCommitment.committed_to ?? "")
      .toLowerCase()
      .includes("customer") ||
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
      bundle,
      // Without this, next_action fell through to nextAction(), which never
      // reads escalations — "Next action not recorded" next to a live
      // escalation. Same signal driving `reason` now drives `next` too.
      next: `Resolve the escalation — ${severeEscalation.title}`,
    });
  }
  if (impl.status === "blocked") {
    return row(impl, "act_now", 0.5, "overview", {
      reason: `Blocked in ${dealStageLabel(impl.deal_stage)} — ${whatMattersNow(record)}`,
      impact: impactLine(impl, `${stalledDays}d in stage`),
      record,
      bundle,
      next: `Resolve it — ${whatMattersNow(record)}`,
    });
  }
  if (criticalRisk) {
    return row(impl, "act_now", 0.8, "risks", {
      reason: `Critical risk: ${criticalRisk.title} (${criticalRisk.likelihood ?? "unknown"} likelihood)`,
      impact: impactLine(
        impl,
        criticalRisk.impact ?? `owner ${criticalRisk.owner_name ?? "unassigned"}`,
      ),
      record,
      bundle,
      next: `Mitigate the critical risk — ${criticalRisk.title}`,
    });
  }
  if (customerFacingOverdue) {
    return row(impl, "act_now", 1.5, "overview", {
      reason: `Commitment overdue${
        String(customerFacingOverdue.committed_to ?? "")
          .toLowerCase()
          .includes("customer")
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
      bundle,
    });
  }
  if (launchSlipped) {
    return row(impl, "act_now", 2, "journey", {
      reason: `Target launch passed ${fmtDate(impl.target_launch_date)} — not launched (${Math.abs(
        daysUntil(impl.target_launch_date) ?? 0,
      )}d over)`,
      impact: impactLine(impl, "launch date slipped, no actual launch recorded"),
      record,
      bundle,
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
      bundle,
      next: `Address the risk — ${midRisk.title}`,
    });
  }
  if (midIssue) {
    return row(impl, "needs_attention", 2.4 + severityRank(midIssue.severity) / 10, "risks", {
      reason: `Open issue (${midIssue.severity}): ${midIssue.title}`,
      impact: impactLine(impl, `owner ${midIssue.owner_name ?? "unassigned"}`),
      record,
      bundle,
      next: `Resolve the issue — ${midIssue.title}`,
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
      bundle,
    });
  }
  if (stalledCounts) {
    return row(impl, "needs_attention", 3, "journey", {
      reason: csStalled
        ? `In CS stage ${stalledDays}d — review if still needs implementation-side attention`
        : `Stalled ${stalledDays} days in ${dealStageLabel(impl.deal_stage)}`,
      impact: impactLine(impl, `threshold ${STAGE_FLAG_DAYS}d`),
      record,
      bundle,
      next: csStalled
        ? "Confirm whether implementation still needs to be involved"
        : `Find out what's holding ${dealStageLabel(impl.deal_stage)} and unstick it`,
    });
  }
  if (missedMilestone) {
    return row(impl, "needs_attention", 3.1, "journey", {
      reason: `Milestone missed: ${missedMilestone.name}${
        missedMilestone.target_date ? ` (target ${fmtDate(missedMilestone.target_date)})` : ""
      }`,
      impact: impactLine(impl, `stage ${stageLabel(missedMilestone.stage ?? impl.current_stage)}`),
      record,
      bundle,
      next: `Revisit the missed milestone — ${missedMilestone.name}`,
    });
  }
  if (soonCommitment) {
    return row(impl, "needs_attention", 3.2, "overview", {
      reason: `Commitment due in ${daysUntil(soonCommitment.due_date)}d: ${soonCommitment.description}`,
      impact: impactLine(impl, `due ${fmtDate(soonCommitment.due_date)}`),
      record,
      bundle,
    });
  }
  if (atRiskMilestone) {
    return row(impl, "needs_attention", 3.4, "journey", {
      reason: `Milestone at risk: ${atRiskMilestone.name}`,
      impact: impactLine(
        impl,
        atRiskMilestone.target_date
          ? `target ${fmtDate(atRiskMilestone.target_date)}`
          : "no target date",
      ),
      record,
      bundle,
      next: `Check in on the at-risk milestone — ${atRiskMilestone.name}`,
    });
  }
  const valueGap = proveValueGapSummary(bundle?.success_criteria, impl.current_stage);
  if (valueGap) {
    return row(impl, "needs_attention", 3.5, "overview", {
      reason: `Value proof late — ${valueGap.reason}`,
      impact: impactLine(
        impl,
        `${valueGap.count} success criteri${valueGap.count > 1 ? "a" : "on"} unproven in ${dealStageLabel(
          impl.deal_stage,
        )}`,
      ),
      record,
      bundle,
      next: "Close the value-proof gap on the unproven success criteria",
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
      impact: impactLine(impl, `${stalledDays}d in ${dealStageLabel(impl.deal_stage)}`),
      record,
      bundle,
      next: acceptanceGate.outstanding[0] ?? "Record solution acceptance before moving to Launch",
    });
  }
  if (impl.status === "at_risk") {
    return row(impl, "needs_attention", 3.6, "overview", {
      reason: `Flagged at risk — ${whatMattersNow(record)}`,
      impact: impactLine(impl, `${stalledDays}d in ${dealStageLabel(impl.deal_stage)}`),
      record,
      bundle,
      next: `Resolve it — ${whatMattersNow(record)}`,
    });
  }

  return null;
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
  parts: {
    reason: string;
    impact: string;
    record: Customer360;
    next?: string;
    bundle?: TriageBundle | undefined;
  },
): QueueRow {
  const bundle = parts.bundle;
  return {
    impl,
    bucket,
    rank,
    tab,
    reason: parts.reason,
    impact: parts.impact,
    next_action: parts.next ?? nextAction(parts.record, impl),
    facts: bundle?.deal ?? null,
    // Same inputs the record was built from, so the dependency on a row can
    // never disagree with the dependency Leadership shows for that row.
    dependency: waitingOn({
      technical_solutions: bundle?.technical_solutions ?? [],
      approvals: bundle?.approvals ?? [],
      commitments: parts.record.commitments ?? [],
      risks: parts.record.risks ?? [],
      issues: parts.record.issues ?? [],
      escalations: parts.record.escalations ?? [],
      decisions: parts.record.decisions ?? [],
    }),
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
