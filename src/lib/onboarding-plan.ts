import type { IntakeAnswers } from "./intake-answers";
import { buildTimeline, type IntegrationTier, type Timeline } from "./onboarding-timeline";

/**
 * The plan for one deal: the intake's timeline knobs applied to the day the
 * deal closed. Pure, so the panel and the deck compute the same dates from
 * the same record — a date the panel shows is the date the deck prints.
 */

/**
 * The close date, in this order: what a person set on the intake, else the
 * day the deal entered the won stage, else today (a deal not yet won is
 * planned as if it closed now, which is what a rep on the closing call wants
 * to see).
 */
export function closeDateFor(args: {
  intake: IntakeAnswers;
  stageHistory: ReadonlyArray<{ to_stage: string; occurred_at: string }>;
  wonStageKey: string;
  today?: string;
}): { date: string; source: "intake" | "stage" | "today" } {
  if (args.intake.timeline.close_date) {
    return { date: args.intake.timeline.close_date, source: "intake" };
  }
  const won = args.stageHistory
    .filter((t) => t.to_stage === args.wonStageKey)
    .map((t) => t.occurred_at)
    .sort()[0];
  if (won) return { date: won.slice(0, 10), source: "stage" };
  return { date: args.today ?? new Date().toISOString().slice(0, 10), source: "today" };
}

export function timelineFor(intake: IntakeAnswers, closeDate: string): Timeline {
  const t = intake.timeline;
  return buildTimeline({
    closeDate,
    overrides: t.overrides,
    holidays: t.holidays,
    integrationTier: t.integration_tier as IntegrationTier,
    integrationTarget: t.integration_target,
  });
}
