/**
 * Which parts of Current Implementation a given implementation shows. Pure, so
 * the rules are tested without a database or a page. The tab reads these
 * decisions; it does not decide them inline.
 *
 * The partner rule is the one that matters most: a Partner Implementation never
 * shows a standard-plan meeting, a standard plan date or the standard journey.
 * Its dates come only from its own records (the partner's next milestone and its
 * Roll Out target, plus the recorded go-live target).
 */

export type LeftBranch = "partner" | "field_fusion" | "closed_won" | "canonical";

export type CurrentImplementationLayout = {
  /** The stage column's content, chosen in the same order the tab always chose it. */
  leftBranch: LeftBranch;
  /** The canonical journey strip (stepper, skip, viewing) above the columns. */
  journeyStrip: boolean;
  /** The dated line the right column shows: a partner's milestone, or the standard meeting. */
  nextLine: "milestone" | "meeting";
  /** The standard plan's tier-expected go-live. Not a partner concept. */
  showTierExpected: boolean;
  /** The standard plan-date control. Not offered to a partner: it edits the standard plan. */
  showPlanDates: boolean;
  /**
   * The parking lot, outside Closed Won (which has its own) and outside the
   * prospect and negotiate stages, where there is no journey yet.
   */
  parkingAccess: boolean;
};

export function currentImplementationLayout(input: {
  partner: boolean;
  currentStage: string | null;
}): CurrentImplementationLayout {
  const stage = input.currentStage;
  if (input.partner) {
    return {
      leftBranch: "partner",
      journeyStrip: false,
      nextLine: "milestone",
      showTierExpected: false,
      showPlanDates: false,
      parkingAccess: false,
    };
  }
  const leftBranch: LeftBranch =
    stage === "field_fusion" ? "field_fusion" : stage === "closed_won" ? "closed_won" : "canonical";
  const preJourney = stage === null || stage === "prospect" || stage === "negotiate";
  return {
    leftBranch,
    journeyStrip: leftBranch === "canonical",
    nextLine: "meeting",
    showTierExpected: true,
    showPlanDates: true,
    parkingAccess: leftBranch === "canonical" && !preJourney,
  };
}
