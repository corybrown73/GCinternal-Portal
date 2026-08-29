/**
 * Phase 6 server layer: fetch the raw materials, hand them to the pure
 * derivations in `src/lib/signals/`, emit the two new alert kinds.
 *
 * Nothing here writes a computed value onto a record. `health_recorded` is a
 * human's statement and `health_computed` belongs to Phase 1's cache; this
 * phase derives at read time and stores nothing. The only writes are alert
 * rows, and those are new records, not overwrites.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isFlagOn } from "./app-config.server";
import { waitingOn, type WaitingOn } from "./customer360-derive";
import { normalizeStage } from "./hub-format";
import type { LifecycleStageId } from "./lifecycle";
import {
  compareAll,
  dwellByStage,
  onTimeCounts,
  type DwellComparison,
  type DwellDistribution,
  type ImplementationTargets,
  type OnTimeCounts,
  type StageTargets,
} from "./signals/dwell";
import {
  stageSegments,
  type ExclusionReason,
  type OpenStageSegment,
  type StageSegment,
  type StageSegments,
} from "./signals/stage-history";
import { slipAttribution, type SlipAttribution } from "./signals/slip";
import { velocityFor, type Velocity } from "./signals/velocity";
import {
  championGoneQuiet,
  launchDateAtRisk,
  type AlertFinding,
  type AlertWithheld,
} from "./signals/alert-rules";
import {
  engagementSignal,
  TELEMETRY_UNAVAILABLE,
  type EngagementSignal,
  type PlanEvent,
} from "./signals/engagement";

const db = () => supabaseAdmin as any;

/** How far back the engagement probe looks. Descriptive, not a threshold. */
export const ENGAGEMENT_WINDOW_DAYS = 90;

/* ------------------------------------------------------------------ */
/* Stage targets — template facts, never observations                  */
/* ------------------------------------------------------------------ */

/**
 * `stage_instances.target_duration_days` per implementation.
 *
 * This is the ONLY column this phase reads from `stage_instances`, and reading
 * it is not a provenance violation: a target is a number copied from the
 * template at instantiation, not a claim about what happened. The row's
 * timestamps — which `provenance` exists to qualify — are never selected here,
 * so no backfilled instant can reach a metric even by accident.
 */
export async function loadStageTargets(): Promise<ImplementationTargets> {
  const out = new Map<string, Map<LifecycleStageId, number>>();
  const { data, error } = await db()
    .from("stage_instances")
    .select("implementation_id, stage_key, target_duration_days");
  if (error || !data) return out;
  for (const row of data) {
    if (row.target_duration_days == null) continue;
    const stage = normalizeStage(row.stage_key);
    if (!stage) continue;
    const forImpl = out.get(row.implementation_id) ?? new Map<LifecycleStageId, number>();
    forImpl.set(stage, Number(row.target_duration_days));
    out.set(row.implementation_id, forImpl);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Engagement — the Phase 4 dependency, isolated                       */
/* ------------------------------------------------------------------ */

/** Postgres/PostgREST ways of saying "that relation does not exist". */
function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

export type EngagementProbe = {
  available: boolean;
  reason: string;
  events: PlanEvent[];
};

/**
 * Read `external_plan_events` if Phase 4 has created it.
 *
 * An absent source is NO SIGNAL, never "healthy" and never "no activity". Any
 * failure — missing relation, permissions, anything — resolves to
 * `available: false` with the reason, because a signal that quietly turns into
 * a clean bill of health when its source disappears is worse than no signal.
 */
export async function probeEngagement(
  implementationIds: readonly string[],
  windowDays: number = ENGAGEMENT_WINDOW_DAYS,
): Promise<EngagementProbe> {
  if (implementationIds.length === 0) {
    return { available: true, reason: "No implementations to read telemetry for.", events: [] };
  }
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  try {
    const { data, error } = await db()
      .from("external_plan_events")
      .select("implementation_id, contact_id, event, created_at")
      .in("implementation_id", implementationIds as string[])
      .gte("created_at", since);
    if (error) {
      return {
        available: false,
        reason: isMissingRelation(error)
          ? "the external_plan_events table does not exist in this database yet (it ships with Phase 4)"
          : `the external_plan_events read failed: ${error.message ?? "unknown error"}`,
        events: [],
      };
    }
    return {
      available: true,
      reason: `${(data ?? []).length} portal event(s) in the last ${windowDays}d.`,
      events: (data ?? []) as PlanEvent[],
    };
  } catch (e) {
    return {
      available: false,
      reason: `the external_plan_events read threw: ${e instanceof Error ? e.message : String(e)}`,
      events: [],
    };
  }
}

function engagementFor(
  probe: EngagementProbe,
  implementationId: string,
  windowDays: number,
): EngagementSignal {
  if (!probe.available) return TELEMETRY_UNAVAILABLE(probe.reason);
  return engagementSignal(implementationId, probe.events, windowDays);
}

/* ------------------------------------------------------------------ */
/* The signals view                                                    */
/* ------------------------------------------------------------------ */

export type ImplementationSignals = {
  implementation_id: string;
  customer_id: string | null;
  customer_name: string;
  implementation_name: string;
  current_stage: string | null;
  owner_name: string | null;
  /** Recorded health — a human's statement. Shown beside, never merged. */
  health_recorded: string | null;
  health_recorded_reason: string | null;
  /** Phase 1's cache of deriveHealth. Never written by this phase. */
  health_computed: string | null;
  velocity: Velocity;
  dwell: DwellComparison[];
  slip: SlipAttribution;
  dependency: WaitingOn;
  engagement: EngagementSignal;
};

export type SignalsView = {
  generated_at: string;
  /** True only when the alert cron would actually emit. Rendered plainly. */
  alerts_enabled: boolean;
  engagement: { available: boolean; reason: string; window_days: number };
  segments: {
    completed: number;
    open: number;
    rows_read: number;
    excluded_by_reason: Record<ExclusionReason, number>;
    /** A sample of excluded rows, so the counts can name themselves. */
    excluded_sample: StageSegments["excluded"];
  };
  dwell_by_stage: DwellDistribution[];
  on_time: OnTimeCounts;
  waiting_on: Array<{
    party: WaitingOn["party"];
    implementations: Array<{
      implementation_id: string;
      customer_id: string | null;
      customer_name: string;
      reason: string;
      since: string | null;
      source: string | null;
    }>;
  }>;
  implementations: ImplementationSignals[];
  would_fire: AlertFinding[];
  withheld: AlertWithheld[];
};

type ImplRow = {
  id: string;
  name: string;
  customer_id: string | null;
  current_stage: string | null;
  stage_entered_at: string | null;
  target_launch_date: string | null;
  actual_launch_date: string | null;
  health_recorded: string | null;
  health_recorded_reason: string | null;
  health_computed: string | null;
  owner_id: string | null;
};

async function loadInputs() {
  const [
    { data: impls },
    { data: customers },
    { data: team },
    { data: history },
    { data: approvals },
    { data: commitments },
    { data: escalations },
    { data: risks },
    { data: issues },
    { data: decisions },
    { data: solutions },
    { data: mappings },
  ] = await Promise.all([
    db()
      .from("implementations")
      .select(
        "id, name, customer_id, current_stage, stage_entered_at, target_launch_date, actual_launch_date, health_recorded, health_recorded_reason, health_computed, owner_id",
      ),
    db().from("customers").select("id, name"),
    db().from("team_members").select("id, name"),
    db()
      .from("implementation_stage_history")
      .select("implementation_id, stage, entered_at, exited_at")
      .order("entered_at", { ascending: true }),
    db()
      .from("approvals")
      .select(
        "id, implementation_id, title, status, requested_at, decided_at, approver_name, approver_role, approved_entity_type, approved_entity_id",
      ),
    db()
      .from("commitments")
      .select("id, implementation_id, description, status, due_date, made_at, committed_to"),
    db().from("escalations").select("id, implementation_id, title, severity, status, raised_at"),
    db().from("risks").select("id, implementation_id, title, severity, status, identified_at"),
    db().from("issues").select("id, implementation_id, title, severity, status, raised_at"),
    db().from("decisions").select("id, implementation_id, title, status, decision_date"),
    db().from("technical_solutions").select("id, implementation_id, title, status, updated_at"),
    db().from("field_mappings").select("id, technical_solution_id, required, status"),
  ]);

  // Rows come back untyped from the service-role client (repo convention), so
  // the grouping helper stays loose and the pure modules do the narrowing.
  const byImpl = (rows: any[] | null): Map<string, any[]> => {
    const map = new Map<string, any[]>();
    for (const row of rows ?? []) {
      const key = row?.implementation_id as string | undefined;
      if (!key) continue;
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    return map;
  };

  const mappingsBySolution = new Map<string, any[]>();
  for (const m of mappings ?? []) {
    const list = mappingsBySolution.get(m.technical_solution_id);
    if (list) list.push(m);
    else mappingsBySolution.set(m.technical_solution_id, [m]);
  }
  const solutionRows = (solutions ?? []).map((s: any) => ({
    ...s,
    field_mappings: mappingsBySolution.get(s.id) ?? [],
  }));

  return {
    impls: (impls ?? []) as ImplRow[],
    customerName: new Map<string, string>((customers ?? []).map((c: any) => [c.id, c.name])),
    teamName: new Map<string, string>((team ?? []).map((t: any) => [t.id, t.name])),
    history: history ?? [],
    approvals: byImpl(approvals),
    commitments: byImpl(commitments),
    escalations: byImpl(escalations),
    risks: byImpl(risks),
    issues: byImpl(issues),
    decisions: byImpl(decisions),
    solutions: byImpl(solutionRows),
  };
}

/**
 * Everything the `/signals` surface renders. Read-only: it computes, it does
 * not cache, and it writes nothing.
 */
export async function loadSignals(now: Date = new Date()): Promise<SignalsView> {
  const inputs = await loadInputs();
  const targets = await loadStageTargets();
  const segments = stageSegments(inputs.history, now);
  const implIds = inputs.impls.map((i) => i.id);
  const probe = await probeEngagement(implIds);
  const alertsEnabled = await isFlagOn("signals_alerts");

  const openByImpl = new Map<string, OpenStageSegment>();
  for (const open of segments.open) {
    if (!openByImpl.has(open.implementation_id)) openByImpl.set(open.implementation_id, open);
  }

  const comparisons = compareAll(segments.completed, targets);
  const rows: ImplementationSignals[] = [];
  const findings: AlertFinding[] = [];
  const withheld: AlertWithheld[] = [];

  for (const impl of inputs.impls) {
    const approvals = inputs.approvals.get(impl.id) ?? [];
    const commitments = inputs.commitments.get(impl.id) ?? [];
    const escalations = inputs.escalations.get(impl.id) ?? [];
    const solutions = inputs.solutions.get(impl.id) ?? [];
    const dependency = waitingOn({
      technical_solutions: solutions,
      approvals,
      commitments,
      risks: inputs.risks.get(impl.id) ?? [],
      issues: inputs.issues.get(impl.id) ?? [],
      escalations,
      decisions: inputs.decisions.get(impl.id) ?? [],
    });
    const open = openByImpl.get(impl.id) ?? null;
    const engagement = engagementFor(probe, impl.id, ENGAGEMENT_WINDOW_DAYS);
    const customerName = impl.customer_id
      ? (inputs.customerName.get(impl.customer_id) ?? impl.name)
      : impl.name;

    const context = {
      id: impl.id,
      name: impl.name,
      customer_id: impl.customer_id,
      customer_name: customerName,
      current_stage: impl.current_stage,
      target_launch_date: impl.target_launch_date,
      actual_launch_date: impl.actual_launch_date,
    };

    const champion = championGoneQuiet(
      { impl: context, dependency, approvals, commitments, engagement },
      now,
    );
    const launch = launchDateAtRisk(
      {
        impl: context,
        solutions,
        approvals,
        escalations,
        stageTargets: (targets.get(impl.id) ?? new Map()) as StageTargets,
      },
      now,
    );
    findings.push(...champion.findings, ...launch.findings);
    withheld.push(...champion.withheld, ...launch.withheld);

    rows.push({
      implementation_id: impl.id,
      customer_id: impl.customer_id,
      customer_name: customerName,
      implementation_name: impl.name,
      current_stage: impl.current_stage,
      owner_name: impl.owner_id ? (inputs.teamName.get(impl.owner_id) ?? null) : null,
      health_recorded: impl.health_recorded,
      health_recorded_reason: impl.health_recorded_reason,
      health_computed: impl.health_computed,
      velocity: velocityFor(impl.id, segments.completed, open, impl.current_stage),
      dwell: comparisons.filter((c) => c.segment.implementation_id === impl.id),
      slip: slipAttribution(impl, segments.completed, open, targets, now),
      dependency,
      engagement,
    });
  }

  const parties: Array<WaitingOn["party"]> = ["customer", "technical_solutions", "tis", "none"];
  const waitingGroups = parties.map((party) => ({
    party,
    implementations: rows
      .filter((r) => r.dependency.party === party)
      .map((r) => ({
        implementation_id: r.implementation_id,
        customer_id: r.customer_id,
        customer_name: r.customer_name,
        reason: r.dependency.reason,
        since: r.dependency.since,
        source: r.dependency.source,
      }))
      .sort((a, b) => String(a.since ?? "9999").localeCompare(String(b.since ?? "9999"))),
  }));

  rows.sort((a, b) => a.customer_name.localeCompare(b.customer_name));

  return {
    generated_at: now.toISOString(),
    alerts_enabled: alertsEnabled,
    engagement: {
      available: probe.available,
      reason: probe.reason,
      window_days: ENGAGEMENT_WINDOW_DAYS,
    },
    segments: {
      completed: segments.completed.length,
      open: segments.open.length,
      rows_read: segments.rows_read,
      excluded_by_reason: segments.excluded_by_reason,
      excluded_sample: segments.excluded.filter((e) => e.reason !== "still_open").slice(0, 20),
    },
    dwell_by_stage: dwellByStage(segments.completed),
    on_time: onTimeCounts(comparisons),
    waiting_on: waitingGroups,
    implementations: rows,
    would_fire: findings,
    withheld,
  };
}

/* ------------------------------------------------------------------ */
/* Alert emission                                                      */
/* ------------------------------------------------------------------ */

export type SignalAlertSweep = {
  enabled: boolean;
  evaluated: number;
  created: number;
  deduped: number;
  withheld: number;
};

/**
 * Emit `champion_gone_quiet` and `launch_date_at_risk`, deduped against an
 * existing unacknowledged alert of the same kind on the same implementation —
 * the rule the cron's stalled and overdue-milestone passes already use.
 *
 * Neither kind emails (`notify: false`). Email is for something somebody must
 * do today; both of these are "read this before your next call", and an alert
 * that mails on a 30-day horizon is how people learn to filter the sender.
 */
export async function runSignalAlerts(now: Date = new Date()): Promise<SignalAlertSweep> {
  const enabled = await isFlagOn("signals_alerts");
  if (!enabled) {
    return { enabled: false, evaluated: 0, created: 0, deduped: 0, withheld: 0 };
  }
  const view = await loadSignals(now);
  const kinds = ["champion_gone_quiet", "launch_date_at_risk"];

  const { data: openAlerts } = await db()
    .from("alerts")
    .select("kind, implementation_id")
    .in("kind", kinds)
    .is("acknowledged_at", null);
  const already = new Set(
    (openAlerts ?? []).map((a: any) => `${a.kind}:${a.implementation_id ?? ""}`),
  );

  const { createAlert } = await import("./tickets.server");
  let created = 0;
  let deduped = 0;
  for (const finding of view.would_fire) {
    if (already.has(`${finding.kind}:${finding.implementation_id}`)) {
      deduped += 1;
      continue;
    }
    await createAlert({
      kind: finding.kind,
      severity: finding.severity,
      title: finding.title,
      detail: finding.detail,
      customerId: finding.customer_id,
      implementationId: finding.implementation_id,
      payload: { ...finding.payload, evidence: finding.evidence },
      notify: false,
      actor: { type: "system" },
    });
    already.add(`${finding.kind}:${finding.implementation_id}`);
    created += 1;
  }

  return {
    enabled: true,
    evaluated: view.implementations.length,
    created,
    deduped,
    withheld: view.withheld.length,
  };
}

export type { StageSegment, DwellComparison };
