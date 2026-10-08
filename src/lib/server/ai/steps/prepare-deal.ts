import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { readIntake, type IntakeAnswers } from "../../../intake-answers";
import { HANDOFF_QUESTIONS } from "../../../sales-handoff";
import { mergeIntake } from "../../intake-merge";
import type { AiJobRow, StepContext, StepFn, StepOutcome } from "../jobs";

/**
 * The `prepare_deal` job, one step per invocation:
 *
 *   sources    — snapshot what is on the record and hash it; nothing new
 *                since the last reading → straight to finalize.
 *   sow        — the SOW and the contract read once per document, kept, the
 *                services onto the plan, the facts, seats and forms onto the
 *                record.
 *   brief_core — who they are, how they work, what they want, from the
 *                calls, the reviewed notes or the summary, with the kept SOW
 *                reading beside them; the brief row starts here.
 *   brief_plan — the deck, the expansion, the intake and the welcome page,
 *                against the core.
 *   verify     — the whole brief checked against the sources; the row is
 *                complete from here.
 *   apply      — the brief onto the deal: the deck, the journey, the intake
 *                and handoff prefill, the help picks, the header.
 *   finalize   — the customer's link, the record's reading status, the audit
 *                row, and one message to the TIS.
 *
 * Each step reloads what it needs: they run in separate invocations, and a
 * retry must not depend on memory. Every write is a merge, so a person
 * typing meanwhile loses nothing. The three brief passes send one cached
 * prefix, so the sources are paid for once.
 */

export const PREPARE_DEAL_STEPS = [
  "sources",
  "sow",
  "brief_core",
  "brief_plan",
  "verify",
  "apply",
  "finalize",
] as const;
export type PrepareDealStep = (typeof PREPARE_DEAL_STEPS)[number];

type Branch = { status: "ok" | "failed" | "skipped"; detail: string | null };

const db = () => supabaseAdmin as any;

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function dealIdOf(job: AiJobRow): string {
  if (!job.deal_id) throw new Error("A prepare_deal job needs a deal");
  return job.deal_id;
}

/**
 * The record's reading status, kept current from every step: the step in
 * words for the screen, and a heartbeat so a stalled job reads as stalled.
 */
async function touchReading(
  job: AiJobRow,
  step: PrepareDealStep,
  patch: Partial<NonNullable<IntakeAnswers["ai_reading"]>> = {},
): Promise<NonNullable<IntakeAnswers["ai_reading"]>> {
  const dealId = dealIdOf(job);
  const { data } = await db()
    .from("portal_accounts")
    .select("intake")
    .eq("id", dealId)
    .maybeSingle();
  const current = readIntake(data?.intake).ai_reading;
  const now = new Date().toISOString();
  const sameJob = current?.job_id === job.id;
  const next: NonNullable<IntakeAnswers["ai_reading"]> = {
    status: "running",
    started_at: job.started_at ?? now,
    finished_at: null,
    filled: sameJob ? current!.filled : [],
    error: null,
    again: false,
    job_id: job.id,
    step,
    heartbeat_at: now,
    branches: sameJob ? current!.branches : {},
    ...patch,
  };
  await mergeIntake(dealId, { ai_reading: next });
  return next;
}

/* ------------------------------------------------------------- sources */

export const sources: StepFn = async (job) => {
  const dealId = dealIdOf(job);
  const { loadDealSources } = await import("../sources");
  const { lastFinishedJobForDeal } = await import("../jobs");
  const s = await loadDealSources(dealId);
  const what = {
    reports: s.reports.length,
    notes: s.notes.length,
    sow: s.sow ? (s.sow.problem ?? "ok") : null,
    contract: s.contract ? (s.contract.problem ?? "ok") : null,
    summary: Boolean(s.account.summary),
  };
  if (!job.force) {
    // Only a reading that ran to the end counts as "already read": after a
    // failed one the same sources are read again, so a retrigger retries.
    const last = await lastFinishedJobForDeal(dealId);
    if (last && last.status === "done" && last.source_hash === s.sourceHash) {
      // Nothing arrived since that reading: the record keeps saying what it
      // filled, and finalize only puts today's date on it.
      const before = s.intake.ai_reading;
      await touchReading(job, "sources", {
        filled: before?.filled ?? [],
        branches: before?.branches ?? {},
      });
      return {
        sourceHash: s.sourceHash,
        skipTo: "finalize",
        result: {
          nothing_new: true,
          sources: what,
          last_job_id: last.id,
          previous_error: before?.error ?? null,
        },
      };
    }
  }
  await touchReading(job, "sources", { filled: [], branches: {} });
  return { sourceHash: s.sourceHash, result: { nothing_new: false, sources: what } };
};

/* ----------------------------------------------------------------- sow */

export const sow: StepFn = async (job) => {
  const dealId = dealIdOf(job);
  await touchReading(job, "sow");
  const branch = (b: Branch, extra: StepOutcome = {}): StepOutcome => ({
    ...extra,
    result: { ...(extra.result ?? {}), branches: { sow: b } },
  });

  const { data: account } = await db()
    .from("portal_accounts")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();
  if (!account) throw new Error("Deal not found");
  const { loadDealDocuments } = await import("../sources");
  const docs = await loadDealDocuments(account);
  // The SOW first; a contract alone (a seats-only deal) still says what was bought.
  const doc = docs.sow?.block ? docs.sow : docs.contract?.block ? docs.contract : null;
  if (!doc) {
    const problem = docs.sow?.problem ?? docs.contract?.problem ?? null;
    if (problem) {
      return branch(
        { status: "failed", detail: problem },
        { problems: [`The SOW could not be read: ${problem}`] },
      );
    }
    return branch({ status: "skipped", detail: "No SOW or contract on the deal." });
  }

  const { aiConfigured } = await import("../config");
  const { loadSowReading, keepSowReading, sourcePathFor } = await import("../readings");
  type Reading = import("../../../sow-plan").SowReading;

  // The same bytes are never sent twice: the reading is kept by the
  // document's hash and served from the table the second time. A forced
  // job is a person asking for a fresh reading of what is on file — a
  // reading that came out wrong, or said the document was not a SOW —
  // and that one replaces the kept row.
  let proposal: Reading | null = null;
  let usage: StepOutcome["usage"];
  let reused = false;
  const kept = job.force ? null : await loadSowReading(dealId, { sha256: doc.sha256 });
  if (kept && kept.source_hash === doc.sha256) {
    proposal = kept.reading;
    reused = true;
  }
  if (!proposal) {
    if (!aiConfigured()) {
      const detail =
        "AI is not configured here (an admin can check Admin → Integrations); the SOW was not read.";
      return branch({ status: "failed", detail }, { problems: [detail] });
    }
    const { readSowDocument } = await import("../../../sow-plan.server");
    let read: Awaited<ReturnType<typeof readSowDocument>>;
    try {
      // The contract beside the SOW: on a small deal it is where the seats
      // and the term live.
      read = await readSowDocument(dealId, doc, {
        jobId: job.id,
        contract: doc === docs.sow ? docs.contract : null,
      });
    } catch (e) {
      const detail = errText(e);
      return branch({ status: "failed", detail }, { problems: [detail] });
    }
    proposal = read.proposal;
    usage = read.usage;
    await keepSowReading({
      dealId,
      doc,
      sourcePath: sourcePathFor(account, doc, docs),
      reading: proposal,
      model: read.model,
      usage: read.usage,
    });
  }

  if (!proposal.readable) {
    const detail =
      proposal.problem ??
      "The attached document could not be read as a Statement of Work — set the plan by hand.";
    return branch(
      { status: "failed", detail },
      { ...(usage ? { usage } : {}), problems: [detail] },
    );
  }

  // Exactly what the reading applies: the services onto the plan (a person's
  // rows stand), the SOW's own facts onto the record (blanks only), and the
  // seats and the forms onto the intake (blanks and the AI's own answers).
  const filled: string[] = [];
  const [{ data: fresh }, { data: reports }] = await Promise.all([
    db().from("portal_accounts").select("intake").eq("id", dealId).maybeSingle(),
    db().from("portal_gong_reports").select("id").eq("account_id", dealId).limit(1),
  ]);
  const { sowTimelinePatch, sowIntakePatch } = await import("../../../sow-plan");
  const current = readIntake(fresh?.intake);
  const { timeline, accepted } = sowTimelinePatch(
    current,
    proposal,
    (row) => `${row.kind.slice(0, 4)}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const intakePatch = sowIntakePatch(current, proposal, {
    hasReports: (reports ?? []).length > 0,
  });
  await mergeIntake(dealId, intakePatch.patch as Record<string, unknown>, timeline);
  if (accepted) filled.push(`${accepted} service${accepted === 1 ? "" : "s"} from the SOW`);
  filled.push(...intakePatch.filled.map((s) => `${s} (from the SOW)`));
  const { stampSowFacts } = await import("../../../sow-plan.server");
  const stamped = await stampSowFacts(dealId, proposal);
  filled.push(...stamped.map((s) => `the SOW ${s}`));

  return branch(
    {
      status: "ok",
      detail: `${doc.name}: ${proposal.services.length} service${proposal.services.length === 1 ? "" : "s"} read${reused ? " (kept from an earlier reading)" : ""}, ${accepted} added to the plan`,
    },
    {
      ...(usage ? { usage } : {}),
      filled,
      result: { services_added: accepted, sow_reused: reused },
    },
  );
};

/* --------------------------------------------------------------- brief */

/** What the brief can read from: calls, reviewed notes, or the record's summary. */
export function briefSourcesFor(input: {
  reports: number;
  notes: number;
  summary: string | null | undefined;
}): { any: boolean; what: string[] } {
  const what: string[] = [];
  if (input.reports > 0) what.push(`${input.reports} call note${input.reports === 1 ? "" : "s"}`);
  if (input.notes > 0) what.push(`${input.notes} reviewed note${input.notes === 1 ? "" : "s"}`);
  if (input.summary?.trim()) what.push("the deal's summary");
  return { any: what.length > 0, what };
}

/** Every brief step reports under one branch: the record says "the calls" were read, however many passes it took. */
const briefBranch = (b: Branch, extra: StepOutcome = {}): StepOutcome => ({
  ...extra,
  result: { ...(extra.result ?? {}), branches: { brief: b } },
});

/**
 * A pass that failed ends the brief: the row says why, the branch says
 * why, and the job goes to finalize — the later passes have nothing to
 * build on. Not a retry: the client already retried the call itself.
 */
async function briefFailed(briefId: string | null, detail: string): Promise<StepOutcome> {
  if (briefId) {
    await db().from("portal_briefs").update({ status: "failed", error: detail }).eq("id", briefId);
  }
  return briefBranch({ status: "failed", detail }, { problems: [detail], skipTo: "finalize" });
}

type BriefRow = {
  id: string;
  status: string;
  generator: string | null;
  structured_json: Record<string, unknown> | null;
  pptx_storage_path: string | null;
  error: string | null;
};

/**
 * The brief row this job is writing: named by the job's result, or — a
 * retry after the advance write failed — the row this job inserted and
 * lost the id of. Never a person's brief, and never one from before this
 * job started.
 */
async function briefRowForJob(job: AiJobRow): Promise<BriefRow | null> {
  const id = typeof job.result?.["brief_id"] === "string" ? job.result["brief_id"] : null;
  if (id) {
    const { data } = await db().from("portal_briefs").select("*").eq("id", id).maybeSingle();
    if (data) return data as BriefRow;
  }
  const { data } = await db()
    .from("portal_briefs")
    .select("*")
    .eq("account_id", dealIdOf(job))
    .is("created_by", null)
    .gte("created_at", job.started_at ?? job.created_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as BriefRow | null) ?? null;
}

/** The sources and the cached prefix, loaded for a pass. */
async function briefContextFor(job: AiJobRow) {
  const { buildBriefContext } = await import("../../brief/pipeline");
  return buildBriefContext(dealIdOf(job), { jobId: job.id });
}

/* ---------------------------------------------------------- brief_core */

export const brief_core: StepFn = async (job) => {
  const dealId = dealIdOf(job);
  await touchReading(job, "brief_core");

  const [{ data: account }, { data: reports }, { data: notes }] = await Promise.all([
    db().from("portal_accounts").select("id,summary").eq("id", dealId).maybeSingle(),
    db().from("portal_gong_reports").select("id").eq("account_id", dealId),
    db()
      .from("portal_onboarding_notes")
      .select("id")
      .eq("account_id", dealId)
      .eq("review_status", "reviewed"),
  ]);
  if (!account) throw new Error("Deal not found");
  const have = briefSourcesFor({
    reports: (reports ?? []).length,
    notes: (notes ?? []).length,
    summary: account.summary,
  });
  if (!have.any) {
    return briefBranch(
      { status: "skipped", detail: "No call notes, reviewed notes or summary to read." },
      { skipTo: "finalize" },
    );
  }

  // A retry of this step after its advance write failed must not spend
  // the pass again: the core this job already wrote is taken as it stands.
  const earlier = await briefRowForJob(job);
  if (earlier?.structured_json?.["account_name"]) {
    return briefBranch(
      { status: "ok", detail: `Read ${have.what.join(", ")} (core kept from an earlier attempt)` },
      { result: { brief_id: earlier.id, brief_sources: have.what } },
    );
  }

  const { aiConfigured } = await import("../config");
  if (!aiConfigured()) {
    const detail =
      "The AI reading did not run — AI is not configured here (an admin can check Admin → Integrations); nothing was filled.";
    return briefBranch({ status: "failed", detail }, { problems: [detail], skipTo: "finalize" });
  }

  let briefId = earlier?.id ?? null;
  if (!briefId) {
    const { data: row, error } = await db()
      .from("portal_briefs")
      .insert({
        account_id: dealId,
        status: "generating",
        created_by: null,
        source_report_ids: (reports ?? []).map((r: { id: string }) => r.id),
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(`Could not start the brief: ${error?.message ?? "no row"}`);
    briefId = row.id as string;
  }

  try {
    const { runBriefCore } = await import("../../brief/pipeline");
    const ctx = await briefContextFor(job);
    const { core, usage } = await runBriefCore(ctx);
    await db()
      .from("portal_briefs")
      .update({ status: "generating", structured_json: core, error: null })
      .eq("id", briefId);
    return briefBranch(
      { status: "ok", detail: `Read ${have.what.join(", ")}` },
      { usage, result: { brief_id: briefId, brief_sources: have.what } },
    );
  } catch (e) {
    const { describeAiError } = await import("../client");
    return briefFailed(briefId, `The brief did not finish: ${describeAiError(e, "The brief")}`);
  }
};

/* ---------------------------------------------------------- brief_plan */

export const brief_plan: StepFn = async (job) => {
  await touchReading(job, "brief_plan");
  const row = await briefRowForJob(job);
  const { briefCoreSchema } = await import("../../schemas");
  const core = row ? briefCoreSchema.safeParse(row.structured_json) : null;
  if (!row || !core?.success) {
    return briefFailed(
      row?.id ?? null,
      "The brief's core was not kept; the plan could not be written.",
    );
  }
  if (row.structured_json?.["kickoff"]) {
    return briefBranch(
      { status: "ok", detail: "Plan kept from an earlier attempt" },
      { result: { brief_id: row.id } },
    );
  }
  try {
    const { runBriefPlan } = await import("../../brief/pipeline");
    const { assembleBrief } = await import("../../schemas");
    const ctx = await briefContextFor(job);
    const { plan, usage } = await runBriefPlan(ctx, core.data);
    await db()
      .from("portal_briefs")
      .update({ structured_json: assembleBrief(core.data, plan) })
      .eq("id", row.id);
    return briefBranch(
      { status: "ok", detail: "Plan written" },
      { usage, result: { brief_id: row.id } },
    );
  } catch (e) {
    const { describeAiError } = await import("../client");
    return briefFailed(
      row.id,
      `The brief did not finish: ${describeAiError(e, "The brief's plan")}`,
    );
  }
};

/* -------------------------------------------------------------- verify */

export const verify: StepFn = async (job, ctx) => {
  await touchReading(job, "verify");
  const row = await briefRowForJob(job);
  const { briefJsonSchema } = await import("../../schemas");
  const brief = row ? briefJsonSchema.safeParse(row.structured_json) : null;
  if (!row || !brief?.success) {
    return briefFailed(row?.id ?? null, "The brief was not kept whole; it could not be checked.");
  }
  if (row.status === "complete") {
    return briefBranch(
      { status: "ok", detail: "Checked (kept from an earlier attempt)" },
      { result: { brief_id: row.id } },
    );
  }
  // The verifier never throws: a check that could not run leaves the brief
  // grounded by code and every item marked to check.
  const { runBriefVerify } = await import("../../brief/pipeline");
  const context = await briefContextFor(job);
  const { brief: verified, usage } = await runBriefVerify(context, brief.data, ctx.now);
  const sowProblem = context.sources.sow?.problem
    ? `The SOW was not read: ${context.sources.sow.problem}`
    : null;
  const { error } = await db()
    .from("portal_briefs")
    .update({
      status: "complete",
      generator: "llm",
      structured_json: verified,
      error: sowProblem,
    })
    .eq("id", row.id);
  if (error) throw new Error(`Could not complete the brief: ${error.message}`);
  const fields = Object.values(verified.verification?.fields ?? {});
  const unverified = fields.filter((s) => s !== "grounded").length;
  return briefBranch(
    {
      status: "ok",
      detail: `Checked ${fields.length} item${fields.length === 1 ? "" : "s"}${unverified ? `, ${unverified} to confirm` : ""}${usage ? "" : " (the checker did not run)"}`,
    },
    { ...(usage ? { usage } : {}), result: { brief_id: row.id, verified: fields.length } },
  );
};

/* --------------------------------------------------------------- apply */

/**
 * The finished brief onto the deal, exactly as a person's "Generate brief"
 * does it: the deck, the journey move, the intake and handoff prefill, the
 * help picks, the header.
 */
export const apply: StepFn = async (job) => {
  const dealId = dealIdOf(job);
  await touchReading(job, "apply");
  const row = await briefRowForJob(job);
  if (!row || row.status !== "complete") {
    return briefBranch(
      { status: "skipped", detail: "No finished brief to apply." },
      { result: { brief_id: row?.id ?? null } },
    );
  }
  const { applyBriefToDeal } = await import("../../../presale.server");
  const sources = Array.isArray(job.result?.["brief_sources"])
    ? (job.result["brief_sources"] as string[])
    : [];
  try {
    const filled = await applyBriefToDeal({ kind: "system", label: "the AI reading" }, dealId, {
      id: row.id,
      status: row.status as "complete",
      generator: (row.generator as "llm" | "template" | null) ?? null,
      structured_json: row.structured_json,
      pptx_storage_path: row.pptx_storage_path,
    });
    return briefBranch(
      {
        status: "ok",
        detail: `Read ${sources.length ? sources.join(", ") : "the calls"}${row.error ? ` · ${row.error}` : ""}`,
      },
      { filled, result: { brief_id: row.id } },
    );
  } catch (e) {
    const detail = `The brief was written but not applied: ${errText(e)}`;
    return briefBranch({ status: "failed", detail }, { problems: [detail] });
  }
};

/* ------------------------------------------------------------ finalize */

/** The step's status, from what the branches did: a failure with nothing filled is a failed reading. */
export function finalStatus(input: {
  filled: string[];
  problems: string[];
  branches: Record<string, Branch>;
}): "done" | "failed" {
  const anyFailed =
    input.problems.length > 0 || Object.values(input.branches).some((b) => b.status === "failed");
  return anyFailed && input.filled.length === 0 ? "failed" : "done";
}

export const finalize: StepFn = async (job, ctx: StepContext) => {
  const dealId = dealIdOf(job);
  const r = job.result ?? {};
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
  const filled = list(r["filled"]);
  const problems = list(r["problems"]);
  const branches = ((r["branches"] as Record<string, Branch> | undefined) ?? {}) as Record<
    string,
    Branch
  >;
  const nothingNew = r["nothing_new"] === true;

  const { data: account } = await db()
    .from("portal_accounts")
    .select("id,name,display_name,customer_id,welcome_share_url,intake")
    .eq("id", dealId)
    .maybeSingle();
  if (!account) throw new Error("Deal not found");

  // The customer's page exists from here: the deck and the link in the AE
  // reply both point at it.
  if (!account.welcome_share_url) {
    try {
      const { issueWelcomeLinkAs } = await import("../../../welcome.server");
      await issueWelcomeLinkAs(null, dealId);
    } catch (e) {
      problems.push(`The customer's link was not made: ${errText(e)}`);
    }
  }

  const now = ctx.now().toISOString();
  // Nothing arrived since the last reading: the sources step carried that
  // reading's list onto this job's record, and today's date goes on it.
  const carried = nothingNew ? readIntake(account.intake).ai_reading : null;
  const status = carried ? "done" : finalStatus({ filled, problems, branches });
  await mergeIntake(dealId, {
    ai_reading: {
      status,
      started_at: job.started_at ?? now,
      finished_at: now,
      filled: (carried ? carried.filled : filled).slice(0, 30),
      error: carried
        ? ((r["previous_error"] as string | null | undefined) ?? null)
        : problems.length
          ? problems.join(" ").slice(0, 500)
          : null,
      again: false,
      job_id: job.id,
      step: "finalize",
      heartbeat_at: now,
      branches: carried ? carried.branches : branches,
    },
  });

  const { audit } = await import("../../audit");
  await audit({
    actor_type: "system",
    actor_id: null,
    action: "ai.prepare_deal",
    entity_type: "account",
    entity_id: dealId,
    payload: {
      job_id: job.id,
      trigger: job.trigger,
      status,
      nothing_new: nothingNew,
      filled,
      problems,
      branches,
      usage: job.usage ?? {},
    },
  });

  // One message to the TIS, when there is something to review — and one
  // only: the job is marked before the send, so a retry of this step after
  // a failed advance write does not write to them twice.
  let notified = r["notified"] === true;
  if (!notified && !nothingNew && filled.length > 0) {
    try {
      await db()
        .from("portal_ai_jobs")
        .update({ result: { ...r, notified: true } })
        .eq("id", job.id);
      notified = await notifyAssignee(job, {
        dealName: (account.display_name as string | null) || String(account.name),
        customerId: (account.customer_id as string | null) ?? null,
        services: Number(r["services_added"] ?? 0),
        filled,
        branches,
      });
    } catch (e) {
      console.error("[prepare-deal] could not tell the TIS", e);
    }
  }

  return { result: { status, notified } };
};

/**
 * "The AI read <what> for <deal>: N services, M fields filled, K handoff
 * answers, the workflow story, J focus items — review them on the deal."
 * Counted from the filled list's own words: a handoff answer is named by
 * its question, the story and the focus by the prefill's labels.
 */
export function readingSummaryLine(input: {
  dealName: string;
  services: number;
  filled: string[];
  branches: Record<string, Branch>;
}): string {
  const read: string[] = [];
  if (input.branches["sow"]?.status === "ok") read.push("the SOW");
  if (input.branches["brief"]?.status === "ok") read.push("the calls");
  const what = read.length ? read.join(" and ") : "the deal";
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const labels = new Set(HANDOFF_QUESTIONS.map((q) => q.label));
  const items = input.filled.filter((f) => !/service.* from the SOW$/.test(f));
  const answers = items.filter((f) => labels.has(f)).length;
  const story = items.includes("the workflow story");
  const focus = Number(items.map((f) => /^(\d+) focus items?$/.exec(f)?.[1]).find(Boolean) ?? 0);
  const fields = items.length - answers - (story ? 1 : 0) - (focus ? 1 : 0);
  const parts = [
    n(input.services, "service"),
    fields || !(answers || story || focus) ? `${n(fields, "field")} filled` : null,
    answers ? n(answers, "handoff answer") : null,
    story ? "the workflow story" : null,
    focus ? n(focus, "focus item") : null,
  ].filter(Boolean);
  return `The AI read ${what} for ${input.dealName}: ${parts.join(", ")} — review them on the deal.`;
}

async function notifyAssignee(
  job: AiJobRow,
  input: {
    dealName: string;
    customerId: string | null;
    services: number;
    filled: string[];
    branches: Record<string, Branch>;
  },
): Promise<boolean> {
  const dealId = dealIdOf(job);
  const { dealAssignment } = await import("../../../assignment.server");
  const owner = (await dealAssignment(dealId)).owner;
  if (!owner?.email) return false;
  const { sendEmail } = await import("../../email");
  const { appUrl } = await import("../../../app-url");
  const line = readingSummaryLine(input);
  const link = input.customerId
    ? `${appUrl()}/customers/${input.customerId}`
    : `${appUrl()}/deals/${dealId}`;
  const esc = (s: string) =>
    s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  await sendEmail({
    // The TIS asked for the reading by owning the deal: it is theirs to act on.
    kind: "requested",
    to: owner.email,
    subject: `AI read: ${input.dealName}`,
    html: `<div style="font-family:sans-serif;max-width:560px;color:#0a1628"><p>${esc(line)}</p><ul style="line-height:1.6">${input.filled
      .slice(0, 12)
      .map((f) => `<li>${esc(f)}</li>`)
      .join(
        "",
      )}</ul><p><a href="${link}" style="color:#039de7">Open the deal</a></p><p style="font-size:12px;color:#888">GoCanvas Handoff Hub · one message per reading</p></div>`,
  });
  return true;
}

export const prepareDealSteps: Record<PrepareDealStep, StepFn> = {
  sources,
  sow,
  brief_core,
  brief_plan,
  verify,
  apply,
  finalize,
};
