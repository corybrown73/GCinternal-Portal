import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/mcp — the Handoff Hub as a remote MCP server.
 *
 * Streamable HTTP with no sessions: this runs in a serverless function, so
 * there is nothing to keep between requests and every call carries its own
 * API key. Clients that ask for a session get none, which the spec allows.
 *
 * Authorization is the portal's own API key — `Authorization: Bearer
 * gcp_live_…` — with `handoff:read` to read a customer's call transcripts and
 * `handoff:write` to file a document into their account.
 *
 * THE KEY MAY ALSO ARRIVE AS `?key=`, and only here. Claude's own custom
 * connectors configure a URL and OAuth, with nowhere to put a static header,
 * so a header-only server cannot be used from the surface this was built for.
 * A query parameter is the documented way round that and it is genuinely
 * worse: URLs get written to proxy logs, browser history and referrers in a
 * way headers do not. So it is confined to this one route rather than added
 * to `requireApiKey`, where it would have quietly widened every other
 * endpoint the portal exposes. Prefer the header wherever the client can send
 * one.
 */
async function handle(request: Request): Promise<Response> {
  const { handleMcpRequest } = await import("@/lib/server/mcp-handler");
  return handleMcpRequest(withKeyFromQuery(request));
}

/**
 * Move a `?key=` into the Authorization header, so exactly one code path
 * checks credentials.
 *
 * A header that is already present wins: a client that can send one is not
 * overridden by a stale link, and there is no way to downgrade a good request
 * by appending a parameter to it.
 */
export function withKeyFromQuery(request: Request): Request {
  if (request.headers.get("authorization") || request.headers.get("x-api-key")) return request;

  const key = new URL(request.url).searchParams.get("key")?.trim();
  if (!key) return request;

  const headers = new Headers(request.headers);
  headers.set("authorization", `Bearer ${key}`);
  return new Request(request.url, {
    method: request.method,
    headers,
    body: request.body,
    // Required by undici whenever a stream is used as the body.
    duplex: "half",
  } as RequestInit);
}

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) => handle(request),
      // A GET here would be the SSE stream for server-initiated messages. This
      // server never initiates any, so saying so plainly beats holding a
      // connection open that will never carry anything.
      GET: () =>
        new Response(
          JSON.stringify({
            error: {
              code: "method_not_allowed",
              message:
                "This MCP server is POST-only: it is stateless and never initiates messages.",
            },
          }),
          { status: 405, headers: { "content-type": "application/json", allow: "POST" } },
        ),
    },
  },
});
