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
