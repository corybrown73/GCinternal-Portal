import { AsyncLocalStorage } from "node:async_hooks";

/**
 * A wall-clock end that every model call inside it respects, on top of
 * its own `AI_STEP_BUDGET_MS`. The in-process pump runs a step after the
 * request that queued it, so the step does not have the function's whole
 * 300 s to itself; under this, a repair turn that would outlive the
 * function ends as an orderly budget error instead.
 */
const store = new AsyncLocalStorage<number>();

export function withAiDeadline<T>(at: number, fn: () => Promise<T>): Promise<T> {
  return store.run(at, fn);
}

/** The deadline in force here, or null outside one. */
export function aiDeadline(): number | null {
  return store.getStore() ?? null;
}
