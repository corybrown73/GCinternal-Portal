import { describe, expect, it } from "vitest";

import { commitmentSteps, orderNextSteps } from "../customer-commitments";

const TODAY = "2026-10-19";
const NAMES = new Map([["i1", "Rollout"]]);
const row = (id: string, status: string | null, over: object = {}) => ({
  id,
  implementation_id: "i1",
  description: `Commitment ${id}`,
  due_date: "2026-10-01",
  status,
  committed_to: "customer",
  ...over,
});

describe("the portal's commitments", () => {
  it("lists done and withdrawn with their labels, and outstanding with theirs", () => {
    const steps = commitmentSteps(
      [
        row("met", "met"),
        row("fulfilled", "fulfilled"),
        row("cancelled", "cancelled"),
        row("renegotiated", "renegotiated"),
        row("missed", "missed"),
        row("open", "open"),
      ],
      NAMES,
      TODAY,
    );
    expect(Object.fromEntries(steps.map((s) => [s.id, s.status_label]))).toEqual({
      met: "Done",
      fulfilled: "Done",
      cancelled: "Withdrawn",
      renegotiated: "Renegotiated — Outstanding",
      missed: "Missed — Outstanding",
      open: "Outstanding",
    });
  });

  it("marks only outstanding commitments overdue", () => {
    const steps = commitmentSteps(
      [row("met", "met"), row("cancelled", "cancelled"), row("open", "open")],
      NAMES,
      TODAY,
    );
    expect(Object.fromEntries(steps.map((s) => [s.id, s.overdue]))).toEqual({
      met: false,
      cancelled: false,
      open: true,
    });
  });

  it("never lists a commitment made to our own team", () => {
    const steps = commitmentSteps(
      [row("internal", "open", { committed_to: "internal" }), row("visible", "open")],
      NAMES,
      TODAY,
    );
    expect(steps.map((s) => s.id)).toEqual(["visible"]);
  });

  it("names the implementation each one belongs to", () => {
    expect(commitmentSteps([row("a", "open")], NAMES, TODAY)[0]?.implementation_name).toBe(
      "Rollout",
    );
  });

  it("orders items still to do first, then done and withdrawn, each by due date", () => {
    const steps = orderNextSteps([
      { id: "done-early", due_date: "2026-09-01", state: "completed" as const },
      { id: "open-late", due_date: "2026-11-01", state: "outstanding" as const },
      { id: "withdrawn", due_date: "2026-08-01", state: "withdrawn" as const },
      { id: "open-early", due_date: "2026-10-01", state: "outstanding" as const },
      { id: "milestone", due_date: "2026-12-01" },
    ]);
    expect(steps.map((s) => s.id)).toEqual([
      "open-early",
      "open-late",
      "milestone",
      "withdrawn",
      "done-early",
    ]);
  });
});
