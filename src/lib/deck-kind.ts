/**
 * Which deck a deal gets.
 *
 * TWO PATHS, and they are genuinely different meetings.
 *
 *  - NEW LOGO. Nobody at this company has used GoCanvas. The kickoff is about
 *    getting one workflow into the hands of one crew, and the deck sequences
 *    the work: make it easy, make it visible, THEN make it connected. That
 *    order is not a preference. The field mapping cannot be right until the
 *    form has survived a real job — build the integration first and you map
 *    against fields the crew turns out not to use.
 *
 *  - EXPANSION. They already run GoCanvas, and an account manager has sold
 *    them something more — usually an integration. The meeting is not "here is
 *    what GoCanvas does"; it is "here is what connecting QuickBooks to the
 *    forms you already run will take, and what it gives back". Different
 *    questions, different deck.
 *
 * HOW WE TELL. The journey template already encodes it — `new-logo` versus
 * `integration` / `add-on` / `data-migration` — so a project that has one is
 * simply asked. Mind the separator: `journey_templates.key` is hyphenated but
 * `implementations.journey_type` is underscored (`new_logo`), so the key is
 * canonicalised before it is matched. Comparing raw would match nothing and
 * quietly call every project a new logo.
 *
 * Before handoff there is no project, so the question becomes whether this
 * customer has ever run an implementation before. A second implementation for
 * a customer who already has one is an expansion by definition.
 *
 * Pure, so the rule is testable and stated once.
 */

export type DeckKind = "new-logo" | "expansion";

export type DeckKindSignal = {
  /** The journey template key on the project, once one exists. */
  journeyKey: string | null;
  /** How many implementations this customer already has, excluding this one. */
  priorImplementations: number;
  /** What the deal itself was sold as, if anybody recorded it. */
  products: string[] | null;
};

export type DeckKindDecision = {
  kind: DeckKind;
  /** Why, in the words the UI shows. Never a code — somebody has to act on it. */
  reason: string;
};

/** Template keys that are, by definition, work for a customer we already have. */
const EXPANSION_KEYS = new Set(["integration", "add-on", "data-migration", "upsell"]);

export function deckKindFor(signal: DeckKindSignal): DeckKindDecision {
  // `_` and `-` are the same word here: the two columns that carry this value
  // disagree on the separator, and either may be handed to us.
  const key = signal.journeyKey?.trim().toLowerCase().replace(/_/g, "-") || null;

  // The project's own template is the strongest signal, because somebody chose
  // it. It beats a count of prior work either way.
  if (key && EXPANSION_KEYS.has(key)) {
    return {
      kind: "expansion",
      reason: `Running the ${key.replace(/-/g, " ")} journey — this is work for a customer we already have.`,
    };
  }
  if (key === "new-logo") {
    return {
      kind: "new-logo",
      reason:
        signal.priorImplementations > 0
          ? "Running the new-logo journey, though this customer already has other projects — check the template is right."
          : "Running the new-logo journey.",
    };
  }

  // No project yet, or a template nobody recognises. A customer with existing
  // work is not a new logo, whatever the deal was called.
  if (signal.priorImplementations > 0) {
    return {
      kind: "expansion",
      reason: `This customer already has ${signal.priorImplementations} project${
        signal.priorImplementations === 1 ? "" : "s"
      }, so this is an expansion rather than a first rollout.`,
    };
  }

  return {
    kind: "new-logo",
    reason: "First project for this customer.",
  };
}

/**
 * The rule the new-logo deck exists to hold, in one place.
 *
 * Stated as prose because it is read aloud in a meeting, and because the
 * reason matters more than the rule: a customer who understands WHY the
 * integration waits stops pushing for it in week two.
 */
export const PHASE_GATE = {
  headline: "The form gets proven in the field before anything is connected.",
  why: "Field mapping is the whole of an integration, and it cannot be right until a crew has used the form on a real job. Build the connection first and you map against fields your crews turn out not to use.",
  phases: [
    {
      number: "Phase 1",
      title: "Make the work easy",
      detail: "One workflow, one crew, real jobs. We change what they tell us to change.",
    },
    {
      number: "Phase 2",
      title: "Make the work visible",
      detail: "The office sees the work as it happens, and the reports come out of it.",
    },
    {
      number: "Phase 3",
      title: "Make the process connected",
      detail: "Now the fields are settled, we remove the manual handoffs to your other systems.",
    },
  ],
} as const;
