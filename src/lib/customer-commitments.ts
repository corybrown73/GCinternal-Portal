import {
  customerCommitmentView,
  isCustomerVisibleCommitment,
  type CommitmentState,
} from "./commitment-status";

/**
 * The customer portal's view of commitments, as pure functions so the rules
 * can be tested without a database. The words and the overdue test come from
 * commitment-status.ts, the same ones the shared plan uses.
 */
export type CommitmentStep = {
  id: string;
  kind: "commitment";
  title: string;
  due_date: string | null;
  overdue: boolean;
  /** Who the item sits with, when recorded (commitments.committed_to). */
  who: string | null;
  implementation_name: string;
  state: CommitmentState;
  status_label: string;
};

/**
 * Commitments the customer may see, in the shared customer words. Made to our
 * own team is left out. `today` is YYYY-MM-DD, the same day the shared plan uses.
 */
export function commitmentSteps(
  rows: ReadonlyArray<{
    id: string;
    implementation_id: string;
    description: string;
    due_date: string | null;
    status: string | null;
    committed_to: string | null;
  }>,
  implementationName: ReadonlyMap<string, string>,
  today: string,
): CommitmentStep[] {
  return rows
    .filter((c) => isCustomerVisibleCommitment(c.committed_to))
    .map((c) => {
      const view = customerCommitmentView(c, today);
      return {
        id: c.id,
        kind: "commitment" as const,
        title: c.description,
        due_date: c.due_date,
        overdue: view.overdue,
        who: c.committed_to ?? null,
        implementation_name: implementationName.get(c.implementation_id) ?? "",
        state: view.state,
        status_label: view.status_label,
      };
    });
}

/**
 * Items still to do come first, in due-date order. Done and withdrawn follow.
 * A step without a state (a milestone) counts as still to do.
 */
export function orderNextSteps<T extends { due_date: string | null; state?: CommitmentState }>(
  steps: readonly T[],
): T[] {
  const rank = (s: T) => (s.state !== undefined && s.state !== "outstanding" ? 1 : 0);
  return [...steps].sort(
    (a, b) => rank(a) - rank(b) || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
  );
}
