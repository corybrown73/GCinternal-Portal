import type { FlowTask } from "@/lib/stage-flow";

/**
 * Focus Mode: which one task Current Implementation puts first, and how far the
 * stage has got. Pure, so the rule is tested without a page.
 *
 * Nothing here chooses a task on its own terms. The next task is the first one
 * the stage logic already says is open and can be done: not done, not locked,
 * not optional. That is the same rule the tab has always used to open a task.
 * Optional tasks are offered in the full list, never as the focus, and they do
 * not count toward progress. Guidance statements are not tasks and never count.
 */

export type TaskProgress = { done: number; total: number };

export type TaskFocus =
  /** Something can be done now. `others` counts the rest that are still open. */
  | { state: "next"; next: FlowTask; others: number; progress: TaskProgress }
  /** Every open task is locked. `blocker` is the first of them, with its reason. */
  | { state: "waiting"; blocker: FlowTask; progress: TaskProgress }
  /** Every required task is done. The stage's own readiness line says what comes next. */
  | { state: "complete"; progress: TaskProgress }
  /** The stage has no tasks at all. */
  | { state: "empty"; progress: TaskProgress };

/** Done and total required tasks: optional tasks are not part of the count. */
export function taskProgress(tasks: readonly FlowTask[]): TaskProgress {
  const required = tasks.filter((t) => !t.optional);
  return { done: required.filter((t) => t.done).length, total: required.length };
}

export function taskFocusFor(tasks: readonly FlowTask[]): TaskFocus {
  const progress = taskProgress(tasks);
  if (tasks.length === 0) return { state: "empty", progress };
  const next = tasks.find((t) => !t.done && !t.locked && !t.optional) ?? null;
  if (next) {
    return { state: "next", next, others: progress.total - progress.done - 1, progress };
  }
  const blocker = tasks.find((t) => !t.done && !t.optional) ?? null;
  if (blocker) return { state: "waiting", blocker, progress };
  return { state: "complete", progress };
}

/**
 * The words a focused task is headed with. An open task reads as its action
 * ("Get the customer's Pre-Kickoff Intake in"), the same wording the deal's next
 * step uses; a done task keeps its own label, so its state stays truthful. The
 * checkbox's accessible name is always the label.
 */
export function focusHeadline(task: Pick<FlowTask, "label" | "done" | "next">): string {
  return !task.done && task.next ? task.next : task.label;
}

/** Where the viewed stage sits on the journey, for "Stage 3 of 6". Null when it is not on the rail. */
export function journeyPosition(
  stageKeys: readonly string[],
  shown: string,
): { index: number; total: number } | null {
  const index = stageKeys.indexOf(shown);
  return index < 0 ? null : { index: index + 1, total: stageKeys.length };
}
