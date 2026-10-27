import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows, type TableFailures } from "./fake-supabase";

/**
 * Complete solutions on the server.
 *
 * Reads run against the in-memory stand-in. Writes do not: every write is one call
 * to a database function (0091), and the rules, locks, version checks and history
 * are proven by supabase/tests/0091_complete_solutions.sql against real Postgres.
 * What this file proves is the contract on the JavaScript side: each write calls
 * the right function with the arguments it takes, sends the version the screen
 * showed, sends only the fields the caller set, and turns each database refusal
 * into a plain sentence without inventing a success.
 *
 * The fixtures are a REFERENCE SHAPE, not the Mako Shark SOW, which is not in the
 * repository (see the PR's manual test steps).
 */

const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    audit: { audit: vi.fn(async () => {}) },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../server/audit", () => h.audit);

import {
  addDependency,
  assertInternalRole,
  canEditSolutions,
  confirmSolutionReadiness,
  insertComponent,
  insertCompleteSolution,
  loadSolutionHistory,
  loadSolutionsFor,
  loadWorkspace,
  removeDependency,
  saveReviewedSet,
  setComponentArchived,
  setFormTracking,
  setSolutionArchived,
  setSolutionTargetDate,
  summarizeSolutions,
  updateCompleteSolution,
  updateComponent,
  type ReviewedSave,
} from "../complete-solutions.server";

const ORG = "00000000-0000-4000-8000-000000000001";
const IMPL = "d0000000-0000-4000-8000-0000000000a1";
const ACTOR = "a0000000-0000-4000-8000-0000000000a1";
const SOL = "e0000000-0000-4000-8000-0000000000a1";
const COMP_A = "f0000000-0000-4000-8000-0000000000a1";
const COMP_B = "f0000000-0000-4000-8000-0000000000a2";
const V_SOL = "2026-10-20T09:00:00.123456+00:00";
const V_A = "2026-10-20T09:05:00.000001+00:00";
const V_B = "2026-10-20T09:06:00.000002+00:00";
const TODAY = "2026-10-27";

type Rpc = { fn: string; args: Record<string, any> };
type RpcHandlers = Record<string, (args: Record<string, any>) => { data?: any; error?: any }>;

let errorLog: ReturnType<typeof vi.spyOn>;
let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  h.audit.audit.mockClear();
});
afterEach(() => {
  errorLog.mockRestore();
});

/**
 * Every function succeeds with no data unless a test scripts it. A test that
 * needs a value (an id, a refusal, a permission) scripts that one function.
 */
function load(rows: Rows, options: { fail?: TableFailures; rpc?: RpcHandlers } = {}) {
  const defaults: RpcHandlers = new Proxy(options.rpc ?? {}, {
    get: (scripted, fn) =>
      typeof fn === "string" && fn in scripted ? scripted[fn] : () => ({ data: null }),
  });
  fake = createFakeSupabase(rows, {
    ...(options.fail ? { fail: options.fail } : {}),
    rpcHandlers: defaults,
  });
  h.supabase.client = fake.client;
}

/** Only the calls that wrote, in order (reads are not rpc calls). */
const writes = (): Rpc[] => fake.rpcs.filter((r) => r.fn !== "solution_may_edit");

function seeded(): Rows {
  return {
    implementations: [{ id: IMPL, org_id: ORG, name: "Rollout", current_stage: "build" }],
    portal_profiles: [
      { id: ACTOR, full_name: "Sam TIS", email: "sam@gocanvas.test", role: "implementation" },
    ],
    complete_solutions: [
      {
        id: SOL,
        org_id: ORG,
        implementation_id: IMPL,
        title: "Inspections",
        scope: "purchased",
        source: "sow",
        purchased_service_id: "svc-1",
        priority: "needed_for_go_live",
        status: "in_progress",
        readiness_confirmed: "not_ready",
        target_date: "2026-10-01",
        original_target_date: "2026-10-01",
        next_action: null,
        archived_at: null,
        created_at: "2026-10-01T00:00:00Z",
        updated_at: V_SOL,
      },
    ],
    solution_components: [
      {
        id: COMP_A,
        org_id: ORG,
        implementation_id: IMPL,
        complete_solution_id: SOL,
        category: "forms",
        integration_type: null,
        name: "Inspection form",
        status: "complete",
        priority: "needed_for_go_live",
        form_built: true,
        customer_approved: false,
        sort_order: 0,
        created_at: "2026-10-01T00:00:00Z",
        updated_at: V_A,
      },
      {
        id: COMP_B,
        org_id: ORG,
        implementation_id: IMPL,
        complete_solution_id: SOL,
        category: "integrations",
        integration_type: "dispatch",
        name: "Dispatch feed",
        status: "being_built",
        priority: "needed_for_go_live",
        form_built: false,
        customer_approved: false,
        sort_order: 1,
        created_at: "2026-10-01T00:00:00Z",
        updated_at: V_B,
      },
    ],
    solution_component_dependencies: [
      {
        component_id: COMP_B,
        depends_on_id: COMP_A,
        critical: true,
        created_at: "2026-10-01T00:00:00Z",
      },
    ],
    solution_events: [],
    technical_solutions: [],
  };
}

/* ------------------------------------------------------------- reads */

describe("reads: what the workspace and Customer 360 show", () => {
  it("returns each solution with its version, its purchase link and its suggested readiness", async () => {
    load(seeded());
    const [sol] = await loadSolutionsFor(IMPL);
    expect(sol).toMatchObject({
      id: SOL,
      scope: "purchased",
      purchasedServiceId: "svc-1",
      updatedAt: V_SOL,
      readinessSuggested: { readiness: "not_ready" },
    });
    expect(sol!.components.map((c) => [c.name, c.updatedAt])).toEqual([
      ["Inspection form", V_A],
      ["Dispatch feed", V_B],
    ]);
    expect(sol!.components[1]!.dependsOn).toEqual([
      { id: COMP_A, name: "Inspection form", critical: true, status: "complete" },
    ]);
  });

  it("says a read failed rather than showing no solutions", async () => {
    load(seeded(), { fail: { complete_solutions: { message: "connection reset" } } });
    await expect(loadSolutionsFor(IMPL)).rejects.toThrow();
  });

  it("returns the solutions with whether this person may change them", async () => {
    load(seeded(), { rpc: { solution_may_edit: () => ({ data: true }) } });
    const ws = await loadWorkspace(IMPL, ACTOR);
    expect(ws.canEdit).toBe(true);
    expect(ws.solutions.map((s) => s.id)).toEqual([SOL]);
    expect(fake.rpcs).toEqual([
      { fn: "solution_may_edit", args: { p_profile: ACTOR, p_implementation: IMPL } },
    ]);
  });

  it("summarises what is overdue and waiting, from the same rows the workspace shows", async () => {
    const rows = seeded();
    rows["solution_components"]![1]!["status"] = "waiting";
    rows["solution_components"]![1]!["blocker"] = "Sandbox access from the customer";
    load(rows);
    const summary = summarizeSolutions(await loadSolutionsFor(IMPL), TODAY);
    expect(summary.overdue).toEqual([{ label: "Inspections", targetDate: "2026-10-01" }]);
    expect(summary.waiting).toEqual([
      { label: "Inspections · Dispatch feed", reason: "Sandbox access from the customer" },
    ]);
    expect(summary.purchased).toBe(1);
  });

  it("reads the history newest first, with the component and the person named", async () => {
    const rows = seeded();
    rows["solution_events"] = [
      {
        id: "ev-1",
        complete_solution_id: SOL,
        component_id: COMP_B,
        kind: "status",
        from_value: "not_started",
        to_value: "being_built",
        reason: null,
        actor_profile_id: ACTOR,
        created_at: "2026-10-02T10:00:00Z",
      },
      {
        id: "ev-2",
        complete_solution_id: SOL,
        component_id: null,
        kind: "created",
        from_value: null,
        to_value: "Inspections",
        reason: null,
        actor_profile_id: ACTOR,
        created_at: "2026-10-01T10:00:00Z",
      },
    ];
    load(rows);
    const history = await loadSolutionHistory(SOL);
    expect(history.map((e) => e.kind)).toEqual(["status", "created"]);
    expect(history[0]).toMatchObject({
      componentName: "Dispatch feed",
      actorName: "Sam TIS",
      fromValue: "not_started",
      toValue: "being_built",
    });
  });
});

/* ------------------------------------------------------------ writes */

describe("writes: one database call each, with the version the screen showed", () => {
  it("updateCompleteSolution sends the version and only the fields that were set", async () => {
    load(seeded());
    await updateCompleteSolution(
      SOL,
      { title: "Inspections (signed)", nextAction: null },
      V_SOL,
      ACTOR,
    );
    expect(writes()).toEqual([
      {
        fn: "solution_update",
        args: {
          p_profile: ACTOR,
          p_id: SOL,
          p_expected: V_SOL,
          p_patch: { title: "Inspections (signed)", next_action: null },
        },
      },
    ]);
  });

  it("setSolutionTargetDate passes the date and the reason to the function", async () => {
    load(seeded());
    await setSolutionTargetDate(SOL, "2026-11-20", "Vendor sandbox slipped", V_SOL, ACTOR);
    expect(writes()[0]).toEqual({
      fn: "solution_set_target",
      args: {
        p_profile: ACTOR,
        p_id: SOL,
        p_expected: V_SOL,
        p_target: "2026-11-20",
        p_reason: "Vendor sandbox slipped",
      },
    });
  });

  it("confirmSolutionReadiness and setSolutionArchived pass their own version and reason", async () => {
    load(seeded());
    await confirmSolutionReadiness(SOL, "at_risk", "Waiting on the sandbox", V_SOL, ACTOR);
    await setSolutionArchived(SOL, true, null, V_SOL, ACTOR);
    expect(writes().map((w) => w.fn)).toEqual([
      "solution_confirm_readiness",
      "solution_set_archived",
    ]);
    expect(writes()[0]!.args).toMatchObject({
      p_readiness: "at_risk",
      p_reason: "Waiting on the sandbox",
      p_expected: V_SOL,
    });
    expect(writes()[1]!.args).toMatchObject({ p_archived: true, p_expected: V_SOL });
  });

  it("insertCompleteSolution returns the new id from the function and records the purchase link", async () => {
    load(seeded(), {
      rpc: { solution_create: () => ({ data: "e0000000-0000-4000-8000-0000000000b9" }) },
    });
    const id = await insertCompleteSolution(
      {
        implementationId: IMPL,
        title: "Dispatch",
        scope: "purchased",
        priority: "needed_for_go_live",
        purchasedServiceId: "svc-2",
      },
      ACTOR,
    );
    expect(id).toBe("e0000000-0000-4000-8000-0000000000b9");
    expect(writes()[0]).toMatchObject({
      fn: "solution_create",
      args: {
        p_implementation: IMPL,
        p_title: "Dispatch",
        p_source: "manual",
        p_purchased_service_id: "svc-2",
      },
    });
  });

  it("insertComponent sends the integration type only for an integration", async () => {
    load(seeded(), {
      rpc: { component_create: () => ({ data: "f0000000-0000-4000-8000-0000000000b9" }) },
    });
    await insertComponent(
      {
        solutionId: SOL,
        category: "forms",
        integrationType: "dispatch",
        name: "Form",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    expect(writes()[0]!.args["p_integration_type"]).toBeNull();
  });

  it("updateComponent sends the component's version, and the reason for a moved date", async () => {
    load(seeded());
    await updateComponent(
      {
        id: COMP_B,
        status: "waiting",
        blocker: "Sandbox access",
        targetDate: "2026-11-24",
        targetChangeReason: "Vendor sandbox slipped",
        expectedUpdatedAt: V_B,
      },
      ACTOR,
    );
    expect(writes()[0]).toEqual({
      fn: "component_update",
      args: {
        p_profile: ACTOR,
        p_id: COMP_B,
        p_expected: V_B,
        p_patch: { status: "waiting", blocker: "Sandbox access", target_date: "2026-11-24" },
        p_target_reason: "Vendor sandbox slipped",
      },
    });
  });

  it("setFormTracking sends the checked date only with a count, so a count is never recorded undated", async () => {
    load(seeded());
    await setFormTracking({ id: COMP_A, formBuilt: true, expectedUpdatedAt: V_A }, ACTOR);
    await setFormTracking(
      {
        id: COMP_A,
        submissionCount: 40,
        submissionCheckedOn: "2026-10-26",
        expectedUpdatedAt: V_A,
      },
      ACTOR,
    );
    expect(writes()[0]!.args["p_patch"]).toEqual({ form_built: true });
    expect(writes()[1]!.args["p_patch"]).toEqual({
      submission_count: 40,
      submission_checked_on: "2026-10-26",
    });
  });

  it("addDependency and removeDependency pass both components to the function", async () => {
    load(seeded());
    await addDependency({ componentId: COMP_A, dependsOnId: COMP_B, critical: false }, ACTOR);
    await removeDependency({ componentId: COMP_B, dependsOnId: COMP_A }, ACTOR);
    expect(writes().map((w) => w.fn)).toEqual(["dependency_add", "dependency_remove"]);
    expect(writes()[0]!.args).toEqual({
      p_profile: ACTOR,
      p_component: COMP_A,
      p_depends_on: COMP_B,
      p_critical: false,
    });
  });

  it("setComponentArchived sends the component's version", async () => {
    load(seeded());
    await setComponentArchived(COMP_B, true, null, V_B, ACTOR);
    expect(writes()[0]).toMatchObject({
      fn: "component_set_archived",
      args: { p_id: COMP_B, p_expected: V_B, p_archived: true },
    });
  });

  it("saveReviewedSet sends the whole set in one call and returns what the function kept", async () => {
    const set: ReviewedSave[] = [
      {
        title: "Inspections",
        scope: "purchased",
        priority: "needed_for_go_live",
        purchasedServiceId: null,
        startCondition: null,
        estimateWeeks: 3,
        sowQuote: "Inspection forms",
        suggestedTarget: null,
        components: [
          {
            category: "forms",
            integrationType: null,
            name: "Inspection form",
            priority: "needed_for_go_live",
            dependsOn: [],
            critical: false,
            startCondition: null,
            estimateWeeks: null,
            sowQuote: null,
            suggestedTarget: null,
          },
        ],
      },
    ];
    load(seeded(), {
      rpc: {
        solution_save_reviewed_set: () => ({
          data: {
            created: [{ title: "Inspections", components: 1, dependencies: 0 }],
            skipped: [],
          },
        }),
      },
    });
    const result = await saveReviewedSet(IMPL, set, "Signed SOW", ACTOR);
    expect(result.created).toEqual([{ title: "Inspections", components: 1, dependencies: 0 }]);
    expect(writes()[0]!.fn).toBe("solution_save_reviewed_set");
    expect(writes()[0]!.args["p_solutions"][0]).toMatchObject({
      title: "Inspections",
      estimateWeeks: 3,
    });
  });
});

/* ------------------------------------------------------------ refusals */

describe("refusals: the database's sentence is shown; nothing is reported as saved", () => {
  it("passes a permission refusal through unchanged", async () => {
    load(seeded(), {
      rpc: {
        solution_update: () => ({
          error: {
            code: "42501",
            message:
              "You can change the solutions of implementations you own. A manager or admin can change any of them.",
          },
        }),
      },
    });
    await expect(updateCompleteSolution(SOL, { title: "x" }, V_SOL, ACTOR)).rejects.toThrow(
      "You can change the solutions of implementations you own.",
    );
  });

  it("passes a stale-version refusal through, so the person reloads rather than overwriting", async () => {
    load(seeded(), {
      rpc: {
        component_update: () => ({
          error: {
            code: "P0409",
            message:
              "This changed while you were looking at it. Reload to see the latest, then make the change again.",
          },
        }),
      },
    });
    await expect(
      updateComponent({ id: COMP_B, status: "complete", expectedUpdatedAt: V_B }, ACTOR),
    ).rejects.toThrow("This changed while you were looking at it.");
  });

  it("passes a broken-rule refusal through, for example a loop", async () => {
    load(seeded(), {
      rpc: {
        dependency_add: () => ({
          error: {
            code: "22023",
            message: "That dependency would make the components depend on each other in a loop.",
          },
        }),
      },
    });
    await expect(
      addDependency({ componentId: COMP_A, dependsOnId: COMP_B, critical: false }, ACTOR),
    ).rejects.toThrow("depend on each other in a loop");
  });

  it("says nothing was changed for any other failure, and logs what happened", async () => {
    load(seeded(), {
      rpc: {
        solution_set_archived: () => ({ error: { code: "08006", message: "connection failure" } }),
      },
    });
    await expect(setSolutionArchived(SOL, true, null, V_SOL, ACTOR)).rejects.toThrow(
      "Could not archive the solution. Nothing has been changed.",
    );
    expect(errorLog).toHaveBeenCalled();
  });

  it("never reports a saved change when the function returned an error", async () => {
    load(seeded(), {
      rpc: { solution_create: () => ({ error: { code: "08006", message: "connection failure" } }) },
    });
    await expect(
      insertCompleteSolution(
        { implementationId: IMPL, title: "x", scope: "purchased", priority: "needed_for_go_live" },
        ACTOR,
      ),
    ).rejects.toThrow("Nothing has been changed");
  });
});

/* ---------------------------------------------------------- permissions */

describe("permissions on the server", () => {
  it("reports that a person may edit only when the function says so", async () => {
    load(seeded(), { rpc: { solution_may_edit: () => ({ data: true }) } });
    expect(await canEditSolutions(ACTOR, IMPL)).toBe(true);
  });

  it("treats a failed permission check as no, so the screen offers nothing it cannot save", async () => {
    load(seeded(), {
      rpc: { solution_may_edit: () => ({ error: { code: "08006", message: "down" } }) },
    });
    expect(await canEditSolutions(ACTOR, IMPL)).toBe(false);
  });

  it("refuses a customer login and a login with no role", () => {
    expect(() => assertInternalRole("customer")).toThrow("Forbidden: internal users only.");
    expect(() => assertInternalRole(null)).toThrow("Forbidden: internal users only.");
    expect(() => assertInternalRole("implementation")).not.toThrow();
  });
});

describe("purchased scope against the deal's purchase record", () => {
  it("is not checked when the implementation has no deal", async () => {
    load(seeded());
    const ws = await loadWorkspace(IMPL, ACTOR);
    expect(ws.purchase).toEqual({
      hasRecord: false,
      solutionsWithoutRecord: [],
      recordsWithoutSolution: [],
    });
  });

  it("names the deal's item that no solution delivers, and reads the deal without changing it", async () => {
    const rows = seeded();
    rows["implementations"]![0]!["deal_id"] = "deal-1";
    rows["portal_accounts"] = [
      {
        id: "deal-1",
        intake: {
          timeline: {
            services: [
              { id: "svc-1", kind: "custom_pdf", name: "Inspections", phase: 1 },
              { id: "svc-9", kind: "analytics", name: "Fuel log", phase: 1 },
            ],
          },
        },
      },
    ];
    load(rows);
    const ws = await loadWorkspace(IMPL, ACTOR);
    expect(ws.purchase).toEqual({
      hasRecord: true,
      solutionsWithoutRecord: [],
      recordsWithoutSolution: [{ id: "svc-9", name: "Fuel log", kind: "analytics" }],
    });
    expect(writes()).toEqual([]);
    expect(fake.inserts).toEqual([]);
  });
});
