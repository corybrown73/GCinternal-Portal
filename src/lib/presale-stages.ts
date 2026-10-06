/**
 * The deal's stages, in order. After the close they are the operating
 * model's six: Intake & Process, Kickoff, Get it working, Make it yours,
 * Make it run, Graduate — the same names the team, the customer and the Hub
 * use. Each ends at a gate (src/lib/won-gate.ts), not after a number
 * of meetings.
 */
export const STAGES = [
  "prospect",
  "negotiate",
  "closed_won",
  "field_fusion_setup",
  "onboarding_kickoff",
  "kickoff",
  "get_it_working",
  "make_it_yours",
  "make_it_run",
  "onboarding_complete",
] as const;

export type AccountStage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<AccountStage, string> = {
  prospect: "Prospect",
  negotiate: "Negotiate & Finalize",
  closed_won: "Closed Won",
  field_fusion_setup: "Field Fusion setup",
  onboarding_kickoff: "Intake & Process",
  kickoff: "Kickoff",
  get_it_working: "Get it working",
  make_it_yours: "Make it yours",
  make_it_run: "Make it run",
  onboarding_complete: "Graduate",
};

/**
 * Values the enum still holds that no deal is in any more. History rows
 * keep them; the label lookup names them; the API maps them forward.
 */
export const LEGACY_STAGES: Readonly<Record<string, { label: string; now: AccountStage }>> = {
  in_onboarding: { label: "Onboarding (legacy)", now: "get_it_working" },
};

/** The four stages between Intake & Process and Graduate. */
export const ONBOARDING_STAGES: ReadonlyArray<AccountStage> = [
  "kickoff",
  "get_it_working",
  "make_it_yours",
  "make_it_run",
];

/** The deal is being implemented: Kickoff, one of the three middle stages, or the legacy one. */
export function isOnboardingStage(stage: string | null | undefined): boolean {
  if (!stage) return false;
  return (ONBOARDING_STAGES as readonly string[]).includes(stage) || stage === "in_onboarding";
}

/** A stage value from anywhere (the API, history) as a current stage; null for nonsense. */
export function normalizeStage(raw: string | null | undefined): AccountStage | null {
  if (!raw) return null;
  if (isStage(raw)) return raw;
  return LEGACY_STAGES[raw]?.now ?? null;
}

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
