import { TEMPLATE_FIELDS } from "@/lib/kickoff-fields";

/**
 * The Handoff Hub as an MCP server.
 *
 * THE SPLIT, AND WHY. Claude reads; this app renders. A model in a Claude
 * session can read a transcript, search the web for what a customer's industry
 * actually cares about, and ask a follow-up question — none of which a
 * server-side one-shot can do. What it must NOT do is produce the PowerPoint:
 * the brand template, the field contract and the account it belongs to all
 * live here, and a deck built anywhere else is a deck that drifts from the
 * template and lands in somebody's downloads folder instead of the account.
 *
 * So there are three tools and they form one sentence: find the deal, read
 * everything about it, hand back the field values and get a deck filed against
 * the account.
 *
 * WHY THIS IS NOT THE SDK. The server is stateless and lives in a serverless
 * function; Streamable HTTP with no sessions is three JSON-RPC methods —
 * `initialize`, `tools/list`, `tools/call` — and implementing them directly
 * beats wiring a transport abstraction into a framework route handler. The
 * shapes below follow the spec; the protocol version is echoed back from the
 * client when it sends one, which is what the spec asks for.
 *
 * AUTHORIZATION is the API key the portal already issues, with two scopes:
 * reading a customer's call transcripts and writing a document into their
 * account are different amounts of trust.
 */

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export const SERVER_INFO = {
  name: "gocanvas-handoff-hub",
  title: "GoCanvas Handoff Hub",
  version: "1.0.0",
} as const;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

export type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

/**
 * The tools, described for a model rather than for a developer.
 *
 * The descriptions carry the workflow because that is what a model reads
 * before choosing: "call this one first" belongs in the description, not in a
 * README nobody passes to the model.
 */
export const TOOLS: ToolDefinition[] = [
  {
    name: "find_deal",
    title: "Find a deal",
    description:
      "Search the pre-sale pipeline by company name. Start here when you have a name rather than an id. Returns the deal id you need for every other tool, plus its stage and whether a project has been created yet.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Part of the company name, case-insensitive.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_handoff_context",
    title: "Read everything about a deal",
    description:
      "Everything needed to write the handoff deck, in one read: the deal record, the SOW, every Gong call note and onboarding note VERBATIM, and the project's plan if it exists. Also returns `gaps` — the things nobody recorded. Read those first: a deck written confidently over a gap is worse than one that says the answer is missing.",
    inputSchema: {
      type: "object",
      properties: {
        dealId: { type: "string", description: "The deal's uuid, from find_deal." },
      },
      required: ["dealId"],
      additionalProperties: false,
    },
  },
  {
    name: "generate_kickoff_deck",
    title: "Generate the kickoff deck",
    description:
      "Render the branded Client Kickoff Deck from field values you supply and file it against the account's attachments. Call describe_deck_fields first to see what the template accepts. Leave a field out rather than guessing: an omitted field is drawn as a visible placeholder for the presenter, and an invented one is read aloud to the customer as fact. Returns a link to the finished .pptx.",
    inputSchema: {
      type: "object",
      properties: {
        dealId: { type: "string", description: "The deal's uuid." },
        fields: {
          type: "object",
          description:
            "Field values keyed by the template's own field names. See describe_deck_fields.",
          additionalProperties: { type: "string" },
        },
        note: {
          type: "string",
          description:
            "One line on what you based the deck on, stored with the file so the next person knows.",
        },
      },
      required: ["dealId", "fields"],
      additionalProperties: false,
    },
  },
  {
    name: "describe_deck_fields",
    title: "What the deck template accepts",
    description:
      "The Client Kickoff Deck's field names, what each one is for, and which the portal fills by itself. Call this before generate_kickoff_deck.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

/** The scope each tool needs. Reading transcripts is not writing documents. */
export const TOOL_SCOPES: Record<string, "handoff:read" | "handoff:write"> = {
  find_deal: "handoff:read",
  get_handoff_context: "handoff:read",
  describe_deck_fields: "handoff:read",
  generate_kickoff_deck: "handoff:write",
};

/**
 * What each field is for, so a model fills it with the right thing.
 *
 * Grouped rather than listed flat: 124 names in a row tells a model nothing
 * about which slide it is writing.
 */
export const FIELD_GUIDE: Array<{ group: string; note: string; fields: string[] }> = [
  {
    group: "Title and close",
    note: "deck_eyebrow is 'Implementation Kickoff · <Month Year>'. The portal fills client_name and the dates itself.",
    fields: ["deck_eyebrow", "client_name", "client_name_short", "next_meeting"],
  },
  {
    group: "People",
    note: "Names as the notes spell them. Roles in the template's style: 'VP Operations · Executive sponsor'. Never a department where a person belongs.",
    fields: [
      "client_person_1_name",
      "client_person_1_role",
      "client_person_2_name",
      "client_person_2_role",
      "client_person_3_name",
      "client_person_3_role",
      "gc_lead_name",
      "gc_lead_role",
      "gc_person_2_name",
      "gc_person_2_role",
      "gc_person_3_name",
      "gc_person_3_role",
    ],
  },
  {
    group: "Their goals",
    note: "Four at most. goal_n is one sentence; goal_n_detail explains it in one more. Read back what they said, not what we would like them to want.",
    fields: [
      "goal_1",
      "goal_1_detail",
      "goal_2",
      "goal_2_detail",
      "goal_3",
      "goal_3_detail",
      "goal_4",
      "goal_4_detail",
    ],
  },
  {
    group: "Success measures",
    note: "kpi_n_metric is what is measured, kpi_n_value the number, kpi_n_label the qualifier ('by end of quarter two'). Only numbers they agreed. day_90_definition is one concrete sentence about what is true ninety days in.",
    fields: [
      "kpi_1_metric",
      "kpi_1_value",
      "kpi_1_label",
      "kpi_2_metric",
      "kpi_2_value",
      "kpi_2_label",
      "kpi_3_metric",
      "kpi_3_value",
      "kpi_3_label",
      "day_90_definition",
    ],
  },
  {
    group: "Workflows in scope",
    note: "Five rows. scope_n_replaces is the paper or manual thing being retired, in their words. scope_n_teams is who uses it and how many. out_of_scope is what is explicitly NOT in phase one — the most useful line on the slide.",
    fields: [
      "scope_1_workflow",
      "scope_1_replaces",
      "scope_1_teams",
      "scope_2_workflow",
      "scope_2_replaces",
      "scope_2_teams",
      "scope_3_workflow",
      "scope_3_replaces",
      "scope_3_teams",
      "scope_4_workflow",
      "scope_4_replaces",
      "scope_4_teams",
      "scope_4_owner",
      "scope_5_workflow",
      "scope_5_replaces",
      "scope_5_teams",
      "scope_5_owner",
      "out_of_scope",
    ],
  },
  {
    group: "Timeline",
    note: "Five phases. The portal fills these from the project's plan when one exists — supply them only when it does not. need_from_client is the first thing that is on them.",
    fields: [
      "phase_1_date",
      "phase_1_name",
      "phase_1_detail",
      "phase_2_date",
      "phase_2_name",
      "phase_2_detail",
      "phase_3_date",
      "phase_3_name",
      "phase_3_detail",
      "phase_4_date",
      "phase_4_name",
      "phase_4_detail",
      "phase_5_date",
      "phase_5_name",
      "phase_5_detail",
      "need_from_client",
      "timeline_risk",
    ],
  },
  {
    group: "Ownership",
    note: "Every row needs a human name, not a department. Fill a row only when the notes name someone for that exact responsibility.",
    fields: [
      "raci_1_owner",
      "raci_1_support",
      "raci_2_owner",
      "raci_2_support",
      "raci_3_owner",
      "raci_3_support",
      "raci_4_owner",
      "raci_4_support",
      "raci_5_owner",
      "raci_5_support",
    ],
  },
  {
    group: "Training, licensing and IT",
    note: "licensed_seats as stated ('310 on the Business plan'). integration_n as 'System · what it does for them'.",
    fields: [
      "training_1_title",
      "training_1_who",
      "training_2_title",
      "training_2_who",
      "training_3_title",
      "training_3_who",
      "licensed_seats",
      "renewal_date",
      "integration_1",
      "integration_2",
      "integration_3",
      "it_contact",
      "support_tier_1",
      "support_tier_2",
      "support_tier_3",
    ],
  },
  {
    group: "Risks and the action plan",
    note: "The action plan is the slide that must be finished before the call ends. Four rows: what, why it matters, who owns it, when.",
    fields: [
      "risk_1",
      "risk_1_mitigation",
      "risk_2",
      "risk_2_mitigation",
      "risk_3",
      "risk_3_mitigation",
      "action_1",
      "action_1_why",
      "action_1_owner",
      "action_1_due",
      "action_2",
      "action_2_why",
      "action_2_owner",
      "action_2_due",
      "action_3",
      "action_3_why",
      "action_3_owner",
      "action_3_due",
      "action_4",
      "action_4_why",
      "action_4_owner",
      "action_4_due",
    ],
  },
];

/** Guards against the guide and the template drifting apart. */
export function unknownGuideFields(): string[] {
  const known = new Set(TEMPLATE_FIELDS);
  return FIELD_GUIDE.flatMap((g) => g.fields).filter((f) => !known.has(f));
}

/* ------------------------------------------------------------- JSON-RPC */

export function rpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, result };
}

export function rpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: unknown,
) {
  return {
    jsonrpc: "2.0" as const,
    id: id ?? null,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

/** A tool result. `isError` is how MCP reports a tool failing, not an RPC error. */
export function toolResult(text: string, isError = false) {
  return { content: [{ type: "text", text }], isError };
}
