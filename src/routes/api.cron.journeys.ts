import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron endpoint: advances delay-based journey steps and auto-enrolls contacts
 * for 'customer_created' journeys. Auth: Authorization: Bearer ${CRON_SECRET}.
 *
 * Server-route convention (TanStack Start v1.168): raw HTTP handlers live on
 * the route's `server.handlers` option and receive ({ request }) → Response.
 */

async function handleCron(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Server configuration error", { status: 500 });

  const match = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "");
  const token = match?.[1];
  if (!token) return new Response("Unauthorized", { status: 401 });

  const { createHash, timingSafeEqual } = await import("node:crypto");
  const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
  if (!timingSafeEqual(digest(token), digest(secret))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { advanceDelayedSteps, autoEnrollNewCustomers } = await import("@/lib/journeys.server");

  const delayed = await advanceDelayedSteps();
  const enrolled = await autoEnrollNewCustomers();

  return Response.json({
    ok: true,
    advanced: delayed.advanced,
    completed: delayed.completed,
    auto_enrolled: enrolled.enrolled,
  });
}

export const Route = createFileRoute("/api/cron/journeys")({
  server: {
    handlers: {
      GET: ({ request }) => handleCron(request),
      POST: ({ request }) => handleCron(request),
    },
  },
});
