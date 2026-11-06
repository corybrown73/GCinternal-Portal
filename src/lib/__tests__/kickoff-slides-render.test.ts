import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { kickoffScreensFor, kickoffScreenList } from "@/components/kickoff-view";
import { KICKOFF_TO_CONFIRM } from "@/lib/kickoff-view";
import {
  defaultSelection,
  presentedSlideKeys,
  recommendKickoffSlides,
  resolveKickoffSelection,
  type KickoffDeckView,
  type KickoffFacts,
} from "@/lib/kickoff-slides";
import type { WelcomeView } from "@/lib/welcome";

/**
 * The configured Kickoff deck, rendered as the room sees it: only the selected
 * slides, numbered in order, with the new slides honest when information is
 * missing, and no internal flag or reason ever on a slide.
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

function deckFor(
  facts: KickoffFacts,
  saved: { included: string[]; order: string[] } | null = null,
  partnerName: string | null = null,
  purchased: KickoffDeckView["purchased"] = [],
): KickoffDeckView {
  const recommended = recommendKickoffSlides(facts);
  return {
    implementationId: "impl-1",
    kind: "new-logo",
    kindReason: "",
    recommended,
    selection: resolveKickoffSelection(saved, recommended),
    saved: saved ? { savedAt: "2026-11-05", savedBy: null } : null,
    recommendationChanged: false,
    partnerName,
    purchased,
  };
}

function html(view: WelcomeView, index: number): string {
  const screen = kickoffScreensFor(view)[index]!;
  return renderToStaticMarkup(
    screen.render(ARGS(index + 1)) as Parameters<typeof renderToStaticMarkup>[0],
  )
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

const TRAINING_ONLY: KickoffFacts = {
  path: "existing",
  trainingOnly: true,
  expansion: false,
  partnerLed: false,
  partnerName: null,
  services: [{ kind: "training", name: "Crew training" }],
  solutionsInvolved: null,
  firstFormNamed: false,
  firstFormConfirmed: false,
  hasImplementation: true,
};

describe("the presentation shows exactly the selected slides, numbered in order", () => {
  it("for training only: training is there, the form is not, and the count matches the selection", () => {
    const view = viewWith(
      deckFor(TRAINING_ONLY, null, null, [{ kind: "training", name: "Crew training", phase: 1 }]),
    );
    const screens = kickoffScreensFor(view);
    expect(screens.map((s) => s.key)).toEqual(presentedSlideKeys(view.kickoffDeck!.selection));
    expect(screens.map((s) => s.key)).not.toContain("kickoff-form-v1");
    expect(screens.map((s) => s.key)).toContain("kickoff-training");
  });

  it("honours a TIS's saved selection over the recommendation", () => {
    const view = viewWith(
      deckFor(TRAINING_ONLY, { included: ["kickoff-workflow"], order: ["kickoff-workflow"] }),
    );
    const keys = kickoffScreensFor(view).map((s) => s.key);
    expect(keys).toContain("kickoff-workflow");
    expect(keys).not.toContain("kickoff-training");
  });

  it("falls back to the six original screens when there is no deck view", () => {
    const view = viewWith(null);
    expect(kickoffScreensFor(view).map((s) => s.key)).toEqual(
      kickoffScreenList(view).map((s) => s.key),
    );
  });
});

describe("the new slides", () => {
  it("the partner slide names the partner and says who does what", () => {
    const facts = { ...TRAINING_ONLY, trainingOnly: false, partnerLed: true, services: [] };
    const view = viewWith(
      deckFor(
        facts,
        { included: ["kickoff-partner"], order: ["kickoff-partner"] },
        "Field Fusion IQ",
      ),
    );
    const idx = kickoffScreensFor(view).findIndex((s) => s.key === "kickoff-partner");
    const text = html(view, idx);
    expect(text).toContain("Field Fusion IQ");
    expect(text).toContain("Partner Implementation Lead owns the setup");
  });

  it("the partner slide, with no partner named, says it is to confirm together rather than naming one", () => {
    const facts = { ...TRAINING_ONLY, trainingOnly: false, partnerLed: true, services: [] };
    const view = viewWith(
      deckFor(facts, { included: ["kickoff-partner"], order: ["kickoff-partner"] }, null),
    );
    const idx = kickoffScreensFor(view).findIndex((s) => s.key === "kickoff-partner");
    expect(html(view, idx)).toContain("with your partner");
  });

  it("purchased solutions shows what was bought, and says so when nothing was recorded", () => {
    const facts = { ...TRAINING_ONLY, trainingOnly: false, services: [] };
    const view = viewWith(
      deckFor(facts, { included: ["kickoff-purchased"], order: ["kickoff-purchased"] }, null, []),
    );
    const idx = kickoffScreensFor(view).findIndex((s) => s.key === "kickoff-purchased");
    expect(html(view, idx)).toContain(KICKOFF_TO_CONFIRM);
  });

  it("purchased solutions lists the bought items with their phase", () => {
    const facts = {
      ...TRAINING_ONLY,
      trainingOnly: false,
      services: [{ kind: "integration", name: "QuickBooks" }],
    };
    const purchased = [{ kind: "integration", name: "QuickBooks", phase: 2 }];
    const view = viewWith(
      deckFor(
        facts,
        { included: ["kickoff-purchased"], order: ["kickoff-purchased"] },
        null,
        purchased,
      ),
    );
    const idx = kickoffScreensFor(view).findIndex((s) => s.key === "kickoff-purchased");
    const text = html(view, idx);
    expect(text).toContain("QuickBooks");
    expect(text).toContain("Phase 2");
  });

  it("the core 'achieve' slide is present for every deck, and says what is unconfirmed rather than inventing it", () => {
    const view = viewWith(deckFor(TRAINING_ONLY));
    const idx = kickoffScreensFor(view).findIndex((s) => s.key === "kickoff-achieve");
    expect(idx).toBe(1);
    expect(html(view, idx)).toContain(KICKOFF_TO_CONFIRM);
  });
});

describe("internal reasons never reach a slide", () => {
  it("no recommendation flag or reason appears on any presented slide", () => {
    const facts = { ...TRAINING_ONLY, path: null as string | null, solutionsInvolved: null };
    const deck = deckFor(facts, null, null, []);
    expect(deck.recommended.flags.length).toBeGreaterThan(0);
    const view = viewWith(deck);
    for (let i = 0; i < kickoffScreensFor(view).length; i++) {
      const text = html(view, i);
      for (const flag of deck.recommended.flags) expect(text).not.toContain(flag);
      for (const reason of Object.values(deck.recommended.reasons))
        expect(text).not.toContain(reason);
    }
  });
});

describe("the selection used is never the recommendation after a save", () => {
  it("defaults to the recommendation with no save", () => {
    const deck = deckFor(TRAINING_ONLY);
    expect(deck.selection).toEqual(defaultSelection(deck.recommended));
  });
});
