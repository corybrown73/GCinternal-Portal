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

/** The deal has not reached Kickoff yet: any stage before it in STAGES. */
export function isBeforeKickoff(stage: string | null | undefined): boolean {
  const s = normalizeStage(stage);
  return s !== null && STAGES.indexOf(s) < STAGES.indexOf("kickoff");
}

/**
 * A plan session nobody has booked, on a deal not yet at Kickoff whose
 * kickoff is not booked either. Its date is the playbook's guess from the
 * close, not a meeting: Home and the Calendar leave it out. Once the
 * kickoff is booked the dates follow it and show again (with Home's "not
 * booked yet" tag). The deal page always shows the plan.
 */
export function isUnbookedBeforeKickoff(
  stage: string | null | undefined,
  m: { kind: string; time?: string | null | undefined },
  kickoffBooked = false,
): boolean {
  return m.kind === "call" && isGuessBeforeKickoff(stage, m, kickoffBooked);
}

/**
 * Any plan item (a call, homework, a build day) on a deal before Kickoff
 * with the kickoff unbooked, and no time of its own: a date from the
 * close, never late (QA 13.2).
 */
export function isGuessBeforeKickoff(
  stage: string | null | undefined,
  m: { time?: string | null | undefined },
  kickoffBooked = false,
): boolean {
  return !m.time && !kickoffBooked && isBeforeKickoff(stage);
}

/**
 * The day the deal entered Kickoff, once it is there or past it: its stage
 * entry while in Kickoff, else the last move into Kickoff in its history
 * (or the first move past it). Null before Kickoff, or when nothing
 * records it.
 */
export function kickoffEntryDate(
  stage: string | null | undefined,
  enteredAt: string | null | undefined,
  history: ReadonlyArray<{ to_stage: string; occurred_at: string }>,
): string | null {
  if (isBeforeKickoff(stage)) return null;
  if (normalizeStage(stage) === "kickoff" && enteredAt) return enteredAt.slice(0, 10);
  const day = (h: { occurred_at: string }) => h.occurred_at.slice(0, 10);
  const intoKickoff = history
    .filter((h) => h.to_stage === "kickoff")
    .map(day)
    .sort();
  if (intoKickoff.length) return intoKickoff.at(-1)!;
  // Moved past Kickoff without a recorded stop in it: the first move past it.
  const past = history
    .filter((h) => normalizeStage(h.to_stage) !== null && !isBeforeKickoff(h.to_stage))
    .map(day)
    .sort();
  return past[0] ?? null;
}

/**
 * An item the plan dated before the deal reached Kickoff, with no time
 * booked: never overdue, it was the close's guess and not the team's to
 * hold (QA 13.2). A booked one, held or not, still counts.
 */
export function plannedBeforeKickoff(
  m: { date: string; time?: string | null | undefined },
  kickoffOn: string | null,
): boolean {
  return kickoffOn !== null && !m.time && m.date < kickoffOn;
}
