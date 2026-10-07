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

describe("the Kickoff composition", () => {
  it("is the intended seven-screen sequence", () => {
    const view = baseView();
    expect(kickoffScreenList(view).map((s) => s.key)).toEqual([
      "kickoff-cover",
      "kickoff-understand",
      "kickoff-workflow",
      "kickoff-focus",
      "kickoff-partnership",
      "kickoff-journey",
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
    expect(kickoffScreenList(view).map((s) => s.key)).toHaveLength(7);
  });
});
