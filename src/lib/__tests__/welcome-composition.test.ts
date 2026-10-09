import { describe, expect, it } from "vitest";

import { kickoffScreenList } from "@/components/kickoff-view";
import { screenList } from "@/components/welcome-page";
import { readIntake } from "../intake-answers";
import { timelineFor } from "../onboarding-plan";
import type { WelcomeView } from "../welcome";

/**
 * Composition selection: WelcomeView stays one source, but Plan and
 * Kickoff pick a different, independent screen sequence from it. Only the
 * sequence (screen keys, in order) is checked here — no component is
 * rendered, since this codebase has no component-rendering test harness.
 */

function baseView(over: Partial<WelcomeView> = {}): WelcomeView {
  const intake = readIntake({
    path: "new_logo",
    wanted_forms: [{ id: "f1", name: "Daily Job Report", template_id: null }],
  });
  const timeline = timelineFor(intake, "2026-09-22");
  return {
    dealId: "d1",
    clientName: "Acme Co",
    industry: "Roofing",
    icon: "HardHat",
    timeline,
    lead: "Dana",
    fieldTester: null,
    fieldTesterDue: null,
    fieldTesterSource: null,
    currentProcess: null,
    currentProcessSource: null,
    team: {
      lead: "Dana",
      leadEmail: null,
      leadCard: null,
      accountManager: null,
      solutionsEngineer: null,
      champion: null,
    },
    firstForm: { name: "Daily Job Report", objective: null, source: "typed" },
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
    intake: null,
    journey: null,
    workflowStory: null,
    implementationFocus: null,
    ...over,
  };
}

describe("the Plan composition", () => {
  it("is unchanged by this PR — the same screens, in the same order", () => {
    const view = baseView();
    expect(screenList(view).map((s) => s.key)).toEqual([
      "cover",
      "team",
      "overview",
      "plan",
      "together",
      "form",
      "business",
    ]);
  });
});

describe("the Kickoff composition — six fixed screens, always", () => {
  it("is the six-screen sequence, in the fixed order, for a bare account", () => {
    const view = baseView();
    expect(kickoffScreenList(view).map((s) => s.key)).toEqual([
      "kickoff-cover",
      "kickoff-workflow",
      "kickoff-journey",
      "kickoff-communication",
      "kickoff-form-v1",
      "kickoff-next",
    ]);
  });

  it("is still six valid screens for a sparse account — nothing saved or known yet", () => {
    const view = baseView({
      currentProcess: null,
      workflowStory: null,
      implementationFocus: null,
      journey: null,
      intake: null,
    });
    expect(kickoffScreenList(view).map((s) => s.key)).toEqual([
      "kickoff-cover",
      "kickoff-workflow",
      "kickoff-journey",
      "kickoff-communication",
      "kickoff-form-v1",
      "kickoff-next",
    ]);
  });

  it("is still exactly six screens for a rich account — everything populated", () => {
    const view = baseView({
      currentProcess: "Paper ticket from the truck, retyped on Fridays.",
      workflowStory: {
        before: "A dispatch ticket comes over the radio.",
        during: "The crew fills in the ticket on the truck.",
        after: "The office reviews it and invoices the same day.",
        validatedAt: null,
        validatedBy: null,
      },
      implementationFocus: {
        items: [
          {
            id: "f1",
            text: "Connect approved submission data to QuickBooks Online.",
            status: "agreed",
            sources: [],
            reviewFlag: null,
          },
          {
            id: "f2",
            text: "Build the Daily Job Report form.",
            status: "agreed",
            sources: [],
            reviewFlag: null,
          },
          {
            id: "f3",
            text: "Load the customer list.",
            status: "agreed",
            sources: [],
            reviewFlag: null,
          },
          {
            id: "f4",
            text: "Train the field team.",
            status: "agreed",
            sources: [],
            reviewFlag: null,
          },
        ],
        validatedAt: "2026-10-07T12:00:00Z",
        validatedBy: "Dana",
      },
      journey: {
        stages: [
          { key: "pre_kickoff", label: "Intake & Process", state: "done", blurb: "" },
          { key: "kickoff", label: "Kickoff", state: "now", blurb: "The first meeting." },
          { key: "get_it_working", label: "Get it working", state: "later", blurb: "" },
          { key: "make_it_yours", label: "Make it yours", state: "later", blurb: "" },
          { key: "make_it_run", label: "Make it run", state: "later", blurb: "" },
          { key: "complete", label: "Graduate", state: "later", blurb: "" },
        ],
        current: { key: "kickoff", label: "Kickoff", state: "now", blurb: "The first meeting." },
        headline: "You are in Kickoff.",
        solutions: [],
        yours: [
          { what: "Download the GoCanvas app and log in", by: "2026-09-25", kind: "homework" },
        ],
      },
    });
    expect(kickoffScreenList(view).map((s) => s.key)).toEqual([
      "kickoff-cover",
      "kickoff-workflow",
      "kickoff-journey",
      "kickoff-communication",
      "kickoff-form-v1",
      "kickoff-next",
    ]);
  });

  it("never depends on the Plan's persisted hidden-screen preferences", () => {
    // Hiding every Plan screen must not remove a single Kickoff screen —
    // the two compositions read view.hiddenScreens independently (Kickoff
    // does not read it at all; see WelcomePage's `experience` branch).
    const view = baseView({
      hiddenScreens: ["cover", "team", "overview", "plan", "together", "form", "business"],
    });
    expect(kickoffScreenList(view).map((s) => s.key)).toHaveLength(6);
  });
});
