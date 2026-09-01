import { describe, expect, it, vi } from "vitest";

// The handler authorizes every tool call against the real key checker, which
// wants a database. Stubbed to refuse, so these tests exercise the protocol
// and the auth boundary without one — the tools themselves are covered where
// they are implemented.
vi.mock("../server/api-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/api-auth")>();
  return {
    ...actual,
    requireApiKey: vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "missing_api_key",
            message: "Pass your key as 'Authorization: Bearer <key>'",
          },
        },
        { status: 401 },
      ),
    ),
  };
});

import { handleMcpRequest } from "../server/mcp-handler";

const post = (body: unknown) =>
  handleMcpRequest(
    new Request("https://example.test/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const rpc = (method: string, params?: unknown, id: unknown = 1) => ({
  jsonrpc: "2.0",
  id,
  method,
  ...(params === undefined ? {} : { params }),
});

describe("initialize", () => {
  it("echoes the client's protocol version, as the spec asks", async () => {
    const body = await (await post(rpc("initialize", { protocolVersion: "2024-11-05" }))).json();
    expect(body.result.protocolVersion).toBe("2024-11-05");
    expect(body.result.serverInfo.name).toBe("gocanvas-handoff-hub");
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it("states its own version when the client names none", async () => {
    const body = await (await post(rpc("initialize", {}))).json();
    expect(body.result.protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("tells the model the workflow and the omit-beats-guess rule up front", async () => {
    const body = await (await post(rpc("initialize", {}))).json();
    expect(body.result.instructions).toContain("find_deal");
    expect(body.result.instructions).toContain("leaving a field out is always better");
  });
});

describe("tools/list", () => {
  it("lists every tool with a schema", async () => {
    const body = await (await post(rpc("tools/list"))).json();
    expect(body.result.tools.map((t: any) => t.name).sort()).toEqual([
      "add_call_notes",
      "create_deal",
      "describe_deck_fields",
      "find_deal",
      "generate_kickoff_deck",
      "get_handoff_context",
      "update_deal",
    ]);
  });
});

describe("authorization", () => {
  // This was an RPC error until a connector went live without its key: the
  // client rendered it as "tool execution failed" with no detail, the tool list
  // had worked, and the visible evidence pointed at everything except the
  // cause. A result the caller can read is worth more than the correct code.
  it("refuses a tool call with no key as a readable result, not an opaque error", async () => {
    const body = await (
      await post(rpc("tools/call", { name: "find_deal", arguments: { query: "x" } }))
    ).json();

    expect(body.error).toBeUndefined();
    expect(body.result.isError).toBe(true);
    const text = body.result.content[0].text;
    expect(text).toContain("carried no API key");
    expect(text).toContain("Authorization: Bearer");
    // It must name the scope this particular tool needs, so the key gets minted
    // right the first time.
    expect(text).toContain("handoff:read");
  });

  it("names the write scope when the failing tool is the one that files a deck", async () => {
    const body = await (
      await post(rpc("tools/call", { name: "generate_kickoff_deck", arguments: {} }))
    ).json();
    expect(body.result.content[0].text).toContain("handoff:write");
  });

  // The scope branch was written against a guessed code (`insufficient_scope`)
  // and never fired: the first connector to hit it got the generic fallback
  // instead of the sentence saying where to fix it. api-auth emits
  // `missing_scope`, so that is what this asserts.
  it("tells a scoped-out key where scopes are set", async () => {
    const { requireApiKey } = await import("../server/api-auth");
    vi.mocked(requireApiKey).mockResolvedValueOnce(
      Response.json(
        { error: { code: "missing_scope", message: "This key does not have the scope" } },
        { status: 403 },
      ),
    );
    const body = await (
      await post(rpc("tools/call", { name: "find_deal", arguments: { query: "x" } }))
    ).json();
    const text = body.result.content[0].text;
    expect(body.result.isError).toBe(true);
    expect(text).toContain("does not have the 'handoff:read' scope");
    expect(text).toContain("Admin -> API keys");
    // Not the generic branch, which would print the raw code instead.
    expect(text).not.toContain("(missing_scope)");
  });

  it("refuses an unknown tool before it ever reaches the key check", async () => {
    const body = await (await post(rpc("tools/call", { name: "drop_everything" }))).json();
    expect(body.error.code).toBe(-32602);
    expect(body.error.message).toContain("Unknown tool");
  });
});

describe("protocol housekeeping", () => {
  it("answers ping", async () => {
    expect((await (await post(rpc("ping"))).json()).result).toEqual({});
  });

  it("returns 202 and no body for a notification", async () => {
    // No id means nothing is expected back.
    const res = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("reports an unknown method as method-not-found", async () => {
    const body = await (await post(rpc("resources/list"))).json();
    expect(body.error.code).toBe(-32601);
  });

  it("reports a malformed request without crashing the batch", async () => {
    const body = await (
      await post([{ jsonrpc: "1.0", id: 9, method: "x" }, rpc("ping", undefined, 10)])
    ).json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].error.code).toBe(-32600);
    expect(body[1].result).toEqual({});
  });

  it("answers a parse error with a 400 rather than a 500", async () => {
    const res = await handleMcpRequest(
      new Request("https://example.test/api/mcp", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32700);
  });
});
