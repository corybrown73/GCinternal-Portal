/**
 * Work-item derivation. Pure: no imports, no I/O, safe in a client bundle.
 *
 * The rule this module exists to enforce: **being blocked by a dependency is
 * COMPUTED, never written**. `work_items.status = 'blocked'` is a human
 * statement — someone saying "this is stuck" — and nothing may infer one from
 * the other in either direction. If dependency state were written into
 * `status`, a person's assessment and a mechanical fact would become
 * indistinguishable the moment they disagreed.
 */

export type WorkItemStatus =
  "not_started" | "in_progress" | "waiting" | "blocked" | "done" | "skipped";

export type WorkItemParty = "internal" | "customer" | "partner";

export type WorkItemLike = {
  id: string;
  title: string;
  status: WorkItemStatus;
  depends_on: string[];
  party: WorkItemParty;
  waiting_on_party?: string | null;
  due_at?: string | null;
  due_at_edited?: boolean;
  role_key?: string | null;
  owner_id?: string | null;
};

/** A predecessor is satisfied once it is done or deliberately skipped. */
export const SATISFIED_STATUSES: readonly WorkItemStatus[] = ["done", "skipped"];

export function isSatisfied(status: WorkItemStatus): boolean {
  return SATISFIED_STATUSES.includes(status);
}

/** An item is finished when it needs no more attention. */
export function isClosed(status: WorkItemStatus): boolean {
  return isSatisfied(status);
}

export type BlockedBy = { id: string; title: string; status: WorkItemStatus };

/**
 * Which of an item's predecessors are still outstanding.
 *
 * Returned as the rows themselves, not a count: "blocked" is only actionable
 * if you can see what it is waiting for. Unknown ids are ignored rather than
 * treated as blocking — a dependency on an excluded task is dropped at
 * instantiation, so a dangling id means the task was conditioned out, not that
 * the work is stuck.
 */
export function openDependencies(
  item: WorkItemLike,
  byId: ReadonlyMap<string, WorkItemLike>,
): BlockedBy[] {
  const out: BlockedBy[] = [];
  for (const depId of item.depends_on ?? []) {
    const dep = byId.get(depId);
    if (!dep || isSatisfied(dep.status)) continue;
    out.push({ id: dep.id, title: dep.title, status: dep.status });
  }
  return out;
}

/**
 * Can this item be worked on right now? Purely a function of its
 * predecessors — it never consults, and never sets, the item's own status.
 */
export function isEffectivelyBlocked(
  item: WorkItemLike,
  byId: ReadonlyMap<string, WorkItemLike>,
): boolean {
  if (isClosed(item.status)) return false;
  return openDependencies(item, byId).length > 0;
}

export function indexById(items: readonly WorkItemLike[]): Map<string, WorkItemLike> {
  return new Map(items.map((i) => [i.id, i]));
}

export type DueState = "none" | "overdue" | "due_today" | "upcoming";

/** Overdue is a fact about the date, so a closed item is never overdue. */
export function dueState(item: WorkItemLike, now: Date = new Date()): DueState {
  if (!item.due_at || isClosed(item.status)) return "none";
  const due = new Date(item.due_at);
  if (Number.isNaN(due.getTime())) return "none";
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  if (due < startOfToday) return "overdue";
  if (due < startOfTomorrow) return "due_today";
  return "upcoming";
}

export type PlanSummary = {
  total: number;
  done: number;
  open: number;
  overdue: number;
  blocked: number;
  waitingOnCustomer: number;
};

/**
 * Counts for a plan. `blocked` is the computed kind; an item a person marked
 * blocked is counted only if its dependencies really are outstanding, so the
 * number always means "cannot proceed", never "someone said so".
 */
export function summarisePlan(items: readonly WorkItemLike[], now: Date = new Date()): PlanSummary {
  const byId = indexById(items);
  let done = 0;
  let overdue = 0;
  let blocked = 0;
  let waitingOnCustomer = 0;

  for (const item of items) {
    if (isClosed(item.status)) {
      done += 1;
      continue;
    }
    if (dueState(item, now) === "overdue") overdue += 1;
    if (isEffectivelyBlocked(item, byId)) blocked += 1;
    if (item.status === "waiting" && item.waiting_on_party === "customer") {
      waitingOnCustomer += 1;
    }
  }

  return {
    total: items.length,
    done,
    open: items.length - done,
    overdue,
    blocked,
    waitingOnCustomer,
  };
}
