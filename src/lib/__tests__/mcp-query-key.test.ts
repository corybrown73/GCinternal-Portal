import { describe, expect, it } from "vitest";

import { withKeyFromQuery } from "@/routes/api/mcp";

/**
 * The key as a URL parameter, for clients that cannot send a header.
 *
 * WHY THIS IS TESTED AT ALL. Rebuilding a Request to add a header is the kind
 * of change that looks obviously correct and drops the body — and a dropped
 * body here is not an error, it is a parse failure that reads as "the MCP
 * server is broken again". So the body is asserted to survive, by reading it
 * back.
 */

const post = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

describe("withKeyFromQuery", () => {
  it("moves ?key= into the Authorization header", () => {
    const out = withKeyFromQuery(post("https://x.test/api/mcp?key=gcp_live_abc"));
    expect(out.headers.get("authorization")).toBe("Bearer gcp_live_abc");
  });

  it("keeps the body, which is the whole request", async () => {
    const out = withKeyFromQuery(post("https://x.test/api/mcp?key=gcp_live_abc"));
    expect(await out.json()).toEqual({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(out.method).toBe("POST");
    expect(out.headers.get("content-type")).toBe("application/json");
  });

  it("never overrides a real header, so a stale link cannot downgrade a good request", () => {
    const out = withKeyFromQuery(
      post("https://x.test/api/mcp?key=gcp_live_stale", {
        authorization: "Bearer gcp_live_current",
      }),
    );
    expect(out.headers.get("authorization")).toBe("Bearer gcp_live_current");
  });

  it("leaves an x-api-key request alone too", () => {
    const out = withKeyFromQuery(
      post("https://x.test/api/mcp?key=gcp_live_stale", { "x-api-key": "gcp_live_current" }),
    );
    expect(out.headers.get("authorization")).toBeNull();
    expect(out.headers.get("x-api-key")).toBe("gcp_live_current");
  });

  it("passes an unkeyed request straight through, so the refusal still explains itself", () => {
    const req = post("https://x.test/api/mcp");
    expect(withKeyFromQuery(req)).toBe(req);
  });

  it("ignores an empty or whitespace key rather than sending 'Bearer ' upstream", () => {
    expect(withKeyFromQuery(post("https://x.test/api/mcp?key=")).headers.get("authorization")).toBe(
      null,
    );
    expect(
      withKeyFromQuery(post("https://x.test/api/mcp?key=%20%20")).headers.get("authorization"),
    ).toBe(null);
  });

  it("survives a key with url-encoded characters in it", () => {
    const out = withKeyFromQuery(post("https://x.test/api/mcp?key=gcp_live_a%2Bb%3Dc"));
    expect(out.headers.get("authorization")).toBe("Bearer gcp_live_a+b=c");
  });
});
