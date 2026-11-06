import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "manager" as string, ws: null as unknown }));

vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  useProfile: () => ({
    session: null,
    profile: { id: "p-1", role: state.role },
    loading: false,
  }),
}));

vi.mock("@/lib/complete-solutions-view", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/complete-solutions-view")>()),
  useCompleteSolutions: () => state.ws,
}));

import { SolutionDetail } from "@/components/complete-solutions-workspace";
import { SolutionsSummary } from "@/components/solutions-summary";
import { SolutionsTab } from "@/components/solutions-tab";
import { readIntake } from "@/lib/intake-answers";

/**
 * The one Solutions view, rendered to HTML from seeded data. These check what a person
 * reads: each purchased solution appears once with its lifecycle, its delivery detail is
 * there to expand, requested solutions come under their own heading, and the actions are
 * offered only to someone who may make them.
 */

const IMPL = "d0000000-0000-4000-8000-0000000000e1";
const DEAL = "00000000-0000-4000-8000-00000000e001";

const services = [
  {
    id: "svc-inspect",
    kind: "custom_pdf",
    name: "Inspection report",
    phase: 1,
    launch_critical: true,
  },
  {
    id: "svc-sync",
    kind: "integration",
    name: "QuickBooks sync",
    phase: 2,
    tier: 2,
    ball: { who: "blocked_customer" },
  },
];

const completed = { "svc-inspect:kickoff": "2026-10-01", "svc-inspect:build": "2026-10-05" };

function deal() {
  const intake = { timeline: { services, completed, holidays: [] } };
  // readIntake falls back to an empty intake on a bad shape; this fixture must parse.
  expect(readIntake(intake).timeline.services).toHaveLength(2);
  return { account: { id: DEAL, intake, am_owner_id: null, name: "Probe" } };
}

const component = (over: Record<string, unknown> = {}) => ({
  id: "c-1",
  solutionId: "sol-1",
  category: "forms",
  estimateWeeks: null,
  targetChangeReason: null,
  startCondition: null,
  latestUpdateAt: null,
  technicalSolutionId: null,
  sowQuote: null,
  formBuilt: false,
  customerApproved: false,
  submissionCount: null,
  submissionCheckedOn: null,
  customerUsageConfirmedOn: null,
  name: "Inspection form",
  status: "being_built",
  priority: "needed_for_go_live",
  integrationType: null,
  targetDate: null,
  originalTargetDate: null,
  blocker: null,
  latestUpdate: null,
  nextAction: null,
  archived: false,
  updatedAt: "2026-10-20T09:00:00Z",
  dependsOn: [],
  ...over,
});

const linked = {
  id: "sol-1",
  implementationId: IMPL,
  title: "Inspections",
  scope: "purchased",
  source: "manual",
  purchasedServiceId: "svc-inspect",
  priority: "needed_for_go_live",
  status: "in_progress",
  readinessConfirmed: "not_ready",
  readinessSuggested: { readiness: "not_ready", reasons: [] },
  targetDate: null,
  originalTargetDate: null,
  startCondition: null,
  sowQuote: null,
  nextAction: "Confirm the logo file",
  archived: false,
  updatedAt: "2026-10-20T09:00:00Z",
  components: [
    component({
      id: "c-1",
      name: "Inspection form",
      status: "waiting",
      blocker: "Waiting for the logo",
    }),
    component({ id: "c-2", name: "Dispatch sync", status: "complete" }),
  ],
};

const requested = {
  id: "sol-2",
  implementationId: IMPL,
  title: "Photo library (requested)",
  scope: "requested",
  source: "manual",
  purchasedServiceId: null,
  priority: "planned_for_later",
  status: "not_started",
  readinessConfirmed: "not_ready",
  readinessSuggested: { readiness: "not_ready", reasons: [] },
  targetDate: null,
  originalTargetDate: null,
  startCondition: null,
  sowQuote: null,
  nextAction: null,
  archived: false,
  updatedAt: "2026-10-20T09:00:00Z",
  components: [],
};

function client(canEdit: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(["deal", DEAL], deal());
  qc.setQueryData(["team-options"], []);
  qc.setQueryData(["complete-solutions", IMPL], {
    solutions: [linked, requested],
    canEdit,
    purchase: { hasRecord: true, solutionsWithoutRecord: [], recordsWithoutSolution: [] },
  });
  return qc;
}

function renderTab(canEdit: boolean) {
  state.ws = okWs(canEdit);
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: client(canEdit) },
      createElement(SolutionsTab, { implementationId: IMPL, dealId: DEAL }),
    ),
  );
}

function renderDetail(editable: boolean) {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: client(editable) },
      createElement(SolutionDetail, {
        solution: linked as never,
        implementationId: IMPL,
        editable,
        all: [linked as never],
      }),
    ),
  );
}

/** The delivery read's result: what the hook returns for a read that succeeded, or was refused. */
function okWs(canEdit: boolean) {
  return {
    isPending: false,
    isError: false,
    error: null,
    data: {
      solutions: [linked, requested],
      canEdit,
      purchase: { hasRecord: true, solutionsWithoutRecord: [], recordsWithoutSolution: [] },
    },
  };
}

/** The delivery read refused, as it does while complete solutions are off. */
function refusedWs() {
  return {
    isPending: false,
    isError: true,
    error: new Error("Complete solutions are not turned on for this Hub yet."),
    data: undefined,
  };
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

beforeEach(() => {
  state.role = "manager";
});

describe("the unified Solutions view", () => {
  it("lists each purchased solution once, with its lifecycle from the purchase record", () => {
    const html = renderTab(true);
    expect(count(html, "Inspection report")).toBe(1);
    expect(count(html, "QuickBooks sync")).toBe(1);
    expect(html).toContain("Accept — customer tests");
    expect(html).toContain("Blocked — customer");
  });

  it("shows one purchased-solutions list, not a second one", () => {
    const html = renderTab(true);
    expect(count(html, 'aria-label="Purchased solutions"')).toBe(1);
  });

  it("each purchased solution expands to its linked delivery detail, and says when there is none", () => {
    const html = renderTab(true);
    expect(count(html, "Show the delivery detail")).toBe(2);
    expect(html).toContain("1 component open · 1 blocked");
    expect(html).toContain("No delivery record yet");
  });

  it("a requested solution sits under its own heading, apart from the purchased list", () => {
    const html = renderTab(true);
    expect(html).toContain("Requested and other solutions");
    expect(html).toContain("Photo library (requested)");
    expect(count(html, ">Photo library (requested)<")).toBe(1);
  });

  it("offers the add action to someone who may change the solutions", () => {
    expect(renderTab(true)).toContain("Add a solution");
  });

  it("does not offer the add action to someone who may not change them", () => {
    state.role = "customer";
    expect(renderTab(false)).not.toContain("Add a solution");
  });
});

describe("while complete solutions are off", () => {
  it("the purchased list still shows, with its lifecycle, and says the delivery detail is not on", () => {
    state.ws = refusedWs();
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: client(false) },
        createElement(SolutionsTab, { implementationId: IMPL, dealId: DEAL }),
      ),
    );
    expect(count(html, "Inspection report")).toBe(1);
    expect(html).toContain("Accept — customer tests");
    expect(html).toContain("· Not turned on");
    expect(html).not.toContain("Add a solution");
    expect(html).not.toContain("Requested and other solutions");
  });
});

describe("the linked delivery detail", () => {
  it("shows the readiness, the next action, the components and the blocker", () => {
    const html = renderDetail(true);
    expect(html).toContain("Solution readiness: Not ready");
    expect(html).toContain("Confirm the logo file");
    expect(html).toContain("Inspection form");
    expect(html).toContain("Waiting for the logo");
    expect(html).toContain("Add a component");
  });

  it("offers no change to someone who may not make one", () => {
    const html = renderDetail(false);
    expect(html).not.toContain("Add a component");
    expect(html).not.toContain("Archive this solution");
  });
});

describe("the Current Implementation summary", () => {
  it("states progress, the launch-critical work outstanding, and the genuine blockers, with a link to the tab", () => {
    state.ws = okWs(true);
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: client(true) },
        createElement(SolutionsSummary, {
          customerId: "c-1",
          implementationId: IMPL,
          dealId: DEAL,
        }),
      ),
    );
    expect(html).toContain("0 of 2");
    expect(html).toContain("accepted");
    expect(html).toContain("Launch-critical and not yet accepted: Inspection report");
    expect(html).toContain("QuickBooks sync: blocked by the customer");
    expect(html).toContain("Open Solutions");
  });
});
