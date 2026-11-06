import { describe, expect, it } from "vitest";

import {
  PARTNER_SLIDES,
  STANDARD_SLIDES,
  canConfigureKickoffDeck,
  isAdditionalSolution,
  kickoffDeckBlocked,
  presentedSlideKeys,
  recommendKickoffDeck,
  resolveDeckType,
  resolveKickoffSelection,
  type KickoffFacts,
  type KickoffSelection,
} from "../kickoff-slides";

const STANDARD_CORE = [
  "kickoff-cover",
  "kickoff-workflow",
  "kickoff-journey",
  "kickoff-communication",
  "kickoff-next",
];
const PARTNER = [
  "partner-welcome",
  "partner-start",
  "partner-journey",
  "partner-together",
  "partner-proof",
  "partner-next",
];

const direct: KickoffFacts = {
  deckSignals: { partnerByRecord: false, partnerByJourney: false },
  partnerName: null,
  path: "new_logo",
  additionalSolutions: [],
  solutionsInvolved: false,
  firstFormNamed: true,
  firstFormConfirmed: true,
  hasImplementation: true,
};
const partnerFacts: KickoffFacts = {
  ...direct,
  deckSignals: { partnerByRecord: true, partnerByJourney: true },
  partnerName: "Acme Partner",
  path: "partner_implementation",
};

const selection = (over: Partial<KickoffSelection> = {}): KickoffSelection => ({
  deckType: "standard",
  formReady: false,
  hasAdditional: false,
  ...over,
});

describe("the standard deck: six slides when everything is confirmed, in order", () => {
  it("the fixed slides, in narrative order, with neither conditional slide", () => {
    expect(STANDARD_SLIDES.filter((s) => !s.when).map((s) => s.key)).toEqual(STANDARD_CORE);
    expect(presentedSlideKeys(selection())).toEqual(STANDARD_CORE);
  });

  it("the first form is the sixth slide when ready, between 'We build it together' and the close", () => {
    expect(presentedSlideKeys(selection({ formReady: true }))).toEqual([
      "kickoff-cover",
      "kickoff-workflow",
      "kickoff-journey",
      "kickoff-communication",
      "kickoff-form-v1",
      "kickoff-next",
    ]);
  });

  it("Your additional solutions sits directly after slide 3 (the journey), only with additional solutions", () => {
    const keys = presentedSlideKeys(selection({ hasAdditional: true }));
    expect(keys.indexOf("kickoff-additional")).toBe(keys.indexOf("kickoff-journey") + 1);
    expect(keys.indexOf("kickoff-additional")).toBe(3);
    expect(presentedSlideKeys(selection())).not.toContain("kickoff-additional");
  });

  it("with both conditionals, the presentation runs seven slides in the approved order", () => {
    expect(presentedSlideKeys(selection({ hasAdditional: true, formReady: true }))).toEqual([
      "kickoff-cover",
      "kickoff-workflow",
      "kickoff-journey",
      "kickoff-additional",
      "kickoff-communication",
      "kickoff-form-v1",
      "kickoff-next",
    ]);
  });
});

describe("the form slide is never shown on a guess", () => {
  it("a purchased paid form does not make the form ready: only the saved confirmation does", () => {
    const recommended = recommendKickoffDeck({
      ...direct,
      additionalSolutions: [{ kind: "paid_form", name: "Form build", phase: 1 }],
    });
    // The recommendation has no form key: nothing auto-includes the form slide.
    expect(recommended).not.toHaveProperty("included");
    expect(presentedSlideKeys(resolveKickoffSelection(null, recommended))).not.toContain(
      "kickoff-form-v1",
    );
  });

  it("a form read from the paperwork and not confirmed is flagged, and the slide stays out", () => {
    const recommended = recommendKickoffDeck({ ...direct, firstFormConfirmed: false });
    expect(recommended.flags.join(" ")).toMatch(/read from the paperwork and is not confirmed/);
    expect(presentedSlideKeys(resolveKickoffSelection(null, recommended))).not.toContain(
      "kickoff-form-v1",
    );
  });

  it("a form the TIS saved as ready shows, and only then", () => {
    const recommended = recommendKickoffDeck(direct);
    const saved = resolveKickoffSelection({ deckType: "standard", formReady: true }, recommended);
    expect(presentedSlideKeys(saved)).toContain("kickoff-form-v1");
  });
});

describe("the partner deck: its own six slides, never the direct deck's", () => {
  it("is exactly P1 to P6, in order", () => {
    expect(PARTNER_SLIDES.map((s) => s.key)).toEqual(PARTNER);
    expect(presentedSlideKeys(selection({ deckType: "partner" }))).toEqual(PARTNER);
  });

  it("never receives the additional-solutions slide or the first-form slide, even when those are set", () => {
    const keys = presentedSlideKeys(
      selection({ deckType: "partner", hasAdditional: true, formReady: true }),
    );
    expect(keys).toEqual(PARTNER);
    expect(keys).not.toContain("kickoff-additional");
    expect(keys).not.toContain("kickoff-form-v1");
  });

  it("a partner implementation is a partner deck when the two signals agree", () => {
    const recommended = recommendKickoffDeck(partnerFacts);
    expect(recommended.deckType).toBe("partner");
    expect(recommended.ambiguous).toBe(false);
  });

  it("the partner deck is flagged for the unowned Technical Solutions work, not assumed", () => {
    const recommended = recommendKickoffDeck(partnerFacts);
    expect(recommended.flags.join(" ")).toMatch(/does not name who owns Technical Solutions/);
  });

  it("a partner-led implementation with no named partner is flagged", () => {
    const recommended = recommendKickoffDeck({ ...partnerFacts, partnerName: null });
    expect(recommended.flags.join(" ")).toMatch(/partner is not named/);
  });
});

describe("deck type: chosen from the records, never silently when they disagree", () => {
  it("agreement picks the deck with no ambiguity", () => {
    expect(resolveDeckType({ partnerByRecord: false, partnerByJourney: false })).toEqual({
      deckType: "standard",
      reason: "A direct GoCanvas implementation.",
      ambiguous: false,
    });
    expect(resolveDeckType({ partnerByRecord: true, partnerByJourney: true }).deckType).toBe(
      "partner",
    );
  });

  it("disagreement picks nothing and is ambiguous, in either direction", () => {
    expect(resolveDeckType({ partnerByRecord: true, partnerByJourney: false })).toMatchObject({
      deckType: null,
      ambiguous: true,
    });
    expect(resolveDeckType({ partnerByRecord: false, partnerByJourney: true })).toMatchObject({
      deckType: null,
      ambiguous: true,
    });
  });

  it("an ambiguous deal has no selection until the TIS saves a deck type", () => {
    const recommended = recommendKickoffDeck({
      ...direct,
      deckSignals: { partnerByRecord: true, partnerByJourney: false },
    });
    expect(resolveKickoffSelection(null, recommended)).toBeNull();
    expect(recommended.flags.join(" ")).toMatch(/disagree/);
  });

  it("the TIS's saved deck type settles an ambiguous deal", () => {
    const recommended = recommendKickoffDeck({
      ...direct,
      deckSignals: { partnerByRecord: true, partnerByJourney: false },
    });
    expect(
      resolveKickoffSelection({ deckType: "partner", formReady: false }, recommended),
    ).toMatchObject({ deckType: "partner" });
  });
});

describe("additional solutions: purchased, and not training or the first form", () => {
  it("training and the paid form are not additional solutions; anything else is", () => {
    expect(isAdditionalSolution({ kind: "training" })).toBe(false);
    expect(isAdditionalSolution({ kind: "paid_form" })).toBe(false);
    expect(isAdditionalSolution({ kind: "integration" })).toBe(true);
  });

  it("slide A is on when additional solutions exist, and flagged when solutions were sold but none are listed", () => {
    expect(
      recommendKickoffDeck({
        ...direct,
        additionalSolutions: [{ kind: "integration", name: "QuickBooks", phase: 2 }],
      }).hasAdditional,
    ).toBe(true);
    const none = recommendKickoffDeck({ ...direct, solutionsInvolved: true });
    expect(none.hasAdditional).toBe(false);
    expect(none.flags.join(" ")).toMatch(/Solutions were sold but no additional solutions/);
  });
});

describe("the presentation is blocked, never guessed", () => {
  it("a saved configuration that did not load blocks the presentation", () => {
    expect(
      kickoffDeckBlocked({
        kickoffDeck: {
          loadError: "Could not read the saved kickoff deck choice.",
          selection: null,
        },
      }),
    ).toBe(true);
  });

  it("an unsettled deck type blocks the presentation until it is chosen", () => {
    expect(kickoffDeckBlocked({ kickoffDeck: { loadError: null, selection: null } })).toBe(true);
  });

  it("a settled, loaded deck, and the customer's view with no deck, are not blocked", () => {
    expect(kickoffDeckBlocked({ kickoffDeck: { loadError: null, selection: selection() } })).toBe(
      false,
    );
    expect(kickoffDeckBlocked({ kickoffDeck: null })).toBe(false);
  });
});

describe("who may save a deck choice", () => {
  it("managers and above may configure any implementation", () => {
    for (const role of ["super_admin", "admin", "manager"]) {
      expect(
        canConfigureKickoffDeck({ role, actorTeamMemberId: null, ownerTeamMemberId: "tm-x" }),
      ).toBe(true);
    }
  });

  it("the TIS may configure only the implementation they are the primary TIS of", () => {
    expect(
      canConfigureKickoffDeck({
        role: "implementation",
        actorTeamMemberId: "tm-1",
        ownerTeamMemberId: "tm-1",
      }),
    ).toBe(true);
    expect(
      canConfigureKickoffDeck({
        role: "implementation",
        actorTeamMemberId: "tm-1",
        ownerTeamMemberId: "tm-2",
      }),
    ).toBe(false);
  });

  it("every other role, and an unlinked TIS, may not", () => {
    expect(
      canConfigureKickoffDeck({
        role: "sales",
        actorTeamMemberId: "tm-1",
        ownerTeamMemberId: "tm-1",
      }),
    ).toBe(false);
    expect(
      canConfigureKickoffDeck({
        role: "implementation",
        actorTeamMemberId: null,
        ownerTeamMemberId: null,
      }),
    ).toBe(false);
  });
});
