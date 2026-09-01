import { describe, expect, it } from "vitest";

import { TEMPLATE_FIELDS } from "../kickoff-fields";
import {
  FIELD_GUIDE,
  MCP_PROTOCOL_VERSION,
  rpcError,
  rpcResult,
  SERVER_INFO,
  toolResult,
  TOOL_SCOPES,
  TOOLS,
  unknownGuideFields,
} from "../server/mcp";

describe("the tool surface", () => {
  it("gives every tool a scope, so none can be called unauthenticated by omission", () => {
    // The handler looks the scope up by name and refuses when there is none.
    // A tool added without one would simply be unreachable — but this catches
    // it at the test rather than in a support ticket.
    for (const tool of TOOLS) {
      expect(TOOL_SCOPES[tool.name], `${tool.name} has no scope`).toBeDefined();
    }
    expect(Object.keys(TOOL_SCOPES).sort()).toEqual(TOOLS.map((t) => t.name).sort());
  });

  it("only the deck generator can write", () => {
    expect(TOOL_SCOPES["generate_kickoff_deck"]).toBe("handoff:write");
    expect(TOOL_SCOPES["find_deal"]).toBe("handoff:read");
    expect(TOOL_SCOPES["get_handoff_context"]).toBe("handoff:read");
    expect(TOOL_SCOPES["describe_deck_fields"]).toBe("handoff:read");
  });

  it("declares a JSON Schema a client can validate against", () => {
    for (const tool of TOOLS) {
      expect(tool.inputSchema["type"], tool.name).toBe("object");
      expect(tool.inputSchema).toHaveProperty("properties");
      // Open schemas let a typo through as a silently ignored argument.
      expect(tool.inputSchema["additionalProperties"], tool.name).toBe(false);
    }
  });

  it("tells the model the order to call things in, where it matters", () => {
    const byName = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
    expect(byName["find_deal"]!.description).toContain("Start here");
    expect(byName["generate_kickoff_deck"]!.description).toContain("describe_deck_fields first");
  });

  it("warns the model that omitting beats guessing", () => {
    // The single most important instruction on this server.
    expect(TOOLS.find((t) => t.name === "generate_kickoff_deck")!.description).toContain(
      "Leave a field out rather than guessing",
    );
  });
});

describe("the field guide", () => {
  it("never names a field the template does not have", () => {
    // A guide that drifts from the template teaches a model to send fields
    // that render nothing, and the deck looks filled when it is not.
    expect(unknownGuideFields()).toEqual([]);
  });

  it("covers the fields a model is expected to supply", () => {
    const guided = new Set(FIELD_GUIDE.flatMap((g) => g.fields));
    for (const key of ["goal_1", "raci_1_owner", "licensed_seats", "action_1", "out_of_scope"]) {
      expect(guided.has(key), `${key} is not in the guide`).toBe(true);
    }
    expect(guided.size).toBeGreaterThan(TEMPLATE_FIELDS.length / 2);
  });

  it("explains each group rather than just listing names", () => {
    for (const group of FIELD_GUIDE) {
      expect(group.note.length, group.group).toBeGreaterThan(40);
      expect(group.fields.length, group.group).toBeGreaterThan(0);
    }
  });
});

describe("JSON-RPC envelopes", () => {
  it("always carries jsonrpc and an id, including for a null id", () => {
    expect(rpcResult(1, { ok: true })).toEqual({ jsonrpc: "2.0", id: 1, result: { ok: true } });
    expect(rpcResult(undefined, {})).toEqual({ jsonrpc: "2.0", id: null, result: {} });
    expect(rpcError("abc", -32601, "nope")).toEqual({
      jsonrpc: "2.0",
      id: "abc",
      error: { code: -32601, message: "nope" },
    });
  });

  it("omits the error data key entirely when there is none", () => {
    // `data: undefined` serialises away in JSON, but an explicit key is a
    // difference some strict clients notice.
    expect(Object.keys(rpcError(1, -1, "x").error)).toEqual(["code", "message"]);
    expect(Object.keys(rpcError(1, -1, "x", { a: 1 }).error)).toEqual(["code", "message", "data"]);
  });

  it("reports a failing tool as a result, not as an RPC error", () => {
    // MCP's contract: the model is meant to see the failure and try again.
    const r = toolResult("that deal does not exist", true);
    expect(r.isError).toBe(true);
    expect(r.content[0]).toEqual({ type: "text", text: "that deal does not exist" });
  });
});

describe("server identity", () => {
  it("names itself and a protocol version", () => {
    expect(SERVER_INFO.name).toBe("gocanvas-handoff-hub");
    expect(MCP_PROTOCOL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
