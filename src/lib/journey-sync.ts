import type { LifecycleStageId } from "./lifecycle";

/**
 * Where an account is on its journey, read from what has actually happened.
 *
 * WHY. A stage nobody has to pick is a stage that is always right. The brief
 * gets generated, the kickoff call gets ticked, the form goes live — each of
 * those is a fact on the plan, and the stage follows from the facts. Nobody
 * opens a dropdown, and the Customers list, Home and the digest all agree.
 *
 * Only forward. A tick can be undone on the plan; the stage does not walk
 * back, because the stage history is a record of what happened and a
 * reversal is a note on it, not a rewrite. Handover to Customer Success is
 * never automatic: that is a person's decision, recorded as one.
 */
export type JourneySignals = {
  /** A customer brief has been generated. */
  briefGenerated: boolean;
  /** The kickoff call is marked done on the plan. */
  kickoffDone: boolean;
  /** The working session (the form built together) is marked done. */
  workingDone: boolean;
  /** The first form is live. */
  formLive: boolean;
};

/** The journey, in order, from the plan's point of view. */
export const JOURNEY_ORDER: readonly LifecycleStageId[] = [
  "handoff",
  "plan-internal",
  "build",
  "validate-iterate",
  "launch",
];

export function targetJourneyStage(s: JourneySignals): LifecycleStageId {
  if (s.formLive) return "launch";
  if (s.workingDone) return "validate-iterate";
  if (s.kickoffDone) return "build";
  if (s.briefGenerated) return "plan-internal";
  return "handoff";
}

/** Why the stage moved, in the words the history shows. */
export function journeyReason(s: JourneySignals): string {
  if (s.formLive) return "the first form went live";
  if (s.workingDone) return "the working session was held and the form is built";
  if (s.kickoffDone) return "the kickoff call was held";
  if (s.briefGenerated) return "the customer brief was generated";
  return "the deal closed";
}

/**
 * The stages to step through from `current` to `target`, in `order`, or []
 * when there is nothing to do or the target is behind. `order` is the live
 * lifecycle (hidden stages already removed), which may hold stages the
 * journey rule does not name; those are stepped through on the way.
 */
export function stepsToward(
  current: string,
  target: LifecycleStageId,
  order: readonly string[],
): string[] {
  const from = order.indexOf(current);
  const to = order.indexOf(target);
  if (from < 0 || to < 0 || to <= from) return [];
  return order.slice(from + 1, to + 1);
}
