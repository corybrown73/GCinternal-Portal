import { createFileRoute } from "@tanstack/react-router";

/**
 * GET/POST /api/cron/weekly-digest — Monday morning (see vercel.json).
 *
 * One email per internal person: their overdue plan steps, what needs
 * action, what is due this week, unclaimed deals; managers also get the
 * team rollup. Deduped per person per day through the audit log, so a
 * re-run never sends twice. Auth: `Authorization: Bearer ${CRON_SECRET}`.
 */
async function handle(request: Request): Promise<Response> {
  const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
  const denied = await authenticateCronRequest(request);
  if (denied) return denied;
  try {
    const { runWeeklyDigest } = await import("@/lib/digest.server");
    const summary = await runWeeklyDigest();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    console.error("cron /api/cron/weekly-digest failed", e);
    return Response.json({ ok: false, error: "digest_failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/cron/weekly-digest")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
