import { describe, expect, it } from "vitest";

import { customerTaskSteps } from "../customer-next-steps";

const TODAY = "2026-10-19";
const NAMES = new Map([["i1", "Rollout"]]);
const task = (id: string, over: object = {}) => ({
  id,
  implementation_id: "i1",
  title: `Task ${id}`,
  status: "open",
  party: "customer",
  visibility: "shared",
  due_at: "2026-10-10T09:00:00Z",
  ...over,
});

describe("customerTaskSteps", () => {
  it("lists only the customer's own shared tasks", () => {
    const steps = customerTaskSteps(
      [
        task("mine"),
        task("internal-visibility", { visibility: "internal" }),
        task("gocanvas-owned", { party: "internal" }),
        task("partner-owned", { party: "partner" }),
      ],
      NAMES,
      TODAY,
    );
    expect(steps.map((s) => s.id)).toEqual(["mine"]);
  });

  it("leaves out tasks that are done or skipped", () => {
    const steps = customerTaskSteps(
      [task("open"), task("done", { status: "done" }), task("skipped", { status: "skipped" })],
      NAMES,
      TODAY,
    );
    expect(steps.map((s) => s.id)).toEqual(["open"]);
  });

  it("flags only tasks whose day has passed, and keeps the calendar day", () => {
    const steps = customerTaskSteps(
      [
        task("past", { due_at: "2026-10-01T23:30:00Z" }),
        task("today", { due_at: "2026-10-19T09:00:00Z" }),
        task("undated", { due_at: null }),
      ],
      NAMES,
      TODAY,
    );
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
    expect(byId["past"]?.overdue).toBe(true);
    expect(byId["past"]?.due_date).toBe("2026-10-01");
    expect(byId["today"]?.overdue).toBe(false);
    expect(byId["undated"]?.overdue).toBe(false);
    expect(byId["undated"]?.due_date).toBeNull();
  });

  it("orders by due date, undated last, and names the implementation", () => {
    const steps = customerTaskSteps(
      [
        task("undated", { due_at: null }),
        task("late", { due_at: "2026-11-01T00:00:00Z" }),
        task("early", { due_at: "2026-10-02T00:00:00Z" }),
      ],
      NAMES,
      TODAY,
    );
    expect(steps.map((s) => s.id)).toEqual(["early", "late", "undated"]);
    expect(steps[0]?.implementation_name).toBe("Rollout");
  });
});
