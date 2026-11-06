import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/lib/training.functions", () => ({
  getTrainingPlan: async () => ({ enabled: false }),
  addTrainingNeed: async () => "",
  editTrainingNeed: async () => null,
  recordTrainingDelivery: async () => null,
  recordTrainingReadiness: async () => null,
  setTrainingNeedArchived: async () => null,
}));

import { TrainingPlanTab } from "@/components/training-plan-tab";
import { TrainingReadinessStrip } from "@/components/training-readiness-strip";

/**
 * The Training & Readiness tab, rendered to HTML from a seeded cache. These check what a
 * person reads: delivered and shown are separate lines, a responsibility without its
 * source reads as needing confirmation (never a default), a purchased training item with
 * no need is offered as a pre-fill, and nothing is offered to someone who may not change it.
 */

const IMPL = "d0000000-0000-4000-8000-0000000000e1";

const need = (over: Record<string, unknown> = {}) => ({
  id: "a7000000-0000-4000-8000-0000000000e1",
  implementationId: IMPL,
  topic: "Form basics",
  audience: "Crew leads",
  outcome: "Builds and publishes a form",
  method: "session",
  responsibility: null,
  responsibilitySource: null,
  sowQuote: null,
  purchasedServiceId: null,
  solutionComponentId: null,
  adoptionAreaId: null,
  deliveredAt: "2026-11-02",
  demonstratedStatus: "not_yet",
  demonstratedEvidenceId: null,
  nextStep: null,
  archivedAt: null,
  updatedAt: "2026-11-02T10:00:00Z",
  ...over,
});

function plan(over: Record<string, unknown> = {}) {
  const needs = (over["needs"] as ReturnType<typeof need>[] | undefined) ?? [need()];
  return {
    enabled: true,
    needs,
    hasDeal: true,
    canEdit: false,
    evidence: [],
    coverage: {
      topics: needs.length,
      delivered: needs.filter((n) => n.deliveredAt).length,
      demonstrated: needs.filter((n) => n.demonstratedStatus === "demonstrated").length,
      practiceNeeded: 0,
      needsConfirmation: needs.filter((n) => !n.responsibility),
      responsibility: { gocanvas: 0, customer: 0, partner: 0 },
      uncovered: [],
    },
    ...over,
  };
}

function render(seed: unknown, node: (impl: string) => ReturnType<typeof createElement>) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(["training-plan", IMPL], seed);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, node(IMPL)));
}

describe("the Training & Readiness tab", () => {
  it("says the feature is off when it is off", () => {
    const html = render({ enabled: false }, (id) =>
      createElement(TrainingPlanTab, { implementationId: id }),
    );
    expect(html).toContain("not turned on for this Hub yet");
  });

  it("shows delivered and customer readiness on separate lines", () => {
    const html = render(plan(), (id) => createElement(TrainingPlanTab, { implementationId: id }));
    expect(html).toContain("Delivered 2026-11-02");
    expect(html).toContain("Not yet shown");
    expect(html).not.toMatch(/Delivered 2026-11-02[^<]*Demonstrated/);
  });

  it("a need with no confirmed responsibility reads as needing confirmation, not as GoCanvas", () => {
    const html = render(plan(), (id) => createElement(TrainingPlanTab, { implementationId: id }));
    expect(html).toContain("Needs confirmation");
    expect(html).not.toContain("GoCanvas (");
  });

  it("a responsibility from the SOW shows its wording", () => {
    const n = need({
      responsibility: "gocanvas",
      responsibilitySource: "sow",
      sowQuote: "GoCanvas will deliver two live training sessions.",
    });
    const html = render(plan({ needs: [n] }), (id) =>
      createElement(TrainingPlanTab, { implementationId: id }),
    );
    expect(html).toContain("GoCanvas (from the SOW)");
    expect(html).toContain("GoCanvas will deliver two live training sessions.");
  });

  it("offers a purchased training item with no need as a pre-fill, only to someone who may change it", () => {
    const withUncovered = (canEdit: boolean) =>
      plan({
        canEdit,
        coverage: {
          ...plan().coverage,
          uncovered: [{ id: "svc-train", kind: "training", name: "Training" }],
        },
      });
    const asEditor = render(withUncovered(true), (id) =>
      createElement(TrainingPlanTab, { implementationId: id }),
    );
    expect(asEditor).toContain("Purchased training with no need yet");
    expect(asEditor).toContain("Add as a training need");
    const asViewer = render(withUncovered(false), (id) =>
      createElement(TrainingPlanTab, { implementationId: id }),
    );
    expect(asViewer).toContain("Purchased training with no need yet");
    expect(asViewer).not.toContain("Add as a training need");
  });

  it("does not offer changes to someone who may not make them", () => {
    const html = render(plan({ canEdit: false }), (id) =>
      createElement(TrainingPlanTab, { implementationId: id }),
    );
    expect(html).not.toContain("Add a training need");
    expect(html).not.toContain("Record readiness");
  });

  it("offers the changes to someone who may make them", () => {
    const html = render(plan({ canEdit: true }), (id) =>
      createElement(TrainingPlanTab, { implementationId: id }),
    );
    expect(html).toContain("Add a training need");
    expect(html).toContain("Record delivery");
    expect(html).toContain("Record readiness");
  });
});

describe("the readiness line on Current Implementation", () => {
  it("shows nothing while the feature is off", () => {
    const html = render({ enabled: false }, (id) =>
      createElement(TrainingReadinessStrip, { customerId: "c1", implementationId: id }),
    );
    expect(html).toBe("");
  });

  it("states the counts, and says what is still to confirm", () => {
    const html = render(plan(), (id) =>
      createElement(TrainingReadinessStrip, { customerId: "c1", implementationId: id }),
    );
    expect(html).toContain("1 topics");
    expect(html).toContain("1 delivered");
    expect(html).toContain("0 shown");
    expect(html).toContain("1 responsibility to confirm");
    expect(html).toContain("Open Training &amp; Readiness");
  });
});
