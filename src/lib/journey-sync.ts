import type { LifecycleStageId } from "./lifecycle";
import type { StageGateStatus } from "./stage-gates";

/**
 * Where an account is on its journey, read from what people have recorded.
 *
 * WHY. The plan's facts say what has happened, so the stage can follow them
 * without anybody opening a dropdown. Only a few facts are allowed to move the
 * stage, and each one moves it at most one gated step:
 *
 *   - a kickoff call BOOKED (a date and a time on the plan) satisfies the
 *     handoff gate's "schedule the kickoff" item, and nothing more;
 *   - a kickoff CONFIRMED HELD by a person satisfies the align-external gate's
 *     "run the kickoff call" item, and nothing more;
 *   - the working session and the live form follow the same rule.
 *
 * What is NOT a fact here: a brief (AI-prepared, a suggestion only), a planned
 * date passing, or a kickoff deck existing. A kickoff is held only when a
 * person confirms it. A held kickoff does not satisfy the plan, build or any
 * later stage's requirements; those are recorded on their own items.
 *
 * Only forward. A tick can be undone on the plan; the stage does not walk
 * back, because the stage history is a record of what happened. Handover to
 * Customer Success is never automatic: that is a person's decision.
 */
export type JourneySignals = {
  /** A kickoff call is booked: both a date and a time are on the plan. */
  kickoffScheduled: boolean;
  /** A person has confirmed the kickoff call as held. */
  kickoffHeld: boolean;
  /** The working session (the form built together) is marked done. */
  workingDone: boolean;
  /** The first form is live. */
  formLive: boolean;
};

/**
 * Whether the kickoff is booked. The same definition the Kickoff checklist
 * uses ("Kickoff booked for …"): a date override and a time, both set.
 */
export function kickoffBooked(timeline: {
  overrides?: Record<string, unknown>;
  times?: Record<string, unknown>;
}): boolean {
  return Boolean(timeline.overrides?.["kickoff"] && timeline.times?.["kickoff"]);
}

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
  if (s.kickoffHeld) return "build";
  if (s.kickoffScheduled) return "plan-internal";
  return "handoff";
}

/** Why the stage moved, in the words the history shows. */
export function journeyReason(s: JourneySignals): string {
  if (s.formLive) return "the first form went live";
  if (s.workingDone) return "the working session was held and the form is built";
  if (s.kickoffHeld) return "the kickoff call was held";
  if (s.kickoffScheduled) return "the kickoff call was booked";
  return "the deal closed";
}

/**
 * The next automatic move a recorded fact asks for, or null when there is
 * none. Exactly one stage: the first step toward the target. Whatever sits
 * beyond it waits for its own gate, and for a person to act on that gate.
 */
export function automaticNextStep(
  s: JourneySignals,
  current: string,
  order: readonly string[],
): { to: string; target: LifecycleStageId } | null {
  const target = targetJourneyStage(s);
  const to = stepsToward(current, target, order)[0];
  return to ? { to, target } : null;
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

/**
 * The plain sentence a specialist reads on the Current Implementation gate
 * panel when a recorded fact is waiting on a gate: what happened, and what
 * has to be done before the stage moves by itself. Null when nothing is
 * waiting, which is also how it clears: once the gate is ready, or once no
 * recorded fact asks for a move.
 */
export function automaticHoldMessage(args: {
  signals: JourneySignals;
  current: string;
  order: readonly string[];
  gate: StageGateStatus;
}): string | null {
  if (!automaticNextStep(args.signals, args.current, args.order)) return null;
  if (args.gate.ready && !args.gate.ungated) return null;
  const fact = sentence(journeyReason(args.signals));
  if (args.gate.ungated) {
    return `${fact} This stage has no criteria set, so it moves on by hand when it is ready.`;
  }
  const titles = args.gate.remaining.map((c) => c.title);
  const shown =
    titles.length > 3
      ? `${titles.slice(0, 3).join(", ")} and ${titles.length - 3} more`
      : titles.join(", ");
  const once = titles.length === 1 ? "this is done" : "these are done";
  return `${fact} It moves on by itself once ${once}: ${shown}.`;
}

function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}
