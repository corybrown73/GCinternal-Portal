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
  "POST /api/v1/closed-won            accounts:write        — a closed deal → deal + project + TIS",
  "POST /api/v1/accounts              accounts:write        — upsert a deal",
  "GET  /api/v1/accounts              accounts:read",
  "GET  /api/v1/accounts/:id          accounts:read",
  "POST /api/v1/accounts/:id/transition  transitions:write",
  "POST /api/v1/implementations       implementations:write — Opportunity → project (older route)",
  "GET  /api/v1/implementations       implementations:read",
  "POST /api/v1/field-fusion-requests accounts:write",
  "POST /api/v1/tam-requests          tam:write",
  "POST /api/v1/tickets               tickets:write",
  "POST /api/v1/alerts                alerts:write",
  "GET  /api/v1/openapi.json          (public)",
  "GET  /api/v1/docs                  (public)",
];

function notFound(request: Request): Response {
  const { pathname } = new URL(request.url);
  // The same envelope every other /api/v1 error uses, so a client's error
  // handling has one shape to learn.
  return Response.json(
    {
      error: {
        code: "not_found",
        message: `No API endpoint matches ${request.method} ${pathname}. Reference: /api/v1/docs`,
      },
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
