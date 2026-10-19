/**
 * What a commitment's status means to the Hub: outstanding, completed or
 * withdrawn. One place, read by the internal Customer 360, Home, the calendar
 * and the internal alerts. The customer's own views are not read from here.
 *
 * The accepted vocabulary is `COMMITMENT_STATUSES` in `delivery-input.ts`, and
 * the database holds the stored text as written. Nothing here changes either,
 * and no record is rewritten: a stored value is read through this mapping.
 *
 *   outstanding  open, missed, renegotiated. A missed or renegotiated
 *                commitment is still owed until it is actually delivered.
 *   completed    met, and fulfilled (the same thing, an older spelling).
 *   withdrawn    cancelled. Not delivered, so not completed, and never overdue.
 *
 * A value this module does not recognise counts as outstanding, so an unknown
 * status is shown rather than hidden. That matches the rule the open-items
 * tests already pin.
 */

export const COMMITMENT_OUTSTANDING_STATUSES = ["open", "missed", "renegotiated"] as const;
export const COMMITMENT_COMPLETED_STATUSES = ["met", "fulfilled"] as const;
export const COMMITMENT_WITHDRAWN_STATUSES = ["cancelled"] as const;

export type CommitmentState = "outstanding" | "completed" | "withdrawn";

export function commitmentState(status: string | null | undefined): CommitmentState {
  const value = (status ?? "").toLowerCase();
  if ((COMMITMENT_COMPLETED_STATUSES as readonly string[]).includes(value)) return "completed";
  if ((COMMITMENT_WITHDRAWN_STATUSES as readonly string[]).includes(value)) return "withdrawn";
  return "outstanding";
}

/** Still owed: the only state that can be open, and the only one that can be overdue. */
export const isOutstandingCommitment = (status: string | null | undefined) =>
  commitmentState(status) === "outstanding";

/**
 * What a customer is told about a commitment. Read by the shared plan (the live
 * page, its PDF, the weekly snapshot and its PDF) and by the customer portal, so
 * every customer surface words and dates it the same way.
 *
 *   completed    "Done". Never outstanding, never overdue, even with no date.
 *   withdrawn    "Withdrawn". Visible, but never owed and never overdue.
 *   renegotiated "Renegotiated — Outstanding". Still owed until delivered.
 *   missed       "Missed — Outstanding". Still owed; the missed status is shown.
 *   open         "Outstanding".
 *   unknown      "Outstanding". Shown rather than dropped.
 */
const CUSTOMER_STATUS_LABEL: Readonly<Record<string, string>> = {
  met: "Done",
  fulfilled: "Done",
  cancelled: "Withdrawn",
  renegotiated: "Renegotiated — Outstanding",
  missed: "Missed — Outstanding",
  open: "Outstanding",
};

export function customerStatusLabel(status: string | null | undefined): string {
  return CUSTOMER_STATUS_LABEL[(status ?? "").toLowerCase()] ?? "Outstanding";
}

/**
 * Commitments made to our own team are not for the customer. The write path
 * records the audience as `internal` (COMMITMENT_AUDIENCES); anything else is
 * a party the customer can see.
 */
export function isCustomerVisibleCommitment(committedTo: string | null | undefined): boolean {
  return (committedTo ?? "").trim().toLowerCase() !== "internal";
}

export type CustomerCommitmentView = {
  state: CommitmentState;
  /** The stored shape's `done`: true only for a delivered commitment. */
  done: boolean;
  status_label: string;
  /** Outstanding, with a due date before `today` (YYYY-MM-DD). Never for done or withdrawn. */
  overdue: boolean;
};

export function customerCommitmentView(
  row: { status?: string | null; due_date?: string | null },
  today: string,
): CustomerCommitmentView {
  const state = commitmentState(row.status);
  return {
    state,
    done: state === "completed",
    status_label: customerStatusLabel(row.status),
    overdue: state === "outstanding" && !!row.due_date && row.due_date < today,
  };
}
