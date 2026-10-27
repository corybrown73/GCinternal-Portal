import { describe, expect, it } from "vitest";

import {
  createComponentInput,
  formTrackingInput,
  isOverdue,
  openComponentsBlockingComplete,
  requiresReason,
  suggestReadiness,
  suggestTargetDate,
  updateComponentInput,
  wouldCreateCycle,
  type ComponentStatus,
  type Priority,
  type ReadinessComponent,
} from "../complete-solutions";

const SOL = "e0000000-0000-4000-8000-000000000001";

function comp(
  id: string,
  status: ComponentStatus,
  priority: Priority = "needed_for_go_live",
  over: Partial<ReadinessComponent> = {},
): ReadinessComponent {
  return { id, name: `Component ${id}`, status, priority, archived: false, ...over };
}

const NO_DEPS = new Map<string, string[]>();

describe("readiness is suggested from components, never from a percentage", () => {
  it("says not ready when there is nothing to judge", () => {
    expect(suggestReadiness([], NO_DEPS)).toEqual({
      readiness: "not_ready",
      reasons: ["No components yet."],
    });
  });

  it("is ready only when every component needed for go-live is complete", () => {
    const r = suggestReadiness([comp("a", "complete"), comp("b", "complete")], NO_DEPS);
    expect(r.readiness).toBe("ready");
  });

  it("does not let nine finished components outweigh one open go-live component", () => {
    const many = Array.from({ length: 9 }, (_, i) => comp(`done-${i}`, "complete"));
    const r = suggestReadiness([...many, comp("open", "not_started")], NO_DEPS);
    expect(r.readiness).toBe("not_ready");
    expect(r.reasons).toEqual(["Component open is not started."]);
  });

  it("counts ready-for-testing as not yet ready, since testing has not happened", () => {
    const r = suggestReadiness([comp("a", "complete"), comp("b", "ready_for_testing")], NO_DEPS);
    expect(r.readiness).toBe("not_ready");
    expect(r.reasons.join(" ")).toMatch(/ready for testing/i);
  });

  it("is at risk when a go-live component needs changes", () => {
    const r = suggestReadiness([comp("a", "complete"), comp("b", "changes_needed")], NO_DEPS);
    expect(r.readiness).toBe("at_risk");
    expect(r.reasons).toEqual(["Component b needs changes."]);
  });

  it("is at risk when a go-live component is waiting", () => {
    const r = suggestReadiness([comp("a", "waiting")], NO_DEPS);
    expect(r.readiness).toBe("at_risk");
  });

  it("is at risk when an open critical dependency holds a go-live component", () => {
    const deps = new Map([["a", ["b"]]]);
    const r = suggestReadiness([comp("a", "being_built"), comp("b", "being_built")], deps);
    expect(r.readiness).toBe("at_risk");
    expect(r.reasons).toContain("Component a cannot finish until Component b is complete.");
  });

  it("stops holding a component once its critical dependency is complete", () => {
    const deps = new Map([["a", ["b"]]]);
    const r = suggestReadiness([comp("a", "complete"), comp("b", "complete")], deps);
    expect(r.readiness).toBe("ready");
  });

  it("ignores archived components", () => {
    const r = suggestReadiness(
      [
        comp("a", "complete"),
        comp("old", "changes_needed", "needed_for_go_live", { archived: true }),
      ],
      NO_DEPS,
    );
    expect(r.readiness).toBe("ready");
  });

  it("judges only deliver-during and go-live components when none is needed for go-live", () => {
    const r = suggestReadiness(
      [
        comp("a", "complete", "deliver_during_implementation"),
        comp("later", "not_started", "planned_for_later"),
      ],
      NO_DEPS,
    );
    expect(r.readiness).toBe("ready");
  });

  it("is ready when nothing is needed for go-live at all", () => {
    const r = suggestReadiness([comp("later", "not_started", "planned_for_later")], NO_DEPS);
    expect(r).toEqual({ readiness: "ready", reasons: ["Nothing is needed for go-live."] });
  });
});

describe("a solution may be completed only when every active component is", () => {
  it("names the components still open", () => {
    expect(
      openComponentsBlockingComplete([
        { name: "Inspection form", status: "complete", archived: false },
        { name: "Dispatch feed", status: "waiting", archived: false },
        { name: "Old chart", status: "not_started", archived: true },
      ]),
    ).toEqual(["Dispatch feed"]);
  });

  it("returns nothing when every active component is complete", () => {
    expect(
      openComponentsBlockingComplete([{ name: "Form", status: "complete", archived: false }]),
    ).toEqual([]);
  });
});

describe("dates are suggested only when the SOW gives enough to work them out", () => {
  it("suggests a date from a start date and an estimate", () => {
    expect(suggestTargetDate({ startDate: "2026-11-02", estimateWeeks: 3 })).toEqual({
      date: "2026-11-23",
      reason: "3 weeks from 2026-11-02, as the SOW estimates.",
    });
  });

  it("invents nothing when the start date is missing", () => {
    expect(suggestTargetDate({ startDate: null, estimateWeeks: 3 }).date).toBeNull();
  });

  it("invents nothing when the estimate is missing", () => {
    expect(suggestTargetDate({ startDate: "2026-11-02", estimateWeeks: null }).date).toBeNull();
  });

  it("refuses a start date that is not a date", () => {
    const s = suggestTargetDate({ startDate: "not a date", estimateWeeks: 2 });
    expect(s.date).toBeNull();
    expect(s.reason).toMatch(/not a valid date/);
  });
});

describe("dependency cycles are refused", () => {
  it("refuses a component depending on itself", () => {
    expect(wouldCreateCycle([], "a", "a")).toBe(true);
  });

  it("refuses the reverse of an existing link", () => {
    expect(wouldCreateCycle([{ from: "a", to: "b" }], "b", "a")).toBe(true);
  });

  it("refuses a loop through a longer chain", () => {
    const edges = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ];
    expect(wouldCreateCycle(edges, "c", "a")).toBe(true);
  });

  it("allows an unrelated link and a link that only extends a chain", () => {
    const edges = [{ from: "a", to: "b" }];
    expect(wouldCreateCycle(edges, "a", "c")).toBe(false);
    expect(wouldCreateCycle(edges, "c", "a")).toBe(false);
  });
});

describe("which changes need a reason", () => {
  it("needs a reason to move a date that already has an original", () => {
    expect(
      requiresReason({
        field: "target_date",
        hadOriginal: true,
        from: "2026-11-01",
        to: "2026-11-20",
      }),
    ).toBe(true);
  });

  it("does not need a reason for the first date ever given", () => {
    expect(
      requiresReason({ field: "target_date", hadOriginal: false, from: null, to: "2026-11-01" }),
    ).toBe(false);
  });

  it("does not need a reason for the same date", () => {
    expect(
      requiresReason({
        field: "target_date",
        hadOriginal: true,
        from: "2026-11-01",
        to: "2026-11-01",
      }),
    ).toBe(false);
  });

  it("needs a reason when readiness moves into or out of ready, or to at risk", () => {
    expect(
      requiresReason({
        field: "readiness_confirmed",
        hadOriginal: false,
        from: "not_ready",
        to: "ready",
      }),
    ).toBe(true);
    expect(
      requiresReason({
        field: "readiness_confirmed",
        hadOriginal: false,
        from: "ready",
        to: "not_ready",
      }),
    ).toBe(true);
    expect(
      requiresReason({
        field: "readiness_confirmed",
        hadOriginal: false,
        from: "not_ready",
        to: "at_risk",
      }),
    ).toBe(true);
  });

  it("does not need a reason for a status or priority change", () => {
    expect(
      requiresReason({
        field: "status",
        hadOriginal: false,
        from: "not_started",
        to: "in_progress",
      }),
    ).toBe(false);
    expect(
      requiresReason({
        field: "priority",
        hadOriginal: false,
        from: "planned_for_later",
        to: "needed_for_go_live",
      }),
    ).toBe(false);
  });
});

describe("the entry forms refuse what the database would refuse", () => {
  it("refuses an integration type on anything but an integration", () => {
    const r = createComponentInput.safeParse({
      solutionId: SOL,
      category: "forms",
      integrationType: "dispatch",
      name: "Inspection form",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a dispatch integration", () => {
    const r = createComponentInput.safeParse({
      solutionId: SOL,
      category: "integrations",
      integrationType: "dispatch",
      name: "Dispatch feed",
    });
    expect(r.success).toBe(true);
  });

  it("refuses a waiting component with nothing recorded as the blocker", () => {
    const r = updateComponentInput.safeParse({ id: SOL, status: "waiting", blocker: null });
    expect(r.success).toBe(false);
  });

  it("allows a waiting status when the blocker is simply not part of this change", () => {
    const r = updateComponentInput.safeParse({ id: SOL, status: "waiting" });
    expect(r.success).toBe(true);
  });

  it("refuses changes needed with no explanation", () => {
    const r = updateComponentInput.safeParse({
      id: SOL,
      status: "changes_needed",
      latestUpdate: null,
    });
    expect(r.success).toBe(false);
  });

  it("refuses a submission count without the date it was checked", () => {
    const r = formTrackingInput.safeParse({ id: SOL, submissionCount: 40 });
    expect(r.success).toBe(false);
  });

  it("accepts a submission count entered with its date", () => {
    const r = formTrackingInput.safeParse({
      id: SOL,
      submissionCount: 40,
      submissionCheckedOn: "2026-10-27",
    });
    expect(r.success).toBe(true);
  });

  it("refuses a date that is not a real date", () => {
    const r = updateComponentInput.safeParse({ id: SOL, targetDate: "2026-13-01" });
    expect(r.success).toBe(false);
  });
});

describe("overdue means past and not complete", () => {
  it("is overdue only when past and not complete", () => {
    expect(isOverdue("2026-10-01", false, "2026-10-27")).toBe(true);
    expect(isOverdue("2026-10-01", true, "2026-10-27")).toBe(false);
    expect(isOverdue("2026-11-01", false, "2026-10-27")).toBe(false);
    expect(isOverdue(null, false, "2026-10-27")).toBe(false);
  });
});

