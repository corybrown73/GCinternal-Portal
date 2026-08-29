import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron endpoint: advances delay-based sequence steps and auto-enrols contacts
 * for 'customer_created' sequences. Auth: Authorization: Bearer ${CRON_SECRET}.
 *
 * Server-route convention (TanStack Start v1.168): raw HTTP handlers live on
 * the route's `server.handlers` option and receive ({ request }) → Response.
 */
async function handle(request: Request): Promise<Response> {
  const { runSequenceCron } = await import("@/lib/sequence-cron.server");
  return runSequenceCron(request);
}

export const Route = createFileRoute("/api/cron/sequences")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
