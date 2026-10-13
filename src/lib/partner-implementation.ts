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
   * The deal stages that hold this partner stage today. Empty where storage has
   * no equivalent yet (see the dependencies in the PR): the stage exists in the
   * configuration, and nothing maps a deal to it.
   */
  dealStages: readonly AccountStage[];
};

/** The canonical seven-stage partner journey, in order. */
export const PARTNER_JOURNEY: readonly PartnerStage[] = [
  {
    key: "pre_sale_poc",
    position: 1,
    label: "Pre-Sale & POC",
    description: "Partner-led solution validation and proof of value.",
    visibility: "internal",
    dealStages: ["prospect", "negotiate"],
  },
  {
    key: "closed_won_planning",
    position: 2,
    label: "Closed Won & Planning",
    description: "Confirm requirements, stakeholders and implementation planning.",
    visibility: "internal",
    dealStages: ["closed_won"],
  },
  {
    key: "partner_setup",
    position: 3,
    label: "Partner Setup & Connection",
    description: "Partner configures the solution and establishes the technical connection.",
    visibility: "customer",
    dealStages: ["field_fusion_setup"],
  },
  {
    key: "form_finalisation",
    position: 4,
    label: "Form Finalisation & Data Readiness",
    description: "TIS leads GoCanvas form and dataset preparation.",
    visibility: "customer",
    dealStages: ["onboarding_kickoff"],
  },
  {
    key: "pilot",
    position: 5,
    label: "Pilot",
    description: "Customer tests; TIS supports and refines.",
    visibility: "customer",
    dealStages: [],
  },
  {
    key: "trial_run",
    position: 6,
    label: "Trial Run",
    description: "End users test; TIS supports and refines.",
    visibility: "customer",
    dealStages: [],
  },
  {
    key: "roll_out",
    position: 7,
    label: "Roll Out & Graduation",
    description: "Go live, training, acceptance and transition to support.",
    visibility: "customer",
    dealStages: [],
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

/** The partner stage a deal stage corresponds to today, or null where none does. */
export function partnerStageForDealStage(stage: AccountStage | string | null | undefined) {
  if (!stage || !isStage(stage)) return null;
  return PARTNER_JOURNEY.find((s) => (s.dealStages as readonly string[]).includes(stage)) ?? null;
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
