import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { StageGatesPanel } from "@/components/stage-gates-panel";
import type { GateItem } from "@/lib/stage-gates";

/**
 * Focus Mode on a partner stage's criteria. The panel shows only the next open
 * criterion, in the order the stage gives them, with the rest one click away.
 * Done criteria are not the focus; they stay in the full list. With focus off,
 * the panel draws every criterion as it always did.
 */

function gate(id: string, title: string, status: string, verified?: boolean): GateItem {
  return {
    id,
    task_key: null,
    title,
    status,
    is_gate: true,
    party: "internal",
    ...(verified === undefined ? {} : { verified }),
  };
}

const CRITERIA = [
  gate("g1", "Solution configured", "done", true),
  gate("g2", "Connection verified", "not_started"),
  gate("g3", "Roll out prepared", "not_started"),
  gate("g4", "Form signed off", "done", false),
];

function render(items: GateItem[], focus: boolean) {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(StageGatesPanel, {
        customerId: "c1",
        implementationId: "i1",
        currentStage: null,
        stageGateMode: "blocking",
        items,
        partner: null,
        focus,
      }),
    ),
  );
}

describe("StageGatesPanel — focus on the next open criterion", () => {
  it("shows only the first open criterion", () => {
    const markup = render(CRITERIA, true);
    expect(markup).toContain("Connection verified");
    expect(markup).not.toContain("Roll out prepared");
  });

  it("does not show done criteria as the focus", () => {
    const markup = render(CRITERIA, true);
    expect(markup).not.toContain("Solution configured");
    expect(markup).not.toContain("Form signed off");
  });

  it("offers the rest one click away, with the count", () => {
    const markup = render(CRITERIA, true);
    expect(markup).toContain("View all 4 criteria");
    expect(markup).toContain('aria-expanded="false"');
  });

  it("draws every criterion when focus is off, as the stage always did", () => {
    const markup = render(CRITERIA, false);
    expect(markup).toContain("Solution configured");
    expect(markup).toContain("Connection verified");
    expect(markup).toContain("Roll out prepared");
    expect(markup).toContain("Form signed off");
    expect(markup).not.toContain("View all 4 criteria");
  });

  it("shows no focused criterion once every criterion is done", () => {
    const markup = render(
      [gate("g1", "Solution configured", "done", true), gate("g2", "Form signed off", "done")],
      true,
    );
    expect(markup).not.toContain("Solution configured");
    expect(markup).not.toContain("Form signed off");
  });

  it("keeps the verification label truthful for done criteria in the full list", () => {
    const markup = render(CRITERIA, false);
    expect(markup).toContain("Verified");
    expect(markup).toContain("Done, not verified");
  });
});
