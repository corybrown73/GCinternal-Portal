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
      "describe_deck_fields",
      "find_deal",
      "generate_kickoff_deck",
      "get_handoff_context",
    ]);
  });
});

describe("authorization", () => {
  it("refuses a tool call with no key, and says how to pass one", async () => {
    const body = await (
      await post(rpc("tools/call", { name: "find_deal", arguments: { query: "x" } }))
    ).json();
    expect(body.error.code).toBe(-32001);
    expect(body.error.message).toContain("Authorization: Bearer");
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
