import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { audit } from "./server/audit";
import { rowOrThrow, rowsOrThrow } from "./server/db-read";
import {
  reconcilePurchased,
  type PurchaseCheck,
  type PurchaseRecord,
} from "./complete-solutions-purchase";
import {
  suggestReadiness,
  type ComponentStatus,
  type Priority,
  type Readiness,
  type ReadinessSuggestion,
  type SolutionScope,
  type SolutionStatus,
  type ComponentCategory,
  type IntegrationType,
} from "./complete-solutions";

/**
 * Reads and writes for complete solutions.
 *
 * Every write is one call to a database function (supabase/migrations/0091). The
 * function checks the caller's permission, locks the row, refuses a change made
 * against a version that has since changed, makes the change and writes its
 * history in the same transaction. If any step fails, nothing is kept. This file
 * only maps the function's refusal to a sentence a person can act on.
 *
 * Permissions are decided in the database (solution_may_edit): a manager or
 * admin may change any implementation's solutions, an implementation owner may
 * change their own, and nobody else may. canEdit below only tells the screen
 * whether to show the controls; the database is what refuses.
 */

const db = () => supabaseAdmin as any;

export type SolutionEventKind =
  | "created"
  | "edited"
  | "status"
  | "priority"
  | "target_date"
  | "readiness_confirmed"
  | "dependency_added"
  | "dependency_removed"
  | "form_built"
  | "customer_approved"
  | "submission_count"
  | "usage_confirmed"
  | "archived"
  | "restored"
  | "sow_import";

export type ComponentView = {
  id: string;
  solutionId: string;
  category: ComponentCategory;
  integrationType: IntegrationType | null;
  name: string;
  status: ComponentStatus;
  priority: Priority;
  targetDate: string | null;
  originalTargetDate: string | null;
  targetChangeReason: string | null;
  startCondition: string | null;
  estimateWeeks: number | null;
  blocker: string | null;
  latestUpdate: string | null;
  latestUpdateAt: string | null;
  nextAction: string | null;
  technicalSolutionId: string | null;
  sowQuote: string | null;
  formBuilt: boolean;
  customerApproved: boolean;
  submissionCount: number | null;
  submissionCheckedOn: string | null;
  customerUsageConfirmedOn: string | null;
  archived: boolean;
  /** The row's version. Sent back with every change, so a stale screen cannot overwrite a newer one. */
  updatedAt: string;
  dependsOn: Array<{ id: string; name: string; critical: boolean; status: ComponentStatus }>;
};

export type SolutionView = {
  id: string;
  implementationId: string;
  title: string;
  scope: SolutionScope;
  source: "manual" | "sow";
  /** The purchase record item this solution delivers, when one was linked. A reference only. */
  purchasedServiceId: string | null;
  sowQuote: string | null;
  startCondition: string | null;
  estimateWeeks: number | null;
  priority: Priority;
  status: SolutionStatus;
  readinessConfirmed: Readiness;
  readinessConfirmedAt: string | null;
  /** Computed from the components. Shown beside the confirmed value, never in place of it. */
  readinessSuggested: ReadinessSuggestion;
  nextAction: string | null;
  targetDate: string | null;
  originalTargetDate: string | null;
  archived: boolean;
  createdAt: string;
  /** The row's version. Sent back with every change. */
  updatedAt: string;
  components: ComponentView[];
};

export type HistoryEntry = {
  id: string;
  kind: SolutionEventKind;
  componentId: string | null;
  componentName: string | null;
  fromValue: string | null;
  toValue: string | null;
  reason: string | null;
  actorName: string | null;
  at: string;
};

const SOLUTION_COLUMNS =
  "id, implementation_id, title, scope, source, purchased_service_id, sow_quote, start_condition, estimate_weeks, priority, status, readiness_confirmed, readiness_confirmed_at, next_action, target_date, original_target_date, archived_at, created_at, updated_at";
const COMPONENT_COLUMNS =
  "id, complete_solution_id, implementation_id, category, integration_type, name, status, priority, target_date, original_target_date, target_change_reason, start_condition, estimate_weeks, blocker, latest_update, latest_update_at, next_action, technical_solution_id, sow_quote, form_built, customer_approved, submission_count, submission_checked_on, customer_usage_confirmed_on, archived_at, updated_at";

/* ------------------------------------------------------------- reads */

function componentFrom(row: any, deps: ComponentView["dependsOn"]): ComponentView {
  return {
    id: String(row.id),
    solutionId: String(row.complete_solution_id),
    category: row.category,
    integrationType: row.integration_type ?? null,
    name: String(row.name),
    status: row.status,
    priority: row.priority,
    targetDate: row.target_date ?? null,
    originalTargetDate: row.original_target_date ?? null,
    targetChangeReason: row.target_change_reason ?? null,
    startCondition: row.start_condition ?? null,
    estimateWeeks: row.estimate_weeks ?? null,
    blocker: row.blocker ?? null,
    latestUpdate: row.latest_update ?? null,
    latestUpdateAt: row.latest_update_at ?? null,
    nextAction: row.next_action ?? null,
    technicalSolutionId: row.technical_solution_id ?? null,
    sowQuote: row.sow_quote ?? null,
    formBuilt: Boolean(row.form_built),
    customerApproved: Boolean(row.customer_approved),
    submissionCount: row.submission_count ?? null,
    submissionCheckedOn: row.submission_checked_on ?? null,
    customerUsageConfirmedOn: row.customer_usage_confirmed_on ?? null,
    archived: row.archived_at != null,
    updatedAt: String(row.updated_at),
    dependsOn: deps,
  };
}

/**
 * Every solution on an implementation, archived ones included (history is not
 * hidden), each with its components, their dependencies and the suggested
 * readiness.
 */
export async function loadSolutionsFor(implementationId: string): Promise<SolutionView[]> {
  const solutions = rowsOrThrow<any>(
    await db()
      .from("complete_solutions")
      .select(SOLUTION_COLUMNS)
      .eq("implementation_id", implementationId)
      .order("created_at", { ascending: true }),
    "the solutions",
  );
  if (solutions.length === 0) return [];

  const components = rowsOrThrow<any>(
    await db()
      .from("solution_components")
      .select(COMPONENT_COLUMNS)
      .eq("implementation_id", implementationId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    "the solution components",
  );
  const componentIds = components.map((c: any) => c.id);
  const edges = componentIds.length
    ? rowsOrThrow<any>(
        await db()
          .from("solution_component_dependencies")
          .select("component_id, depends_on_id, critical")
          .in("component_id", componentIds),
        "the component dependencies",
      )
    : [];
  const byId = new Map(components.map((c: any) => [String(c.id), c]));

  const depsFor = new Map<string, ComponentView["dependsOn"]>();
  for (const e of edges) {
    const dep = byId.get(String(e.depends_on_id));
    if (!dep) continue;
    const list = depsFor.get(String(e.component_id)) ?? [];
    list.push({
      id: String(dep.id),
      name: String(dep.name),
      critical: Boolean(e.critical),
      status: dep.status,
    });
    depsFor.set(String(e.component_id), list);
  }

  return solutions.map((s: any) => {
    const own = components
      .filter((c: any) => String(c.complete_solution_id) === String(s.id))
      .map((c: any) => componentFrom(c, depsFor.get(String(c.id)) ?? []));
    const critical = new Map<string, string[]>();
    for (const c of own) {
      const ids = c.dependsOn.filter((d) => d.critical).map((d) => d.id);
      if (ids.length) critical.set(c.id, ids);
    }
    return {
      id: String(s.id),
      implementationId: String(s.implementation_id),
      title: String(s.title),
      scope: s.scope,
      source: s.source,
      purchasedServiceId: s.purchased_service_id ?? null,
      sowQuote: s.sow_quote ?? null,
      startCondition: s.start_condition ?? null,
      estimateWeeks: s.estimate_weeks ?? null,
      priority: s.priority,
      status: s.status,
      readinessConfirmed: s.readiness_confirmed,
      readinessConfirmedAt: s.readiness_confirmed_at ?? null,
      readinessSuggested: suggestReadiness(
        own.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          priority: c.priority,
          archived: c.archived,
        })),
        critical,
      ),
      nextAction: s.next_action ?? null,
      targetDate: s.target_date ?? null,
      originalTargetDate: s.original_target_date ?? null,
      archived: s.archived_at != null,
      createdAt: String(s.created_at),
      updatedAt: String(s.updated_at),
      components: own,
    };
  });
}

/**
 * The purchase record items on the implementation's deal (the services the sale
 * recorded). Read only: nothing here changes the deal, its intake, or Salesforce.
 */
export async function loadPurchaseRecords(implementationId: string): Promise<{
  hasDeal: boolean;
  records: PurchaseRecord[];
}> {
  const impl = rowOrThrow<any>(
    await db().from("implementations").select("deal_id").eq("id", implementationId).maybeSingle(),
    "the implementation",
  );
  if (!impl?.deal_id) return { hasDeal: false, records: [] };
  const deal = rowOrThrow<any>(
    await db().from("portal_accounts").select("intake").eq("id", impl.deal_id).maybeSingle(),
    "the purchase record",
  );
  const intake = deal?.intake ?? {};
  const { normalizeServices } = await import("./onboarding-services");
  const services = normalizeServices(intake.timeline?.services ?? [], intake.timeline ?? {});
  return {
    hasDeal: true,
    records: services.map((svc) => ({
      id: String(svc.id),
      name: String(svc.name),
      kind: String(svc.kind),
    })),
  };
}

/**
 * The workspace's view for one signed-in person: the solutions, whether that
 * person may change them, and how the purchased scope compares with the deal's
 * purchase record. The database makes the same permission decision on every write.
 */
export async function loadWorkspace(
  implementationId: string,
  actorProfileId: string,
): Promise<{ solutions: SolutionView[]; canEdit: boolean; purchase: PurchaseCheck }> {
  const [solutions, canEdit, record] = await Promise.all([
    loadSolutionsFor(implementationId),
    canEditSolutions(actorProfileId, implementationId),
    loadPurchaseRecords(implementationId),
  ]);
  const purchase = reconcilePurchased({
    hasRecord: record.hasDeal,
    solutions,
    records: record.records,
  });
  return { solutions, canEdit, purchase };
}

export async function canEditSolutions(
  actorProfileId: string,
  implementationId: string,
): Promise<boolean> {
  const { data, error } = await db().rpc("solution_may_edit", {
    p_profile: actorProfileId,
    p_implementation: implementationId,
  });
  if (error) {
    console.error(`[solutions] permission check failed: ${error.message ?? "unknown"}`);
    return false;
  }
  return data === true;
}

export async function loadSolutionHistory(
  solutionId: string,
  limit = 200,
): Promise<HistoryEntry[]> {
  const rows = rowsOrThrow<any>(
    await db()
      .from("solution_events")
      .select("id, kind, component_id, from_value, to_value, reason, actor_profile_id, created_at")
      .eq("complete_solution_id", solutionId)
      .order("created_at", { ascending: false })
      .limit(limit),
    "the solution history",
  );
  const componentIds = [...new Set(rows.map((r: any) => r.component_id).filter(Boolean))];
  const componentNames = new Map<string, string>();
  if (componentIds.length) {
    const named = rowsOrThrow<any>(
      await db().from("solution_components").select("id, name").in("id", componentIds),
      "the solution history",
    );
    for (const c of named) componentNames.set(String(c.id), String(c.name));
  }
  const actorIds = [...new Set(rows.map((r: any) => r.actor_profile_id).filter(Boolean))];
  const actorNames = new Map<string, string>();
  if (actorIds.length) {
    const people = rowsOrThrow<any>(
      await db().from("portal_profiles").select("id, full_name, email").in("id", actorIds),
      "the solution history",
    );
    for (const p of people) actorNames.set(String(p.id), String(p.full_name || p.email));
  }
  return rows.map((r: any) => ({
    id: String(r.id),
    kind: r.kind,
    componentId: r.component_id ?? null,
    componentName: r.component_id ? (componentNames.get(String(r.component_id)) ?? null) : null,
    fromValue: r.from_value ?? null,
    toValue: r.to_value ?? null,
    reason: r.reason ?? null,
    actorName: r.actor_profile_id ? (actorNames.get(String(r.actor_profile_id)) ?? null) : null,
    at: String(r.created_at),
  }));
}

/**
 * The concise picture Customer 360 shows: counts, what is overdue, what is
 * waiting on something, and the next actions. Derived from loadSolutionsFor, so
 * the summary and the workspace can never disagree.
 */
export type SolutionsSummaryRow = {
  id: string;
  title: string;
  scope: SolutionScope;
  status: SolutionStatus;
  readinessConfirmed: Readiness;
  readinessSuggested: Readiness;
  components: number;
  openGoLive: number;
  targetDate: string | null;
  overdue: boolean;
};

export type SolutionsSummary = {
  /** One row per active solution, in the order they were added. */
  rows: SolutionsSummaryRow[];
  solutions: number;
  purchased: number;
  requested: number;
  openGoLive: number;
  overdue: Array<{ label: string; targetDate: string }>;
  waiting: Array<{ label: string; reason: string }>;
  nextActions: Array<{ label: string; action: string }>;
};

export function summarizeSolutions(
  solutions: ReadonlyArray<SolutionView>,
  today: string,
): SolutionsSummary {
  const active = solutions.filter((s) => !s.archived);
  const overdue: SolutionsSummary["overdue"] = [];
  const waiting: SolutionsSummary["waiting"] = [];
  const nextActions: SolutionsSummary["nextActions"] = [];
  let openGoLive = 0;
  for (const s of active) {
    const solutionDone = s.status === "complete";
    if (s.targetDate && s.targetDate < today && !solutionDone) {
      overdue.push({ label: s.title, targetDate: s.targetDate });
    }
    if (s.nextAction && !solutionDone) nextActions.push({ label: s.title, action: s.nextAction });
    for (const c of s.components) {
      if (c.archived) continue;
      if (c.priority === "needed_for_go_live" && c.status !== "complete") openGoLive += 1;
      if (c.status === "waiting" || c.status === "changes_needed") {
        waiting.push({
          label: `${s.title} · ${c.name}`,
          reason: c.blocker ?? c.latestUpdate ?? "No reason recorded",
        });
      }
      if (c.targetDate && c.targetDate < today && c.status !== "complete") {
        overdue.push({ label: `${s.title} · ${c.name}`, targetDate: c.targetDate });
      }
      if (c.nextAction && c.status !== "complete") {
        nextActions.push({ label: `${s.title} · ${c.name}`, action: c.nextAction });
      }
    }
  }
  overdue.sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  return {
    rows: active.map((s) => {
      const live = s.components.filter((c) => !c.archived);
      return {
        id: s.id,
        title: s.title,
        scope: s.scope,
        status: s.status,
        readinessConfirmed: s.readinessConfirmed,
        readinessSuggested: s.readinessSuggested.readiness,
        components: live.length,
        openGoLive: live.filter(
          (c) => c.priority === "needed_for_go_live" && c.status !== "complete",
        ).length,
        targetDate: s.targetDate,
        overdue: Boolean(s.targetDate && s.targetDate < today && s.status !== "complete"),
      };
    }),
    solutions: active.length,
    purchased: active.filter((s) => s.scope === "purchased").length,
    requested: active.filter((s) => s.scope === "requested").length,
    openGoLive,
    overdue,
    waiting,
    nextActions: nextActions.slice(0, 5),
  };
}

/* ------------------------------------------------------------- writes */

/**
 * The database's refusals are sentences meant for the person (no permission, a
 * version that changed, a rule that was broken). They are passed on unchanged.
 * Anything else is logged, and the person is told nothing was changed, which is
 * true: the database rolls the whole call back.
 *
 *   42501  not allowed to change this implementation
 *   P0409  changed since it was read: reload and try again
 *   22023  a rule was broken (reason needed, loop, duplicate, archived, ...)
 */
const REFUSAL_CODES = new Set(["42501", "P0409", "22023"]);

export function writeFailure(what: string, error: { code?: string; message?: string }): Error {
  if (error.code && REFUSAL_CODES.has(error.code)) {
    return new Error(error.message ?? "That change was refused. Nothing has been changed.");
  }
  console.error(
    `[solutions] ${what} failed: ${error.message ?? "unknown"} (${error.code ?? "no code"})`,
  );
  return new Error(`Could not ${what}. Nothing has been changed.`);
}

async function write<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
  what: string,
): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw writeFailure(what, error);
  return data as T;
}

/** Drops keys the caller did not send, so "not sent" never reads as "clear it". */
function definedOnly(patch: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
}

async function solutionOf(id: string): Promise<{ implementationId: string; solutionId: string }> {
  const row = rowOrThrow<any>(
    await db()
      .from("complete_solutions")
      .select("id, implementation_id")
      .eq("id", id)
      .maybeSingle(),
    "this solution",
  );
  if (!row) throw new Error("That solution no longer exists.");
  return { implementationId: String(row.implementation_id), solutionId: String(row.id) };
}

async function componentRow(id: string): Promise<{ implementationId: string; solutionId: string }> {
  const row = rowOrThrow<any>(
    await db()
      .from("solution_components")
      .select("id, implementation_id, complete_solution_id")
      .eq("id", id)
      .maybeSingle(),
    "this component",
  );
  if (!row) throw new Error("That component no longer exists.");
  return {
    implementationId: String(row.implementation_id),
    solutionId: String(row.complete_solution_id),
  };
}

async function one(implementationId: string, solutionId: string): Promise<SolutionView> {
  const all = await loadSolutionsFor(implementationId);
  const found = all.find((s) => s.id === solutionId);
  if (!found) throw new Error("That solution no longer exists.");
  return found;
}

export type SolutionCreate = {
  implementationId: string;
  title: string;
  scope: SolutionScope;
  priority: Priority;
  startCondition?: string | null | undefined;
  estimateWeeks?: number | null | undefined;
  sowQuote?: string | null | undefined;
  nextAction?: string | null | undefined;
  source?: "manual" | "sow";
  targetDate?: string | null;
  purchasedServiceId?: string | null;
};

/** Adds a complete solution. Returns its id; the caller reads the view it needs. */
export async function insertCompleteSolution(
  input: SolutionCreate,
  actorProfileId: string,
): Promise<string> {
  const id = await write<string>(
    "solution_create",
    {
      p_profile: actorProfileId,
      p_implementation: input.implementationId,
      p_title: input.title,
      p_scope: input.scope,
      p_priority: input.priority,
      p_start_condition: input.startCondition ?? null,
      p_estimate_weeks: input.estimateWeeks ?? null,
      p_sow_quote: input.sowQuote ?? null,
      p_next_action: input.nextAction ?? null,
      p_source: input.source ?? "manual",
      p_target_date: input.targetDate ?? null,
      p_purchased_service_id: input.purchasedServiceId ?? null,
    },
    "add the solution",
  );
  await audit({
    actor_type: "user",
    actor_id: actorProfileId,
    action: "solution.create",
    entity_type: "complete_solution",
    entity_id: String(id),
    payload: { scope: input.scope, source: input.source ?? "manual" },
  });
  return String(id);
}

export async function createCompleteSolution(
  input: SolutionCreate,
  actorProfileId: string,
): Promise<SolutionView> {
  const id = await insertCompleteSolution(input, actorProfileId);
  return one(input.implementationId, id);
}

/**
 * Changes a solution's own fields. `expectedUpdatedAt` is the version the screen
 * was showing; a change against an older version is refused, not merged.
 */
export async function updateCompleteSolution(
  id: string,
  patch: {
    title?: string | undefined;
    scope?: SolutionScope | undefined;
    priority?: Priority | undefined;
    status?: SolutionStatus | undefined;
    nextAction?: string | null | undefined;
    startCondition?: string | null | undefined;
  },
  expectedUpdatedAt: string,
  actorProfileId: string,
): Promise<SolutionView> {
  const { implementationId } = await solutionOf(id);
  const columns = definedOnly({
    title: patch.title,
    scope: patch.scope,
    priority: patch.priority,
    status: patch.status,
    next_action: patch.nextAction,
    start_condition: patch.startCondition,
  });
  await write(
    "solution_update",
    {
      p_profile: actorProfileId,
      p_id: id,
      p_expected: expectedUpdatedAt,
      p_patch: columns,
    },
    "save the solution",
  );
  return one(implementationId, id);
}

/**
 * Sets the solution's delivery date. The first date given is kept as the
 * original; moving it afterwards needs a reason, which is recorded.
 */
export async function setSolutionTargetDate(
  id: string,
  targetDate: string | null,
  reason: string | null,
  expectedUpdatedAt: string,
  actorProfileId: string,
): Promise<SolutionView> {
  const { implementationId } = await solutionOf(id);
  await write(
    "solution_set_target",
    {
      p_profile: actorProfileId,
      p_id: id,
      p_expected: expectedUpdatedAt,
      p_target: targetDate,
      p_reason: reason,
    },
    "save the delivery date",
  );
  return one(implementationId, id);
}

/** The TIS confirms a readiness. A material change needs a reason. */
export async function confirmSolutionReadiness(
  id: string,
  readiness: Readiness,
  reason: string | null,
  expectedUpdatedAt: string,
  actorProfileId: string,
): Promise<SolutionView> {
  const { implementationId } = await solutionOf(id);
  await write(
    "solution_confirm_readiness",
    {
      p_profile: actorProfileId,
      p_id: id,
      p_expected: expectedUpdatedAt,
      p_readiness: readiness,
      p_reason: reason,
    },
    "save readiness",
  );
  return one(implementationId, id);
}

/** Archives or restores a solution. Nothing is deleted. */
export async function setSolutionArchived(
  id: string,
  archived: boolean,
  reason: string | null,
  expectedUpdatedAt: string,
  actorProfileId: string,
): Promise<SolutionView> {
  const { implementationId } = await solutionOf(id);
  await write(
    "solution_set_archived",
    {
      p_profile: actorProfileId,
      p_id: id,
      p_expected: expectedUpdatedAt,
      p_archived: archived,
      p_reason: reason,
    },
    archived ? "archive the solution" : "restore the solution",
  );
  return one(implementationId, id);
}

export type ComponentCreate = {
  solutionId: string;
  category: ComponentCategory;
  integrationType?: IntegrationType | null | undefined;
  name: string;
  priority: Priority;
  targetDate?: string | null | undefined;
  startCondition?: string | null | undefined;
  estimateWeeks?: number | null | undefined;
  nextAction?: string | null | undefined;
  sowQuote?: string | null | undefined;
};

/** Adds a component and returns its id. */
export async function insertComponent(
  input: ComponentCreate,
  actorProfileId: string,
): Promise<{ id: string; implementationId: string; solutionId: string }> {
  const { implementationId } = await solutionOf(input.solutionId);
  const id = await write<string>(
    "component_create",
    {
      p_profile: actorProfileId,
      p_solution: input.solutionId,
      p_category: input.category,
      p_integration_type:
        input.category === "integrations" ? (input.integrationType ?? null) : null,
      p_name: input.name,
      p_priority: input.priority,
      p_target_date: input.targetDate ?? null,
      p_start_condition: input.startCondition ?? null,
      p_estimate_weeks: input.estimateWeeks ?? null,
      p_next_action: input.nextAction ?? null,
      p_sow_quote: input.sowQuote ?? null,
    },
    "add the component",
  );
  return { id: String(id), implementationId, solutionId: input.solutionId };
}

export async function createComponent(
  input: ComponentCreate,
  actorProfileId: string,
): Promise<SolutionView> {
  const { implementationId, solutionId } = await insertComponent(input, actorProfileId);
  return one(implementationId, solutionId);
}

/**
 * Changes one component. A waiting component must say what it is waiting on; a
 * component that needs changes must say what. Moving a date that already had an
 * original needs a reason. The version must be the one the screen showed.
 */
export async function updateComponent(
  input: {
    id: string;
    name?: string | undefined;
    priority?: Priority | undefined;
    status?: ComponentStatus | undefined;
    blocker?: string | null | undefined;
    latestUpdate?: string | null | undefined;
    nextAction?: string | null | undefined;
    targetDate?: string | null | undefined;
    targetChangeReason?: string | null | undefined;
    expectedUpdatedAt: string;
  },
  actorProfileId: string,
): Promise<SolutionView> {
  const { implementationId, solutionId } = await componentRow(input.id);
  const patch = definedOnly({
    name: input.name,
    priority: input.priority,
    status: input.status,
    blocker: input.blocker,
    latest_update: input.latestUpdate,
    next_action: input.nextAction,
    target_date: input.targetDate,
  });
  await write(
    "component_update",
    {
      p_profile: actorProfileId,
      p_id: input.id,
      p_expected: input.expectedUpdatedAt,
      p_patch: patch,
      p_target_reason: input.targetChangeReason ?? null,
    },
    "save the component",
  );
  return one(implementationId, solutionId);
}

/**
 * Records form tracking on a form component: built, customer approved, a
 * submission count with the date it was checked, and customer usage confirmed.
 * Nothing here sets usage from a count.
 */
export async function setFormTracking(
  input: {
    id: string;
    formBuilt?: boolean | undefined;
    customerApproved?: boolean | undefined;
    submissionCount?: number | null | undefined;
    submissionCheckedOn?: string | null | undefined;
    usageConfirmedOn?: string | null | undefined;
    expectedUpdatedAt: string;
  },
  actorProfileId: string,
): Promise<SolutionView> {
  const { implementationId, solutionId } = await componentRow(input.id);
  const patch = definedOnly({
    form_built: input.formBuilt,
    customer_approved: input.customerApproved,
    submission_count: input.submissionCount,
    submission_checked_on:
      input.submissionCount === undefined ? undefined : (input.submissionCheckedOn ?? null),
    usage_confirmed_on: input.usageConfirmedOn,
  });
  await write(
    "component_form_update",
    {
      p_profile: actorProfileId,
      p_id: input.id,
      p_expected: input.expectedUpdatedAt,
      p_patch: patch,
    },
    "save the form tracking",
  );
  return one(implementationId, solutionId);
}

/**
 * Makes one component depend on another in the same implementation. The
 * database refuses a loop, a cross-implementation link and a repeat.
 */
export async function addDependency(
  input: { componentId: string; dependsOnId: string; critical: boolean },
  actorProfileId: string,
): Promise<SolutionView> {
  const { implementationId, solutionId } = await componentRow(input.componentId);
  await write(
    "dependency_add",
    {
      p_profile: actorProfileId,
      p_component: input.componentId,
      p_depends_on: input.dependsOnId,
      p_critical: input.critical,
    },
    "save the dependency",
  );
  return one(implementationId, solutionId);
}

export async function removeDependency(
  input: { componentId: string; dependsOnId: string },
  actorProfileId: string,
): Promise<SolutionView> {
  const { implementationId, solutionId } = await componentRow(input.componentId);
  await write(
    "dependency_remove",
    {
      p_profile: actorProfileId,
      p_component: input.componentId,
      p_depends_on: input.dependsOnId,
    },
    "remove the dependency",
  );
  return one(implementationId, solutionId);
}

/** Archives or restores a component. Nothing is deleted. */
export async function setComponentArchived(
  id: string,
  archived: boolean,
  reason: string | null,
  expectedUpdatedAt: string,
  actorProfileId: string,
): Promise<SolutionView> {
  const { implementationId, solutionId } = await componentRow(id);
  await write(
    "component_set_archived",
    {
      p_profile: actorProfileId,
      p_id: id,
      p_expected: expectedUpdatedAt,
      p_archived: archived,
      p_reason: reason,
    },
    archived ? "archive the component" : "restore the component",
  );
  return one(implementationId, solutionId);
}

/** A reviewed solution as the database takes it. Priority is the most urgent component's. */
export type ReviewedSave = {
  title: string;
  scope: SolutionScope;
  priority: Priority;
  /** The purchase record item this solution delivers, when the person confirmed the match. */
  purchasedServiceId: string | null;
  startCondition: string | null;
  estimateWeeks: number | null;
  sowQuote: string | null;
  suggestedTarget: string | null;
  components: Array<{
    category: ComponentCategory;
    integrationType: IntegrationType | null;
    name: string;
    priority: Priority;
    dependsOn: string[];
    critical: boolean;
    startCondition: string | null;
    estimateWeeks: number | null;
    sowQuote: string | null;
    suggestedTarget: string | null;
  }>;
};

export type ReviewedSaveResult = {
  created: Array<{ title: string; components: number; dependencies: number }>;
  skipped: Array<{ title: string; reason: string }>;
};

/**
 * Records a reviewed set in one transaction (solution_save_reviewed_set): every
 * solution, component, dependency and history row is kept, or none is. A loop
 * anywhere in the set refuses the whole set.
 */
export async function saveReviewedSet(
  implementationId: string,
  solutions: ReviewedSave[],
  sowName: string | null,
  actorProfileId: string,
): Promise<ReviewedSaveResult> {
  const result = await write<ReviewedSaveResult>(
    "solution_save_reviewed_set",
    {
      p_profile: actorProfileId,
      p_implementation: implementationId,
      p_sow_name: sowName,
      p_solutions: solutions.map((s) => ({
        title: s.title,
        scope: s.scope,
        priority: s.priority,
        purchasedServiceId: s.purchasedServiceId,
        startCondition: s.startCondition,
        estimateWeeks: s.estimateWeeks,
        sowQuote: s.sowQuote,
        suggestedTarget: s.suggestedTarget,
        components: s.components,
      })),
    },
    "save the reviewed solutions",
  );
  await audit({
    actor_type: "user",
    actor_id: actorProfileId,
    action: "solution.sow_import",
    entity_type: "implementation",
    entity_id: implementationId,
    payload: { created: result.created.length, skipped: result.skipped.length },
  });
  return result;
}

/** Who may see solutions: any signed-in internal user, never a customer. */
export function assertInternalRole(role: string | null | undefined): void {
  if (!role || role === "customer") {
    throw new Error("Forbidden: internal users only.");
  }
}
