/**
 * Solution acceptance gate for the Launch transition.
 *
 * Reuses the existing acceptance representation only:
 *   approvals.approved_entity_type = 'technical_solution'
 *   approvals.approved_entity_id   = technical_solutions.id
 *   approvals.status               = 'approved' | 'pending' | 'rejected'
 *
 * No new entity, no new field, no generic gate framework. This module is pure
 * so the same rule runs in the UI (to show the block before the user clicks)
 * and on the server (where the transition is actually enforced).
 */

export const LAUNCH_STAGE = "launch";

export const LAUNCH_GATE_TITLE = "Solution acceptance required before Launch";

type SolutionLike = { id: string; title?: string | null };
type ApprovalLike = {
  status?: string | null;
  approved_entity_type?: string | null;
  approved_entity_id?: string | null;
  title?: string | null;
  approver_name?: string | null;
};

export type LaunchGate = {
  /** True when the move into Launch must not be allowed. */
  blocked: boolean;
  /** Short reason, safe to show anywhere. Null when not blocked. */
  reason: string | null;
  /** One line per solution that is not accepted yet. */
  outstanding: string[];
};

const status = (value: string | null | undefined) => String(value ?? "").toLowerCase();

/** Acceptance for one solution = an approval row for it with status 'approved'. */
export function solutionAcceptance(solution: SolutionLike, approvals: ApprovalLike[]) {
  const linked = approvals.filter(
    (a) =>
      status(a.approved_entity_type) === "technical_solution" &&
      a.approved_entity_id === solution.id,
  );
  const accepted = linked.some((a) => status(a.status) === "approved");
  const pending = linked.find((a) => status(a.status) === "pending");
  const rejected = linked.find((a) => status(a.status) === "rejected");
  return { accepted, linked, pending, rejected };
}

/**
 * Evaluate the gate for a proposed transition. Only the move into Launch is
 * gated; every other stage keeps its existing behaviour.
 */
export function launchAcceptanceGate(input: {
  toStage: string | null;
  solutions: SolutionLike[];
  approvals: ApprovalLike[];
}): LaunchGate {
  if (status(input.toStage) !== LAUNCH_STAGE) {
    return { blocked: false, reason: null, outstanding: [] };
  }

  if (input.solutions.length === 0) {
    return {
      blocked: true,
      reason:
        "No technical solution is recorded for this implementation, so acceptance cannot be confirmed.",
      outstanding: [
        "Record the technical solution and mark its acceptance as approved before moving to Launch.",
      ],
    };
  }

  const outstanding: string[] = [];
  for (const s of input.solutions) {
    const name = s.title?.trim() || "Untitled solution";
    const { accepted, linked, pending, rejected } = solutionAcceptance(s, input.approvals);
    if (accepted) continue;
    if (pending) {
      outstanding.push(
        `${name} — acceptance still pending${
          pending.approver_name ? ` with ${pending.approver_name}` : ""
        }.`,
      );
    } else if (rejected) {
      outstanding.push(`${name} — acceptance was rejected and has not been re-approved.`);
    } else if (linked.length === 0) {
      outstanding.push(`${name} — no acceptance has been requested yet.`);
    } else {
      outstanding.push(`${name} — acceptance is not approved.`);
    }
  }

  if (outstanding.length === 0) {
    return { blocked: false, reason: null, outstanding: [] };
  }

  return {
    blocked: true,
    reason: `${outstanding.length} technical solution(s) have not been accepted.`,
    outstanding,
  };
}

/** One message used for the thrown server error and the UI block alike. */
export function launchGateMessage(gate: LaunchGate): string {
  if (!gate.blocked) return "";
  return [LAUNCH_GATE_TITLE, gate.reason, ...gate.outstanding].filter(Boolean).join(" ");
}
