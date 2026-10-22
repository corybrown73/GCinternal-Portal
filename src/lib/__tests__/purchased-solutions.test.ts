import { describe, expect, it } from "vitest";

import { intakeAnswersSchema, readIntake } from "../intake-answers";
import {
  hasUniquePurchasedSolution,
  mergeSolutionClarifications,
  purchasedSolutionsFor,
  saveClarificationWithRetry,
  solutionClarificationsSchema,
  solutionClarificationSaveSchema,
  type SolutionClarification,
} from "../purchased-solutions";

describe("purchased solutions", () => {
  it("includes one line and keeps incomplete agreed details explicit", () => {
    const intake = readIntake({
      timeline: {
        services: [{ id: "solution-1", kind: "integration", name: "Accounting sync", phase: 2 }],
      },
    });

    expect(purchasedSolutionsFor(intake)).toEqual([
      {
        name: "Accounting sync",
        kind: "Integration",
        phase: 2,
        tool: null,
        acceptance: null,
      },
    ]);
  });

  it("includes every purchased line, including service types outside delivery tracking", () => {
    const intake = readIntake({
      timeline: {
        services: [
          {
            id: "solution-1",
            kind: "integration",
            name: "Accounting sync",
            phase: 2,
            tool: "QuickBooks",
            acceptance: "Approved submissions reach the accounting system.",
          },
          { id: "solution-2", kind: "training", name: "Crew training", phase: 1 },
          { id: "solution-3", kind: "data_load", name: "Site list import", phase: 1 },
        ],
      },
    });

    expect(purchasedSolutionsFor(intake)).toEqual([
      expect.objectContaining({
        name: "Accounting sync",
        kind: "Integration",
        phase: 2,
        tool: "QuickBooks",
        acceptance: "Approved submissions reach the accounting system.",
      }),
      expect.objectContaining({ name: "Crew training", kind: "Training", phase: 1 }),
      expect.objectContaining({ name: "Site list import", kind: "Data load", phase: 1 }),
    ]);
    expect(hasUniquePurchasedSolution(intake, "solution-2")).toBe(true);
    expect(hasUniquePurchasedSolution(intake, "other-deal-solution")).toBe(false);
  });
});

describe("per-solution clarification persistence", () => {
  it("saves and reopens notes and review flags against stable solution ids", () => {
    const existing = {
      "solution-a": { notes: "Confirm field mapping.", potential_scope_change: false },
      "solution-b": { notes: "Customer requested another workflow.", potential_scope_change: true },
    };
    const merged = mergeSolutionClarifications(existing, {
      "solution-a": { notes: "Confirm the final field mapping.", potential_scope_change: true },
    });
    const savedIntake = intakeAnswersSchema.parse({
      solution_clarifications: merged,
      timeline: {
        services: [
          { id: "solution-a", kind: "integration", name: "Accounting sync", phase: 2 },
          { id: "solution-b", kind: "training", name: "Crew training", phase: 1 },
        ],
      },
    });
    const reopened = readIntake(savedIntake);

    expect(reopened.solution_clarifications).toEqual({
      "solution-a": { notes: "Confirm the final field mapping.", potential_scope_change: true },
      "solution-b": { notes: "Customer requested another workflow.", potential_scope_change: true },
    });
    expect(solutionClarificationsSchema.parse(reopened.solution_clarifications)).toEqual(
      reopened.solution_clarifications,
    );
    expect(purchasedSolutionsFor(reopened).map((solution) => solution.name)).toEqual([
      "Accounting sync",
      "Crew training",
    ]);

    const afterDeckRegeneration = readIntake(savedIntake);
    expect(afterDeckRegeneration.solution_clarifications).toEqual(reopened.solution_clarifications);
  });

  it("does not overwrite another solution's note when one clarification changes", () => {
    const result = mergeSolutionClarifications(
      {
        "solution-a": { notes: "A's note", potential_scope_change: false },
        "solution-b": { notes: "B's note", potential_scope_change: false },
      },
      { "solution-b": { notes: "Updated B's note", potential_scope_change: true } },
    );

    expect(result["solution-a"]?.notes).toBe("A's note");
    expect(result["solution-b"]).toEqual({
      notes: "Updated B's note",
      potential_scope_change: true,
    });
  });

  it("requires a clarification description when a potential scope change is flagged", () => {
    const valid = {
      dealId: "11111111-1111-4111-8111-111111111111",
      solutionId: "solution-a",
      expected: { notes: "", potential_scope_change: false },
      notes: "",
      potentialScopeChange: true,
    };
    expect(solutionClarificationSaveSchema.safeParse(valid).success).toBe(false);
    expect(
      solutionClarificationSaveSchema.safeParse({ ...valid, notes: "Add a second workflow." })
        .success,
    ).toBe(true);
    expect(
      solutionClarificationSaveSchema.safeParse({
        ...valid,
        notes: "",
        potentialScopeChange: false,
      }).success,
    ).toBe(true);
    expect(
      solutionClarificationSaveSchema.safeParse({
        ...valid,
        notes: "A clarification.",
        name: "Changed purchased scope",
      }).success,
    ).toBe(false);
    expect(
      solutionClarificationSaveSchema.safeParse({
        ...valid,
        solutionId: "not-a-solution-id",
        notes: "A clarification.",
        potentialScopeChange: false,
      }).success,
    ).toBe(false);
  });

  it("retries concurrent saves for different solutions without losing intake fields", async () => {
    const state = {
      version: 1,
      intake: {
        unrelated_answer: "Keep this answer",
        timeline: {
          close_date: "2026-10-01",
          services: [
            {
              id: "solution-a",
              kind: "integration",
              name: "Agreed data sync",
              phase: 2,
              tool: "QuickBooks",
              acceptance: "Approved records sync.",
            },
          ],
        },
        solution_clarifications: {
          "solution-a": { notes: "A before", potential_scope_change: false },
          "solution-b": { notes: "B before", potential_scope_change: false },
        },
      },
    };
    const load = async () => ({
      version: String(state.version),
      clarifications: readIntake(state.intake).solution_clarifications,
      context: { ...state.intake },
    });
    const compareAndSet = async (
      snapshot: Awaited<ReturnType<typeof load>>,
      clarifications: Record<string, SolutionClarification>,
    ) => {
      if (snapshot.version !== String(state.version)) return false;
      state.intake = { ...snapshot.context, solution_clarifications: clarifications };
      state.version++;
      return true;
    };

    const results = await Promise.all([
      saveClarificationWithRetry({
        solutionId: "solution-a",
        expected: { notes: "A before", potential_scope_change: false },
        value: { notes: "A after", potential_scope_change: false },
        load,
        compareAndSet,
      }),
      saveClarificationWithRetry({
        solutionId: "solution-b",
        expected: { notes: "B before", potential_scope_change: false },
        value: { notes: "B after", potential_scope_change: true },
        load,
        compareAndSet,
      }),
    ]);

    expect(results).toEqual([undefined, undefined]);
    expect(readIntake(state.intake).solution_clarifications).toEqual({
      "solution-a": { notes: "A after", potential_scope_change: false },
      "solution-b": { notes: "B after", potential_scope_change: true },
    });
    expect(state.intake.unrelated_answer).toBe("Keep this answer");
    expect(state.intake.timeline).toEqual({
      close_date: "2026-10-01",
      services: [
        {
          id: "solution-a",
          kind: "integration",
          name: "Agreed data sync",
          phase: 2,
          tool: "QuickBooks",
          acceptance: "Approved records sync.",
        },
      ],
    });
  });

  it("rejects a concurrent save to the same solution instead of overwriting it", async () => {
    const state = {
      version: 1,
      intake: {
        solution_clarifications: {
          "solution-a": { notes: "Before", potential_scope_change: false },
        },
      },
    };
    const load = async () => ({
      version: String(state.version),
      clarifications: readIntake(state.intake).solution_clarifications,
      context: { ...state.intake },
    });
    const compareAndSet = async (
      snapshot: Awaited<ReturnType<typeof load>>,
      clarifications: Record<string, SolutionClarification>,
    ) => {
      if (snapshot.version !== String(state.version)) return false;
      state.intake = { ...snapshot.context, solution_clarifications: clarifications };
      state.version++;
      return true;
    };

    const results = await Promise.allSettled([
      saveClarificationWithRetry({
        solutionId: "solution-a",
        expected: { notes: "Before", potential_scope_change: false },
        value: { notes: "First edit", potential_scope_change: false },
        load,
        compareAndSet,
      }),
      saveClarificationWithRetry({
        solutionId: "solution-a",
        expected: { notes: "Before", potential_scope_change: false },
        value: { notes: "Second edit", potential_scope_change: true },
        load,
        compareAndSet,
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason.message : "").toContain(
      "changed after you opened it",
    );
    expect(["First edit", "Second edit"]).toContain(
      readIntake(state.intake).solution_clarifications["solution-a"]?.notes,
    );
  });
});
