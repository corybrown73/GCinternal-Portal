import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SharedPlanView } from "@/components/shared-plan-view";
import type { SharedPlan } from "@/lib/shared-plan";

/**
 * The shared plan's promise sections, rendered to HTML. Checks the order and
 * the grouping: what is owed comes first, and done and withdrawn promises sit
 * under History. The same DTO feeds the live page, its PDF and the snapshot.
 */

function planWith(commitments: object[]): SharedPlan {
  return {
    customer_name: "Northwind Fleet",
    implementation_name: "Field inspections rollout",
    stage_label: "Complete",
    stage_intent: null,
    target_launch_date: null,
    your_tasks: [],
    our_commitments: commitments,
    milestones: [],
    documents: [],
    contact: null,
    viewer: { kind: "preview", can_complete: false },
    conversation: { messages: [], can_post: false, participants: [] },
  } as unknown as SharedPlan;
}

const promise = (description: string, state: string, status_label: string, over: object = {}) => ({
  description,
  due_date: "2026-03-01",
  committed_to: "customer",
  done: state === "completed",
  state,
  status_label,
  overdue: false,
  ...over,
});

const html = (plan: SharedPlan) => renderToStaticMarkup(createElement(SharedPlanView, { plan }));

describe("the shared plan's promises, as rendered", () => {
  const markup = html(
    planWith([
      promise("Shipped the guide", "completed", "Done"),
      promise("Deliver the report", "outstanding", "Renegotiated — Outstanding"),
      promise("Dropped the paper process", "withdrawn", "Withdrawn"),
      promise("Confirm the window", "outstanding", "Missed — Outstanding", { overdue: true }),
    ]),
  );

  it("shows what is owed under 'What we owe you', before History", () => {
    const owed = markup.indexOf("What we owe you");
    const history = markup.indexOf(">History<");
    expect(owed).toBeGreaterThan(-1);
    expect(history).toBeGreaterThan(owed);
    expect(markup.indexOf("Deliver the report")).toBeGreaterThan(owed);
    expect(markup.indexOf("Deliver the report")).toBeLessThan(history);
    expect(markup.indexOf("Confirm the window")).toBeLessThan(history);
  });

  it("keeps renegotiated and missed promises in what is owed, with their status", () => {
    const owed = markup.slice(markup.indexOf("What we owe you"), markup.indexOf(">History<"));
    expect(owed).toContain("Renegotiated — Outstanding");
    expect(owed).toContain("Missed — Outstanding");
    expect(owed).toContain("Overdue");
  });

  it("puts done and withdrawn promises under History, and never in what is owed", () => {
    const owed = markup.slice(markup.indexOf("What we owe you"), markup.indexOf(">History<"));
    const history = markup.slice(markup.indexOf(">History<"));
    expect(history).toContain("Shipped the guide");
    expect(history).toContain("Dropped the paper process");
    expect(owed).not.toContain("Shipped the guide");
    expect(owed).not.toContain("Dropped the paper process");
  });

  it("does not show a History section when nothing has been delivered or withdrawn", () => {
    const plain = html(planWith([promise("Deliver the report", "outstanding", "Outstanding")]));
    expect(plain).not.toContain(">History<");
    expect(plain).toContain("Deliver the report");
  });

  it("says plainly when nothing is owed", () => {
    const none = html(planWith([promise("Shipped the guide", "completed", "Done")]));
    expect(none).toContain("Nothing is owed to you right now.");
  });
});
