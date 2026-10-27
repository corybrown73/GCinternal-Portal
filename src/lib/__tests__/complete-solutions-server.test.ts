import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows, type TableFailures } from "./fake-supabase";

/**
 * Complete solutions on the server, against the in-memory database stand-in.
 *
 * The fixtures are a REFERENCE SHAPE, not the Mako Shark SOW: the SOW itself is
 * not in the repository, so these rows illustrate what a multi-component
 * solution looks like. The real SOW is checked by hand (see the PR's manual
 * test steps).
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
  confirmSolutionReadiness,
  createComponent,
  createCompleteSolution,
  loadSolutionHistory,
  loadSolutionsFor,
  removeDependency,
  setComponentArchived,
  setFormTracking,
  setSolutionArchived,
  setSolutionTargetDate,
  summarizeSolutions,
  updateCompleteSolution,
  updateComponent,
} from "../complete-solutions.server";

const ORG = "00000000-0000-4000-8000-000000000001";
const IMPL = "d0000000-0000-4000-8000-0000000000a1";
const OTHER_IMPL = "d0000000-0000-4000-8000-0000000000a2";
const ACTOR = "a0000000-0000-4000-8000-0000000000a1";
const TODAY = "2026-10-27";

let errorLog: ReturnType<typeof vi.spyOn>;
let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  h.audit.audit.mockClear();
});
afterEach(() => {
  errorLog.mockRestore();
});

/** The primary key of a dependency is a unique index, as in 0091. */
const UNIQUE = { solution_component_dependencies: [{ cols: ["component_id", "depends_on_id"] }] };

function use(rows: Rows, fail?: TableFailures) {
  fake = createFakeSupabase(rows, { unique: UNIQUE, ...(fail ? { fail } : {}) });
  h.supabase.client = fake.client;
}

function baseRows(): Rows {
  return {
    implementations: [
      {
        id: IMPL,
        org_id: ORG,
        customer_id: "c-1",
        name: "Mako Shark rollout",
        current_stage: "build",
      },
      {
        id: OTHER_IMPL,
        org_id: ORG,
        customer_id: "c-1",
        name: "Second rollout",
        current_stage: "build",
      },
    ],
    portal_profiles: [
      { id: ACTOR, full_name: "Sam TIS", email: "sam@gocanvas.test", role: "implementation" },
    ],
    complete_solutions: [],
    solution_components: [],
    solution_component_dependencies: [],
    solution_events: [],
    technical_solutions: [],
  };
}

/** The events written so far, in order, as "kind:to" strings for readable assertions. */
const eventKinds = () =>
  fake.inserts.filter((i) => i.table === "solution_events").map((i) => i.row.kind);

/* ----------------------------------------- a realistic multi-component solution */

describe("a multi-component solution, end to end (reference shape)", () => {
  it("is created with its components, and its readiness follows the work", async () => {
    use(baseRows());
    const created = await createCompleteSolution(
      {
        implementationId: IMPL,
        title: "Inspections",
        scope: "purchased",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    expect(created.components).toEqual([]);
    expect(created.readinessSuggested.readiness).toBe("not_ready");

    let view = await createComponent(
      {
        solutionId: created.id,
        category: "forms",
        name: "Inspection form",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    const form = view.components[0]!;
    view = await createComponent(
      {
        solutionId: created.id,
        category: "integrations",
        integrationType: "dispatch",
        name: "Dispatch feed",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    const dispatch = view.components.find((c) => c.name === "Dispatch feed")!;
    view = await createComponent(
      {
        solutionId: created.id,
        category: "analytics",
        name: "Weekly dashboard",
        priority: "deliver_during_implementation",
      },
      ACTOR,
    );
    view = await createComponent(
      {
        solutionId: created.id,
        category: "training",
        name: "Crew training",
        priority: "planned_for_later",
      },
      ACTOR,
    );
    expect(view.components.map((c) => c.category)).toEqual([
      "forms",
      "integrations",
      "analytics",
      "training",
    ]);

    // The dispatch feed cannot be finished until the form exists.
    view = await addDependency(
      { componentId: dispatch.id, dependsOnId: form.id, critical: true },
      ACTOR,
    );
    expect(view.readinessSuggested.readiness).toBe("at_risk");
    expect(view.readinessSuggested.reasons).toContain(
      "Dispatch feed cannot finish until Inspection form is complete.",
    );

    view = await updateComponent({ id: form.id, status: "being_built" }, ACTOR);
    view = await updateComponent({ id: form.id, status: "complete" }, ACTOR);
    view = await updateComponent(
      { id: dispatch.id, status: "waiting", blocker: "Customer has not sent the API login" },
      ACTOR,
    );
    expect(view.readinessSuggested.readiness).toBe("at_risk");
    expect(view.readinessSuggested.reasons).toContain("Dispatch feed is waiting.");

    view = await updateComponent(
      { id: dispatch.id, status: "ready_for_testing", blocker: null },
      ACTOR,
    );
    expect(view.readinessSuggested.readiness).toBe("not_ready");
  });

  it("refuses to complete the solution while a component is open, and names it", async () => {
    use(baseRows());
    const s = await createCompleteSolution(
      {
        implementationId: IMPL,
        title: "Inspections",
        scope: "purchased",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    await createComponent(
      {
        solutionId: s.id,
        category: "forms",
        name: "Inspection form",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    await expect(updateCompleteSolution(s.id, { status: "complete" }, ACTOR)).rejects.toThrow(
      "Still open: Inspection form.",
    );
  });

  it("keeps the TIS's confirmed readiness separate from the suggestion, and needs a reason to move it", async () => {
    use(baseRows());
    const s = await createCompleteSolution(
      {
        implementationId: IMPL,
        title: "Inspections",
        scope: "purchased",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    await createComponent(
      { solutionId: s.id, category: "forms", name: "Form", priority: "needed_for_go_live" },
      ACTOR,
    );
    await expect(confirmSolutionReadiness(s.id, "ready", null, ACTOR)).rejects.toThrow(
      "Say why readiness changes",
    );
    const view = await confirmSolutionReadiness(
      s.id,
      "ready",
      "Customer tested the form on Monday",
      ACTOR,
    );
    expect(view.readinessConfirmed).toBe("ready");
    expect(view.readinessSuggested.readiness).toBe("not_ready");
    expect(eventKinds()).toContain("readiness_confirmed");
  });
});

/* ------------------------------------------------------ two unrelated solutions */

describe("two unrelated complete solutions on one implementation", () => {
  it("keeps their components, readiness and history apart", async () => {
    use(baseRows());
    const a = await createCompleteSolution(
      {
        implementationId: IMPL,
        title: "Inspections",
        scope: "purchased",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    const b = await createCompleteSolution(
      {
        implementationId: IMPL,
        title: "Fuel log",
        scope: "purchased",
        priority: "deliver_during_implementation",
      },
      ACTOR,
    );
    await createComponent(
      {
        solutionId: a.id,
        category: "forms",
        name: "Inspection form",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    await createComponent(
      { solutionId: b.id, category: "forms", name: "Fuel form", priority: "needed_for_go_live" },
      ACTOR,
    );

    const all = await loadSolutionsFor(IMPL);
    expect(all.map((s) => s.title)).toEqual(["Inspections", "Fuel log"]);
    expect(all.find((s) => s.title === "Inspections")!.components.map((c) => c.name)).toEqual([
      "Inspection form",
    ]);
    expect(all.find((s) => s.title === "Fuel log")!.components.map((c) => c.name)).toEqual([
      "Fuel form",
    ]);

    const fuelForm = all.find((s) => s.title === "Fuel log")!.components[0]!;
    await updateComponent({ id: fuelForm.id, status: "complete" }, ACTOR);
    const after = await loadSolutionsFor(IMPL);
    expect(after.find((s) => s.title === "Inspections")!.readinessSuggested.readiness).toBe(
      "not_ready",
    );
    expect(after.find((s) => s.title === "Fuel log")!.readinessSuggested.readiness).toBe("ready");

    const history = await loadSolutionHistory(a.id);
    expect(history.every((e) => e.componentName !== "Fuel form")).toBe(true);
  });

  it("refuses a component whose solution belongs to the other implementation", async () => {
    use(baseRows());
    const other = await createCompleteSolution(
      {
        implementationId: OTHER_IMPL,
        title: "Elsewhere",
        scope: "purchased",
        priority: "planned_for_later",
      },
      ACTOR,
    );
    const mine = await createCompleteSolution(
      { implementationId: IMPL, title: "Here", scope: "purchased", priority: "planned_for_later" },
      ACTOR,
    );
    const form = (
      await createComponent(
        { solutionId: mine.id, category: "forms", name: "F", priority: "planned_for_later" },
        ACTOR,
      )
    ).components[0]!;
    await expect(
      addDependency(
        {
          componentId: form.id,
          dependsOnId: (
            await createComponent(
              { solutionId: other.id, category: "other", name: "X", priority: "planned_for_later" },
              ACTOR,
            )
          ).components.find((c) => c.name === "X")!.id,
          critical: false,
        },
        ACTOR,
      ),
    ).rejects.toThrow("must stay within one implementation");
  });
});

/* ---------------------------------------------------- existing records survive */

describe("existing records are kept", () => {
  it("shows an archived solution as history rather than hiding it", async () => {
    const rows = baseRows();
    rows["complete_solutions"] = [
      {
        id: "s-old",
        implementation_id: IMPL,
        title: "Old dashboard",
        scope: "purchased",
        source: "manual",
        priority: "planned_for_later",
        status: "not_started",
        readiness_confirmed: "not_ready",
        archived_at: "2026-09-01T00:00:00Z",
        created_at: "2026-08-01T00:00:00Z",
      },
    ];
    use(rows);
    const all = await loadSolutionsFor(IMPL);
    expect(all).toHaveLength(1);
    expect(all[0]!.archived).toBe(true);
    expect(summarizeSolutions(all, TODAY).solutions).toBe(0);
  });

  it("does not touch the engineering record a component points at", async () => {
    const rows = baseRows();
    rows["technical_solutions"] = [
      { id: "ts-1", implementation_id: IMPL, title: "Dispatch build", status: "built" },
    ];
    rows["complete_solutions"] = [
      {
        id: "s-1",
        implementation_id: IMPL,
        title: "Dispatch",
        scope: "purchased",
        source: "manual",
        priority: "needed_for_go_live",
        status: "in_progress",
        readiness_confirmed: "not_ready",
        created_at: "2026-08-01T00:00:00Z",
      },
    ];
    rows["solution_components"] = [
      {
        id: "c-1",
        org_id: ORG,
        implementation_id: IMPL,
        complete_solution_id: "s-1",
        category: "integrations",
        integration_type: "dispatch",
        name: "Dispatch feed",
        status: "being_built",
        priority: "needed_for_go_live",
        technical_solution_id: "ts-1",
        form_built: false,
        customer_approved: false,
        created_at: "2026-08-02T00:00:00Z",
      },
    ];
    use(rows);
    const [solution] = await loadSolutionsFor(IMPL);
    expect(solution!.components[0]!.technicalSolutionId).toBe("ts-1");
    await updateComponent({ id: "c-1", status: "complete" }, ACTOR);
    expect(rows["technical_solutions"]).toEqual([
      { id: "ts-1", implementation_id: IMPL, title: "Dispatch build", status: "built" },
    ]);
  });
});

/* ----------------------------------------------------------------- dates */

describe("dates: the original is kept and every move is explained", () => {
  it("keeps the first date given as the original and records a later move with its reason", async () => {
    use(baseRows());
    const s = await createCompleteSolution(
      {
        implementationId: IMPL,
        title: "Inspections",
        scope: "purchased",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    let view = await setSolutionTargetDate(s.id, "2026-11-20", null, ACTOR);
    expect(view.targetDate).toBe("2026-11-20");
    expect(view.originalTargetDate).toBe("2026-11-20");

    await expect(setSolutionTargetDate(s.id, "2026-12-04", null, ACTOR)).rejects.toThrow(
      "Say why the delivery date moves",
    );
    view = await setSolutionTargetDate(
      s.id,
      "2026-12-04",
      "Customer's go-live moved to December",
      ACTOR,
    );
    expect(view.targetDate).toBe("2026-12-04");
    expect(view.originalTargetDate).toBe("2026-11-20");

    const history = await loadSolutionHistory(s.id);
    // Two target_date entries: the first date given, and the move with its reason.
    const move = history.find((e) => e.kind === "target_date" && e.reason !== null)!;
    expect(move).toMatchObject({
      fromValue: "2026-11-20",
      toValue: "2026-12-04",
      reason: "Customer's go-live moved to December",
    });
  });

  it("keeps a component's original target date when it moves, and refuses a move with no reason", async () => {
    use(baseRows());
    const s = await createCompleteSolution(
      {
        implementationId: IMPL,
        title: "Inspections",
        scope: "purchased",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    const view = await createComponent(
      {
        solutionId: s.id,
        category: "integrations",
        integrationType: "dispatch",
        name: "Dispatch feed",
        priority: "needed_for_go_live",
        targetDate: "2026-11-10",
      },
      ACTOR,
    );
    const c = view.components[0]!;
    expect(c.originalTargetDate).toBe("2026-11-10");
    await expect(updateComponent({ id: c.id, targetDate: "2026-11-24" }, ACTOR)).rejects.toThrow(
      "Say why the target date moves",
    );
    const moved = await updateComponent(
      {
        id: c.id,
        targetDate: "2026-11-24",
        targetChangeReason: "Waiting on the other system's sandbox",
      },
      ACTOR,
    );
    expect(moved.components[0]).toMatchObject({
      targetDate: "2026-11-24",
      originalTargetDate: "2026-11-10",
    });
  });
});

/* ------------------------------------------------------------ form tracking */

describe("forms: built, approved, submissions and usage are tracked separately", () => {
  async function formFixture() {
    use(baseRows());
    const s = await createCompleteSolution(
      {
        implementationId: IMPL,
        title: "Inspections",
        scope: "purchased",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    const view = await createComponent(
      {
        solutionId: s.id,
        category: "forms",
        name: "Inspection form",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    return { solutionId: s.id, form: view.components[0]! };
  }

  it("records a submission count with the date it was checked", async () => {
    const { form } = await formFixture();
    const view = await setFormTracking(
      { id: form.id, submissionCount: 40, submissionCheckedOn: "2026-10-26" },
      ACTOR,
    );
    expect(view.components[0]).toMatchObject({
      submissionCount: 40,
      submissionCheckedOn: "2026-10-26",
    });
  });

  it("refuses a submission count without the date it was checked", async () => {
    const { form } = await formFixture();
    await expect(setFormTracking({ id: form.id, submissionCount: 40 }, ACTOR)).rejects.toThrow(
      "Enter the date the count was checked",
    );
  });

  it("never sets customer usage from a submission count", async () => {
    const { form } = await formFixture();
    const view = await setFormTracking(
      { id: form.id, submissionCount: 500, submissionCheckedOn: "2026-10-26" },
      ACTOR,
    );
    expect(view.components[0]!.customerUsageConfirmedOn).toBeNull();
    expect(eventKinds()).not.toContain("usage_confirmed");
  });

  it("records usage only when a person confirms it on a date", async () => {
    const { form } = await formFixture();
    const view = await setFormTracking({ id: form.id, usageConfirmedOn: "2026-10-27" }, ACTOR);
    expect(view.components[0]!.customerUsageConfirmedOn).toBe("2026-10-27");
  });

  it("refuses form tracking on anything that is not a form", async () => {
    use(baseRows());
    const s = await createCompleteSolution(
      {
        implementationId: IMPL,
        title: "Dashboards",
        scope: "purchased",
        priority: "deliver_during_implementation",
      },
      ACTOR,
    );
    const view = await createComponent(
      {
        solutionId: s.id,
        category: "analytics",
        name: "Dashboard",
        priority: "deliver_during_implementation",
      },
      ACTOR,
    );
    await expect(
      setFormTracking({ id: view.components[0]!.id, formBuilt: true }, ACTOR),
    ).rejects.toThrow("applies to a form component only");
  });
});

/* ---------------------------------------------------------- dependencies */

describe("dependencies", () => {
  it("refuses a loop, so the critical path can always be followed", async () => {
    use(baseRows());
    const s = await createCompleteSolution(
      {
        implementationId: IMPL,
        title: "Inspections",
        scope: "purchased",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    let view = await createComponent(
      { solutionId: s.id, category: "forms", name: "A", priority: "needed_for_go_live" },
      ACTOR,
    );
    view = await createComponent(
      { solutionId: s.id, category: "forms", name: "B", priority: "needed_for_go_live" },
      ACTOR,
    );
    const [a, b] = [view.components[0]!, view.components[1]!];
    await addDependency({ componentId: a.id, dependsOnId: b.id, critical: true }, ACTOR);
    await expect(
      addDependency({ componentId: b.id, dependsOnId: a.id, critical: false }, ACTOR),
    ).rejects.toThrow("loop");
  });

  it("removes a dependency and records it", async () => {
    use(baseRows());
    const s = await createCompleteSolution(
      {
        implementationId: IMPL,
        title: "Inspections",
        scope: "purchased",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    let view = await createComponent(
      { solutionId: s.id, category: "forms", name: "A", priority: "needed_for_go_live" },
      ACTOR,
    );
    view = await createComponent(
      { solutionId: s.id, category: "forms", name: "B", priority: "needed_for_go_live" },
      ACTOR,
    );
    const [a, b] = [view.components[0]!, view.components[1]!];
    await addDependency({ componentId: a.id, dependsOnId: b.id, critical: true }, ACTOR);
    const after = await removeDependency({ componentId: a.id, dependsOnId: b.id }, ACTOR);
    expect(after.components.find((c) => c.id === a.id)!.dependsOn).toEqual([]);
    expect(eventKinds()).toContain("dependency_removed");
  });
});

/* ------------------------------------------------------------ status rules */

describe("status rules and archiving", () => {
  it("refuses Waiting without a blocker, and Changes Needed without an explanation", async () => {
    use(baseRows());
    const s = await createCompleteSolution(
      {
        implementationId: IMPL,
        title: "Inspections",
        scope: "purchased",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    const c = (
      await createComponent(
        { solutionId: s.id, category: "forms", name: "Form", priority: "needed_for_go_live" },
        ACTOR,
      )
    ).components[0]!;
    await expect(updateComponent({ id: c.id, status: "waiting" }, ACTOR)).rejects.toThrow(
      "Record what it is waiting on",
    );
    await expect(updateComponent({ id: c.id, status: "changes_needed" }, ACTOR)).rejects.toThrow(
      "Say what needs changing",
    );
  });

  it("refuses changes to an archived solution until it is restored", async () => {
    use(baseRows());
    const s = await createCompleteSolution(
      {
        implementationId: IMPL,
        title: "Inspections",
        scope: "purchased",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    await setSolutionArchived(s.id, true, "Customer dropped it", ACTOR);
    await expect(updateCompleteSolution(s.id, { nextAction: "Call them" }, ACTOR)).rejects.toThrow(
      "is archived",
    );
    const restored = await setSolutionArchived(s.id, false, null, ACTOR);
    expect(restored.archived).toBe(false);
    expect(eventKinds()).toEqual(expect.arrayContaining(["archived", "restored"]));
  });

  it("archives a component without deleting it", async () => {
    use(baseRows());
    const s = await createCompleteSolution(
      {
        implementationId: IMPL,
        title: "Inspections",
        scope: "purchased",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    const c = (
      await createComponent(
        { solutionId: s.id, category: "forms", name: "Form", priority: "needed_for_go_live" },
        ACTOR,
      )
    ).components[0]!;
    const view = await setComponentArchived(c.id, true, "Replaced by v2", ACTOR);
    expect(view.components[0]!.archived).toBe(true);
    expect(fake.store["solution_components"]).toHaveLength(1);
  });
});

/* -------------------------------------------------------------- summary */

describe("the Customer 360 summary", () => {
  it("counts what is purchased and open, and names what is overdue and waiting", async () => {
    use(baseRows());
    const s = await createCompleteSolution(
      {
        implementationId: IMPL,
        title: "Inspections",
        scope: "purchased",
        priority: "needed_for_go_live",
        nextAction: "Send the form for approval",
      },
      ACTOR,
    );
    await createCompleteSolution(
      {
        implementationId: IMPL,
        title: "Fuel log",
        scope: "requested",
        priority: "planned_for_later",
      },
      ACTOR,
    );
    await setSolutionTargetDate(s.id, "2026-10-01", null, ACTOR);
    await createComponent(
      {
        solutionId: s.id,
        category: "integrations",
        integrationType: "dispatch",
        name: "Dispatch feed",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    const dispatch = (await loadSolutionsFor(IMPL))[0]!.components[0]!;
    await updateComponent(
      { id: dispatch.id, status: "waiting", blocker: "Waiting on API login" },
      ACTOR,
    );

    const summary = summarizeSolutions(await loadSolutionsFor(IMPL), TODAY);
    expect(summary).toMatchObject({ solutions: 2, purchased: 1, requested: 1, openGoLive: 1 });
    expect(summary.overdue).toEqual([{ label: "Inspections", targetDate: "2026-10-01" }]);
    expect(summary.waiting).toEqual([
      { label: "Inspections · Dispatch feed", reason: "Waiting on API login" },
    ]);
    expect(summary.nextActions).toEqual([
      { label: "Inspections", action: "Send the form for approval" },
    ]);
  });
});

/* ------------------------------------------------ permissions and failures */

describe("permissions", () => {
  it("refuses a customer login and a login with no role", () => {
    expect(() => assertInternalRole("customer")).toThrow("internal users only");
    expect(() => assertInternalRole(null)).toThrow("internal users only");
    expect(() => assertInternalRole("implementation")).not.toThrow();
  });
});

describe("failures are said plainly and never look like success", () => {
  it("says a read failed rather than showing no solutions", async () => {
    use(baseRows(), { complete_solutions: { message: "connection reset", code: "08006" } });
    await expect(loadSolutionsFor(IMPL)).rejects.toThrow("Could not load the solutions");
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("connection reset (08006)"));
  });

  it("says nothing was changed when a component cannot be added", async () => {
    use(baseRows());
    const s = await createCompleteSolution(
      {
        implementationId: IMPL,
        title: "Inspections",
        scope: "purchased",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    use({ ...fake.store }, { solution_components: { message: "boom", code: "XX000" } });
    await expect(
      createComponent(
        { solutionId: s.id, category: "forms", name: "Form", priority: "needed_for_go_live" },
        ACTOR,
      ),
    ).rejects.toThrow("Could not add the component. Nothing has been changed.");
  });

  it("tells the person the change was kept when its history cannot be recorded", async () => {
    const rows = baseRows();
    rows["complete_solutions"] = [
      {
        id: "s-1",
        implementation_id: IMPL,
        title: "Inspections",
        scope: "purchased",
        source: "manual",
        priority: "needed_for_go_live",
        status: "in_progress",
        readiness_confirmed: "not_ready",
        created_at: "2026-08-01T00:00:00Z",
      },
    ];
    rows["solution_components"] = [
      {
        id: "c-1",
        org_id: ORG,
        implementation_id: IMPL,
        complete_solution_id: "s-1",
        category: "forms",
        name: "Form",
        status: "not_started",
        priority: "needed_for_go_live",
        form_built: false,
        customer_approved: false,
        created_at: "2026-08-02T00:00:00Z",
      },
    ];
    use(rows, { solution_events: { message: "disk full", code: "53100" } });
    await expect(updateComponent({ id: "c-1", status: "being_built" }, ACTOR)).rejects.toThrow(
      "The change was saved, but its history could not be recorded.",
    );
    // The write went through: the history failed afterwards, so the change is kept.
    expect(fake.store["solution_components"]![0]!["status"]).toBe("being_built");
  });

  it("refuses a dependency that is already recorded, in plain words", async () => {
    use(baseRows());
    const s = await createCompleteSolution(
      {
        implementationId: IMPL,
        title: "Inspections",
        scope: "purchased",
        priority: "needed_for_go_live",
      },
      ACTOR,
    );
    let view = await createComponent(
      { solutionId: s.id, category: "forms", name: "A", priority: "needed_for_go_live" },
      ACTOR,
    );
    view = await createComponent(
      { solutionId: s.id, category: "forms", name: "B", priority: "needed_for_go_live" },
      ACTOR,
    );
    const [a, b] = [view.components[0]!, view.components[1]!];
    await addDependency({ componentId: a.id, dependsOnId: b.id, critical: true }, ACTOR);
    // The same link again is refused in plain words, not as a raw database error.
    await expect(
      addDependency({ componentId: a.id, dependsOnId: b.id, critical: true }, ACTOR),
    ).rejects.toThrow("That dependency is already recorded.");
  });
});
