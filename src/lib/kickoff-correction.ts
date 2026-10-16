import type { KickoffCorrection } from "@/lib/kickoff-held";
import type { FlowStageKey } from "@/lib/stage-flow";

/**
 * What the person saw when they unticked Kickoff held. The server checks it
 * against the record it reads now; a difference means the deal changed and
 * the person must look again before anything is written.
 */
export type KickoffCorrectionSnapshot = {
  stage: string;
  completed: Record<string, string>;
  kind: "auto" | "confirm_later_work";
};

export type KickoffCorrectionDecision =
  | { ok: true; laterTasksDone: number }
  | { ok: false; reason: "stale" | "not_held" | "not_applicable" | "needs_confirmation" }
  | { ok: false; reason: "blocked"; completedStage: FlowStageKey };

/** Same keys, same dates. Key order in the stored record does not matter. */
export function sameCompleted(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => b[k] === a[k]);
}

/**
 * The correction's policy, applied to the record read on the server. Pure, so
 * every scenario is tested without a database. The database function repeats
 * the stage and record check under a row lock; this decides what may be
 * attempted at all.
 */
export function decideKickoffCorrection(input: {
  stage: string;
  completed: Record<string, string>;
  correction: KickoffCorrection;
  expected: KickoffCorrectionSnapshot;
  confirmLaterWork: boolean;
}): KickoffCorrectionDecision {
  const { correction, expected } = input;
  if (input.stage !== expected.stage || !sameCompleted(input.completed, expected.completed)) {
    return { ok: false, reason: "stale" };
  }
  switch (correction.kind) {
    case "not_held":
      return { ok: false, reason: "not_held" };
    case "not_applicable":
      return { ok: false, reason: "not_applicable" };
    case "blocked":
      return { ok: false, reason: "blocked", completedStage: correction.completedStage };
    case "auto":
    case "confirm_later_work":
      break;
  }
  // The person saw one outcome and the record now gives another (later work
  // appeared or went away): look again rather than act on the old answer.
  if (correction.kind !== expected.kind) return { ok: false, reason: "stale" };
  if (correction.kind === "confirm_later_work") {
    if (!input.confirmLaterWork) return { ok: false, reason: "needs_confirmation" };
    return { ok: true, laterTasksDone: correction.laterTasksDone };
  }
  return { ok: true, laterTasksDone: 0 };
}
