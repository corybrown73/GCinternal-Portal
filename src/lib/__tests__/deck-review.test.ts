import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WelcomePage } from "@/components/welcome-page";
import { deckReviewWarning, shareNeedsConfirm } from "@/lib/deck-review";
import { intakeAnswersSchema, readIntake } from "@/lib/intake-answers";
import { timelineFor } from "@/lib/onboarding-plan";
import { customerWelcomeView, type WelcomeView } from "@/lib/welcome";

/**
 * An unreviewed deck warns and never blocks: a print-hidden banner on the
 * internal deck, a confirm on "Copy customer link". Present, PDF and
 * PowerPoint stay as they were; the customer's link never shows any of it.
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

const unreviewed = {
  reviewed: false,
  aiReading: "done",
  readiness: [
    { key: "name", label: "Customer-facing name", hint: "" },
    { key: "tester", label: "Their field tester", hint: "" },
  ],
};

describe("the warning", () => {
  it("names the reading's status and lists what is still open", () => {
    expect(deckReviewWarning(viewWith(unreviewed))).toEqual({
      headline: "Not reviewed: AI reading done. Check before sharing.",
      items: ["Customer-facing name", "Their field tester"],
    });
    expect(deckReviewWarning(viewWith({ ...unreviewed, aiReading: null, readiness: [] }))).toEqual({
      headline: "Not reviewed: no AI reading yet. Check before sharing.",
      items: [],
    });
  });

  it("still lists blanks after review, and clears when reviewed and complete", () => {
    expect(deckReviewWarning(viewWith({ ...unreviewed, reviewed: true }))?.items).toEqual([
      "Customer-facing name",
      "Their field tester",
    ]);
    expect(deckReviewWarning(viewWith({ reviewed: true, readiness: [] }))).toBeNull();
  });

  it("is never computed for the customer's copy", () => {
    const customer = customerWelcomeView(viewWith(unreviewed));
    expect(customer.reviewed).toBeNull();
    expect(customer.aiReading).toBeNull();
    expect(deckReviewWarning(customer)).toBeNull();
    expect(shareNeedsConfirm(customer)).toBe(false);
  });

  it("asks before sharing only when not reviewed", () => {
    expect(shareNeedsConfirm(viewWith(unreviewed))).toBe(true);
    expect(shareNeedsConfirm(viewWith({ reviewed: true }))).toBe(false);
  });
});

describe("on the page", () => {
  it("shows a print-hidden banner on the internal deck, and keeps Present, PDF and PowerPoint", () => {
    const markup = page(viewWith(unreviewed), "internal");
    expect(markup).toContain('data-testid="deck-review-banner" class="print:hidden ');
    expect(markup).toContain("Not reviewed: AI reading done. Check before sharing.");
    expect(markup).toContain("Customer-facing name · Their field tester");
    expect(markup).toContain("Present");
    expect(markup).toContain("PDF");
    expect(markup).toContain("PowerPoint");
  });

  it("has no banner once reviewed with nothing open", () => {
    const markup = page(viewWith({ reviewed: true, readiness: [] }), "internal");
    expect(markup).not.toContain("deck-review-banner");
  });

  it("never shows the banner on the customer's link", () => {
    const markup = page(customerWelcomeView(viewWith(unreviewed)), "shared");
    expect(markup).not.toContain("deck-review-banner");
    expect(markup).not.toContain("Not reviewed");
    // Even a view that slipped through with review state is not warned on.
    expect(page(viewWith(unreviewed), "shared")).not.toContain("deck-review-banner");
  });
});
