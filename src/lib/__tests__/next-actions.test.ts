import { describe, expect, it } from "vitest";
import { openNextActions, type NextActionsInput } from "../next-actions";
import type { Waiting } from "../workspace";
import type { ServiceSpec } from "../onboarding-services";

const waiting = (over: Partial<Waiting> = {}): Waiting => ({
  who: "customer",
  what: "Install the app",
  since: "2026-01-01",
  source: "homework",
  ...over,
});

describe("multiple simultaneous actions are preserved", () => {
  it("one approval + one solution + one workspace item all survive, as three separate items", () => {
    const input: NextActionsInput = {
      approvals: [{ title: "Approve field mapping", status: "pending" }],
      technicalSolutions: [{ title: "QuickBooks integration", status: "build" }],
      workspaceWaiting: [waiting({ what: "Add a field user" })],
    };
    const result = openNextActions(input);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.source).sort()).toEqual(
      ["homework", "technical_solutions", "approvals"].sort(),
    );
  });

  it("two solutions with different owners both produce their own item", () => {
    const input: NextActionsInput = {
      technicalSolutions: [
        { title: "Integration A", status: "build", owner_name: "Sarah", owner_role: "SE" },
        { title: "Integration B", status: "in_review", owner_name: "Dana", owner_role: "SE" },
      ],
    };
    const result = openNextActions(input);
    expect(result).toHaveLength(2);
    const names = result.map((r) => (r.who.kind === "person" ? r.who.name : null));
    expect(names.sort()).toEqual(["Dana", "Sarah"]);
  });
});

describe("customer and internal actions coexist", () => {
  it("a customer-side approval and an internal build item are both present", () => {
    const input: NextActionsInput = {
      approvals: [{ title: "Approve go-live", status: "pending", approver_name: "Nikki" }],
      technicalSolutions: [{ title: "Daily job report", status: "in_progress" }],
    };
    const result = openNextActions(input);
    expect(result).toHaveLength(2);
    const approval = result.find((r) => r.source === "approvals")!;
    const solution = result.find((r) => r.source === "technical_solutions")!;
    expect(approval.who).toEqual({ kind: "person", name: "Nikki", role: null });
    expect(solution.who).toEqual({ kind: "party", party: "gocanvas" });
  });
});

describe("named owner preserved when explicit", () => {
  it("approval, technical solution, and solutionBall each keep a named person when one is recorded", () => {
    const qb: ServiceSpec = {
      id: "qb",
      kind: "integration",
      name: "QuickBooks",
      phase: 2,
      ball: { who: "us", person: "Priya", date: "2026-10-09", note: "Finishing the mapping" },
    };
    const input: NextActionsInput = {
      approvals: [
        { title: "Approve X", status: "requested", approver_name: "Marcus", approver_role: "tis" },
      ],
      technicalSolutions: [{ title: "Y", status: "draft", owner_name: "Sarah", owner_role: "SE" }],
      solutions: [qb],
    };
    const result = openNextActions(input);
    const approval = result.find((r) => r.source === "approvals")!;
    const solution = result.find((r) => r.source === "technical_solutions")!;
    const ball = result.find((r) => r.source === "solution_ball")!;
    expect(approval.who).toEqual({ kind: "person", name: "Marcus", role: "tis" });
    expect(solution.who).toEqual({ kind: "person", name: "Sarah", role: "SE" });
    expect(ball.who).toEqual({ kind: "person", name: "Priya", role: null });
    expect(ball.what).toBe("Finishing the mapping");
    expect(ball.due).toBe("2026-10-09");
  });
});

describe("party-only ownership remains party-only — never a manufactured person", () => {
  it("an approval, a solution, and a workspace item with no named owner all fall back to a party, not a guessed name", () => {
    const input: NextActionsInput = {
      approvals: [{ title: "Approve X", status: "pending" }],
      technicalSolutions: [{ title: "Y", status: "build" }],
      workspaceWaiting: [waiting({ who: "gocanvas", what: "Book the next call" })],
    };
    const result = openNextActions(input);
    for (const item of result) {
      expect(item.who.kind).toBe("party");
    }
    const approval = result.find((r) => r.source === "approvals")!;
    const solution = result.find((r) => r.source === "technical_solutions")!;
    const ws = result.find((r) => r.source === "between" || r.what === "Book the next call")!;
    expect(approval.who).toEqual({ kind: "party", party: "customer" });
    expect(solution.who).toEqual({ kind: "party", party: "gocanvas" });
    expect(ws.who).toEqual({ kind: "party", party: "gocanvas" });
  });

  it("solutionBall's phase-inferred default (no explicit s.ball) never contributes an item", () => {
    const inferred: ServiceSpec = {
      id: "inferred",
      kind: "integration",
      name: "No ball set",
      phase: 2,
    };
    const result = openNextActions({ solutions: [inferred] });
    expect(result).toHaveLength(0);
  });
});

describe("risks/issues/escalations/decisions cannot enter the result", () => {
  it("stuffing them into the input has no effect — the function never reads them", () => {
    const withoutExtras = openNextActions({
      approvals: [{ title: "Approve X", status: "pending", approver_name: "Nikki" }],
    });
    // Deliberately passing excluded fields, untyped, to prove the function
    // never reads them — it has no parameter that would even see them.
    const withRisksEtc: Record<string, unknown> = {
      approvals: [{ title: "Approve X", status: "pending", approver_name: "Nikki" }],
      risks: [
        { id: "r1", status: "open", owner_name: "Nikki", title: "Training attendees unconfirmed" },
      ],
      issues: [{ id: "i1", status: "open", owner_name: "Nikki", title: "Some issue" }],
      escalations: [{ id: "e1", status: "open", owner_name: "Nikki", title: "Escalation" }],
      decisions: [{ id: "d1", status: "pending", decided_by: "Nikki", title: "A decision" }],
    };
    const withExtras = openNextActions(withRisksEtc as NextActionsInput);
    expect(withExtras).toEqual(withoutExtras);
    expect(withExtras).toHaveLength(1);
  });
});

describe("unknown ownership is not guessed", () => {
  it("no owner field anywhere still yields a party, never an invented name", () => {
    const result = openNextActions({
      approvals: [{ title: "Approve X", status: "awaiting" }],
      technicalSolutions: [{ title: "Y", status: "in_review" }],
    });
    expect(result.every((r) => r.who.kind === "party")).toBe(true);
  });
});

describe("no action is promoted to primary", () => {
  it("the shape has no primary/isPrimary field, and a 'critical'-sounding item is not reordered ahead on importance", () => {
    const input: NextActionsInput = {
      approvals: [{ title: "Routine approval", status: "pending", approver_name: "Dana" }],
      technicalSolutions: [
        { title: "Launch-critical integration", status: "build", owner_name: "Sarah" },
      ],
    };
    const result = openNextActions(input);
    for (const item of result) {
      expect(item).not.toHaveProperty("primary");
      expect(item).not.toHaveProperty("isPrimary");
    }
    // Neither has a due date, so stable collection order (workspace, approvals,
    // technical solutions) decides — not which one "sounds" more urgent.
    expect(result.map((r) => r.source)).toEqual(["approvals", "technical_solutions"]);
  });

  it("an item with a due date sorts first only because it's due, not because it's deemed important", () => {
    const qb: ServiceSpec = {
      id: "qb",
      kind: "integration",
      name: "QuickBooks",
      phase: 2,
      ball: { who: "customer", person: null, date: "2026-10-05", note: null },
    };
    const result = openNextActions({
      approvals: [{ title: "No-due approval", status: "pending" }],
      solutions: [qb],
    });
    expect(result[0]!.source).toBe("solution_ball");
    expect(result[0]!.due).toBe("2026-10-05");
  });
});
