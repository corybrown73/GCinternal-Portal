/**
 * The training plan of an implementation: what the customer needs to be able to do,
 * who is responsible for getting them there, what was delivered, and whether the
 * customer has shown it.
 *
 * Three things are kept apart on purpose:
 *   - topics covered: a need exists for the topic;
 *   - training delivered: a person recorded it was delivered, on a date;
 *   - readiness shown: the customer demonstrated the capability, with evidence.
 *
 * Responsibility is never assumed. It is GoCanvas, Customer or Partner, and its source
 * is either the signed SOW (the wording is kept) or a TIS confirmation. A purchased
 * training item does not set it.
 *
 * Pure: no database, no request. The database functions (0092) enforce the same rules
 * on every write; this module lets the screens and the proposal approval say why before
 * anything is written.
 */

/** A purchase record item, as complete-solutions reads it from the deal's intake. */
export type PurchaseItem = { id: string; kind: string; name: string };

export const TRAINING_RESPONSIBILITIES = ["gocanvas", "customer", "partner"] as const;
export type TrainingResponsibility = (typeof TRAINING_RESPONSIBILITIES)[number];
export const RESPONSIBILITY_LABEL: Record<TrainingResponsibility, string> = {
  gocanvas: "GoCanvas",
  customer: "Customer",
  partner: "Partner",
};

export const RESPONSIBILITY_SOURCES = ["sow", "tis_confirmed"] as const;
export type ResponsibilitySource = (typeof RESPONSIBILITY_SOURCES)[number];
export const SOURCE_LABEL: Record<ResponsibilitySource, string> = {
  sow: "From the SOW",
  tis_confirmed: "Confirmed by TIS",
};
/** The same sources, as they read inside a sentence. */
const SOURCE_IN_SENTENCE: Record<ResponsibilitySource, string> = {
  sow: "from the SOW",
  tis_confirmed: "confirmed by TIS",
};

export const TRAINING_METHODS = ["session", "self_paced", "recorded", "document", "other"] as const;
export type TrainingMethod = (typeof TRAINING_METHODS)[number];
export const METHOD_LABEL: Record<TrainingMethod, string> = {
  session: "Live session",
  self_paced: "Self-paced",
  recorded: "Recording",
  document: "Written guide",
  other: "Other",
};

export const DEMONSTRATED_STATUSES = [
  "not_assessed",
  "not_yet",
  "practice_needed",
  "demonstrated",
] as const;
export type DemonstratedStatus = (typeof DEMONSTRATED_STATUSES)[number];
export const DEMONSTRATED_LABEL: Record<DemonstratedStatus, string> = {
  not_assessed: "Not yet assessed",
  not_yet: "Not yet shown",
  practice_needed: "Shown, with practice still needed",
  demonstrated: "Demonstrated",
};

/** A training need as the screens and the approval read it. */
export type TrainingNeed = {
  id: string;
  implementationId: string;
  topic: string;
  audience: string | null;
  outcome: string | null;
  method: TrainingMethod | null;
  responsibility: TrainingResponsibility | null;
  responsibilitySource: ResponsibilitySource | null;
  sowQuote: string | null;
  purchasedServiceId: string | null;
  solutionComponentId: string | null;
  adoptionAreaId: string | null;
  /** A date, as YYYY-MM-DD. Set when a person records that the training was delivered. */
  deliveredAt: string | null;
  demonstratedStatus: DemonstratedStatus;
  demonstratedEvidenceId: string | null;
  nextStep: string | null;
  archivedAt: string | null;
  /** The row's version. A change made from an older one is refused. */
  updatedAt: string;
};

/** The database row (snake_case) as the training table returns it. */
export function needFromRow(row: Record<string, unknown>): TrainingNeed {
  const s = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  return {
    id: String(row["id"]),
    implementationId: String(row["implementation_id"]),
    topic: String(row["topic"] ?? ""),
    audience: s(row["audience"]),
    outcome: s(row["outcome"]),
    method: (s(row["method"]) as TrainingMethod | null) ?? null,
    responsibility: (s(row["responsibility"]) as TrainingResponsibility | null) ?? null,
    responsibilitySource: (s(row["responsibility_source"]) as ResponsibilitySource | null) ?? null,
    sowQuote: s(row["sow_quote"]),
    purchasedServiceId: s(row["purchased_service_id"]),
    solutionComponentId: s(row["solution_component_id"]),
    adoptionAreaId: s(row["adoption_area_id"]),
    deliveredAt: s(row["delivered_at"]),
    demonstratedStatus:
      (s(row["demonstrated_status"]) as DemonstratedStatus | null) ?? "not_assessed",
    demonstratedEvidenceId: s(row["demonstrated_evidence_id"]),
    nextStep: s(row["next_step"]),
    archivedAt: s(row["archived_at"]),
    updatedAt: String(row["updated_at"]),
  };
}

export type Check = { ok: true } | { ok: false; reason: string };
const ok: Check = { ok: true };
const no = (reason: string): Check => ({ ok: false, reason });

/**
 * A responsibility is set with its source, or not at all. A SOW source needs the
 * wording it comes from. Nothing here fills in a default.
 */
export function responsibilityCheck(
  responsibility: string | null | undefined,
  source: string | null | undefined,
  sowQuote: string | null | undefined,
): Check {
  const r = responsibility || null;
  const s = source || null;
  if (!r && !s) return ok;
  if (!r || !s)
    return no("A responsibility needs its source, and a source needs a responsibility.");
  if (!(TRAINING_RESPONSIBILITIES as readonly string[]).includes(r)) {
    return no("Responsibility is GoCanvas, Customer or Partner.");
  }
  if (!(RESPONSIBILITY_SOURCES as readonly string[]).includes(s)) {
    return no("The source of a responsibility is the SOW or a TIS confirmation.");
  }
  if (s === "sow" && !(sowQuote ?? "").trim()) {
    return no("A responsibility taken from the SOW needs the SOW wording it comes from.");
  }
  return ok;
}

export type NeedInput = {
  topic?: string | null;
  audience?: string | null;
  outcome?: string | null;
  method?: string | null;
  responsibility?: string | null;
  responsibilitySource?: string | null;
  sowQuote?: string | null;
  nextStep?: string | null;
};

/** Whether a set of fields may be written. `requireTopic` is true when adding a need. */
export function needInputCheck(input: NeedInput, opts: { requireTopic: boolean }): Check {
  if (opts.requireTopic && !(input.topic ?? "").trim()) return no("A training needs a topic.");
  if (input.topic !== undefined && input.topic !== null && !input.topic.trim()) {
    return no("A training needs a topic.");
  }
  if (input.method && !(TRAINING_METHODS as readonly string[]).includes(input.method)) {
    return no(
      "Pick a method the Hub offers: live session, self-paced, recording, written guide or other.",
    );
  }
  return responsibilityCheck(input.responsibility, input.responsibilitySource, input.sowQuote);
}

/**
 * Readiness is shown with evidence, and leaving "demonstrated" needs a reason. The
 * other statuses have no evidence.
 */
export function demonstrationCheck(input: {
  status: string;
  evidenceId: string | null | undefined;
  previousStatus: DemonstratedStatus;
  reason: string | null | undefined;
}): Check {
  if (!(DEMONSTRATED_STATUSES as readonly string[]).includes(input.status)) {
    return no("Readiness is not assessed, not yet, practice needed, or demonstrated.");
  }
  if (input.status === "demonstrated" && !input.evidenceId) {
    return no("Readiness is shown with evidence. Attach the evidence first.");
  }
  if (
    input.previousStatus === "demonstrated" &&
    input.status !== "demonstrated" &&
    !(input.reason ?? "").trim()
  ) {
    return no("Say why readiness is no longer shown as demonstrated.");
  }
  return ok;
}

/** Active needs only: archived ones are kept, but do not count. */
function active(needs: ReadonlyArray<TrainingNeed>): TrainingNeed[] {
  return needs.filter((n) => !n.archivedAt);
}

export type TrainingCoverage = {
  /** Active training needs. */
  topics: number;
  /** Active needs with a delivery date. */
  delivered: number;
  /** Active needs whose readiness is demonstrated. */
  demonstrated: number;
  /** Active needs shown, with practice still needed. */
  practiceNeeded: number;
  /** Active needs with no confirmed responsibility. These must be confirmed, not defaulted. */
  needsConfirmation: TrainingNeed[];
  /** Confirmed responsibility, by party. */
  responsibility: Record<TrainingResponsibility, number>;
  /** Purchased training items that no active need covers. */
  uncovered: PurchaseItem[];
};

/**
 * What the plan says about coverage, delivery and readiness, computed from the
 * purchase record and the needs. Nothing here is stored.
 */
export function trainingCoverage(
  services: ReadonlyArray<PurchaseItem>,
  needs: ReadonlyArray<TrainingNeed>,
): TrainingCoverage {
  const live = active(needs);
  const linked = new Set(live.map((n) => n.purchasedServiceId).filter((id): id is string => !!id));
  const responsibility: Record<TrainingResponsibility, number> = {
    gocanvas: 0,
    customer: 0,
    partner: 0,
  };
  for (const n of live) {
    if (n.responsibility && n.responsibilitySource) responsibility[n.responsibility] += 1;
  }
  return {
    topics: live.length,
    delivered: live.filter((n) => !!n.deliveredAt).length,
    demonstrated: live.filter((n) => n.demonstratedStatus === "demonstrated").length,
    practiceNeeded: live.filter((n) => n.demonstratedStatus === "practice_needed").length,
    needsConfirmation: live.filter((n) => !n.responsibility || !n.responsibilitySource),
    responsibility,
    uncovered: services.filter((s) => s.kind === "training" && !linked.has(s.id)),
  };
}

/**
 * A purchased training item with no need yet, offered to the TIS as a one-click pre-fill.
 * It is never created automatically.
 */
export function suggestedNeedsFor(
  services: ReadonlyArray<PurchaseItem>,
  needs: ReadonlyArray<TrainingNeed>,
): Array<{ purchasedServiceId: string; topic: string }> {
  return trainingCoverage(services, needs).uncovered.map((s) => ({
    purchasedServiceId: s.id,
    topic: s.name,
  }));
}

/** The one line a person reads for a need's responsibility. */
export function responsibilityText(
  n: Pick<TrainingNeed, "responsibility" | "responsibilitySource">,
): string {
  if (!n.responsibility || !n.responsibilitySource) return "Needs confirmation";
  return `${RESPONSIBILITY_LABEL[n.responsibility]} (${SOURCE_IN_SENTENCE[n.responsibilitySource]})`;
}

/**
 * Delivered and shown are different statements. This is the wording a person sees for
 * both on the same row, so neither reads as the other.
 */
export function progressText(n: Pick<TrainingNeed, "deliveredAt" | "demonstratedStatus">): {
  delivered: string;
  readiness: string;
} {
  return {
    delivered: n.deliveredAt ? `Delivered ${n.deliveredAt}` : "Not recorded as delivered",
    readiness: DEMONSTRATED_LABEL[n.demonstratedStatus],
  };
}

/**
 * The fields one approved change writes. Approving a responsibility is the TIS
 * confirming it, so its source is "tis_confirmed", never "sow": a transcript can say who
 * is responsible, but only the contract can make it a contractual responsibility.
 */
export function fieldPatchFor(field: string, value: string): NeedInput {
  switch (field) {
    case "topic":
      return { topic: value };
    case "audience":
      return { audience: value };
    case "outcome":
      return { outcome: value };
    case "method":
      return { method: value };
    case "responsibility":
      return { responsibility: value, responsibilitySource: "tis_confirmed" };
    default:
      return {};
  }
}
