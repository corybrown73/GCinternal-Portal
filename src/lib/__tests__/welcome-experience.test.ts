import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WelcomePage } from "@/components/welcome-page";
import { intakeAnswersSchema, readIntake } from "@/lib/intake-answers";
import { timelineFor } from "@/lib/onboarding-plan";
import type { WelcomeView } from "@/lib/welcome";

/**
 * Three experiences, one implementation record. The internal Welcome page is
 * the kickoff room only: the six-slide deck, with the presenter workspace one
 * click away. The customer's link is the dashboard. The TIS previews the
 * dashboard from Current Implementation, not from here.
 */

function viewWith(overrides: Record<string, unknown> = {}): WelcomeView {
  const timeline = timelineFor(readIntake(intakeAnswersSchema.parse({})), "2026-10-01");
  return {
    dealId: "",
    clientName: "Aquatic Facility Services",
    industry: "Pools",
    icon: "Waves",
    timeline: { ...timeline, progress: { done: 0, total: 1 } },
    lead: "Priya Lead",
    fieldTester: null,
    fieldTesterDue: null,
    fieldTesterSource: null,
    currentProcess: null,
    currentProcessSource: null,
    team: {
      lead: "Priya Lead",
      leadEmail: "priya@gocanvas.com",
      leadCard: null,
      accountManager: null,
      solutionsEngineer: null,
      champion: null,
    },
    firstForm: { name: "Pool Service Ticket", objective: null, source: "library" },
    firstFormSource: "person",
    formArtifacts: [],
    nextUseCases: [],
    photoUrl: null,
    clientLogoUrl: null,
    homeworkDone: {},
    readiness: [],
    shareUrl: null,
    qrDataUrl: null,
    sharedAt: null,
    openedAt: null,
    hiddenScreens: [],
    textOverrides: {},
    path: "new_logo",
    helpPicks: [],
    helpOpened: {},
    goBase: null,
    parkingLot: [],
    workflowStory: null,
    implementationFocus: null,
    implementationFocusFallback: [],
    customerScope: { state: "empty", items: [] },
    intake: null,
    journey: null,
    ...overrides,
  } as unknown as WelcomeView;
}

function page(view: WelcomeView, mode: "internal" | "shared"): string {
  return renderToStaticMarkup(
    createElement(WelcomePage, {
      view,
      mode,
      ...(mode === "internal" ? { onCopyLink: async () => "https://hub.example/welcome/t" } : {}),
      backHref: "/deals/deal-1",
      notesHref: null,
      workspaceHref: "/onboarding-plan/deal-1?workspace=1",
      icsBase: mode === "shared" ? "/api/welcome-ics/t" : null,
    }),
  );
}

describe("the internal Welcome page is the kickoff room", () => {
  it("does not render the customer dashboard, and shows the kickoff deck with the presenter workspace one click away", () => {
    const markup = page(viewWith(), "internal");
    expect(markup).not.toContain("gc-dash");
    expect(markup).toContain("Kickoff deck");
    expect(markup).toContain("Presenter workspace");
    expect(markup).toContain("Let&#x27;s bring");
  });

  it("no longer offers the switch to the customer's plan", () => {
    const markup = page(viewWith(), "internal");
    expect(markup).not.toContain("Implementation Plan</button>");
    expect(markup).not.toContain("Kickoff View");
  });

  it("keeps the controls for sending the customer their link", () => {
    const markup = page(viewWith(), "internal");
    expect(markup).toContain("Create customer link");
  });
});

describe("the customer's link is the dashboard, unchanged", () => {
  it("renders the dashboard, not the slide deck, for a customer", () => {
    const markup = page(viewWith(), "shared");
    expect(markup).toContain("gc-dash");
    expect(markup).not.toContain("Presenter workspace");
    expect(markup).not.toContain("wp-screen is-cover");
  });
});
