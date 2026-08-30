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
import { matchesScope } from "./ownership";
import type { ResolvedScope } from "./ownership.server";

const db = () => supabaseAdmin as any;

/**
 * Phase 7 demo mode. The flag lookup lives here rather than in demo-mode.ts so
 * that module stays pure and unit-testable; the masker is a passthrough object
 * when the flag is off, so the call sites below read the same either way.
 */
async function demoMasker() {
  const [{ createMasker }, { isFlagOn }] = await Promise.all([
    import("./demo-mode"),
    import("./app-config.server"),
  ]);
  return createMasker(await isFlagOn("demo_mode"));
}

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

/**
 * Every project, or the scoped subset.
 *
 * Scoping happens HERE, once, on rows that were already all in memory — the
 * query has always fetched every implementation and joined in the browser's
 * data client. Filtering afterwards therefore costs one extra read
 * (portal_accounts) and no extra round trips per row.
 *
 * Doing it here also means every surface built on this function inherits the
 * default without having to remember: Home, the customers list and the
 * leadership portfolio all narrow together, and a new list added next month
 * narrows for free.
 *
 * NOT scoped, deliberately: `loadCustomer360`. Opening a specific account from
 * a link, a search result or an escalation has to work whoever you are —
 * scoping the record view would turn "my default view" into "I cannot help my
 * colleague", which is the opposite of what this is for.
 */
export async function loadImplementations(
  scope?: ResolvedScope | null,
): Promise<ImplementationRow[]> {
  const team = await loadTeam();
  const [{ data: impls }, { data: customers }, { data: commitments }, { data: escalations }] =
    await Promise.all([
      db().from("implementations").select("*"),
      db().from("customers").select("*"),
      db().from("commitments").select("implementation_id,due_date,status"),
      db().from("escalations").select("implementation_id,status"),
    ]);

  const customerMap = new Map((customers ?? []).map((c: any) => [c.id, c]));

  // The pre-sale account owners (am/se) live on portal_accounts and are
  // profile ids, not team ids. Read only when a scope actually needs them.
  const accountsByCustomer = new Map<string, { am: string | null; se: string | null }>();
  if (scope && scope.scope.mode !== "all") {
    const { data: accounts } = await db()
      .from("portal_accounts")
      .select("customer_id, am_owner_id, se_owner_id");
    for (const a of (accounts ?? []) as any[]) {
      if (a.customer_id) {
        accountsByCustomer.set(a.customer_id, {
          am: a.am_owner_id ?? null,
          se: a.se_owner_id ?? null,
        });
      }
    }
  }
  // Phase 7 demo mode: mask at the server projection, never in the browser.
  // This is the single choke point every customer name reaches Home, the
  // customers list and the leadership portfolio through.
  const demo = await demoMasker();

  const inScope = (i: any) => {
    if (!scope) return true;
    const account = accountsByCustomer.get(i.customer_id);
    const c: any = customerMap.get(i.customer_id) ?? {};
    return matchesScope(
      {
        implementationOwnerId: i.owner_id ?? null,
        csmOwnerId: c.csm_owner_id ?? null,
        amOwnerProfileId: account?.am ?? null,
        seOwnerProfileId: account?.se ?? null,
      },
      scope.scope,
      scope.viewer,
      scope.person ?? null,
    );
  };

  return (impls ?? []).filter(inScope).map((i: any) => {
    const c: any = customerMap.get(i.customer_id) ?? {};
    return {
      id: i.id,
      name: i.name,
      customer_id: i.customer_id,
      customer_name: c.name ? demo.org(c.name, c.id) : "Unknown customer",
      segment: c.segment ?? null,
      industry: c.industry ?? null,
      arr: demo.arr(c.arr ?? null),
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

export async function loadHome(scope?: ResolvedScope | null): Promise<HomeData> {
  const [implementations, team] = await Promise.all([loadImplementations(scope), loadTeam()]);
  const implById = new Map(implementations.map((i) => [i.id, i]));
  // Everything below joins through implById, so narrowing the implementation
  // set narrows the whole page. The `keep` predicate is what stops a commitment
  // or a risk from an account outside the scope arriving as an orphan row with
  // "Unknown customer" next to it — which reads as data loss, not as a filter.
  const scoped = Boolean(scope && scope.scope.mode !== "all");
  const keep = (implementationId: string | null | undefined) =>
    !scoped || (implementationId != null && implById.has(implementationId));

  const { data: commitmentRows } = await db()
    .from("commitments")
    .select("*")
    .neq("status", "fulfilled")
    .order("due_date", { ascending: true });

  const commitments: CommitmentRow[] = (commitmentRows ?? [])
    .filter((c: any) => c.status !== "cancelled")
    .filter((c: any) => keep(c.implementation_id))
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
    ...(audit ?? [])
      .filter((a: any) => (a.entity_type === "implementation" ? keep(a.entity_id) : !scoped))
      .map((a: any) => ({
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
    ...(risks ?? [])
      .filter((r: any) => keep(r.implementation_id))
      .map((r: any) => ({
        key: `risk-${r.id}`,
        kind: "risk" as const,
        title: `Risk raised · ${r.title}`,
        detail: `${r.severity} severity · ${r.likelihood} likelihood · ${r.status}`,
        at: r.identified_at,
        actor: null,
        ...implContext(r.implementation_id),
      })),
    ...(issues ?? [])
      .filter((r: any) => keep(r.implementation_id))
      .map((r: any) => ({
        key: `issue-${r.id}`,
        kind: "issue" as const,
        title: `Issue opened · ${r.title}`,
        detail: `${r.severity} severity · ${r.status}`,
        at: r.raised_at,
        actor: null,
        ...implContext(r.implementation_id),
      })),
    ...(escalations ?? [])
      .filter((r: any) => keep(r.implementation_id))
      .map((r: any) => ({
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
export async function loadLeadership(scope?: ResolvedScope | null): Promise<LeadershipData> {
  const home = await loadHome(scope);

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
  // WAVE A. Five reads that depend on nothing but customerId, so they go
  // together. They used to be five sequential awaits — five round trips to
  // Supabase before the page could even discover which implementation it was
  // rendering. On a page that was timing out at the 20s function limit, the
  // waterfall cost more than any individual query did.
  const [team, activeTeamRes, customerRes, demo, contactRes, implRes] = await Promise.all([
    loadTeam(),
    db().from("team_members").select("id,name,role").eq("active", true).order("name"),
    db().from("customers").select("*").eq("id", customerId).maybeSingle(),
    demoMasker(),
    db()
      .from("customer_contacts")
      .select("id,name,role,email,notes")
      .eq("customer_id", customerId)
      .order("name"),
    db()
      .from("implementations")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
  ]);

  const customer = customerRes.data;
  if (!customer) return null;

  const teamOptions = (activeTeamRes.data ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    role: t.role,
  }));

  // Phase 7 demo mode: the 360 is the surface a demo spends longest on, so the
  // customer and its named contacts are pseudonymised here too. Internal staff
  // names are not masked — they are the demo.
  const contactRows = contactRes.data;
  const contacts = (contactRows ?? []).map((c: any) => ({
    id: c.id,
    name: demo.person(c.name, c.id),
    role: c.role,
    email: demo.email(c.email ?? null, c.id),
    notes: c.notes ?? null,
  }));
  const contactById = new Map<string, any>(contacts.map((c: any) => [c.id, c]));

  const implList = (implRes.data ?? []) as any[];
  // A customer can run several implementations at once. The caller picks one;
  // without a pick we show the newest, and an unknown id falls back the same way.
  const impl =
    (implementationId ? implList.find((i) => i.id === implementationId) : null) ?? implList[0];
  // Every project this customer runs, with the dates each one needs to draw
  // its own lane in the header. `stages` is filled in below, once wave B has
  // read them for all of these implementations in a single query.
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
    contract_start_date: i.contract_start_date ?? null,
    created_at: i.created_at ?? null,
    actual_launch_date: i.actual_launch_date ?? null,
    parent_implementation_id: i.parent_implementation_id ?? null,
    stages: [] as any[],
  }));

  // The customer's logo, as a signed URL.
  //
  // customer-branding is a PRIVATE bucket, so the stored path is not a link and
  // handing it to the browser would be handing over a dead string. A signed URL
  // is minted per load and expires; nothing durable ever holds it.
  //
  // Guarded on logo_path, so a customer without a logo — every customer today —
  // costs no round trip at all. A signing failure is not allowed to take the
  // page down over a picture.
  let logoUrl: string | null = null;
  if (customer.logo_path) {
    try {
      const { data: signed } = await (db() as any).storage
        .from("customer-branding")
        .createSignedUrl(customer.logo_path, 60 * 60);
      logoUrl = signed?.signedUrl ?? null;
    } catch (e) {
      console.error("[360] could not sign the customer logo url", e);
    }
  }

  const base: Customer360 = {
    customer: {
      id: customer.id,
      name: demo.org(customer.name, customer.id),
      industry: customer.industry,
      segment: customer.segment,
      arr: demo.arr(customer.arr),
      region: customer.region,
      logo_url: logoUrl,
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
    adoptionAreaRes,
    graduationRes,
    handoffRes,
    journalRes,
    stageInstanceRes,
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
    // These four used to run in three further sequential waves AFTER this one,
    // even though not one of them needs anything this batch returns. They only
    // need impl.id, which is already known here.
    child("adoption_areas", "created_at"),
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
    child("journal_entries", "created_at", false),
    // Every stage of every project this customer runs, in ONE read.
    //
    // It started as the selected implementation's current-stage target — on
    // stage_instances since 0014 and never read, so "8 days in Build" was
    // shown with no way to tell whether that was early or double. The header
    // now draws a rail per project from these same rows, and a customer with
    // twelve projects must not cost twelve queries, so this is `.in()` over
    // the ids wave A already returned rather than a per-project loop.
    db()
      .from("stage_instances")
      .select(
        "implementation_id,stage_key,name,position,status,entered_at,exited_at,target_duration_days,provenance",
      )
      .in(
        "implementation_id",
        implList.map((i) => i.id),
      )
      .order("position"),
  ]);

  // Group the one stage_instances read by project, and hand each summary its
  // own stages. A project with no journey applied keeps an empty array — the
  // header treats that as "no plan", never as "no stages".
  const stagesByImplementation = new Map<string, any[]>();
  for (const row of (stageInstanceRes.data ?? []) as any[]) {
    const bucket = stagesByImplementation.get(row.implementation_id);
    if (bucket) bucket.push(row);
    else stagesByImplementation.set(row.implementation_id, [row]);
  }
  for (const summary of implementationSummaries) {
    summary.stages = (stagesByImplementation.get(summary.id) ?? []).map((r: any) => ({
      stage_key: r.stage_key,
      name: r.name,
      position: r.position,
      status: r.status,
      entered_at: r.entered_at ?? null,
      exited_at: r.exited_at ?? null,
      target_duration_days: r.target_duration_days ?? null,
      provenance: r.provenance ?? null,
    }));
  }

  const named = (id: string | null | undefined) => (id ? (team.get(id)?.name ?? null) : null);

  // WAVE C. The only reads that genuinely need wave B's ids. Four round trips
  // collapsed into one.
  //
  // trace_links was `select * from trace_links` with NO filter — the whole
  // table, every time anyone opened any customer, to render the edges of ONE
  // implementation. It was tolerable only while the table was nearly empty, and
  // 0025 has just started backfilling a derived edge for every solution,
  // evidence row and approval in the system, so it was about to stop being
  // tolerable. Scoped to the entities actually on this page, matched at either
  // end of the edge.
  const entityIds = [
    ...(requirements.data ?? []),
    ...(decisions.data ?? []),
    ...(solutions.data ?? []),
    ...(evidence.data ?? []),
    ...(approvals.data ?? []),
    ...(milestones.data ?? []),
    ...(successCriteria.data ?? []),
    ...(risks.data ?? []),
    ...(issues.data ?? []),
    ...(escalations.data ?? []),
    ...(commitments.data ?? []),
  ].map((r: any) => r.id);

  const criterionIds = (successCriteria.data ?? []).map((c: any) => c.id);
  const areaIds = (adoptionAreaRes.data ?? []).map((a: any) => a.id);
  const auditIds = [impl.id, ...entityIds];

  // An edge matters if EITHER end is on this page, so it is two plain `.in()`
  // reads merged, not one `.or()` string. The `.or()` filter language is
  // stringly-typed: a syntax slip returns an empty set rather than an error,
  // and a silently empty traceability spine looks exactly like a customer who
  // has no links yet. These two run in the same parallel wave, so being two
  // queries costs nothing.
  const traceLinkCols =
    "from_entity_type,from_entity_id,relationship,to_entity_type,to_entity_id,source";
  const noRows = { data: [] as any[] };

  const [linksOut, linksIn, observationRes, adoptionObservationRes, auditRes] = await Promise.all([
    entityIds.length
      ? db().from("trace_links").select(traceLinkCols).in("from_entity_id", entityIds)
      : Promise.resolve(noRows),
    entityIds.length
      ? db().from("trace_links").select(traceLinkCols).in("to_entity_id", entityIds)
      : Promise.resolve(noRows),
    criterionIds.length
      ? db()
          .from("success_criteria_observations")
          .select("*")
          .in("success_criteria_id", criterionIds)
          .order("observed_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    areaIds.length
      ? db()
          .from("adoption_observations")
          .select("*")
          .in("adoption_area_id", areaIds)
          .order("observed_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    db()
      .from("audit_log")
      .select("*")
      .in("entity_id", auditIds)
      .order("changed_at", { ascending: false }),
  ]);

  // One edge can match both reads; the unique index in 0025 is on exactly this
  // tuple, so it is the right identity to de-duplicate on.
  const seenEdge = new Set<string>();
  const traceLinks = {
    data: [...(linksOut.data ?? []), ...(linksIn.data ?? [])].filter((l: any) => {
      const k = `${l.from_entity_type}:${l.from_entity_id}:${l.relationship}:${l.to_entity_type}:${l.to_entity_id}`;
      if (seenEdge.has(k)) return false;
      seenEdge.add(k);
      return true;
    }),
  };

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

  // Reach, after scoping the fetch. This is a multi-hop walk, and trace_links is
  // no longer read whole, so it is worth being exact about what changed: every
  // edge with either end on this page is present, so the walk still crosses the
  // page's own entities freely and still takes one hop past the boundary. What
  // it can no longer do is continue walking a chain that has already left this
  // implementation entirely. Those steps were never renderable anyway — `label`
  // resolves through `lookup`, which only ever holds this page's rows, so an
  // off-page entity came back unlabelled before and simply stops appearing now.
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

  // All fetched in waves B and C above; nothing here waits on the network.
  const observations: any[] = observationRes.data ?? [];
  const evidenceById = new Map<string, any>(
    (evidence.data ?? []).map((e: any) => [
      e.id,
      { id: e.id, type: e.type, title: e.title, url: e.url },
    ]),
  );
  const adoptionAreas = adoptionAreaRes.data;
  const adoptionObservations: any[] = adoptionObservationRes.data ?? [];
  const graduationRow: any = (graduationRes.data ?? [])[0] ?? null;
  const handoffRow: any = (handoffRes.data ?? [])[0] ?? null;

  // Working notes, newest first. Each row already carries the stage it was
  // written in, so the timeline never has to guess after the fact. Fetched in
  // wave B.
  const journalRows = journalRes.data;

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
      // null when the template set no target for this stage — which the UI
      // reports as "no target", never as "on pace".
      stage_target_days:
        (stagesByImplementation.get(impl.id) ?? []).find(
          (r: any) => normalizeStage(r.stage_key) === normalizeStage(impl.current_stage),
        )?.target_duration_days ?? null,
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
          // Phase 7: cs_handoffs is now THE handover record and is writable.
          // The id is exposed so the form can edit what it is looking at, and
          // the two fields folded forward from `graduations` in 0025 render
          // beside the ones this table always had.
          cs_owner_id: handoffRow.cs_owner_id ?? null,
          cs_owner_name: named(handoffRow.cs_owner_id),
          summary: handoffRow.summary ?? null,
          open_items: handoffRow.open_items ?? null,
          account_context: handoffRow.account_context ?? null,
          health_at_handover: handoffRow.health_at_handover ?? null,
          notes: handoffRow.notes ?? null,
          recorded_by_name: named(handoffRow.recorded_by),
          updated_at: handoffRow.updated_at ?? null,
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
    // Fetched in wave C. It used to be awaited HERE, inside the returned object
    // literal, which made it a whole extra round trip after every other query
    // had already finished.
    audit_log: ((): Customer360["audit_log"] => {
      return (auditRes.data ?? []).map((a: any) => ({
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
  /**
   * Who is creating this, as a `portal_profiles` id. Recorded as the author of
   * the plan (`journey_instantiations.created_by`). NOT the implementation's
   * `owner_id`, which is a `team_members` id — the two id spaces are bridged,
   * never interchangeable, and passing one where the other belongs would either
   * break the foreign key or attribute the plan to a stranger.
   */
  actorProfileId?: string | null;
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

  // Emitted from every creator, not only the Salesforce endpoint, so webhook
  // consumers see the whole world. Never throws (see server/events.ts).
  const { recordImplementationCreated } = await import("./server/events");
  await recordImplementationCreated({
    implementationId: impl.id as string,
    customerId,
    source: String(args.patch["source"] ?? "manual"),
  });

  // Give it a plan, the same way the handoff and the Salesforce endpoint do.
  // This path used to leave a project with no stage instances and no work
  // items; the operator saw an empty rail and had no way to tell whether that
  // meant "no plan" or "nothing to do yet". Never throws — the implementation
  // exists and is usable either way, and `plan.reason` says what happened.
  const { applyPlanToNewImplementation } = await import("./server/plan-apply");
  const plan = await applyPlanToNewImplementation({
    implementationId: impl.id as string,
    actorProfileId: args.actorProfileId ?? null,
  });

  return { ok: true, customerId, implementationId: impl.id as string, plan };
}

/**
 * Edit the facts of an existing implementation (owner, dates, commercial
 * context, what the customer wants). Stage is not editable here — it moves only
 * through stage advancement, which keeps the stage history authoritative.
 */
export async function updateImplementation(
  id: string,
  patch: Record<string, unknown>,
  opts: { actorProfileId?: string | null } = {},
) {
  // Phase 7: snapshot before the write so the account activity feed can record
  // old → new. Returns null (and costs nothing) while audit_activity_feed is
  // off. See docs/design/hygiene.md §1.
  const { captureImplementation, recordImplementationChange } = await import("./activity.server");
  const before = await captureImplementation(id);

  const { error } = await db()
    .from("implementations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw deliveryWriteError("implementations", error.message);

  // After the write, never before: a feed row for a save that then failed is a
  // lie about history.
  await recordImplementationChange(id, before, patch, opts.actorProfileId ?? null);
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

  // Outbound: the event a webhook consumer sees, and the Salesforce write-back.
  // Both never throw — history above is already the authority on this move.
  const { recordStageChange } = await import("./server/events");
  await recordStageChange({
    implementationId: args.implementationId,
    fromStage: current,
    toStage: expected,
    actor: args.enteredBy ?? null,
    note: args.notes ?? null,
    enteredAt: at,
  });

  // PLAN.md decision 10: mirror the presale tail forward from delivery
  // progress. Flag-gated on sf_presale_bridge, forward-only, and it never
  // fails an advance that has already been recorded.
  const sf = await import("./sf-integration.server");
  await sf.syncPresaleStageFromLifecycle(args.implementationId, expected);
  await sf.emitWriteBack(args.implementationId);

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

/**
 * Store a customer's logo and point the customer row at it.
 *
 * The bucket is private, so nothing here produces a public URL — the 360 mints
 * a short-lived signed one per load.
 *
 * The previous object is deleted AFTER the row is repointed, never before: if
 * the delete fails we are left with one orphaned file, which is harmless. Doing
 * it the other way round risks a customer row pointing at an object that is
 * already gone, and a broken image where their brand used to be.
 */
export async function storeCustomerLogo(args: {
  customerId: string;
  fileName: string;
  contentType: string;
  dataBase64: string;
}) {
  const binary = Buffer.from(args.dataBase64, "base64");
  const ext = (args.contentType.split("/")[1] ?? "png").replace(/[^a-z0-9]/g, "");
  const path = `${args.customerId}/${crypto.randomUUID()}.${ext}`;

  const { data: before } = await db()
    .from("customers")
    .select("logo_path")
    .eq("id", args.customerId)
    .maybeSingle();

  const { error: upErr } = await db()
    .storage.from("customer-branding")
    .upload(path, binary, { contentType: args.contentType, upsert: false });
  if (upErr) throw new Error(`Could not upload the logo: ${upErr.message}`);

  const { error } = await db()
    .from("customers")
    .update({ logo_path: path })
    .eq("id", args.customerId);
  if (error) throw new Error(`Could not save the logo: ${error.message}`);

  const previous = (before as any)?.logo_path as string | null | undefined;
  if (previous && previous !== path) {
    try {
      await db().storage.from("customer-branding").remove([previous]);
    } catch (e) {
      console.error("[logo] replaced the logo but could not remove the old object", e);
    }
  }
  return { path };
}

/** Short-lived link so the file can be opened from the record. */
export async function attachmentLink(path: string) {
  const { data, error } = await db().storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    throw new Error(`Could not open the file: ${error?.message ?? "no link returned"}`);
  }
  return { url: data.signedUrl as string };
}
