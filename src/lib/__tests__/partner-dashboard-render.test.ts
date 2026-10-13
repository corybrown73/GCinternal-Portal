import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CustomerDashboard } from "@/components/customer-dashboard";
import { StageStepper } from "@/components/stage-stepper";
import { partnerDashboardView, partnerProgress, partnerStepperStages } from "@/lib/partner-journey";
import type { WelcomeView } from "@/lib/welcome";

/**
 * The partner dashboard, rendered for the internal preview and for the customer's
 * link, and the generic stepper that Current Implementation draws the partner
 * stages with. These read the markup: what is on the page, and what is not.
 */

const partnerRecords = {
  currentStage: "partner_setup",
  dealStage: "onboarding_kickoff",
  dealTransitions: [{ to_stage: "closed_won", occurred_at: "2026-03-01T09:00:00Z" }],
  stageInstances: [
    { stage_key: "closed_won_planning", status: "done", gate_mode: "advisory" },
    { stage_key: "partner_setup", status: "active", gate_mode: "blocking" },
    { stage_key: "form_finalisation", status: "pending", gate_mode: "advisory" },
    { stage_key: "pilot", status: "pending", gate_mode: "advisory" },
    { stage_key: "trial_run", status: "pending", gate_mode: "advisory" },
    { stage_key: "roll_out", status: "pending", gate_mode: "blocking" },
  ],
  stageHistory: [],
  milestones: [],
  workItems: [
    {
      id: "w-connection",
      stage_key: "partner_setup",
      title: "Connection verified",
      party: "customer",
      visibility: "shared",
      status: "not_started",
      is_gate: true,
      due_at: null,
    },
    {
      id: "w-internal",
      stage_key: "partner_setup",
      title: "INTERNAL-ONLY partner checklist item",
      party: "partner",
      visibility: "internal",
      status: "not_started",
      is_gate: true,
      due_at: null,
    },
  ],
};

function partnerView(overrides: Record<string, unknown> = {}): WelcomeView {
  const partner = partnerDashboardView(partnerProgress(partnerRecords));
  return {
    dealId: "deal-p",
    clientName: "Partner Customer Co",
    industry: "Pools",
    icon: "Waves",
    timeline: {
      closeDate: "2026-03-01",
      path: "new_logo",
      milestones: [
        // The standard kickoff call and homework: they must not reach a partner's dashboard.
        {
          key: "kickoff",
          kind: "call",
          label: "Kickoff call",
          date: "2026-10-05",
          time: "09:00",
          doneOn: null,
          homework: ["Run one job"],
          detail: "",
        },
        {
          key: "homework",
          kind: "homework",
          label: "Homework",
          date: "2026-10-12",
          time: null,
          doneOn: null,
          detail: "",
        },
      ],
      liveDate: null,
      timezone: "America/New_York",
      training: false,
      servicesOnly: false,
      holidays: [],
    },
    lead: "Priya Lead",
    fieldTester: "Sam Tester",
    fieldTesterDue: "2026-10-30",
    fieldTesterSource: "person",
    team: {
      lead: "Priya Lead",
      leadEmail: "priya@gocanvas.com",
      leadCard: null,
      accountManager: null,
      solutionsEngineer: null,
      champion: null,
    },
    firstForm: null,
    clientLogoUrl: null,
    helpPicks: [],
    goBase: "https://hub.example/go/t",
    homeworkDone: {},
    parkingLot: [],
    workflowStory: null,
    implementationFocus: null,
    implementationFocusFallback: [],
    customerScope: { state: "agreed", items: ["Kickoff agreed deliverable"] },
    intake: { needed: [{ key: "q1", label: "A standard kickoff question" }] },
    journey: null,
    partner,
    ...overrides,
  } as unknown as WelcomeView;
}

function dashboard(view: WelcomeView, internal: boolean): string {
  return renderToStaticMarkup(
    createElement(CustomerDashboard, {
      view,
      today: "2026-10-12",
      mode: internal ? "internal" : "shared",
      icsBase: null,
      onTick: undefined,
      onAnswer: undefined,
      onBall: undefined,
    }),
  );
}

/** Standard kickoff copy that must never appear on a partner dashboard. */
const STANDARD_ONLY = [
  "Download the GoCanvas app",
  "Add one field user who will test on a real job",
  "Test the form on real work",
  "Your answers before kickoff",
  "A standard kickoff question",
  "Our kickoff agreements",
  "How we&#x27;ll work together",
  "What GoCanvas is working on",
  "Agreed deliverables",
];

describe.each([
  ["the internal preview", true],
  ["the customer's link", false],
])("partner dashboard on %s", (_name, internal) => {
  const markup = dashboard(partnerView(), internal);

  it("shows the five customer stages, beginning with Partner Setup & Connection", () => {
    const bar = markup.indexOf("Partner Setup &amp; Connection");
    expect(bar).toBeGreaterThan(-1);
    const order = [
      "Partner Setup &amp; Connection",
      "Form Finalisation &amp; Data Readiness",
      "Pilot",
      "Trial Run",
      "Roll Out &amp; Graduation",
    ];
    const positions = order.map((label) => markup.indexOf(label));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(markup).not.toContain("Closed Won &amp; Planning");
  });

  it("shows the customer's open action in plain language, and no internal item", () => {
    expect(markup).toContain("Connection verified");
    expect(markup).not.toContain("INTERNAL-ONLY");
  });

  it("shows no standard-only kickoff homework, agreements, or attention items", () => {
    for (const text of STANDARD_ONLY) {
      expect(markup, text).not.toContain(text);
    }
  });

  it("says To be confirmed for the dates nothing records", () => {
    expect(markup).toContain("To be confirmed");
    expect(markup).not.toMatch(/Target \d{4}-\d{2}-\d{2}/);
  });

  it("keeps the same dashboard structure: header, progress bar and the existing cards", () => {
    expect(markup).toContain("gc-dash-bar");
    expect(markup).toContain("What needs your attention");
    expect(markup).toContain("Progress and blockers");
    expect(markup).toContain("Contact your TIS");
  });

  it("has no control on a partner action: nothing on it can act on a partner item", () => {
    expect(/<button\b/.test(markup)).toBe(false);
  });
});

describe("the standard dashboard is unchanged", () => {
  it("still shows the standard kickoff items for a standard view", () => {
    const standard = partnerView({ partner: null, journey: null, intake: null });
    const markup = dashboard(standard as WelcomeView, false);
    expect(markup).toContain("Our kickoff agreements");
    expect(markup).toContain("What GoCanvas is working on");
  });
});

describe("the generic stepper, drawn with partner stages", () => {
  const markup = renderToStaticMarkup(
    createElement(StageStepper, {
      stages: partnerStepperStages(partnerProgress(partnerRecords)),
      shown: "partner_setup",
    }),
  );

  it("draws all seven partner stages, with the actual stage marked current", () => {
    expect(markup.match(/<li\b/g)).toHaveLength(7);
    expect(markup).toContain("Partner Setup &amp; Connection");
    // The current stage's button is the one carrying aria-current, and it reads Partner Setup.
    const current = markup.slice(markup.indexOf('aria-current="step"'));
    expect(current.slice(0, current.indexOf("</button>"))).toContain("Partner Setup");
  });

  it("shows To be confirmed for dates nothing records", () => {
    expect(markup).toContain("To be confirmed");
  });
});
