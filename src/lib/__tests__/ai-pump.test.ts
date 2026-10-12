import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The in-process pump: readings run after the response that queued them,
 * whether or not a scheduler exists — one step at a time, inside a wall
 * clock budget, through the same claim and lock as the cron, so the two
 * never run one step twice.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    steps: {
      PREPARE_DEAL_STEPS: ["sources", "sow", "finalize"] as const,
      prepareDealSteps: {} as Record<string, any>,
    },
    audits: [] as any[],
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../server/ai/steps/prepare-deal", () => h.steps);
vi.mock("../server/audit", () => ({ audit: async (e: any) => void h.audits.push(e) }));
vi.mock("../server/events", () => ({ safeCreateAlert: async () => ({ created: true }) }));

import { claimJobs, type AiJobRow } from "../server/ai/jobs";
import { AI_CALL_TIMEOUT_MS } from "../server/ai/config";
import { aiDeadline } from "../server/ai/deadline";
import {
  FUNCTION_CEILING_MS,
  HOST_ALLOWANCE_MS,
  isQuickStep,
  pumpAiJobs,
  pumpAiJobsInProcess,
  PUMP_BUDGET_MS,
  PUMP_MODEL_WINDOW_MS,
  WRITE_MARGIN_MS,
} from "../server/ai/pump";

const rows: Rows = { portal_ai_jobs: [], portal_accounts: [] };
let fake: ReturnType<typeof createFakeSupabase>;
const jobs = () => fake.store["portal_ai_jobs"]! as AiJobRow[];

function due(id: string, over: Partial<AiJobRow> = {}): void {
  jobs().push({
    id,
    kind: "prepare_deal",
    deal_id: null,
    status: "queued",
    step: null,
    steps_done: [],
    attempts: 0,
    max_attempts: 4,
    next_attempt_at: new Date(Date.now() - 60_000).toISOString(),
    result: {},
    usage: {},
    created_at: new Date().toISOString(),
    ...over,
  } as AiJobRow);
}

beforeEach(() => {
  fake = createFakeSupabase(rows);
  h.supabase.client = fake.client;
  h.audits.length = 0;
  h.steps.prepareDealSteps = {
    sources: vi.fn(async () => ({ sourceHash: "h" })),
    sow: vi.fn(async () => ({})),
    finalize: vi.fn(async () => ({ result: { status: "done" } })),
  };
  delete process.env["CRON_SECRET"];
});

describe("pumpAiJobs", () => {
  it("walks a reading to the end, one step at a time, with no scheduler", async () => {
    due("a");
    const kick = vi.fn(async () => {});
    const out = await pumpAiJobs("test", { kick });
    expect(out).toMatchObject({ steps: 3, finished: 1, failed: 0, stopped: "idle" });
    expect(jobs()[0]).toMatchObject({ status: "done", steps_done: ["sources", "sow", "finalize"] });
    // It runs the next step itself; no kick while it is working.
    expect(kick).not.toHaveBeenCalled();
    expect(h.audits.at(-1)).toMatchObject({ action: "ai.pump", payload: { reason: "test" } });
  });

  it("gives a model step back when a whole model call no longer fits, and kicks", async () => {
    due("a");
    let clock = 0;
    h.steps.prepareDealSteps["sources"] = vi.fn(async () => {
      clock += 30_000; // a slow load
      return { sourceHash: "h" };
    });
    const kick = vi.fn(async () => {});
    const out = await pumpAiJobs("test", { now: () => clock, kick });
    expect(out).toMatchObject({ steps: 1, stopped: "budget" });
    expect(h.steps.prepareDealSteps["sow"]).not.toHaveBeenCalled();
    // Back in the queue as it was: no attempt counted, no lock held.
    expect(jobs()[0]).toMatchObject({
      status: "queued",
      step: "sow",
      attempts: 0,
      lock_token: null,
    });
    expect(kick).toHaveBeenCalledTimes(1);
  });

  it("runs one model step near its start, then the quick steps after it", async () => {
    due("a");
    let clock = 0;
    h.steps.prepareDealSteps["sources"] = vi.fn(async () => {
      clock += 2_000;
      return { sourceHash: "h" };
    });
    h.steps.prepareDealSteps["sow"] = vi.fn(async () => {
      clock += 200_000; // a long model step
      return {};
    });
    const out = await pumpAiJobs("test", { now: () => clock, kick: async () => {} });
    expect(out).toMatchObject({ steps: 3, finished: 1, stopped: "idle" });
  });

  it("never starts a second model step: it would outlive the function", async () => {
    due("a");
    due("b", { next_attempt_at: new Date(Date.now() - 30_000).toISOString() });
    let clock = 0;
    h.steps.prepareDealSteps["sow"] = vi.fn(async () => {
      clock += 40_000;
      return {};
    });
    const kick = vi.fn(async () => {});
    const out = await pumpAiJobs("test", { now: () => clock, kick });
    expect(h.steps.prepareDealSteps["sow"]).toHaveBeenCalledTimes(1);
    expect(out.stopped).toBe("budget");
    expect(kick).toHaveBeenCalledTimes(1);
    // The worst case still ends inside the ceiling: a model step starts no
    // later than the budget less a whole model call.
    expect(PUMP_BUDGET_MS - PUMP_MODEL_WINDOW_MS + AI_CALL_TIMEOUT_MS).toBeLessThanOrEqual(
      PUMP_BUDGET_MS,
    );
    expect(HOST_ALLOWANCE_MS + PUMP_BUDGET_MS + WRITE_MARGIN_MS).toBeLessThanOrEqual(
      FUNCTION_CEILING_MS,
    );
  });

  it("runs every step under the pump's deadline", async () => {
    due("a");
    const seen: Array<number | null> = [];
    const out = await pumpAiJobs("test", {
      now: () => 1_000,
      kick: async () => {},
      run: async (job) => {
        seen.push(aiDeadline());
        return { outcome: "finished", step: job.step ?? "sources" };
      },
    });
    expect(out.steps).toBe(1);
    expect(seen).toEqual([1_000 + PUMP_BUDGET_MS]);
    expect(aiDeadline()).toBeNull();
  });

  it("stops at the default budget even if every step is quick", async () => {
    for (let i = 0; i < 50; i++) due(`j${i}`);
    let clock = 0;
    h.steps.prepareDealSteps["sources"] = vi.fn(async () => {
      clock += 20_000;
      return { sourceHash: "h" };
    });
    const out = await pumpAiJobs("test", { now: () => clock, kick: async () => {} });
    expect(out.stopped).toBe("budget");
    expect(clock).toBeLessThanOrEqual(PUMP_BUDGET_MS);
  });

  it("does nothing and writes no audit row when nothing is due", async () => {
    due("later", { next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString() });
    const out = await pumpAiJobs("test", { kick: async () => {} });
    expect(out).toMatchObject({ steps: 0, stopped: "idle" });
    expect(jobs()[0]!.status).toBe("queued");
    expect(h.audits).toHaveLength(0);
  });

  it("never runs a step the cron already holds: the claim is conditional on queued", async () => {
    due("a");
    // The cron claimed it first.
    const [cron] = await claimJobs(1);
    expect(cron?.id).toBe("a");
    const out = await pumpAiJobs("test", { kick: async () => {} });
    expect(out.steps).toBe(0);
    expect(h.steps.prepareDealSteps["sources"]).not.toHaveBeenCalled();
  });

  it("two pumps side by side run each step once", async () => {
    due("a");
    const [one, two] = await Promise.all([
      pumpAiJobs("one", { kick: async () => {} }),
      pumpAiJobs("two", { kick: async () => {} }),
    ]);
    expect(one.steps + two.steps).toBe(3);
    expect(h.steps.prepareDealSteps["sources"]).toHaveBeenCalledTimes(1);
    expect(h.steps.prepareDealSteps["sow"]).toHaveBeenCalledTimes(1);
    expect(h.steps.prepareDealSteps["finalize"]).toHaveBeenCalledTimes(1);
  });

  it("writes nothing over a runner that took its lock", async () => {
    due("a");
    h.steps.prepareDealSteps["sources"] = vi.fn(async () => {
      // The stale sweep reclaimed the row while this step ran.
      Object.assign(jobs()[0]!, { lock_token: "someone-else" });
      return { sourceHash: "h" };
    });
    const out = await pumpAiJobs("test", { kick: async () => {} });
    expect(out).toMatchObject({ steps: 1, lost: 1 });
    expect(jobs()[0]).toMatchObject({ lock_token: "someone-else", steps_done: [] });
  });

  it("records a step's failure through the same backoff as the cron", async () => {
    due("a");
    h.steps.prepareDealSteps["sources"] = vi.fn(async () => {
      throw new Error("overloaded");
    });
    const out = await pumpAiJobs("test", { kick: async () => {} });
    expect(out).toMatchObject({ steps: 1, failed: 1, stopped: "idle" });
    expect(jobs()[0]).toMatchObject({ status: "queued", attempts: 1, last_error: "overloaded" });
  });
});

describe("isQuickStep", () => {
  it("knows the steps that make no model call, and assumes the rest do", () => {
    expect(isQuickStep({ kind: "prepare_deal", step: null })).toBe(true);
    expect(isQuickStep({ kind: "prepare_deal", step: "finalize" })).toBe(true);
    expect(isQuickStep({ kind: "prepare_deal", step: "brief_core" })).toBe(false);
    expect(isQuickStep({ kind: "analyze_transcript", step: null })).toBe(false);
  });
});

describe("pumpAiJobsInProcess", () => {
  it("hands the loop to waitUntil", async () => {
    due("a");
    const handed: Promise<unknown>[] = [];
    const ok = pumpAiJobsInProcess("test", {
      waitUntil: (p) => void handed.push(p),
      kick: async () => {},
    });
    expect(ok).toBe(true);
    await Promise.all(handed);
    expect(jobs()[0]!.status).toBe("done");
  });

  it("does nothing where the runtime has no waitUntil", () => {
    due("a");
    expect(pumpAiJobsInProcess("test")).toBe(false);
    expect(jobs()[0]!.status).toBe("queued");
  });

  it("finds Vercel's request context without a request", async () => {
    due("a");
    const handed: Promise<unknown>[] = [];
    const key = Symbol.for("@vercel/request-context");
    (globalThis as Record<symbol, unknown>)[key] = {
      get: () => ({ waitUntil: (p: Promise<unknown>) => void handed.push(p) }),
    };
    try {
      expect(pumpAiJobsInProcess("test", { kick: async () => {} })).toBe(true);
      await Promise.all(handed);
      expect(jobs()[0]!.status).toBe("done");
    } finally {
      delete (globalThis as Record<symbol, unknown>)[key];
    }
  });
});
