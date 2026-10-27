import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { audit } from "./server/audit";
import { rowOrThrow, rowsOrThrow } from "./server/db-read";
import {
  openComponentsBlockingComplete,
  requiresReason,
  suggestReadiness,
  wouldCreateCycle,
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
 * Reads and writes for complete solutions. Every write is checked against the
 * current row first, so a stale screen cannot change what is no longer true,
 * and every change is recorded in solution_events with who made it and why.
 *
 * What the database also enforces (0091): the original target date never
 * changes, a component sits under its own solution's implementation, history
 * is append-only, and a solution with components cannot be deleted. Those are
 * checked again here so the refusal reads as a sentence, not a SQL error.
 *
 * NOT ATOMIC. A change is written, then its history row. PostgREST has no
 * multi-statement transaction from this client, so if the history write fails
 * after the change, the change is kept and the caller is told to tell an admin
 * rather than being told nothing changed.
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
  dependsOn: Array<{ id: string; name: string; critical: boolean; status: ComponentStatus }>;
};

export type SolutionView = {
  id: string;
  implementationId: string;
  title: string;
  scope: SolutionScope;
  source: "manual" | "sow";
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
  "id, implementation_id, title, scope, source, sow_quote, start_condition, estimate_weeks, priority, status, readiness_confirmed, readiness_confirmed_at, next_action, target_date, original_target_date, archived_at, created_at";
const COMPONENT_COLUMNS =
  "id, complete_solution_id, implementation_id, category, integration_type, name, status, priority, target_date, original_target_date, target_change_reason, start_condition, estimate_weeks, blocker, latest_update, latest_update_at, next_action, technical_solution_id, sow_quote, form_built, customer_approved, submission_count, submission_checked_on, customer_usage_confirmed_on, archived_at";

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
      components: own,
    };
  });
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
export type SolutionsSummary = {
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

function saveFailed(what: string, error: { message?: string; code?: string } | null | undefined) {
  if (error)
    console.error(
      `[solutions] ${what} failed: ${error.message ?? "unknown"} (${error.code ?? "no code"})`,
    );
  return new Error(`Could not ${what}. Nothing has been changed.`);
}

async function loadSolution(id: string): Promise<any> {
  const row = rowOrThrow<any>(
    await db().from("complete_solutions").select(SOLUTION_COLUMNS).eq("id", id).maybeSingle(),
    "this solution",
  );
  if (!row) throw new Error("That solution no longer exists.");
  return row;
}

async function loadComponent(id: string): Promise<any> {
  const row = rowOrThrow<any>(
    await db().from("solution_components").select(COMPONENT_COLUMNS).eq("id", id).maybeSingle(),
    "this component",
  );
  if (!row) throw new Error("That component no longer exists.");
  return row;
}

function assertLive(row: { archived_at?: string | null }, what: string) {
  if (row.archived_at) throw new Error(`This ${what} is archived. Restore it to change it.`);
}

async function recordEvents(
  rows: Array<{
    implementationId: string;
    solutionId: string;
    componentId?: string | null;
    kind: SolutionEventKind;
    from?: string | null;
    to?: string | null;
    reason?: string | null;
    actorProfileId: string;
  }>,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db()
    .from("solution_events")
    .insert(
      rows.map((r) => ({
        implementation_id: r.implementationId,
        complete_solution_id: r.solutionId,
        component_id: r.componentId ?? null,
        kind: r.kind,
        from_value: r.from ?? null,
        to_value: r.to ?? null,
        reason: r.reason ?? null,
        actor_profile_id: r.actorProfileId,
      })),
    );
  if (error) {
    console.error(
      `[solutions] history write failed: ${error.message ?? "unknown"} (${error.code ?? "no code"})`,
    );
    throw new Error(
      "The change was saved, but its history could not be recorded. Tell an admin before making more changes to this solution.",
    );
  }
}

function changeOf<T>(from: T | null | undefined, to: T | null | undefined): boolean {
  return (from ?? null) !== (to ?? null);
}

/** Adds a complete solution to an implementation. */
export async function createCompleteSolution(
  input: {
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
  },
  actorProfileId: string,
): Promise<SolutionView> {
  const impl = rowOrThrow<any>(
    await db().from("implementations").select("id").eq("id", input.implementationId).maybeSingle(),
    "this implementation",
  );
  if (!impl) throw new Error("That implementation no longer exists.");

  const { data, error } = await db()
    .from("complete_solutions")
    .insert({
      implementation_id: input.implementationId,
      title: input.title,
      scope: input.scope,
      source: input.source ?? "manual",
      priority: input.priority,
      // Set explicitly rather than left to the column defaults, so a row never
      // depends on who reads it to know its starting state.
      status: "not_started",
      readiness_confirmed: "not_ready",
      start_condition: input.startCondition ?? null,
      estimate_weeks: input.estimateWeeks ?? null,
      sow_quote: input.sowQuote ?? null,
      next_action: input.nextAction ?? null,
      target_date: input.targetDate ?? null,
      original_target_date: input.targetDate ?? null,
      created_by: actorProfileId,
    })
    .select(SOLUTION_COLUMNS)
    .single();
  if (error || !data) throw saveFailed("add the solution", error);
  const id = String((data as any).id);
  await recordEvents([
    {
      implementationId: input.implementationId,
      solutionId: id,
      kind: "created",
      to: input.title,
      actorProfileId,
    },
  ]);
  await audit({
    actor_type: "user",
    actor_id: actorProfileId,
    action: "solution.create",
    entity_type: "complete_solution",
    entity_id: id,
    payload: { scope: input.scope, source: input.source ?? "manual" },
  });
  return one(input.implementationId, id);
}

async function one(implementationId: string, solutionId: string): Promise<SolutionView> {
  const all = await loadSolutionsFor(implementationId);
  const found = all.find((s) => s.id === solutionId);
  if (!found) throw new Error("That solution no longer exists.");
  return found;
}

/**
 * Changes a solution's own fields. Marking it complete is refused while any
 * component is open, and the refusal names them.
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
  actorProfileId: string,
): Promise<SolutionView> {
  const row = await loadSolution(id);
  assertLive(row, "solution");
  const implementationId = String(row.implementation_id);

  if (patch.status === "complete" && row.status !== "complete") {
    const components = rowsOrThrow<any>(
      await db()
        .from("solution_components")
        .select("name, status, archived_at")
        .eq("complete_solution_id", id),
      "the solution components",
    );
    const open = openComponentsBlockingComplete(
      components.map((c: any) => ({
        name: String(c.name),
        status: c.status,
        archived: c.archived_at != null,
      })),
    );
    if (open.length > 0) {
      throw new Error(
        `This solution cannot be marked complete yet. Still open: ${open.join(", ")}.`,
      );
    }
  }

  const update: Record<string, unknown> = {};
  const events: Parameters<typeof recordEvents>[0] = [];
  const set = (
    column: string,
    key: keyof typeof patch,
    kind: SolutionEventKind,
    current: string | null | undefined,
  ) => {
    const next = patch[key];
    if (next === undefined || !changeOf(current, next as string | null)) return;
    update[column] = next;
    events.push({
      implementationId,
      solutionId: id,
      kind,
      from: current ?? null,
      to: (next as string | null) ?? null,
      actorProfileId,
    });
  };
  set("title", "title", "edited", row.title);
  set("scope", "scope", "edited", row.scope);
  set("priority", "priority", "priority", row.priority);
  set("status", "status", "status", row.status);
  set("next_action", "nextAction", "edited", row.next_action);
  set("start_condition", "startCondition", "edited", row.start_condition);

  if (Object.keys(update).length > 0) {
    const { error } = await db().from("complete_solutions").update(update).eq("id", id);
    if (error) throw saveFailed("save the solution", error);
    await recordEvents(events);
  }
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
  actorProfileId: string,
): Promise<SolutionView> {
  const row = await loadSolution(id);
  assertLive(row, "solution");
  const implementationId = String(row.implementation_id);
  const hadOriginal = row.original_target_date != null;
  if (!changeOf(row.target_date, targetDate)) return one(implementationId, id);
  if (
    requiresReason({ field: "target_date", hadOriginal, from: row.target_date, to: targetDate }) &&
    !reason
  ) {
    throw new Error("Say why the delivery date moves. The original date stays on record.");
  }
  // The previous date is taken before the write, so the history records what it was.
  const previousDate: string | null = row.target_date ?? null;
  const update: Record<string, unknown> = { target_date: targetDate };
  if (!hadOriginal && targetDate) update["original_target_date"] = targetDate;
  const { error } = await db().from("complete_solutions").update(update).eq("id", id);
  if (error) throw saveFailed("save the delivery date", error);
  await recordEvents([
    {
      implementationId,
      solutionId: id,
      kind: "target_date",
      from: previousDate,
      to: targetDate,
      reason,
      actorProfileId,
    },
  ]);
  return one(implementationId, id);
}

/** The TIS confirms a readiness. A material change needs a reason. */
export async function confirmSolutionReadiness(
  id: string,
  readiness: Readiness,
  reason: string | null,
  actorProfileId: string,
): Promise<SolutionView> {
  const row = await loadSolution(id);
  assertLive(row, "solution");
  const implementationId = String(row.implementation_id);
  const from = row.readiness_confirmed as Readiness;
  if (from === readiness) return one(implementationId, id);
  if (
    requiresReason({ field: "readiness_confirmed", hadOriginal: false, from, to: readiness }) &&
    !reason
  ) {
    throw new Error("Say why readiness changes. A reason is kept with the change.");
  }
  const { error } = await db()
    .from("complete_solutions")
    .update({
      readiness_confirmed: readiness,
      readiness_confirmed_at: new Date().toISOString(),
      readiness_confirmed_by: actorProfileId,
    })
    .eq("id", id);
  if (error) throw saveFailed("save readiness", error);
  await recordEvents([
    {
      implementationId,
      solutionId: id,
      kind: "readiness_confirmed",
      from,
      to: readiness,
      reason,
      actorProfileId,
    },
  ]);
  return one(implementationId, id);
}

/** Archives or restores a solution. Nothing is deleted. */
export async function setSolutionArchived(
  id: string,
  archived: boolean,
  reason: string | null,
  actorProfileId: string,
): Promise<SolutionView> {
  const row = await loadSolution(id);
  const implementationId = String(row.implementation_id);
  if ((row.archived_at != null) === archived) return one(implementationId, id);
  const { error } = await db()
    .from("complete_solutions")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw saveFailed(archived ? "archive the solution" : "restore the solution", error);
  await recordEvents([
    {
      implementationId,
      solutionId: id,
      kind: archived ? "archived" : "restored",
      reason,
      actorProfileId,
    },
  ]);
  return one(implementationId, id);
}

export async function createComponent(
  input: {
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
  },
  actorProfileId: string,
): Promise<SolutionView> {
  const solution = await loadSolution(input.solutionId);
  assertLive(solution, "solution");
  const implementationId = String(solution.implementation_id);
  const { data, error } = await db()
    .from("solution_components")
    .insert({
      implementation_id: implementationId,
      complete_solution_id: input.solutionId,
      category: input.category,
      integration_type: input.category === "integrations" ? (input.integrationType ?? null) : null,
      name: input.name,
      status: "not_started",
      priority: input.priority,
      form_built: false,
      customer_approved: false,
      sort_order: 0,
      target_date: input.targetDate ?? null,
      original_target_date: input.targetDate ?? null,
      start_condition: input.startCondition ?? null,
      estimate_weeks: input.estimateWeeks ?? null,
      next_action: input.nextAction ?? null,
      sow_quote: input.sowQuote ?? null,
      created_by: actorProfileId,
    })
    .select("id")
    .single();
  if (error || !data) throw saveFailed("add the component", error);
  const componentId = String((data as any).id);
  await recordEvents([
    {
      implementationId,
      solutionId: input.solutionId,
      componentId,
      kind: "created",
      to: input.name,
      actorProfileId,
    },
  ]);
  return one(implementationId, input.solutionId);
}

/**
 * Changes one component. A waiting component must say what it is waiting on;
 * a component that needs changes must say what. Moving a date that already had
 * an original needs a reason.
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
  },
  actorProfileId: string,
): Promise<SolutionView> {
  const row = await loadComponent(input.id);
  assertLive(row, "component");
  const solution = await loadSolution(row.complete_solution_id);
  assertLive(solution, "solution");
  const implementationId = String(row.implementation_id);
  const solutionId = String(row.complete_solution_id);

  const effectiveStatus = (input.status ?? row.status) as ComponentStatus;
  const effectiveBlocker = input.blocker !== undefined ? input.blocker : row.blocker;
  const effectiveUpdate = input.latestUpdate !== undefined ? input.latestUpdate : row.latest_update;
  if (effectiveStatus === "waiting" && !effectiveBlocker) {
    throw new Error("Record what it is waiting on before marking it Waiting.");
  }
  if (effectiveStatus === "changes_needed" && !effectiveUpdate) {
    throw new Error("Say what needs changing before marking it Changes Needed.");
  }

  const update: Record<string, unknown> = {};
  const events: Parameters<typeof recordEvents>[0] = [];
  const base = { implementationId, solutionId, componentId: input.id, actorProfileId };

  if (input.name !== undefined && changeOf(row.name, input.name)) {
    update["name"] = input.name;
    events.push({ ...base, kind: "edited", from: row.name, to: input.name });
  }
  if (input.priority !== undefined && changeOf(row.priority, input.priority)) {
    update["priority"] = input.priority;
    events.push({ ...base, kind: "priority", from: row.priority, to: input.priority });
  }
  if (input.status !== undefined && changeOf(row.status, input.status)) {
    update["status"] = input.status;
    events.push({ ...base, kind: "status", from: row.status, to: input.status });
  }
  if (input.targetDate !== undefined && changeOf(row.target_date, input.targetDate)) {
    const hadOriginal = row.original_target_date != null;
    if (
      requiresReason({
        field: "target_date",
        hadOriginal,
        from: row.target_date,
        to: input.targetDate,
      }) &&
      !input.targetChangeReason
    ) {
      throw new Error("Say why the target date moves. The original date stays on record.");
    }
    update["target_date"] = input.targetDate;
    update["target_change_reason"] = hadOriginal ? input.targetChangeReason : null;
    events.push({
      ...base,
      kind: "target_date",
      from: row.target_date ?? null,
      to: input.targetDate,
      reason: hadOriginal ? (input.targetChangeReason ?? null) : null,
    });
  }
  for (const [key, column, current] of [
    ["blocker", "blocker", row.blocker],
    ["latestUpdate", "latest_update", row.latest_update],
    ["nextAction", "next_action", row.next_action],
  ] as const) {
    const next = input[key];
    if (next === undefined || !changeOf(current, next)) continue;
    update[column] = next;
    if (key === "latestUpdate") update["latest_update_at"] = new Date().toISOString();
    events.push({ ...base, kind: "edited", from: current ?? null, to: next });
  }

  if (Object.keys(update).length > 0) {
    const { error } = await db().from("solution_components").update(update).eq("id", input.id);
    if (error) throw saveFailed("save the component", error);
    await recordEvents(events);
  }
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
  },
  actorProfileId: string,
): Promise<SolutionView> {
  const row = await loadComponent(input.id);
  assertLive(row, "component");
  if (row.category !== "forms") {
    throw new Error("Form tracking applies to a form component only.");
  }
  const implementationId = String(row.implementation_id);
  const solutionId = String(row.complete_solution_id);
  const base = { implementationId, solutionId, componentId: input.id, actorProfileId };
  const update: Record<string, unknown> = {};
  const events: Parameters<typeof recordEvents>[0] = [];

  if (input.formBuilt !== undefined && input.formBuilt !== row.form_built) {
    update["form_built"] = input.formBuilt;
    events.push({
      ...base,
      kind: "form_built",
      from: String(row.form_built),
      to: String(input.formBuilt),
    });
  }
  if (input.customerApproved !== undefined && input.customerApproved !== row.customer_approved) {
    update["customer_approved"] = input.customerApproved;
    events.push({
      ...base,
      kind: "customer_approved",
      from: String(row.customer_approved),
      to: String(input.customerApproved),
    });
  }
  if (input.submissionCount !== undefined) {
    const count = input.submissionCount;
    const checked = count === null ? null : (input.submissionCheckedOn ?? null);
    if (count !== null && !checked) {
      throw new Error("Enter the date the count was checked.");
    }
    if (count !== row.submission_count || checked !== row.submission_checked_on) {
      update["submission_count"] = count;
      update["submission_checked_on"] = checked;
      events.push({
        ...base,
        kind: "submission_count",
        from:
          row.submission_count == null
            ? null
            : `${row.submission_count} on ${row.submission_checked_on}`,
        to: count == null ? null : `${count} on ${checked}`,
      });
    }
  }
  if (
    input.usageConfirmedOn !== undefined &&
    input.usageConfirmedOn !== row.customer_usage_confirmed_on
  ) {
    update["customer_usage_confirmed_on"] = input.usageConfirmedOn;
    events.push({
      ...base,
      kind: "usage_confirmed",
      from: row.customer_usage_confirmed_on ?? null,
      to: input.usageConfirmedOn ?? null,
    });
  }

  if (Object.keys(update).length > 0) {
    const { error } = await db().from("solution_components").update(update).eq("id", input.id);
    if (error) throw saveFailed("save the form tracking", error);
    await recordEvents(events);
  }
  return one(implementationId, solutionId);
}

/**
 * Makes one component depend on another in the same implementation. A loop is
 * refused before anything is written.
 */
export async function addDependency(
  input: { componentId: string; dependsOnId: string; critical: boolean },
  actorProfileId: string,
): Promise<SolutionView> {
  if (input.componentId === input.dependsOnId) {
    throw new Error("A component cannot depend on itself.");
  }
  const a = await loadComponent(input.componentId);
  const b = await loadComponent(input.dependsOnId);
  assertLive(a, "component");
  assertLive(b, "component");
  if (String(a.implementation_id) !== String(b.implementation_id)) {
    throw new Error("A dependency must stay within one implementation.");
  }
  const implementationId = String(a.implementation_id);

  const idsOnImplementation = rowsOrThrow<any>(
    await db().from("solution_components").select("id").eq("implementation_id", implementationId),
    "the component dependencies",
  ).map((c: any) => c.id);
  const edges = idsOnImplementation.length
    ? rowsOrThrow<any>(
        await db()
          .from("solution_component_dependencies")
          .select("component_id, depends_on_id")
          .in("component_id", idsOnImplementation),
        "the component dependencies",
      ).map((e: any) => ({ from: String(e.component_id), to: String(e.depends_on_id) }))
    : [];
  if (wouldCreateCycle(edges, input.componentId, input.dependsOnId)) {
    throw new Error("That dependency would make the components depend on each other in a loop.");
  }

  const { error } = await db().from("solution_component_dependencies").insert({
    component_id: input.componentId,
    depends_on_id: input.dependsOnId,
    critical: input.critical,
  });
  if (error) {
    if (error.code === "23505") throw new Error("That dependency is already recorded.");
    throw saveFailed("save the dependency", error);
  }
  await recordEvents([
    {
      implementationId,
      solutionId: String(a.complete_solution_id),
      componentId: input.componentId,
      kind: "dependency_added",
      to: `${b.name}${input.critical ? " (critical)" : ""}`,
      actorProfileId,
    },
  ]);
  return one(implementationId, String(a.complete_solution_id));
}

export async function removeDependency(
  input: { componentId: string; dependsOnId: string },
  actorProfileId: string,
): Promise<SolutionView> {
  const a = await loadComponent(input.componentId);
  const b = await loadComponent(input.dependsOnId);
  const implementationId = String(a.implementation_id);
  const existing = rowOrThrow<any>(
    await db()
      .from("solution_component_dependencies")
      .select("component_id")
      .eq("component_id", input.componentId)
      .eq("depends_on_id", input.dependsOnId)
      .maybeSingle(),
    "the dependency",
  );
  if (!existing) throw new Error("That dependency is no longer recorded.");
  const { error } = await db()
    .from("solution_component_dependencies")
    .delete()
    .eq("component_id", input.componentId)
    .eq("depends_on_id", input.dependsOnId);
  if (error) throw saveFailed("remove the dependency", error);
  await recordEvents([
    {
      implementationId,
      solutionId: String(a.complete_solution_id),
      componentId: input.componentId,
      kind: "dependency_removed",
      from: b.name,
      actorProfileId,
    },
  ]);
  return one(implementationId, String(a.complete_solution_id));
}

/** Archives or restores a component. Nothing is deleted. */
export async function setComponentArchived(
  id: string,
  archived: boolean,
  reason: string | null,
  actorProfileId: string,
): Promise<SolutionView> {
  const row = await loadComponent(id);
  const implementationId = String(row.implementation_id);
  const solutionId = String(row.complete_solution_id);
  if ((row.archived_at != null) === archived) return one(implementationId, solutionId);
  const { error } = await db()
    .from("solution_components")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw saveFailed(archived ? "archive the component" : "restore the component", error);
  await recordEvents([
    {
      implementationId,
      solutionId,
      componentId: id,
      kind: archived ? "archived" : "restored",
      reason,
      actorProfileId,
    },
  ]);
  return one(implementationId, solutionId);
}

/** Who may see and change solutions: anyone signed in to the Hub, never a customer. */
export function assertInternalRole(role: string | null | undefined): void {
  if (!role || role === "customer") {
    throw new Error("Forbidden: internal users only.");
  }
}
