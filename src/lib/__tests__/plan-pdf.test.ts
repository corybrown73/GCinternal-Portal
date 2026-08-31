import { describe, expect, it } from "vitest";

import { renderPlanPdf } from "../server/plan-pdf";
import type { SharedPlan } from "../shared-plan";

const base: SharedPlan = {
  customer_name: "Northwind Fleet Services",
  implementation_name: "Field inspections rollout",
  stage_label: "Build",
  stage_intent: "We are configuring the forms and wiring the nightly sync.",
  target_launch_date: "2026-04-01",
  your_tasks: [],
  our_commitments: [],
  milestones: [],
  documents: [],
  contact: { name: "Dana Okafor", email: "dana@gocanvas.test" },
  viewer: { kind: "grant", can_complete: true, read_only: false } as SharedPlan["viewer"],
  conversation: { messages: [], participants: [], can_post: true } as SharedPlan["conversation"],
  generated_at: "2026-08-31T14:00:00.000Z",
};

const task = (over: Partial<SharedPlan["your_tasks"][number]>) =>
  ({
    ref: "t1",
    title: "Send three sample export files",
    detail: null,
    status: "open",
    due_date: null,
    bucket: "this_week",
    owner: "you",
    can_complete: true,
    blocked_by: [],
    completed_by: null,
    completed_at: null,
    comments: [],
    files: [],
    ...over,
  }) as SharedPlan["your_tasks"][number];

const head = (bytes: Uint8Array) => Buffer.from(bytes.slice(0, 5)).toString();

describe("renderPlanPdf", () => {
  it("renders a plan with nothing in it rather than throwing", async () => {
    expect(head(await renderPlanPdf(base, "https://example.test/plan/x"))).toBe("%PDF-");
  });

  it("keeps flowing onto new pages instead of writing off the bottom", async () => {
    const many = {
      ...base,
      your_tasks: Array.from({ length: 90 }, (_, i) =>
        task({ ref: `t${i}`, title: `Task ${i} — ${"detail ".repeat(12)}` }),
      ),
    };
    const bytes = await renderPlanPdf(many, "https://example.test/plan/x");
    const pages = (
      Buffer.from(bytes)
        .toString("latin1")
        .match(/\/Type\s*\/Page[^s]/g) ?? []
    ).length;
    expect(pages).toBeGreaterThan(2);
  });

  it("separates what is still open from what is already done", async () => {
    const bytes = await renderPlanPdf(
      {
        ...base,
        your_tasks: [
          task({ ref: "a", title: "Still open" }),
          task({
            ref: "b",
            title: "Finished",
            status: "done",
            bucket: "done",
            completed_by: "Sue Barratt",
            completed_at: "2026-03-02T00:00:00Z",
          }),
        ],
      },
      "https://example.test/plan/x",
    );
    const text = Buffer.from(bytes).toString("latin1");
    expect(text).toContain("Already done");
    expect(head(bytes)).toBe("%PDF-");
  });

  it("writes marks the built-in font can actually draw", async () => {
    // jsPDF's Helvetica is WinAnsi. The first version used U+2610/U+2611 and
    // every checkbox in the document came out as "&".
    const bytes = await renderPlanPdf(
      { ...base, your_tasks: [task({ ref: "a", title: "Still open" })] },
      "https://example.test/plan/x",
    );
    const text = Buffer.from(bytes).toString("latin1");
    expect(text).toContain("[ ]");
    expect(text).not.toContain("\u2610");
    expect(text).not.toContain("\u2611");
  });

  it("carries the live link, because the PDF is a snapshot and the page is not", async () => {
    const bytes = await renderPlanPdf(base, "https://example.test/plan/tok123");
    expect(Buffer.from(bytes).toString("latin1")).toContain("plan/tok123");
  });
});
