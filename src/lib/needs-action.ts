import { dealStageLabel } from "./deal-stage";
import { addBusinessDays, shortDay } from "./onboarding-timeline";
import { PLAN_END_SLIP_NEXT, planEndSlip, planEndSlipText } from "./plan-end-slip";
import { STAGES, isOnboardingStage, type AccountStage } from "./presale-stages";
import { STAGE_LIMITS, stuckLevel } from "./stage-flow";

/**
 * Why a deal needs somebody today, from facts about the deal itself.
 *
 * Home used to say "On track — nothing open against it" for any project
 * with no risk, issue or escalation logged, which is nearly all of them:
 * the trouble a deal is actually in lives on the deal — a SOW go-live the
 * plan misses, a stakeholder out during a stage, a call nobody ticked,
 * nobody owning it since the close. The server gathers those facts once
 * (server/deal-facts) and this turns them into ranked reasons that the
 * triage row and the health chip both read, so a card never claims calm
 * the deal page contradicts.
 */
export type DealFacts = {
  id: string;
  name: string;
  stage: AccountStage;
  /** Business days since the deal entered its stage. */
  business_days_in_stage: number;
  /** The day the deal entered its stage (ISO), the clock the counts above run from. */
  stage_entered_on?: string | null;
  has_notes: boolean;
  has_sow: boolean;
  owner_name: string | null;
  /** The pre-kickoff booking task (all core meetings, or the kickoff) is done. */
  core_booked: boolean;
  /**
   * The deal's implementation runs the generic partner journey. Its kickoff
   * warning is a standard rule, so it does not apply; the other signals do.
   */
  partner?: boolean;
  /** The checklist's next task, when there is one. */
  next_step: string | null;
  /** Plan calls past their date and not ticked, on Onboarding. */
  overdue_calls: Array<{ label: string; date: string; businessDaysLate: number }>;
  /** Watch-outs the plan contradicts (severity "conflict" only). */
  watch_outs: Array<{ title: string; detail: string }>;
  /** Plan calls still to be held, from today on: the calendar across accounts. */
  upcoming_calls?: Array<{
    key: string;
    label: string;
    date: string;
    /** "HH:MM" when booked, else null: a planned day, not a meeting yet. */
    time: string | null;
    minutes: number | null;
  }>;
  /** The plan's close and finish line, for time-to-value and "launching". */
  close_date?: string | null;
  live_date?: string | null;
  /** The day the plan's live milestone was ticked, or null: a launch (launch-state.ts). */
  live_done_on?: string | null;
  /** The deal's project's plan end: target_date ?? target_launch_date. Internal. */
  plan_end?: string | null;
  /** The graduation date agreed with the customer (stage_targets.complete), when set. */
  agreed_graduation?: string | null;
  /** Transcript proposals on THIS implementation that nobody has applied or dismissed (laid on per implementation by `withPendingProposals`). */
  pending_proposals?: number;
};

export type ActionBucket = "act_now" | "needs_attention";

export type ActionReason = {
  bucket: ActionBucket;
  /** Lower sorts first; comparable with the triage ranks (act now < 2, attention 2–4). */
  rank: number;
  reason: string;
  /** What is at stake, appended to the commercial context. */
  impact: string;
  tab: "overview" | "journey" | "implementation";
  next?: string;
  /** The next step only when nothing else names one: no checklist task, nothing on the record. */
  fallbackNext?: string;
  /**
   * The stage limit this reason is measured against (ISO day): the day the
   * deal's time in its stage crosses the agreed limit. A threshold, never a
   * customer deadline, so Home labels it "Stage limit", not "Due".
   */
  threshold?: string;
};

/**
 * Stages where a deal is being worked by a person and can be stuck. Negotiate
 * & Finalize is Sales's wait, not ours: the only thing asked of us there is
 * the TIS, so it is in the list for that one rule and has no stuck limit.
 */
const WORKED: ReadonlyArray<AccountStage> = [
  "negotiate",
  "closed_won",
  "field_fusion_setup",
  "onboarding_kickoff",
  "kickoff",
  "get_it_working",
  "make_it_yours",
  "make_it_run",
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Move it to Kickoff, or note what is holding it" (Field Fusion setup is a side path). */
function movePrompt(stage: AccountStage): string {
  const after = STAGES.slice(STAGES.indexOf(stage) + 1).find((s) => s !== "field_fusion_setup");
  return after
    ? `Move it to ${dealStageLabel(after)}, or note what is holding it`
    : "Note what is holding it";
}

/** Stage entry plus `days` business days, when the entry day is known. */
function stageLimitDate(deal: DealFacts, days: number | undefined): string | undefined {
  const entered = deal.stage_entered_on?.slice(0, 10);
  if (!entered || !/^\d{4}-\d{2}-\d{2}$/.test(entered) || days === undefined) return undefined;
  return addBusinessDays(entered, days);
}

/** Ranked reasons, most urgent first. Empty when the deal is fine by its own facts. */
export function needsAction(deal: DealFacts | null | undefined): ActionReason[] {
  if (!deal || !WORKED.includes(deal.stage)) return [];
  const out: ActionReason[] = [];
  const where = dealStageLabel(deal.stage);
  const ownerLimit = stageLimitDate(deal, 1);
  // Partner deals are not held to the New Logo stage-age limits, so their
  // reasons carry no stage-limit date.
  const warnLimit = deal.partner ? undefined : stageLimitDate(deal, STAGE_LIMITS[deal.stage]?.warn);

  if (deal.watch_outs.length) {
    const titles = deal.watch_outs.map((w) => w.title);
    out.push({
      bucket: "act_now",
      rank: 1.2,
      reason:
        titles.slice(0, 2).join(" · ") + (titles.length > 2 ? ` · +${titles.length - 2}` : ""),
      impact: deal.watch_outs[0]!.detail,
      tab: "overview",
      next: "Fix the plan, or say why it stands, on the deal's Watch-outs",
    });
  }

  if (!deal.owner_name && deal.business_days_in_stage >= 1 && deal.stage === "negotiate") {
    // The Sales change: a TIS within 24 hours of Negotiate & Finalize.
    out.push({
      bucket: "act_now",
      rank: 1.6,
      reason: `Needs a TIS · at Negotiate & Finalize ${plural(deal.business_days_in_stage, "business day")}`,
      impact: "nobody from implementation on the closing call",
      tab: "overview",
      next: "Assign a TIS, or ask the pool to claim it",
      ...(ownerLimit ? { threshold: ownerLimit } : {}),
    });
  } else if (
    !deal.owner_name &&
    deal.business_days_in_stage >= 1 &&
    !isOnboardingStage(deal.stage) &&
    deal.stage !== "prospect"
  ) {
    out.push({
      bucket: "act_now",
      rank: 1.6,
      reason: `Nobody owns it · closed ${plural(deal.business_days_in_stage, "business day")} ago`,
      impact: "the customer has no one to hear from",
      tab: "overview",
      next: "Assign an owner, or ask the pool to claim it",
      ...(ownerLimit ? { threshold: ownerLimit } : {}),
    });
  }

  const late = [...deal.overdue_calls].sort((a, b) => b.businessDaysLate - a.businessDaysLate)[0];
  if (late) {
    const days = late.businessDaysLate;
    out.push({
      bucket: days >= 3 ? "act_now" : "needs_attention",
      rank: days >= 3 ? 1.8 : 2.5,
      reason: `${late.label} was due ${shortDay(late.date)} · ${plural(days, "business day")} late`,
      impact:
        deal.overdue_calls.length > 1
          ? `${plural(deal.overdue_calls.length, "plan call")} not ticked`
          : "the plan's next date depends on it",
      tab: "overview",
      next: `Tick ${late.label} if it happened, or rebook it`,
    });
  }

  // A partner deal's attention comes from its own milestones and work items
  // (partner-attention), not the deal stage's age: the same rule as stallOf.
  const stuck = stuckLevel(deal.stage, deal.business_days_in_stage);
  if (stuck !== "ok" && !deal.partner) {
    out.push({
      bucket: stuck === "escalate" ? "act_now" : "needs_attention",
      rank: stuck === "escalate" ? 1.9 : 3.0,
      reason: `Stuck ${plural(deal.business_days_in_stage, "business day")} in ${where}`,
      impact: deal.next_step ? `next: ${deal.next_step}` : "nothing left on the checklist",
      tab: "overview",
      // With nothing left on the checklist and nothing dated on the record
      // (triage's nextAction), the move itself is the next step.
      ...(deal.next_step ? { next: deal.next_step } : { fallbackNext: movePrompt(deal.stage) }),
      ...(warnLimit ? { threshold: warnLimit } : {}),
    });
  }

  const missing = [!deal.has_notes ? "Gong brief" : null, !deal.has_sow ? "SOW" : null].filter(
    Boolean,
  ) as string[];
  // Before the close the paperwork is still being written; it is asked for at Closed Won.
  if (missing.length && deal.stage !== "negotiate") {
    out.push({
      bucket: "needs_attention",
      rank: 2.8,
      reason: `No ${missing.join(" or ")} on the deal`,
      impact: "the plan is built from what is here",
      tab: "overview",
      next: `Add the ${missing[0]}`,
      ...(warnLimit ? { threshold: warnLimit } : {}),
    });
  }

  // A meeting was read and nobody has said yes or no to what it proposed.
  if (deal.pending_proposals) {
    out.push({
      bucket: "needs_attention",
      rank: 2.6,
      reason: `${plural(deal.pending_proposals, "meeting update")} to review`,
      impact: "proposed from a transcript, not yet on the record",
      tab: "implementation",
      next: "Review the meeting updates",
    });
  }

  if (deal.stage === "onboarding_kickoff" && !deal.core_booked && !deal.partner) {
    out.push({
      bucket: "needs_attention",
      rank: 3.3,
      reason: "Core meetings not booked",
      impact: "the customer's dates are not set",
      tab: "overview",
      next: "Book the core meetings",
      ...(warnLimit ? { threshold: warnLimit } : {}),
    });
  }

  // The internal plan end has moved past the graduation date agreed with the
  // customer. Said to the owner; neither date is changed. Partner dates come
  // from the partner's milestones, so a partner deal never gets this.
  const slip = planEndSlip({
    planEnd: deal.plan_end,
    agreed: deal.agreed_graduation,
    partner: deal.partner,
  });
  if (slip) {
    out.push({
      bucket: "needs_attention",
      rank: 3.1,
      reason: planEndSlipText(slip),
      impact: "the customer was given the earlier date",
      tab: "implementation",
      next: PLAN_END_SLIP_NEXT,
    });
  }

  return out.sort((a, b) => a.rank - b.rank);
}

/** The health an "act now" reason implies for the chip: never calmer than at risk. */
export function healthFloor(reasons: ActionReason[]): "at_risk" | null {
  return reasons.some((r) => r.bucket === "act_now") ? "at_risk" : null;
}
