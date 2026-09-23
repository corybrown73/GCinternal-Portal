import { createFileRoute } from "@tanstack/react-router";

/**
 * GET/POST /api/cron/daily-report — weekday mornings (see vercel.json).
 *
 * The pipeline report (stages, stuck and untouched deals, Gong briefs, time
 * to onboarding) to every manager. Once a day through the audit log; skips
 * weekends. Auth: `Authorization: Bearer ${CRON_SECRET}`.
 */
async function handle(request: Request): Promise<Response> {
  const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
  const denied = await authenticateCronRequest(request);
  if (denied) return denied;
  try {
    const { runDailyReport } = await import("@/lib/pipeline-report.server");
    return Response.json({ ok: true, ...(await runDailyReport()) });
  } catch (e) {
    console.error("cron /api/cron/daily-report failed", e);
    return Response.json({ ok: false, error: "report_failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/cron/daily-report")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
