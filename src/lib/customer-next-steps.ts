/**
 * "Your next steps": the work the customer owns, as the customer portal shows
 * it. Pure, so the rule can be tested without a database.
 *
 * Only work items that are owned by the customer (`party = customer`) and
 * shared with them (`visibility = shared`) appear. Internal work, and anything
 * GoCanvas owes, is never listed here. Closed tasks (done or skipped) are left
 * out, as they are on the shared plan.
 */
export type CustomerTaskStep = {
  id: string;
  title: string;
  due_date: string | null;
  overdue: boolean;
  implementation_name: string;
};

const CLOSED_TASK_STATUSES = new Set(["done", "skipped"]);

export function customerTaskSteps(
  rows: ReadonlyArray<{
    id: string;
    implementation_id: string;
    title: string;
    status: string | null;
    party: string | null;
    visibility: string | null;
    due_at: string | null;
  }>,
  implementationName: ReadonlyMap<string, string>,
  today: string,
): CustomerTaskStep[] {
  return rows
    .filter(
      (w) =>
        w.party === "customer" &&
        w.visibility === "shared" &&
        !CLOSED_TASK_STATUSES.has((w.status ?? "").toLowerCase()),
    )
    .map((w) => {
      const due = w.due_at ? w.due_at.slice(0, 10) : null;
      return {
        id: w.id,
        title: w.title,
        due_date: due,
        overdue: due !== null && due < today,
        implementation_name: implementationName.get(w.implementation_id) ?? "",
      };
    })
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
}
