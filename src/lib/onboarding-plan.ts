import type { IntakeAnswers } from "./intake-answers";
import { type ServiceSpec } from "./onboarding-services";
import {
  buildTimeline,
  onBusinessDay,
  type IntegrationTier,
  type Timeline,
} from "./onboarding-timeline";

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
  // A deal that closed on a Sunday starts its plan on the Monday: day 0 is a
  // working day the customer can be welcomed on, not the weekend the CRM
  // happened to record. A date a person set on the intake is taken as given.
  if (won) return { date: onBusinessDay(won.slice(0, 10)), source: "stage" };
  return {
    date: onBusinessDay(args.today ?? new Date().toISOString().slice(0, 10)),
    source: "today",
  };
}

/**
 * The forms the intake named beyond the first, as phase-2 form builds.
 *
 * THIS WAS A GAP. The intake let a person pick four library forms, the
 * first became phase 1, and the other three went nowhere: no steps, no
 * dates, nothing to tick, while "what we're building" listed them as if
 * they were planned. Now each one is a form build in phase 2, unless the
 * SOW already put a paid form build of the same name on the plan.
 */
export function extraFormServices(intake: IntakeAnswers): ServiceSpec[] {
  const stored = (intake.timeline.services ?? []) as ServiceSpec[];
  const named = new Set(
    stored.filter((s) => s.kind === "paid_form").map((s) => s.name.trim().toLowerCase()),
  );
  return intake.wanted_forms
    .slice(1)
    .filter((f) => !named.has(f.name.trim().toLowerCase()))
    .map((f) => ({ id: `form:${f.id}`, kind: "paid_form" as const, name: f.name, phase: 2 }));
}

/** True for a service the intake's form list produced, not one somebody added to the plan. */
export function isIntakeForm(serviceId: string): boolean {
  return serviceId.startsWith("form:");
}

export function timelineFor(intake: IntakeAnswers, closeDate: string): Timeline {
  const t = intake.timeline;
  return buildTimeline({
    closeDate,
    path: intake.path,
    overrides: t.overrides,
    holidays: t.holidays,
    integrationTier: t.integration_tier as IntegrationTier,
    integrationTarget: t.integration_target,
    formProvenOn: t.form_proven_on,
    completed: t.completed,
    times: t.times,
    timezone: t.timezone,
    services: [...(t.services as ServiceSpec[]), ...extraFormServices(intake)],
  });
}
