/**
 * The Kickoff deck's slide library, its recommendation, and the resolution of a
 * saved selection. Pure: no database, no React. The server reads the facts; the
 * Kickoff View and the Presenter Workspace read the result.
 *
 * THE LIBRARY. Four core slides are always in the presentation and keep their
 * narrative place. The other slides are optional: the TIS includes or excludes
 * them and reorders them, but only within their zone, so the story never reads
 * out of sequence. A slide's zone is fixed by what it does in the meeting:
 * before the journey it says what is being set up; after it, how the team works.
 *
 * THE RECOMMENDATION. A starting point built from confirmed implementation facts
 * (the path, training-only, the purchased services, the first form, the partner)
 * and the existing deck classification. Each inclusion carries its reason, and
 * anything missing or contradictory is returned as a flag for the TIS, never
 * filled in as an assumption.
 *
 * PRECEDENCE. A TIS's saved selection for an implementation replaces the
 * recommendation for that implementation. A new recommendation never overwrites
 * it; the TIS can reset to the recommendation on purpose.
 */

export type KickoffZone = "start" | "before" | "journey" | "after" | "end";

export type KickoffSlideMeta = {
  key: string;
  label: string;
  /** Always in the presentation; the TIS cannot remove it. */
  core: boolean;
  zone: KickoffZone;
};

/** Library order is the narrative order of the core slides; the optional ones sit in their zone. */
export const KICKOFF_SLIDES: ReadonlyArray<KickoffSlideMeta> = [
  { key: "kickoff-cover", label: "Welcome and introductions", core: true, zone: "start" },
  { key: "kickoff-achieve", label: "What we're here to achieve", core: true, zone: "start" },
  { key: "kickoff-workflow", label: "Your workflow", core: false, zone: "before" },
  {
    key: "kickoff-purchased",
    label: "Purchased solutions and deliverables",
    core: false,
    zone: "before",
  },
  { key: "kickoff-partner", label: "Working with your partner", core: false, zone: "before" },
  { key: "kickoff-journey", label: "Your implementation journey", core: true, zone: "journey" },
  { key: "kickoff-training", label: "Training and enablement", core: false, zone: "after" },
  {
    key: "kickoff-communication",
    label: "Responsibilities and communication",
    core: false,
    zone: "after",
  },
  { key: "kickoff-form-v1", label: "Your first form (Form V1)", core: false, zone: "after" },
  { key: "kickoff-next", label: "Next steps and commitments", core: true, zone: "end" },
];

export const CORE_SLIDE_KEYS: readonly string[] = KICKOFF_SLIDES.filter((s) => s.core).map(
  (s) => s.key,
);

/** Optional slides in their default order (zone, then library order). */
export const OPTIONAL_SLIDE_KEYS: readonly string[] = KICKOFF_SLIDES.filter((s) => !s.core).map(
  (s) => s.key,
);

const KNOWN = new Set(KICKOFF_SLIDES.map((s) => s.key));

export type KickoffSelection = {
  /** Optional slide keys to show. Core slides are never listed here. */
  included: string[];
  /** Every optional slide key, in the TIS's order. Zones keep their place. */
  order: string[];
};

/** The facts the recommendation reads. Each is confirmed data, or null/false when it is not. */
export type KickoffFacts = {
  /** intake.path, or null when nobody has set it. */
  path: string | null;
  trainingOnly: boolean;
  /** An existing customer adding work (the deck classification or the path says so). */
  expansion: boolean;
  /** A partner-led implementation. */
  partnerLed: boolean;
  /** The partner's name, when the partner is named. */
  partnerName: string | null;
  /** Purchased services, from the SOW read and the plan. Customer-safe fields only. */
  services: Array<{ kind: string; name: string }>;
  /** Whether solutions were sold: true, false, or null when nobody has said. */
  solutionsInvolved: boolean | null;
  /** A first form is named (by anyone). */
  firstFormNamed: boolean;
  /** The first form is confirmed by a person, not read from the paperwork. */
  firstFormConfirmed: boolean;
  /** An implementation exists to save the configuration against. */
  hasImplementation: boolean;
};

export type KickoffRecommendation = {
  included: string[];
  /** Why each recommended slide is in, in plain words. */
  reasons: Record<string, string>;
  /** What is missing or contradictory, for the TIS to resolve before presenting. */
  flags: string[];
};

const PAID_FORM = "paid_form";
const TRAINING = "training";

/**
 * The starting selection. Rules, in plain terms:
 *  - Training is recommended for a training-only deal, for any deal that bought
 *    training, and for every new customer. It is never recommended for an
 *    existing customer who bought no training: that is first-time content.
 *  - The form and its workflow are recommended only where the form is confirmed:
 *    a person has named the first form on a new customer, or a paid form was
 *    bought. A training-only deal never gets the form. An existing customer gets
 *    the workflow (their existing one), but not the form unless a form was bought.
 *  - Purchased solutions are recommended when something other than training was bought.
 *  - The partner slide is recommended for a partner-led implementation. Solution
 *    scope and partner delivery are not exclusive: both can be recommended.
 *  - Responsibilities and communication is recommended for every deal.
 */
export function recommendKickoffSlides(f: KickoffFacts): KickoffRecommendation {
  const reasons: Record<string, string> = {};
  const flags: string[] = [];
  const include = (key: string, reason: string) => {
    reasons[key] = reason;
  };

  const newCustomer = !f.expansion && !f.partnerLed;
  const hasPaidForm = f.services.some((s) => s.kind === PAID_FORM);
  const hasTraining = f.services.some((s) => s.kind === TRAINING);
  const hasOther = f.services.some((s) => s.kind !== TRAINING);

  // The form is confirmed only by a person's answer or a bought form, never by
  // the training-only setting, and never by a paperwork read alone.
  const formConfirmed = !f.trainingOnly && (hasPaidForm || (newCustomer && f.firstFormConfirmed));

  if (f.trainingOnly || hasTraining || newCustomer) {
    include(
      "kickoff-training",
      f.trainingOnly
        ? "Training only: this is the content the crew needs."
        : hasTraining
          ? "Training is part of what was bought."
          : "A new customer's crew needs training.",
    );
  }
  if (hasOther) {
    include("kickoff-purchased", "Solutions and deliverables were bought.");
  }
  if (formConfirmed) {
    include(
      "kickoff-form-v1",
      hasPaidForm ? "A paid form was bought." : "The first form is confirmed.",
    );
  }
  if (formConfirmed || f.expansion) {
    include(
      "kickoff-workflow",
      formConfirmed
        ? "The workflow the first form supports."
        : "Their existing workflows, which the new scope depends on.",
    );
  }
  if (f.partnerLed) {
    include(
      "kickoff-partner",
      "A partner leads the setup, so the handoffs are part of the meeting.",
    );
  }
  include("kickoff-communication", "How we work together is covered for every customer.");

  // What is missing or contradictory. Each is for the TIS to resolve; none is assumed.
  if (f.path === null) {
    flags.push(
      "The account type is not set on the deal. It is treated as a new customer; confirm it before presenting.",
    );
  }
  if (f.trainingOnly && hasPaidForm) {
    flags.push(
      "Training only is set, but a paid form is listed. The form is left out until this is resolved.",
    );
  }
  if (f.solutionsInvolved === null && f.services.length === 0 && !f.trainingOnly) {
    flags.push(
      "Whether solutions were sold is not recorded, so the deliverables slide is left out.",
    );
  }
  if (f.solutionsInvolved === true && f.services.length === 0) {
    flags.push(
      "Solutions were sold but none are listed, so the deliverables slide is left out. Add them to the plan.",
    );
  }
  if (newCustomer && !f.trainingOnly && !hasPaidForm && f.firstFormNamed && !f.firstFormConfirmed) {
    flags.push(
      "The first form was read from the paperwork and is not confirmed, so the form slide is left out.",
    );
  }
  if (newCustomer && !f.trainingOnly && !hasPaidForm && !f.firstFormNamed) {
    flags.push(
      "No first form is named, so the form slide is left out. Name it, or mark the deal training-only.",
    );
  }
  if (f.partnerLed && !f.partnerName) {
    flags.push(
      "Partner-led, but the partner is not named. The partner slide cannot say who leads.",
    );
  }
  if (!f.hasImplementation) {
    flags.push("There is no implementation yet, so this configuration cannot be saved.");
  }

  return { included: OPTIONAL_SLIDE_KEYS.filter((k) => k in reasons), reasons, flags };
}

/** The selection a TIS would see before anything is saved: the recommendation, in default order. */
export function defaultSelection(recommended: KickoffRecommendation): KickoffSelection {
  return { included: recommended.included, order: [...OPTIONAL_SLIDE_KEYS] };
}

/**
 * The selection the presentation uses. A saved selection wins, in full: its
 * included list and order, with any unknown keys dropped and any optional slide
 * the save did not mention placed in default order after the saved ones (and
 * left out of the presentation, since the TIS has seen the list without it).
 */
export function resolveKickoffSelection(
  saved: { included: string[]; order: string[] } | null | undefined,
  recommended: KickoffRecommendation,
): KickoffSelection {
  if (!saved) return defaultSelection(recommended);
  const order = dedupe([
    ...saved.order.filter((k) => KNOWN.has(k) && !CORE_SLIDE_KEYS.includes(k)),
    ...OPTIONAL_SLIDE_KEYS,
  ]);
  const included = new Set(
    saved.included.filter((k) => KNOWN.has(k) && !CORE_SLIDE_KEYS.includes(k)),
  );
  return { included: order.filter((k) => included.has(k)), order };
}

/** The optional keys in the order they are presented: zones in library order, the TIS's order within each. */
export function presentedOptionalKeys(selection: KickoffSelection): string[] {
  const included = new Set(selection.included);
  const out: string[] = [];
  for (const zone of ["before", "after"] as const) {
    for (const key of selection.order) {
      if (!included.has(key)) continue;
      if (KICKOFF_SLIDES.find((s) => s.key === key)?.zone === zone) out.push(key);
    }
  }
  return out;
}

/**
 * The presented slide keys, in order: the core start, the optional slides
 * before the journey, the journey, the optional slides after it, and the close.
 */
export function presentedSlideKeys(selection: KickoffSelection): string[] {
  const optional = presentedOptionalKeys(selection);
  const before = optional.filter((k) => KICKOFF_SLIDES.find((s) => s.key === k)?.zone === "before");
  const after = optional.filter((k) => KICKOFF_SLIDES.find((s) => s.key === k)?.zone === "after");
  return [
    "kickoff-cover",
    "kickoff-achieve",
    ...before,
    "kickoff-journey",
    ...after,
    "kickoff-next",
  ];
}

/** Move one optional slide up or down within its own zone. Core slides and zone boundaries never move. */
export function moveWithinZone(order: string[], key: string, direction: -1 | 1): string[] {
  const zone = KICKOFF_SLIDES.find((s) => s.key === key)?.zone;
  if (!zone || CORE_SLIDE_KEYS.includes(key)) return order;
  const inZone = order.filter((k) => KICKOFF_SLIDES.find((s) => s.key === k)?.zone === zone);
  const at = inZone.indexOf(key);
  const to = at + direction;
  if (at < 0 || to < 0 || to >= inZone.length) return order;
  const swapped = [...inZone];
  [swapped[at], swapped[to]] = [swapped[to]!, swapped[at]!];
  // Put the zone's slides back in place, in their new order, around the other zones.
  let i = 0;
  return order.map((k) => {
    if (KICKOFF_SLIDES.find((s) => s.key === k)?.zone !== zone) return k;
    return swapped[i++]!;
  });
}

/** The saved selection, as stored on the deal's intake, per implementation. */
export type SavedKickoffDeck = {
  included: string[];
  order: string[];
  saved_at: string;
  saved_by: string | null;
};

/**
 * Merge a save into the deal's stored configurations. Only the implementations
 * named in the save change; a null removes that implementation's saved
 * selection, so the recommendation applies again.
 */
export function mergeKickoffDeck(
  current: Record<string, SavedKickoffDeck> | null | undefined,
  patch: Record<string, SavedKickoffDeck | null> | null | undefined,
): Record<string, SavedKickoffDeck> {
  const out: Record<string, SavedKickoffDeck> = { ...(current ?? {}) };
  for (const [implementationId, value] of Object.entries(patch ?? {})) {
    if (value === null) delete out[implementationId];
    else out[implementationId] = value;
  }
  return out;
}

/**
 * Whether a save touches only the kickoff deck. Such a save must change no
 * stage, owner, task or milestone, so it skips the post-save journey work.
 */
export function isKickoffDeckOnlyPatch(patch: Record<string, unknown>): boolean {
  const keys = Object.keys(patch);
  return keys.length > 0 && keys.every((k) => k === "kickoff_deck");
}

function dedupe(keys: string[]): string[] {
  return [...new Set(keys)];
}

/** What the TIS sees about one implementation's Kickoff deck. Internal only; never on the customer's copy. */
export type KickoffDeckView = {
  /** The implementation the configuration is saved against. Null before it exists. */
  implementationId: string | null;
  /** The existing deck classification, and why. */
  kind: "new-logo" | "expansion" | "partner";
  kindReason: string;
  /** The recommendation, with its reasons and the flags for the TIS. */
  recommended: KickoffRecommendation;
  /** What the presentation shows: the saved selection, or the recommendation. */
  selection: KickoffSelection;
  /** The saved record, or null when the recommendation applies. */
  saved: { savedAt: string; savedBy: string | null } | null;
  /** The recommendation has changed since the TIS saved, so the saved selection stands and this is said. */
  recommendationChanged: boolean;
  /** The partner who leads, by name, when one is named. */
  partnerName: string | null;
  /** What was bought, for the slides: name, kind and phase only. Nothing internal. */
  purchased: Array<{ kind: string; name: string; phase: number }>;
};
