/**
 * What the Solutions view and its Current Implementation summary say about delivery.
 *
 * The purchased solution and its lifecycle (Define, Build, Accept, Accepted) come from
 * `intake.timeline.services`, the authoritative record. PR #101's delivery records are
 * linked to a purchased service by its id, and nothing here copies them into the purchase
 * record. Everything below is computed from those two sources, and nothing is stored.
 *
 * Pure, so the screens and the tests read the same rules.
 */

import {
  isSolutionKind,
  launchCriticalOpen,
  solutionBall,
  solutionStatus,
  SOLUTION_STATUS_LABEL,
  type ServiceSpec,
  type SolutionStatus,
} from "./onboarding-services";

/** A PR #101 complete solution, as the views read it: only the fields this module uses. */
export type LinkedSolution = {
  id: string;
  title: string;
  archived: boolean;
  purchasedServiceId: string | null;
  components: Array<{
    id: string;
    name: string;
    status: string;
    blocker: string | null;
    archived: boolean;
  }>;
};

/** The active delivery record for a purchased service, if one is linked to it. */
export function linkedSolutionFor<T extends LinkedSolution>(
  purchasedServiceId: string,
  solutions: ReadonlyArray<T>,
): T | null {
  return solutions.find((s) => !s.archived && s.purchasedServiceId === purchasedServiceId) ?? null;
}

export type SolutionRowFacts = {
  service: ServiceSpec;
  status: SolutionStatus;
  statusLabel: string;
  /** Ended by a decision (descoped or transferred) or accepted. */
  ended: boolean;
  linked: LinkedSolution | null;
};

export type Blocker =
  | { kind: "solution"; id: string; label: string; who: "blocked_customer" | "blocked_internal" }
  | { kind: "component"; id: string; label: string; detail: string; solution: string };

export type SolutionsOverview = {
  purchased: number;
  accepted: number;
  /** Purchased solutions not yet accepted or ended. */
  open: number;
  rows: SolutionRowFacts[];
  /** Components of the linked delivery records, not archived. */
  components: { complete: number; total: number };
  /** Launch-critical solutions not yet accepted: the go-live gate waits on them. */
  launchCriticalOutstanding: Array<{ id: string; name: string }>;
  /** Genuine blockers only: a solution blocked by us or the customer, or a component with a blocker. */
  blockers: Blocker[];
};

export function solutionsOverview(input: {
  services: ReadonlyArray<ServiceSpec>;
  completed: Record<string, string>;
  solutions: ReadonlyArray<LinkedSolution>;
}): SolutionsOverview {
  const { completed, solutions } = input;
  const purchased = input.services.filter((s) => isSolutionKind(s.kind));

  const rows: SolutionRowFacts[] = purchased.map((service) => {
    const status = solutionStatus(service, completed);
    return {
      service,
      status,
      statusLabel: SOLUTION_STATUS_LABEL[status],
      ended: Boolean(service.disposition) || status === "accepted",
      linked: linkedSolutionFor(service.id, solutions),
    };
  });

  const linkedComponents = rows.flatMap((r) =>
    r.linked ? r.linked.components.filter((c) => !c.archived) : [],
  );

  const blockers: Blocker[] = [];
  for (const r of rows) {
    if (r.ended) continue;
    const ball = solutionBall(r.service, completed);
    if (ball && (ball.who === "blocked_customer" || ball.who === "blocked_internal")) {
      blockers.push({ kind: "solution", id: r.service.id, label: r.service.name, who: ball.who });
    }
  }
  for (const r of rows) {
    if (!r.linked) continue;
    for (const c of r.linked.components) {
      if (c.archived || c.status === "complete" || !c.blocker?.trim()) continue;
      blockers.push({
        kind: "component",
        id: c.id,
        label: c.name,
        detail: c.blocker.trim(),
        solution: r.linked.title,
      });
    }
  }

  return {
    purchased: purchased.length,
    accepted: rows.filter((r) => r.status === "accepted").length,
    open: rows.filter((r) => !r.ended).length,
    rows,
    components: {
      complete: linkedComponents.filter((c) => c.status === "complete").length,
      total: linkedComponents.length,
    },
    launchCriticalOutstanding: launchCriticalOpen(input.services, completed).map((s) => ({
      id: s.id,
      name: s.name,
    })),
    blockers,
  };
}
