import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MANAGE_ROLES } from "./roles";
import { audit } from "./server/audit";
import { aiConfigured, aiEffort, aiModel, isAiEffort, type AiEffort } from "./server/ai/config";
import { enqueueAiJob, kickAiJobs, listAiJobs, type AiJobRow } from "./server/ai/jobs";

const db = () => supabaseAdmin as any;

/**
 * The Supabase side of Admin → Integrations → AI: what the reading runs
 * with, what it has cost, the jobs it has run, and the three things an
 * operator may change (effort, the automatic flag, a job run again).
 *
 * Authorization is enforced here, as in sf-integration.server.ts, because
 * every query runs on the service-role client and RLS never sees it.
 */

/* ---------------------------------------------------------------- roles */

async function requireManager(userId: string): Promise<{ id: string; role: string }> {
  const { data } = await db()
    .from("portal_profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!data) throw new Error("No portal profile exists for this user");
  if (!MANAGE_ROLES.includes(data.role)) {
    throw new Error("AI settings are manager-only");
  }
  return data as { id: string; role: string };
}

async function requireAdmin(userId: string): Promise<{ id: string; role: string }> {
  const profile = await requireManager(userId);
  if (!["admin", "super_admin"].includes(profile.role)) {
    throw new Error("Admin only");
  }
  return profile;
}

/* ---------------------------------------------------------------- usage */

export type AiTotals = {
  jobs: number;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  estimated_cost_usd: number;
};

/** Claude Opus 5.5 list prices, dollars per million tokens. */
export const AI_PRICE_PER_MTOK = {
  input: 4,
  output: 20,
  cache_read: 0.2,
  cache_write: 5,
} as const;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
/** PostgREST hands back at most this many rows per request; the totals page through. */
const AUDIT_PAGE = 1000;

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Sum the `usage` payloads of `ai.call` audit rows; anything malformed counts as zero. */
export function sumAiCalls(payloads: unknown[]): Omit<AiTotals, "jobs" | "estimated_cost_usd"> {
  const t = {
    calls: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
  for (const p of payloads) {
    const usage = p && typeof p === "object" ? ((p as { usage?: unknown }).usage ?? null) : null;
    if (!usage || typeof usage !== "object") continue;
    const u = usage as Record<string, unknown>;
    t.calls += 1;
    t.input_tokens += num(u["input_tokens"]);
    t.output_tokens += num(u["output_tokens"]);
    t.cache_read_input_tokens += num(u["cache_read_input_tokens"]);
    t.cache_creation_input_tokens += num(u["cache_creation_input_tokens"]);
  }
  return t;
}

/** An estimate at list price, rounded to the cent: the invoice is the truth. */
export function estimateAiCostUsd(t: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}): number {
  const dollars =
    (t.input_tokens * AI_PRICE_PER_MTOK.input +
      t.output_tokens * AI_PRICE_PER_MTOK.output +
      t.cache_read_input_tokens * AI_PRICE_PER_MTOK.cache_read +
      t.cache_creation_input_tokens * AI_PRICE_PER_MTOK.cache_write) /
    1_000_000;
  return Math.round(dollars * 100) / 100;
}

async function aiCallPayloadsSince(sinceIso: string): Promise<unknown[]> {
  const out: unknown[] = [];
  // Cursor on created_at rather than offsets: a row inserted between pages
  // cannot shift the next page.
  let after = new Date(Date.parse(sinceIso) - 1).toISOString();
  for (;;) {
    const { data, error } = await db()
      .from("portal_audit_log")
      .select("created_at, payload")
      .eq("action", "ai.call")
      .gt("created_at", after)
      .order("created_at", { ascending: true })
      .limit(AUDIT_PAGE);
    if (error) throw new Error(`Could not read the AI usage: ${error.message}`);
    const rows = (data ?? []) as Array<{ created_at: string; payload: unknown }>;
    for (const r of rows) out.push(r.payload);
    if (rows.length < AUDIT_PAGE) break;
    after = rows[rows.length - 1]!.created_at;
  }
  return out;
}

async function totalsForLast30Days(now: Date): Promise<AiTotals> {
  const since = new Date(now.getTime() - THIRTY_DAYS_MS).toISOString();
  const [payloads, jobs] = await Promise.all([
    aiCallPayloadsSince(since),
    db()
      .from("portal_ai_jobs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
  ]);
  const sums = sumAiCalls(payloads);
  return {
    jobs: typeof jobs.count === "number" ? jobs.count : ((jobs.data ?? []) as unknown[]).length,
    ...sums,
    estimated_cost_usd: estimateAiCostUsd(sums),
  };
}

/* ----------------------------------------------------------------- jobs */

export type AiJobAdminRow = {
  id: string;
  kind: string;
  deal_id: string | null;
  deal_name: string | null;
  status: string;
  step: string | null;
  steps_done: string[];
  trigger: string;
  attempts: number;
  usage: {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
  last_error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  /** From the first start to the finish, or to now while it runs; null before it starts. */
  duration_ms: number | null;
};

export function jobDurationMs(job: Pick<AiJobRow, "started_at" | "finished_at">, now: Date) {
  if (!job.started_at) return null;
  const end = job.finished_at ? Date.parse(job.finished_at) : now.getTime();
  return Math.max(0, end - Date.parse(job.started_at));
}

function toAdminRow(job: AiJobRow, names: Map<string, string>, now: Date): AiJobAdminRow {
  const u = job.usage ?? {};
  return {
    id: job.id,
    kind: job.kind,
    deal_id: job.deal_id,
    deal_name: job.deal_id ? (names.get(job.deal_id) ?? null) : null,
    status: job.status,
    step: job.step,
    steps_done: Array.isArray(job.steps_done) ? job.steps_done : [],
    trigger: job.trigger,
    attempts: job.attempts ?? 0,
    usage: {
      calls: num(u.calls),
      input_tokens: num(u.input_tokens),
      output_tokens: num(u.output_tokens),
      cache_read_input_tokens: num(u.cache_read_input_tokens),
      cache_creation_input_tokens: num(u.cache_creation_input_tokens),
    },
    last_error: job.last_error,
    created_at: job.created_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
    duration_ms: jobDurationMs(job, now),
  };
}

async function jobsWithNames(limit: number, now: Date): Promise<AiJobAdminRow[]> {
  const jobs = await listAiJobs(limit);
  const ids = Array.from(new Set(jobs.map((j) => j.deal_id).filter((id): id is string => !!id)));
  const names = new Map<string, string>();
  if (ids.length) {
    const { data } = await db().from("portal_accounts").select("id, name").in("id", ids);
    for (const r of (data ?? []) as Array<{ id: string; name: string | null }>) {
      if (r.name) names.set(r.id, r.name);
    }
  }
  return jobs.map((j) => toAdminRow(j, names, now));
}

export async function listAiJobsForAdmin(userId: string, limit = 50): Promise<AiJobAdminRow[]> {
  await requireManager(userId);
  return jobsWithNames(Math.min(Math.max(1, limit), 200), new Date());
}

/* --------------------------------------------------------------- status */

export type AiStatus = {
  configured: boolean;
  model: string;
  effort: AiEffort;
  autoRead: boolean;
  lastJob: AiJobAdminRow | null;
  totals30d: AiTotals;
};

export async function getAiStatus(userId: string): Promise<AiStatus> {
  await requireManager(userId);
  const now = new Date();
  const { isFlagOn } = await import("./app-config.server");
  const [effort, autoRead, last, totals30d] = await Promise.all([
    aiEffort("brief"),
    isFlagOn("ai_auto_read"),
    jobsWithNames(1, now),
    totalsForLast30Days(now),
  ]);
  return {
    configured: aiConfigured(),
    model: aiModel(),
    effort,
    autoRead,
    lastJob: last[0] ?? null,
    totals30d,
  };
}

/* --------------------------------------------------------------- writes */

/**
 * Read the job's deal again, whatever the sources say: a forced reading
 * skips the "nothing new" short-circuit. The active job for the deal, if
 * any, absorbs the request the way every enqueue does.
 */
export async function rerunAiJob(
  userId: string,
  jobId: string,
): Promise<{ job_id: string; created: boolean }> {
  const profile = await requireManager(userId);
  const { data: job } = await db()
    .from("portal_ai_jobs")
    .select("id, kind, deal_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) throw new Error("That job no longer exists");
  if (!job.deal_id) throw new Error("Only a deal reading can be run again from here");

  const r = await enqueueAiJob({
    kind: "prepare_deal",
    dealId: job.deal_id as string,
    trigger: "admin",
    requestedBy: profile.id,
    force: true,
  });
  await kickAiJobs();
  await audit({
    actor_type: "user",
    actor_id: profile.id,
    action: "ai.job_rerun",
    entity_type: "account",
    entity_id: job.deal_id as string,
    payload: { from_job_id: jobId, job_id: r.job.id, created: r.created },
  });
  return { job_id: r.job.id, created: r.created };
}

/**
 * One level for every reading. A per-kind object someone wrote by hand is
 * replaced by the level chosen here; the screen offers one select, so that
 * is what it saves.
 */
export async function setAiEffort(userId: string, effort: string): Promise<{ effort: AiEffort }> {
  const profile = await requireAdmin(userId);
  if (!isAiEffort(effort)) throw new Error(`"${effort}" is not an effort level`);
  const { error } = await db()
    .from("portal_app_config")
    .upsert(
      { key: "ai.effort", value: effort, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw new Error(`Could not save the effort: ${error.message}`);
  const { resetConfigCache } = await import("./server/app-config");
  resetConfigCache();
  await audit({
    actor_type: "user",
    actor_id: profile.id,
    action: "ai.effort_changed",
    entity_type: "config",
    entity_key: "ai.effort",
    payload: { effort },
  });
  return { effort };
}

export async function setAiAutoRead(userId: string, on: boolean): Promise<{ enabled: boolean }> {
  const profile = await requireManager(userId);
  const { setV2Flag } = await import("./app-config.server");
  const flags = await setV2Flag("ai_auto_read", on);
  await audit({
    actor_type: "user",
    actor_id: profile.id,
    action: "integration.flag_changed",
    entity_type: "config",
    payload: { flag: "ai_auto_read", enabled: on },
  });
  return { enabled: flags.ai_auto_read };
}
