import type { KickoffCorrection } from "@/lib/kickoff-held";
import type { FlowStageKey } from "@/lib/stage-flow";

/**
 * What the person saw when they unticked Kickoff held. The server checks it
 * against the deal it reads now; a difference means the deal changed and the
 * person must look again before anything is written. The whole intake, not only
 * the completion record: the Complete stage's outcome is read from it too.
 */
export type KickoffCorrectionSnapshot = {
  stage: string;
  intake: Record<string, unknown>;
  kind: "auto" | "confirm_later_work";
};

export type KickoffCorrectionDecision =
  | { ok: true; laterTasksDone: number }
  | { ok: false; reason: "stale" | "not_held" | "not_applicable" | "needs_confirmation" }
  | { ok: false; reason: "blocked"; completedStage: FlowStageKey };

/**
 * The same JSON value. Object key order does not matter, as it does not in the
 * stored jsonb; arrays and scalars must match exactly.
 */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((x, i) => sameJson(x, b[i]))
    );
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const x = a as Record<string, unknown>;
    const y = b as Record<string, unknown>;
    const keys = Object.keys(x);
    return (
      keys.length === Object.keys(y).length &&
      keys.every((k) => Object.prototype.hasOwnProperty.call(y, k) && sameJson(x[k], y[k]))
    );
  }
  return false;
}

/**
 * The correction's policy, applied to the record read on the server. Pure, so
 * every scenario is tested without a database. The database function repeats
 * the stage and record check under a row lock; this decides what may be
 * attempted at all.
 */
export function decideKickoffCorrection(input: {
  stage: string;
  intake: Record<string, unknown>;
  correction: KickoffCorrection;
  expected: KickoffCorrectionSnapshot;
  confirmLaterWork: boolean;
}): KickoffCorrectionDecision {
  const { correction, expected } = input;
  if (input.stage !== expected.stage || !sameJson(input.intake, expected.intake)) {
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
