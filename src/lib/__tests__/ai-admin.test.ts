import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * Admin → Integrations → AI, over the fake: the 30-day totals and their
 * cost at list price, the jobs joined with deal names and timed, a job run
 * again as a forced reading, the effort setting validated and cached, and
 * the automatic flag flipped — each behind the role it needs.
 */
const h = vi.hoisted(() => {
  const state = { supabase: { client: null as any }, forward: null as any };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));

import {
  estimateAiCostUsd,
  getAiStatus,
  jobDurationMs,
  listAiJobsForAdmin,
  rerunAiJob,
  setAiAutoRead,
  setAiEffort,
  sumAiCalls,
} from "../ai-admin.server";
import { isFlagOn, resetFlagCache } from "../app-config.server";
import { aiEffort } from "../server/ai/config";
import { resetConfigCache } from "../server/app-config";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const MANAGER = "11111111-1111-4111-8111-222222222222";
const TIS = "11111111-1111-4111-8111-333333333333";
const DEAL = "22222222-2222-4222-8222-222222222222";
const OTHER_DEAL = "22222222-2222-4222-8222-333333333333";
const JOB_DONE = "44444444-4444-4444-8444-444444444441";
const JOB_RUNNING = "44444444-4444-4444-8444-444444444442";
const JOB_NO_DEAL = "44444444-4444-4444-8444-444444444443";
const JOB_OLD = "44444444-4444-4444-8444-444444444444";

const NOW = new Date("2026-10-08T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

const usage = (
  input: number,
  output: number,
  cacheRead = 0,
  cacheWrite = 0,
  calls: number | null = null,
) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheWrite,
  ...(calls !== null ? { calls } : {}),
});

const call = (createdAt: string, u: Record<string, number>) => ({
  actor_type: "system",
  action: "ai.call",
  entity_type: "account",
  entity_id: DEAL,
  payload: { kind: "brief_core", deal_id: DEAL, job_id: JOB_DONE, model: "m", usage: u, ms: 10 },
  created_at: createdAt,
});

const rows: Rows = {
  portal_profiles: [
    { id: ADMIN, role: "admin" },
    { id: MANAGER, role: "manager" },
    { id: TIS, role: "implementation" },
  ],
  portal_accounts: [
    { id: DEAL, name: "Summit Roofing", intake: {} },
    { id: OTHER_DEAL, name: "Acme", intake: {} },
  ],
  portal_ai_jobs: [
    {
      id: JOB_DONE,
      kind: "prepare_deal",
      deal_id: DEAL,
      status: "done",
      step: "finalize",
      steps_done: ["sources", "sow", "finalize"],
      trigger: "sow_upload",
      attempts: 1,
      force: false,
      rerun_requested: false,
      usage: usage(1200, 300, 900, 100, 3),
      last_error: null,
      created_at: daysAgo(1),
      started_at: "2026-10-07T12:00:00Z",
      finished_at: "2026-10-07T12:01:30Z",
    },
    {
      id: JOB_RUNNING,
      kind: "prepare_deal",
      deal_id: OTHER_DEAL,
      status: "running",
      step: "brief_core",
      steps_done: ["sources", "sow"],
      trigger: "closed_won",
      attempts: 2,
      force: false,
      rerun_requested: false,
      usage: {},
      last_error: "Attempt 1 did not finish: timeout",
      created_at: daysAgo(0.5),
      started_at: "2026-10-08T11:58:00Z",
      finished_at: null,
    },
    {
      id: JOB_NO_DEAL,
      kind: "analyze_transcript",
      deal_id: null,
      status: "queued",
      step: null,
      steps_done: [],
      trigger: "upload",
      attempts: 0,
      force: false,
      rerun_requested: false,
      usage: {},
      last_error: null,
      created_at: daysAgo(0.25),
      started_at: null,
      finished_at: null,
    },
    {
      id: JOB_OLD,
      kind: "prepare_deal",
      deal_id: DEAL,
      status: "done",
      step: "finalize",
      steps_done: [],
      trigger: "manual",
      attempts: 1,
      force: false,
      rerun_requested: false,
      usage: {},
      last_error: null,
      created_at: daysAgo(45),
      started_at: daysAgo(45),
      finished_at: daysAgo(45),
    },
  ],
  portal_audit_log: [
    call(daysAgo(2), usage(500_000, 100_000, 1_000_000, 200_000)),
    call(daysAgo(20), usage(500_000, 0)),
    // Past the window: not counted.
    call(daysAgo(31), usage(9_000_000, 9_000_000)),
    // Another action with a usage-shaped payload: not counted.
    { ...call(daysAgo(3), usage(7, 7)), action: "ai.something_else" },
  ],
  portal_app_config: [],
};

let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  fake = createFakeSupabase(rows);
  h.supabase.client = fake.client;
  resetFlagCache();
  resetConfigCache();
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  process.env["ANTHROPIC_API_KEY"] = "sk-test";
  delete process.env["ANTHROPIC_MODEL"];
  delete process.env["CRON_SECRET"];
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env["ANTHROPIC_API_KEY"];
});

describe("the 30-day totals", () => {
  it("sums the usage payloads and prices them at the Opus 5.5 list rates", () => {
    const sums = sumAiCalls([
      { usage: usage(500_000, 100_000, 1_000_000, 200_000) },
      { usage: usage(500_000, 0) },
      { usage: "not an object" },
      null,
    ]);
    expect(sums).toEqual({
      calls: 2,
      input_tokens: 1_000_000,
      output_tokens: 100_000,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 200_000,
    });
    // $4 + $2 + $0.20 + $1
    expect(estimateAiCostUsd(sums)).toBe(7.2);
    expect(estimateAiCostUsd(usage(0, 0))).toBe(0);
    expect(estimateAiCostUsd(usage(1_234_567, 0))).toBe(4.94);
  });

  it("getAiStatus reports the key, model, effort, flag, last job and the window's totals", async () => {
    const s = await getAiStatus(MANAGER);
    expect(s.configured).toBe(true);
    expect(s.model).toBe("claude-opus-5-5");
    expect(s.effort).toBe("high");
    expect(s.autoRead).toBe(true);
    expect(s.lastJob?.id).toBe(JOB_NO_DEAL);
    expect(s.totals30d).toEqual({
      jobs: 3,
      calls: 2,
      input_tokens: 1_000_000,
      output_tokens: 100_000,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 200_000,
      estimated_cost_usd: 7.2,
    });
  });

  it("reports an unset key and the model override", async () => {
    delete process.env["ANTHROPIC_API_KEY"];
    process.env["ANTHROPIC_MODEL"] = "claude-opus-5";
    const s = await getAiStatus(ADMIN);
    expect(s.configured).toBe(false);
    expect(s.model).toBe("claude-opus-5");
  });

  it("is manager-only", async () => {
    await expect(getAiStatus(TIS)).rejects.toThrow(/manager-only/);
    await expect(getAiStatus("nobody")).rejects.toThrow(/No portal profile/);
  });
});

describe("listAiJobsForAdmin", () => {
  it("joins the deal name, computes the duration and keeps the job's usage", async () => {
    const jobs = await listAiJobsForAdmin(MANAGER);
    expect(jobs.map((j) => j.id)).toEqual([JOB_NO_DEAL, JOB_RUNNING, JOB_DONE, JOB_OLD]);

    const done = jobs.find((j) => j.id === JOB_DONE)!;
    expect(done.deal_name).toBe("Summit Roofing");
    expect(done.duration_ms).toBe(90_000);
    expect(done.usage).toEqual({
      calls: 3,
      input_tokens: 1200,
      output_tokens: 300,
      cache_read_input_tokens: 900,
      cache_creation_input_tokens: 100,
    });

    // Still running: timed to now, and its usage is zeros rather than holes.
    const running = jobs.find((j) => j.id === JOB_RUNNING)!;
    expect(running.deal_name).toBe("Acme");
    expect(running.duration_ms).toBe(120_000);
    expect(running.usage.calls).toBe(0);
    expect(running.last_error).toMatch(/timeout/);

    const noDeal = jobs.find((j) => j.id === JOB_NO_DEAL)!;
    expect(noDeal.deal_name).toBeNull();
    expect(noDeal.duration_ms).toBeNull();
  });

  it("honours the limit", async () => {
    expect(await listAiJobsForAdmin(ADMIN, 2)).toHaveLength(2);
  });

  it("times a job from its first start to its finish, or to now", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    expect(jobDurationMs({ started_at: null, finished_at: null }, now)).toBeNull();
    expect(jobDurationMs({ started_at: "2026-10-08T11:59:00Z", finished_at: null }, now)).toBe(
      60_000,
    );
    expect(
      jobDurationMs(
        { started_at: "2026-10-08T11:00:00Z", finished_at: "2026-10-08T11:00:05Z" },
        now,
      ),
    ).toBe(5_000);
  });
});

describe("rerunAiJob", () => {
  it("queues a forced prepare_deal for the job's deal and records who asked", async () => {
    const r = await rerunAiJob(MANAGER, JOB_DONE);
    const created = fake.store["portal_ai_jobs"]!.find((j) => j.id === r.job_id);
    expect(r.created).toBe(true);
    expect(created).toMatchObject({
      kind: "prepare_deal",
      deal_id: DEAL,
      status: "queued",
      trigger: "admin",
      force: true,
      requested_by: MANAGER,
    });
    const audited = fake.store["portal_audit_log"]!.find((a) => a.action === "ai.job_rerun");
    expect(audited).toMatchObject({
      actor_id: MANAGER,
      entity_id: DEAL,
      payload: { from_job_id: JOB_DONE, job_id: r.job_id, created: true },
    });
  });

  it("folds into the deal's active job instead of racing it", async () => {
    const r = await rerunAiJob(ADMIN, JOB_RUNNING);
    expect(r.created).toBe(false);
    expect(r.job_id).toBe(JOB_RUNNING);
    // The running job took its snapshot already, so it is asked for one more pass.
    const active = fake.store["portal_ai_jobs"]!.find((j) => j.id === JOB_RUNNING)!;
    expect(active.rerun_requested).toBe(true);
    expect(active.force).toBe(true);
  });

  it("refuses a job without a deal, a missing job, and a non-manager", async () => {
    await expect(rerunAiJob(MANAGER, JOB_NO_DEAL)).rejects.toThrow(/Only a deal reading/);
    await expect(rerunAiJob(MANAGER, "55555555-5555-4555-8555-555555555555")).rejects.toThrow(
      /no longer exists/,
    );
    await expect(rerunAiJob(TIS, JOB_DONE)).rejects.toThrow(/manager-only/);
  });
});

describe("setAiEffort", () => {
  it("rejects a level that is not one of the five", async () => {
    await expect(setAiEffort(ADMIN, "turbo")).rejects.toThrow(/not an effort level/);
    expect(fake.store["portal_app_config"]).toHaveLength(0);
  });

  it("accepts xhigh, writes ai.effort and the next reading sees it", async () => {
    expect(await aiEffort("brief")).toBe("high");
    const r = await setAiEffort(ADMIN, "xhigh");
    expect(r.effort).toBe("xhigh");
    expect(fake.store["portal_app_config"]).toEqual([
      expect.objectContaining({ key: "ai.effort", value: "xhigh" }),
    ]);
    expect(await aiEffort("brief")).toBe("xhigh");
    expect((await getAiStatus(ADMIN)).effort).toBe("xhigh");

    // Saved again: one row, replaced, not a second one.
    await setAiEffort(ADMIN, "medium");
    expect(fake.store["portal_app_config"]).toHaveLength(1);
    expect(await aiEffort("sow_reading")).toBe("medium");

    const audited = fake.store["portal_audit_log"]!.filter((a) => a.action === "ai.effort_changed");
    expect(audited.map((a) => a.payload.effort)).toEqual(["xhigh", "medium"]);
    expect(audited[0]).toMatchObject({ actor_id: ADMIN, entity_key: "ai.effort" });
  });

  it("is admin-only", async () => {
    await expect(setAiEffort(MANAGER, "xhigh")).rejects.toThrow(/Admin only/);
    await expect(setAiEffort(TIS, "xhigh")).rejects.toThrow(/manager-only/);
  });
});

describe("setAiAutoRead", () => {
  it("flips the flag both ways and leaves other flags alone", async () => {
    fake.store["portal_app_config"]!.push({ key: "v2_flags", value: { sf_pull_enabled: true } });
    expect(await isFlagOn("ai_auto_read")).toBe(true);

    expect(await setAiAutoRead(MANAGER, false)).toEqual({ enabled: false });
    expect(await isFlagOn("ai_auto_read")).toBe(false);
    expect(await isFlagOn("sf_pull_enabled")).toBe(true);
    expect((await getAiStatus(MANAGER)).autoRead).toBe(false);

    expect(await setAiAutoRead(ADMIN, true)).toEqual({ enabled: true });
    expect(await isFlagOn("ai_auto_read")).toBe(true);

    const audited = fake.store["portal_audit_log"]!.filter(
      (a) => a.action === "integration.flag_changed",
    );
    expect(audited.map((a) => a.payload)).toEqual([
      { flag: "ai_auto_read", enabled: false },
      { flag: "ai_auto_read", enabled: true },
    ]);
  });

  it("is manager-only", async () => {
    await expect(setAiAutoRead(TIS, false)).rejects.toThrow(/manager-only/);
  });
});
