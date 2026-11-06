/**
 * The Kickoff deck model: which deck a deal gets, which slides it shows, and
 * the TIS's saved choices. Pure: no database, no React. The server reads the
 * facts; the Kickoff View and the Presenter Workspace read the result.
 *
 * TWO DECKS, ONE FAMILY.
 *  - Standard (direct GoCanvas): Welcome, How the work runs, the Journey,
 *    [Your additional solutions, only when additional solutions were bought],
 *    We build it together, [Your first form, only when the TIS confirms the form
 *    is ready to demonstrate], Before we meet again.
 *  - Partner (partner implementation): six slides of their own. No Additional
 *    Solutions slide and no first-form slide: those belong to the direct deck.
 *
 * DECK TYPE. Chosen automatically from existing classification, never from a new
 * field: a partner implementation (partner record or journey template) gets the
 * partner deck, a direct GoCanvas implementation gets the standard deck. When
 * the two signals disagree, nothing is chosen silently: the TIS picks the deck,
 * and the presentation stays blocked until they do.
 *
 * SAVED CHOICES. Only two things are the TIS's to save: the deck type (when it
 * had to be chosen) and whether the first form is ready to demonstrate. A saved
 * choice replaces the automatic one for that implementation. Nothing here
 * changes a stage, an owner, a task, a deal status or a customer's acceptance.
 */

import { isManagerRole } from "./roles";

export type KickoffDeckType = "standard" | "partner";

export type KickoffSlideMeta = {
  key: string;
  label: string;
  deck: KickoffDeckType;
  /** Shown only when this condition holds; absent means always shown in its deck. */
  when?: "additional-solutions" | "form-ready";
};

/** The standard deck's slides, in presentation order (conditional ones marked). */
export const STANDARD_SLIDES: ReadonlyArray<KickoffSlideMeta> = [
  { key: "kickoff-cover", label: "Welcome", deck: "standard" },
  { key: "kickoff-workflow", label: "How the work runs, in your words", deck: "standard" },
  { key: "kickoff-journey", label: "Your journey from kickoff to go-live", deck: "standard" },
  {
    key: "kickoff-additional",
    label: "Your additional solutions",
    deck: "standard",
    when: "additional-solutions",
  },
  {
    key: "kickoff-communication",
    label: "We build it together. You learn to run it.",
    deck: "standard",
  },
  { key: "kickoff-form-v1", label: "Your first form", deck: "standard", when: "form-ready" },
  { key: "kickoff-next", label: "Before we meet again", deck: "standard" },
];

/** The partner deck's slides, P1 to P6, in presentation order. */
export const PARTNER_SLIDES: ReadonlyArray<KickoffSlideMeta> = [
  { key: "partner-welcome", label: "Let's get your implementation moving.", deck: "partner" },
  { key: "partner-start", label: "Here's where we're starting.", deck: "partner" },
  { key: "partner-journey", label: "From kickoff to rollout, here's our plan.", deck: "partner" },
  { key: "partner-together", label: "Three teams. One shared outcome.", deck: "partner" },
  { key: "partner-proof", label: "What do we need to prove works?", deck: "partner" },
  { key: "partner-next", label: "Here's what happens next.", deck: "partner" },
];

export const KICKOFF_SLIDES: ReadonlyArray<KickoffSlideMeta> = [
  ...STANDARD_SLIDES,
  ...PARTNER_SLIDES,
];

/** Purchased services that are not training and not the first form: the "additional solutions". */
const FORM_KIND = "paid_form";
const TRAINING_KIND = "training";

export function isAdditionalSolution(service: { kind: string }): boolean {
  return service.kind !== TRAINING_KIND && service.kind !== FORM_KIND;
}

/** What the deck type is read from. Each signal is a fact on the record, not a guess. */
export type DeckTypeSignals = {
  /** The intake or the implementation names a partner (partner_key or the partner implementation type). */
  partnerByRecord: boolean;
  /** The implementation runs on a partner journey template (the journey classification). */
  partnerByJourney: boolean;
};

export type KickoffFacts = {
  deckSignals: DeckTypeSignals;
  /** The partner's name, when the partner is named. */
  partnerName: string | null;
  /** intake.path, or null when nobody has set it. */
  path: string | null;
  /** Purchased services that are additional solutions (see isAdditionalSolution). Customer-safe fields only. */
  additionalSolutions: Array<{ kind: string; name: string; phase: number }>;
  /** Whether solutions were sold: true, false, or null when nobody has said. */
  solutionsInvolved: boolean | null;
  /** A first form is named (by anyone). */
  firstFormNamed: boolean;
  /** The first form was confirmed by a person, not read from the paperwork. */
  firstFormConfirmed: boolean;
  /** An implementation exists to save the configuration against. */
  hasImplementation: boolean;
};

export type KickoffRecommendation = {
  /** The deck type the record points to. Null when the signals disagree: the TIS must choose. */
  deckType: KickoffDeckType | null;
  /** Why, in plain words. */
  deckReason: string;
  /** The signals disagree; nothing is chosen silently. */
  ambiguous: boolean;
  /** Purchased additional solutions exist, so the standard deck includes slide A. */
  hasAdditional: boolean;
  /** What is missing or contradictory, for the TIS to resolve before presenting. */
  flags: string[];
};

/** Deck type from the two signals. Agreement decides; disagreement is never resolved here. */
export function resolveDeckType(signals: DeckTypeSignals): {
  deckType: KickoffDeckType | null;
  reason: string;
  ambiguous: boolean;
} {
  if (signals.partnerByRecord && signals.partnerByJourney) {
    return {
      deckType: "partner",
      reason: "A partner leads this implementation.",
      ambiguous: false,
    };
  }
  if (!signals.partnerByRecord && !signals.partnerByJourney) {
    return { deckType: "standard", reason: "A direct GoCanvas implementation.", ambiguous: false };
  }
  return {
    deckType: null,
    reason:
      "The partner record and the journey template disagree about whether a partner leads this. Choose the deck type before presenting.",
    ambiguous: true,
  };
}

export function recommendKickoffDeck(f: KickoffFacts): KickoffRecommendation {
  const { deckType, reason, ambiguous } = resolveDeckType(f.deckSignals);
  const hasAdditional = f.additionalSolutions.length > 0;
  const flags: string[] = [];

  if (ambiguous) {
    flags.push(reason);
  }
  if (f.path === null) {
    flags.push("The account type is not set on the deal. Confirm it before presenting.");
  }
  if (!f.hasImplementation) {
    flags.push("There is no implementation yet, so the deck choice cannot be saved.");
  }
  if (deckType === "partner" && !f.partnerName) {
    flags.push(
      "Partner-led, but the partner is not named. The partner slides cannot say who leads.",
    );
  }
  if (deckType === "partner") {
    flags.push(
      "The approved partner journey does not name who owns Technical Solutions work. Agree the owner with the partner before presenting.",
    );
  }
  if (deckType !== "partner") {
    if (!f.firstFormNamed) {
      flags.push("No first form is named, so the form slide cannot be shown. Name it first.");
    } else if (!f.firstFormConfirmed) {
      flags.push(
        "The first form was read from the paperwork and is not confirmed. Confirm it is ready before showing the form slide.",
      );
    }
  }
  if (f.solutionsInvolved === true && f.additionalSolutions.length === 0) {
    flags.push(
      "Solutions were sold but no additional solutions are listed, so slide A is left out. Add them to the plan if they exist.",
    );
  }
  if (f.solutionsInvolved === null && !hasAdditional) {
    flags.push("Whether solutions were sold is not recorded, so slide A is left out.");
  }

  return { deckType, deckReason: reason, ambiguous, hasAdditional, flags };
}

/** A TIS's saved choice for one implementation. Stored in scoping_answers 'kickoff_deck'. */
export type KickoffChoice = {
  deckType: KickoffDeckType;
  /** The TIS confirmed the first form is ready to demonstrate. */
  formReady: boolean;
};

/**
 * What the presentation shows. Null when the deck type is not settled yet (the
 * presentation is blocked until the TIS chooses it).
 */
export type KickoffSelection = {
  deckType: KickoffDeckType;
  formReady: boolean;
  hasAdditional: boolean;
};

/**
 * The selection the presentation uses. A saved choice wins for the deck type and
 * the form readiness; the purchased additional solutions always come from the
 * record. A deck type that is neither saved nor recorded resolves to null.
 */
export function resolveKickoffSelection(
  saved: KickoffChoice | null | undefined,
  recommended: KickoffRecommendation,
): KickoffSelection | null {
  const deckType = saved?.deckType ?? recommended.deckType;
  if (!deckType) return null;
  return {
    deckType,
    formReady: saved?.formReady ?? false,
    hasAdditional: recommended.hasAdditional,
  };
}

/**
 * The slide keys the presentation shows, in order. Standard: the conditional
 * slide A after the journey (only with additional solutions) and the first form
 * after the communication slide (only when ready). Partner: P1 to P6, always.
 */
export function presentedSlideKeys(selection: KickoffSelection | null): string[] {
  if (!selection) return [];
  if (selection.deckType === "partner") return PARTNER_SLIDES.map((s) => s.key);
  return STANDARD_SLIDES.filter((s) => {
    if (s.when === "additional-solutions") return selection.hasAdditional;
    if (s.when === "form-ready") return selection.formReady;
    return true;
  }).map((s) => s.key);
}

/**
 * Whether the Kickoff presentation must be held back. It is held when a saved
 * deck configuration did not load (a read error or malformed data), and when the
 * deck type is unsettled (the signals disagree and nothing was saved). It never
 * falls back to a guessed deck.
 */
export function kickoffDeckBlocked(view: {
  kickoffDeck?: { loadError: string | null; selection: KickoffSelection | null } | null;
}): boolean {
  const deck = view.kickoffDeck;
  if (!deck) return false;
  return Boolean(deck.loadError) || deck.selection === null;
}

/** What the TIS sees about one implementation's Kickoff deck. Internal only; never on the customer's copy. */
export type KickoffDeckView = {
  /** Set when a read failed: the message to show. Null otherwise. */
  loadError: string | null;
  /** The implementation the choice is saved against. Null before it exists. */
  implementationId: string | null;
  /** The recommendation, with its reasons and the flags for the TIS. */
  recommended: KickoffRecommendation;
  /** What the presentation shows. Null when the deck type is unsettled and must be chosen. */
  selection: KickoffSelection | null;
  /** The saved choice, or null when the automatic choice applies. */
  saved: {
    savedAt: string;
    savedBy: string | null;
    deckType: KickoffDeckType;
    formReady: boolean;
  } | null;
  /** Whether the signed-in person may save or reset this deck. Set per viewer by the server; the server still enforces it. */
  canConfigure: boolean;
  /** The partner who leads, by name, when one is named. */
  partnerName: string | null;
  /** The purchased additional solutions, for slide A: name, kind and phase only. */
  additional: Array<{ kind: string; name: string; phase: number }>;
  /** The first form's name when one is named. */
  firstFormName: string | null;
};

/**
 * Who may save or reset an implementation's Kickoff deck. Only the presentation
 * choices are governed here; general deal editing, ownership and the kickoff-held
 * rule are separate and unchanged.
 *   - super_admin, admin, manager: any post-sale implementation.
 *   - implementation: only the implementation they are the assigned primary TIS of.
 *   - every other role: no deck-configuration authority.
 */
export function canConfigureKickoffDeck(input: {
  role: string | null | undefined;
  actorTeamMemberId: string | null;
  ownerTeamMemberId: string | null;
}): boolean {
  if (isManagerRole(input.role)) return true;
  return (
    input.role === "implementation" &&
    Boolean(input.actorTeamMemberId) &&
    input.actorTeamMemberId === input.ownerTeamMemberId
  );
}
