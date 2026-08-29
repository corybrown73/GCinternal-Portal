/**
 * Handoff completeness. Pure: no imports, no I/O, safe in a client bundle.
 *
 * The brief asks for a "completeness score", and this repo's standing rule is
 * that nothing is a score, forecast or trend. Both hold, because they are
 * different things.
 *
 * What is forbidden is a number that stands in for judgement — a 0-100 implying
 * how *good* a handoff is. What this produces is a COUNT OF FACTS: which
 * required items are present, which are missing, and where each missing one is
 * filled in. Nobody has to trust the number because they can see the list it
 * came from. The items are the output; the count is derived from them, never
 * the other way round.
 */

/**
 * The item keys, as a value so the write side can validate against them. A
 * returned handoff names its gaps by key and those keys are rendered back as
 * an accountability record, so an unrecognised key must be rejected at the
 * edge rather than stored and later shown as a bare string.
 */
export const HANDOFF_ITEM_KEYS = [
  "business_outcome",
  "success_measures",
  "economic_buyer",
  "champion",
  "day_to_day_owner",
  "commitments",
  "technical_risks",
  "integration_dependencies",
  "data_migration_needs",
  "roadmap_promises",
  "sow_link",
  "discovery_calls",
  "discovery_board",
] as const;

export type HandoffItemKey = (typeof HANDOFF_ITEM_KEYS)[number];

export type HandoffItem = {
  key: HandoffItemKey;
  label: string;
  present: boolean;
  /** Why it counts as present or missing — never a bare tick. */
  detail: string;
  /** Where to go and fix it. A Customer 360 tab id, when there is one. */
  tab?: string;
  /**
   * Optional items are shown and counted separately: a handoff with no
   * integration work genuinely has no integration dependencies, and marking
   * that "incomplete" would train people to type "n/a" into every box.
   */
  optional?: boolean;
};

export type HandoffCompleteness = {
  items: HandoffItem[];
  /** Required items only. `present` of `required`. */
  present: number;
  required: number;
  missingKeys: HandoffItemKey[];
  /** True when every REQUIRED item is present. Optional ones never block. */
  complete: boolean;
};

/** The live records completeness reads. Nothing here is copied into the packet. */
export type HandoffInputs = {
  implementation: {
    customer_goals?: string | null;
    sow_document_url?: string | null;
    sow_reference?: string | null;
    discovery_board_url?: string | null;
  };
  packet: {
    integration_dependencies?: string | null;
    data_migration_needs?: string | null;
    roadmap_promises?: string | null;
    discovery_call_links?: unknown;
  };
  successCriteria: ReadonlyArray<{ description?: string | null; metric?: string | null }>;
  contacts: ReadonlyArray<{ name?: string | null; role?: string | null; email?: string | null }>;
  commitments: ReadonlyArray<unknown>;
  risks: ReadonlyArray<unknown>;
  /** Gong reports on the linked presale deal, if any. */
  gongReports: ReadonlyArray<unknown>;
};

const filled = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;

/**
 * Stakeholder roles are free text, so match on intent rather than an exact
 * string — "Economic Buyer", "economic_buyer" and "Exec sponsor / buyer" are
 * the same person. A role we cannot classify simply does not satisfy that slot;
 * it is never guessed into one.
 */
function hasRole(
  contacts: HandoffInputs["contacts"],
  patterns: readonly RegExp[],
): { found: boolean; who: string | null } {
  for (const c of contacts) {
    const role = (c.role ?? "").toLowerCase();
    if (patterns.some((p) => p.test(role))) {
      return { found: true, who: c.name ?? null };
    }
  }
  return { found: false, who: null };
}

const ECONOMIC_BUYER = [/economic/, /\bbuyer\b/, /sponsor/, /exec/];
const CHAMPION = [/champion/, /advocate/];
const DAY_TO_DAY = [
  /day.?to.?day/,
  /\bowner\b/,
  /admin/,
  /operational/,
  /project manager/,
  /\bpm\b/,
];

export function handoffCompleteness(input: HandoffInputs): HandoffCompleteness {
  const { implementation: impl, packet } = input;

  const buyer = hasRole(input.contacts, ECONOMIC_BUYER);
  const champion = hasRole(input.contacts, CHAMPION);
  const dayToDay = hasRole(input.contacts, DAY_TO_DAY);

  const measured = input.successCriteria.filter(
    (s) => filled(s.description) || filled(s.metric),
  ).length;

  const callLinks = Array.isArray(packet.discovery_call_links)
    ? packet.discovery_call_links.length
    : 0;
  const calls = callLinks + input.gongReports.length;

  const items: HandoffItem[] = [
    {
      key: "business_outcome",
      label: "Business outcome the customer bought",
      present: filled(impl.customer_goals),
      detail: filled(impl.customer_goals)
        ? "Recorded on the implementation."
        : "No customer goals recorded — this is what delivery is being measured against.",
      tab: "overview",
    },
    {
      key: "success_measures",
      label: "Success measures",
      present: measured > 0,
      detail:
        measured > 0
          ? `${measured} recorded.`
          : "None recorded. An empty success-measure structure never gets filled in later.",
      tab: "overview",
    },
    {
      key: "economic_buyer",
      label: "Economic buyer",
      present: buyer.found,
      detail: buyer.found
        ? `${buyer.who ?? "Recorded"}.`
        : "No contact holds a buyer or sponsor role.",
      tab: "overview",
    },
    {
      key: "champion",
      label: "Champion",
      present: champion.found,
      detail: champion.found
        ? `${champion.who ?? "Recorded"}.`
        : "No contact is marked as the champion.",
      tab: "overview",
    },
    {
      key: "day_to_day_owner",
      label: "Day-to-day owner",
      present: dayToDay.found,
      detail: dayToDay.found
        ? `${dayToDay.who ?? "Recorded"}.`
        : "Nobody is recorded as running this day to day.",
      tab: "overview",
    },
    {
      key: "commitments",
      label: "Commitments made to the customer",
      present: input.commitments.length > 0,
      detail:
        input.commitments.length > 0
          ? `${input.commitments.length} recorded.`
          : "None recorded. Promises made in the deal are what delivery gets held to.",
      tab: "overview",
    },
    {
      key: "technical_risks",
      label: "Known technical risks",
      present: input.risks.length > 0,
      detail:
        input.risks.length > 0
          ? `${input.risks.length} recorded.`
          : "None recorded — say so explicitly by logging a risk, or confirm there are none.",
      tab: "risks",
    },
    {
      key: "sow_link",
      label: "SOW",
      present: filled(impl.sow_document_url) || filled(impl.sow_reference),
      detail:
        filled(impl.sow_document_url) || filled(impl.sow_reference)
          ? "Attached or referenced."
          : "No SOW document or reference on the implementation.",
      tab: "overview",
    },
    {
      key: "discovery_calls",
      label: "Recorded discovery calls",
      present: calls > 0,
      // The two sources are named separately on purpose. Gong reports hang off
      // the CUSTOMER's presale deals, not off this implementation — nothing in
      // the schema links a deal to one implementation yet — so counting them
      // silently would present a customer-level fact as evidence about this
      // piece of work. Say where the evidence came from and let the reader judge.
      detail:
        calls > 0
          ? [
              callLinks > 0 ? `${callLinks} linked on this handoff` : null,
              input.gongReports.length > 0
                ? `${input.gongReports.length} Gong report${input.gongReports.length === 1 ? "" : "s"} on this customer's deals (not deal-scoped)`
                : null,
            ]
              .filter(Boolean)
              .join("; ") + "."
          : "No call recordings or Gong reports linked.",
      tab: "overview",
    },
    // Optional: absence is a legitimate answer, not an incomplete handoff.
    {
      key: "integration_dependencies",
      label: "Integration dependencies",
      present: filled(packet.integration_dependencies),
      detail: filled(packet.integration_dependencies)
        ? "Described."
        : "Not described — leave blank if there are none.",
      optional: true,
    },
    {
      key: "data_migration_needs",
      label: "Data-migration needs",
      present: filled(packet.data_migration_needs),
      detail: filled(packet.data_migration_needs)
        ? "Described."
        : "Not described — leave blank if there is none.",
      optional: true,
    },
    {
      key: "roadmap_promises",
      label: "Product-roadmap promises",
      present: filled(packet.roadmap_promises),
      detail: filled(packet.roadmap_promises)
        ? "Described."
        : "None described. Anything promised that does not exist yet belongs here.",
      optional: true,
    },
    {
      key: "discovery_board",
      label: "Discovery board",
      present: filled(impl.discovery_board_url),
      detail: filled(impl.discovery_board_url) ? "Linked." : "No board linked.",
      optional: true,
      tab: "overview",
    },
  ];

  const required = items.filter((i) => !i.optional);
  const missing = required.filter((i) => !i.present);

  return {
    items,
    present: required.length - missing.length,
    required: required.length,
    missingKeys: missing.map((i) => i.key),
    complete: missing.length === 0,
  };
}
