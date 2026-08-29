import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/v1/openapi.json — the machine-readable description of this API.
 *
 * Unauthenticated on purpose: a description of endpoints is not a secret, and
 * every endpoint it names is still behind a scoped key. Cached for five
 * minutes so a docs page refresh does not re-walk the validators.
 */
export const Route = createFileRoute("/api/v1/openapi.json")({
  server: {
    handlers: {
      GET: async () => {
        const { buildOpenApiDocument } = await import("@/lib/server/openapi");
        return new Response(JSON.stringify(buildOpenApiDocument(), null, 2), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
