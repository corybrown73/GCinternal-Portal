import type { IntakeAnswers } from "./intake-answers";
import { shortDay } from "./onboarding-timeline";

/**
 * The two lines "Adjust plan dates" adds around a milestone move, kept pure
 * so the words are tested where they are made.
 *
 * Moving a plan milestone never sets the customer-agreed graduation date
 * (intake.timeline.stage_targets.complete): the plan end and the agreed
 * graduation stay separate and neither overwrites the other. The panel
 * says which graduation the customer sees, so a blank one is not read as
 * something the move cleared.
 */
export function graduationNote(intake: Pick<IntakeAnswers, "timeline">): string {
  const agreed = intake.timeline.stage_targets?.complete?.current_date ?? null;
  return `Target graduation (what the customer sees): ${
    agreed ? shortDay(agreed) : "Not agreed yet"
  }. Moving a plan milestone never sets it.`;
}

/**
 * Functional (the "live" milestone) is already ticked, and the milestone
 * being moved would land after it: the plan keeps Functional where it was
 * recorded, and nothing after the moved milestone shifts. Null when that is
 * not the case.
 */
export function functionalRecordedWarning(args: {
  liveDoneOn: string | null | undefined;
  milestoneLabel: string;
  newDate: string;
}): string | null {
  const done = args.liveDoneOn ?? null;
  if (!done || !/^\d{4}-\d{2}-\d{2}$/.test(args.newDate)) return null;
  if (args.newDate <= done) return null;
  return `Functional is already recorded on ${shortDay(done)}; this moves only ${args.milestoneLabel}. Later dates do not move.`;
}
