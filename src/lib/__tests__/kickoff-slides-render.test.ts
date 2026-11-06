import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { KickoffSlidesSection } from "@/components/presenter-workspace";
import { kickoffScreensFor, kickoffScreenList } from "@/components/kickoff-view";
import { KICKOFF_TO_CONFIRM } from "@/lib/kickoff-view";
import {
  OPTIONAL_SLIDE_KEYS,
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
    loadError: null,
    implementationId: "impl-1",
    kind: "new-logo",
    kindReason: "",
    recommended,
    selection: resolveKickoffSelection(saved, recommended),
    saved: saved ? { savedAt: "2026-11-05", savedBy: null } : null,
    recommendationChanged: false,
    canConfigure: true,
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

describe("training: only confirmed training is described as training", () => {
  it("does not present a form build's working sessions as training", () => {
    const facts = { ...TRAINING_ONLY, trainingOnly: false, path: "new_logo", services: [] };
    const view = viewWith(
      deckFor(facts, { included: ["kickoff-training"], order: ["kickoff-training"] }, null, []),
    );
    // A standard plan: the calls after kickoff are working sessions, not training.
    (view.timeline as { milestones: unknown[]; training: boolean }).milestones = [
      {
        key: "build",
        label: "Build session",
        kind: "call",
        date: "2026-11-20",
        time: "10:00",
        serviceId: null,
        doneOn: null,
      },
    ];
    const idx = kickoffScreensFor(view).findIndex((s) => s.key === "kickoff-training");
    const text = html(view, idx);
    expect(text).not.toContain("Build session");
    expect(text).toContain("Training is to be confirmed together.");
  });

  it("shows a training plan's own sessions as training, with the date only when it is set", () => {
    const facts = { ...TRAINING_ONLY, path: "new_logo" };
    const view = viewWith(
      deckFor(facts, { included: ["kickoff-training"], order: ["kickoff-training"] }, null, []),
    );
    (view.timeline as { milestones: unknown[]; training: boolean }).training = true;
    (view.timeline as { milestones: unknown[]; training: boolean }).milestones = [
      {
        key: "kickoff",
        label: "Session 1 — the admin portal",
        kind: "call",
        date: "2026-11-10",
        time: "10:00",
        serviceId: null,
        doneOn: null,
      },
      {
        key: "s2",
        label: "Session 2 — real jobs",
        kind: "call",
        date: "2026-11-17",
        time: null,
        serviceId: null,
        doneOn: null,
      },
    ];
    const idx = kickoffScreensFor(view).findIndex((s) => s.key === "kickoff-training");
    const text = html(view, idx);
    expect(text).toContain("Session 1 — the admin portal");
    expect(text).toContain("Session 2 — real jobs");
    expect(text).toContain("date to confirm together");
  });

  it("lists the training that was bought", () => {
    const facts = { ...TRAINING_ONLY, services: [{ kind: "training", name: "Crew training" }] };
    const view = viewWith(
      deckFor(facts, { included: ["kickoff-training"], order: ["kickoff-training"] }, null, [
        { kind: "training", name: "Crew training", phase: 1 },
      ]),
    );
    const idx = kickoffScreensFor(view).findIndex((s) => s.key === "kickoff-training");
    expect(html(view, idx)).toContain("Crew training");
  });
});

describe("partner: the approved responsibilities, and no unresolved customer decision", () => {
  const partnerView = () => {
    const facts = { ...TRAINING_ONLY, trainingOnly: false, partnerLed: true, services: [] };
    return viewWith(
      deckFor(
        facts,
        { included: ["kickoff-partner"], order: ["kickoff-partner"] },
        "Field Fusion IQ",
      ),
    );
  };
  const partnerText = (view: WelcomeView) =>
    html(
      view,
      kickoffScreensFor(view).findIndex((s) => s.key === "kickoff-partner"),
    );

  it("states the partner's and GoCanvas Implementation's responsibilities in the approved wording", () => {
    const text = partnerText(partnerView());
    expect(text).toContain("Field Fusion IQ");
    expect(text).toContain("GoCanvas Implementation");
    expect(text).toContain(
      "Partner configures the solution and establishes the technical connection.",
    );
    expect(text).toContain("GoCanvas TIS owns implementation and enablement.");
    expect(text).toContain("The partner remains available for technical support and escalations.");
  });

  it("does not present Technical Solutions ownership on the slide, so no internal ownership is shown as a customer decision", () => {
    const text = partnerText(partnerView());
    expect(text).not.toContain("Technical Solutions");
    expect(text).not.toContain(KICKOFF_TO_CONFIRM);
  });

  it("the TIS is never described as owning Technical Solutions work", () => {
    expect(partnerText(partnerView())).not.toMatch(/TIS[^.]*Technical Solutions/);
  });

  it("the recommendation still flags the ownership gap internally for the TIS", () => {
    const deck = deckFor(
      { ...TRAINING_ONLY, trainingOnly: false, partnerLed: true, services: [] },
      null,
      "Field Fusion IQ",
    );
    expect(deck.recommended.flags.join(" ")).toMatch(
      /does not name who owns Technical Solutions work/,
    );
  });
});

/* ----------------------------------------- the deck controls, by permission */

function controlsMarkup(canConfigure: boolean, saved: boolean) {
  const facts = { ...TRAINING_ONLY, trainingOnly: true };
  const deck = deckFor(
    facts,
    saved ? { included: ["kickoff-training"], order: [...OPTIONAL_SLIDE_KEYS] } : null,
  );
  deck.canConfigure = canConfigure;
  deck.saved = saved ? { savedAt: "2026-11-05T10:00:00Z", savedBy: "A Manager" } : null;
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(KickoffSlidesSection, {
        dealId: "deal-1",
        view: viewWith(deck),
        implementationId: "impl-1",
        onSaved: () => undefined,
      }),
    ),
  );
}

/** The opening tag of the button with this visible label. */
function buttonTag(markup: string, label: string): string {
  const at = markup.indexOf(`>${label}<`);
  const start = markup.lastIndexOf("<button", at);
  return markup.slice(start, markup.indexOf(">", start) + 1);
}

describe("the deck controls follow the permission the server enforces", () => {
  it("a person who may not configure the deck gets disabled Save and Reset, and disabled slide controls", () => {
    const markup = controlsMarkup(false, true);
    expect(buttonTag(markup, "Save selection")).toMatch(/\sdisabled=""/);
    expect(buttonTag(markup, "Reset to recommendation")).toMatch(/\sdisabled=""/);
    expect(markup).toMatch(/<input[^>]*type="checkbox"[^>]*disabled=""/);
    expect(markup).toContain(
      "Only an administrator, a manager, or the TIS assigned to this implementation can change this deck.",
    );
  });

  it("a person who may configure the deck gets working controls, and no lock message", () => {
    const markup = controlsMarkup(true, true);
    expect(buttonTag(markup, "Reset to recommendation")).not.toMatch(/\sdisabled=""/);
    expect(markup).not.toContain(
      "Only an administrator, a manager, or the TIS assigned to this implementation can change this deck.",
    );
    expect(markup).not.toMatch(/<input[^>]*type="checkbox"[^>]*disabled=""/);
  });

  it("Save stays disabled until something has changed, even for someone who may configure", () => {
    expect(buttonTag(controlsMarkup(true, true), "Save selection")).toMatch(/\sdisabled=""/);
  });
});

describe("a deck that did not read presents nothing, and never a recommendation or the standard slides", () => {
  it("the presentation has no slides at all when the deck has a read error", () => {
    const deck = deckFor(TRAINING_ONLY);
    deck.loadError = "Could not load the kickoff slides. Try again in a minute.";
    expect(kickoffScreensFor(viewWith(deck))).toEqual([]);
  });

  it("a live customer (no deck at all) gets exactly the standard slides", () => {
    const view = viewWith(null);
    expect(kickoffScreensFor(view).map((s) => s.key)).toEqual(
      kickoffScreenList(view).map((s) => s.key),
    );
  });

  it("the workspace says the builder is for test implementations when there is no deck", () => {
    const markup = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(KickoffSlidesSection, {
          dealId: "deal-1",
          view: viewWith(null),
          implementationId: "impl-1",
          onSaved: () => undefined,
        }),
      ),
    );
    expect(markup).toContain("not available for this deal");
    expect(markup).not.toContain("Save selection");
  });

  it("the workspace shows a read error in place of the controls, with nothing changeable", () => {
    const deck = deckFor(TRAINING_ONLY);
    deck.loadError = "Could not load the kickoff slides. Try again in a minute.";
    const markup = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(KickoffSlidesSection, {
          dealId: "deal-1",
          view: viewWith(deck),
          implementationId: "impl-1",
          onSaved: () => undefined,
        }),
      ),
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Could not load the kickoff slides");
    expect(markup).not.toContain("Save selection");
    expect(markup).not.toMatch(/type="checkbox"/);
  });
});

/* ----------------------------------------- the blocked presentation, rendered */

import { WelcomePage } from "@/components/welcome-page";

function pageMarkup(view: WelcomeView, onRetryDeck?: () => void) {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(WelcomePage, {
        view,
        mode: "internal",
        backHref: "/deals/deal-1",
        notesHref: "/onboarding-notes/deal-1",
        workspaceHref: "/onboarding-plan/deal-1?workspace=1",
        onRetryDeck,
      } as never),
    ),
  );
}

describe("the Kickoff presentation is blocked until a saved deck loads", () => {
  const failed = () => {
    const deck = deckFor(TRAINING_ONLY);
    deck.loadError = "Could not load the kickoff slides. Try again in a minute.";
    return viewWith(deck);
  };

  it("a deck that did not load shows a blocking alert with a retry, and no slides", () => {
    const markup = pageMarkup(failed(), () => undefined);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("The kickoff slides could not be loaded");
    expect(markup).toContain("Try again");
    expect(markup).not.toContain("wp-screen");
  });

  it("the presentation cannot be started while blocked", () => {
    const markup = pageMarkup(failed(), () => undefined);
    expect(markup).not.toContain(" Present</button>");
    expect(markup).not.toContain("wp-present");
  });

  it("the retry is enabled only when a retry is wired", () => {
    expect(
      buttonTag(
        pageMarkup(failed(), () => undefined),
        "Try again",
      ),
    ).not.toMatch(/disabled=""/);
    expect(buttonTag(pageMarkup(failed(), undefined), "Try again")).toMatch(/disabled=""/);
  });

  it("a deck that loaded presents its slides and can be presented", () => {
    const markup = pageMarkup(viewWith(deckFor(TRAINING_ONLY)), () => undefined);
    expect(markup).toContain("wp-screen");
    expect(markup).not.toContain('role="alert"');
    expect(markup).toContain("Present");
  });

  it("a live customer's deal, with no deck at all, presents the standard slides as before", () => {
    const markup = pageMarkup(viewWith(null), () => undefined);
    expect(markup).toContain("wp-screen");
    expect(markup).not.toContain('role="alert"');
  });
});
