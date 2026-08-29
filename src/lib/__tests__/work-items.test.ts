import { describe, expect, it } from "vitest";
import {
  dueState,
  indexById,
  isEffectivelyBlocked,
  openDependencies,
  summarisePlan,
  type WorkItemLike,
} from "../work-items";

/**
 * The load-bearing rule: dependency blockage is COMPUTED and a person's
 * status='blocked' is a STATEMENT. These tests pin that the two never leak
 * into each other, in either direction.
 */

const item = (over: Partial<WorkItemLike> & { id: string }): WorkItemLike => ({
  title: over.id,
  status: "not_started",
  depends_on: [],
  party: "internal",
  ...over,
});

describe("openDependencies", () => {
  it("lists the predecessors still outstanding, so 'blocked' can say what for", () => {
    const a = item({ id: "a", title: "Export data", status: "in_progress" });
    const b = item({ id: "b", depends_on: ["a"] });
    const open = openDependencies(b, indexById([a, b]));
    expect(open).toEqual([{ id: "a", title: "Export data", status: "in_progress" }]);
  });

  it("treats done and skipped predecessors as satisfied", () => {
    const a = item({ id: "a", status: "done" });
    const b = item({ id: "b", status: "skipped" });
    const c = item({ id: "c", depends_on: ["a", "b"] });
    expect(openDependencies(c, indexById([a, b, c]))).toEqual([]);
  });

  it("ignores an unknown dependency id rather than blocking on it", () => {
    // A dependency on a task that was conditioned out is dropped at
    // instantiation, so a dangling id means excluded, not stuck.
    const b = item({ id: "b", depends_on: ["missing"] });
    expect(openDependencies(b, indexById([b]))).toEqual([]);
  });
});

describe("isEffectivelyBlocked", () => {
  it("is true only while a predecessor is outstanding", () => {
    const a = item({ id: "a", status: "in_progress" });
    const b = item({ id: "b", depends_on: ["a"] });
    expect(isEffectivelyBlocked(b, indexById([a, b]))).toBe(true);

    const doneA = item({ id: "a", status: "done" });
    expect(isEffectivelyBlocked(b, indexById([doneA, b]))).toBe(false);
  });

  it("does NOT infer blockage from a person marking the item blocked", () => {
    // status='blocked' is a human statement. With no outstanding predecessor
    // the item is not *computationally* blocked, and the two must not merge.
    const solo = item({ id: "solo", status: "blocked" });
    expect(isEffectivelyBlocked(solo, indexById([solo]))).toBe(false);
  });

  it("does not consider a finished item blocked, whatever it depends on", () => {
    const a = item({ id: "a", status: "not_started" });
    const b = item({ id: "b", status: "done", depends_on: ["a"] });
    expect(isEffectivelyBlocked(b, indexById([a, b]))).toBe(false);
  });
});

describe("dueState", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("reports overdue, due today and upcoming from the date alone", () => {
    expect(dueState(item({ id: "x", due_at: "2026-06-14T09:00:00Z" }), now)).toBe("overdue");
    expect(dueState(item({ id: "x", due_at: "2026-06-15T23:00:00Z" }), now)).toBe("due_today");
    expect(dueState(item({ id: "x", due_at: "2026-06-20T09:00:00Z" }), now)).toBe("upcoming");
  });

  it("never calls a finished item overdue", () => {
    const closed = item({ id: "x", status: "done", due_at: "2020-01-01T00:00:00Z" });
    expect(dueState(closed, now)).toBe("none");
  });

  it("returns none for a missing or unparseable date", () => {
    expect(dueState(item({ id: "x" }), now)).toBe("none");
    expect(dueState(item({ id: "x", due_at: "not a date" }), now)).toBe("none");
  });
});

describe("summarisePlan", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("counts blocked by real outstanding dependencies, not by assertion", () => {
    const items = [
      item({ id: "a", status: "in_progress" }),
      item({ id: "b", depends_on: ["a"] }),
      // Marked blocked by a person, but nothing is actually holding it up.
      item({ id: "c", status: "blocked" }),
    ];
    expect(summarisePlan(items, now).blocked).toBe(1);
  });

  it("separates what the customer owes us from everything else open", () => {
    const items = [
      item({ id: "a", status: "waiting", waiting_on_party: "customer" }),
      item({ id: "b", status: "waiting", waiting_on_party: "internal" }),
      item({ id: "c", status: "done" }),
    ];
    const s = summarisePlan(items, now);
    expect(s).toMatchObject({ total: 3, done: 1, open: 2, waitingOnCustomer: 1 });
  });

  it("counts an overdue open item once", () => {
    const items = [item({ id: "a", due_at: "2026-01-01T00:00:00Z" })];
    expect(summarisePlan(items, now)).toMatchObject({ overdue: 1, open: 1, done: 0 });
  });
});
