import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { StageGatesPanel } from "@/components/stage-gates-panel";
import { LIFECYCLE_STAGES, type LifecycleStageId } from "@/lib/lifecycle";
import type { PartnerMoveView } from "@/lib/partner-implementation";
import { gateOutcome, partnerMoveBlocked, stageGateStatus, type GateItem } from "@/lib/stage-gates";

/**
 * The gates panel's move control. A partner stage's blocking gates are mandatory:
 * the database refuses the move while any criterion is open, so the panel must not
 * offer an override. Standard stages keep the override they always had.
 */

function gate(id: string, title: string, status = "not_started"): GateItem {
  return { id, task_key: null, title, status, is_gate: true, party: "internal" };
}

const OPEN = [gate("g1", "Solution configured"), gate("g2", "Connection verified")];
const partnerNext: PartnerMoveView = {
  currentLabel: "Partner Setup & Connection",
  next: {
    key: "form_finalisation",
    position: 4,
    label: "Form Finalisation & Data Readiness",
    description: "TIS leads GoCanvas form and dataset preparation.",
    visibility: "customer",
    legacyDealStages: [],
  } as PartnerMoveView["next"] & object,
  handoff: false,
};

function panel(
  items: GateItem[],
  stageGateMode: string,
  partner: PartnerMoveView | null,
  currentStage: LifecycleStageId | null = null,
) {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(StageGatesPanel, {
        customerId: "c1",
        implementationId: "i1",
        currentStage,
        stageGateMode,
        items,
        partner,
      }),
    ),
  );
}

describe("partnerMoveBlocked — the partner rule the database enforces", () => {
  it("blocks a move past open criteria on a blocking partner stage", () => {
    expect(partnerMoveBlocked(stageGateStatus(OPEN), "blocking", true)).toBe(true);
  });

  it("does not block when the criteria are met, the stage is advisory, or there is no move", () => {
    const done = [gate("g1", "a", "done"), gate("g2", "b", "done")];
    expect(partnerMoveBlocked(stageGateStatus(done), "blocking", true)).toBe(false);
    expect(partnerMoveBlocked(stageGateStatus(OPEN), "advisory", true)).toBe(false);
    expect(partnerMoveBlocked(stageGateStatus(OPEN), "blocking", false)).toBe(false);
  });
});

describe("the standard override is unchanged", () => {
  it("a blocking standard stage with open criteria still offers the reasoned override", () => {
    expect(gateOutcome(stageGateStatus(OPEN), "blocking")).toBe("blocking_gap");
  });
});

describe("StageGatesPanel for a partner stage", () => {
  it("offers no override on a blocking partner stage with open criteria, and says why", () => {
    const markup = panel(OPEN, "blocking", partnerNext);
    expect(markup).toContain("This move cannot be overridden");
    expect(markup).not.toMatch(/Override to advance|Advance anyway|Move to Form Finalisation/);
  });

  it("offers the ordinary move on a blocking partner stage once its criteria are met", () => {
    const done = [gate("g1", "a", "done"), gate("g2", "b", "done")];
    const markup = panel(done, "blocking", partnerNext);
    expect(markup).toContain("Move to Form Finalisation &amp; Data Readiness");
    expect(markup).not.toContain("cannot be overridden");
  });

  it("keeps the advisory partner stage's move, with its gap, as it was", () => {
    const markup = panel(OPEN, "advisory", partnerNext);
    expect(markup).toContain("Advance anyway");
    expect(markup).not.toContain("cannot be overridden");
  });

  it("offers a standard blocking stage its reasoned override, unchanged", () => {
    const markup = panel(OPEN, "blocking", null, LIFECYCLE_STAGES[0]!.id);
    expect(markup).toContain("Override to advance");
    expect(markup).not.toContain("cannot be overridden");
  });
});
