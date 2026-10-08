import { dealStageLabel } from "./deal-stage";
import { shortDay } from "./onboarding-timeline";
import { isOnboardingStage, type AccountStage } from "./presale-stages";
import { stuckLevel } from "./stage-flow";

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
  has_notes: boolean;
  has_sow: boolean;
  owner_name: string | null;
  /** The pre-kickoff booking task (all core meetings, or the kickoff) is done. */
  core_booked: boolean;
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
  /** Transcript proposals on the deal's implementations that nobody has applied or dismissed. */
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

/** Ranked reasons, most urgent first. Empty when the deal is fine by its own facts. */
export function needsAction(deal: DealFacts | null | undefined): ActionReason[] {
  if (!deal || !WORKED.includes(deal.stage)) return [];
  const out: ActionReason[] = [];
  const where = dealStageLabel(deal.stage);

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

  const stuck = stuckLevel(deal.stage, deal.business_days_in_stage);
  if (stuck !== "ok") {
    out.push({
      bucket: stuck === "escalate" ? "act_now" : "needs_attention",
      rank: stuck === "escalate" ? 1.9 : 3.0,
      reason: `Stuck ${plural(deal.business_days_in_stage, "business day")} in ${where}`,
      impact: deal.next_step ? `next: ${deal.next_step}` : "nothing left on the checklist",
      tab: "overview",
      ...(deal.next_step ? { next: deal.next_step } : {}),
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

  if (deal.stage === "onboarding_kickoff" && !deal.core_booked) {
    out.push({
      bucket: "needs_attention",
      rank: 3.3,
      reason: "Core meetings not booked",
      impact: "the customer's dates are not set",
      tab: "overview",
      next: "Book the core meetings",
    });
  }

  return out.sort((a, b) => a.rank - b.rank);
}

/** The health an "act now" reason implies for the chip: never calmer than at risk. */
export function healthFloor(reasons: ActionReason[]): "at_risk" | null {
  return reasons.some((r) => r.bucket === "act_now") ? "at_risk" : null;
}
