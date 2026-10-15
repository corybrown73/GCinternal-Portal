import { shortDay } from "./onboarding-timeline";

/**
 * The internal plan end has moved past the graduation date agreed with the
 * customer (Nikki, QA follow-ups answer 2). The two dates stay separate:
 * this only says so to the implementation owner, and never writes either.
 *
 * - Plan end: `implementations.target_date ?? target_launch_date`.
 * - Agreed graduation: `intake.timeline.stage_targets.complete.current_date`,
 *   set by a person in the presenter workspace.
 *
 * A partner deal's dates come from the partner's milestones, so it never
 * gets this line.
 */
export type PlanEndSlip = { planEnd: string; agreed: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function planEndSlip(input: {
  planEnd: string | null | undefined;
  agreed: string | null | undefined;
  partner?: boolean | undefined;
}): PlanEndSlip | null {
  if (input.partner) return null;
  const planEnd = input.planEnd?.slice(0, 10) ?? null;
  const agreed = input.agreed?.slice(0, 10) ?? null;
  if (!planEnd || !agreed || !ISO.test(planEnd) || !ISO.test(agreed)) return null;
  return planEnd > agreed ? { planEnd, agreed } : null;
}

export function planEndSlipText(s: PlanEndSlip): string {
  return `Plan end ${shortDay(s.planEnd)} is after the graduation date agreed with the customer (${shortDay(s.agreed)})`;
}

export const PLAN_END_SLIP_NEXT =
  "Agree a new graduation date with the customer, or pull the plan in";
