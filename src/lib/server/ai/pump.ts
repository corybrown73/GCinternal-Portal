import { audit } from "../audit";
import { AI_CALL_TIMEOUT_MS } from "./config";
import { waitUntilOf } from "./cron";
import { withAiDeadline } from "./deadline";
import {
  claimJobs,
  failJob,
  kickAiJobs,
  releaseJob,
  runOneStep,
  type AiJobRow,
  type RunOutcome,
} from "./jobs";

/**
 * Readings that do not wait for the scheduler.
 *
 * The cron (`/api/cron/ai-jobs`) is the runner of record, but a reading
 * should not depend on it: no cron ran in production for weeks, and every
 * reading sat "queued" behind it. So whatever queues a reading also works
 * the queue itself, after its response, in the same function. It goes
 * through the same claim, advance and fail as the cron — a conditional
 * claim on `status = 'queued'` and every write under the runner's lock —
 * so the two can run side by side and never run one step twice. Where the
 * runtime has no `waitUntil` (local dev, tests) it does nothing, and the
 * cron or the kick picks the job up.
 *
 * It shares the request's function, and so its 300 s ceiling. A model
 * step is started only while a whole model call still fits, which in
 * practice means one model step per pump, near its start; the quick steps
 * around it (sources, apply, finalize) run while a minute is left. The
 * rest is handed to the kick and the cron.
 */

/** Vercel's ceiling for one function (`maxDuration` in vite.config.ts). */
export const FUNCTION_CEILING_MS = 300_000;
/** What the request may have used before the pump; a longer caller does not pump. */
export const HOST_ALLOWANCE_MS = 10_000;
/** Room after the last model call for the step's own writes and the advance. */
export const WRITE_MARGIN_MS = 15_000;
/** The pump's wall clock, from its own start; model calls end by then. */
export const PUMP_BUDGET_MS = FUNCTION_CEILING_MS - HOST_ALLOWANCE_MS - WRITE_MARGIN_MS;
/** A model step starts only with a full model call (plus margin) left. */
export const PUMP_MODEL_WINDOW_MS = AI_CALL_TIMEOUT_MS + WRITE_MARGIN_MS;
/** A step with no model call starts with this much left. */
export const PUMP_QUICK_WINDOW_MS = 60_000;

/** Steps that make no model call: they load, write or send. Any other step counts as a model step. */
const QUICK_STEPS: Record<string, readonly string[]> = {
  prepare_deal: ["sources", "apply", "finalize"],
};
/** The step a job with no `step` yet starts at. */
const FIRST_STEP: Record<string, string> = {
  prepare_deal: "sources",
  analyze_transcript: "analyze",
};

export function isQuickStep(job: Pick<AiJobRow, "kind" | "step">): boolean {
  const step = job.step ?? FIRST_STEP[job.kind] ?? null;
  return step !== null && (QUICK_STEPS[job.kind] ?? []).includes(step);
}

export type PumpSummary = {
  steps: number;
  finished: number;
  failed: number;
  lost: number;
  /** Why it stopped: nothing due, or the budget. */
  stopped: "idle" | "budget";
};

export type PumpDeps = {
  claim?: (limit: number) => Promise<AiJobRow[]>;
  run?: (job: AiJobRow) => Promise<RunOutcome>;
  fail?: typeof failJob;
  release?: (job: AiJobRow) => Promise<void>;
  kick?: () => Promise<void>;
  now?: () => number;
  budgetMs?: number;
  modelWindowMs?: number;
  quickWindowMs?: number;
};

/**
 * The loop itself, one step at a time. A job whose next step does not fit
 * is given back untouched (no attempt counted), and when it stops on the
 * budget with work left it kicks the cron once, so the next step does not
 * wait for the minute.
 */
export async function pumpAiJobs(reason: string, deps: PumpDeps = {}): Promise<PumpSummary> {
  const claim = deps.claim ?? ((n: number) => claimJobs(n));
  const run = deps.run ?? ((job: AiJobRow) => runOneStep(job, undefined, { kick: false }));
  const fail = deps.fail ?? failJob;
  const release = deps.release ?? releaseJob;
  const kick = deps.kick ?? (() => kickAiJobs());
  const now = deps.now ?? Date.now;
  const budget = deps.budgetMs ?? PUMP_BUDGET_MS;
  const modelWindow = deps.modelWindowMs ?? PUMP_MODEL_WINDOW_MS;
  const quickWindow = deps.quickWindowMs ?? PUMP_QUICK_WINDOW_MS;
  const started = now();
  const end = started + budget;
  const summary: PumpSummary = { steps: 0, finished: 0, failed: 0, lost: 0, stopped: "idle" };
  let pending = false;

  while (true) {
    if (end - now() < quickWindow) {
      summary.stopped = "budget";
      break;
    }
    const [job] = await claim(1);
    if (!job) break;
    if (!isQuickStep(job) && end - now() < modelWindow) {
      await release(job);
      summary.stopped = "budget";
      pending = true;
      break;
    }
    let outcome: RunOutcome;
    try {
      // The step's model calls end by the pump's end, whatever their own budget says.
      outcome = await withAiDeadline(end, () => run(job));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await fail(job, message);
      outcome = { outcome: "failed", step: job.step ?? "?", error: message, final: false };
    }
    summary.steps += 1;
    pending = outcome.outcome === "advanced";
    if (outcome.outcome === "finished") summary.finished += 1;
    else if (outcome.outcome === "failed") summary.failed += 1;
    else if (outcome.outcome === "lost_lock") summary.lost += 1;
  }

  if (summary.stopped === "budget" && pending) await kick();
  if (summary.steps > 0) {
    await audit({ actor_type: "system", action: "ai.pump", payload: { reason, ...summary } });
  }
  return summary;
}

/**
 * Work the queue after this response, in this function, where the runtime
 * allows it. True when the pump was handed to `waitUntil`; false (and
 * nothing done) where there is none. Never throws.
 */
export function pumpAiJobsInProcess(
  reason: string,
  deps: PumpDeps & { waitUntil?: ((p: Promise<unknown>) => void) | null } = {},
): boolean {
  try {
    const waitUntil = deps.waitUntil === undefined ? waitUntilOf() : deps.waitUntil;
    if (!waitUntil) return false;
    waitUntil(
      pumpAiJobs(reason, deps).catch((e) =>
        console.error("[ai-jobs] the in-process pump failed", e),
      ),
    );
    return true;
  } catch (e) {
    console.error("[ai-jobs] could not start the in-process pump", e);
    return false;
  }
}
