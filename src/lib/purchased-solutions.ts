import { z } from "zod";

import type { IntakeAnswers } from "./intake-answers";
import { normalizeServices, SOLUTION_LABEL } from "./onboarding-services";

export const solutionClarificationSchema = z.object({
  notes: z.string().trim().max(4000).default(""),
  potential_scope_change: z.boolean().default(false),
});

export const solutionClarificationsSchema = z
  .record(z.string().min(1).max(40), solutionClarificationSchema)
  .default({});

export const solutionClarificationSaveSchema = z
  .object({
    dealId: z.string().uuid(),
    solutionId: z.string().trim().min(1).max(40),
    expected: z
      .object({
        notes: z.string().trim().max(4000),
        potential_scope_change: z.boolean(),
      })
      .strict(),
    notes: z.string().trim().max(4000),
    potentialScopeChange: z.boolean(),
  })
  .strict()
  .refine((value) => !value.potentialScopeChange || value.notes.length > 0, {
    message: "Add a note describing the request before flagging a potential scope change.",
    path: ["notes"],
  });

export type SolutionClarification = z.infer<typeof solutionClarificationSchema>;

export type PurchasedSolutionView = {
  name: string;
  kind: string;
  phase: number;
  tool: string | null;
  acceptance: string | null;
};

export function purchasedSolutionsFor(intake: IntakeAnswers): PurchasedSolutionView[] {
  return normalizeServices(intake.timeline.services, intake.timeline).map((service) => ({
    name: service.name,
    kind: SOLUTION_LABEL[service.kind],
    phase: service.phase,
    tool: service.tool?.trim() || null,
    acceptance: service.acceptance?.trim() || null,
  }));
}

export function hasUniquePurchasedSolution(intake: IntakeAnswers, solutionId: string): boolean {
  return (
    normalizeServices(intake.timeline.services, intake.timeline).filter(
      (service) => service.id === solutionId,
    ).length === 1
  );
}

export function mergeSolutionClarifications(
  current: Record<string, SolutionClarification>,
  patch: Record<string, SolutionClarification>,
): Record<string, SolutionClarification> {
  return { ...current, ...patch };
}

const EMPTY_CLARIFICATION: SolutionClarification = {
  notes: "",
  potential_scope_change: false,
};

type ClarificationSnapshot<T> = {
  version: string;
  clarifications: Record<string, SolutionClarification>;
  context: T;
};

/**
 * Compare-and-set one clarification against a versioned intake row. An
 * unrelated row update can be retried; a concurrent edit to this same
 * solution is surfaced instead of silently replacing it.
 */
export async function saveClarificationWithRetry<T>({
  solutionId,
  expected,
  value,
  load,
  compareAndSet,
  maxAttempts = 3,
}: {
  solutionId: string;
  expected: SolutionClarification;
  value: SolutionClarification;
  load: () => Promise<ClarificationSnapshot<T>>;
  compareAndSet: (
    snapshot: ClarificationSnapshot<T>,
    clarifications: Record<string, SolutionClarification>,
  ) => Promise<boolean>;
  maxAttempts?: number;
}): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const snapshot = await load();
    const current = snapshot.clarifications[solutionId] ?? EMPTY_CLARIFICATION;
    if (
      current.notes !== expected.notes ||
      current.potential_scope_change !== expected.potential_scope_change
    ) {
      throw new Error(
        "This clarification changed after you opened it. Reload the workspace and review the latest note before saving.",
      );
    }

    const clarifications = {
      ...snapshot.clarifications,
      [solutionId]: value,
    };
    if (await compareAndSet(snapshot, clarifications)) return;
  }

  throw new Error(
    "This deal changed while you were saving. Reload the workspace and try your clarification again.",
  );
}
