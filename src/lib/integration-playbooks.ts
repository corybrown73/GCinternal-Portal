/**
 * What it takes to connect GoCanvas to the systems customers actually name.
 *
 * WHY THIS IS A TABLE AND NOT A PROMPT. The deck carries a level-of-effort
 * call that a solutions engineer's week gets planned against, and a client
 * gameplan they will hold us to. Neither should vary because a model phrased
 * something differently on a Tuesday. What the LLM does is read the call notes
 * and say WHICH system; what it takes to connect that system is reviewed
 * engineering knowledge and lives here, in version control, where somebody can
 * disagree with it in a pull request.
 *
 * WHAT IS DELIBERATELY NOT HERE. Endpoint names, field names, API versions.
 * They change, they are the one thing that is embarrassing to get wrong in
 * front of a customer, and the SE looks them up anyway. What a kickoff needs
 * is the shape of the work, what has to be true before it starts, and what
 * usually goes wrong.
 *
 * ANYTHING NOT IN THIS TABLE gets `UNKNOWN_TARGET` — which says so, rather
 * than dressing a guess up as an assessment.
 */

/** How much solutions-engineering time, before anything customer-specific. */
export type EffortBand = "light" | "moderate" | "heavy";

export type IntegrationPlaybook = {
  /** The canonical name, as it should appear on a slide. */
  name: string;
  /** Lowercased strings that should resolve to this playbook. */
  aliases: string[];
  effort: EffortBand;
  /** A working estimate in SE days. A range, because it always is. */
  seDays: string;
  /** What has to be true before build can start. */
  prerequisites: string[];
  /** What usually costs more than people expect. INTERNAL. */
  watchOut: string[];
  /** The phases as the client should hear them. */
  gameplan: Array<{ step: string; detail: string }>;
};

const COMMON_GAMEPLAN = (system: string) => [
  {
    step: "Confirm the mapping",
    detail: `We take the form your crews are already using and agree, field by field, what lands where in ${system}.`,
  },
  {
    step: "Connect a sandbox",
    detail: `We build against a test ${system} company first, so nothing touches your live records.`,
  },
  {
    step: "Run both in parallel",
    detail: "For a short window the old way keeps running beside the new one, and we compare.",
  },
  {
    step: "Cut over",
    detail: "Once the numbers match, the manual step stops.",
  },
];

export const INTEGRATION_PLAYBOOKS: IntegrationPlaybook[] = [
  {
    name: "QuickBooks Online",
    aliases: ["quickbooks", "quickbooks online", "qbo", "quick books", "intuit"],
    effort: "moderate",
    seDays: "5–8",
    prerequisites: [
      "An admin who can authorise the connection to the QuickBooks company",
      "Agreement on which GoCanvas submission state creates a record — usually an approved job, not a submitted one",
      "The customer and item lists as they exist in QuickBooks, so names match rather than being created twice",
    ],
    watchOut: [
      "Customer and item names must already agree on both sides, or every job creates a duplicate. This is the single biggest cost on a QBO build and it is data work, not integration work.",
      "Tax codes and classes are per-company settings and are rarely mentioned in a sales call; assume a round trip to establish them.",
      "OAuth tokens expire and have to be renewed — the connection needs an owner, not just a builder.",
      "Sandbox behaviour differs from production on some list operations. Validate the mapping in production against one real job before cutover.",
    ],
    gameplan: COMMON_GAMEPLAN("QuickBooks"),
  },
  {
    name: "Sage",
    aliases: ["sage", "sage 200", "sage 50", "sage intacct"],
    effort: "heavy",
    seDays: "8–15",
    prerequisites: [
      "Which Sage product and whether it is hosted or on-premise — they are different integrations",
      "Confirmation that their licence includes API or webhook access, which several Sage tiers do not",
      "A named contact on their side who can change Sage configuration",
    ],
    watchOut: [
      "On-premise Sage usually means no inbound webhooks, so the sync is scheduled rather than real time. Say this early — it is the expectation that gets set wrong.",
      "Licence tier decides what is possible and is often discovered mid-build.",
      "Export formats are frequently undocumented and reverse-engineered from samples. Get three real files before quoting a date.",
    ],
    gameplan: COMMON_GAMEPLAN("Sage"),
  },
  {
    name: "Salesforce",
    aliases: ["salesforce", "sfdc", "sales force"],
    effort: "moderate",
    seDays: "5–10",
    prerequisites: [
      "A Salesforce admin, and a sandbox to build in",
      "Which object each submission becomes, and what identifies a duplicate",
      "Whether any required custom fields or validation rules will reject an inbound record",
    ],
    watchOut: [
      "Validation rules and required custom fields are what actually block inbound records, and nobody lists them until the first failure.",
      "API request limits are per-org and shared with everything else they run.",
      "Person accounts versus contacts changes the mapping entirely.",
    ],
    gameplan: COMMON_GAMEPLAN("Salesforce"),
  },
  {
    name: "SharePoint",
    aliases: ["sharepoint", "share point", "onedrive", "microsoft 365"],
    effort: "light",
    seDays: "2–4",
    prerequisites: [
      "The site and library the PDFs should land in",
      "An account with permission to write there",
      "The folder and file-naming convention they want",
    ],
    watchOut: [
      "Conditional access and MFA policies block service accounts more often than the API does.",
      "Naming conventions sound trivial and generate the most rework — settle them in the kickoff.",
    ],
    gameplan: COMMON_GAMEPLAN("SharePoint"),
  },
  {
    name: "Power BI",
    aliases: ["power bi", "powerbi", "microsoft power bi"],
    effort: "light",
    seDays: "2–5",
    prerequisites: [
      "Who owns the workspace and can publish",
      "Whether they want raw submissions or a shaped dataset",
      "How fresh the data has to be — refresh cadence drives the design",
    ],
    watchOut: [
      "They usually have an existing report someone else built, and the real ask is to match it.",
      "Row-level security, if they use it, is a separate piece of work.",
    ],
    gameplan: COMMON_GAMEPLAN("Power BI"),
  },
  {
    name: "Procore",
    aliases: ["procore"],
    effort: "moderate",
    seDays: "5–10",
    prerequisites: [
      "Which Procore tool the data belongs to, and at what project level",
      "A Procore admin who can install and authorise",
      "Whether the project list should drive GoCanvas dispatch, or the reverse",
    ],
    watchOut: [
      "Per-project permissions mean an integration that works on one project silently fails on another.",
      "Their project naming rarely matches what crews call the site.",
    ],
    gameplan: COMMON_GAMEPLAN("Procore"),
  },
  {
    name: "NetSuite",
    aliases: ["netsuite", "net suite", "oracle netsuite"],
    effort: "heavy",
    seDays: "10–20",
    prerequisites: [
      "A NetSuite administrator, and their integration partner if they have one",
      "Which record type each submission becomes",
      "Whether custom records or SuiteScript are involved",
    ],
    watchOut: [
      "Almost every NetSuite instance is heavily customised; the standard mapping rarely survives contact with theirs.",
      "Their existing integration partner usually has to be in the room, which is a scheduling cost, not a technical one.",
    ],
    gameplan: COMMON_GAMEPLAN("NetSuite"),
  },
  {
    name: "Xero",
    aliases: ["xero"],
    effort: "moderate",
    seDays: "4–7",
    prerequisites: [
      "An admin who can authorise the Xero organisation",
      "Which submission state creates an invoice",
      "Contact and item lists as they exist in Xero",
    ],
    watchOut: [
      "Same duplicate-contact problem as QuickBooks: names must agree before the first sync, not after.",
      "Tracking categories are how most Xero customers report, and they are never mentioned up front.",
    ],
    gameplan: COMMON_GAMEPLAN("Xero"),
  },
  {
    name: "Google Sheets",
    aliases: ["google sheets", "sheets", "google sheet", "gsheets"],
    effort: "light",
    seDays: "1–3",
    prerequisites: [
      "The destination sheet and who owns it",
      "Whether rows append or update in place",
    ],
    watchOut: [
      "It is usually a stopgap for a real system, and worth asking what it becomes later.",
      "A sheet that people also edit by hand will drift from the submissions.",
    ],
    gameplan: COMMON_GAMEPLAN("Google Sheets"),
  },
];

/** What we say about a system we have no reviewed playbook for. */
export const UNKNOWN_TARGET: Omit<IntegrationPlaybook, "name" | "aliases"> = {
  effort: "moderate",
  seDays: "to be scoped",
  prerequisites: [
    "API documentation, and confirmation their licence includes API access",
    "A named technical contact on their side",
    "A test environment to build against",
  ],
  watchOut: [
    "There is no reviewed playbook for this system. The effort band above is a placeholder, not an assessment — an SE has to scope it before a date is given to the customer.",
  ],
  gameplan: COMMON_GAMEPLAN("your system"),
};

export const EFFORT_LABEL: Record<EffortBand, string> = {
  light: "Light",
  moderate: "Moderate",
  heavy: "Heavy",
};

/**
 * Match what the client called it to a playbook.
 *
 * Substring, because people write "QuickBooks Online (Plus)" and "we're on
 * Sage 200". Longest alias first so "sage intacct" does not lose to "sage".
 */
export function playbookFor(target: string | null): {
  name: string;
  playbook: Omit<IntegrationPlaybook, "name" | "aliases">;
  known: boolean;
} | null {
  const t = target?.trim().toLowerCase();
  if (!t) return null;

  const candidates = INTEGRATION_PLAYBOOKS.flatMap((p) =>
    p.aliases.map((a) => ({ alias: a, playbook: p })),
  ).sort((a, b) => b.alias.length - a.alias.length);

  for (const { alias, playbook } of candidates) {
    if (t.includes(alias)) {
      const { name: _n, aliases: _a, ...rest } = playbook;
      return { name: playbook.name, playbook: rest, known: true };
    }
  }
  return { name: target!.trim(), playbook: UNKNOWN_TARGET, known: false };
}
