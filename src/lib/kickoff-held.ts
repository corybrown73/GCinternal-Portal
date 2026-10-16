import type { IntakeAnswers } from "@/lib/intake-answers";
import { completedAfterTick, showKickoffOutcomePrompt, type StageFlow } from "@/lib/stage-flow";

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
