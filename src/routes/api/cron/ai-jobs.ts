import { createFileRoute } from "@tanstack/react-router";

/**
 * GET|POST /api/cron/ai-jobs — every minute, and whenever something queues
 * a reading (`kickAiJobs`): claim up to three due AI jobs and run ONE step
 * of each, side by side. A step that advances kicks this route again, so a
 * reading walks sources → sow → brief → finalize in a few invocations
 * rather than in one five-minute request. Auth: `Authorization: Bearer
 * ${CRON_SECRET}`, the same as every cron here.
 *
 * A kick (POST) is answered as soon as the jobs are claimed, and the steps
 * run after the response where the runtime allows it (Vercel's
 * `waitUntil`), so the upload or the close that kicked waits a round trip,
 * not a step. The scheduled tick (GET), and any runtime without
 * `waitUntil`, run the steps before answering and report the summary.
 */
const CLAIM_LIMIT = 3;

type Summary = { claimed: number; advanced: number; finished: number; failed: number };

async function runClaimed(
  jobs: Awaited<ReturnType<typeof import("@/lib/server/ai/jobs").claimJobs>>,
): Promise<Summary> {
  const { runOneStep, failJob } = await import("@/lib/server/ai/jobs");
  const { audit } = await import("@/lib/server/audit");
  const summary: Summary = { claimed: jobs.length, advanced: 0, finished: 0, failed: 0 };

  const results = await Promise.allSettled(
    jobs.map(async (job) => {
      try {
        return await runOneStep(job);
      } catch (e) {
        // runOneStep records a step's own throw; this catches the runner's.
        const message = e instanceof Error ? e.message : String(e);
        await failJob(job, message);
        return { outcome: "failed" as const, step: job.step ?? "?", error: message, final: false };
      }
    }),
  );
  for (const r of results) {
    if (r.status === "rejected") {
      summary.failed += 1;
      continue;
    }
    if (r.value.outcome === "advanced") summary.advanced += 1;
    else if (r.value.outcome === "finished") summary.finished += 1;
    else summary.failed += 1;
  }

  await audit({ actor_type: "system", action: "cron.ai_jobs", payload: summary });
  return summary;
}

/** The runtime's "finish this after the response", where there is one. */
function waitUntilOf(request: Request): ((p: Promise<unknown>) => void) | null {
  const onRequest = (request as unknown as { waitUntil?: unknown }).waitUntil;
  if (typeof onRequest === "function") return onRequest as (p: Promise<unknown>) => void;
  const ctx = (globalThis as Record<symbol, unknown>)[Symbol.for("@vercel/request-context")] as
    { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined } | undefined;
  const fn = ctx?.get?.()?.waitUntil;
  return typeof fn === "function" ? fn : null;
}

async function runAiJobs(request: Request): Promise<Response> {
  const { claimJobs } = await import("@/lib/server/ai/jobs");
  const jobs = await claimJobs(CLAIM_LIMIT);
  if (jobs.length === 0) {
    return Response.json({ ok: true, claimed: 0, advanced: 0, finished: 0, failed: 0 });
  }
  const waitUntil = request.method === "POST" ? waitUntilOf(request) : null;
  if (waitUntil) {
    waitUntil(runClaimed(jobs).catch((e) => console.error("[ai-jobs] the kicked tick failed", e)));
    return Response.json({ ok: true, claimed: jobs.length, deferred: true });
  }
  return Response.json({ ok: true, ...(await runClaimed(jobs)) });
}

async function authorizeCron(request: Request): Promise<Response | null> {
  const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
  return authenticateCronRequest(request);
}

export const Route = createFileRoute("/api/cron/ai-jobs")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const denied = await authorizeCron(request);
        return denied ?? (await runAiJobs(request));
      },
      POST: async ({ request }: { request: Request }) => {
        const denied = await authorizeCron(request);
        return denied ?? (await runAiJobs(request));
      },
    },
  },
});
