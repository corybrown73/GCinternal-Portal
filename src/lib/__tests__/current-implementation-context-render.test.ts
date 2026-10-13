import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  KeyDatesCard,
  NextActionCard,
  ParkingLotSummary,
  QuickActions,
} from "@/components/current-implementation-context";
import type { Customer360 } from "@/lib/hub-types";

/**
 * The right-hand column of Current Implementation, rendered to HTML. These check
 * what the page shows for each case: a partner's own waiting statement replaces
 * the standard list, the tier's expected go-live appears only where the plan has
 * one, the parking lot states its open items, and plan dates are offered only
 * to a standard implementation.
 */

type Impl = NonNullable<Customer360["implementation"]>;

function impl(over: Record<string, unknown> = {}): Impl {
  return {
    dates: { tier_expected: "2026-11-02", go_live: null },
    complete_outcome: null,
    target_changes: [],
    ...over,
  } as unknown as Impl;
}

function withQuery(node: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client: new QueryClient() }, node),
  );
}

describe("NextActionCard", () => {
  const base = {
    nextAction: "Confirm the Roll Out date",
    owner: "Dana",
    ball: { who: "customer" as const, detail: "Waiting for the customer's reply" },
    healthWhy: null,
  };

  it("shows the standard waiting list when there is no partner statement", () => {
    const markup = withQuery(
      createElement(NextActionCard, {
        ...base,
        waiting: [{ who: "gocanvas", what: "Send the form library" }],
        waitingText: null,
      }),
    );
    expect(markup).toContain("GoCanvas:");
    expect(markup).toContain("Send the form library");
  });

  it("shows a partner's own waiting statement in place of the standard list", () => {
    const markup = withQuery(
      createElement(NextActionCard, {
        ...base,
        waiting: [{ who: "gocanvas", what: "Send the form library" }],
        waitingText: "Waiting on the partner's data set",
      }),
    );
    expect(markup).toContain("Waiting on the partner&#x27;s data set");
    expect(markup).not.toContain("Send the form library");
  });

  it("says nothing is waiting when neither source has an item", () => {
    const markup = withQuery(
      createElement(NextActionCard, { ...base, waiting: [], waitingText: null, ball: null }),
    );
    expect(markup).toContain("Nothing on anyone&#x27;s desk");
    expect(markup).not.toContain("With the customer");
  });
});

describe("KeyDatesCard", () => {
  const props = {
    customerId: "c1",
    next: null,
  };

  it("shows the tier's expected go-live on the standard plan", () => {
    const markup = withQuery(
      createElement(KeyDatesCard, { ...props, impl: impl(), showTierExpected: true }),
    );
    expect(markup).toContain("Tier expected");
  });

  it("hides the tier's expected go-live for a partner, even when a date is stored", () => {
    const markup = withQuery(
      createElement(KeyDatesCard, { ...props, impl: impl(), showTierExpected: false }),
    );
    expect(markup).not.toContain("Tier expected");
  });

  it("shows the recorded go-live whichever plan it is", () => {
    const markup = withQuery(
      createElement(KeyDatesCard, {
        ...props,
        impl: impl({ dates: { tier_expected: null, go_live: "2026-10-20" } }),
        showTierExpected: false,
      }),
    );
    expect(markup).toContain("Went live");
  });

  it("shows the outcome once the implementation is complete", () => {
    const markup = withQuery(
      createElement(KeyDatesCard, {
        ...props,
        impl: impl({ complete_outcome: "proven" }),
        showTierExpected: true,
      }),
    );
    expect(markup).toContain("Proven");
  });

  it("shows the next dated item beside the others", () => {
    const markup = withQuery(
      createElement(KeyDatesCard, {
        ...props,
        impl: impl(),
        next: { label: "Kickoff call", detail: "Mon, Oct 19" },
        showTierExpected: true,
      }),
    );
    expect(markup).toContain("Kickoff call");
    expect(markup).toContain("Mon, Oct 19");
  });
});

describe("ParkingLotSummary", () => {
  it("states that nothing is open on our side when the lot is empty", () => {
    const markup = renderToStaticMarkup(
      createElement(ParkingLotSummary, {
        openCount: 0,
        items: [],
        open: false,
        onToggle: () => {},
      }),
    );
    expect(markup).toContain("Nothing open on our side");
    expect(markup).toContain("Manage the parking lot");
  });

  it("lists up to three open items and counts the rest", () => {
    const items = [1, 2, 3].map((n) => ({ id: `p${n}`, request: `Request ${n}` }));
    const markup = renderToStaticMarkup(
      createElement(ParkingLotSummary, { openCount: 5, items, open: false, onToggle: () => {} }),
    );
    expect(markup).toContain("5 open on our side");
    expect(markup).toContain("Request 3");
    expect(markup).toContain("+2 more in the lot");
  });

  it("marks the toggle as expanded and renames it while the editor is open", () => {
    const markup = renderToStaticMarkup(
      createElement(ParkingLotSummary, { openCount: 0, items: [], open: true, onToggle: () => {} }),
    );
    expect(markup).toContain("Hide the parking lot");
    expect(markup).toContain('aria-expanded="true"');
  });
});

describe("QuickActions", () => {
  it("offers plan dates to a standard implementation", () => {
    const markup = renderToStaticMarkup(
      createElement(QuickActions, {
        open: null,
        onOpen: () => {},
        showPlanDates: true,
        dashboardLink: null,
      }),
    );
    expect(markup).toContain("Adjust plan dates");
  });

  it("omits plan dates for a partner implementation, keeping the meeting and update actions", () => {
    const markup = renderToStaticMarkup(
      createElement(QuickActions, {
        open: null,
        onOpen: () => {},
        showPlanDates: false,
        dashboardLink: null,
      }),
    );
    expect(markup).not.toContain("Adjust plan dates");
    expect(markup).toContain("Update from a customer meeting");
    expect(markup).toContain("Add an implementation update");
  });
});
