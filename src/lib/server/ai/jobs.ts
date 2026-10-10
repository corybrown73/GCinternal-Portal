import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { configuredAppUrl } from "../../app-url";
import type { IntakeAnswers } from "../../intake-answers";
import type { AiUsage } from "./client";

/**
 * The AI job queue: one row per reading, worked one step per invocation.
 *
 * A reading used to run whole inside the request that asked for it — brief,
 * verifier, help picker and SOW reader in one five-minute window, with the
 * deal left "reading…" forever when the function was cut off. Here a job is
 * a row in `portal_ai_jobs`; the cron (`/api/cron/ai-jobs`, every minute)
 * claims what is due, runs ONE step of each, writes what the step learned,
 * and kicks itself so the next step starts now rather than next minute. A
 * step that throws is retried with backoff; a job that fails four times is
 * marked failed, alerted, and the deal's record says so.
 *
 * One active job per deal. A request while one is queued or running does
 * not race it: it is folded into the active job, and only when that job has
 * already taken its snapshot of the sources does it ask for one more run.
 *
 * The deal's record (`intake.ai_reading`) follows the job from the moment
 * it is queued: "queued" on enqueue, the step and a heartbeat from each
 * step, the backoff on a failed attempt, failed for good at the end.
 */

export type AiJobKind = "prepare_deal" | "analyze_transcript";
export type AiJobStatus = "queued" | "running" | "done" | "failed" | "skipped";

export type AiJobUsage = AiUsage & {
  calls: number;
  by_step: Record<string, AiUsage & { calls: number }>;
};

export type AiJobRow = {
  id: string;
  kind: AiJobKind;
  deal_id: string | null;
  implementation_id: string | null;
  subject_id: string | null;
  status: AiJobStatus;
  step: string | null;
  steps_done: string[];
  trigger: string;
  requested_by: string | null;
  force: boolean;
  rerun_requested: boolean;
  source_hash: string | null;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  locked_at: string | null;
  lock_token: string | null;
  result: Record<string, unknown>;
  usage: Partial<AiJobUsage>;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

/** What one step hands back; the runner writes it onto the job. */
export type StepOutcome = {
  usage?: AiUsage | undefined;
  /** Merged into `job.result`; `filled`, `problems` and `branches` accumulate. */
  result?: Record<string, unknown> | undefined;
  filled?: string[] | undefined;
  problems?: string[] | undefined;
  /** Jump to this step instead of the next in line ("nothing new" → finalize). */
  skipTo?: string | undefined;
  /** Written to the job's `source_hash` column. */
  sourceHash?: string | undefined;
};

export type StepContext = { now: () => Date };
export type StepFn = (job: AiJobRow, ctx: StepContext) => Promise<StepOutcome>;

/** A kind's steps, in order, and the function for each. */
export type StepSet = { order: readonly string[]; steps: Record<string, StepFn> };

const db = () => supabaseAdmin as any;

/** A lock older than this belongs to a function that was cut off. */
export const STALE_LOCK_MS = 6 * 60 * 1000;
/** Retry waits, by attempt number. */
export const BACKOFF_MINUTES = [1, 2, 5, 10] as const;
/** Attempts before a job is failed for good; one per backoff wait. */
export const DEFAULT_MAX_ATTEMPTS = 4;
/** The self-kick waits this long for the cron to answer, then moves on. */
const KICK_TIMEOUT_MS = 2000;

/* --------------------------------------------------------------- enqueue */

export type EnqueueArgs = {
  kind: AiJobKind;
  dealId?: string | null | undefined;
  implementationId?: string | null | undefined;
  subjectId?: string | null | undefined;
  trigger: string;
  requestedBy?: string | null | undefined;
  /** Read even when nothing changed since the last reading. */
  force?: boolean | undefined;
};

export type EnqueueResult = {
  job: AiJobRow;
  /** True when this call created the row; false when an active job absorbed it. */
  created: boolean;
  /** True when the active job was asked for one more run afterwards. */
  rerunRequested: boolean;
};

async function activeJob(
  kind: AiJobKind,
  dealId: string | null,
  subjectId: string | null,
): Promise<AiJobRow | null> {
  let q = db()
    .from("portal_ai_jobs")
    .select("*")
    .eq("kind", kind)
    .in("status", ["queued", "running"]);
  if (dealId) q = q.eq("deal_id", dealId);
  else if (subjectId) q = q.eq("subject_id", subjectId);
  else return null;
  const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as AiJobRow | null) ?? null;
}

/** How many times enqueue looks again when the active job moves under it. */
const ENQUEUE_PASSES = 3;

/**
 * Queue a reading, or fold the request into the one already active.
 *
 * The rerun flag is set ONLY when the active job has already taken its
 * source snapshot (`steps_done` includes "sources") — queued between steps
 * or running one, it is equally blind to what arrives now. A job that has
 * not read its sources yet will see the new material anyway, and a second
 * trigger landing before the snapshot (an upload, then the close) would
 * otherwise double every reading. (Material landing inside the sources
 * step itself, after the hash and before `steps_done` is written, is the
 * one window left; the next trigger reads it.)
 *
 * The fold is written only onto a job that is still active. A job that
 * finished between the read and the write — its last step was ending —
 * would take the flag to its grave: nothing reads `rerun_requested` on a
 * done row. So a fold that matches no row falls through to a fresh job,
 * which the unique index now allows.
 *
 * A person asking ("manual", or `force`) while the active job waits out a
 * backoff gets the retry now, not in five minutes.
 */
export async function enqueueAiJob(args: EnqueueArgs): Promise<EnqueueResult> {
  const dealId = args.dealId ?? null;
  const subjectId = args.subjectId ?? null;
  const fold = async (active: AiJobRow): Promise<EnqueueResult | null> => {
    const now = new Date();
    const snapshotTaken = active.steps_done.includes("sources");
    const patch: Record<string, unknown> = {};
    if (snapshotTaken && !active.rerun_requested) patch["rerun_requested"] = true;
    if (args.force && !active.force) patch["force"] = true;
    const asked = args.force || args.trigger === "manual";
    const waiting =
      active.status === "queued" && Date.parse(active.next_attempt_at) > now.getTime();
    if (asked && waiting) patch["next_attempt_at"] = now.toISOString();
    if (Object.keys(patch).length) {
      const { data } = await db()
        .from("portal_ai_jobs")
        .update(patch)
        .eq("id", active.id)
        .in("status", ["queued", "running"])
        .select("id");
      // Finished meanwhile: the flag would be lost on a done row.
      if ((data ?? []).length === 0) return null;
    }
    // What the job absorbed goes to the log, not the row: `result` is the
    // runner's to write, and a copy written here could undo a step's.
    const { audit } = await import("../audit");
    await audit({
      actor_type: "system",
      action: "ai.job_folded",
      entity_type: "ai_job",
      entity_id: active.id,
      payload: { trigger: args.trigger, deal_id: active.deal_id, rerun: snapshotTaken },
    });
    if (asked && active.status === "queued" && active.deal_id) {
      // The screen said "stalled" or "taking longer" while it waited; the
      // click revives it, backoff or not.
      await touchReadingOf(active, {
        heartbeat_at: now.toISOString(),
        error: null,
      });
    }
    return {
      job: { ...active, ...patch } as AiJobRow,
      created: false,
      rerunRequested: snapshotTaken,
    };
  };

  for (let pass = 0; pass < ENQUEUE_PASSES; pass++) {
    const existing = await activeJob(args.kind, dealId, subjectId);
    if (existing) {
      const folded = await fold(existing);
      if (folded) return folded;
      continue;
    }

    const { data, error } = await db()
      .from("portal_ai_jobs")
      .insert({
        kind: args.kind,
        deal_id: dealId,
        implementation_id: args.implementationId ?? null,
        subject_id: subjectId,
        status: "queued",
        step: null,
        steps_done: [],
        trigger: args.trigger,
        requested_by: args.requestedBy ?? null,
        force: Boolean(args.force),
        rerun_requested: false,
        attempts: 0,
        max_attempts: DEFAULT_MAX_ATTEMPTS,
        next_attempt_at: new Date().toISOString(),
        result: {},
        usage: {},
      })
      .select("*")
      .single();
    if (error) {
      // The unique index on active jobs: another request got there first;
      // the next pass finds it and folds.
      if (error.code === "23505") continue;
      throw new Error(`Could not queue the AI reading: ${error.message}`);
    }
    const job = data as AiJobRow;
    if (job.deal_id) {
      try {
        await markReadingQueued(job);
      } catch (e) {
        // The job is queued either way; the record catches up at the first step.
        console.error("[ai-jobs] could not mark the reading queued", job.id, e);
      }
    }
    return { job, created: true, rerunRequested: false };
  }
  throw new Error("Could not queue the AI reading: the active job kept changing underneath");
}

/**
 * The record says "queued" from the moment of the request, so the screen
 * shows it and a second click folds instead of looking ignored. What the
 * last reading filled stays on the record: a run that finds nothing new
 * carries it forward.
 */
async function markReadingQueued(job: AiJobRow): Promise<void> {
  const { mergeIntake } = await import("../intake-merge");
  const current = await currentReading(job.deal_id!);
  const now = new Date().toISOString();
  await mergeIntake(job.deal_id!, {
    ai_reading: {
      status: "queued",
      started_at: now,
      finished_at: null,
      filled: current?.filled ?? [],
      error: null,
      again: false,
      job_id: job.id,
      step: null,
      heartbeat_at: now,
      branches: current?.branches ?? {},
    },
  });
}

type Reading = NonNullable<IntakeAnswers["ai_reading"]>;

async function currentReading(dealId: string): Promise<Reading | null> {
  const { readIntake } = await import("../../intake-answers");
  const { data } = await db()
    .from("portal_accounts")
    .select("intake")
    .eq("id", dealId)
    .maybeSingle();
  return readIntake(data?.intake).ai_reading;
}

/** Merge onto the record only while it is this job's; another job's record is not ours to touch. */
async function touchReadingOf(job: AiJobRow, patch: Partial<Reading>): Promise<void> {
  if (!job.deal_id) return;
  try {
    const current = await currentReading(job.deal_id);
    if (!current || current.job_id !== job.id) return;
    const { mergeIntake } = await import("../intake-merge");
    await mergeIntake(job.deal_id, { ai_reading: { ...current, ...patch } });
  } catch (e) {
    console.error("[ai-jobs] could not touch the reading", job.id, e);
  }
}

/**
 * Wake the cron now instead of waiting for the minute. Fire-and-mostly-
 * forget: two seconds for the request to land, then on with the day. On
 * Vercel the route answers as soon as it has claimed its jobs and runs the
 * steps after the response (`waitUntil`), so the caller waits a round trip,
 * not a step; elsewhere the two seconds are the ceiling. Never throws, and
 * does nothing where there is no secret, or no CONFIGURED base URL, to
 * call with — never the request's own host: the kick carries the cron
 * secret, and the request's Host header is the caller's to set. Without a
 * base the minute cron picks the job up.
 */
export async function kickAiJobs(fetchImpl: typeof fetch = fetch): Promise<void> {
  const secret = process.env["CRON_SECRET"];
  const base = configuredAppUrl();
  if (!secret || !base) return;
  try {
    await fetchImpl(`${base}/api/cron/ai-jobs`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(KICK_TIMEOUT_MS),
    });
  } catch {
    // The cron runs every minute regardless; a kick that did not land costs
    // at most a minute.
  }
}

/**
 * Queue the automatic reading for a deal, when the flag allows it, and wake
 * the cron. Every server-side trigger (a SOW upload, pasted notes, a close)
 * calls this and never waits on the reading itself. Never throws: the
 * upload or the close that triggered it must not fail over the reading.
 */
export async function autoReadDeal(
  dealId: string,
  trigger: string,
  requestedBy: string | null = null,
  /**
   * `pump: false` from a caller that has already used much of its function
   * (the Salesforce pull, one call per opportunity): the pump assumes a
   * short request before it. The kick and the cron take the job instead.
   */
  opts: { pump?: boolean } = {},
): Promise<EnqueueResult | null> {
  try {
    const { isFlagOn } = await import("../../app-config.server");
    if (!(await isFlagOn("ai_auto_read"))) return null;
    const r = await enqueueAiJob({ kind: "prepare_deal", dealId, trigger, requestedBy });
    if (opts.pump !== false) {
      // Worked here, after the response, whether or not a scheduler runs.
      const { pumpAiJobsInProcess } = await import("./pump");
      pumpAiJobsInProcess(`auto:${trigger}`);
    }
    await kickAiJobs();
    return r;
  } catch (e) {
    console.error("[ai-jobs] could not queue the automatic reading", dealId, trigger, e);
    return null;
  }
}

/* ----------------------------------------------------------------- claim */

/** What a reclaimed job's attempt is recorded as. */
export const CUT_OFF_ERROR = "The step was cut off before it finished";

/**
 * Take up to `limit` due jobs for this invocation. A lock older than six
 * minutes belongs to a function that was cut off; that counts as a failed
 * attempt like any other — backoff, then the same step again, and after
 * `max_attempts` the job is failed and the humans told. Without that, a
 * step too long for the function ceiling would be re-run, and re-spent,
 * every tick forever.
 */
export async function claimJobs(limit: number, now: Date = new Date()): Promise<AiJobRow[]> {
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS).toISOString();
  const { data: stale } = await db()
    .from("portal_ai_jobs")
    .select("*")
    .eq("status", "running")
    .lt("locked_at", staleBefore);
  for (const row of (stale ?? []) as AiJobRow[]) {
    // Conditional on the lock it was found with, and the lock replaced: a
    // step that finished meanwhile has moved the row, and two overlapping
    // ticks cannot both count the same cut-off. The failure is written
    // under the new lock — the one the row now holds.
    const token = randomUUID();
    const { data } = await db()
      .from("portal_ai_jobs")
      .update({ locked_at: nowIso, lock_token: token })
      .eq("id", row.id)
      .eq("status", "running")
      .eq("lock_token", row.lock_token)
      .select("id");
    if ((data ?? []).length === 0) continue;
    await failJob({ ...row, lock_token: token }, CUT_OFF_ERROR);
  }

  const { data: due } = await db()
    .from("portal_ai_jobs")
    .select("*")
    .eq("status", "queued")
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(limit);

  const claimed: AiJobRow[] = [];
  for (const row of (due ?? []) as AiJobRow[]) {
    const lockToken = randomUUID();
    const patch = {
      status: "running",
      lock_token: lockToken,
      locked_at: nowIso,
      started_at: row.started_at ?? nowIso,
    };
    // Conditional on the row still being queued: two ticks that overlap
    // cannot both take the same job.
    const { data } = await db()
      .from("portal_ai_jobs")
      .update(patch)
      .eq("id", row.id)
      .eq("status", "queued")
      .select("*");
    const got = (data ?? [])[0] as AiJobRow | undefined;
    if (got) claimed.push({ ...row, ...patch, ...got } as AiJobRow);
  }
  return claimed;
}

/* ------------------------------------------------------------------- run */

/** One load of each kind's step module, shared by the jobs a tick runs side by side. */
const stepModules: {
  prepare_deal?: Promise<typeof import("./steps/prepare-deal")>;
  analyze_transcript?: Promise<typeof import("./steps/analyze-transcript")>;
} = {};

async function stepSetFor(kind: AiJobKind): Promise<StepSet> {
  switch (kind) {
    case "prepare_deal": {
      const m = await (stepModules.prepare_deal ??= import("./steps/prepare-deal"));
      return { order: m.PREPARE_DEAL_STEPS, steps: m.prepareDealSteps };
    }
    case "analyze_transcript": {
      const m = await (stepModules.analyze_transcript ??= import("./steps/analyze-transcript"));
      return { order: m.ANALYZE_TRANSCRIPT_STEPS, steps: m.analyzeTranscriptSteps };
    }
  }
}

export type RunOutcome =
  | { outcome: "advanced"; step: string; next: string }
  | { outcome: "finished"; step: string }
  | { outcome: "failed"; step: string; error: string; final: boolean }
  /** The lock was taken from this runner while it ran; nothing was written. */
  | { outcome: "lost_lock"; step: string };

/**
 * The row no longer carries this runner's lock: the stale sweep reclaimed
 * it (a step that outlived the stale window) and another runner may be on
 * the same step. Whoever holds the lock now owns the writes.
 */
export class LockLostError extends Error {
  constructor(public readonly jobId: string) {
    super(`The AI job ${jobId} was reclaimed while this step ran; its result was not written`);
    this.name = "LockLostError";
  }
}

/**
 * Run the job's current step and write what happened. Throws nothing of
 * its own: a step that throws is recorded as a failed attempt with backoff,
 * and the caller gets the outcome either way.
 */
export async function runOneStep(
  job: AiJobRow,
  ctx: StepContext = { now: () => new Date() },
  /** `kick: false` when the caller runs the next step itself (the in-process pump). */
  opts: { kick?: boolean } = {},
): Promise<RunOutcome> {
  const set = await stepSetFor(job.kind);
  const step = job.step ?? set.order[0]!;
  const fn = set.steps[step];
  if (!fn) {
    const error = `Unknown step "${step}" for ${job.kind}`;
    const final = await failJob(job, error);
    return { outcome: "failed", step, error, final };
  }
  let out: StepOutcome;
  try {
    out = await fn(job, ctx);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const final = await failJob(job, error);
    return { outcome: "failed", step, error, final };
  }
  const index = set.order.indexOf(step);
  const next = out.skipTo ?? (index >= 0 ? (set.order[index + 1] ?? null) : null);
  try {
    await advanceJob(job, step, out, next);
  } catch (e) {
    if (e instanceof LockLostError) {
      console.error("[ai-jobs] lost the lock", job.id, step);
      return { outcome: "lost_lock", step };
    }
    throw e;
  }
  if (next) {
    // The next step starts now, in a fresh invocation, not next minute.
    if (opts.kick !== false) await kickAiJobs();
    return { outcome: "advanced", step, next };
  }
  return { outcome: "finished", step };
}

/**
 * Give a claimed job back untouched: queued again, unlocked, no attempt
 * counted. For a runner that claimed a step it has no time left to run.
 */
export async function releaseJob(job: AiJobRow): Promise<void> {
  const { error } = await ownRow(job, { status: "queued", lock_token: null, locked_at: null });
  if (error) console.error("[ai-jobs] could not release the job", job.id, error);
}

/** The advance write is tried this many times: a step is dear, the write is cheap. */
const ADVANCE_WRITE_TRIES = 3;

/**
 * A write to the claimed row, by id and by the lock this runner holds. A
 * row claimed without a lock (a direct call in a test) is written by id.
 */
function ownRow(job: AiJobRow, patch: Record<string, unknown>) {
  let q = db().from("portal_ai_jobs").update(patch).eq("id", job.id);
  if (job.lock_token) q = q.eq("lock_token", job.lock_token);
  return q;
}

/** Whether the row is still this runner's: present, and under its lock. */
async function lockHeld(job: AiJobRow): Promise<"held" | "lost" | "missing"> {
  const { data } = await db()
    .from("portal_ai_jobs")
    .select("id,lock_token")
    .eq("id", job.id)
    .maybeSingle();
  if (!data) return "missing";
  return !job.lock_token || data.lock_token === job.lock_token ? "held" : "lost";
}

/**
 * `steps_done`, usage, result and the next step, in one write. The write
 * is retried before the step is given up on, because a step re-run over a
 * failed write would spend its model calls again. The rerun and force
 * flags are read back from the row, not from the copy claimed minutes ago:
 * a request folded in during the last step must not be lost. Conditional
 * on the runner's lock: a runner the stale sweep gave up on writes
 * nothing over the runner that took its place.
 */
export async function advanceJob(
  job: AiJobRow,
  stepDone: string,
  out: StepOutcome,
  next: string | null,
): Promise<AiJobRow> {
  const now = new Date().toISOString();
  const usage = mergeUsage(job.usage, stepDone, out.usage);
  const result = mergeResult(job.result, out);
  const stepsDone = job.steps_done.includes(stepDone)
    ? job.steps_done
    : [...job.steps_done, stepDone];
  const patch: Record<string, unknown> = {
    steps_done: stepsDone,
    usage,
    result,
    last_error: null,
    lock_token: null,
    locked_at: null,
    ...(out.sourceHash !== undefined ? { source_hash: out.sourceHash } : {}),
  };
  if (next) {
    Object.assign(patch, { status: "queued", step: next, next_attempt_at: now });
  } else {
    Object.assign(patch, { status: "done", step: stepDone, finished_at: now });
  }
  let written: Pick<AiJobRow, "rerun_requested" | "force"> | null = null;
  let lastError = "no row";
  for (let attempt = 0; attempt < ADVANCE_WRITE_TRIES && !written; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 250 * attempt));
    const { data, error } = await ownRow(job, patch).select("rerun_requested,force");
    if (error) {
      lastError = error.message;
      continue;
    }
    const row = (data ?? [])[0] as Pick<AiJobRow, "rerun_requested" | "force"> | undefined;
    if (row) {
      written = row;
    } else {
      if ((await lockHeld(job)) === "lost") throw new LockLostError(job.id);
      lastError = "no row";
    }
  }
  if (!written) throw new Error(`Could not advance the AI job: ${lastError}`);
  const updated = { ...job, ...patch, ...written } as AiJobRow;

  if (!next) await queueRerunIfAsked(job, updated);
  return updated;
}

/**
 * Something arrived while this job read: one more pass, as a new job, so
 * the dedupe index and the audit trail both see it for what it is. Called
 * once the job's row has left the active states, so the index allows the
 * fresh row. Never throws: the job ended either way.
 */
async function queueRerunIfAsked(
  job: AiJobRow,
  written: Pick<AiJobRow, "rerun_requested" | "force">,
): Promise<void> {
  if (!written.rerun_requested) return;
  try {
    await enqueueAiJob({
      kind: job.kind,
      dealId: job.deal_id,
      implementationId: job.implementation_id,
      subjectId: job.subject_id,
      trigger: "rerun",
      requestedBy: job.requested_by,
      force: written.force,
    });
    await kickAiJobs();
  } catch (e) {
    console.error("[ai-jobs] could not queue the rerun", job.id, e);
  }
}

/**
 * A failed attempt: back off 1 → 2 → 5 → 10 minutes and try the same step
 * again; past `max_attempts`, the job is failed, the humans are told once,
 * the deal's record says the reading did not finish, and material that
 * arrived while it ran (`rerun_requested`) still gets its reading as a
 * fresh job. Returns true when the failure was final. Conditional on the
 * runner's lock, like the advance: a runner that lost its lock records
 * nothing.
 */
export async function failJob(job: AiJobRow, error: string): Promise<boolean> {
  const attempts = (job.attempts ?? 0) + 1;
  const message = error.slice(0, 1000);
  const final = attempts >= (job.max_attempts ?? DEFAULT_MAX_ATTEMPTS);
  const now = new Date();
  if (!final) {
    const minutes = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length) - 1]!;
    const { data } = await ownRow(job, {
      status: "queued",
      attempts,
      last_error: message,
      lock_token: null,
      locked_at: null,
      next_attempt_at: new Date(now.getTime() + minutes * 60_000).toISOString(),
    }).select("id");
    if ((data ?? []).length === 0) {
      console.error("[ai-jobs] lost the lock before recording the failure", job.id);
      return false;
    }
    // The record keeps breathing through the wait, and says why it waits,
    // so the screen reads "retrying", not "stalled".
    await touchReadingOf(job, {
      status: "running",
      step: job.step ?? "sources",
      heartbeat_at: now.toISOString(),
      error: `Attempt ${attempts} did not finish: ${message}; retrying in ${minutes} min`.slice(
        0,
        500,
      ),
    });
    return false;
  }
  // The flags come back from the row: a fold during the last attempt is
  // not on the claimed copy.
  const { data: failed } = await ownRow(job, {
    status: "failed",
    attempts,
    last_error: message,
    lock_token: null,
    locked_at: null,
    finished_at: now.toISOString(),
  }).select("rerun_requested,force");
  const written = ((failed ?? [])[0] ?? null) as Pick<AiJobRow, "rerun_requested" | "force"> | null;
  if (!written) {
    console.error("[ai-jobs] lost the lock before recording the failure", job.id);
    return false;
  }
  const { safeCreateAlert } = await import("../events");
  const subject = await alertSubjectOf(job);
  // On /alerts and the deal's own record; it does not email (QA 12.6).
  await safeCreateAlert({
    kind: "ai_job_failed",
    severity: "warning",
    title: `The AI reading gave up after ${attempts} attempts`,
    detail: `${job.kind} · step ${job.step ?? "sources"} · ${message}`,
    customerId: subject.customerId,
    implementationId: subject.implementationId,
    payload: { job_id: job.id, deal_id: job.deal_id, kind: job.kind, step: job.step },
    ...(job.deal_id ? { dedupeOn: { key: "deal_id", value: job.deal_id } } : {}),
    notify: false,
  });
  if (job.deal_id) {
    try {
      await markReadingFailed(job, message);
    } catch (e) {
      console.error("[ai-jobs] could not mark the reading failed", job.id, e);
    }
  }
  // After the record says failed, so the fresh job's "queued" is what the
  // screen ends on, with the new job's id.
  await queueRerunIfAsked(job, written);
  return true;
}

/** The customer and implementation a failed job belongs to, so its alert links. */
async function alertSubjectOf(
  job: AiJobRow,
): Promise<{ customerId: string | null; implementationId: string | null }> {
  try {
    let customerId: string | null = null;
    let implementationId = job.implementation_id ?? null;
    if (job.deal_id) {
      const [{ data: deal }, { data: impl }] = await Promise.all([
        db().from("portal_accounts").select("customer_id").eq("id", job.deal_id).maybeSingle(),
        db()
          .from("implementations")
          .select("id,customer_id")
          .eq("deal_id", job.deal_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      customerId = deal?.customer_id ?? impl?.customer_id ?? null;
      implementationId ??= impl?.id ?? null;
    } else if (implementationId) {
      const { data: impl } = await db()
        .from("implementations")
        .select("customer_id")
        .eq("id", implementationId)
        .maybeSingle();
      customerId = impl?.customer_id ?? null;
    }
    return { customerId, implementationId };
  } catch {
    return { customerId: null, implementationId: job.implementation_id ?? null };
  }
}

async function markReadingFailed(job: AiJobRow, error: string): Promise<void> {
  const { readIntake } = await import("../../intake-answers");
  const { mergeIntake } = await import("../intake-merge");
  const { data } = await db()
    .from("portal_accounts")
    .select("intake")
    .eq("id", job.deal_id)
    .maybeSingle();
  const current = readIntake(data?.intake).ai_reading;
  const now = new Date().toISOString();
  await mergeIntake(job.deal_id!, {
    ai_reading: {
      ...(current ?? { started_at: job.started_at ?? now, filled: [], branches: {} }),
      status: "failed",
      job_id: job.id,
      step: job.step ?? "sources",
      heartbeat_at: now,
      finished_at: now,
      error: `The reading did not finish: ${error}`.slice(0, 500),
      again: false,
    },
  });
}

/* ---------------------------------------------------------------- merges */

function emptyUsage(): AiUsage & { calls: number } {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    calls: 0,
  };
}

function add(a: AiUsage & { calls: number }, b: AiUsage): AiUsage & { calls: number } {
  return {
    input_tokens: a.input_tokens + (b.input_tokens ?? 0),
    output_tokens: a.output_tokens + (b.output_tokens ?? 0),
    cache_read_input_tokens: a.cache_read_input_tokens + (b.cache_read_input_tokens ?? 0),
    cache_creation_input_tokens:
      a.cache_creation_input_tokens + (b.cache_creation_input_tokens ?? 0),
    calls: a.calls + 1,
  };
}

/** Totals plus a per-step breakdown; a step without a model call adds nothing. */
export function mergeUsage(
  current: Partial<AiJobUsage> | null | undefined,
  step: string,
  usage: AiUsage | undefined,
): AiJobUsage {
  const base: AiJobUsage = {
    ...emptyUsage(),
    ...(current ?? {}),
    by_step: { ...(current?.by_step ?? {}) },
  };
  if (!usage) return base;
  const total = add(base, usage);
  return {
    ...total,
    by_step: { ...base.by_step, [step]: add(base.by_step[step] ?? emptyUsage(), usage) },
  };
}

/** `filled`, `problems` and `branches` accumulate; other keys replace. */
export function mergeResult(
  current: Record<string, unknown> | null | undefined,
  out: StepOutcome,
): Record<string, unknown> {
  const prev = current ?? {};
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
  const { branches: newBranches, ...rest } = out.result ?? {};
  return {
    ...prev,
    ...rest,
    filled: [...list(prev["filled"]), ...(out.filled ?? [])],
    problems: [...list(prev["problems"]), ...(out.problems ?? [])],
    branches: {
      ...((prev["branches"] as Record<string, unknown> | undefined) ?? {}),
      ...((newBranches as Record<string, unknown> | undefined) ?? {}),
    },
  };
}

/* ------------------------------------------------------------------ reads */

export async function listAiJobs(limit = 50): Promise<AiJobRow[]> {
  const { data } = await db()
    .from("portal_ai_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AiJobRow[];
}

/** The last reading that ran to the end for a deal, whose hash says what it read. */
export async function lastDoneJobForDeal(
  dealId: string,
  kind: AiJobKind = "prepare_deal",
): Promise<AiJobRow | null> {
  const { data } = await db()
    .from("portal_ai_jobs")
    .select("*")
    .eq("kind", kind)
    .eq("deal_id", dealId)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AiJobRow | null) ?? null;
}

/**
 * The last reading that ended, however it ended. The short-circuit asks
 * this one: a done job with the same hash means nothing new; a failed one
 * means the same sources deserve another try.
 */
export async function lastFinishedJobForDeal(
  dealId: string,
  kind: AiJobKind = "prepare_deal",
): Promise<AiJobRow | null> {
  const { data } = await db()
    .from("portal_ai_jobs")
    .select("*")
    .eq("kind", kind)
    .eq("deal_id", dealId)
    .in("status", ["done", "failed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AiJobRow | null) ?? null;
}
