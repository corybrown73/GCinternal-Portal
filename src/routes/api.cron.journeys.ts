import { createFileRoute } from "@tanstack/react-router";

/**
 * Deprecated alias for /api/cron/sequences, kept for one release so a Vercel
 * cron tick landing during the vercel.json cutover is not lost. Remove it with
 * migration 0017, alongside the compatibility views.
 */
async function handle(request: Request): Promise<Response> {
  const { runSequenceCron } = await import("@/lib/sequence-cron.server");
  return runSequenceCron(request);
}

export const Route = createFileRoute("/api/cron/journeys")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
