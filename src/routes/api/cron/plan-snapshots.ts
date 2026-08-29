import { createFileRoute } from "@tanstack/react-router";

/**
 * GET/POST /api/cron/plan-snapshots — the weekly snapshot pass (see
 * vercel.json). Guarded by `Authorization: Bearer ${CRON_SECRET}`, exactly like
 * /api/cron/sla and /api/cron/sequences.
 *
 * Idempotent: an implementation that already has a snapshot for this week is
 * skipped, so a retry after a partial run costs nothing and never produces a
 * second version of the same week.
 */
async function handle(request: Request): Promise<Response> {
  const { runPlanSnapshotCron } = await import("@/lib/snapshots.server");
  try {
    return await runPlanSnapshotCron(request);
  } catch (e) {
    console.error("cron /api/cron/plan-snapshots failed", e);
    return Response.json({ ok: false, error: "snapshot_pass_failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/cron/plan-snapshots")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
