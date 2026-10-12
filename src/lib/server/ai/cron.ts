import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { audit } from "../audit";
import { claimJobs, failJob, runOneStep, type AiJobRow } from "./jobs";

/**
 * One tick of the AI job cron, behind `/api/cron/ai-jobs`: claim up to
 * three due jobs and run ONE step of each, side by side. A step that
 * advances kicks the route again, so a reading walks sources → sow → brief
 * → finalize in a few invocations rather than in one five-minute request.
 * Here rather than in the route file so the tally, the audit row and the
 * deferral can be exercised over the fake database.
 */
export const CLAIM_LIMIT = 3;

export type TickSummary = {
  claimed: number;
  advanced: number;
  finished: number;
  failed: number;
  /** Runners whose lock was taken while they ran; they wrote nothing. */
  lost: number;
};

/** The steps of the claimed jobs, run together, tallied and audited. */
export async function runClaimed(jobs: AiJobRow[]): Promise<TickSummary> {
  const summary: TickSummary = {
    claimed: jobs.length,
    advanced: 0,
    finished: 0,
    failed: 0,
    lost: 0,
  };

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
    else if (r.value.outcome === "lost_lock") summary.lost += 1;
    else summary.failed += 1;
  }

  await audit({ actor_type: "system", action: "cron.ai_jobs", payload: summary });
  return summary;
}

/**
 * The runtime's "finish this after the response", where there is one: on
 * the request, else Vercel's request context (which needs no request, so a
 * server function deep in a call can ask for it too).
 */
export function waitUntilOf(request?: Request): ((p: Promise<unknown>) => void) | null {
  const onRequest = (request as unknown as { waitUntil?: unknown } | undefined)?.waitUntil;
  if (typeof onRequest === "function") return onRequest as (p: Promise<unknown>) => void;
  const ctx = (globalThis as Record<symbol, unknown>)[Symbol.for("@vercel/request-context")] as
    { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined } | undefined;
  const fn = ctx?.get?.()?.waitUntil;
  return typeof fn === "function" ? fn : null;
}

/** portal_app_config key: the last time the scheduler (not a kick) ran a tick. */
export const SCHEDULER_TICK_KEY = "scheduler.last_tick_at";

/**
 * The scheduler's heartbeat: one upsert per scheduled tick, so the Admin AI
 * tab can say whether the cron runs at all. Never throws.
 */
export async function recordSchedulerTick(now: Date = new Date()): Promise<void> {
  try {
    const at = now.toISOString();
    const { error } = await (supabaseAdmin as any)
      .from("portal_app_config")
      .upsert({ key: SCHEDULER_TICK_KEY, value: at, updated_at: at }, { onConflict: "key" });
    if (error) console.error("[ai-jobs] could not record the scheduler tick", error);
  } catch (e) {
    console.error("[ai-jobs] could not record the scheduler tick", e);
  }
}

/**
 * The tick itself, already authorized. A kick (POST) is answered as soon
 * as the jobs are claimed, and the steps run after the response where the
 * runtime allows it (Vercel's `waitUntil`), so the upload or the close that
 * kicked waits a round trip, not a step. The scheduled tick (GET), and any
 * runtime without `waitUntil`, run the steps before answering and report
 * the summary.
 */
export async function tickAiJobs(
  request: Request,
  deps: { claim?: typeof claimJobs; run?: typeof runClaimed } = {},
): Promise<Response> {
  const claim = deps.claim ?? claimJobs;
  const run = deps.run ?? runClaimed;
  // Vercel's scheduler calls GET; a kick is a POST and proves nothing about it.
  if (request.method !== "POST") await recordSchedulerTick();
  const jobs = await claim(CLAIM_LIMIT);
  if (jobs.length === 0) {
    return Response.json({ ok: true, claimed: 0, advanced: 0, finished: 0, failed: 0, lost: 0 });
  }
  const waitUntil = request.method === "POST" ? waitUntilOf(request) : null;
  if (waitUntil) {
    waitUntil(run(jobs).catch((e) => console.error("[ai-jobs] the kicked tick failed", e)));
    return Response.json({ ok: true, claimed: jobs.length, deferred: true });
  }
  return Response.json({ ok: true, ...(await run(jobs)) });
}
