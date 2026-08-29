export const STAGES = [
  "prospect",
  "closed_won",
  "onboarding_kickoff",
  "in_onboarding",
  "onboarding_complete",
] as const;

export type AccountStage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<AccountStage, string> = {
  prospect: "Prospect",
  closed_won: "Closed Won",
  onboarding_kickoff: "Onboarding Kickoff",
  in_onboarding: "In Onboarding",
  onboarding_complete: "Onboarding Complete",
};

// badge/border classes per stage, referenced by the board and stage badges
export const STAGE_STYLES: Record<AccountStage, { badge: string; column: string }> = {
  prospect: {
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    column: "border-slate-300",
  },
  closed_won: {
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
    column: "border-emerald-400",
  },
  onboarding_kickoff: {
    badge: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300",
    column: "border-sky-400",
  },
  in_onboarding: {
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
    column: "border-amber-400",
  },
  onboarding_complete: {
    badge: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
    column: "border-green-500",
  },
};

export function isStage(value: string): value is AccountStage {
  return (STAGES as readonly string[]).includes(value);
}
