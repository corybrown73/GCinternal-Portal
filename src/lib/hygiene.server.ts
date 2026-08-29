import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isFlagOn } from "./app-config.server";
import { audit, auditHealthCounter } from "./server/audit";
import { recordActivity, teamMemberIdForProfile } from "./activity.server";
import { manualEdge, MANUAL_EDGE } from "./trace-links";
import {
  missingHandoverFields,
  type HandoverRecord,
  type HandoverRecordInput,
} from "./handover-input";

const db = () => supabaseAdmin as any;

/* ========================================================================= */
/* The handover record (cs_handoffs)                                         */
/* ========================================================================= */

/**
 * `graduations` and `cs_handoffs` modelled the same event twice in 0003, each
 * with one reader and no writer. 0025 made `cs_handoffs` the record and folded
 * `graduations` forward without dropping it. This is the write path.
 *
 * It is a RECORD, not a gate: it moves no stage, blocks nothing, and asserts
 * nothing about whether the handover was a good one. Graduation readiness stays
 * read-only and independent.
 */

export type HandoverView = {
  /** False when handover_record is off — the panel explains rather than errors. */
  enabled: boolean;
  record: HandoverRecord | null;
  /** Which of the three required fields are still empty. A list, never a score. */
  missing: string[];
  /** True when 0025 folded this row forward from a deprecated graduations row. */
  hasLegacyGraduation: boolean;
};

async function ownerName(id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await db().from("team_members").select("name").eq("id", id).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

export async function loadHandover(implementationId: string): Promise<HandoverView> {
  const enabled = await isFlagOn("handover_record");
  const [{ data: row }, { data: legacy }] = await Promise.all([
    db().from("cs_handoffs").select("*").eq("implementation_id", implementationId).maybeSingle(),
    db().from("graduations").select("id").eq("implementation_id", implementationId).maybeSingle(),
  ]);

  if (!row) {
    return {
      enabled,
      record: null,
      missing: missingHandoverFields(null),
      hasLegacyGraduation: !!legacy,
    };
  }

  const record: HandoverRecord = {
    id: row.id,
    implementation_id: row.implementation_id,
    handoff_date: row.handoff_date ?? null,
    cs_owner_id: row.cs_owner_id ?? null,
    cs_owner_name: await ownerName(row.cs_owner_id ?? null),
    summary: row.summary ?? null,
    open_items: row.open_items ?? null,
    account_context: row.account_context ?? null,
    health_at_handover: row.health_at_handover ?? null,
    notes: row.notes ?? null,
    recorded_by_name: await ownerName(row.recorded_by ?? null),
    updated_at: row.updated_at ?? null,
  };

  return {
    enabled,
    record,
    missing: missingHandoverFields(record),
    hasLegacyGraduation: !!legacy,
  };
}

export async function saveHandover(
  input: HandoverRecordInput,
  actorProfileId: string,
): Promise<HandoverView> {
  if (!(await isFlagOn("handover_record"))) {
    throw new Error("The handover record is not enabled.");
  }

  const recordedBy = await teamMemberIdForProfile(actorProfileId);
  const { data: before } = await db()
    .from("cs_handoffs")
    .select("*")
    .eq("implementation_id", input.implementationId)
    .maybeSingle();

  const { data: impl } = await db()
    .from("implementations")
    .select("org_id")
    .eq("id", input.implementationId)
    .maybeSingle();
  if (!impl) throw new Error("That implementation does not exist.");

  const patch = {
    implementation_id: input.implementationId,
    handoff_date: input.handoff_date,
    cs_owner_id: input.cs_owner_id,
    summary: input.summary,
    open_items: input.open_items,
    account_context: input.account_context,
    health_at_handover: input.health_at_handover,
    notes: input.notes,
    recorded_by: recordedBy,
  };

  const { error } = before
    ? await db().from("cs_handoffs").update(patch).eq("id", before.id)
    : await db()
        .from("cs_handoffs")
        .insert({ ...patch, org_id: impl.org_id });
  if (error) throw new Error(error.message);

  // The activity feed records the handover being written, not its contents: the
  // record is the record, and a second copy of the summary in audit_log would
  // be the diverging duplicate this project keeps refusing to create.
  await recordActivity(
    [
      {
        entity_type: "implementation",
        entity_id: input.implementationId,
        field_name: "handover_record",
        old_value: before ? "recorded" : null,
        new_value: "recorded",
        change_reason: before ? "Handover record updated" : "Handover record created",
      },
    ],
    { actorProfileId },
  );

  await audit({
    actor_type: "user",
    actor_id: actorProfileId,
    action: before ? "handover.update" : "handover.create",
    entity_type: "implementation",
    entity_id: input.implementationId,
    payload: { has_date: !!input.handoff_date, has_owner: !!input.cs_owner_id },
  });

  return loadHandover(input.implementationId);
}

/* ========================================================================= */
/* Trace links — the one edge a person may draw                              */
/* ========================================================================= */

export type SolutionTraceLink = {
  id: string;
  decision_id: string;
  decision_title: string;
  source: string;
};

export type SolutionTraceView = {
  enabled: boolean;
  links: SolutionTraceLink[];
  /** Decisions on the same implementation that are not linked yet. */
  candidates: Array<{ id: string; title: string }>;
};

/**
 * Everything else in `trace_links` is derived in the database from foreign keys
 * that already exist, so it needs no UI and cannot drift. Decision ↔ technical
 * solution has no foreign key behind it, which is why `decisionsFor()` has
 * always come back empty — that one edge is genuine human input.
 */
export async function loadSolutionTrace(solutionId: string): Promise<SolutionTraceView> {
  const enabled = await isFlagOn("trace_links_editing");

  const { data: solution } = await db()
    .from("technical_solutions")
    .select("id, implementation_id")
    .eq("id", solutionId)
    .maybeSingle();
  if (!solution) return { enabled, links: [], candidates: [] };

  const [{ data: linkRows }, { data: decisions }] = await Promise.all([
    db()
      .from("trace_links")
      .select("*")
      .eq("to_entity_type", MANUAL_EDGE.toType)
      .eq("to_entity_id", solutionId)
      .eq("from_entity_type", MANUAL_EDGE.fromType),
    db()
      .from("decisions")
      .select("id, title")
      .eq("implementation_id", solution.implementation_id)
      .order("decision_date", { ascending: false }),
  ]);

  const decisionTitle = new Map<string, string>(
    (decisions ?? []).map((d: any) => [d.id, d.title as string]),
  );
  const linked = new Set<string>((linkRows ?? []).map((l: any) => l.from_entity_id));

  return {
    enabled,
    links: (linkRows ?? []).map((l: any) => ({
      id: l.id,
      decision_id: l.from_entity_id,
      decision_title: decisionTitle.get(l.from_entity_id) ?? "(decision on another implementation)",
      source: l.source ?? "manual",
    })),
    candidates: (decisions ?? [])
      .filter((d: any) => !linked.has(d.id))
      .map((d: any) => ({ id: d.id, title: d.title })),
  };
}

export async function linkDecisionToSolution(
  decisionId: string,
  solutionId: string,
  actorProfileId: string,
): Promise<SolutionTraceView> {
  if (!(await isFlagOn("trace_links_editing"))) {
    throw new Error("Trace-link editing is not enabled.");
  }
  const built = manualEdge(decisionId, solutionId);
  if (!built.ok) throw new Error(built.reason);

  // Both ends must belong to the same implementation. The renderer walks these
  // edges outward eight hops, so an edge across two customers would put one
  // customer's decision on another customer's page.
  const [{ data: decision }, { data: solution }] = await Promise.all([
    db()
      .from("decisions")
      .select("id, implementation_id, org_id")
      .eq("id", decisionId)
      .maybeSingle(),
    db()
      .from("technical_solutions")
      .select("id, implementation_id")
      .eq("id", solutionId)
      .maybeSingle(),
  ]);
  if (!decision || !solution) throw new Error("That decision or solution does not exist.");
  if (decision.implementation_id !== solution.implementation_id) {
    throw new Error("A decision can only be linked to a solution on the same implementation.");
  }

  const { error } = await db()
    .from("trace_links")
    .upsert(
      { ...built.edge, org_id: decision.org_id, source: "manual" },
      {
        onConflict: "from_entity_type,from_entity_id,relationship,to_entity_type,to_entity_id",
      },
    );
  if (error) throw new Error(error.message);

  await audit({
    actor_type: "user",
    actor_id: actorProfileId,
    action: "trace_link.create",
    entity_type: "technical_solution",
    entity_id: solutionId,
    payload: { decision_id: decisionId },
  });
  return loadSolutionTrace(solutionId);
}

export async function unlinkDecisionFromSolution(
  linkId: string,
  solutionId: string,
  actorProfileId: string,
): Promise<SolutionTraceView> {
  if (!(await isFlagOn("trace_links_editing"))) {
    throw new Error("Trace-link editing is not enabled.");
  }
  // Only manual links can be removed by hand. A derived one is a projection of
  // a foreign key; deleting it here would just be re-created by the trigger,
  // and offering the button would be a lie.
  const { error } = await db().from("trace_links").delete().eq("id", linkId).eq("source", "manual");
  if (error) throw new Error(error.message);

  await audit({
    actor_type: "user",
    actor_id: actorProfileId,
    action: "trace_link.delete",
    entity_type: "technical_solution",
    entity_id: solutionId,
    payload: { link_id: linkId },
  });
  return loadSolutionTrace(solutionId);
}

/* ========================================================================= */
/* Audit health                                                              */
/* ========================================================================= */

export type AuditHealth = {
  /** Per-instance counter — a smoke alarm, not a ledger. */
  processFailures: number;
  lastFailureAction: string | null;
  lastFailureError: string | null;
  lastFailureAt: string | null;
  /** Rows the 0025 database triggers wrote, newest first. */
  observed: Array<{
    id: string;
    action: string;
    entity_id: string | null;
    created_at: string;
    /** True when no app-written row was found for the same entity and event. */
    unattributed: boolean;
  }>;
  strict: boolean;
  activityFeed: boolean;
  /** Unacknowledged audit_write_failed alerts. */
  openAlerts: number;
};

/**
 * The reconciliation the design turns on: 0025's triggers write `.observed`
 * rows transactionally with the change, and `audit()` writes the attributed row
 * separately. An observed row with no attributed sibling is the evidence that
 * the app-side audit silently failed — which is the failure this whole phase
 * exists to make impossible to miss.
 */
export async function loadAuditHealth(): Promise<AuditHealth> {
  const counter = auditHealthCounter();

  const { data: observed } = await db()
    .from("portal_audit_log")
    .select("id, action, entity_id, created_at")
    .like("action", "%.observed")
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = observed ?? [];
  const entityIds = rows.map((r: any) => r.entity_id).filter(Boolean);
  const { data: attributed } = entityIds.length
    ? await db()
        .from("portal_audit_log")
        .select("action, entity_id")
        .in("entity_id", entityIds)
        .neq("actor_type", "system")
    : { data: [] };

  const attributedKeys = new Set((attributed ?? []).map((a: any) => `${a.action}:${a.entity_id}`));

  const { count: openAlerts } = await db()
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .eq("kind", "audit_write_failed")
    .is("acknowledged_at", null);

  return {
    processFailures: counter.failures,
    lastFailureAction: counter.lastAction,
    lastFailureError: counter.lastError,
    lastFailureAt: counter.lastAt,
    observed: rows.map((r: any) => ({
      id: r.id,
      action: r.action,
      entity_id: r.entity_id ?? null,
      created_at: r.created_at,
      unattributed: !attributedKeys.has(
        `${String(r.action).replace(/\.observed$/, "")}:${r.entity_id}`,
      ),
    })),
    strict: await isFlagOn("audit_strict"),
    activityFeed: await isFlagOn("audit_activity_feed"),
    openAlerts: openAlerts ?? 0,
  };
}
