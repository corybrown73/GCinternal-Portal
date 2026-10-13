import { FIELD_FUSION_TEMPLATE_KEY } from "./field-fusion";
import type { IntakeAnswers } from "./intake-answers";
import { isStage, type AccountStage } from "./presale-stages";

/**
 * Partner Implementation: a GoCanvas implementation led by a partner through
 * setup, then handed to GoCanvas TIS. Client-safe configuration and pure
 * functions only. Nothing here writes a stage, moves a deal or changes the
 * handoff; the existing Field Fusion flow still runs exactly as before.
 *
 * Two things are kept apart on purpose:
 *   - the partner: who leads the setup ("Field Fusion IQ"), and
 *   - the implementation type: which journey the work follows.
 * Field Fusion is the first partner, not the name of the model.
 */

/** The partners this app knows. A partner is identity only; it carries no stages. */
export const PARTNER_KEYS = ["field_fusion_iq"] as const;
export type PartnerKey = (typeof PARTNER_KEYS)[number];

export type Partner = {
  key: PartnerKey;
  name: string;
  /**
   * The intake `path` that already identifies this partner's accounts. Those
   * records keep it; they are read as this partner through implementationTypeFor.
   */
  legacyIntakePath: "field_fusion" | null;
};

/**
 * The partners, as code. A new partner is one entry here and in PARTNER_KEYS:
 * no migration. The database checks only that a key is a well-formed slug, so
 * every registered key is accepted there (see migration 0083).
 */
export const PARTNERS: Readonly<Record<PartnerKey, Partner>> = {
  field_fusion_iq: {
    key: "field_fusion_iq",
    name: "Field Fusion IQ",
    legacyIntakePath: "field_fusion",
  },
};

/** Which journey an implementation follows. `standard` is the existing six-stage model, unchanged. */
export type ImplementationType = "standard" | "partner_implementation";

export type PartnerStageKey =
  | "pre_sale_poc"
  | "closed_won_planning"
  | "partner_setup"
  | "form_finalisation"
  | "pilot"
  | "trial_run"
  | "roll_out";

export type StageVisibility = "internal" | "customer";

/** Who holds the work on a stage: the partner before handoff, GoCanvas TIS after. */
export type StageOwner = "partner" | "gocanvas_tis";

export type PartnerStage = {
  key: PartnerStageKey;
  /** 1 to 7, in order. */
  position: number;
  label: string;
  description: string;
  /** Internal stages are the two commercial ones; the customer sees the rest. */
  visibility: StageVisibility;
  /**
   * LEGACY COMPATIBILITY ONLY. The deal stages that existing Field Fusion
   * records already sit in, read for display of those records. This is not
   * how partner progress is stored: Phase 2 persists each partner stage's own
   * record and completion. Empty where no legacy equivalent exists.
   */
  legacyDealStages: readonly AccountStage[];
};

/**
 * The canonical seven-stage partner journey, in order. `legacyDealStages` below
 * is a read-only bridge for existing Field Fusion records; it never marks a
 * partner stage complete.
 */
export const PARTNER_JOURNEY: readonly PartnerStage[] = [
  {
    key: "pre_sale_poc",
    position: 1,
    label: "Pre-Sale & POC",
    description: "Partner-led solution validation and proof of value.",
    visibility: "internal",
    legacyDealStages: ["prospect", "negotiate"],
  },
  {
    key: "closed_won_planning",
    position: 2,
    label: "Closed Won & Planning",
    description: "Confirm requirements, stakeholders and implementation planning.",
    visibility: "internal",
    legacyDealStages: ["closed_won"],
  },
  {
    key: "partner_setup",
    position: 3,
    label: "Partner Setup & Connection",
    description: "Partner configures the solution and establishes the technical connection.",
    visibility: "customer",
    legacyDealStages: ["field_fusion_setup"],
  },
  {
    key: "form_finalisation",
    position: 4,
    label: "Form Finalisation & Data Readiness",
    description: "TIS leads GoCanvas form and dataset preparation.",
    visibility: "customer",
    legacyDealStages: ["onboarding_kickoff"],
  },
  {
    key: "pilot",
    position: 5,
    label: "Pilot",
    description: "Customer tests; TIS supports and refines.",
    visibility: "customer",
    legacyDealStages: [],
  },
  {
    key: "trial_run",
    position: 6,
    label: "Trial Run",
    description: "End users test; TIS supports and refines.",
    visibility: "customer",
    legacyDealStages: [],
  },
  {
    key: "roll_out",
    position: 7,
    label: "Roll Out & Graduation",
    description: "Go live, training, acceptance and transition to support.",
    visibility: "customer",
    legacyDealStages: [],
  },
];

/**
 * The handoff boundary. The Implementation Ready milestone falls between these
 * two stages: before it the partner owns the setup, from it GoCanvas TIS owns
 * implementation and enablement, and the partner stays on for technical support
 * and escalations.
 */
export const IMPLEMENTATION_READY = {
  key: "implementation_ready",
  label: "Implementation Ready",
  afterStage: "partner_setup" satisfies PartnerStageKey,
  beforeStage: "form_finalisation" satisfies PartnerStageKey,
} as const;

/** What each side does, in words, for the handoff boundary. */
export const HANDOFF_ROLES = {
  before:
    "Partner Implementation Lead owns the setup; the partner technical team handles the connection work.",
  after:
    "GoCanvas TIS owns implementation and enablement; the partner remains available for technical support and escalations.",
} as const;

export function partnerStage(key: PartnerStageKey): PartnerStage {
  const found = PARTNER_JOURNEY.find((s) => s.key === key);
  if (!found) throw new Error(`Unknown partner stage: ${key}`);
  return found;
}

/** The stages the customer sees: from Partner Setup & Connection onward. */
export function customerStages(): PartnerStage[] {
  return PARTNER_JOURNEY.filter((s) => s.visibility === "customer");
}

/** Who holds a stage's work. Changes exactly once, at Implementation Ready. */
export function stageOwner(key: PartnerStageKey): StageOwner {
  const readyAt = partnerStage(IMPLEMENTATION_READY.afterStage).position;
  return partnerStage(key).position <= readyAt ? "partner" : "gocanvas_tis";
}

/**
 * LEGACY COMPATIBILITY ONLY: the partner stage an existing deal stage is shown
 * under, or null where there is no legacy equivalent. This is an entry read,
 * not progress. `onboarding_kickoff` marks the move into GoCanvas implementation
 * (the handoff), so it does not mean Form Finalisation & Data Readiness is done.
 */
export function legacyPartnerStageForDealStage(stage: AccountStage | string | null | undefined) {
  if (!stage || !isStage(stage)) return null;
  return (
    PARTNER_JOURNEY.find((s) => (s.legacyDealStages as readonly string[]).includes(stage)) ?? null
  );
}

export type ImplementationTypeInfo =
  | { type: "standard"; partner: null; legacy: false }
  | { type: "partner_implementation"; partner: PartnerKey; legacy: boolean };

/**
 * Which implementation type an account follows, and which partner leads it.
 *
 *  - An explicit partner on the intake wins: a Partner Implementation.
 *  - An account already on the Field Fusion intake path is read as that partner,
 *    with `legacy: true`. Its record is not rewritten.
 *  - Everything else is the standard six-stage model.
 */
export function implementationTypeFor(
  intake: Pick<IntakeAnswers, "path" | "partner_implementation">,
): ImplementationTypeInfo {
  const explicit = intake.partner_implementation?.partner_key;
  if (explicit) return { type: "partner_implementation", partner: explicit, legacy: false };
  const legacy = PARTNER_KEYS.find((k) => PARTNERS[k].legacyIntakePath === intake.path);
  if (legacy) return { type: "partner_implementation", partner: legacy, legacy: true };
  return { type: "standard", partner: null, legacy: false };
}

/** The journey template a Partner Implementation is built from (migration 0083). Any partner uses it. */
export const PARTNER_TEMPLATE_KEY = "partner-implementation";

/** The stage a Partner Implementation opens on: Closed Won & Planning, the template's first stage. */
export const PARTNER_INITIAL_STAGE: PartnerStageKey = "closed_won_planning";

/** The template's stages, in order: the partner journey from Closed Won & Planning onward. */
export const PARTNER_TEMPLATE_STAGE_KEYS: readonly PartnerStageKey[] = PARTNER_JOURNEY.filter(
  (s) => s.position >= 2,
).map((s) => s.key);

/** The partner an explicitly partner-led implementation names; null for legacy and standard. */
export function explicitPartnerKeyFor(
  intake: Pick<IntakeAnswers, "path" | "partner_implementation">,
): PartnerKey | null {
  const t = implementationTypeFor(intake);
  return t.type === "partner_implementation" && !t.legacy ? t.partner : null;
}

/**
 * The journey template a new implementation is built from. Legacy Field Fusion
 * keeps its own template; a new partner uses the partner template; standard
 * accounts keep the existing rules (no preferred template).
 */
export function templateKeyFor(
  intake: Pick<IntakeAnswers, "path" | "partner_implementation">,
): string | null {
  const t = implementationTypeFor(intake);
  if (t.type === "standard") return null;
  return t.legacy ? FIELD_FUSION_TEMPLATE_KEY : PARTNER_TEMPLATE_KEY;
}

/**
 * A new explicitly-partnered implementation must use the partner template. If
 * it is not published, the start is refused: never a silent standard fallback.
 */
export function requiresPartnerTemplate(
  intake: Pick<IntakeAnswers, "path" | "partner_implementation">,
): boolean {
  const t = implementationTypeFor(intake);
  return t.type === "partner_implementation" && !t.legacy;
}

/** The stage a new implementation opens on, when its journey is the partner one; null keeps the standard start. */
export function initialStageFor(
  intake: Pick<IntakeAnswers, "path" | "partner_implementation">,
): PartnerStageKey | null {
  return requiresPartnerTemplate(intake) ? PARTNER_INITIAL_STAGE : null;
}

/**
 * Whether an implementation runs the partner journey. Read from its stored
 * journey type or partner, so partner progress is never judged by the deal stage.
 */
export function isPartnerJourney(impl: {
  journey_type?: string | null;
  partner_key?: string | null;
}): boolean {
  return impl.journey_type === "partner_implementation" || Boolean(impl.partner_key);
}

/** The next stage in the template's own order, or null at the end. A step forward only. */
export function nextPartnerStage(order: readonly string[], current: string | null): string | null {
  if (!current) return null;
  const i = order.indexOf(current);
  if (i < 0 || i === order.length - 1) return null;
  return order[i + 1]!;
}

/** The live partner template id from rows read for it: published and not superseded. Null if none. */
export function liveTemplateId(
  rows: ReadonlyArray<{ id: string; key: string; status: string; superseded_by_id: string | null }>,
): string | null {
  const live = rows.find(
    (r) =>
      r.key === PARTNER_TEMPLATE_KEY && r.status === "published" && r.superseded_by_id === null,
  );
  return live?.id ?? null;
}

/**
 * Roll Out & Graduation's completion: "available" while the implementation is at
 * that stage and not yet done, "graduated" once it is complete. Null everywhere else.
 */
export type PartnerGraduation = "available" | "graduated" | null;

/** A Partner Implementation's move: where it is now, and the next partner stage (null at the end or at the handoff). */
export type PartnerMoveView = {
  currentLabel: string;
  next: PartnerStage | null;
  handoff: boolean;
  graduation: PartnerGraduation;
};

/**
 * The move a Partner Implementation can make from its current stage, in the
 * partner order. The Implementation Ready boundary is `handoff`: that move is
 * recorded by the handoff itself (its checks and the team member taking it),
 * never by a plain stage advance, so no advance control offers it.
 */
export function partnerMoveFrom(current: string | null): {
  next: PartnerStage | null;
  handoff: boolean;
} {
  if (!current || !PARTNER_JOURNEY.some((s) => s.key === current))
    return { next: null, handoff: false };
  if (current === IMPLEMENTATION_READY.afterStage) return { next: null, handoff: true };
  const key = nextPartnerStage(PARTNER_TEMPLATE_STAGE_KEYS, current);
  return { next: key ? partnerStage(key as PartnerStageKey) : null, handoff: false };
}

/**
 * The partners the selector offers: every registered partner, in registry order.
 * Adding a partner to PARTNERS and PARTNER_KEYS adds it here; nothing else changes.
 */
export function partnerOptions(
  registry: Readonly<Record<PartnerKey, Partner>> = PARTNERS,
): Array<{ key: PartnerKey; name: string }> {
  return (Object.keys(registry) as PartnerKey[]).map((k) => ({ key: k, name: registry[k].name }));
}

/**
 * The intake patch that chooses a Partner Implementation and its partner. The
 * same structure every partner path reads (partner_implementation), so no second
 * intake form or record is needed.
 */
export function partnerSelectionPatch(key: PartnerKey): {
  path: "partner_implementation";
  partner_implementation: { partner_key: PartnerKey };
} {
  return { path: "partner_implementation", partner_implementation: { partner_key: key } };
}

/**
 * Why a Partner Implementation cannot start yet, or null when it can. A partner
 * implementation with no registered partner is refused, never started on the
 * standard journey.
 */
export function partnerSelectionError(
  intake: Pick<IntakeAnswers, "path" | "partner_implementation">,
): string | null {
  if (intake.path !== "partner_implementation") return null;
  const key = intake.partner_implementation?.partner_key ?? null;
  if (!key) return "Choose which partner leads this Partner Implementation before it starts.";
  if (!(PARTNER_KEYS as readonly string[]).includes(key)) {
    return `"${key}" is not a registered partner, so the implementation cannot start.`;
  }
  return null;
}
