import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  JourneyBar,
  KeyDatesCard,
  OwnershipCard,
  ProgressLine,
  ToolsCard,
} from "@/components/current-implementation-context";
import type { Customer360 } from "@/lib/hub-types";

/**
 * The right-hand column and the journey bar of Current Implementation, rendered
 * to HTML. These check what the page shows: the focused task is not repeated
 * on the right, a partner's own waiting statement replaces the standard list,
 * the tier's expected go-live appears only on the standard plan, plan dates are
 * offered only to a standard implementation, and the journey bar states where
 * the implementation is.
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

describe("OwnershipCard", () => {
  const base = {
    owner: "Dana",
    ball: { who: "customer" as const, detail: "Waiting for the customer's reply" },
    healthWhy: null,
  };

  it("names the owner and who holds the ball", () => {
    const markup = renderToStaticMarkup(
      createElement(OwnershipCard, { ...base, waiting: [], waitingText: null }),
    );
    expect(markup).toContain("Dana");
    expect(markup).toContain("With the customer");
  });

  it("shows the standard waiting list when there is no partner statement", () => {
    const markup = renderToStaticMarkup(
      createElement(OwnershipCard, {
        ...base,
        waiting: [{ who: "gocanvas", what: "Send the form library" }],
        waitingText: null,
      }),
    );
    expect(markup).toContain("GoCanvas:");
    expect(markup).toContain("Send the form library");
  });

  it("shows a partner's own waiting statement in place of the standard list", () => {
    const markup = renderToStaticMarkup(
      createElement(OwnershipCard, {
        ...base,
        waiting: [{ who: "gocanvas", what: "Send the form library" }],
        waitingText: "Waiting on the partner's data set",
      }),
    );
    expect(markup).toContain("Waiting on the partner&#x27;s data set");
    expect(markup).not.toContain("Send the form library");
  });

  it("says nothing is waiting when neither source has an item", () => {
    const markup = renderToStaticMarkup(
      createElement(OwnershipCard, {
        owner: null,
        ball: null,
        waiting: [],
        waitingText: null,
        healthWhy: null,
      }),
    );
    expect(markup).toContain("Nobody yet");
    expect(markup).toContain("Nothing on anyone&#x27;s desk");
    expect(markup).not.toContain("With the customer");
  });

  it("shows the reason only when the implementation is genuinely flagged", () => {
    const flagged = renderToStaticMarkup(
      createElement(OwnershipCard, {
        ...base,
        waiting: [],
        waitingText: null,
        healthWhy: "2 overdue commitments",
      }),
    );
    expect(flagged).toContain("Why it is flagged");
    expect(flagged).toContain("2 overdue commitments");
    const clear = renderToStaticMarkup(
      createElement(OwnershipCard, { ...base, waiting: [], waitingText: null }),
    );
    expect(clear).not.toContain("Why it is flagged");
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

describe("ToolsCard", () => {
  const noop = () => {};
  const dashboard = null;

  it("offers plan dates to a standard implementation", () => {
    const markup = renderToStaticMarkup(
      createElement(ToolsCard, {
        open: null,
        onOpen: noop,
        showPlanDates: true,
        parking: { openCount: 0, expanded: false, onToggle: noop },
        dashboardLink: dashboard,
      }),
    );
    expect(markup).toContain("Adjust plan dates");
    expect(markup).toContain("Parking Lot");
  });

  it("omits plan dates and the Parking Lot for a partner, keeping the update actions", () => {
    const markup = renderToStaticMarkup(
      createElement(ToolsCard, {
        open: null,
        onOpen: noop,
        showPlanDates: false,
        parking: null,
        dashboardLink: dashboard,
      }),
    );
    expect(markup).not.toContain("Adjust plan dates");
    expect(markup).not.toContain("Parking Lot");
    expect(markup).toContain("Update from a customer meeting");
    expect(markup).toContain("Add an implementation update");
  });

  it("states the Parking Lot count and whether its editor is open", () => {
    const none = renderToStaticMarkup(
      createElement(ToolsCard, {
        open: null,
        onOpen: noop,
        showPlanDates: true,
        parking: { openCount: 0, expanded: false, onToggle: noop },
        dashboardLink: dashboard,
      }),
    );
    expect(none).toContain("none open");
    expect(none).toContain('aria-expanded="false"');

    const some = renderToStaticMarkup(
      createElement(ToolsCard, {
        open: null,
        onOpen: noop,
        showPlanDates: true,
        parking: { openCount: 5, expanded: true, onToggle: noop },
        dashboardLink: dashboard,
      }),
    );
    expect(some).toContain("5 open on our side");
    expect(some).toContain('aria-expanded="true"');
  });

  it("marks the open panel's row as expanded", () => {
    const markup = renderToStaticMarkup(
      createElement(ToolsCard, {
        open: "update",
        onOpen: noop,
        showPlanDates: true,
        parking: null,
        dashboardLink: dashboard,
      }),
    );
    expect(markup).toMatch(/aria-expanded="true"[^>]*>Add an implementation update/);
  });
});

describe("JourneyBar", () => {
  const noop = () => {};

  it("states where the implementation is, with the full journey one click away", () => {
    const markup = renderToStaticMarkup(
      createElement(JourneyBar, {
        position: { index: 3, total: 6 },
        fallbackLabel: "Before the journey starts",
        expanded: false,
        onToggle: noop,
        skip: null,
      }),
    );
    expect(markup).toContain("Stage 3 of 6");
    expect(markup).not.toContain("Before the journey starts");
    expect(markup).toContain("View full journey");
    expect(markup).toContain('aria-expanded="false"');
  });

  it("offers to hide the journey while it is expanded", () => {
    const markup = renderToStaticMarkup(
      createElement(JourneyBar, {
        position: { index: 3, total: 6 },
        fallbackLabel: "Before the journey starts",
        expanded: true,
        onToggle: noop,
        skip: null,
      }),
    );
    expect(markup).toContain("Hide full journey");
    expect(markup).toContain('aria-expanded="true"');
  });

  it("says so plainly before the journey starts", () => {
    const markup = renderToStaticMarkup(
      createElement(JourneyBar, {
        position: null,
        fallbackLabel: "Before the journey starts",
        expanded: false,
        onToggle: noop,
        skip: null,
      }),
    );
    expect(markup).toContain("Before the journey starts");
  });

  it("keeps the skip control on the bar, not behind the expanded journey", () => {
    const markup = renderToStaticMarkup(
      createElement(JourneyBar, {
        position: { index: 2, total: 6 },
        fallbackLabel: "Before the journey starts",
        expanded: false,
        onToggle: noop,
        skip: createElement("span", null, "Skip to Graduation…"),
      }),
    );
    expect(markup).toContain("Skip to Graduation…");
  });
});

describe("ProgressLine", () => {
  it("shows actual completion as a count and a proportional bar", () => {
    const markup = renderToStaticMarkup(
      createElement(ProgressLine, { done: 3, total: 4, label: "tasks done" }),
    );
    expect(markup).toContain("3 of 4 tasks done");
    expect(markup).toContain("width:75%");
  });

  it("never divides by zero for a stage with no tasks", () => {
    const markup = renderToStaticMarkup(
      createElement(ProgressLine, { done: 0, total: 0, label: "tasks done" }),
    );
    expect(markup).toContain("width:0%");
  });
});
