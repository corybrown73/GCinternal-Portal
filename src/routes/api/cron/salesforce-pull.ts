import { createFileRoute } from "@tanstack/react-router";

/**
 * GET|POST /api/cron/salesforce-pull — every ten minutes, the Hub asks
 * Salesforce for the opportunities won since the last look and runs each
 * through the closed-won ingest: deal, facts, project, TIS.
 *
 * Three things have to be true or the run says `skipped` and why: the
 * `sf_pull_enabled` flag (Admin → Integrations → Salesforce), the three
 * SALESFORCE_* environment variables, and the kill switch not set. The
 * decision is in server/salesforce-poll.ts; this is the schedule and the
 * wiring, the same wiring the closed-won webhook uses.
 */
async function runPull(): Promise<Response> {
  const { isFlagOn } = await import("@/lib/app-config.server");
  const { integrationKilled, runSalesforcePull } = await import("@/lib/sf-integration.server");
  const { salesforceConfigured } = await import("@/lib/server/salesforce-client");
  const { audit } = await import("@/lib/server/audit");

  if (integrationKilled()) return Response.json({ ok: true, skipped: "kill switch" });
  if (!(await isFlagOn("sf_pull_enabled"))) return Response.json({ ok: true, skipped: "flag off" });
  if (!salesforceConfigured()) return Response.json({ ok: true, skipped: "not configured" });

  try {
    const summary = await runSalesforcePull("cron");
    await audit({ actor_type: "system", action: "cron.salesforce_pull", payload: summary });
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await audit({
      actor_type: "system",
      action: "cron.salesforce_pull",
      payload: { error: message },
    });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

async function authorizeCron(request: Request): Promise<Response | null> {
  const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
  return authenticateCronRequest(request);
}

export const Route = createFileRoute("/api/cron/salesforce-pull")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const denied = await authorizeCron(request);
        return denied ?? (await runPull());
      },
      POST: async ({ request }: { request: Request }) => {
        const denied = await authorizeCron(request);
        return denied ?? (await runPull());
      },
    },
  },
});
