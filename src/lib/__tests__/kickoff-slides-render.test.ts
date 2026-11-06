import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { KickoffDeckBlocked } from "@/components/kickoff-deck-blocked";
import { KickoffSlidesSection } from "@/components/presenter-workspace";
import { kickoffScreensFor } from "@/components/kickoff-view";
import { KICKOFF_TO_CONFIRM } from "@/lib/kickoff-view";
import {
  presentedSlideKeys,
  recommendKickoffDeck,
  type KickoffDeckView,
  type KickoffFacts,
  type KickoffSelection,
} from "@/lib/kickoff-slides";
import type { WelcomeView } from "@/lib/welcome";
import { customerWelcomeView } from "@/lib/welcome";
import { parseDeliveryTimeline, suggestDeliveryDates } from "@/lib/delivery-timeline";

/**
 * The Kickoff deck as the room sees it, and as the TIS configures it. The room
 * sees exactly the presented slides, in order, with no internal flag, reason or
 * control on any slide. The TIS sees the choices and the flags, and cannot change
 * them without the authority the server enforces.
 */

const ARGS = (page: number) => ({
  page,
  qr: null,
  mode: "shared" as const,
  onTick: undefined,
  onAnswer: undefined,
  onBall: undefined,
  icsBase: null,
});

function viewWith(
  deck: KickoffDeckView | null,
  overrides: Record<string, unknown> = {},
): WelcomeView {
  return {
    dealId: "deal-1",
    clientName: "Aquatic Facility Services",
    industry: "Pools",
    icon: "Waves",
    timeline: {
      closeDate: "2026-10-01",
      path: "new_logo",
      milestones: [],
      liveDate: "2026-10-26",
      timezone: "America/New_York",
    },
    lead: "Priya Lead",
    fieldTester: null,
    fieldTesterDue: null,
    fieldTesterSource: null,
    currentProcess: null,
    currentProcessSource: null,
    team: {
      lead: null,
      leadEmail: null,
      leadCard: null,
      accountManager: null,
      solutionsEngineer: null,
      champion: null,
    },
    firstForm: null,
    firstFormSource: null,
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
    intake: null,
    journey: null,
    kickoffDeck: deck,
    ...overrides,
  } as unknown as WelcomeView;
}

const DIRECT: KickoffFacts = {
  deckSignals: { partnerByRecord: false, partnerByJourney: false },
  partnerName: null as string | null,
  path: "new_logo",
  additionalSolutions: [],
  solutionsInvolved: false,
  firstFormNamed: true,
  firstFormConfirmed: true,
  hasImplementation: true,
};

/** A loaded deck for a selection, with its recommendation, as the server would return it. */
function deckFor(
  selection: KickoffSelection | null,
  over: Partial<KickoffDeckView> = {},
  facts: Partial<KickoffFacts> = {},
): KickoffDeckView {
  const recommended = recommendKickoffDeck({ ...DIRECT, ...facts });
  return {
    loadError: null,
    implementationId: "impl-1",
    recommended,
    selection,
    saved: null,
    canConfigure: true,
    partnerName: null,
    additional: [],
    firstFormName: "Site Check",
    delivery: null,
    tier: { number: 1, status: "classified" },
    ...over,
  };
}

function markup(view: WelcomeView, index: number): string {
  const screen = kickoffScreensFor(view)[index]!;
  return renderToStaticMarkup(
    screen.render(ARGS(index + 1)) as Parameters<typeof renderToStaticMarkup>[0],
  )
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function allText(view: WelcomeView): string {
  return kickoffScreensFor(view)
    .map((_, i) => markup(view, i))
    .join("\n");
}

function presenter(view: WelcomeView): string {
  const client = new QueryClient();
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(KickoffSlidesSection, {
        dealId: "deal-1",
        view,
        implementationId: "impl-1",
        onSaved: () => undefined,
      }),
    ),
  );
}

const STANDARD_CORE = [
  "kickoff-cover",
  "kickoff-workflow",
  "kickoff-journey",
  "kickoff-communication",
  "kickoff-next",
];

describe("the room sees exactly the presented standard slides, in order", () => {
  it("core only: no additional solutions and no first form when neither is confirmed", () => {
    const view = viewWith(
      deckFor({ deckType: "standard", formReady: false, hasAdditional: false }),
    );
    expect(kickoffScreensFor(view).map((s) => s.key)).toEqual(STANDARD_CORE);
    expect(kickoffScreensFor(view).map((s) => s.key)).toEqual(
      presentedSlideKeys(view.kickoffDeck!.selection),
    );
  });

  it("Your additional solutions sits directly after the journey, and the first form before the close", () => {
    const view = viewWith(
      deckFor(
        { deckType: "standard", formReady: true, hasAdditional: true },
        {
          additional: [{ kind: "integration", name: "QuickBooks", phase: 2 }],
        },
      ),
    );
    expect(kickoffScreensFor(view).map((s) => s.key)).toEqual([
      "kickoff-cover",
      "kickoff-workflow",
      "kickoff-journey",
      "kickoff-additional",
      "kickoff-communication",
      "kickoff-form-v1",
      "kickoff-next",
    ]);
  });

  it("slide A names each purchased solution, and says what it delivers is to confirm together", () => {
    const view = viewWith(
      deckFor(
        { deckType: "standard", formReady: false, hasAdditional: true },
        {
          additional: [{ kind: "integration", name: "QuickBooks", phase: 2 }],
        },
      ),
    );
    const a = markup(view, 3);
    expect(a).toContain("Your additional");
    expect(a).toContain("QuickBooks");
    expect(a).toContain("Phase 2");
    expect(a).toContain(KICKOFF_TO_CONFIRM);
  });

  it("the form slide shows the first form's name, and never a placeholder for a form that is not ready", () => {
    const view = viewWith(
      deckFor({ deckType: "standard", formReady: true, hasAdditional: false }),
      {
        firstForm: { name: "Site Check", objective: null, source: "person" },
      },
    );
    const idx = kickoffScreensFor(view).findIndex((s) => s.key === "kickoff-form-v1");
    expect(idx).toBeGreaterThan(-1);
    expect(markup(view, idx)).toContain("Site Check");
  });
});

describe("the partner deck: its own six slides, never the direct deck's", () => {
  it("presents P1 to P6 with the partner named, and none of the direct deck's conditional slides", () => {
    const view = viewWith(
      deckFor(
        { deckType: "partner", formReady: true, hasAdditional: true },
        { partnerName: "Field Fusion IQ" },
        {
          deckSignals: { partnerByRecord: true, partnerByJourney: true },
          partnerName: "Field Fusion IQ",
          path: "partner_implementation",
        },
      ),
    );
    const keys = kickoffScreensFor(view).map((s) => s.key);
    expect(keys).toEqual([
      "partner-welcome",
      "partner-start",
      "partner-journey",
      "partner-together",
      "partner-proof",
      "partner-next",
    ]);
    const welcome = markup(view, 0);
    expect(welcome).toContain("Let's get your");
    expect(welcome).toContain("Field Fusion IQ");
    const all = allText(view);
    expect(all).not.toContain("Your additional");
    expect(all).not.toContain("Let's bring");
  });

  it("the partner journey shows the four stages, with no dates the plan does not hold", () => {
    const view = viewWith(
      deckFor(
        { deckType: "partner", formReady: false, hasAdditional: false },
        { partnerName: "Field Fusion IQ" },
        {
          deckSignals: { partnerByRecord: true, partnerByJourney: true },
          partnerName: "Field Fusion IQ",
          path: "partner_implementation",
        },
      ),
    );
    const journey = markup(view, 2);
    expect(journey).toContain("Form Finalisation & Data Readiness");
    expect(journey).toContain("Pilot");
    expect(journey).toContain("Trial Run");
    expect(journey).toContain("Roll Out & Graduation");
  });
});

describe("the room sees no internal content on any slide", () => {
  it("no flag, reason or control text is on any standard or partner slide", () => {
    for (const deck of [
      deckFor(
        { deckType: "standard", formReady: true, hasAdditional: true },
        {
          additional: [{ kind: "integration", name: "QuickBooks", phase: 2 }],
        },
      ),
      deckFor(
        { deckType: "partner", formReady: false, hasAdditional: false },
        { partnerName: "Field Fusion IQ" },
        {
          deckSignals: { partnerByRecord: true, partnerByJourney: true },
          partnerName: "Field Fusion IQ",
          path: "partner_implementation",
        },
      ),
    ]) {
      const text = allText(viewWith(deck));
      expect(text).not.toMatch(/To confirm before presenting/);
      expect(text).not.toMatch(/Save choice|Reset to automatic|Preview the customer page/);
      expect(text).not.toMatch(/The first form was read from the paperwork/);
    }
  });
});

describe("the presentation is held, never guessed", () => {
  it("a deck that did not load presents no slides and says so in the TIS view", () => {
    const view = viewWith(
      deckFor(null, { loadError: "Could not read the saved kickoff deck choice." }),
    );
    expect(kickoffScreensFor(view)).toEqual([]);
    const html = presenter(view);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Could not read the saved kickoff deck choice.");
    expect(html).not.toContain("Save choice");
  });

  it("an unsettled deck type presents nothing, and the TIS is asked to choose the deck type", () => {
    const view = viewWith(
      deckFor(null, {}, { deckSignals: { partnerByRecord: true, partnerByJourney: false } }),
    );
    expect(kickoffScreensFor(view)).toEqual([]);
    const html = presenter(view);
    expect(html).toContain("held until the deck type is chosen");
    expect(html).toContain("Standard (direct GoCanvas)");
    expect(html).toContain("Partner implementation");
  });

  it("a customer's copy with no internal deck shows the core standard slides only", () => {
    const view = viewWith(null);
    expect(kickoffScreensFor(view).map((s) => s.key)).toEqual(STANDARD_CORE);
  });
});

describe("the TIS view: what is populated, what is missing, and who may change it", () => {
  it("shows the Hub's populated facts, and labels what is missing as to confirm together", () => {
    const html = presenter(
      viewWith(deckFor({ deckType: "standard", formReady: false, hasAdditional: false })),
    );
    expect(html).toContain("Aquatic Facility Services");
    expect(html).toContain("Site Check");
    expect(html).toContain("Not recorded: to confirm together");
  });

  it("without authority, the TIS sees the deck and cannot save or reset it", () => {
    const html = presenter(
      viewWith(
        deckFor(
          { deckType: "standard", formReady: false, hasAdditional: false },
          { canConfigure: false },
        ),
      ),
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>\s*Save choice/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>\s*Reset to automatic/);
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*disabled=""/);
  });

  it("the form-readiness choice is offered on the standard deck only", () => {
    const html = presenter(
      viewWith(
        deckFor(
          { deckType: "partner", formReady: false, hasAdditional: false },
          { partnerName: "Field Fusion IQ" },
          {
            deckSignals: { partnerByRecord: true, partnerByJourney: true },
            partnerName: "Field Fusion IQ",
            path: "partner_implementation",
          },
        ),
      ),
    );
    expect(html).toContain("The partner deck has no first-form slide.");
  });
});

describe("the blocked panel says why the presentation is held", () => {
  it("a failed read says it could not load, and offers a retry", () => {
    const html = renderToStaticMarkup(
      createElement(KickoffDeckBlocked, { message: "Could not read.", onRetry: () => undefined }),
    );
    expect(html).toContain("could not be loaded");
    expect(html).toMatch(/<button[^>]*>\s*Try again/);
    expect(html).not.toMatch(/<button[^>]*disabled=""/);
  });

  it("an unsettled deck type says a choice is needed, never that nothing loaded, and offers no retry", () => {
    const html = renderToStaticMarkup(
      createElement(KickoffDeckBlocked, {
        reason: "choice",
        message: "The records disagree.",
        onRetry: undefined,
      }),
    );
    expect(html).toContain("needs a choice before it can be presented");
    expect(html).not.toContain("could not be loaded");
    expect(html).not.toContain("Try again");
  });
});

const RIVERBAY_PARAGRAPH =
  "The estimated timeline for completion of the solution is 4 to 6 weeks, commencing once all form builds and edits have been finalized. These deliverables may include necessary systems or environments, submitting finalized forms and documentation.";

function withDelivery(view: WelcomeView, formsFinalisedOn: string | null): WelcomeView {
  const suggestion = suggestDeliveryDates({
    sow: parseDeliveryTimeline(RIVERBAY_PARAGRAPH),
    tierTarget: null,
    tierMissing: null,
    closeDate: "2026-08-20",
    kickoffDate: "2026-09-07",
    signedDate: null,
    formsFinalisedOn,
    holidays: [],
    sowDeadlines: [],
    sowNotes: [],
  });
  const deck = view.kickoffDeck!;
  const effective = { from: suggestion.from, to: suggestion.to, source: suggestion.basis };
  return {
    ...view,
    kickoffDeck: {
      ...deck,
      delivery: {
        suggestion,
        saved: null,
        effective,
        label: suggestion.from
          ? `Proposed from the SOW Delivery Timeline: ${suggestion.from} to ${suggestion.to}. Not yet agreed with the customer.`
          : null,
      },
    },
  } as WelcomeView;
}

describe("delivery on the journey slides: the SOW's own words, proposed, never agreed", () => {
  it("the standard journey slide states the SOW duration in its own unit, and that the date is to confirm", () => {
    const view = withDelivery(
      viewWith(deckFor({ deckType: "standard", formReady: false, hasAdditional: false })),
      null,
    );
    const idx = kickoffScreensFor(view).findIndex((s) => s.key === "kickoff-journey");
    const html = markup(view, idx);
    expect(html).toContain(
      "Delivery: 4 to 6 weeks, when all form builds and edits are finalised, as the SOW states it.",
    );
    expect(html).toContain("Completion date: proposed, to confirm together. Confirmed: none yet.");
    expect(html).not.toContain("Not yet agreed");
  });

  it("once the finalisation day is recorded, the proposed range is shown as proposed, not agreed", () => {
    const view = withDelivery(
      viewWith(deckFor({ deckType: "standard", formReady: false, hasAdditional: false })),
      "2026-10-05",
    );
    const idx = kickoffScreensFor(view).findIndex((s) => s.key === "kickoff-journey");
    const html = markup(view, idx);
    expect(html).toContain("Proposed from the SOW:");
    expect(html).toContain("Not yet agreed. Confirmed: none yet.");
  });

  it("the partner journey slide carries the same delivery note", () => {
    const view = withDelivery(
      viewWith(
        deckFor(
          { deckType: "partner", formReady: false, hasAdditional: false },
          { partnerName: "Field Fusion IQ" },
          {
            deckSignals: { partnerByRecord: true, partnerByJourney: true },
            partnerName: "Field Fusion IQ",
            path: "partner_implementation",
          },
        ),
      ),
      null,
    );
    const idx = kickoffScreensFor(view).findIndex((s) => s.key === "partner-journey");
    expect(markup(view, idx)).toContain(
      "Completion date: proposed, to confirm together. Confirmed: none yet.",
    );
  });
});

describe("the customer's copy is never the internal deck", () => {
  it("the customer projection drops the deck, its delivery state, and the TIS's reasons", () => {
    const view = withDelivery(
      viewWith(
        deckFor(
          { deckType: "standard", formReady: true, hasAdditional: false },
          {
            saved: {
              savedAt: "2026-11-05",
              savedBy: "Test Manager",
              deckType: "standard",
              formReady: true,
            },
          },
        ),
      ),
      "2026-10-05",
    );
    const customer = JSON.stringify(customerWelcomeView(view));
    expect(customer).not.toContain("kickoffDeck");
    expect(customer).not.toContain("Adjusted by the TIS");
    expect(customer).not.toContain("recommended");
    expect(customer).not.toContain("Test Manager");
  });
});
