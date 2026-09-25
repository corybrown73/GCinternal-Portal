/**
 * The one list of API scopes.
 *
 * WHY ONE FILE. The server's catalogue lived in api-auth.ts, a module that
 * imports node's crypto and so cannot be bundled for the browser; the admin
 * page kept a hand-copied "mirror". The two drifted: handoff:read and
 * handoff:write were added to the server and never to the form, so no key
 * made in Admin → API keys could carry them, and every MCP tool call was
 * refused for a scope the operator had no way to grant. This module has no
 * imports, so both sides read the same list, and a test holds the hints to
 * it so a scope cannot be added without the words that explain it.
 */
export const API_SCOPES = [
  "accounts:read",
  "accounts:write",
  "transitions:write",
  "tam:write",
  "tickets:write",
  "alerts:write",
  // Phase 5 — the Salesforce opportunity hook and its read-back.
  "implementations:read",
  "implementations:write",
  // The MCP server. `handoff:read` hands a model the call notes and the SOW;
  // `handoff:write` lets it create and change deals and render a deck into an
  // account's attachments. Two scopes because reading a customer's
  // transcripts and writing into their account are different amounts of trust.
  "handoff:read",
  "handoff:write",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** What each scope lets an integration do, in the words the admin page shows. */
export const SCOPE_HINTS: Record<ApiScope, string> = {
  "accounts:read": "List and read presale accounts",
  "accounts:write": "Upsert accounts (Salesforce closed-won hook, the Zapier sheet)",
  "transitions:write": "Move accounts between stages",
  "tam:write": "Create TAM requests",
  "tickets:write": "Create and update tickets",
  "alerts:write": "Push monitoring alerts",
  "implementations:read": "Read implementations by Salesforce opportunity",
  "implementations:write": "Create implementations from closed-won opportunities",
  "handoff:read": "MCP connector: read deals, call notes, the SOW and the pipeline report",
  "handoff:write": "MCP connector: create and update deals, add call notes, file kickoff decks",
};

/** The two the Claude connector needs, and nothing else. */
export const HANDOFF_SCOPES: readonly ApiScope[] = ["handoff:read", "handoff:write"];

/** One-click sets for the integrations the team actually runs. */
export const SCOPE_PRESETS: ReadonlyArray<{ label: string; scopes: readonly ApiScope[] }> = [
  { label: "Claude MCP connector", scopes: HANDOFF_SCOPES },
  {
    label: "Salesforce / Zapier closed-won",
    scopes: ["accounts:read", "accounts:write", "implementations:read", "implementations:write"],
  },
];

export function isApiScope(s: string): s is ApiScope {
  return (API_SCOPES as readonly string[]).includes(s);
}

/** Only known scopes, each once, in the catalogue's order. */
export function normalizeScopes(input: readonly string[]): ApiScope[] {
  const wanted = new Set(input.filter(isApiScope));
  return API_SCOPES.filter((s) => wanted.has(s));
}
