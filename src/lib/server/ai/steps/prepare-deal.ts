import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { readIntake, type IntakeAnswers } from "../../../intake-answers";
import { mergeIntake } from "../../intake-merge";
import type { AiJobRow, StepContext, StepFn, StepOutcome } from "../jobs";

/**
 * The `prepare_deal` job, one step per invocation:
 *
 *   sources  — snapshot what is on the record and hash it; nothing new since
 *              the last reading → straight to finalize.
 *   sow      — the SOW (or the contract) read once per document, persisted,
 *              its services onto the plan and its facts onto the record.
 *   brief    — the brief from the calls, the reviewed notes or the summary,
 *              then the intake prefill, the help picks, the header.
 *   finalize — the customer's link, the record's reading status, the audit
 *              row, and one message to the TIS.
 *
 * Each step reloads what it needs: they run in separate invocations, and a
 * retry must not depend on memory. Every write is a merge, so a person
 * typing meanwhile loses nothing.
 */

export const PREPARE_DEAL_STEPS = ["sources", "sow", "brief", "finalize"] as const;
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
  const { sowPlanProposalSchema, normalizeProposal } = await import("../../../sow-plan");
  type Proposal = import("../../../sow-plan").SowPlanProposal;

  // The same bytes are never sent twice: the reading is kept by the
  // document's hash and served from the table the second time.
  let proposal: Proposal | null = null;
  let usage: StepOutcome["usage"];
  let reused = false;
  const { data: kept } = await db()
    .from("portal_ai_readings")
    .select("output")
    .eq("deal_id", dealId)
    .eq("kind", "sow")
    .eq("source_hash", doc.sha256)
    .limit(1)
    .maybeSingle();
  if (kept?.output) {
    const parsed = sowPlanProposalSchema.safeParse(kept.output);
    if (parsed.success) {
      proposal = normalizeProposal(parsed.data);
      reused = true;
    }
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
      read = await readSowDocument(dealId, doc, { jobId: job.id });
    } catch (e) {
      const detail = errText(e);
      return branch({ status: "failed", detail }, { problems: [detail] });
    }
    proposal = read.proposal;
    usage = read.usage;
    const { error } = await db()
      .from("portal_ai_readings")
      .insert({
        deal_id: dealId,
        kind: "sow",
        source_path:
          doc === docs.sow
            ? (account.sow_document_path ?? null)
            : (readIntake(account.intake).contract?.path ?? null),
        source_name: doc.name,
        source_hash: doc.sha256,
        model: read.model,
        output: proposal,
        usage: read.usage,
      });
    // 23505: a parallel reading of the same bytes already kept it.
    if (error && error.code !== "23505") {
      console.error("[prepare-deal] could not keep the SOW reading", error.message);
    }
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
  // rows stand) and the SOW's own facts onto the record (blanks only).
  const filled: string[] = [];
  const { data: fresh } = await db()
    .from("portal_accounts")
    .select("intake")
    .eq("id", dealId)
    .maybeSingle();
  const { sowTimelinePatch } = await import("../../../sow-plan");
  const { timeline, accepted } = sowTimelinePatch(
    readIntake(fresh?.intake),
    proposal,
    (row) => `${row.kind.slice(0, 4)}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await mergeIntake(dealId, {}, timeline);
  if (accepted) filled.push(`${accepted} service${accepted === 1 ? "" : "s"} from the SOW`);
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

export const brief: StepFn = async (job) => {
  const dealId = dealIdOf(job);
  await touchReading(job, "brief");
  const branch = (b: Branch, extra: StepOutcome = {}): StepOutcome => ({
    ...extra,
    result: { ...(extra.result ?? {}), branches: { brief: b } },
  });

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
    return branch({
      status: "skipped",
      detail: "No call notes, reviewed notes or summary to read.",
    });
  }

  // A retry of this step after its advance write failed must not write a
  // second brief: one this job already finished is taken as it stands.
  const { data: earlier } = await db()
    .from("portal_briefs")
    .select("id")
    .eq("account_id", dealId)
    .eq("status", "complete")
    .eq("generator", "llm")
    .is("created_by", null)
    .gte("created_at", job.started_at ?? job.created_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (earlier?.id) {
    return branch(
      { status: "ok", detail: `Read ${have.what.join(", ")} (kept from an earlier attempt)` },
      { result: { brief_id: earlier.id } },
    );
  }

  const { generateDealBriefAs } = await import("../../../presale.server");
  let result: Awaited<ReturnType<typeof generateDealBriefAs>>;
  try {
    result = await generateDealBriefAs({ kind: "system", label: "the AI reading" }, dealId);
  } catch (e) {
    const detail = `The brief did not finish: ${errText(e)}`;
    return branch({ status: "failed", detail }, { problems: [detail] });
  }
  if (result.generator !== "llm") {
    const detail =
      result.error ??
      "The AI reading did not run — AI is not configured here (an admin can check Admin → Integrations); nothing was filled.";
    return branch({ status: "failed", detail }, { problems: [detail] });
  }
  // The brief's own calls are recorded by the client as `ai.call` rows; the
  // step reports what it filled.
  return branch(
    {
      status: "ok",
      detail: `Read ${have.what.join(", ")}${result.error ? ` · ${result.error}` : ""}`,
    },
    { filled: result.filled, result: { brief_id: result.id } },
  );
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

/** "The AI read <what> for <deal>: N services, M fields filled — review them on the deal." */
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
  const fields = input.filled.filter((f) => !/service.* from the SOW$/.test(f)).length;
  return `The AI read ${what} for ${input.dealName}: ${input.services} service${input.services === 1 ? "" : "s"}, ${fields} field${fields === 1 ? "" : "s"} filled — review them on the deal.`;
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
  brief,
  finalize,
};
