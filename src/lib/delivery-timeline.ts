/**
 * Suggested delivery dates for the Kickoff decks.
 *
 * Precedence, first that applies wins:
 *   1. Expedited delivery the SOW states with a date. Subject to resource review.
 *   2. The SOW's Delivery Timeline duration, in the SOW's own unit, from the
 *      condition the SOW names (never from kickoff by default).
 *   3. The complexity-tier target, in business days from the close.
 *
 * Pure: no database, no React. Nothing here is agreed with the customer, changes
 * a stage, or moves a milestone. A suggestion is a proposal the TIS sees, edits and
 * saves; the decks label it "proposed", never "agreed".
 */

import { addBusinessDays } from "./onboarding-timeline";

/** The SOW's starting condition, as the paragraph states it. */
export type SowStartCondition = "forms_finalised" | "kickoff" | "signing" | "unstated";

/** A duration in the unit the SOW prints. Never converted to another unit. */
export type SowDuration = {
  /** The duration as printed, e.g. "4 to 6 weeks". */
  text: string;
  unit: "day" | "week" | "month";
  min: number;
  max: number;
};

export type SowDeliveryTimeline = {
  /** The paragraph as printed, verbatim (whitespace collapsed), kept as the source. */
  quote: string;
  /** The stated duration, or null when the paragraph states none (then it is not usable for a date). */
  duration: SowDuration | null;
  startCondition: SowStartCondition;
  /** The words the SOW uses for the start, when it names one. */
  startText: string | null;
  /** Customer deliverables the paragraph says can move the timeline. */
  dependencies: string[];
};

/**
 * Complexity-tier targets, in BUSINESS days from the close (weekends and the
 * deal's holidays skipped). Used only when the SOW gives no usable delivery
 * timeline and no expedited date. Tier 0 (no integration) counts as Tier 1.
 */
export const TIER_TARGET_BUSINESS_DAYS: Readonly<Record<1 | 2 | 3 | 4 | 5, number>> = {
  1: 30,
  2: 45,
  3: 90,
  4: 120,
  5: 150,
};

const DAY_MS = 86_400_000;

/** Calendar-day arithmetic on ISO dates, in UTC so no local zone can move a day. */
export function addCalendarDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Calendar-month arithmetic, clamped to the end of a shorter month. */
export function addCalendarMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

/**
 * Add a SOW duration to a start day, in the duration's own unit. Days and weeks
 * are calendar days, as printed; months are calendar months. Business days are
 * never used for a SOW duration: the SOW did not say business days.
 */
export function addSowDuration(start: string, amount: number, unit: SowDuration["unit"]): string {
  if (unit === "month") return addCalendarMonths(start, amount);
  if (unit === "week") return addCalendarDays(start, amount * 7);
  return addCalendarDays(start, amount);
}

const UNIT: Record<string, SowDuration["unit"]> = { day: "day", week: "week", month: "month" };
const unitOf = (word: string): SowDuration["unit"] | null =>
  UNIT[word.toLowerCase().replace(/s$/, "")] ?? null;

function classifyStart(text: string): SowStartCondition {
  if (/finali[sz]|complete/i.test(text) && /form|document|edit|build|deliverable/i.test(text)) {
    return "forms_finalised";
  }
  if (/kickoff/i.test(text)) return "kickoff";
  if (/sign|execut|effective/i.test(text)) return "signing";
  return "unstated";
}

/**
 * Read the Delivery Timeline paragraph. Returns null only for no text at all. A
 * paragraph with no stated duration is returned with `duration: null`: kept as the
 * source, but not usable for a date.
 */
export function parseDeliveryTimeline(raw: string | null | undefined): SowDeliveryTimeline | null {
  const quote = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!quote) return null;

  let duration: SowDuration | null = null;
  const range =
    /\b(\d+(?:\.\d+)?)\s*(?:to|-|–|—|and)\s*(\d+(?:\.\d+)?)\s*(weeks?|days?|months?)\b/i.exec(
      quote,
    );
  const single =
    /\b(?:is|of|at|about|within|approximately)\s+(\d+(?:\.\d+)?)\s*(weeks?|days?|months?)\b/i.exec(
      quote,
    );
  if (range) {
    const unit = unitOf(range[3]!);
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    if (unit && lo > 0 && hi >= lo) {
      duration = { text: range[0]!, unit, min: lo, max: hi };
    }
  } else if (single) {
    const unit = unitOf(single[2]!);
    const n = Number(single[1]);
    if (unit && n > 0) {
      duration = {
        text: single[0]!.replace(/^(?:is|of|at|about|within|approximately)\s+/i, ""),
        unit,
        min: n,
        max: n,
      };
    }
  }

  const start =
    /(?:commenc\w*|start\w*|begin\w*)\s+(?:once|after|when|upon|following)\s+([^.;]+)/i.exec(quote);
  const startFrom =
    /(?:commenc\w*|start\w*|begin\w*)\s+(?:at|on|with|from)\s+(?:the\s+)?(kickoff|signing|signature|execution|effective date)/i.exec(
      quote,
    );
  const startText = start?.[1]?.trim() ?? startFrom?.[1]?.trim() ?? null;

  const may = /\b(?:may|might|could)\s+include\s+([^.]+)\./i.exec(quote);
  const dependencies = may
    ? may[1]!
        .split(/,\s*(?:and\s+)?/i)
        .map((d) => d.trim())
        .filter(Boolean)
    : [];

  return {
    quote: quote.slice(0, 1200),
    duration,
    startCondition: startText ? classifyStart(startText) : "unstated",
    startText: startText ? startText.slice(0, 300) : null,
    dependencies: dependencies.slice(0, 10),
  };
}

export type DeliveryInputs = {
  /** The parsed SOW paragraph, or null when the SOW has none. */
  sow: SowDeliveryTimeline | null;
  /** The deal's complexity tier on the Hub, 0 to 5, or null when unknown. */
  tierNumber: number | null;
  /** The Hub's close date (ISO), the basis of tier targets. */
  closeDate: string | null;
  /** The kickoff date on the plan (ISO), when set. */
  kickoffDate: string | null;
  /** The signing date (ISO), when recorded. */
  signedDate: string | null;
  /** The day all forms were finalised, as the TIS recorded it (ISO). */
  formsFinalisedOn: string | null;
  /** The deal's own holiday list (the Hub's timeline.holidays), skipped by business-day counts. */
  holidays: string[];
  /** The SOW's typed deadlines, as printed. */
  sowDeadlines: Array<{ date: string; who: string | null; quote: string }>;
  /** The SOW's notes. Expedited or accelerated delivery mentioned here takes precedence, but is subject to resource review. */
  sowNotes: string[];
};

export type DeliveryBasis = "expedited" | "sow" | "tier" | "none";

export type DeliverySuggestion = {
  basis: DeliveryBasis;
  /** What starts the clock, in plain words. */
  startCondition: string;
  /** The day the clock starts, when it is known. */
  startDate: string | null;
  /** The proposed completion range (the same day for a single target). Null when none is proposed. */
  from: string | null;
  to: string | null;
  /** Why no date is proposed, when none is. */
  missing: string | null;
  /** The assumptions behind the proposal, each a plain sentence. */
  assumptions: string[];
  /** The SOW paragraph, verbatim, when it is the source. */
  source: string | null;
  /** The SOW duration as printed, when it is the source. */
  duration: SowDuration | null;
  /** Customer deliverables that can move the timeline. */
  dependencies: string[];
  /** Deadlines the SOW prints. Shown as deadlines; never an agreed accelerated timeline. */
  deadlines: Array<{ date: string; who: string | null; quote: string }>;
  /** SOW notes about expedited or accelerated delivery. Shown with the proposal. */
  expedite: string[];
};

const EXPEDITE = /expedit|accelerat|rush|sooner|faster|earlier than|ahead of schedule/i;

export function suggestDeliveryDates(input: DeliveryInputs): DeliverySuggestion {
  const deadlines = input.sowDeadlines.map((d) => ({ ...d }));
  const expedite = input.sowNotes.filter((n) => EXPEDITE.test(n)).map((n) => n.slice(0, 300));
  const base = { deadlines, expedite, dependencies: [] as string[] };
  const none = (missing: string | null, assumptions: string[] = []): DeliverySuggestion => ({
    ...base,
    basis: "none",
    startCondition: "Not set",
    startDate: null,
    from: null,
    to: null,
    missing,
    assumptions,
    source: null,
    duration: null,
  });

  // 1. Expedited delivery with a date the SOW prints takes precedence over the tier target.
  if (expedite.length > 0) {
    const date = [...deadlines].sort((a, b) => a.date.localeCompare(b.date))[0];
    if (date) {
      return {
        ...base,
        basis: "expedited",
        startCondition: "The SOW's expedited delivery date",
        startDate: null,
        from: date.date,
        to: date.date,
        missing: null,
        assumptions: [
          `The SOW states expedited delivery to ${date.date}. It takes precedence over the standard tier target, subject to resource review.`,
        ],
        source: date.quote,
        duration: null,
      };
    }
    // Expedited wording with no date: nothing is proposed, and the standard target is not substituted for it.
    return none(
      "The SOW mentions expedited delivery but gives no date. Confirm the commitment with the customer before a date is proposed. The standard tier target is not used in its place.",
    );
  }

  // 2. The SOW's own Delivery Timeline, in the SOW's own unit, from the condition it names.
  const sow = input.sow;
  if (sow?.duration) {
    const { duration } = sow;
    let start: string | null = null;
    let startCondition: string;
    let missing: string | null = null;
    const assumptions: string[] = [];

    switch (sow.startCondition) {
      case "forms_finalised":
        startCondition = "When all form builds and edits are finalised";
        start = input.formsFinalisedOn;
        if (!start) {
          missing =
            "The SOW starts the clock when all form builds and edits are finalised. That day is not recorded yet, so no completion date is proposed.";
        }
        break;
      case "kickoff":
        startCondition = "From kickoff";
        start = input.kickoffDate;
        if (!start)
          missing = "The SOW starts the clock at kickoff, and the kickoff date is not set.";
        break;
      case "signing":
        startCondition = "From signing";
        start = input.signedDate ?? input.closeDate;
        if (!input.signedDate && input.closeDate) {
          assumptions.push("The close date stands in for the signing date.");
        }
        if (!start)
          missing = "The SOW starts the clock at signing, and no signing date is recorded.";
        break;
      default:
        startCondition = sow.startText
          ? `As the SOW says: ${sow.startText}`
          : "The SOW does not say when the clock starts";
        missing =
          "The SOW does not say when the delivery clock starts. Confirm the start with the customer before a completion date is proposed.";
    }

    const unitWord =
      duration.unit === "day"
        ? "calendar days"
        : duration.unit === "week"
          ? "calendar weeks"
          : "calendar months";
    assumptions.unshift(
      `SOW Delivery Timeline: ${duration.text}, in ${unitWord} as the SOW states them (not business days, not the tier target).`,
    );
    if (start) {
      return {
        ...base,
        basis: "sow",
        startCondition,
        startDate: start,
        from: addSowDuration(start, duration.min, duration.unit),
        to: addSowDuration(start, duration.max, duration.unit),
        missing: null,
        assumptions,
        source: sow.quote,
        duration,
        dependencies: sow.dependencies,
      };
    }
    return {
      ...base,
      basis: "sow",
      startCondition,
      startDate: null,
      from: null,
      to: null,
      missing,
      assumptions,
      source: sow.quote,
      duration,
      dependencies: sow.dependencies,
    };
  }

  // 3. No usable SOW timeline: the complexity-tier target, in business days from the close.
  if (input.tierNumber !== null) {
    const tier = Math.min(Math.max(Math.round(input.tierNumber), 1), 5) as 1 | 2 | 3 | 4 | 5;
    const days = TIER_TARGET_BUSINESS_DAYS[tier];
    const assumptions = [
      `No usable SOW Delivery Timeline. Tier ${tier} target of ${days} business days from the close, skipping weekends and this deal's holidays, as the Hub counts tier targets.`,
    ];
    if (input.tierNumber === 0)
      assumptions.push("No integration is in scope, so the deal counts as Tier 1.");
    if (!input.closeDate) {
      return none("The close date is not recorded, so no tier target can be counted.", assumptions);
    }
    const target = addBusinessDays(input.closeDate, days, input.holidays);
    return {
      ...base,
      basis: "tier",
      startCondition: "From the close (business days)",
      startDate: input.closeDate,
      from: target,
      to: target,
      missing: null,
      assumptions,
      source: null,
      duration: null,
    };
  }

  return none("There is no SOW Delivery Timeline and no complexity tier, so no date is proposed.");
}

/** The TIS's saved schedule for one implementation. Stored in the kickoff_deck row. */
export type SavedSchedule = {
  formsFinalisedOn: string | null;
  completionFrom: string | null;
  completionTo: string | null;
  /** Required whenever the TIS sets completion dates: why they differ from or stand in for the suggestion. */
  adjustedReason: string | null;
};

export type EffectiveSource = "expedited" | "sow" | "tier" | "tis" | "none";

/**
 * The dates the decks show. A TIS's saved completion dates replace the suggestion
 * and are labelled as the TIS's adjustment; otherwise the suggestion stands.
 * Neither is agreed with the customer. "Agreed" is only the Hub's stage target.
 */
export function effectiveCompletion(
  suggestion: Pick<DeliverySuggestion, "basis" | "from" | "to">,
  saved: SavedSchedule | null,
): { from: string | null; to: string | null; source: EffectiveSource } {
  if (saved?.completionFrom && saved.completionTo) {
    return { from: saved.completionFrom, to: saved.completionTo, source: "tis" };
  }
  return { from: suggestion.from, to: suggestion.to, source: suggestion.basis };
}

/** Plain-language label for the decks' "proposed" line. Business days are named where they apply. */
export function completionLabel(
  effective: { from: string | null; to: string | null; source: EffectiveSource },
  format: (iso: string) => string = (iso) => iso,
): string | null {
  if (!effective.from || !effective.to) return null;
  const when =
    effective.from === effective.to
      ? format(effective.from)
      : `${format(effective.from)} to ${format(effective.to)}`;
  const basis =
    effective.source === "tis"
      ? "Adjusted by the TIS"
      : effective.source === "expedited"
        ? "Expedited date in the SOW, subject to resource review"
        : effective.source === "sow"
          ? "Proposed from the SOW Delivery Timeline"
          : "Proposed from the complexity tier, in business days";
  return `${basis}: ${when}. Not yet agreed with the customer.`;
}

/** The stored paragraph (intake timeline.sow_delivery) back in the module's shape. */
export function deliveryFromStored(
  stored: {
    quote: string;
    duration_text: string | null;
    duration_unit: SowDuration["unit"] | null;
    duration_min: number | null;
    duration_max: number | null;
    start_condition: SowStartCondition;
    start_text: string | null;
    dependencies: string[];
  } | null,
): SowDeliveryTimeline | null {
  if (!stored) return null;
  return {
    quote: stored.quote,
    duration:
      stored.duration_text &&
      stored.duration_unit &&
      stored.duration_min !== null &&
      stored.duration_max !== null
        ? {
            text: stored.duration_text,
            unit: stored.duration_unit,
            min: stored.duration_min,
            max: stored.duration_max,
          }
        : null,
    startCondition: stored.start_condition,
    startText: stored.start_text,
    dependencies: stored.dependencies,
  };
}
