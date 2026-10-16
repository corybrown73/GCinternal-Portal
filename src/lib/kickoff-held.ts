import type { IntakeAnswers } from "@/lib/intake-answers";
import { localIso, shortDay } from "@/lib/onboarding-timeline";
import {
  completedAfterTick,
  isKickoffBooked,
  showKickoffOutcomePrompt,
  type FlowStageKey,
  type FlowTask,
  type StageFlow,
} from "@/lib/stage-flow";
import { isPartnerDeal } from "@/lib/partner-implementation";

/**
 * Supplied only when the implementation's actual current canonical stage is
 * Kickoff and the Kickoff task is not done yet (see kickoffConfirmPrompt). Never
 * derived from transcript content.
 */
export type KickoffOutcomePrompt = {
  dealId: string;
  intake: IntakeAnswers;
};

/**
 * The timeline patch that marks Kickoff held: the same tick the Kickoff
 * checklist makes, built the same way. Pure, so the write is testable without
 * the page.
 */
export function kickoffHeldPatch(intake: IntakeAnswers, day: string): IntakeAnswers["timeline"] {
  const t = intake.timeline;
  const completed = completedAfterTick(intake, t.completed, "kickoff", true, day);
  return { ...t, completed, form_proven_on: t.form_proven_on };
}

/**
 * Whether the Kickoff confirmation belongs on the stage being viewed. Only the
 * stage the implementation is actually in, and only while its Kickoff task is
 * open. A partner implementation has no open Kickoff task, so it gets none.
 */
export function kickoffConfirmPrompt(
  flow: StageFlow,
  shown: string,
  dealId: string,
  intake: IntakeAnswers,
): KickoffOutcomePrompt | null {
  if (shown !== "kickoff") return null;
  return showKickoffOutcomePrompt(flow) ? { dealId, intake } : null;
}

/**
 * The Kickoff focus card's words. The card names the call "Kickoff held", not
 * the plan's call milestone (which carries the Get it working label). Once the
 * call's date has passed, the words ask for the confirmation the card offers,
 * and only after the call has actually happened. Shared next-step wording
 * elsewhere is unchanged.
 */
export function kickoffFocusTask(
  task: FlowTask,
  shown: string,
  intake: IntakeAnswers,
  today: string = localIso(),
): FlowTask {
  if (shown !== "kickoff" || task.key !== "kickoff" || task.action !== "tick") return task;
  const date = intake.timeline.overrides["kickoff"] ?? task.date ?? null;
  const booked = isKickoffBooked(intake);
  if (booked && date && date < today) {
    return { ...task, next: "Confirm Kickoff held once the call has happened, or rebook it" };
  }
  return {
    ...task,
    next: booked
      ? `Hold the Kickoff call${date ? ` (${shortDay(date)})` : ""}`
      : "Book the Kickoff call",
  };
}

/** The stages a Kickoff correction would have to go back past. */
const LATER_STAGES: ReadonlyArray<FlowStageKey> = [
  "get_it_working",
  "make_it_yours",
  "make_it_run",
  "complete",
];

/**
 * What unticking Kickoff would do, read from the same checklist the page shows.
 *
 *   not_held            nothing to correct
 *   not_applicable      partner implementations, and a deal before Kickoff
 *   auto                no later work: the record is removed and the deal returns to Kickoff
 *   confirm_later_work  later tasks are done but no later stage is: keep them, but ask first
 *   blocked             a later stage is complete: a stage-correction review is needed
 */
export type KickoffCorrection =
  | { kind: "not_held" }
  | { kind: "not_applicable" }
  | { kind: "auto"; date: string }
  | { kind: "confirm_later_work"; date: string; laterTasksDone: number }
  | { kind: "blocked"; date: string; completedStage: FlowStageKey };

export function kickoffCorrectionFor(flow: StageFlow, intake: IntakeAnswers): KickoffCorrection {
  if (isPartnerDeal(intake)) return { kind: "not_applicable" };
  const date = intake.timeline.completed["kickoff"];
  if (!date) return { kind: "not_held" };
  // Held while the deal is still in Kickoff: only the record goes.
  if (flow.current === "kickoff") return { kind: "auto", date };
  if (!flow.current || !LATER_STAGES.includes(flow.current)) return { kind: "not_applicable" };
  const later = flow.stages.filter((st) => LATER_STAGES.includes(st.key));
  const completed = later.find((st) => st.done);
  if (completed) return { kind: "blocked", date, completedStage: completed.key };
  const laterTasksDone = later.reduce((n, st) => n + st.tasks.filter((t) => t.done).length, 0);
  return laterTasksDone === 0
    ? { kind: "auto", date }
    : { kind: "confirm_later_work", date, laterTasksDone };
}
