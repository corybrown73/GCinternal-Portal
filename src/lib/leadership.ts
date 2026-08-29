/**
 * Leadership layer — aggregation only.
 *
 * Every judgement about health, urgency, lateness, dependency and readiness is
 * made by the existing modules (customer360-derive, home-triage, lifecycle,
 * graduation-readiness). This file groups those results across the portfolio and
 * names the management decision attached to them. It introduces no new rules,
 * no scores, no averages and no forecasting.
 */
import type { ImplementationRow, LeadershipData, StageHistoryRow, TriageBundle } from "./hub-types";
import {
  ADOPTION_LEVEL_LABEL,
  adoptionAreaLevel,
  adoptionSummary,
  deriveHealth,
  launchOverdue,
  launchStateConflict,
  openItems,
  proveValueGaps,
  proveValueState,
  severityRank,
  waitingOn,
  type AdoptionLevel,
  type ImplHealth,
  type WaitingOn,
} from "./customer360-derive";
import { buildQueue, healthByImplementation, triageRow, type QueueRow } from "./home-triage";
import {
  graduationReadiness,
  graduationReadinessSummary,
  type ReadinessArea,
} from "./graduation-readiness";
import { LIFECYCLE_STAGES, type LifecycleStageId } from "./lifecycle";
import { STAGE_FLAG_DAYS, daysSince, isOverdue, normalizeStage, stageLabel } from "./hub-format";

const DAY = 86_400_000;
const daysUntil = (date: string | null | undefined) =>
  date ? Math.ceil((new Date(date).getTime() - Date.now()) / DAY) : null;

const bundleFor = (triage: TriageBundle[], id: string) =>
  triage.find((t) => t.implementation_id === id);

/* ---------------- 1. Portfolio roll-up ---------------- */

export type PortfolioRollup = {
  total: number;
  health: Record<ImplHealth, number>;
  act_now: number;
  needs_attention: number;
  moving: number;
  unassigned: number;
  owners: number;
};

export function portfolioRollup(data: LeadershipData): PortfolioRollup {
  const health = healthByImplementation(data.implementations, data.triage);
  const queue = buildQueue(data.implementations, data.triage);
  const counts: Record<ImplHealth, number> = {
    blocked: 0,
    at_risk: 0,
    on_track: 0,
    no_signal: 0,
  };
  for (const impl of data.implementations) {
    const level = health.get(impl.id)?.level;
    if (level) counts[level] += 1;
  }
  return {
    total: data.implementations.length,
    health: counts,
    act_now: queue.act_now.length,
    needs_attention: queue.needs_attention.length,
    moving: queue.moving.length,
    unassigned: data.implementations.filter((i) => !i.owner_name).length,
    owners: new Set(data.implementations.map((i) => i.owner_name).filter(Boolean)).size,
  };
}

/* ---------------- 2. Accounts needing intervention ---------------- */

export type LeadershipActionId =
  | "assign_owner"
  | "join_customer_conversation"
  | "escalate_internally"
  | "rebaseline_launch"
  | "unblock_dependency"
  | "review_with_owner";

export const LEADERSHIP_ACTION_LABEL: Record<LeadershipActionId, string> = {
  assign_owner: "Assign an owner",
  join_customer_conversation: "Join the customer conversation",
  escalate_internally: "Escalate internally",
  rebaseline_launch: "Agree a new launch date",
  unblock_dependency: "Unblock the dependency",
  review_with_owner: "Review with the owner",
};

export type InterventionRow = {
  row: QueueRow;
  health: ImplHealth;
  dependency: WaitingOn;
  action: LeadershipActionId;
  /** Why the lead — not the owner — is the right person to act. */
  action_reason: string;
};

/**
 * Maps an already-derived triage signal onto the management action a lead can
 * take. Traceable to stored fields only: owner, severity, dependency party and
 * launch dates.
 */
export function leadershipAction(
  row: QueueRow,
  dependency: WaitingOn,
  bundle: TriageBundle | undefined,
): { action: LeadershipActionId; action_reason: string } {
  const impl = row.impl;
  if (!impl.owner_name) {
    return {
      action: "assign_owner",
      action_reason:
        "No implementation owner is recorded, so no one is accountable for the signal.",
    };
  }

  const open = openItems({
    commitments: bundle?.commitments ?? [],
    risks: bundle?.risks ?? [],
    issues: bundle?.issues ?? [],
    escalations: bundle?.escalations ?? [],
  } as never);
  const severeEscalation = open.escalations.find((e: any) => severityRank(e.severity) <= 1);
  if (severeEscalation) {
    return {
      action: "escalate_internally",
      action_reason: `Open ${severeEscalation.severity} escalation "${severeEscalation.title}" needs a decision above the owner.`,
    };
  }

  if (launchOverdue(impl) || launchStateConflict(impl)) {
    return {
      action: "rebaseline_launch",
      action_reason: launchOverdue(impl)
        ? "The target launch date has passed with no actual launch recorded — the date needs renegotiating."
        : "Stage is past Launch with no actual launch date, so the recorded plan and reality disagree.",
    };
  }

  if (dependency.party === "customer") {
    return {
      action: "join_customer_conversation",
      action_reason: "The account is waiting on the customer; a lead-level conversation moves it.",
    };
  }
  if (dependency.party === "technical_solutions") {
    return {
      action: "unblock_dependency",
      action_reason: "Progress depends on Technical Solutions work outside the owner's control.",
    };
  }

  const criticalRisk = open.risks.find((r: any) => severityRank(r.severity) === 0);
  if (criticalRisk) {
    return {
      action: "escalate_internally",
      action_reason: `Critical risk "${criticalRisk.title}" is still open.`,
    };
  }

  return {
    action: "review_with_owner",
    action_reason: `${impl.owner_name} holds this; confirm the next action is happening.`,
  };
}

/** Accounts a lead must step into: act-now, plus attention rows with lead-level causes. */
export function interventions(data: LeadershipData): InterventionRow[] {
  const queue = buildQueue(data.implementations, data.triage);
  const health = healthByImplementation(data.implementations, data.triage);

  const candidates = [
    ...queue.act_now,
    ...queue.needs_attention.filter((r) => {
      const bundle = bundleFor(data.triage, r.impl.id);
      const open = openItems({
        commitments: bundle?.commitments ?? [],
        risks: bundle?.risks ?? [],
        issues: bundle?.issues ?? [],
        escalations: bundle?.escalations ?? [],
      } as never);
      return (
        !r.impl.owner_name ||
        open.escalations.length > 0 ||
        open.risks.some((x: any) => severityRank(x.severity) <= 1) ||
        launchOverdue(r.impl) ||
        launchStateConflict(r.impl)
      );
    }),
  ];

  return candidates.map((row) => {
    const bundle = bundleFor(data.triage, row.impl.id);
    const dependency = waitingOn({
      technical_solutions: bundle?.technical_solutions ?? [],
      approvals: bundle?.approvals ?? [],
      commitments: bundle?.commitments ?? [],
      risks: bundle?.risks ?? [],
      issues: bundle?.issues ?? [],
      escalations: bundle?.escalations ?? [],
      decisions: bundle?.decisions ?? [],
    });
    const { action, action_reason } = leadershipAction(row, dependency, bundle);
    return {
      row,
      health: health.get(row.impl.id)?.level ?? "no_signal",
      dependency,
      action,
      action_reason,
    };
  });
}

/* ---------------- 3. Owner load and concentration ---------------- */

export type OwnerLoadRow = {
  owner: string;
  unassigned: boolean;
  implementations: ImplementationRow[];
  act_now: number;
  blocked: number;
  at_risk: number;
  arr: number | null;
  launches_30d: number;
  flags: string[];
};

export function ownerLoad(data: LeadershipData): OwnerLoadRow[] {
  const health = healthByImplementation(data.implementations, data.triage);
  const queue = buildQueue(data.implementations, data.triage);
  const actNow = new Set(queue.act_now.map((r) => r.impl.id));

  const groups = new Map<string, ImplementationRow[]>();
  for (const impl of data.implementations) {
    const key = impl.owner_name ?? "Unassigned";
    groups.set(key, [...(groups.get(key) ?? []), impl]);
  }

  const rows: OwnerLoadRow[] = [...groups.entries()].map(([owner, impls]) => {
    const arrValues = impls.map((i) => i.arr).filter((v): v is number => v != null);
    const blocked = impls.filter((i) => health.get(i.id)?.level === "blocked").length;
    const at_risk = impls.filter((i) => health.get(i.id)?.level === "at_risk").length;
    const act = impls.filter((i) => actNow.has(i.id)).length;
    return {
      owner,
      unassigned: owner === "Unassigned",
      implementations: impls,
      act_now: act,
      blocked,
      at_risk,
      arr: arrValues.length ? arrValues.reduce((a, b) => a + b, 0) : null,
      launches_30d: impls.filter((i) => {
        const d = daysUntil(i.target_launch_date);
        return !i.actual_launch_date && d != null && d >= 0 && d <= 30;
      }).length,
      flags: [],
    };
  });

  const totalBlocked = rows.reduce((n, r) => n + r.blocked, 0);
  for (const r of rows) {
    if (r.unassigned) r.flags.push("No owner recorded — assign before anything else");
    if (r.act_now > 1) r.flags.push(`Carrying ${r.act_now} act-now accounts alone`);
    if (r.blocked > 0 && r.blocked === totalBlocked && totalBlocked > 0 && !r.unassigned)
      r.flags.push("Holds every blocked account in the portfolio");
    if (r.launches_30d > 1) r.flags.push(`${r.launches_30d} launches inside 30 days`);
  }

  return rows.sort(
    (a, b) =>
      b.act_now - a.act_now ||
      b.blocked + b.at_risk - (a.blocked + a.at_risk) ||
      b.implementations.length - a.implementations.length ||
      a.owner.localeCompare(b.owner),
  );
}

/* ---------------- 4. Lifecycle distribution and stage friction ---------------- */

export type StageDistributionRow = {
  id: LifecycleStageId;
  label: string;
  phase: string;
  implementations: ImplementationRow[];
  longest_dwell_days: number | null;
  longest_dwell_customer: string | null;
  over_flag: number;
};

export function stageDistribution(data: LeadershipData): StageDistributionRow[] {
  return LIFECYCLE_STAGES.map((stage) => {
    const impls = data.implementations.filter((i) => normalizeStage(i.current_stage) === stage.id);
    const dwell = impls
      .map((i) => ({ days: daysSince(i.stage_entered_at) ?? 0, customer: i.customer_name }))
      .sort((a, b) => b.days - a.days)[0];
    return {
      id: stage.id,
      label: stage.label,
      phase: stage.phase,
      implementations: impls,
      longest_dwell_days: dwell ? dwell.days : null,
      longest_dwell_customer: dwell ? dwell.customer : null,
      over_flag: impls.filter((i) => (daysSince(i.stage_entered_at) ?? 0) > STAGE_FLAG_DAYS).length,
    };
  });
}

export type CompletedDwell = {
  stage: string;
  transitions: number;
  shortest_days: number;
  longest_days: number;
};

/** Observed dwell across completed transitions only. Not a benchmark or target. */
export function completedStageDwell(history: StageHistoryRow[]): CompletedDwell[] {
  const byStage = new Map<string, number[]>();
  for (const row of history) {
    if (!row.exited_at || !row.entered_at) continue;
    const days = Math.max(
      0,
      Math.round((new Date(row.exited_at).getTime() - new Date(row.entered_at).getTime()) / DAY),
    );
    const label = stageLabel(row.stage);
    byStage.set(label, [...(byStage.get(label) ?? []), days]);
  }
  return [...byStage.entries()]
    .map(([stage, values]) => ({
      stage,
      transitions: values.length,
      shortest_days: Math.min(...values),
      longest_days: Math.max(...values),
    }))
    .sort((a, b) => b.longest_days - a.longest_days);
}

export type CompletedTransitionRow = {
  key: string;
  impl: ImplementationRow | null;
  stage: string;
  entered_at: string;
  exited_at: string;
  days: number;
};

/**
 * The individual completed transitions behind one row of observed dwell. Same
 * filter and same day arithmetic as completedStageDwell — grouping only, so the
 * dwell figures cannot drift from what is listed here.
 */
export function completedTransitions(
  data: LeadershipData,
  stage: string,
): CompletedTransitionRow[] {
  return data.stage_history
    .filter((h) => h.entered_at && h.exited_at && stageLabel(h.stage) === stage)
    .map((h, i) => ({
      key: `${h.implementation_id}-${h.entered_at}-${i}`,
      impl: data.implementations.find((impl) => impl.id === h.implementation_id) ?? null,
      stage: stageLabel(h.stage),
      entered_at: h.entered_at,
      exited_at: h.exited_at as string,
      days: Math.max(
        0,
        Math.round(
          (new Date(h.exited_at as string).getTime() - new Date(h.entered_at).getTime()) / DAY,
        ),
      ),
    }))
    .sort((a, b) => b.days - a.days);
}

/* ---------------- 5. Launch and delivery risk ---------------- */

export type LaunchRow = {
  impl: ImplementationRow;
  detail: string;
};

export type LaunchBoard = {
  slipped: LaunchRow[];
  landing_30d: LaunchRow[];
  conflict: LaunchRow[];
};

export function launchBoard(data: LeadershipData): LaunchBoard {
  const byArr = (a: LaunchRow, b: LaunchRow) =>
    (b.impl.arr ?? 0) - (a.impl.arr ?? 0) ||
    String(a.impl.target_launch_date).localeCompare(String(b.impl.target_launch_date));

  const slipped: LaunchRow[] = [];
  const landing: LaunchRow[] = [];
  const conflict: LaunchRow[] = [];

  for (const impl of data.implementations) {
    const d = daysUntil(impl.target_launch_date);
    if (launchOverdue(impl)) {
      slipped.push({ impl, detail: `${Math.abs(d ?? 0)}d past target, no actual launch recorded` });
    } else if (!impl.actual_launch_date && d != null && d >= 0 && d <= 30) {
      landing.push({ impl, detail: `${d}d to target launch` });
    }
    if (launchStateConflict(impl)) {
      conflict.push({
        impl,
        detail: `Stage ${stageLabel(impl.current_stage)} is past Launch but no actual launch date is recorded`,
      });
    }
  }

  return {
    slipped: slipped.sort(byArr),
    landing_30d: landing.sort(byArr),
    conflict: conflict.sort(byArr),
  };
}

/* ---------------- 6. Value-proof coverage ---------------- */

export type ValueCoverageRow = {
  impl: ImplementationRow;
  criteria: number;
  baselined: number;
  observed: number;
  confirmed: number;
  late: number;
  summary: string;
};

export function valueCoverage(data: LeadershipData): {
  rows: ValueCoverageRow[];
  no_criteria: number;
  total: number;
} {
  const rows = data.implementations.map((impl) => {
    const criteria = bundleFor(data.triage, impl.id)?.success_criteria ?? [];
    const baselined = criteria.filter((c: any) => String(c.baseline_value ?? "").trim()).length;
    const observed = criteria.filter((c: any) => (c.observations ?? []).length > 0).length;
    const confirmed = criteria.filter(
      (c: any) =>
        proveValueState(c, c.observations ?? [], c.confirmations ?? []) === "customer_confirmed",
    ).length;
    const late = proveValueGaps(criteria, impl.current_stage).length;
    return {
      impl,
      criteria: criteria.length,
      baselined,
      observed,
      confirmed,
      late,
      summary: criteria.length
        ? `${baselined}/${criteria.length} baselined · ${observed}/${criteria.length} observed · ${confirmed} confirmed`
        : "No measurable success criteria recorded",
    };
  });

  return {
    rows: rows.sort(
      (a, b) =>
        a.criteria - b.criteria ||
        b.late - a.late ||
        a.observed / (a.criteria || 1) - b.observed / (b.criteria || 1) ||
        a.impl.customer_name.localeCompare(b.impl.customer_name),
    ),
    no_criteria: rows.filter((r) => r.criteria === 0).length,
    total: rows.length,
  };
}

/* ---------------- 7. Adoption coverage ---------------- */

export type AdoptionCoverageRow = {
  impl: ImplementationRow;
  areas: number;
  observed: number;
  workarounds: number;
  level: AdoptionLevel;
  level_label: string;
};

/** Restricted to implementations at or past Build — adoption is meaningless earlier. */
export function adoptionCoverage(data: LeadershipData): AdoptionCoverageRow[] {
  const buildIdx = LIFECYCLE_STAGES.findIndex((s) => s.id === "build");
  return data.implementations
    .filter((i) => {
      const id = normalizeStage(i.current_stage);
      return id != null && LIFECYCLE_STAGES.findIndex((s) => s.id === id) >= buildIdx;
    })
    .map((impl) => {
      const areas = bundleFor(data.triage, impl.id)?.adoption ?? [];
      const summary = adoptionSummary(areas);
      const observed = areas.filter((a: any) => (a.observations ?? []).length > 0).length;
      const level = summary?.level ?? "unknown";
      return {
        impl,
        areas: areas.length,
        observed,
        workarounds: summary?.workarounds.length ?? 0,
        level,
        level_label: ADOPTION_LEVEL_LABEL[level],
      };
    })
    .sort(
      (a, b) =>
        a.observed - b.observed ||
        b.areas - a.areas ||
        a.impl.customer_name.localeCompare(b.impl.customer_name),
    );
}

/* ---------------- 8. Stuck work across the team ---------------- */

export type StuckWorkItem = {
  key: string;
  kind: "escalation" | "risk" | "issue" | "commitment" | "decision";
  title: string;
  customer_name: string;
  customer_id: string;
  /** The implementation this item belongs to, so links resolve to the right one. */
  implementation_id: string;
  owner_name: string | null;
  severity: string | null;
  age_days: number | null;
  overdue: boolean;
  unowned: boolean;
  stale: boolean;
  rank: number;
};

const STALE_DAYS = 14;

export function stuckWork(data: LeadershipData): StuckWorkItem[] {
  const items: StuckWorkItem[] = [];

  for (const impl of data.implementations) {
    const bundle = bundleFor(data.triage, impl.id);
    if (!bundle) continue;
    const open = openItems({
      commitments: bundle.commitments,
      risks: bundle.risks,
      issues: bundle.issues,
      escalations: bundle.escalations,
    } as never);

    const push = (
      kind: StuckWorkItem["kind"],
      row: any,
      title: string,
      at: string | null | undefined,
      overdue = false,
    ) => {
      const age = daysSince(at);
      items.push({
        key: `${kind}-${row.id}`,
        kind,
        title,
        customer_name: impl.customer_name,
        customer_id: impl.customer_id,
        implementation_id: impl.id,
        owner_name: row.owner_name ?? null,
        severity: row.severity ?? null,
        age_days: age,
        overdue,
        unowned: !row.owner_name,
        stale: (age ?? 0) > STALE_DAYS,
        rank:
          (kind === "escalation" ? 0 : kind === "issue" ? 1 : kind === "risk" ? 1 : 2) +
          severityRank(row.severity) / 10,
      });
    };

    for (const e of open.escalations) push("escalation", e, e.title, e.raised_at);
    for (const r of open.risks) push("risk", r, r.title, r.identified_at);
    for (const i of open.issues) push("issue", i, i.title, i.raised_at);
    for (const c of open.commitments)
      push("commitment", c, c.description, c.made_at, isOverdue(c.due_date));
    for (const d of bundle.decisions.filter((x: any) =>
      ["proposed", "pending", "open", "under_review"].includes(
        String(x.status ?? "").toLowerCase(),
      ),
    ))
      push("decision", d, d.title, d.created_at);
  }

  return items
    .filter((i) => i.unowned || i.stale || i.overdue || i.kind === "escalation")
    .sort((a, b) => a.rank - b.rank || (b.age_days ?? 0) - (a.age_days ?? 0));
}

/* ---------------- 9. Graduation gate review ---------------- */

export type GraduationGateRow = {
  impl: ImplementationRow;
  areas: ReadinessArea[];
  summary: ReturnType<typeof graduationReadinessSummary>;
};

export function graduationGate(data: LeadershipData): GraduationGateRow[] {
  const rows: GraduationGateRow[] = [];
  for (const candidate of data.graduation_candidates) {
    const impl = data.implementations.find((i) => i.id === candidate.implementation_id);
    if (!impl) continue;
    const areas = graduationReadiness(candidate.record, {
      current_stage: impl.current_stage,
      actual_launch_date: impl.actual_launch_date,
      target_launch_date: impl.target_launch_date,
    });
    rows.push({ impl, areas, summary: graduationReadinessSummary(areas) });
  }
  return rows.sort(
    (a, b) =>
      b.summary.attention - a.summary.attention ||
      a.impl.customer_name.localeCompare(b.impl.customer_name),
  );
}

/** Health level label used by the roll-up strip, matching Customer 360 wording. */
export const HEALTH_LABEL: Record<ImplHealth, string> = {
  blocked: "Blocked",
  at_risk: "At risk",
  on_track: "On track",
  no_signal: "No signal",
};

export { deriveHealth };

/* ---------------- 9. Owner portfolio (navigation target) ---------------- */

export type OwnerAccountRow = {
  row: QueueRow;
  health: ImplHealth;
  /** Present only when the account is one a lead must step into. */
  intervention: InterventionRow | null;
};

export type OwnerPortfolio = {
  owner: string;
  implementations: number;
  arr: number | null;
  intervention_count: number;
  blocked: number;
  at_risk: number;
  on_track: number;
  accounts: OwnerAccountRow[];
};

/**
 * Groups already-derived triage, health and intervention results for one owner.
 * No new metric, score or forecast — "Unassigned" is never a valid owner here.
 */
export function ownerPortfolio(data: LeadershipData, owner: string): OwnerPortfolio | null {
  const impls = data.implementations.filter((i) => i.owner_name === owner);
  if (!owner || !impls.length) return null;

  const accounts = accountRows(data, impls);
  const arrValues = impls.map((i) => i.arr).filter((v): v is number => v != null);

  return {
    owner,
    implementations: impls.length,
    arr: arrValues.length ? arrValues.reduce((a, b) => a + b, 0) : null,
    intervention_count: accounts.filter((a) => a.intervention).length,
    blocked: accounts.filter((a) => a.health === "blocked").length,
    at_risk: accounts.filter((a) => a.health === "at_risk").length,
    on_track: accounts.filter((a) => a.health === "on_track").length,
    accounts,
  };
}

/**
 * Presentation helper: wraps a set of implementations in their already-derived
 * triage row, health level and intervention row, intervention accounts first.
 */
export function accountRows(data: LeadershipData, impls: ImplementationRow[]): OwnerAccountRow[] {
  const health = healthByImplementation(data.implementations, data.triage);
  const interventionByImpl = new Map(interventions(data).map((r) => [r.row.impl.id, r]));

  return impls
    .map((impl) => ({
      row: triageRow(impl, bundleFor(data.triage, impl.id)),
      health: health.get(impl.id)?.level ?? "no_signal",
      intervention: interventionByImpl.get(impl.id) ?? null,
    }))
    .sort(
      (a, b) =>
        Number(!!b.intervention) - Number(!!a.intervention) ||
        a.row.rank - b.row.rank ||
        a.row.impl.customer_name.localeCompare(b.row.impl.customer_name),
    );
}

/* ---------------- 10. Portfolio card filters (presentation only) ---------------- */

export type PortfolioFilterId =
  "act_now" | "needs_attention" | "blocked" | "at_risk" | "on_track" | "unassigned";

export const PORTFOLIO_FILTER_LABEL: Record<PortfolioFilterId, string> = {
  act_now: "Act now",
  needs_attention: "Needs attention",
  blocked: "Blocked",
  at_risk: "At risk",
  on_track: "On track",
  unassigned: "Unassigned",
};

/**
 * Returns the exact accounts counted by a roll-up card, using the same
 * derivations (buildQueue / healthByImplementation / owner_name) that produced
 * the count. Categories may overlap; no new rule is applied here.
 */
export function portfolioFilterAccounts(
  data: LeadershipData,
  filter: PortfolioFilterId,
): OwnerAccountRow[] {
  const queue = buildQueue(data.implementations, data.triage);
  const health = healthByImplementation(data.implementations, data.triage);

  const impls = data.implementations.filter((impl) => {
    switch (filter) {
      case "act_now":
        return queue.act_now.some((r) => r.impl.id === impl.id);
      case "needs_attention":
        return queue.needs_attention.some((r) => r.impl.id === impl.id);
      case "unassigned":
        return !impl.owner_name;
      default:
        return health.get(impl.id)?.level === filter;
    }
  });

  return accountRows(data, impls);
}
