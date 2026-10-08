import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * One tick of the AI cron over the fake database: the claim limit, each
 * claimed job run one step, the tally and its audit row, and a kick (POST)
 * answered before the steps run where the runtime has `waitUntil`.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    steps: {
      PREPARE_DEAL_STEPS: ["sources", "finalize"] as const,
      prepareDealSteps: {} as Record<string, any>,
    },
    audits: [] as any[],
    flags: { isFlagOn: async () => true },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../server/ai/steps/prepare-deal", () => h.steps);
vi.mock("../server/audit", () => ({ audit: async (e: any) => void h.audits.push(e) }));
vi.mock("../app-config.server", () => h.flags);

import { CLAIM_LIMIT, runClaimed, tickAiJobs, waitUntilOf } from "../server/ai/cron";
import type { AiJobRow } from "../server/ai/jobs";

const rows: Rows = { portal_ai_jobs: [], portal_accounts: [] };
let fake: ReturnType<typeof createFakeSupabase>;
const jobs = () => fake.store["portal_ai_jobs"]! as AiJobRow[];
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

function due(id: string, over: Partial<AiJobRow> = {}): void {
  jobs().push({
    id,
    kind: "prepare_deal",
    deal_id: `deal-${id}`,
    status: "queued",
    step: null,
    steps_done: [],
    attempts: 0,
    max_attempts: 4,
    next_attempt_at: minutesAgo(1),
    result: {},
    usage: {},
    ...over,
  } as AiJobRow);
}

beforeEach(() => {
  fake = createFakeSupabase(rows);
  h.supabase.client = fake.client;
  h.audits.length = 0;
  h.steps.prepareDealSteps = {
    sources: vi.fn(async () => ({ sourceHash: "h" })),
    finalize: vi.fn(async () => ({ result: { status: "done" } })),
  };
  delete process.env["CRON_SECRET"];
});

describe("tickAiJobs", () => {
  it("claims at most the limit, runs one step of each, and reports the tally with an audit row", async () => {
    for (let i = 0; i < CLAIM_LIMIT + 1; i++) due(`j${i}`, { next_attempt_at: minutesAgo(10 - i) });
    due("last", { step: "finalize", steps_done: ["sources"], next_attempt_at: minutesAgo(20) });
    h.steps.prepareDealSteps["sources"] = vi
      .fn()
      .mockResolvedValueOnce({ sourceHash: "h" })
      .mockRejectedValueOnce(new Error("the model timed out"));

    const res = await tickAiJobs(new Request("https://hub.example.com/api/cron/ai-jobs"));
    expect(await res.json()).toEqual({
      ok: true,
      claimed: CLAIM_LIMIT,
      advanced: 1,
      finished: 1,
      failed: 1,
      lost: 0,
    });
    // Oldest due first: "last", then j0, j1; j2 and j3 wait for the next tick.
    expect(h.steps.prepareDealSteps["finalize"]).toHaveBeenCalledTimes(1);
    expect(h.steps.prepareDealSteps["sources"]).toHaveBeenCalledTimes(2);
    expect(jobs().find((j) => j.id === "last")!.status).toBe("done");
    expect(jobs().find((j) => j.id === "j0")).toMatchObject({ status: "queued", step: "finalize" });
    expect(jobs().find((j) => j.id === "j1")).toMatchObject({ status: "queued", attempts: 1 });
    expect(jobs().find((j) => j.id === "j2")!.step).toBeNull();
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({
      actor_type: "system",
      action: "cron.ai_jobs",
      payload: { claimed: 3, advanced: 1, finished: 1, failed: 1 },
    });
  });

  it("answers an empty tick without touching anything", async () => {
    const res = await tickAiJobs(new Request("https://hub.example.com/api/cron/ai-jobs"));
    expect(await res.json()).toMatchObject({ ok: true, claimed: 0 });
    expect(h.audits).toHaveLength(0);
  });

  it("answers a kick as soon as the jobs are claimed and runs the steps after the response", async () => {
    due("j0");
    let deferred: Promise<unknown> | null = null;
    const request = Object.assign(
      new Request("https://hub.example.com/api/cron/ai-jobs", { method: "POST" }),
      { waitUntil: (p: Promise<unknown>) => void (deferred = p) },
    );
    const res = await tickAiJobs(request);
    expect(await res.json()).toEqual({ ok: true, claimed: 1, deferred: true });
    // The runtime was handed the running steps, not a function to call.
    expect(deferred).toBeInstanceOf(Promise);
    await deferred;
    expect(jobs()[0]).toMatchObject({ status: "queued", step: "finalize" });
    expect(h.audits).toHaveLength(1);
  });

  it("runs the steps before answering a kick where the runtime has no waitUntil", async () => {
    due("j0");
    const res = await tickAiJobs(
      new Request("https://hub.example.com/api/cron/ai-jobs", { method: "POST" }),
    );
    expect(await res.json()).toMatchObject({ ok: true, claimed: 1, advanced: 1 });
    expect(jobs()[0]).toMatchObject({ status: "queued", step: "finalize" });
  });

  it("counts a runner that lost its lock apart from a failure", async () => {
    due("j0", { status: "running", lock_token: "mine" });
    h.steps.prepareDealSteps["sources"] = vi.fn(async () => {
      Object.assign(jobs()[0]!, { lock_token: "theirs" });
      return { sourceHash: "h" };
    });
    const summary = await runClaimed([{ ...jobs()[0]! }]);
    expect(summary).toMatchObject({ claimed: 1, lost: 1, failed: 0, advanced: 0 });
  });
});

describe("waitUntilOf", () => {
  it("finds the runtime's waitUntil on the request, else on Vercel's context, else nothing", () => {
    const plain = new Request("https://x/");
    expect(waitUntilOf(plain)).toBeNull();
    const fn = () => {};
    expect(waitUntilOf(Object.assign(new Request("https://x/"), { waitUntil: fn }))).toBe(fn);
    const key = Symbol.for("@vercel/request-context");
    (globalThis as Record<symbol, unknown>)[key] = { get: () => ({ waitUntil: fn }) };
    try {
      expect(waitUntilOf(plain)).toBe(fn);
    } finally {
      delete (globalThis as Record<symbol, unknown>)[key];
    }
  });
});
