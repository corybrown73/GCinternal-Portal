import { createFileRoute } from "@tanstack/react-router";

/**
 * GET|POST /api/cron/ai-jobs — every minute, and whenever something queues
 * a reading (`kickAiJobs`): one tick of the AI job runner (lib/server/ai/
 * cron.ts — claim up to three due jobs, one step each, side by side; a
 * POST answers once the jobs are claimed and runs the steps after the
 * response where the runtime allows it). Auth: `Authorization: Bearer
 * ${CRON_SECRET}`, the same as every cron here. The route is the auth and
 * the delegate; the logic lives where the tests can reach it.
 */
async function handle(request: Request): Promise<Response> {
  const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
  const denied = await authenticateCronRequest(request);
  if (denied) return denied;
  const { tickAiJobs } = await import("@/lib/server/ai/cron");
  return tickAiJobs(request);
}

export const Route = createFileRoute("/api/cron/ai-jobs")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => handle(request),
      POST: async ({ request }: { request: Request }) => handle(request),
    },
  },
});
