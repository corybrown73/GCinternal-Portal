import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The AI job queue: one active job per deal, a rerun only when it would
 * read something the active job cannot see, locks that a dead function
 * gives back, steps that advance the row, and a failure that backs off
 * and finally gives up with an alert and an honest record.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    steps: {
      PREPARE_DEAL_STEPS: ["sources", "sow", "brief", "finalize"] as const,
      prepareDealSteps: {} as Record<string, any>,
    },
    alerts: [] as any[],
    events: null as any,
    flags: { isFlagOn: async () => true },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  state.events = { safeCreateAlert: async (a: any) => (state.alerts.push(a), { created: true }) };
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../server/ai/steps/prepare-deal", () => h.steps);
vi.mock("../server/events", () => h.events);
vi.mock("../app-config.server", () => h.flags);

import {
  advanceJob,
  autoReadDeal,
  BACKOFF_MINUTES,
  claimJobs,
  CUT_OFF_ERROR,
  enqueueAiJob,
  failJob,
  kickAiJobs,
  lastDoneJobForDeal,
  lastFinishedJobForDeal,
  listAiJobs,
  mergeResult,
  mergeUsage,
  runOneStep,
  type AiJobRow,
} from "../server/ai/jobs";

const DEAL = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

const rows: Rows = {
  portal_ai_jobs: [],
  portal_accounts: [{ id: DEAL, name: "Summit", intake: {} }],
  alerts: [],
};

let fake: ReturnType<typeof createFakeSupabase>;
const jobs = () => fake.store["portal_ai_jobs"]! as AiJobRow[];
const reading = () => fake.store["portal_accounts"]![0]!.intake.ai_reading;
const usage = (n: number) => ({
  input_tokens: n,
  output_tokens: n * 2,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
});

beforeEach(() => {
  fake = createFakeSupabase(rows);
  h.supabase.client = fake.client;
  h.alerts.length = 0;
  h.steps.prepareDealSteps = {
    sources: vi.fn(async () => ({ sourceHash: "h1", usage: usage(10) })),
    sow: vi.fn(async () => ({ filled: ["2 services from the SOW"], usage: usage(20) })),
    brief: vi.fn(async () => ({ filled: ["the onboarding flow"] })),
    finalize: vi.fn(async () => ({ result: { status: "done" } })),
  };
  delete process.env["CRON_SECRET"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("enqueueAiJob", () => {
  it("creates a queued job for the deal, and the record says queued at once", async () => {
    fake.store["portal_accounts"]![0]!.intake = {
      ai_reading: {
        status: "done",
        started_at: "2026-10-01T00:00:00Z",
        filled: ["the forms"],
        branches: { brief: { status: "ok", detail: "read" } },
      },
    };
    const r = await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "sow_upload" });
    expect(r.created).toBe(true);
    expect(r.rerunRequested).toBe(false);
    expect(jobs()).toHaveLength(1);
    expect(jobs()[0]).toMatchObject({
      kind: "prepare_deal",
      deal_id: DEAL,
      status: "queued",
      trigger: "sow_upload",
      force: false,
      rerun_requested: false,
      attempts: 0,
    });
    // The screen shows the queue from the request on; the last reading's
    // list stays for a run that finds nothing new.
    expect(reading()).toMatchObject({
      status: "queued",
      job_id: r.job.id,
      step: null,
      error: null,
      filled: ["the forms"],
      branches: { brief: { status: "ok" } },
    });
    expect(reading().heartbeat_at).toBeTruthy();
  });

  it("returns the queued job unchanged on a second request — no rerun flag", async () => {
    const first = await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "sow_upload" });
    const second = await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "manual" });
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);
    expect(second.rerunRequested).toBe(false);
    expect(jobs()).toHaveLength(1);
    expect(jobs()[0]!.rerun_requested).toBe(false);
  });

  it("does not flag a rerun on a job that has not read its sources yet", async () => {
    const { job } = await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "a" });
    Object.assign(jobs()[0]!, { status: "running", steps_done: [] });
    const r = await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "b" });
    expect(r.job.id).toBe(job.id);
    expect(r.rerunRequested).toBe(false);
    expect(jobs()[0]!.rerun_requested).toBe(false);
  });

  it("asks for one more run when the active job already took its snapshot", async () => {
    await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "a" });
    Object.assign(jobs()[0]!, { status: "running", steps_done: ["sources"], step: "sow" });
    const r = await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "b", force: true });
    expect(r.created).toBe(false);
    expect(r.rerunRequested).toBe(true);
    expect(jobs()[0]!.rerun_requested).toBe(true);
    // "Read again" during a run carries its force onto the rerun.
    expect(jobs()[0]!.force).toBe(true);
  });

  it("flags the rerun on a job parked between steps too — it is as blind as a running one", async () => {
    await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "a" });
    Object.assign(jobs()[0]!, { status: "queued", steps_done: ["sources"], step: "sow" });
    const r = await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "sow_upload" });
    expect(r.created).toBe(false);
    expect(r.rerunRequested).toBe(true);
    expect(jobs()[0]!.rerun_requested).toBe(true);
  });

  it("brings a backed-off retry forward when a person asks, and revives the record", async () => {
    await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "a" });
    const later = new Date(Date.now() + 5 * 60_000).toISOString();
    Object.assign(jobs()[0]!, {
      status: "queued",
      step: "sow",
      attempts: 2,
      next_attempt_at: later,
    });
    fake.store["portal_accounts"]![0]!.intake.ai_reading.heartbeat_at = new Date(
      Date.now() - 9 * 60_000,
    ).toISOString();
    // An automatic trigger leaves the wait alone.
    await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "call_notes" });
    expect(jobs()[0]!.next_attempt_at).toBe(later);
    // "Read again" does not.
    const before = Date.now();
    await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "manual", force: true });
    expect(Date.parse(jobs()[0]!.next_attempt_at)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(jobs()[0]!.next_attempt_at)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(reading().heartbeat_at)).toBeGreaterThanOrEqual(before - 1000);
    expect(reading().error).toBeNull();
  });

  it("queues a fresh job when the active one finished between the read and the fold", async () => {
    const { job } = await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "a" });
    Object.assign(jobs()[0]!, { status: "running", steps_done: ["sources"], step: "finalize" });
    // The last step's done write lands after the fold read the row and
    // before it wrote: the fake flips the row on the fold's first update.
    const origFrom = fake.client.from;
    let flipped = false;
    fake.client.from = (table: string) => {
      const b = origFrom(table);
      if (table === "portal_ai_jobs" && !flipped) {
        const update = b.update.bind(b);
        b.update = (patch: Record<string, unknown>) => {
          flipped = true;
          Object.assign(jobs()[0]!, { status: "done", finished_at: new Date().toISOString() });
          return update(patch);
        };
      }
      return b;
    };
    const r = await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "sow_upload" });
    expect(flipped).toBe(true);
    expect(r.created).toBe(true);
    expect(r.job.id).not.toBe(job.id);
    expect(jobs()).toHaveLength(2);
    // The flag never landed on the done row; the new job carries the work.
    expect(jobs()[0]!.rerun_requested).toBe(false);
    expect(jobs()[1]).toMatchObject({ status: "queued", trigger: "sow_upload" });
  });

  it("keeps deals apart and lets a new job follow a finished one", async () => {
    await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "a" });
    await enqueueAiJob({ kind: "prepare_deal", dealId: OTHER, trigger: "a" });
    expect(jobs()).toHaveLength(2);
    Object.assign(jobs()[0]!, { status: "done" });
    const r = await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "b" });
    expect(r.created).toBe(true);
    expect(jobs()).toHaveLength(3);
  });
});

describe("kickAiJobs", () => {
  it("POSTs to the cron with the secret, and swallows a failure", async () => {
    process.env["CRON_SECRET"] = "s3cret";
    process.env["PUBLIC_APP_URL"] = "https://hub.example.com";
    const calls: Array<[string, RequestInit]> = [];
    await kickAiJobs(async (url: any, init: any) => {
      calls.push([String(url), init]);
      throw new Error("connection refused");
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe("https://hub.example.com/api/cron/ai-jobs");
    expect(calls[0]![1].method).toBe("POST");
    expect((calls[0]![1].headers as Record<string, string>)["authorization"]).toBe("Bearer s3cret");
    delete process.env["PUBLIC_APP_URL"];
  });

  it("does nothing without a secret", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok"));
    await kickAiJobs(fetchImpl as any);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does nothing without a configured base URL — never the request's host", async () => {
    process.env["CRON_SECRET"] = "s3cret";
    for (const key of ["PUBLIC_APP_URL", "APP_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) {
      delete process.env[key];
    }
    const fetchImpl = vi.fn(async () => new Response("ok"));
    await kickAiJobs(fetchImpl as any);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("autoReadDeal", () => {
  it("queues the reading when the flag is on, and never throws", async () => {
    const r = await autoReadDeal(DEAL, "closed_won_api");
    expect(r?.created).toBe(true);
    expect(jobs()[0]!.trigger).toBe("closed_won_api");
  });

  it("does nothing when the flag is off", async () => {
    h.flags.isFlagOn = async () => false;
    try {
      expect(await autoReadDeal(DEAL, "sow_upload")).toBeNull();
      expect(jobs()).toHaveLength(0);
    } finally {
      h.flags.isFlagOn = async () => true;
    }
  });
});

describe("claimJobs", () => {
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

  it("locks what is due, leaves what is not, and reclaims a stale lock", async () => {
    jobs().push(
      {
        id: "due",
        kind: "prepare_deal",
        deal_id: DEAL,
        status: "queued",
        next_attempt_at: minutesAgo(1),
        steps_done: [],
        attempts: 0,
        max_attempts: 4,
      } as any,
      {
        id: "later",
        kind: "prepare_deal",
        deal_id: OTHER,
        status: "queued",
        next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        steps_done: [],
      } as any,
      {
        id: "stale",
        kind: "prepare_deal",
        deal_id: "44444444-4444-4444-8444-444444444444",
        status: "running",
        lock_token: "old",
        locked_at: minutesAgo(10),
        started_at: minutesAgo(10),
        next_attempt_at: minutesAgo(10),
        steps_done: ["sources"],
        step: "sow",
      } as any,
      {
        id: "busy",
        kind: "prepare_deal",
        deal_id: "55555555-5555-4555-8555-555555555555",
        status: "running",
        lock_token: "live",
        locked_at: minutesAgo(1),
        next_attempt_at: minutesAgo(1),
        steps_done: [],
      } as any,
    );
    const claimed = await claimJobs(3);
    expect(claimed.map((j) => j.id)).toEqual(["due"]);
    for (const j of claimed) {
      expect(j.status).toBe("running");
      expect(j.lock_token).toBeTruthy();
      expect(j.locked_at).toBeTruthy();
      expect(j.started_at).toBeTruthy();
    }
    // The cut-off is a failed attempt: the job keeps its place in the
    // steps, is handed back to the queue, and waits out the first backoff
    // rather than being re-run — and re-spent — this very tick.
    const stale = jobs().find((j) => j.id === "stale")!;
    expect(stale).toMatchObject({ status: "queued", step: "sow", attempts: 1, lock_token: null });
    expect(stale.last_error).toBe(CUT_OFF_ERROR);
    expect(Date.parse(stale.next_attempt_at)).toBeGreaterThan(Date.now());
    expect(h.alerts).toHaveLength(0);
    expect(jobs().find((j) => j.id === "busy")!.lock_token).toBe("live");
    expect(jobs().find((j) => j.id === "later")!.status).toBe("queued");
  });

  it("fails a job for good when its step is cut off once too often", async () => {
    await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "a" });
    Object.assign(jobs()[0]!, {
      status: "running",
      lock_token: "old",
      locked_at: minutesAgo(10),
      started_at: minutesAgo(30),
      step: "brief",
      steps_done: ["sources", "sow"],
      attempts: 3,
    });
    const claimed = await claimJobs(3);
    expect(claimed).toEqual([]);
    expect(jobs()[0]).toMatchObject({ status: "failed", attempts: 4, last_error: CUT_OFF_ERROR });
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0]).toMatchObject({ kind: "ai_job_failed" });
    expect(reading()).toMatchObject({ status: "failed", step: "brief" });
    expect(reading().error).toMatch(/cut off/);
  });

  it("takes at most the limit, oldest due first", async () => {
    for (let i = 0; i < 5; i++) {
      jobs().push({
        id: `j${i}`,
        kind: "prepare_deal",
        deal_id: `deal-${i}`,
        status: "queued",
        next_attempt_at: minutesAgo(10 - i),
        steps_done: [],
      } as any);
    }
    const claimed = await claimJobs(3);
    expect(claimed.map((j) => j.id)).toEqual(["j0", "j1", "j2"]);
  });
});

describe("runOneStep", () => {
  async function queued(over: Partial<AiJobRow> = {}): Promise<AiJobRow> {
    const { job } = await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "t" });
    Object.assign(jobs()[0]!, { status: "running", lock_token: "lock", ...over });
    return jobs()[0]!;
  }

  it("advances the row: steps_done, usage, the next step, queued again", async () => {
    const job = await queued();
    const out = await runOneStep(job);
    expect(out).toEqual({ outcome: "advanced", step: "sources", next: "sow" });
    const row = jobs()[0]!;
    expect(row.status).toBe("queued");
    expect(row.step).toBe("sow");
    expect(row.steps_done).toEqual(["sources"]);
    expect(row.source_hash).toBe("h1");
    expect(row.lock_token).toBeNull();
    expect(row.usage).toMatchObject({ input_tokens: 10, output_tokens: 20, calls: 1 });
    expect(row.usage.by_step?.["sources"]).toMatchObject({ input_tokens: 10, calls: 1 });
    expect(h.steps.prepareDealSteps["sources"]).toHaveBeenCalledWith(
      expect.objectContaining({ id: job.id }),
      expect.anything(),
    );
  });

  it("merges usage across steps and accumulates what was filled", async () => {
    const job = await queued({
      step: "sow",
      steps_done: ["sources"],
      usage: mergeUsage({}, "sources", usage(10)),
    });
    await runOneStep(job);
    const row = jobs()[0]!;
    expect(row.step).toBe("brief");
    expect(row.steps_done).toEqual(["sources", "sow"]);
    expect(row.usage).toMatchObject({ input_tokens: 30, output_tokens: 60, calls: 2 });
    expect(row.result["filled"]).toEqual(["2 services from the SOW"]);
  });

  it("jumps where the step says", async () => {
    h.steps.prepareDealSteps["sources"] = vi.fn(async () => ({
      sourceHash: "same",
      skipTo: "finalize",
      result: { nothing_new: true },
    }));
    const job = await queued();
    const out = await runOneStep(job);
    expect(out).toEqual({ outcome: "advanced", step: "sources", next: "finalize" });
    expect(jobs()[0]!.step).toBe("finalize");
    expect(jobs()[0]!.result["nothing_new"]).toBe(true);
  });

  it("finishes on the last step", async () => {
    const job = await queued({ step: "finalize", steps_done: ["sources", "sow", "brief"] });
    const out = await runOneStep(job);
    expect(out).toEqual({ outcome: "finished", step: "finalize" });
    const row = jobs()[0]!;
    expect(row.status).toBe("done");
    expect(row.finished_at).toBeTruthy();
    expect(row.steps_done).toEqual(["sources", "sow", "brief", "finalize"]);
    expect(await lastDoneJobForDeal(DEAL)).toMatchObject({ id: job.id });
  });

  it("queues a fresh job when a rerun was asked for mid-flight", async () => {
    const job = await queued({
      step: "finalize",
      steps_done: ["sources", "sow", "brief"],
      rerun_requested: true,
      force: true,
    });
    await runOneStep(job);
    expect(jobs()).toHaveLength(2);
    expect(jobs()[0]!.status).toBe("done");
    expect(jobs()[1]).toMatchObject({
      status: "queued",
      deal_id: DEAL,
      trigger: "rerun",
      force: true,
      step: null,
    });
  });

  it("honours a rerun asked for while the last step itself was running", async () => {
    const job = await queued({ step: "finalize", steps_done: ["sources", "sow", "brief"] });
    // The claimed copy says no; something arrives during finalize.
    h.steps.prepareDealSteps["finalize"] = vi.fn(async () => {
      Object.assign(jobs()[0]!, { rerun_requested: true, force: true });
      return { result: { status: "done" } };
    });
    expect(job.rerun_requested).toBe(false);
    await runOneStep(job);
    expect(jobs()).toHaveLength(2);
    expect(jobs()[1]).toMatchObject({ status: "queued", trigger: "rerun", force: true });
  });

  it("writes nothing when another runner took the lock while the step ran", async () => {
    // The runner's copy, as a claim hands it over; the store's row is another object.
    const job = { ...(await queued({ step: "sow", steps_done: ["sources"], lock_token: "mine" })) };
    // The stale sweep reclaimed the row and handed it on: a new lock.
    h.steps.prepareDealSteps["sow"] = vi.fn(async () => {
      Object.assign(jobs()[0]!, { lock_token: "theirs", attempts: 1 });
      return { filled: ["late"] };
    });
    const out = await runOneStep(job);
    expect(out).toEqual({ outcome: "lost_lock", step: "sow" });
    const row = jobs()[0]!;
    expect(row).toMatchObject({
      status: "running",
      step: "sow",
      lock_token: "theirs",
      attempts: 1,
    });
    expect(row.steps_done).toEqual(["sources"]);
    expect(row.result?.["filled"]).toBeUndefined();

    // A failure from the runner that lost its lock is not counted either.
    expect(await failJob(job, "too late")).toBe(false);
    expect(jobs()[0]).toMatchObject({ status: "running", lock_token: "theirs", attempts: 1 });
  });

  it("queues the rerun that was asked for even when the job fails for good", async () => {
    h.steps.prepareDealSteps["sow"] = vi.fn(async () => {
      // Material arrives during the last attempt: folded onto the row.
      Object.assign(jobs()[0]!, { rerun_requested: true });
      throw new Error("the model timed out");
    });
    const job = await queued({ step: "sow", steps_done: ["sources"], attempts: 3 });
    const last = await runOneStep(job);
    expect(last).toMatchObject({ outcome: "failed", final: true });
    expect(jobs()).toHaveLength(2);
    expect(jobs()[0]!.status).toBe("failed");
    expect(jobs()[1]).toMatchObject({ status: "queued", deal_id: DEAL, trigger: "rerun" });
    expect(h.alerts).toHaveLength(1);
    // The screen ends on the fresh job, not the dead one.
    expect(reading()).toMatchObject({ status: "queued", job_id: jobs()[1]!.id });
  });

  it("backs off on a thrown step, then fails for good with an alert and an honest record", async () => {
    h.steps.prepareDealSteps["sow"] = vi.fn(async () => {
      throw new Error("the model timed out");
    });
    const job = await queued({ step: "sow", steps_done: ["sources"] });
    const before = Date.now();
    const first = await runOneStep(job);
    expect(first).toMatchObject({ outcome: "failed", step: "sow", final: false });
    let row = jobs()[0]!;
    expect(row.status).toBe("queued");
    expect(row.attempts).toBe(1);
    expect(row.last_error).toMatch(/timed out/);
    expect(row.step).toBe("sow");
    const wait = Date.parse(row.next_attempt_at) - before;
    expect(wait).toBeGreaterThanOrEqual(BACKOFF_MINUTES[0] * 60_000 - 1000);
    expect(wait).toBeLessThan(BACKOFF_MINUTES[1] * 60_000);
    expect(h.alerts).toHaveLength(0);
    // The record breathes through the wait and says why, so the screen
    // reads "retrying", not "stalled".
    expect(reading()).toMatchObject({ status: "running", step: "sow", job_id: job.id });
    expect(reading().error).toMatch(
      /Attempt 1 did not finish: the model timed out; retrying in 1 min/,
    );
    expect(Date.parse(reading().heartbeat_at)).toBeGreaterThanOrEqual(before - 1000);

    // Attempts two and three wait longer.
    await failJob({ ...row, status: "running" }, "again");
    expect(Date.parse(jobs()[0]!.next_attempt_at) - Date.now()).toBeGreaterThan(
      BACKOFF_MINUTES[0] * 60_000,
    );
    await failJob({ ...jobs()[0]!, status: "running" }, "and again");
    expect(jobs()[0]!.attempts).toBe(3);
    expect(h.alerts).toHaveLength(0);

    // The fourth is the last.
    const last = await runOneStep({ ...jobs()[0]!, status: "running" });
    expect(last).toMatchObject({ outcome: "failed", final: true });
    row = jobs()[0]!;
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(4);
    expect(row.finished_at).toBeTruthy();
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0]).toMatchObject({
      kind: "ai_job_failed",
      severity: "warning",
      dedupeOn: { key: "deal_id", value: DEAL },
      // On /alerts and the deal's record, never in the managers' inboxes.
      notify: false,
    });
    expect(reading()).toMatchObject({ status: "failed", job_id: job.id });
    expect(reading().error).toMatch(/did not finish/);
  });
});

describe("the merges", () => {
  it("totals usage and keeps a per-step breakdown", () => {
    const a = mergeUsage(undefined, "sources", usage(10));
    const b = mergeUsage(a, "sow", usage(5));
    const c = mergeUsage(b, "sow", usage(5));
    expect(c).toMatchObject({ input_tokens: 20, output_tokens: 40, calls: 3 });
    expect(c.by_step["sow"]).toMatchObject({ input_tokens: 10, calls: 2 });
    expect(mergeUsage(c, "brief", undefined)).toEqual(c);
  });

  it("accumulates filled, problems and branches; other keys replace", () => {
    const r1 = mergeResult(
      {},
      { filled: ["a"], result: { branches: { sow: { status: "ok" } }, x: 1 } },
    );
    const r2 = mergeResult(r1, {
      filled: ["b"],
      problems: ["p"],
      result: { branches: { brief: { status: "failed" } }, x: 2 },
    });
    expect(r2["filled"]).toEqual(["a", "b"]);
    expect(r2["problems"]).toEqual(["p"]);
    expect(r2["branches"]).toEqual({ sow: { status: "ok" }, brief: { status: "failed" } });
    expect(r2["x"]).toBe(2);
  });
});

describe("the reads", () => {
  it("lists newest first and finds the last done job for a deal", async () => {
    jobs().push(
      {
        id: "a",
        kind: "prepare_deal",
        deal_id: DEAL,
        status: "done",
        source_hash: "old",
        created_at: "2026-10-01T00:00:00Z",
      } as any,
      {
        id: "b",
        kind: "prepare_deal",
        deal_id: DEAL,
        status: "done",
        source_hash: "new",
        created_at: "2026-10-02T00:00:00Z",
      } as any,
      {
        id: "c",
        kind: "prepare_deal",
        deal_id: DEAL,
        status: "failed",
        created_at: "2026-10-03T00:00:00Z",
      } as any,
    );
    expect((await listAiJobs(2)).map((j) => j.id)).toEqual(["c", "b"]);
    expect((await lastDoneJobForDeal(DEAL))?.source_hash).toBe("new");
    expect(await lastDoneJobForDeal(OTHER)).toBeNull();
    // The last that ended at all is the failed one.
    expect((await lastFinishedJobForDeal(DEAL))?.id).toBe("c");
  });

  it("advanceJob writes the source hash the step found", async () => {
    const { job } = await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "t" });
    await advanceJob(job, "sources", { sourceHash: "abc" }, "sow");
    expect(jobs()[0]!.source_hash).toBe("abc");
  });
});

describe("the fold, for the person waiting (QA 1.1, 1.3)", () => {
  it("records every trigger the active job absorbed", async () => {
    await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "call_notes" });
    await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "sow_upload" });
    await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "closed_won_ui" });
    await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "sow_upload" });
    expect(jobs()).toHaveLength(1);
    const folds = (fake.store["portal_audit_log"] ?? []).filter(
      (r: any) => r.action === "ai.job_folded",
    );
    expect(folds.map((r: any) => r.payload.trigger)).toEqual([
      "sow_upload",
      "closed_won_ui",
      "sow_upload",
    ]);
    // The row's result is the runner's alone.
    expect(jobs()[0]!.result).toEqual({});
    expect(jobs()[0]!.rerun_requested).toBe(false);
  });

  it("revives a stale queued job's record when a person asks, backoff or not", async () => {
    await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "call_notes" });
    // Due now (no backoff), untouched for five minutes, with a retry reason.
    Object.assign(jobs()[0]!, { next_attempt_at: new Date(Date.now() - 5 * 60_000).toISOString() });
    Object.assign(reading(), {
      heartbeat_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      error: "Attempt 1 did not finish: overloaded; retrying in 1 min",
    });
    const before = Date.now();
    await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "manual", force: true });
    expect(Date.parse(reading().heartbeat_at)).toBeGreaterThanOrEqual(before - 1000);
    expect(reading().error).toBeNull();
  });

  it("an automatic trigger leaves the record as it is", async () => {
    await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "call_notes" });
    const old = new Date(Date.now() - 5 * 60_000).toISOString();
    Object.assign(reading(), { heartbeat_at: old });
    await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "sow_upload" });
    expect(reading().heartbeat_at).toBe(old);
  });

  it("a fold during a step never undoes what the step wrote", async () => {
    const { job } = await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "t" });
    Object.assign(jobs()[0]!, { status: "running", lock_token: "lock" });
    const claimed = { ...jobs()[0]! };
    // The step ends first; the fold read the row before it did.
    await advanceJob(claimed, "sources", { filled: ["seats"] }, "sow");
    await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "sow_upload" });
    expect(jobs()[0]!.result["filled"]).toEqual(["seats"]);
    expect(jobs()[0]!.id).toBe(job.id);
  });
});

describe("the failure alert links the account", () => {
  it("names the deal's customer and implementation", async () => {
    const CUSTOMER = "44444444-4444-4444-8444-444444444444";
    fake.store["portal_accounts"]![0]!.customer_id = CUSTOMER;
    fake.store["implementations"] = [
      { id: "impl-old", deal_id: DEAL, customer_id: CUSTOMER, created_at: "2026-09-01T00:00:00Z" },
      { id: "impl-new", deal_id: DEAL, customer_id: CUSTOMER, created_at: "2026-10-01T00:00:00Z" },
    ];
    const { job } = await enqueueAiJob({ kind: "prepare_deal", dealId: DEAL, trigger: "t" });
    Object.assign(jobs()[0]!, { status: "running", attempts: 3, lock_token: "lock" });
    await failJob({ ...jobs()[0]!, id: job.id }, "gave up");
    expect(h.alerts[0]).toMatchObject({
      customerId: CUSTOMER,
      implementationId: "impl-new",
      notify: false,
    });
  });
});
