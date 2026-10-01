export const STAGES = [
  "prospect",
  "negotiate",
  "closed_won",
  "field_fusion_setup",
  "onboarding_kickoff",
  "in_onboarding",
  "onboarding_complete",
] as const;

export type AccountStage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<AccountStage, string> = {
  prospect: "Prospect",
  negotiate: "Negotiate & Finalize",
  closed_won: "Closed Won",
  field_fusion_setup: "Field Fusion setup",
  onboarding_kickoff: "Pre-kickoff",
  in_onboarding: "Onboarding",
  onboarding_complete: "Onboarding Complete",
};

export function isStage(value: string): value is AccountStage {
  return (STAGES as readonly string[]).includes(value);
}

/**
 * The stages before the close. Sales works a deal here; a TIS can already be
 * assigned at Negotiate & Finalize so they join the closing call. Moving out of
 * these into a closed stage is what the Closed Won gate guards.
 */
export const PRE_CLOSE_STAGES: ReadonlyArray<AccountStage> = ["prospect", "negotiate"];

export function isPreClose(stage: string | null | undefined): boolean {
  return (
    stage !== null && stage !== undefined && (PRE_CLOSE_STAGES as readonly string[]).includes(stage)
  );
}
