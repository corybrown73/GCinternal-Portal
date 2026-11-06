import { describe, expect, it } from "vitest";

import type { ServiceSpec } from "../onboarding-services";
import { linkedSolutionFor, solutionsOverview, type LinkedSolution } from "../solutions-overview";

/**
 * The Solutions view and its Current Implementation summary read one purchase record
 * and the delivery records linked to it. These check the rules they show: the lifecycle
 * comes from the purchase record, progress and launch-critical work are counted from it,
 * and only genuine blockers are reported.
 */

const svc = (over: Record<string, unknown> & { id: string }): ServiceSpec =>
  ({
    kind: "custom_pdf",
    name: over.id,
    phase: 1,
    ...over,
  }) as unknown as ServiceSpec;

const delivery = (over: Partial<LinkedSolution> & { id: string }): LinkedSolution => ({
  title: over.id,
  archived: false,
  purchasedServiceId: null,
  components: [],
  ...over,
});

describe("the lifecycle comes from the purchase record", () => {
  it("a solution with its live step done is Accepted; with nothing done it is Define", () => {
    const services = [svc({ id: "a" }), svc({ id: "b" })];
    const completed = {
      "a:kickoff": "2026-10-01",
      "a:build": "2026-10-05",
      "a:live": "2026-10-09",
    };
    const o = solutionsOverview({ services, completed, solutions: [] });
    expect(o.rows.find((r) => r.service.id === "a")?.statusLabel).toBe("Accepted");
    expect(o.rows.find((r) => r.service.id === "b")?.statusLabel).toBe("Define");
    expect(o.accepted).toBe(1);
    expect(o.open).toBe(1);
  });

  it("a descoped solution is ended, not open", () => {
    const o = solutionsOverview({
      services: [svc({ id: "a", disposition: { kind: "descoped", reason: "Out of scope" } })],
      completed: {},
      solutions: [],
    });
    expect(o.rows[0]!.ended).toBe(true);
    expect(o.open).toBe(0);
  });

  it("only solution kinds count as purchased solutions", () => {
    const o = solutionsOverview({
      services: [
        svc({ id: "a", kind: "paid_form" }),
        svc({ id: "t", kind: "training" as ServiceSpec["kind"] }),
      ],
      completed: {},
      solutions: [],
    });
    expect(o.purchased).toBe(1);
    expect(o.rows.map((r) => r.service.id)).toEqual(["a"]);
  });
});

describe("a delivery record links to a purchased solution by its id", () => {
  it("finds the active record for a purchased item, and not an archived one", () => {
    const solutions = [
      delivery({ id: "old", purchasedServiceId: "a", archived: true }),
      delivery({ id: "live", purchasedServiceId: "a" }),
    ];
    expect(linkedSolutionFor("a", solutions)?.id).toBe("live");
    expect(linkedSolutionFor("zzz", solutions)).toBeNull();
  });

  it("returns the caller's own type, so the full record stays available", () => {
    const solutions = [{ ...delivery({ id: "live", purchasedServiceId: "a" }), extra: 42 }];
    expect(linkedSolutionFor("a", solutions)?.extra).toBe(42);
  });
});

describe("progress and launch-critical work", () => {
  it("counts components of the linked records, leaving out archived ones", () => {
    const services = [svc({ id: "a" })];
    const solutions = [
      delivery({
        id: "d",
        purchasedServiceId: "a",
        components: [
          { id: "c1", name: "Form", status: "complete", blocker: null, archived: false },
          { id: "c2", name: "Sync", status: "waiting", blocker: null, archived: false },
          { id: "c3", name: "Old", status: "complete", blocker: null, archived: true },
        ],
      }),
    ];
    const o = solutionsOverview({ services, completed: {}, solutions });
    expect(o.components).toEqual({ complete: 1, total: 2 });
  });

  it("launch-critical work outstanding excludes accepted, ended and non-critical solutions", () => {
    const services = [
      svc({ id: "critical", launch_critical: true }),
      svc({ id: "critical-done", launch_critical: true }),
      svc({
        id: "critical-ended",
        launch_critical: true,
        disposition: { kind: "transferred", reason: null },
      }),
      svc({ id: "optional", launch_critical: false }),
    ];
    const o = solutionsOverview({
      services,
      completed: { "critical-done:live": "2026-10-09" },
      solutions: [],
    });
    expect(o.launchCriticalOutstanding.map((s) => s.id)).toEqual(["critical"]);
  });
});

describe("only genuine blockers are reported", () => {
  it("a solution blocked by us or by the customer is a blocker", () => {
    const services = [
      svc({ id: "a", ball: { who: "blocked_customer" } }),
      svc({ id: "b", ball: { who: "blocked_internal" } }),
    ];
    const o = solutionsOverview({ services, completed: {}, solutions: [] });
    expect(o.blockers.map((b) => [b.kind, b.id])).toEqual([
      ["solution", "a"],
      ["solution", "b"],
    ]);
  });

  it("a solution waiting on the customer's sign-off is not a blocker", () => {
    const services = [svc({ id: "a", ball: { who: "customer" } })];
    const o = solutionsOverview({ services, completed: {}, solutions: [] });
    expect(o.blockers).toEqual([]);
  });

  it("an ended solution's blocked ball is not reported", () => {
    const services = [
      svc({
        id: "a",
        ball: { who: "blocked_customer" },
        disposition: { kind: "descoped", reason: "x" },
      }),
    ];
    expect(solutionsOverview({ services, completed: {}, solutions: [] }).blockers).toEqual([]);
  });

  it("a component with a blocker is a blocker, unless it is complete, archived or has no words", () => {
    const services = [svc({ id: "a" })];
    const solutions = [
      delivery({
        id: "d",
        title: "Inspections",
        purchasedServiceId: "a",
        components: [
          {
            id: "open",
            name: "Form",
            status: "waiting",
            blocker: "Waiting on the customer's logo",
            archived: false,
          },
          { id: "done", name: "Done", status: "complete", blocker: "old note", archived: false },
          { id: "gone", name: "Gone", status: "waiting", blocker: "x", archived: true },
          { id: "blank", name: "Blank", status: "waiting", blocker: "   ", archived: false },
        ],
      }),
    ];
    const o = solutionsOverview({ services, completed: {}, solutions });
    expect(o.blockers).toEqual([
      {
        kind: "component",
        id: "open",
        label: "Form",
        detail: "Waiting on the customer's logo",
        solution: "Inspections",
      },
    ]);
  });
});
