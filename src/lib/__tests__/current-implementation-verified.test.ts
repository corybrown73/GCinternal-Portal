import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { StageGatesPanel } from "@/components/stage-gates-panel";
import type { GateItem } from "@/lib/stage-gates";

/**
 * "Verified" is drawn only where the record supplies it (`GateItem.verified`).
 * The panel labels a done criterion "Done, not verified" when the record says
 * so, and shows no label when the record makes no claim. Nothing here infers
 * verification from a tick.
 */

function gate(id: string, title: string, over: Partial<GateItem> = {}): GateItem {
  return { id, task_key: null, title, status: "done", is_gate: true, party: "internal", ...over };
}

function render(items: GateItem[]) {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(StageGatesPanel, {
        customerId: "c1",
        implementationId: "i1",
        currentStage: null,
        stageGateMode: "advisory",
        items,
        partner: null,
      }),
    ),
  );
}

describe("StageGatesPanel — verified labels", () => {
  it("labels a gate the record proves as Verified", () => {
    const markup = render([gate("g1", "Connection verified", { verified: true })]);
    expect(markup).toContain("Verified");
    expect(markup).not.toContain("Done, not verified");
  });

  it("labels a done gate the record does not prove as Done, not verified", () => {
    const markup = render([gate("g1", "Solution configured", { verified: false })]);
    expect(markup).toContain("Done, not verified");
    expect(markup).not.toMatch(/>Verified</);
  });

  it("shows no verification label when the source does not claim one", () => {
    const markup = render([gate("g1", "Solution configured")]);
    expect(markup).not.toContain("Verified");
    expect(markup).not.toContain("Done, not verified");
  });

  it("never labels an open gate as verified", () => {
    const markup = render([
      gate("g1", "Connection verified", { status: "not_started", verified: true }),
    ]);
    expect(markup).not.toMatch(/>Verified</);
  });
});
