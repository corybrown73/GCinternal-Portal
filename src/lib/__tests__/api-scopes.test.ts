import { describe, expect, it } from "vitest";

import {
  API_SCOPES,
  HANDOFF_SCOPES,
  normalizeScopes,
  SCOPE_HINTS,
  SCOPE_PRESETS,
} from "../api-scopes";
import { API_SCOPES as SERVER_SCOPES } from "../server/api-auth";

/**
 * The drift guard. The admin form once kept its own copy of the scope list
 * and fell two scopes behind the server's; no key made in the UI could carry
 * handoff:read or handoff:write, and every MCP tool call was refused. There
 * is one list now, and this holds the hints and the server to it.
 */
describe("the scope catalogue", () => {
  it("is the list the server checks against, and it has the connector's scopes", () => {
    expect(SERVER_SCOPES).toBe(API_SCOPES);
    expect(API_SCOPES).toContain("handoff:read");
    expect(API_SCOPES).toContain("handoff:write");
    expect(HANDOFF_SCOPES).toEqual(["handoff:read", "handoff:write"]);
  });

  it("explains every scope, and no scope it does not have", () => {
    for (const s of API_SCOPES) expect(SCOPE_HINTS[s].trim().length).toBeGreaterThan(0);
    expect(Object.keys(SCOPE_HINTS).sort()).toEqual([...API_SCOPES].sort());
    for (const p of SCOPE_PRESETS) for (const s of p.scopes) expect(API_SCOPES).toContain(s);
  });

  it("normalises what a form sends: known scopes only, once each, in catalogue order", () => {
    expect(
      normalizeScopes([
        "handoff:write",
        "sorcery",
        "accounts:read",
        "handoff:write",
        "accounts:read",
      ]),
    ).toEqual(["accounts:read", "handoff:write"]);
    expect(normalizeScopes([])).toEqual([]);
  });
});
