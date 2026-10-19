import {
  customerCommitmentView,
  isCustomerCommitment,
  type CommitmentState,
} from "./commitment-status";

/**
 * GoCanvas promises, as the customer portal shows them. Pure functions, so the
 * rules can be tested without a database. The words and the overdue test come
 * from commitment-status.ts, the same ones the shared plan uses.
 *
 * A commitment is shown here only when `committed_to` is exactly "customer".
 * Anything else was made to our own team, or to someone we have not named for
 * the customer, and is not part of this view.
 */
export type CustomerCommitment = {
  id: string;
  title: string;
  due_date: string | null;
  overdue: boolean;
  implementation_name: string;
  state: CommitmentState;
  status_label: string;
};

export function customerCommitments(
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
): CustomerCommitment[] {
  return rows
    .filter((c) => isCustomerCommitment(c.committed_to))
    .map((c) => {
      const view = customerCommitmentView(c, today);
      return {
        id: c.id,
        title: c.description,
        due_date: c.due_date,
        overdue: view.overdue,
        implementation_name: implementationName.get(c.implementation_id) ?? "",
        state: view.state,
        status_label: view.status_label,
      };
    });
}

/** Earliest due first; an undated item goes last. */
const byDueAscending = (a: CustomerCommitment, b: CustomerCommitment) =>
  (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");

/**
 * "What we owe you": every promise still owed, including renegotiated and
 * missed ones, until it is actually delivered or withdrawn.
 */
export function owedToCustomer(items: readonly CustomerCommitment[]): CustomerCommitment[] {
  return items.filter((c) => c.state === "outstanding").sort(byDueAscending);
}

/**
 * "History": promises that are done or withdrawn. Most recently due first, so
 * the latest settled item is at the top.
 */
export function commitmentHistory(items: readonly CustomerCommitment[]): CustomerCommitment[] {
  return items
    .filter((c) => c.state !== "outstanding")
    .sort((a, b) => (b.due_date ?? "0000").localeCompare(a.due_date ?? "0000"));
}
