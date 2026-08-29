import { createFileRoute } from "@tanstack/react-router";

/**
 * Catch-all for unmatched /api/* paths.
 *
 * BUG-10: an unknown API path fell through to the SSR handler, which rejects a
 * request whose Accept header is not HTML — so `GET /api/v1/nope` answered
 *
 *   500 {"error":"Only HTML requests are supported here"}
 *
 * A 500 says "this broke". A 404 says "that does not exist". Anyone integrating
 * against this API has to be able to tell those apart: the first is worth
 * retrying and paging someone about, the second never is. Returning the wrong
 * one sends an integrator hunting a server fault that was really a typo in
 * their URL.
 *
 * This route is deliberately last in specificity — TanStack matches the most
 * specific route first, so every real endpoint still wins. It exists only to
 * stop the fall-through.
 *
 * The body names the live surface rather than just refusing, because the most
 * likely reader is someone who guessed a path and needs to know the real one.
 */

const LIVE_ENDPOINTS = [
  "GET  /api/v1/accounts",
  "POST /api/v1/accounts",
  "GET  /api/v1/accounts/:id",
  "POST /api/v1/implementations",
  "GET  /api/v1/openapi.json",
];

function notFound(request: Request): Response {
  const { pathname } = new URL(request.url);
  return Response.json(
    {
      error: "not_found",
      message: `No API endpoint matches ${request.method} ${pathname}.`,
      endpoints: LIVE_ENDPOINTS,
    },
    {
      status: 404,
      // No caching: the set of endpoints changes as the API grows, and a cached
      // 404 is how an integrator keeps seeing "gone" after it has shipped.
      headers: { "cache-control": "no-store" },
    },
  );
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => notFound(request),
      POST: ({ request }: { request: Request }) => notFound(request),
      PUT: ({ request }: { request: Request }) => notFound(request),
      PATCH: ({ request }: { request: Request }) => notFound(request),
      DELETE: ({ request }: { request: Request }) => notFound(request),
    },
  },
});
