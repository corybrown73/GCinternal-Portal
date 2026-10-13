import { describe, expect, it } from "vitest";

import { journeyPosition, taskFocusFor, taskProgress } from "@/lib/current-implementation-focus";
import type { FlowTask } from "@/lib/stage-flow";

/**
 * Focus Mode's task rule. The next task is the stage logic's own next task: not
 * done, not locked, not optional. Progress counts required tasks only.
 */

function task(key: string, over: Partial<FlowTask> = {}): FlowTask {
  return {
    key,
    label: `Task ${key}`,
    hint: "",
    done: false,
    summary: null,
    action: "tick",
    locked: null,
    ...over,
  };
}

describe("taskFocusFor — the next actionable task", () => {
  it("focuses the first open task in the stage's own order", () => {
    const focus = taskFocusFor([task("a", { done: true }), task("b"), task("c")]);
    expect(focus.state).toBe("next");
    if (focus.state !== "next") return;
    expect(focus.next.key).toBe("b");
    expect(focus.others).toBe(1);
    expect(focus.progress).toEqual({ done: 1, total: 3 });
  });

  it("skips a locked task and focuses the next one that can be done", () => {
    const focus = taskFocusFor([task("a", { locked: "Needs the SOW" }), task("b")]);
    expect(focus.state).toBe("next");
    if (focus.state !== "next") return;
    expect(focus.next.key).toBe("b");
  });

  it("never focuses an optional task, even when it is the only one open", () => {
    const focus = taskFocusFor([task("a", { done: true }), task("extra", { optional: true })]);
    expect(focus.state).toBe("complete");
  });

  it("counts open tasks other than the focused one", () => {
    const focus = taskFocusFor([task("a"), task("b"), task("c", { done: true })]);
    expect(focus.state === "next" && focus.others).toBe(1);
  });
});

describe("taskFocusFor — states with nothing to do", () => {
  it("is waiting when every open task is locked, naming the first with its reason", () => {
    const focus = taskFocusFor([
      task("a", { done: true }),
      task("b", { locked: "Finish the plan first" }),
      task("c", { locked: "Book the call first" }),
    ]);
    expect(focus.state).toBe("waiting");
    if (focus.state !== "waiting") return;
    expect(focus.blocker.key).toBe("b");
    expect(focus.blocker.locked).toBe("Finish the plan first");
  });

  it("is complete when every required task is done", () => {
    const focus = taskFocusFor([task("a", { done: true }), task("b", { done: true })]);
    expect(focus.state).toBe("complete");
    expect(focus.progress).toEqual({ done: 2, total: 2 });
  });

  it("is empty when the stage has no tasks", () => {
    expect(taskFocusFor([])).toEqual({ state: "empty", progress: { done: 0, total: 0 } });
  });
});

describe("taskProgress", () => {
  it("counts required tasks only, so guidance and optional tasks never inflate progress", () => {
    expect(
      taskProgress([
        task("a", { done: true }),
        task("b"),
        task("opt", { optional: true, done: true }),
      ]),
    ).toEqual({ done: 1, total: 2 });
  });
});

describe("journeyPosition", () => {
  const keys = ["pre_kickoff", "kickoff", "get_it_working", "make_it_yours"];

  it("places the viewed stage on the rail", () => {
    expect(journeyPosition(keys, "get_it_working")).toEqual({ index: 3, total: 4 });
  });

  it("returns null for a stage that is not on the rail", () => {
    expect(journeyPosition(keys, "closed_won")).toBeNull();
  });
});
