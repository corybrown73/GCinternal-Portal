export const STAGES = [
  "prospect",
  "closed_won",
  "field_fusion_setup",
  "onboarding_kickoff",
  "in_onboarding",
  "onboarding_complete",
] as const;

export type AccountStage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<AccountStage, string> = {
  prospect: "Prospect",
  closed_won: "Closed Won",
  field_fusion_setup: "Field Fusion setup",
  onboarding_kickoff: "Onboarding Kickoff",
  in_onboarding: "In Onboarding",
  onboarding_complete: "Onboarding Complete",
};

export function isStage(value: string): value is AccountStage {
  return (STAGES as readonly string[]).includes(value);
}
