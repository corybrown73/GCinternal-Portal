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
 */
async function handle(request: Request): Promise<Response> {
  const { handleMcpRequest } = await import("@/lib/server/mcp-handler");
  return handleMcpRequest(request);
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
