import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { technicalSolutionNextAction } from "./customer360-derive";
import { normalizeStage } from "./hub-format";
import { nextLifecycleStage } from "./stage-advance-input";
import { LAUNCH_STAGE, launchAcceptanceGate, launchGateMessage } from "./launch-gate";
import type {
  Customer360,
  CommitmentRow,
  HomeData,
  ImplementationRow,
  LeadershipData,
  SignalRow,
  TechnicalSolutionDetail,
  TechnicalSolutionRow,
  TraceStep,
} from "./hub-types";

const db = () => supabaseAdmin as any;

function isOverdue(due: string | null | undefined) {
  if (!due) return false;
  return new Date(due).getTime() < Date.now();
}

async function loadTeam() {
  const { data } = await db().from("team_members").select("id,name,role");
  const map = new Map<string, { name: string; role: string }>();
  for (const m of data ?? []) map.set(m.id, { name: m.name, role: m.role });
  return map;
}

export async function loadImplementations(): Promise<ImplementationRow[]> {
  const team = await loadTeam();
  const [{ data: impls }, { data: customers }, { data: commitments }, { data: escalations }] =
    await Promise.all([
      db().from("implementations").select("*"),
      db().from("customers").select("*"),
      db().from("commitments").select("implementation_id,due_date,status"),
      db().from("escalations").select("implementation_id,status"),
    ]);

  const customerMap = new Map((customers ?? []).map((c: any) => [c.id, c]));

  return (impls ?? []).map((i: any) => {
    const c: any = customerMap.get(i.customer_id) ?? {};
    return {
      id: i.id,
      name: i.name,
      customer_id: i.customer_id,
      customer_name: c.name ?? "Unknown customer",
      segment: c.segment ?? null,
      industry: c.industry ?? null,
      arr: c.arr ?? null,
      current_stage: i.current_stage,
      stage_entered_at: i.stage_entered_at,
      status: i.status,
      health_recorded: i.health_recorded ?? null,
      health_recorded_reason: i.health_recorded_reason ?? null,
      owner_name: i.owner_id ? (team.get(i.owner_id)?.name ?? null) : null,
      tier: i.tier,
      target_launch_date: i.target_launch_date,
      actual_launch_date: i.actual_launch_date,
      overdue_commitments: (commitments ?? []).filter(
        (m: any) => m.implementation_id === i.id && m.status === "open" && isOverdue(m.due_date),
      ).length,
      open_escalations: (escalations ?? []).filter(
        (e: any) => e.implementation_id === i.id && e.status === "open",
      ).length,
    };
  });
}

export async function loadHome(): Promise<HomeData> {
  const [implementations, team] = await Promise.all([loadImplementations(), loadTeam()]);
  const implById = new Map(implementations.map((i) => [i.id, i]));

  const { data: commitmentRows } = await db()
    .from("commitments")
    .select("*")
    .neq("status", "fulfilled")
    .order("due_date", { ascending: true });

  const commitments: CommitmentRow[] = (commitmentRows ?? [])
    .filter((c: any) => c.status !== "cancelled")
    .map((c: any) => {
      const impl = implById.get(c.implementation_id);
      return {
        id: c.id,
        description: c.description,
        due_date: c.due_date,
        status: c.status,
        committed_to: c.committed_to,
        owner_name: c.owner_id ? (team.get(c.owner_id)?.name ?? null) : null,
        implementation_id: c.implementation_id,
        customer_id: impl?.customer_id ?? "",
        customer_name: impl?.customer_name ?? "Unknown customer",
      };
    });

  const [{ data: audit }, { data: risks }, { data: issues }, { data: escalations }] =
    await Promise.all([
      db().from("audit_log").select("*").order("changed_at", { ascending: false }).limit(25),
      db().from("risks").select("*").order("identified_at", { ascending: false }).limit(15),
      db().from("issues").select("*").order("raised_at", { ascending: false }).limit(15),
      db().from("escalations").select("*").order("raised_at", { ascending: false }).limit(15),
    ]);

  const implContext = (id: string | null) => {
    const impl = id ? implById.get(id) : undefined;
    return {
      customer_id: impl?.customer_id ?? null,
      customer_name: impl?.customer_name ?? null,
      implementation_id: impl?.id ?? null,
    };
  };

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  /** Ownership audit values are team_member ids; resolve to names, never leak a raw uuid. */
  const ownerLabel = (value: string | null | undefined) => {
    if (!value) return "Unassigned";
    const name = team.get(value)?.name;
    if (name) return name;
    return UUID_RE.test(value) ? "Unknown team member" : value;
  };
  const isOwnerField = (field: string | null | undefined) => field === "owner_id";

  const signal: SignalRow[] = [
    ...(audit ?? []).map((a: any) => ({
      key: `audit-${a.id}`,
      kind: "audit" as const,
      title: isOwnerField(a.field_name)
        ? `${a.entity_type} · Owner changed`
        : a.field_name
          ? `${a.entity_type} · ${a.field_name} changed`
          : `${a.entity_type} updated`,
      detail: isOwnerField(a.field_name)
        ? `${ownerLabel(a.old_value)} → ${ownerLabel(a.new_value)}${a.change_reason ? ` · ${a.change_reason}` : ""}`
        : a.field_name
          ? `${a.old_value ?? "—"} → ${a.new_value ?? "—"}${a.change_reason ? ` · ${a.change_reason}` : ""}`
          : a.change_reason,
      at: a.changed_at,
      actor: a.changed_by ? (team.get(a.changed_by)?.name ?? null) : null,
      ...implContext(a.entity_type === "implementation" ? a.entity_id : null),
    })),
    ...(risks ?? []).map((r: any) => ({
      key: `risk-${r.id}`,
      kind: "risk" as const,
      title: `Risk raised · ${r.title}`,
      detail: `${r.severity} severity · ${r.likelihood} likelihood · ${r.status}`,
      at: r.identified_at,
      actor: null,
      ...implContext(r.implementation_id),
    })),
    ...(issues ?? []).map((r: any) => ({
      key: `issue-${r.id}`,
      kind: "issue" as const,
      title: `Issue opened · ${r.title}`,
      detail: `${r.severity} severity · ${r.status}`,
      at: r.raised_at,
      actor: null,
      ...implContext(r.implementation_id),
    })),
    ...(escalations ?? []).map((r: any) => ({
      key: `esc-${r.id}`,
      kind: "escalation" as const,
      title: `Escalation · ${r.title}`,
      detail: `${r.severity} · ${r.status}`,
      at: r.raised_at,
      actor: r.raised_by ? (team.get(r.raised_by)?.name ?? null) : null,
      ...implContext(r.implementation_id),
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 30);

  // Per-implementation open-item bundles for the triaged Home queue.
  const [
    { data: allRisks },
    { data: allIssues },
    { data: allEscalations },
    { data: allMilestones },
    { data: allDecisions },
  ] = await Promise.all([
    db().from("risks").select("*"),
    db().from("issues").select("*"),
    db().from("escalations").select("*"),
    db().from("milestones").select("*"),
    db().from("decisions").select("*"),
  ]);

  // Success criteria + their observations/confirmations, for due_stage lateness.
  const [{ data: allCriteria }, { data: allObservations }, { data: allApprovals }] =
    await Promise.all([
      db().from("success_criteria").select("*"),
      db().from("success_criteria_observations").select("*"),
      db().from("approvals").select("*"),
    ]);
  const criteriaRows = (allCriteria ?? []).map((c: any) => ({
    ...c,
    observations: (allObservations ?? []).filter((o: any) => o.success_criteria_id === c.id),
    confirmations: (allApprovals ?? []).filter(
      (a: any) => a.approved_entity_type === "success_criterion" && a.approved_entity_id === c.id,
    ),
  }));

  // Dependency inputs for the shared waitingOn signal (no schema change).
  const [
    { data: allSolutions },
    { data: allMappings },
    { data: allAreas },
    { data: allAdoptionObs },
  ] = await Promise.all([
    db().from("technical_solutions").select("*"),
    db().from("field_mappings").select("*"),
    db().from("adoption_areas").select("*"),
    db().from("adoption_observations").select("*"),
  ]);

  const solutionRows = (allSolutions ?? []).map((s: any) => ({
    ...s,
    owner_name: s.owner_id ? (team.get(s.owner_id)?.name ?? null) : null,
    field_mappings: (allMappings ?? []).filter((m: any) => m.technical_solution_id === s.id),
  }));
  const adoptionRows = (allAreas ?? []).map((a: any) => ({
    ...a,
    owner_name: a.owner_id ? (team.get(a.owner_id)?.name ?? null) : null,
    observations: (allAdoptionObs ?? [])
      .filter((o: any) => o.adoption_area_id === a.id)
      .sort((x: any, y: any) => String(y.observed_at).localeCompare(String(x.observed_at))),
  }));

  const withOwner = (rows: any[] | null) =>
    (rows ?? []).map((r: any) => ({
      ...r,
      owner_name: r.owner_id ? (team.get(r.owner_id)?.name ?? null) : null,
    }));

  const forImpl = (rows: any[], id: string) => rows.filter((r) => r.implementation_id === id);
  const riskRows = withOwner(allRisks);
  const issueRows = withOwner(allIssues);
  const escalationRows = withOwner(allEscalations);
  const milestoneRows = withOwner(allMilestones);
  const decisionRows = allDecisions ?? [];
  const approvalRows = allApprovals ?? [];

  const triage = implementations.map((i) => ({
    implementation_id: i.id,
    commitments: commitments.filter((c) => c.implementation_id === i.id),
    risks: forImpl(riskRows, i.id),
    issues: forImpl(issueRows, i.id),
    escalations: forImpl(escalationRows, i.id),
    milestones: forImpl(milestoneRows, i.id),
    decisions: forImpl(decisionRows, i.id),
    success_criteria: forImpl(criteriaRows, i.id),
    technical_solutions: forImpl(solutionRows, i.id),
    approvals: forImpl(approvalRows, i.id),
    adoption: forImpl(adoptionRows, i.id),
  }));

  return { implementations, commitments, signal, triage };
}

/**
 * Leadership layer loader. Built entirely on the Home query set plus stage
 * history durations and a scoped full-record fetch for graduation candidates.
 */
export async function loadLeadership(): Promise<LeadershipData> {
  const home = await loadHome();

  const { data: history } = await db()
    .from("implementation_stage_history")
    .select("implementation_id,stage,entered_at,exited_at")
    .order("entered_at", { ascending: true });

  const candidates = home.implementations.filter((i) =>
    ["adopt", "graduate-to-cs"].includes(normalizeStage(i.current_stage) ?? ""),
  );

  const records = await Promise.all(
    candidates.map(async (i) => ({
      implementation_id: i.id,
      customer_id: i.customer_id,
      record: await loadCustomer360(i.customer_id),
    })),
  );

  return {
    ...home,
    stage_history: (history ?? []) as LeadershipData["stage_history"],
    graduation_candidates: records.filter(
      (r): r is { implementation_id: string; customer_id: string; record: Customer360 } =>
        r.record != null,
    ),
  };
}

function label(entityType: string, row: any): string {
  if (!row) return "(missing)";
  return row.title ?? row.name ?? row.description ?? entityType;
}

export async function loadCustomer360(
  customerId: string,
  implementationId?: string | null,
): Promise<Customer360 | null> {
  const team = await loadTeam();
  const { data: activeTeam } = await db()
    .from("team_members")
    .select("id,name,role")
    .eq("active", true)
    .order("name");
  const teamOptions = (activeTeam ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    role: t.role,
  }));
  const { data: customer } = await db()
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .maybeSingle();
  if (!customer) return null;

  const { data: contactRows } = await db()
    .from("customer_contacts")
    .select("id,name,role,email,notes")
    .eq("customer_id", customerId)
    .order("name");
  const contacts = (contactRows ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    email: c.email ?? null,
    notes: c.notes ?? null,
  }));
  const contactById = new Map<string, any>(contacts.map((c: any) => [c.id, c]));

  const { data: impls } = await db()
    .from("implementations")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  const implList = (impls ?? []) as any[];
  // A customer can run several implementations at once. The caller picks one;
  // without a pick we show the newest, and an unknown id falls back the same way.
  const impl =
    (implementationId ? implList.find((i) => i.id === implementationId) : null) ?? implList[0];
  const implementationSummaries = implList.map((i) => ({
    id: i.id,
    name: i.name,
    current_stage: i.current_stage,
    stage_entered_at: i.stage_entered_at,
    status: i.status,
    health_recorded: i.health_recorded ?? null,
    health_recorded_reason: i.health_recorded_reason ?? null,
    health_recorded_at: i.health_recorded_at ?? null,
    owner_name: i.owner_id ? (team.get(i.owner_id)?.name ?? null) : null,
    target_launch_date: i.target_launch_date ?? null,
  }));

  const base: Customer360 = {
    customer: {
      id: customer.id,
      name: customer.name,
      industry: customer.industry,
      segment: customer.segment,
      arr: customer.arr,
      region: customer.region,
    },
    implementation: null,
    requirements: [],
    success_criteria: [],
    adoption: [],
    graduation: null,
    cs_handoff: null,
    team: teamOptions,
    implementations: implementationSummaries,
    journal: [],
    contacts,
    milestones: [],
    commitments: [],
    decisions: [],
    risks: [],
    issues: [],
    escalations: [],
    technical_solutions: [],
    evidence: [],
    approvals: [],
    stage_history: [],
    audit_log: [],
  };
  if (!impl) return base;

  const child = (table: string, order: string, asc = true) =>
    db().from(table).select("*").eq("implementation_id", impl.id).order(order, { ascending: asc });

  const [
    requirements,
    successCriteria,
    milestones,
    commitments,
    decisions,
    risks,
    issues,
    escalations,
    solutions,
    mappings,
    evidence,
    approvals,
    stageHistory,
    traceLinks,
  ] = await Promise.all([
    child("requirements", "created_at"),
    child("success_criteria", "created_at"),
    child("milestones", "target_date"),
    child("commitments", "due_date"),
    child("decisions", "decision_date", false),
    child("risks", "identified_at", false),
    child("issues", "raised_at", false),
    child("escalations", "raised_at", false),
    child("technical_solutions", "created_at"),
    child("field_mappings", "created_at"),
    child("evidence", "created_at", false),
    child("approvals", "requested_at", false),
    child("implementation_stage_history", "entered_at"),
    db().from("trace_links").select("*"),
  ]);

  const named = (id: string | null | undefined) => (id ? (team.get(id)?.name ?? null) : null);

  // Traceability spine: walk trace_links outward from each requirement.
  const lookup = new Map<string, any>();
  const register = (type: string, rows: any[] | null) =>
    (rows ?? []).forEach((r) => lookup.set(`${type}:${r.id}`, r));
  register("requirement", requirements.data);
  register("decision", decisions.data);
  register("technical_solution", solutions.data);
  register("evidence", evidence.data);
  register("approval", approvals.data);
  register("milestone", milestones.data);
  register("success_criterion", successCriteria.data);
  register("success_criteria", successCriteria.data);
  register("requirements", requirements.data);
  register("decisions", decisions.data);
  register("technical_solutions", solutions.data);
  register("milestones", milestones.data);
  register("risk", risks.data);
  register("risks", risks.data);
  register("issue", issues.data);
  register("issues", issues.data);
  register("escalation", escalations.data);
  register("escalations", escalations.data);
  register("commitment", commitments.data);
  register("commitments", commitments.data);
  register("approvals", approvals.data);

  const linksFrom = new Map<string, any[]>();
  for (const l of traceLinks.data ?? []) {
    const key = `${l.from_entity_type}:${l.from_entity_id}`;
    linksFrom.set(key, [...(linksFrom.get(key) ?? []), l]);
  }

  const traceFor = (requirementId: string): TraceStep[] => {
    const steps: TraceStep[] = [];
    const seen = new Set<string>();
    let frontier = [`requirement:${requirementId}`];
    while (frontier.length && steps.length < 8) {
      const next: string[] = [];
      for (const key of frontier) {
        for (const l of linksFrom.get(key) ?? []) {
          const target = `${l.to_entity_type}:${l.to_entity_id}`;
          if (seen.has(target)) continue;
          seen.add(target);
          steps.push({
            entity_type: l.to_entity_type,
            id: l.to_entity_id,
            label: label(l.to_entity_type, lookup.get(target)),
            relationship: l.relationship,
          });
          next.push(target);
        }
      }
      frontier = next;
    }
    return steps;
  };

  // Reverse index: which entities point at a given entity.
  const linksTo = new Map<string, any[]>();
  for (const l of traceLinks.data ?? []) {
    const key = `${l.to_entity_type}:${l.to_entity_id}`;
    linksTo.set(key, [...(linksTo.get(key) ?? []), l]);
  }

  const stepOf = (type: string, id: string, relationship: string): TraceStep => ({
    entity_type: type,
    id,
    label: label(type, lookup.get(`${type}:${id}`)),
    relationship,
  });

  /** Real validation state for a requirement, from linked approvals/evidence. */
  const validationFor = (trace: TraceStep[]) => {
    const approvals = trace
      .filter((s) => s.entity_type === "approval")
      .map((s) => lookup.get(`approval:${s.id}`))
      .filter(Boolean);
    const evidenceItems = trace
      .filter((s) => s.entity_type === "evidence")
      .map((s) => lookup.get(`evidence:${s.id}`))
      .filter(Boolean);
    return {
      approval_status: approvals.length
        ? (approvals.find((a: any) => a.status === "approved") ?? approvals[0]).status
        : null,
      approver: approvals.length
        ? [approvals[0].approver_name, approvals[0].approver_role].filter(Boolean).join(" · ") ||
          null
        : null,
      evidence_count: evidenceItems.length,
    };
  };

  const entityLabelFor = (type: string | null, id: string | null) => {
    if (!type || !id) return null;
    const row = lookup.get(`${type}:${id}`);
    return row ? label(type, row) : null;
  };

  const riskById = new Map((risks.data ?? []).map((r: any) => [r.id, r]));
  const issueById = new Map((issues.data ?? []).map((r: any) => [r.id, r]));

  // Prove Value: observations for this implementation's criteria (empty-safe).
  const criterionIds = (successCriteria.data ?? []).map((c: any) => c.id);
  let observations: any[] = [];
  if (criterionIds.length) {
    const { data } = await db()
      .from("success_criteria_observations")
      .select("*")
      .in("success_criteria_id", criterionIds)
      .order("observed_at", { ascending: false });
    observations = data ?? [];
  }
  const evidenceById = new Map<string, any>(
    (evidence.data ?? []).map((e: any) => [
      e.id,
      { id: e.id, type: e.type, title: e.title, url: e.url },
    ]),
  );

  // Adoption: intended user groups / workflows and their behavioural observations.
  const { data: adoptionAreas } = await db()
    .from("adoption_areas")
    .select("*")
    .eq("implementation_id", impl.id)
    .order("created_at", { ascending: true });
  const areaIds = (adoptionAreas ?? []).map((a: any) => a.id);
  let adoptionObservations: any[] = [];
  if (areaIds.length) {
    const { data } = await db()
      .from("adoption_observations")
      .select("*")
      .in("adoption_area_id", areaIds)
      .order("observed_at", { ascending: false });
    adoptionObservations = data ?? [];
  }

  // Graduation / CS handoff: read-only context for the readiness view.
  const [graduationRes, handoffRes] = await Promise.all([
    db()
      .from("graduations")
      .select("*")
      .eq("implementation_id", impl.id)
      .order("created_at", { ascending: false })
      .limit(1),
    db()
      .from("cs_handoffs")
      .select("*")
      .eq("implementation_id", impl.id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const graduationRow: any = (graduationRes.data ?? [])[0] ?? null;
  const handoffRow: any = (handoffRes.data ?? [])[0] ?? null;

  // Working notes, newest first. Each row already carries the stage it was
  // written in, so the timeline never has to guess after the fact.
  const { data: journalRows } = await db()
    .from("journal_entries")
    .select("*")
    .eq("implementation_id", impl.id)
    .order("created_at", { ascending: false });

  return {
    ...base,
    journal: (journalRows ?? []).map((j: any) => ({
      id: j.id,
      implementation_id: j.implementation_id,
      stage: j.stage,
      note: j.note,
      author_id: j.author_id ?? null,
      author_name: named(j.author_id),
      links: j.links ?? null,
      attachment_url: j.attachment_url ?? null,
      attachment_name: j.attachment_name ?? null,
      created_at: j.created_at,
    })),
    implementation: {
      id: impl.id,
      name: impl.name,
      current_stage: impl.current_stage,
      stage_entered_at: impl.stage_entered_at,
      status: impl.status,
      health_recorded: impl.health_recorded ?? null,
      health_recorded_reason: impl.health_recorded_reason ?? null,
      health_recorded_at: impl.health_recorded_at ?? null,
      owner_id: impl.owner_id ?? null,
      owner_name: named(impl.owner_id),
      sales_owner: impl.sales_owner,
      tier: impl.tier,
      sow_reference: impl.sow_reference,
      sow_document_url: impl.sow_document_url ?? null,
      sow_document_name: impl.sow_document_name ?? null,
      sow_value: impl.sow_value,
      sow_signed_date: impl.sow_signed_date,
      contract_start_date: impl.contract_start_date,
      target_launch_date: impl.target_launch_date,
      actual_launch_date: impl.actual_launch_date,
      customer_goals: impl.customer_goals,
      discovery_board_url: impl.discovery_board_url ?? null,
      discovery_board_image_url: impl.discovery_board_image_url ?? null,
      discovery_board_image_name: impl.discovery_board_image_name ?? null,
      discovery_board_notes: impl.discovery_board_notes ?? null,
    },
    requirements: (requirements.data ?? []).map((r: any) => {
      const trace = traceFor(r.id);
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        category: r.category,
        priority: r.priority,
        status: r.status,
        source: r.source,
        // Carried through for the edit form's prefill; display is unchanged.
        scope_status: r.scope_status,
        created_by: r.created_by ?? null,
        owner_name: named(r.created_by),

        trace,
        validation: validationFor(trace),
      };
    }),
    team: teamOptions,
    contacts,
    graduation: graduationRow
      ? {
          id: graduationRow.id,
          graduated_at: graduationRow.graduated_at ?? null,
          health_at_graduation: graduationRow.health_at_graduation ?? null,
          exit_criteria_summary: graduationRow.exit_criteria_summary ?? null,
          cs_owner_name: named(graduationRow.cs_owner_id),
          notes: graduationRow.notes ?? null,
        }
      : null,
    cs_handoff: handoffRow
      ? {
          id: handoffRow.id,
          handoff_date: handoffRow.handoff_date ?? null,
          cs_owner_name: named(handoffRow.cs_owner_id),
          summary: handoffRow.summary ?? null,
          open_items: handoffRow.open_items ?? null,
          account_context: handoffRow.account_context ?? null,
        }
      : null,
    adoption: (adoptionAreas ?? []).map((a: any) => ({
      ...a,
      owner_name: named(a.owner_id),
      customer_owner_name: a.customer_owner_contact_id
        ? (contactById.get(a.customer_owner_contact_id)?.name ?? null)
        : null,
      customer_owner_role: a.customer_owner_contact_id
        ? (contactById.get(a.customer_owner_contact_id)?.role ?? null)
        : null,
      observations: adoptionObservations
        .filter((o: any) => o.adoption_area_id === a.id)
        .map((o: any) => ({
          ...o,
          observed_by_name: named(o.observed_by),
          evidence: o.evidence_id ? (evidenceById.get(o.evidence_id) ?? null) : null,
        })),
    })),
    success_criteria: (successCriteria.data ?? []).map((c: any) => ({
      ...c,
      owner_name: named(c.owner_id),
      customer_owner_name: c.customer_owner_contact_id
        ? (contactById.get(c.customer_owner_contact_id)?.name ?? null)
        : null,
      customer_owner_role: c.customer_owner_contact_id
        ? (contactById.get(c.customer_owner_contact_id)?.role ?? null)
        : null,
      observations: (observations ?? [])
        .filter((o: any) => o.success_criteria_id === c.id)
        .map((o: any) => ({
          ...o,
          observed_by_name: named(o.observed_by),
          evidence: o.evidence_id ? (evidenceById.get(o.evidence_id) ?? null) : null,
        })),
      confirmations: (approvals.data ?? [])
        .filter(
          (a: any) =>
            a.approved_entity_type === "success_criterion" && a.approved_entity_id === c.id,
        )
        .map((a: any) => ({
          id: a.id,
          title: a.title,
          status: a.status,
          approver_name: a.approver_name,
          approver_role: a.approver_role,
          requested_at: a.requested_at,
          decided_at: a.decided_at,
          evidence_id: a.evidence_id,
          customer_contact_id: a.customer_contact_id ?? null,
          contact_name: a.customer_contact_id
            ? (contactById.get(a.customer_contact_id)?.name ?? null)
            : null,
          contact_role: a.customer_contact_id
            ? (contactById.get(a.customer_contact_id)?.role ?? null)
            : null,
          evidence: a.evidence_id ? (evidenceById.get(a.evidence_id) ?? null) : null,
        })),
    })),
    milestones: (milestones.data ?? []).map((m: any) => ({
      ...m,
      owner_name: named(m.owner_id),
    })),
    commitments: (commitments.data ?? []).map((c: any) => ({
      ...c,
      owner_name: named(c.owner_id),
      made_by_name: named(c.made_by),
    })),
    decisions: (decisions.data ?? []).map((d: any) => ({
      ...d,
      links: [
        ...(linksFrom.get(`decision:${d.id}`) ?? []).map((l: any) =>
          stepOf(l.to_entity_type, l.to_entity_id, l.relationship),
        ),
        ...(linksTo.get(`decision:${d.id}`) ?? []).map((l: any) =>
          stepOf(l.from_entity_type, l.from_entity_id, l.relationship),
        ),
      ],
    })),
    risks: (risks.data ?? []).map((r: any) => ({ ...r, owner_name: named(r.owner_id) })),
    issues: (issues.data ?? []).map((r: any) => ({ ...r, owner_name: named(r.owner_id) })),
    escalations: (escalations.data ?? []).map((r: any) => ({
      ...r,
      raised_by_name: named(r.raised_by),
      related_issue_title: r.related_issue_id
        ? ((issueById.get(r.related_issue_id) as any)?.title ?? null)
        : null,
      related_risk_title: r.related_risk_id
        ? ((riskById.get(r.related_risk_id) as any)?.title ?? null)
        : null,
    })),
    technical_solutions: (solutions.data ?? []).map((s: any) => ({
      ...s,
      owner_name: named(s.owner_id),
      requirement_title: s.requirement_id ? entityLabelFor("requirement", s.requirement_id) : null,
      field_mappings: (mappings.data ?? []).filter((m: any) => m.technical_solution_id === s.id),
    })),
    evidence: (evidence.data ?? []).map((e: any) => ({
      ...e,
      uploaded_by_name: named(e.uploaded_by),
      related_label: entityLabelFor(e.related_entity_type, e.related_entity_id),
    })),
    approvals: (approvals.data ?? []).map((a: any) => ({
      ...a,
      approved_entity_label: entityLabelFor(a.approved_entity_type, a.approved_entity_id),
    })),

    stage_history: (stageHistory.data ?? []).map((h: any) => ({
      id: h.id,
      stage: h.stage,
      entered_at: h.entered_at,
      exited_at: h.exited_at,
      notes: h.notes,
      entered_by_name: named(h.entered_by),
    })),
    audit_log: await (async () => {
      const ids = [
        impl.id,
        ...(requirements.data ?? []).map((r: any) => r.id),
        ...(solutions.data ?? []).map((r: any) => r.id),
        ...(milestones.data ?? []).map((r: any) => r.id),
        ...(commitments.data ?? []).map((r: any) => r.id),
        ...(decisions.data ?? []).map((r: any) => r.id),
        ...(risks.data ?? []).map((r: any) => r.id),
        ...(issues.data ?? []).map((r: any) => r.id),
        ...(escalations.data ?? []).map((r: any) => r.id),
        ...(evidence.data ?? []).map((r: any) => r.id),
        ...(approvals.data ?? []).map((r: any) => r.id),
        ...(successCriteria.data ?? []).map((r: any) => r.id),
      ];

      const { data } = await db()
        .from("audit_log")
        .select("*")
        .in("entity_id", ids)
        .order("changed_at", { ascending: false });
      return (data ?? []).map((a: any) => ({
        id: a.id,
        entity_type: a.entity_type,
        field_name: a.field_name,
        old_value: a.old_value,
        new_value: a.new_value,
        change_reason: a.change_reason,
        changed_at: a.changed_at,
        // 0020 added actor_label for actors with no team_members row — a
        // customer acting through a signed plan link. Falling back to it is
        // what keeps "who did this" answerable in the activity feed.
        changed_by_name: named(a.changed_by) ?? a.actor_label ?? null,
      }));
    })(),
  };
}

export async function loadTechnicalSolutions(): Promise<TechnicalSolutionRow[]> {
  const team = await loadTeam();
  const [
    { data: solutions },
    { data: impls },
    { data: customers },
    { data: requirements },
    { data: mappings },
    { data: notes },
    { data: approvals },
    { data: traceLinks },
    { data: decisions },
  ] = await Promise.all([
    db().from("technical_solutions").select("*").order("created_at", { ascending: false }),
    db().from("implementations").select("id,name,customer_id"),
    db().from("customers").select("id,name"),
    db().from("requirements").select("id,title"),
    db().from("field_mappings").select("*"),
    db().from("technical_solution_notes").select("technical_solution_id"),
    db().from("approvals").select("*").eq("approved_entity_type", "technical_solution"),
    db().from("trace_links").select("*"),
    db().from("decisions").select("*"),
  ]);

  const implMap = new Map((impls ?? []).map((i: any) => [i.id, i]));
  const customerMap = new Map((customers ?? []).map((c: any) => [c.id, c]));
  const reqMap = new Map((requirements ?? []).map((r: any) => [r.id, r]));
  const decisionMap = new Map((decisions ?? []).map((d: any) => [d.id, d]));

  /** Decisions linked to a solution in either trace_links direction. */
  const decisionsFor = (solutionId: string) => {
    const key = `technical_solution:${solutionId}`;
    return (traceLinks ?? [])
      .filter(
        (l: any) =>
          `${l.from_entity_type}:${l.from_entity_id}` === key ||
          `${l.to_entity_type}:${l.to_entity_id}` === key,
      )
      .map((l: any) =>
        l.from_entity_type === "decision"
          ? decisionMap.get(l.from_entity_id)
          : l.to_entity_type === "decision"
            ? decisionMap.get(l.to_entity_id)
            : null,
      )
      .filter(Boolean);
  };

  return (solutions ?? []).map((s: any) => {
    const impl: any = implMap.get(s.implementation_id);
    const cust: any = impl ? customerMap.get(impl.customer_id) : null;
    return {
      id: s.id,
      title: s.title,
      status: s.status,
      owner_name: s.owner_id ? (team.get(s.owner_id)?.name ?? null) : null,
      requirement_title: s.requirement_id
        ? ((reqMap.get(s.requirement_id) as any)?.title ?? null)
        : null,
      implementation_id: s.implementation_id,
      implementation_name: impl?.name ?? "Unknown implementation",
      customer_id: impl?.customer_id ?? "",
      customer_name: cust?.name ?? "Unknown customer",
      next_needed: technicalSolutionNextAction({
        solution: { status: s.status },
        field_mappings: (mappings ?? []).filter((m: any) => m.technical_solution_id === s.id),
        notes: (notes ?? []).filter((n: any) => n.technical_solution_id === s.id),
        approvals: (approvals ?? []).filter((a: any) => a.approved_entity_id === s.id),
        decisions: decisionsFor(s.id),
      }),
    };
  });
}

export async function loadTechnicalSolution(id: string): Promise<TechnicalSolutionDetail | null> {
  const team = await loadTeam();
  const { data: solution } = await db()
    .from("technical_solutions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!solution) return null;

  const named = (uid: string | null | undefined) => (uid ? (team.get(uid)?.name ?? null) : null);

  const [
    { data: impl },
    { data: requirement },
    { data: notes },
    { data: mappings },
    { data: traceLinks },
    { data: evidence },
    { data: approvals },
    { data: ownership },
    { data: teamRows },
  ] = await Promise.all([
    db().from("implementations").select("*").eq("id", solution.implementation_id).maybeSingle(),
    solution.requirement_id
      ? db().from("requirements").select("*").eq("id", solution.requirement_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db()
      .from("technical_solution_notes")
      .select("*")
      .eq("technical_solution_id", id)
      .order("created_at", { ascending: false }),
    db().from("field_mappings").select("*").eq("technical_solution_id", id).order("created_at"),
    db().from("trace_links").select("*"),
    db()
      .from("evidence")
      .select("*")
      .eq("related_entity_type", "technical_solution")
      .eq("related_entity_id", id),
    db()
      .from("approvals")
      .select("*")
      .eq("approved_entity_type", "technical_solution")
      .eq("approved_entity_id", id),
    db()
      .from("audit_log")
      .select("*")
      .eq("entity_type", "technical_solution")
      .eq("entity_id", id)
      .eq("field_name", "owner_id")
      .order("changed_at", { ascending: false }),
    db().from("team_members").select("id,name,role").eq("active", true).order("name"),
  ]);

  const { data: customer } = impl
    ? await db().from("customers").select("*").eq("id", impl.customer_id).maybeSingle()
    : { data: null };

  // Decisions linked to this solution in either direction (same trace_links pattern
  // used by loadCustomer360).
  const links = traceLinks ?? [];
  const key = `technical_solution:${id}`;
  const related = links.filter(
    (l: any) =>
      `${l.from_entity_type}:${l.from_entity_id}` === key ||
      `${l.to_entity_type}:${l.to_entity_id}` === key,
  );
  const decisionIds = related
    .map((l: any) =>
      l.from_entity_type === "decision"
        ? l.from_entity_id
        : l.to_entity_type === "decision"
          ? l.to_entity_id
          : null,
    )
    .filter(Boolean) as string[];

  const { data: decisions } = decisionIds.length
    ? await db().from("decisions").select("*").in("id", decisionIds)
    : { data: [] };

  // Label lookup for trace steps.
  const lookup = new Map<string, any>();
  const register = (types: string[], rows: any[] | null) =>
    (rows ?? []).forEach((r: any) => types.forEach((t) => lookup.set(`${t}:${r.id}`, r)));
  register(["technical_solution", "technical_solutions"], [solution]);
  register(["requirement", "requirements"], requirement ? [requirement] : []);
  register(["decision", "decisions"], decisions ?? []);
  register(["evidence"], evidence ?? []);
  register(["approval", "approvals"], approvals ?? []);

  const stepOf = (type: string, entityId: string, relationship: string): TraceStep => ({
    entity_type: type,
    id: entityId,
    label: label(type, lookup.get(`${type}:${entityId}`)),
    relationship,
  });

  const trace: TraceStep[] = related.map((l: any) =>
    `${l.from_entity_type}:${l.from_entity_id}` === key
      ? stepOf(l.to_entity_type, l.to_entity_id, l.relationship)
      : stepOf(l.from_entity_type, l.from_entity_id, l.relationship),
  );

  // Second hop: requirements that point INTO one of the linked decisions.
  // Reached through an intermediate node, so kept separate from `trace`.
  const decisionKeys = new Set(decisionIds.flatMap((d) => [`decision:${d}`, `decisions:${d}`]));
  const indirectLinks = links.filter(
    (l: any) =>
      decisionKeys.has(`${l.to_entity_type}:${l.to_entity_id}`) &&
      (l.from_entity_type === "requirement" || l.from_entity_type === "requirements"),
  );
  const indirectRequirementIds = Array.from(
    new Set(indirectLinks.map((l: any) => l.from_entity_id as string)),
  );
  const { data: indirectRequirements } = indirectRequirementIds.length
    ? await db().from("requirements").select("*").in("id", indirectRequirementIds)
    : { data: [] };
  register(["requirement", "requirements"], indirectRequirements ?? []);

  const seenIndirect = new Set<string>();
  const linked_trace: TraceStep[] = [];
  for (const l of indirectLinks) {
    const k = `${l.from_entity_type}:${l.from_entity_id}:${l.relationship}`;
    if (seenIndirect.has(k)) continue;
    seenIndirect.add(k);
    linked_trace.push(stepOf(l.from_entity_type, l.from_entity_id, l.relationship));
  }

  return {
    solution: {
      id: solution.id,
      title: solution.title,
      status: solution.status,
      design_summary: solution.design_summary,
      configuration_details: solution.configuration_details,
      owner_id: solution.owner_id ?? null,
      owner_name: named(solution.owner_id),
      created_at: solution.created_at,
      updated_at: solution.updated_at,
    },
    customer: {
      id: customer?.id ?? "",
      name: customer?.name ?? "Unknown customer",
      industry: customer?.industry ?? null,
      segment: customer?.segment ?? null,
    },
    implementation: impl
      ? { id: impl.id, name: impl.name, current_stage: impl.current_stage }
      : null,
    requirement: requirement
      ? {
          id: requirement.id,
          title: requirement.title,
          status: requirement.status,
          priority: requirement.priority,
        }
      : null,
    team: (teamRows ?? []).map((t: any) => ({ id: t.id, name: t.name, role: t.role })),
    notes: (notes ?? []).map((n: any) => ({
      id: n.id,
      note_type: n.note_type,
      content: n.content,
      created_at: n.created_at,
      author_name: named(n.created_by),
      links: n.links ?? null,
      attachment_url: n.attachment_url ?? null,
      attachment_name: n.attachment_name ?? null,
    })),
    field_mappings: mappings ?? [],
    decisions: decisions ?? [],
    evidence: (evidence ?? []).map((e: any) => ({ ...e, uploaded_by_name: named(e.uploaded_by) })),
    approvals: approvals ?? [],
    ownership_history: (ownership ?? []).map((a: any) => ({
      id: a.id,
      old_value: named(a.old_value) ?? a.old_value,
      new_value: named(a.new_value) ?? a.new_value,
      change_reason: a.change_reason,
      changed_at: a.changed_at,
      changed_by_name: named(a.changed_by),
    })),
    trace,
    linked_trace,
  };
}

/* ---------- Mutations (Technical Solutions write layer) ---------- */

export async function updateTechnicalSolutionOwner(id: string, ownerId: string | null) {
  const { error } = await db()
    .from("technical_solutions")
    .update({ owner_id: ownerId })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function updateTechnicalSolutionStatus(id: string, status: string) {
  const { error } = await db().from("technical_solutions").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function addTechnicalSolutionNote(args: {
  technicalSolutionId: string;
  noteType: string;
  content: string;
  authorId: string | null;
  links: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
}) {
  const { error } = await db().from("technical_solution_notes").insert({
    technical_solution_id: args.technicalSolutionId,
    note_type: args.noteType,
    content: args.content,
    created_by: args.authorId,
    links: args.links,
    attachment_url: args.attachmentUrl,
    attachment_name: args.attachmentName,
  });
  if (error) throw new Error(`Could not save this entry: ${error.message}`);
  return { ok: true };
}

export type FieldMappingPatch = {
  source_field: string | null;
  source_system: string | null;
  target_field: string | null;
  transformation_notes: string | null;
  required: boolean | null;
  status: string | null;
};

/** A new mapping row is always created against the solution being worked on. */
export async function createFieldMapping(technicalSolutionId: string, patch: FieldMappingPatch) {
  const { data: solution, error: readError } = await db()
    .from("technical_solutions")
    .select("id,implementation_id")
    .eq("id", technicalSolutionId)
    .maybeSingle();
  if (readError || !solution) throw new Error(readError?.message ?? "Solution not found");

  const { error } = await db()
    .from("field_mappings")
    .insert({
      implementation_id: solution.implementation_id,
      technical_solution_id: solution.id,
      ...patch,
    });
  if (error) throw new Error(`Could not add this mapping: ${error.message}`);
  return { ok: true };
}

export async function updateFieldMapping(id: string, patch: FieldMappingPatch) {
  const { error } = await db().from("field_mappings").update(patch).eq("id", id);
  if (error) throw new Error(`Could not save this mapping: ${error.message}`);
  return { ok: true };
}

/** The design write-up and configuration notes kept on the solution itself. */
export async function updateTechnicalSolutionDesign(
  id: string,
  patch: { design_summary: string | null; configuration_details: string | null },
) {
  const { error } = await db()
    .from("technical_solutions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Could not save the design record: ${error.message}`);
  return { ok: true };
}

/* ---------- Mutations (Prove Value: success criterion write layer) ---------- */

export type SuccessCriterionPatch = {
  description: string;
  metric: string | null;
  baseline_value: string | null;
  target_value: string | null;
  measurement_source: string | null;
  due_stage: string | null;
  owner_id: string | null;
  baseline_period: string | null;
  target_date: string | null;
  customer_owner_contact_id: string | null;
};

export async function createSuccessCriterion(
  implementationId: string,
  patch: SuccessCriterionPatch,
) {
  // status starts at 'pending'; measured_value / measured_at are never written here
  // (they belong to observation handling). created_at uses the DB default.
  const { error } = await db()
    .from("success_criteria")
    .insert({ implementation_id: implementationId, status: "pending", ...patch });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function updateSuccessCriterion(id: string, patch: SuccessCriterionPatch) {
  const { error } = await db().from("success_criteria").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/* ---------- Mutations (Prove Value: observations + customer confirmation) ---------- */

/** Append-only: observations are never updated or deleted. */
export async function createSuccessCriterionObservation(row: {
  success_criteria_id: string;
  observed_value: string;
  observed_at: string;
  observed_by: string | null;
  source: string | null;
  assessment: string;
  notes: string | null;
  evidence_id: string | null;
}) {
  const { error } = await db().from("success_criteria_observations").insert(row);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Customer confirmation = an approvals row scoped to one success criterion. */
export async function createSuccessCriterionConfirmation(input: {
  implementationId: string;
  successCriteriaId: string;
  customerContactId: string;
  evidenceId: string | null;
  status: "pending" | "approved" | "rejected";
}) {
  const { data: contact, error: contactError } = await db()
    .from("customer_contacts")
    .select("id,name,role")
    .eq("id", input.customerContactId)
    .maybeSingle();
  if (contactError) throw new Error(contactError.message);
  if (!contact) throw new Error("Customer contact not found");

  const { data: criterion, error: criterionError } = await db()
    .from("success_criteria")
    .select("id,description")
    .eq("id", input.successCriteriaId)
    .maybeSingle();
  if (criterionError) throw new Error(criterionError.message);
  if (!criterion) throw new Error("Success criterion not found");

  const { error } = await db()
    .from("approvals")
    .insert({
      implementation_id: input.implementationId,
      title: `Customer confirmation · ${criterion.description}`,
      approved_entity_type: "success_criterion",
      approved_entity_id: input.successCriteriaId,
      customer_contact_id: contact.id,
      // Denormalised from the structured contact record — never free text.
      approver_name: contact.name,
      approver_role: contact.role,
      status: input.status,
      evidence_id: input.evidenceId,
      decided_at: input.status === "pending" ? null : new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function updateSuccessCriterionConfirmation(
  id: string,
  patch: { status: "pending" | "approved" | "rejected"; evidenceId: string | null },
) {
  const { error } = await db()
    .from("approvals")
    .update({
      status: patch.status,
      evidence_id: patch.evidenceId,
      decided_at: patch.status === "pending" ? null : new Date().toISOString(),
    })
    .eq("id", id)
    .eq("approved_entity_type", "success_criterion");
  if (error) throw new Error(error.message);
  return { ok: true };
}

/* ---------- Mutations (Adoption: intended usage + behavioural observations) ---------- */

export type AdoptionAreaPatch = {
  kind: string;
  name: string;
  intended_usage: string | null;
  owner_id: string | null;
  notes: string | null;
  intended_users: string | null;
  expected_frequency: string | null;
  in_use_definition: string | null;
  customer_owner_contact_id: string | null;
};

export async function createAdoptionArea(implementationId: string, patch: AdoptionAreaPatch) {
  const { error } = await db()
    .from("adoption_areas")
    .insert({ implementation_id: implementationId, ...patch });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function updateAdoptionArea(id: string, patch: AdoptionAreaPatch) {
  const { error } = await db()
    .from("adoption_areas")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Append-only: adoption observations are never updated or deleted. */
export async function createAdoptionObservation(row: {
  adoption_area_id: string;
  observed_at: string;
  observed_by: string | null;
  state: string;
  workaround_in_use: boolean;
  workaround_description: string | null;
  source: string | null;
  notes: string | null;
  evidence_id: string | null;
}) {
  const { error } = await db().from("adoption_observations").insert(row);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/* ---------- Mutations (Kickoff intake: named customer people) ---------- */

export type CustomerContactPatch = {
  name: string;
  role: string;
  email: string | null;
  notes: string | null;
};

function contactWriteError(message: string): Error {
  if (/role/i.test(message)) {
    return new Error("Select a contact type before saving.");
  }
  return new Error("Could not save this contact. Check the details and try again.");
}

export async function createCustomerContact(customerId: string, patch: CustomerContactPatch) {
  const { error } = await db()
    .from("customer_contacts")
    .insert({ customer_id: customerId, ...patch });
  if (error) throw contactWriteError(error.message);
  return { ok: true };
}

export async function updateCustomerContact(id: string, patch: CustomerContactPatch) {
  const { error } = await db()
    .from("customer_contacts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw contactWriteError(error.message);
  return { ok: true };
}

/* ---------- Mutations (Implementation creation) ---------- */

/** Owner picker options — same shape/query as the Customer 360 team options. */
export async function loadTeamOptions() {
  const { data } = await db()
    .from("team_members")
    .select("id,name,role")
    .eq("active", true)
    .order("name");
  return (data ?? []).map((t: any) => ({ id: t.id, name: t.name, role: t.role }));
}

/**
 * Origination of an implementation. The lifecycle starts at Handoff; the single
 * implementation_stage_history row is the first row of an append-only table
 * (no prior stage is closed — this is not stage advancement).
 */
export async function createImplementation(args: {
  customerId: string | null;
  newCustomer: {
    name: string;
    industry: string | null;
    region: string | null;
    segment: string | null;
    arr: number | null;
  } | null;
  patch: Record<string, unknown>;
}) {
  let customerId = args.customerId;

  if (!customerId) {
    if (!args.newCustomer) throw new Error("No customer supplied");
    const { data: created, error } = await db()
      .from("customers")
      .insert(args.newCustomer)
      .select("id")
      .single();
    // Only proceed once the customer row actually exists.
    if (error || !created) throw new Error(error?.message ?? "Could not create the customer");
    customerId = created.id as string;
  }

  const { data: impl, error: implError } = await db()
    .from("implementations")
    .insert({ ...args.patch, customer_id: customerId, current_stage: "handoff" })
    .select("id,stage_entered_at,created_at,owner_id")
    .single();

  if (implError || !impl) {
    const detail = implError?.message ?? "Could not create the implementation";
    throw new Error(
      args.customerId
        ? detail
        : `${detail} — the customer record was created, so select it as an existing customer and retry.`,
    );
  }

  const { error: historyError } = await db()
    .from("implementation_stage_history")
    .insert({
      implementation_id: impl.id,
      stage: "handoff",
      entered_at: impl.stage_entered_at ?? impl.created_at,
      entered_by: impl.owner_id ?? null,
      exited_at: null,
    });
  if (historyError) {
    throw new Error(
      `Implementation created, but its first stage history row failed: ${historyError.message}`,
    );
  }

  return { ok: true, customerId, implementationId: impl.id as string };
}

/**
 * Edit the facts of an existing implementation (owner, dates, commercial
 * context, what the customer wants). Stage is not editable here — it moves only
 * through stage advancement, which keeps the stage history authoritative.
 */
export async function updateImplementation(id: string, patch: Record<string, unknown>) {
  const { error } = await db()
    .from("implementations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw deliveryWriteError("implementations", error.message);
  return { ok: true };
}

/* ---------- Mutations (Stage advancement) ---------- */

/**
 * Move the stage_instances mirror to `toStage`.
 *
 * implementation_stage_history is the authority on stage transitions; these
 * rows are a read cache for the templated plan. A no-op when the
 * implementation has no instances (every pre-template record).
 */
async function syncStageInstances(
  implementationId: string,
  toStage: string,
  at: string,
): Promise<void> {
  try {
    const { data: instances } = await db()
      .from("stage_instances")
      .select("id, stage_key, position, status")
      .eq("implementation_id", implementationId)
      .order("position");
    if (!instances || instances.length === 0) return;

    const target = instances.find((s: any) => s.stage_key === toStage);
    if (!target) {
      // The plan does not contain the stage we just moved to. Recording the
      // disagreement beats writing a guess into the mirror.
      console.error(
        `[stage-sync] ${implementationId} advanced to ${toStage}, which has no stage_instance`,
      );
      return;
    }

    await db()
      .from("stage_instances")
      .update({ status: "done", exited_at: at })
      .eq("implementation_id", implementationId)
      .lt("position", target.position)
      .neq("status", "done");
    await db()
      .from("stage_instances")
      // provenance moves to 'live': the stage has now genuinely been entered
      // with a history row to prove it, so it must stop claiming its state was
      // inferred from stage order.
      .update({ status: "active", entered_at: at, provenance: "live" })
      .eq("id", target.id);

    // Stage-entry dates land now the stage has actually been entered. A
    // hand-set date is a recorded fact and is never overwritten.
    const { data: pending } = await db()
      .from("work_items")
      .select("id, due_offset_days")
      .eq("stage_instance_id", target.id)
      .eq("due_basis", "stage_entry")
      .is("due_at", null)
      .eq("due_at_edited", false);
    for (const item of pending ?? []) {
      const due = new Date(new Date(at).getTime() + (item.due_offset_days ?? 0) * 86_400_000);
      await db().from("work_items").update({ due_at: due.toISOString() }).eq("id", item.id);
    }
  } catch (e) {
    console.error(`[stage-sync] mirror update failed for ${implementationId}`, e);
  }
}

/**
 * Advance an implementation one stage along the existing lifecycle ordering.
 * Keeps the stored lifecycle state internally consistent: the open history row
 * is closed at the same instant the destination row is opened, and
 * implementations.stage_entered_at matches that instant.
 */
export async function advanceStage(args: {
  implementationId: string;
  toStage: string;
  enteredBy: string | null;
  notes: string | null;
}) {
  const { data: impl, error: readError } = await db()
    .from("implementations")
    .select("id,current_stage")
    .eq("id", args.implementationId)
    .single();
  if (readError || !impl) throw new Error(readError?.message ?? "Implementation not found");

  const current = normalizeStage(impl.current_stage);
  const expected = nextLifecycleStage(current);
  if (!expected) {
    throw new Error(
      `No next stage from ${impl.current_stage} — this implementation is at the end of the lifecycle.`,
    );
  }
  if (args.toStage !== expected) {
    throw new Error(
      `Only the next stage is allowed. Expected ${expected}, received ${args.toStage}.`,
    );
  }

  // Solution acceptance gate — enforced here, before anything is written, so a
  // blocked Launch leaves the implementation exactly as it was.
  if (expected === LAUNCH_STAGE) {
    const [{ data: solutions }, { data: approvals }] = await Promise.all([
      db()
        .from("technical_solutions")
        .select("id,title")
        .eq("implementation_id", args.implementationId),
      db()
        .from("approvals")
        .select("status,approved_entity_type,approved_entity_id,title,approver_name")
        .eq("implementation_id", args.implementationId)
        .eq("approved_entity_type", "technical_solution"),
    ]);
    const gate = launchAcceptanceGate({
      toStage: expected,
      solutions: solutions ?? [],
      approvals: approvals ?? [],
    });
    if (gate.blocked) throw new Error(launchGateMessage(gate));
  }

  const at = new Date().toISOString();

  const { error: closeError } = await db()
    .from("implementation_stage_history")
    .update({ exited_at: at })
    .eq("implementation_id", args.implementationId)
    .is("exited_at", null);
  if (closeError) throw new Error(`Could not close the current stage: ${closeError.message}`);

  const { error: insertError } = await db().from("implementation_stage_history").insert({
    implementation_id: args.implementationId,
    stage: expected,
    entered_at: at,
    entered_by: args.enteredBy,
    notes: args.notes,
    exited_at: null,
  });
  if (insertError) throw new Error(`Could not record the new stage: ${insertError.message}`);

  const { error: updateError } = await db()
    .from("implementations")
    .update({ current_stage: expected, stage_entered_at: at, updated_at: at })
    .eq("id", args.implementationId);
  if (updateError) throw new Error(`Could not update the current stage: ${updateError.message}`);

  // Keep the stage_instances mirror in step. UNCONDITIONAL, not flag-gated:
  // a mirror that only updates when a feature flag is on desyncs silently the
  // first time someone advances a stage with it off, and the desync is
  // invisible until the flag flips. History above is the authority, so a
  // failure here is logged loudly and repaired by resync_stage_instances
  // rather than failing an advance that has already been recorded.
  await syncStageInstances(args.implementationId, expected, at);

  // Stage dwell is a health input, so the cache is stale the moment we move.
  const { recomputeHealthSoon } = await import("./health.server");
  recomputeHealthSoon(args.implementationId);

  return { ok: true, stage: expected, enteredAt: at };
}

/* ---------- Mutations (P0 Slice 3: delivery records) ----------
 * Six existing tables, no schema change. Every write is scoped by
 * implementation_id on create; updates are keyed by row id only. Postgres
 * messages are translated to reviewer-readable language so no raw SQL or
 * constraint text ever reaches the UI.
 */

/** Human labels for the delivery tables, used in error messages. */
const DELIVERY_LABEL: Record<string, string> = {
  requirements: "requirement",
  risks: "risk",
  issues: "issue",
  escalations: "escalation",
  decisions: "decision",
  commitments: "commitment",
  evidence: "piece of proof",
  approvals: "approval request",
  implementations: "implementation",
};

function deliveryWriteError(table: string, message: string): Error {
  const label = DELIVERY_LABEL[table] ?? "record";
  if (/violates check constraint/i.test(message)) {
    return new Error(
      `That combination of values isn't allowed for a ${label}. Check the status, severity and priority selections.`,
    );
  }
  if (/violates foreign key constraint/i.test(message)) {
    return new Error(
      `A linked record referenced by this ${label} no longer exists. Reload the page and try again.`,
    );
  }
  if (/null value in column/i.test(message)) {
    return new Error(`This ${label} is missing a required field.`);
  }
  if (/invalid input syntax for type date|invalid input syntax for type timestamp/i.test(message)) {
    return new Error("One of the dates isn't a valid date.");
  }
  return new Error(`Could not save this ${label}. Check the details and try again.`);
}

/** Tables deriveHealth reads, so a write to one invalidates the health cache. */
const HEALTH_INPUT_TABLES = new Set(["risks", "issues", "escalations", "commitments"]);

async function insertDeliveryRow(
  table: string,
  implementationId: string,
  patch: Record<string, unknown>,
) {
  const { data, error } = await db()
    .from(table)
    .insert({ implementation_id: implementationId, ...patch })
    .select("id")
    .maybeSingle();
  if (error) throw deliveryWriteError(table, error.message);
  if (HEALTH_INPUT_TABLES.has(table)) {
    const { recomputeHealthSoon } = await import("./health.server");
    recomputeHealthSoon(implementationId);
  }
  return { ok: true, id: data?.id ?? null };
}

async function updateDeliveryRow(table: string, id: string, patch: Record<string, unknown>) {
  const { error } = await db().from(table).update(patch).eq("id", id);
  if (error) throw deliveryWriteError(table, error.message);
  if (HEALTH_INPUT_TABLES.has(table)) {
    // The update carries only the row id; the cache is keyed by implementation.
    const { data: row } = await db()
      .from(table)
      .select("implementation_id")
      .eq("id", id)
      .maybeSingle();
    const { recomputeHealthSoon } = await import("./health.server");
    recomputeHealthSoon(row?.implementation_id ?? null);
  }
  return { ok: true, id };
}

export const createRequirement = (implementationId: string, patch: Record<string, unknown>) =>
  insertDeliveryRow("requirements", implementationId, patch);
export const updateRequirement = (id: string, patch: Record<string, unknown>) =>
  updateDeliveryRow("requirements", id, patch);

export const createRisk = (implementationId: string, patch: Record<string, unknown>) =>
  insertDeliveryRow("risks", implementationId, patch);
export const updateRisk = (id: string, patch: Record<string, unknown>) =>
  updateDeliveryRow("risks", id, patch);

export const createIssue = (implementationId: string, patch: Record<string, unknown>) =>
  insertDeliveryRow("issues", implementationId, patch);
export const updateIssue = (id: string, patch: Record<string, unknown>) =>
  updateDeliveryRow("issues", id, patch);

export const createEscalation = (implementationId: string, patch: Record<string, unknown>) =>
  insertDeliveryRow("escalations", implementationId, patch);
export const updateEscalation = (id: string, patch: Record<string, unknown>) =>
  updateDeliveryRow("escalations", id, patch);

export const createDecision = (implementationId: string, patch: Record<string, unknown>) =>
  insertDeliveryRow("decisions", implementationId, patch);
export const updateDecision = (id: string, patch: Record<string, unknown>) =>
  updateDeliveryRow("decisions", id, patch);

export const createCommitment = (implementationId: string, patch: Record<string, unknown>) =>
  insertDeliveryRow("commitments", implementationId, patch);
export const updateCommitment = (id: string, patch: Record<string, unknown>) =>
  updateDeliveryRow("commitments", id, patch);

/* ---------- Mutations (Slice 4: evidence + approval requests) ----------
 * Two existing tables, no schema change. Both reuse the delivery insert/update
 * helpers so error translation and implementation scoping stay identical.
 */

export const createEvidence = (implementationId: string, patch: Record<string, unknown>) =>
  insertDeliveryRow("evidence", implementationId, patch);
export const updateEvidence = (id: string, patch: Record<string, unknown>) =>
  updateDeliveryRow("evidence", id, patch);

export const createApproval = (implementationId: string, patch: Record<string, unknown>) =>
  insertDeliveryRow("approvals", implementationId, patch);
export const updateApproval = (id: string, patch: Record<string, unknown>) =>
  updateDeliveryRow("approvals", id, patch);

/* ---------- Working notes + attachments ---------- */

/**
 * Write a working note. The stage is read from the implementation at write time
 * and stored on the row, so notes stay with the stage they were written in even
 * after the implementation moves on.
 */
export async function createJournalEntry(args: {
  implementationId: string;
  note: string;
  authorId: string | null;
  links: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
}) {
  const { data: impl, error: readError } = await db()
    .from("implementations")
    .select("id,current_stage")
    .eq("id", args.implementationId)
    .maybeSingle();
  if (readError || !impl) throw new Error(readError?.message ?? "Implementation not found");

  const { error } = await db().from("journal_entries").insert({
    implementation_id: args.implementationId,
    stage: impl.current_stage,
    note: args.note,
    author_id: args.authorId,
    links: args.links,
    attachment_url: args.attachmentUrl,
    attachment_name: args.attachmentName,
  });
  if (error) throw new Error(`Could not save the note: ${error.message}`);
  return { ok: true, stage: impl.current_stage as string };
}

const ATTACHMENT_BUCKET = "attachments";

/** Store an uploaded file and return the stored path, which the record keeps. */
export async function storeAttachment(args: {
  folder: "sow" | "notes" | "solution";
  fileName: string;
  contentType: string;
  dataBase64: string;
}) {
  const binary = Buffer.from(args.dataBase64, "base64");
  const safe = args.fileName.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-120);
  const path = `${args.folder}/${crypto.randomUUID()}-${safe}`;
  const { error } = await db()
    .storage.from(ATTACHMENT_BUCKET)
    .upload(path, binary, { contentType: args.contentType, upsert: false });
  if (error) throw new Error(`Could not upload the file: ${error.message}`);
  return { path, name: args.fileName };
}

/** Short-lived link so the file can be opened from the record. */
export async function attachmentLink(path: string) {
  const { data, error } = await db().storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    throw new Error(`Could not open the file: ${error?.message ?? "no link returned"}`);
  }
  return { url: data.signedUrl as string };
}
