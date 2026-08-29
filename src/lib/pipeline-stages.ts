/**
 * The configurable pre-sale pipeline, as the rest of the app sees it.
 *
 * Design: docs/design/presale-stages.md.
 *
 * `presale-stages.ts` next door is the TypeScript mirror of the
 * `portal_account_stage` ENUM, and it stays that — the enum still types
 * `portal_accounts.stage`, both ends of `portal_stage_transitions`, and the
 * public API's `stage` contract. This module is the layer above it: an ordered
 * list of stages with a label, a colour, a position, and the two marks the rest
 * of the system keys off.
 *
 * Everything downstream reads ONE shape, `PipelineStage[]`, whether it came
 * from `portal_pipeline_stages` or from the built-in defaults below. That is
 * deliberate: the board, the deal record, `startOnboarding` and the Salesforce
 * bridge get one code path, not two.
 *
 * Client-safe. No database, no flags — see pipeline-stages.server.ts for those.
 */

import { STAGES, STAGE_LABELS, type AccountStage } from "./presale-stages";

/**
 * Theme tokens, not hex. Both light and dark already define these in
 * styles.css; a free colour field lets an operator pick something invisible in
 * one theme and the app has no way to warn them. Mirrors the CHECK in 0028.
 */
export const STAGE_COLORS = ["idle", "ontrack", "risk", "blocked", "primary"] as const;
export type StageColor = (typeof STAGE_COLORS)[number];

export function isStageColor(value: string): value is StageColor {
  return (STAGE_COLORS as readonly string[]).includes(value);
}

/** Mirrors `portal_pipeline_stages_key_shape` in 0028. */
export const PIPELINE_STAGE_KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

export interface PipelineStage {
  key: string;
  label: string;
  color: StageColor;
  sort_order: number;
  /** The one stage that means Closed Won. Exactly one, enforced in 0028. */
  is_won: boolean;
  /** The one stage that means the end of the pipeline. Exactly one. */
  is_terminal: boolean;
  /**
   * False while `key` is not a `portal_account_stage` label — i.e. the stage is
   * configured but no account can be moved into it yet. Computed by
   * `portal_pipeline_stages_v` from `pg_enum`, not guessed.
   */
  enterable: boolean;
}

const DEFAULT_COLORS: Record<AccountStage, StageColor> = {
  prospect: "idle",
  closed_won: "ontrack",
  onboarding_kickoff: "primary",
  in_onboarding: "primary",
  onboarding_complete: "ontrack",
};

/**
 * The compiled-in pipeline: the enum, in enum order, with the labels the UI has
 * always rendered. It is what 0028 seeds, and it is what the app falls back to
 * when the flag is off, the table is empty, or the read fails — so a deploy
 * that lands ahead of its migration behaves exactly like today.
 */
export const BUILTIN_PIPELINE_STAGES: readonly PipelineStage[] = STAGES.map((key, i) => ({
  key,
  label: STAGE_LABELS[key],
  color: DEFAULT_COLORS[key],
  sort_order: i + 1,
  is_won: key === "closed_won",
  is_terminal: key === "onboarding_complete",
  enterable: true,
}));

/* ------------------------------------------------------------------------- */
/* Reading a pipeline                                                         */
/* ------------------------------------------------------------------------- */

/**
 * The stage that means Closed Won. `closed_won` is a hardcoded string in four
 * places today (the handoff control, startOnboarding, the SF bridge); they all
 * read this instead.
 *
 * Never null: 0028 guarantees exactly one per org, and an unconfigured
 * deployment falls back to the built-in list, which has one too. A caller
 * should not have to write a null branch for a state the database refuses to
 * be in.
 */
export function wonStage(stages: readonly PipelineStage[]): PipelineStage {
  return stages.find((s) => s.is_won) ?? BUILTIN_PIPELINE_STAGES.find((s) => s.is_won)!;
}

/** The stage that means the end of the pipeline. Never null, same reasoning. */
export function terminalStage(stages: readonly PipelineStage[]): PipelineStage {
  return stages.find((s) => s.is_terminal) ?? BUILTIN_PIPELINE_STAGES.find((s) => s.is_terminal)!;
}

export function findStage(
  stages: readonly PipelineStage[],
  key: string | null | undefined,
): PipelineStage | null {
  if (!key) return null;
  return stages.find((s) => s.key === key) ?? null;
}

/**
 * Position in the configured order, or -1 for a stage nobody configured.
 *
 * A stage that only HISTORY names can legitimately be gone from the config, so
 * -1 is a real answer rather than an error — and it sorts before everything,
 * which is what the forward-only comparisons below want.
 */
export function stageOrder(stages: readonly PipelineStage[], key: string | null): number {
  if (!key) return -1;
  return stages.findIndex((s) => s.key === key);
}

/** Reordering changes what "forward" means. That is what reordering a pipeline is. */
export function isAtOrPast(
  stages: readonly PipelineStage[],
  key: string | null,
  target: string,
): boolean {
  const from = stageOrder(stages, key);
  const to = stageOrder(stages, target);
  if (from < 0 || to < 0) return false;
  return from >= to;
}

/** Label for display, falling back to the raw key so history never renders blank. */
export function stageLabel(stages: readonly PipelineStage[], key: string | null): string {
  if (!key) return "";
  return findStage(stages, key)?.label ?? key;
}

/**
 * The stage a deal moves into once onboarding starts: the first enterable stage
 * after the won stage. Null when the won stage is last, or when everything after
 * it is configured but not yet an account stage — in which case the deal simply
 * stays where it is, which is better than throwing on a transition the enum
 * would reject anyway.
 */
export function stageAfterWon(stages: readonly PipelineStage[]): PipelineStage | null {
  const wonIndex = stages.findIndex((s) => s.is_won);
  if (wonIndex < 0) return null;
  return stages.slice(wonIndex + 1).find((s) => s.enterable) ?? null;
}

/* ------------------------------------------------------------------------- */
/* Presentation                                                               */
/* ------------------------------------------------------------------------- */

/**
 * Written out in full rather than composed, because Tailwind only sees class
 * names that appear literally in the source.
 */
export const STAGE_COLOR_CLASS: Record<StageColor, string> = {
  idle: "bg-status-idle text-status-idle-foreground",
  ontrack: "bg-status-ontrack text-status-ontrack-foreground",
  risk: "bg-status-risk text-status-risk-foreground",
  blocked: "bg-status-blocked text-status-blocked-foreground",
  primary: "bg-primary/15 text-primary",
};

export const STAGE_COLOR_DOT_CLASS: Record<StageColor, string> = {
  idle: "bg-status-idle-foreground",
  ontrack: "bg-status-ontrack-foreground",
  risk: "bg-status-risk-foreground",
  blocked: "bg-status-blocked-foreground",
  primary: "bg-primary",
};

export const STAGE_COLOR_LABELS: Record<StageColor, string> = {
  idle: "Neutral",
  ontrack: "Green",
  risk: "Amber",
  blocked: "Red",
  primary: "Accent",
};
