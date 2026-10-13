import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { StageGatesPanel } from "@/components/stage-gates-panel";
import { gateVerified } from "@/lib/partner-journey";
import type { GateItem } from "@/lib/stage-gates";

/**
 * "Verified" means a gate record proves it: a criterion the partner order marks
 * as a gate, that is done and has a completion time. A done task that is not a
 * gate, or a gate with no completion time, is only "Done". The panel must never
 * label a guidance check or an ordinary task as verified.
 */

describe("gateVerified", () => {
  const done = { status: "done", completedAt: "2026-10-01T12:00:00Z" };

  it("is verified for a done gate with a completion time", () => {
    expect(gateVerified({ isGate: true, ...done })).toBe(true);
  });

  it("is not verified for a done task that is not a gate", () => {
    expect(gateVerified({ isGate: false, ...done })).toBe(false);
  });

  it("is not verified for a gate that is not done", () => {
    expect(gateVerified({ isGate: true, status: "in_progress", completedAt: null })).toBe(false);
  });

  it("is not verified for a done gate with no completion time", () => {
    expect(gateVerified({ isGate: true, status: "done", completedAt: null })).toBe(false);
  });

  it("is not verified for a skipped gate, even with a completion time", () => {
    expect(
      gateVerified({ isGate: true, status: "skipped", completedAt: "2026-10-01T12:00:00Z" }),
    ).toBe(false);
  });
});

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
