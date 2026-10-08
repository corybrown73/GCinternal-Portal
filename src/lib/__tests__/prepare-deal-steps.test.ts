import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The prepare_deal steps against an in-memory database: the source hash and
 * the short-circuit, a SOW reading served from the table instead of the
 * model, the three brief passes over one cached prefix, the apply step
 * called once, and the final record.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    brief: { generateDealBriefAs: vi.fn(), applyBriefToDeal: vi.fn() },
    sow: { readSowDocument: vi.fn(), stampSowFacts: vi.fn(async () => ["reference"]) },
    ai: {
      runStructured: vi.fn(),
      describeAiError: (e: unknown, what = "AI synthesis") =>
        `${what} failed: ${e instanceof Error ? e.message : String(e)}`,
      AiParseError: class extends Error {},
      AiRefusedError: class extends Error {},
      AiTruncatedError: class extends Error {},
    },
    assignment: {
      dealAssignment: vi.fn(async () => ({
        owner: { teamMemberId: "tm-1", name: "Priya Nair", email: "priya@gocanvas.com" },
      })),
    },
    email: { sendEmail: vi.fn(async () => ({ delivered: true, reason: null })) },
    welcome: { issueWelcomeLinkAs: vi.fn(async () => ({ url: "https://x/w/t", issuedAt: "" })) },
    audit: { audit: vi.fn(async () => {}) },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../presale.server", () => h.brief);
vi.mock("../sow-plan.server", () => h.sow);
vi.mock("../server/ai/client", () => h.ai);
vi.mock("../assignment.server", () => h.assignment);
vi.mock("../server/email", () => h.email);
vi.mock("../welcome.server", () => h.welcome);
vi.mock("../server/audit", () => h.audit);

import {
  apply,
  brief_core,
  brief_plan,
  briefSourcesFor,
  finalize,
  finalStatus,
  PREPARE_DEAL_STEPS,
  readingSummaryLine,
  sources,
  sow,
  verify,
} from "../server/ai/steps/prepare-deal";
import { sourceHashOf } from "../server/ai/sources";
import { sha256Hex } from "../server/ai/documents";
import { sowPlanProposalSchema, sowReadingSchema } from "../sow-plan";
import { summaryAsReport } from "../server/brief/prompt";
import type { AiJobRow } from "../server/ai/jobs";

const DEAL = "22222222-2222-4222-8222-222222222222";
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const CONTRACT = new TextEncoder().encode("%PDF-1.7\n% the signed contract: 40 seats\n%%EOF\n");
const SOW_PATH = `deals/${DEAL}/sow.pdf`;
const CONTRACT_PATH = `deals/${DEAL}/contract/contract.pdf`;
const CONTRACT_ON_FILE = { path: CONTRACT_PATH, name: "contract.pdf", uploaded_at: "2026-10-01" };

const job = (over: Partial<AiJobRow> = {}): AiJobRow =>
  ({
    id: "job-1",
    kind: "prepare_deal",
    deal_id: DEAL,
    implementation_id: null,
    subject_id: null,
    status: "running",
    step: null,
    steps_done: [],
    trigger: "manual",
    requested_by: null,
    force: false,
    rerun_requested: false,
    source_hash: null,
    attempts: 0,
    max_attempts: 4,
    next_attempt_at: "",
    locked_at: null,
    lock_token: "lock",
    result: {},
    usage: {},
    last_error: null,
    created_at: "2026-10-08T10:00:00Z",
    updated_at: "2026-10-08T10:00:00Z",
    started_at: "2026-10-08T10:00:00Z",
    finished_at: null,
    ...over,
  }) as AiJobRow;

const ctx = { now: () => new Date("2026-10-08T10:05:00Z") };

const baseRows: Rows = {
  portal_accounts: [
    {
      id: DEAL,
      name: "Summit Roofing",
      display_name: null,
      summary: null,
      stage: "closed_won",
      domain: null,
      arr: null,
      products: [],
      sow_document_path: SOW_PATH,
      sow_document_name: "summit-sow.pdf",
      welcome_share_url: null,
      customer_id: null,
      am_owner_id: null,
      se_owner_id: null,
      intake: { wanted_forms: [], timeline: {} },
    },
  ],
  portal_gong_reports: [
    {
      id: "r1",
      account_id: DEAL,
      title: "Discovery",
      report_type: "call_notes",
      content_md: "Every crew fills a paper daily report. Dana runs the office.",
      created_at: "2026-10-01T00:00:00Z",
    },
  ],
  portal_onboarding_notes: [],
  portal_ai_jobs: [],
  portal_ai_readings: [],
  portal_briefs: [],
};

const usage = {
  input_tokens: 900,
  output_tokens: 300,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

const core = {
  account_name: "Summit Roofing",
  one_liner: "Summit runs crews on paper and bought GoCanvas to stop.",
  account: { industry: "Roofing", company_size: null, field_users: 40, website: null },
  current_process: [{ title: "Daily", bullets: ["Paper daily report"] }],
  goals: ["Same-day reports"],
  what_we_know: [],
  stakeholders: [
    {
      name: "Dana",
      role: "Office manager",
      notes: "Runs the office",
      role_kind: "admin_builder",
      email: null,
    },
  ],
  risks_open_items: [],
  dates: [],
  discovery_questions: [],
  process_gaps: [],
};

const plan = {
  kickoff: {
    day_90_definition: null,
    scope: [{ workflow: "Daily report", replaces: "Paper daily report", teams: null }],
    out_of_scope: null,
    integrations: [],
    roles: [],
    licensed_seats: "40 seats",
    renewal_date: null,
    it_contact: null,
    training: [],
    kpi_qualifiers: [],
    next_meeting: null,
  },
  expansion: {
    integration_target: null,
    form_already_built: null,
    historical_data: null,
    current_process: null,
    time_saved: null,
    data_flows: [],
    environment_notes: [],
    blockers: [],
  },
  onboarding: {
    flow: "new_logo",
    flow_evidence: { quote: "Every crew fills a paper daily report", source: "Discovery" },
    training_only: false,
    solutions_involved: null,
    forms: [
      { name: "Daily report", quote: "Every crew fills a paper daily report", source: "Discovery" },
    ],
    current_process: null,
  },
  welcome: {
    field_tester: null,
    customer_side: { forms_today: null, data_lists: null, devices: null, kickoff_attendees: null },
    workflow_story: { before: null, during: null, after: null },
    focus_items: [],
  },
};

const verified = {
  onboarding: plan.onboarding,
  kickoff: {
    scope: [
      {
        ...plan.kickoff.scope[0],
        quote: "Every crew fills a paper daily report",
        source: "calls",
        page: null,
      },
    ],
    licensed_seats: { value: "40 seats", quote: "forty seats", source: "calls", page: null },
    renewal_date: null,
    roles: [],
    it_contact: null,
  },
  stakeholders: [
    { ...core.stakeholders[0], quote: "Dana runs the office", source: "calls", page: null },
  ],
  goals: [{ text: "Same-day reports", quote: "same day", source: "calls", page: null }],
  dates: [],
};

let fake: ReturnType<typeof createFakeSupabase>;
const account = () => fake.store["portal_accounts"]![0]!;

beforeEach(() => {
  fake = createFakeSupabase(baseRows, {
    objects: {
      [`attachments/${SOW_PATH}`]: PDF,
      [`attachments/${CONTRACT_PATH}`]: CONTRACT,
    },
  });
  h.supabase.client = fake.client;
  h.brief.generateDealBriefAs.mockReset();
  h.brief.applyBriefToDeal.mockReset();
  h.sow.readSowDocument.mockReset();
  h.ai.runStructured.mockReset();
  h.ai.runStructured.mockImplementation(async (args: { kind: string }) => {
    const data = args.kind === "brief_core" ? core : args.kind === "brief_plan" ? plan : verified;
    return { data, usage, model: "claude-opus-5-5", stop_reason: "end_turn", attempts: 1, ms: 1 };
  });
  h.email.sendEmail.mockClear();
  h.welcome.issueWelcomeLinkAs.mockClear();
  h.audit.audit.mockClear();
  process.env["ANTHROPIC_API_KEY"] = "test-key";
});

describe("the step list", () => {
  it("is sources, sow, the three brief passes, apply, finalize", () => {
    expect([...PREPARE_DEAL_STEPS]).toEqual([
      "sources",
      "sow",
      "brief_core",
      "brief_plan",
      "verify",
      "apply",
      "finalize",
    ]);
  });
});

describe("sources", () => {
  it("hashes what is on the record and marks the reading running", async () => {
    const out = await sources(job(), ctx);
    expect(out.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(out.skipTo).toBeUndefined();
    expect(out.result).toMatchObject({ nothing_new: false, sources: { reports: 1, sow: "ok" } });
    const reading = account().intake.ai_reading;
    expect(reading).toMatchObject({
      status: "running",
      job_id: "job-1",
      step: "sources",
      filled: [],
    });
    expect(reading.heartbeat_at).toBeTruthy();
    // The hash is the pure function over the same inputs.
    const r = baseRows["portal_gong_reports"]![0]!;
    expect(out.sourceHash).toBe(
      sourceHashOf({
        sow: { sha256: sha256Hex(PDF) },
        contract: null,
        reports: [{ id: "r1", content_md: r.content_md, created_at: r.created_at }],
        notes: [],
        summary: null,
      }),
    );
  });

  it("changes when a call note's text is edited in place", () => {
    const base = {
      sow: null,
      contract: null,
      reports: [{ id: "r1", content_md: "first", created_at: "t" }],
      notes: [],
      summary: null,
    };
    expect(
      sourceHashOf({ ...base, reports: [{ id: "r1", content_md: "edited", created_at: "t" }] }),
    ).not.toBe(sourceHashOf(base));
  });

  it("changes when a source changes", () => {
    const base = {
      sow: { sha256: "a" },
      contract: null,
      reports: [{ id: "r1", created_at: "t" }],
      notes: [],
      summary: null,
    };
    const h0 = sourceHashOf(base);
    expect(sourceHashOf({ ...base, summary: "new notes" })).not.toBe(h0);
    expect(
      sourceHashOf({ ...base, reports: [...base.reports, { id: "r2", created_at: "t" }] }),
    ).not.toBe(h0);
    expect(sourceHashOf({ ...base, sow: { sha256: "b" } })).not.toBe(h0);
    // Order of the reports does not matter.
    expect(
      sourceHashOf({
        ...base,
        reports: [
          { id: "r2", created_at: "t" },
          { id: "r1", created_at: "t" },
        ],
      }),
    ).toBe(
      sourceHashOf({
        ...base,
        reports: [
          { id: "r1", created_at: "t" },
          { id: "r2", created_at: "t" },
        ],
      }),
    );
  });

  it("goes straight to finalize when the last done reading saw the same sources", async () => {
    const first = await sources(job(), ctx);
    fake.store["portal_ai_jobs"]!.push({
      id: "done-1",
      kind: "prepare_deal",
      deal_id: DEAL,
      status: "done",
      source_hash: first.sourceHash,
      created_at: "2026-10-07T00:00:00Z",
    });
    account().intake.ai_reading = {
      status: "done",
      started_at: "2026-10-07T00:00:00Z",
      filled: ["the onboarding flow"],
      branches: { brief: { status: "ok", detail: "read" } },
      error: null,
    };
    const again = await sources(job({ id: "job-2" }), ctx);
    expect(again.skipTo).toBe("finalize");
    expect(again.result).toMatchObject({ nothing_new: true, last_job_id: "done-1" });
    // The record keeps what the earlier reading filled while this one runs.
    expect(account().intake.ai_reading).toMatchObject({
      status: "running",
      job_id: "job-2",
      filled: ["the onboarding flow"],
    });

    // "Read again" means it.
    const forced = await sources(job({ id: "job-3", force: true }), ctx);
    expect(forced.skipTo).toBeUndefined();
  });

  it("reads the same sources again after a reading that failed", async () => {
    const first = await sources(job(), ctx);
    fake.store["portal_ai_jobs"]!.push(
      {
        id: "done-1",
        kind: "prepare_deal",
        deal_id: DEAL,
        status: "done",
        source_hash: first.sourceHash,
        created_at: "2026-10-07T00:00:00Z",
      },
      {
        id: "failed-1",
        kind: "prepare_deal",
        deal_id: DEAL,
        status: "failed",
        source_hash: first.sourceHash,
        created_at: "2026-10-07T12:00:00Z",
      },
    );
    const again = await sources(job({ id: "job-2" }), ctx);
    expect(again.skipTo).toBeUndefined();
    expect(again.result).toMatchObject({ nothing_new: false });
  });

  it("reads again after a job that ended done with a reading that failed (the key was missing, the API was down)", async () => {
    const first = await sources(job(), ctx);
    // The branches failed, nothing was filled: the job row is done, the
    // reading on it is not.
    fake.store["portal_ai_jobs"]!.push({
      id: "done-failed",
      kind: "prepare_deal",
      deal_id: DEAL,
      status: "done",
      source_hash: first.sourceHash,
      result: { status: "failed", filled: [], problems: ["AI is not configured here"] },
      created_at: "2026-10-07T00:00:00Z",
    });
    const again = await sources(job({ id: "job-2" }), ctx);
    expect(again.skipTo).toBeUndefined();
    expect(again.result).toMatchObject({ nothing_new: false });
  });

  it("reports the contract on file beside the SOW", async () => {
    account().intake.contract = CONTRACT_ON_FILE;
    const out = await sources(job(), ctx);
    expect(out.result).toMatchObject({ sources: { sow: "ok", contract: "ok" } });
    expect(out.sourceHash).toBe(
      sourceHashOf({
        sow: { sha256: sha256Hex(PDF) },
        contract: { sha256: sha256Hex(CONTRACT) },
        reports: [
          {
            id: "r1",
            content_md: baseRows["portal_gong_reports"]![0]!.content_md,
            created_at: baseRows["portal_gong_reports"]![0]!.created_at,
          },
        ],
        notes: [],
        summary: null,
      }),
    );
  });
});

describe("sow", () => {
  const proposal = sowReadingSchema.parse({
    readable: true,
    reference: "SOW-42",
    summary: "QuickBooks integration plus one extra form",
    seats: 40,
    services: [
      { kind: "integration", name: "QuickBooks Online", tier: 3, phase: 2, confidence: "stated" },
      { kind: "paid_form", name: "Job Safety Analysis", phase: 1, confidence: "stated" },
    ],
  });

  it("reuses a kept reading of the same bytes without calling the model", async () => {
    fake.store["portal_ai_readings"]!.push({
      id: "rd-1",
      deal_id: DEAL,
      kind: "sow",
      source_hash: sha256Hex(PDF),
      output: proposal,
      created_at: "2026-10-07T00:00:00Z",
    });
    const out = await sow(job({ step: "sow", steps_done: ["sources"] }), ctx);
    expect(h.sow.readSowDocument).not.toHaveBeenCalled();
    expect(out.result?.["branches"]).toMatchObject({ sow: { status: "ok" } });
    expect((out.result?.["branches"] as any).sow.detail).toMatch(/kept from an earlier reading/);
    expect(out.filled).toEqual([
      "2 services from the SOW",
      "people in the field (from the SOW)",
      "the SOW reference",
    ]);
    expect(out.result).toMatchObject({ services_added: 2, sow_reused: true });
    expect(out.usage).toBeUndefined();
    const services = account().intake.timeline.services as Array<{ name: string }>;
    expect(services.map((s) => s.name)).toEqual(["QuickBooks Online", "Job Safety Analysis"]);
    // The seats land on the intake as the AI's answer, with the SOW as the source.
    expect(account().intake.field_users).toBe(40);
    expect(account().intake.ai_filled).toEqual(["field_users"]);
    expect(account().intake.ai_sources.field_users.source).toBe("SOW");
    expect(h.sow.stampSowFacts).toHaveBeenCalledWith(
      DEAL,
      expect.objectContaining({ reference: "SOW-42" }),
    );
    expect(account().intake.ai_reading.step).toBe("sow");
  });

  it("reads a new document once, with the contract beside it, and keeps the reading", async () => {
    account().intake.contract = CONTRACT_ON_FILE;
    h.sow.readSowDocument.mockResolvedValue({ proposal, usage, model: "claude-opus-5-5" });
    const out = await sow(job({ step: "sow" }), ctx);
    expect(h.sow.readSowDocument).toHaveBeenCalledWith(
      DEAL,
      expect.objectContaining({ sha256: sha256Hex(PDF), kind: "pdf" }),
      {
        jobId: "job-1",
        contract: expect.objectContaining({ sha256: sha256Hex(CONTRACT), name: "contract.pdf" }),
      },
    );
    expect(out.problems).toBeUndefined();
    expect(out.usage).toEqual(usage);
    const kept = fake.store["portal_ai_readings"]!;
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      deal_id: DEAL,
      kind: "sow",
      source_hash: sha256Hex(PDF),
      source_path: SOW_PATH,
      model: "claude-opus-5-5",
    });
    expect(kept[0]!.output.services).toHaveLength(2);
  });

  it("reads the same bytes again when the job is forced, and the new reading replaces the kept one", async () => {
    fake.store["portal_ai_readings"]!.push({
      id: "rd-1",
      deal_id: DEAL,
      kind: "sow",
      source_hash: sha256Hex(PDF),
      output: sowPlanProposalSchema.parse({ readable: false, problem: "This is a brochure." }),
      created_at: "2026-10-07T00:00:00Z",
    });
    h.sow.readSowDocument.mockResolvedValue({ proposal, usage, model: "m2" });
    const out = await sow(job({ step: "sow", force: true }), ctx);
    expect(h.sow.readSowDocument).toHaveBeenCalledTimes(1);
    expect(out.result?.["branches"]).toMatchObject({ sow: { status: "ok" } });
    expect(out.result).toMatchObject({ services_added: 2, sow_reused: false });
    const kept = fake.store["portal_ai_readings"]!;
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ id: "rd-1", model: "m2" });
    expect(kept[0]!.output.readable).toBe(true);

    // The next job, unforced, serves the fresh reading.
    h.sow.readSowDocument.mockClear();
    const again = await sow(job({ step: "sow", id: "job-2" }), ctx);
    expect(h.sow.readSowDocument).not.toHaveBeenCalled();
    expect(again.result).toMatchObject({ sow_reused: true });
  });

  it("reads a new SOW without a contract when there is none on file", async () => {
    h.sow.readSowDocument.mockResolvedValue({ proposal, usage, model: "claude-opus-5-5" });
    await sow(job({ step: "sow" }), ctx);
    expect(h.sow.readSowDocument).toHaveBeenCalledWith(DEAL, expect.anything(), {
      jobId: "job-1",
      contract: null,
    });
  });

  it("reads the contract itself on a deal with no SOW, and keeps that reading under the contract's path", async () => {
    account().sow_document_path = null;
    account().intake.contract = CONTRACT_ON_FILE;
    h.sow.readSowDocument.mockResolvedValue({ proposal, usage, model: "claude-opus-5-5" });
    const out = await sow(job({ step: "sow" }), ctx);
    expect(out.result?.["branches"]).toMatchObject({ sow: { status: "ok" } });
    expect(h.sow.readSowDocument).toHaveBeenCalledWith(
      DEAL,
      expect.objectContaining({ sha256: sha256Hex(CONTRACT), name: "contract.pdf" }),
      { jobId: "job-1", contract: null },
    );
    expect(fake.store["portal_ai_readings"]![0]).toMatchObject({
      source_hash: sha256Hex(CONTRACT),
      source_path: CONTRACT_PATH,
    });
  });

  it("reads the SOW alone and says so when the contract beside it cannot be read", async () => {
    // Too large with the SOW (fitDocumentsToRequest, tested on its own), a
    // file that is not a document: either way the SOW is read and the
    // contract's problem is said, not swallowed.
    account().intake.contract = CONTRACT_ON_FILE;
    fake.objects.set(
      `attachments/${CONTRACT_PATH}`,
      new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]),
    );
    h.sow.readSowDocument.mockResolvedValue({ proposal, usage, model: "claude-opus-5-5" });
    const out = await sow(job({ step: "sow" }), ctx);
    expect(h.sow.readSowDocument).toHaveBeenCalledWith(DEAL, expect.anything(), {
      jobId: "job-1",
      contract: null,
    });
    expect(out.result?.["branches"]).toMatchObject({ sow: { status: "ok" } });
    expect(out.problems?.[0]).toMatch(
      /The contract was not read: contract\.pdf is .*cannot be read/,
    );
    expect((out.result?.["branches"] as any).sow.detail).toMatch(/The contract was not read/);
  });

  it("serves the reading a forced job already wrote when its step is retried", async () => {
    h.sow.readSowDocument.mockResolvedValue({ proposal, usage, model: "m2" });
    fake.store["portal_ai_jobs"]!.push({ id: "job-1", result: {} });
    await sow(job({ step: "sow", force: true }), ctx);
    expect(h.sow.readSowDocument).toHaveBeenCalledTimes(1);
    // The job carries the mark before the merges, so a retry after a failed
    // merge or advance write finds the row this job wrote.
    expect(fake.store["portal_ai_jobs"]![0]!.result).toMatchObject({ sow_read: true });
    const retried = await sow(job({ step: "sow", force: true, result: { sow_read: true } }), ctx);
    expect(h.sow.readSowDocument).toHaveBeenCalledTimes(1);
    expect(retried.result).toMatchObject({ sow_reused: true });
  });

  it("puts the SOW's forms on the intake only when no call named any", async () => {
    const withForms = {
      ...proposal,
      forms: [{ name: "Daily Report", purpose: null, quote: "Daily Report form" }],
    };
    h.sow.readSowDocument.mockResolvedValue({ proposal: withForms, usage, model: "m" });
    await sow(job({ step: "sow" }), ctx);
    expect(account().intake.wanted_forms).toEqual([]);

    fake.store["portal_gong_reports"] = [];
    fake.store["portal_ai_readings"] = [];
    const out = await sow(job({ step: "sow", id: "job-2" }), ctx);
    expect(account().intake.wanted_forms).toEqual([
      { id: "sow-1", name: "Daily Report", template_id: null },
    ]);
    expect(out.filled).toContain("the first form (from the SOW)");
  });

  it("skips without a document and fails with the reason when one cannot be read", async () => {
    account().sow_document_path = null;
    const none = await sow(job({ step: "sow" }), ctx);
    expect(none.result?.["branches"]).toMatchObject({ sow: { status: "skipped" } });

    account().sow_document_path = "deals/missing.pdf";
    const missing = await sow(job({ step: "sow" }), ctx);
    expect(missing.result?.["branches"]).toMatchObject({ sow: { status: "failed" } });
    expect(missing.problems?.[0]).toMatch(/could not be downloaded/);
    expect(h.sow.readSowDocument).not.toHaveBeenCalled();
  });

  it("reports a document the model could not read as a SOW", async () => {
    h.sow.readSowDocument.mockResolvedValue({
      proposal: sowPlanProposalSchema.parse({ readable: false, problem: "This is a brochure." }),
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      model: "m",
    });
    const out = await sow(job({ step: "sow" }), ctx);
    expect(out.result?.["branches"]).toMatchObject({
      sow: { status: "failed", detail: "This is a brochure." },
    });
    expect(out.problems).toEqual(["This is a brochure."]);
  });
});

describe("the brief passes", () => {
  it("run core, plan and verify over one identical cached prefix, then apply once", async () => {
    const first = await brief_core(job({ step: "brief_core" }), ctx);
    const briefId = first.result?.["brief_id"] as string;
    expect(briefId).toBeTruthy();
    expect(first.result?.["branches"]).toMatchObject({ brief: { status: "ok" } });
    expect(first.usage).toEqual(usage);
    const row = () => fake.store["portal_briefs"]!.find((b) => b.id === briefId)!;
    expect(row()).toMatchObject({ status: "generating", created_by: null });
    expect(row().structured_json.account_name).toBe("Summit Roofing");
    expect(row().structured_json.kickoff).toBeUndefined();

    const next = job({ step: "brief_plan", result: { brief_id: briefId } });
    const second = await brief_plan(next, ctx);
    expect(second.result?.["branches"]).toMatchObject({ brief: { status: "ok" } });
    expect(row().structured_json.kickoff.licensed_seats).toBe("40 seats");
    expect(row().status).toBe("generating");

    const third = await verify({ ...next, step: "verify" }, ctx);
    expect(third.result?.["branches"]).toMatchObject({ brief: { status: "ok" } });
    expect(row().status).toBe("complete");
    expect(row().generator).toBe("llm");
    expect(row().structured_json.verification).toMatchObject({
      checked_at: "2026-10-08T10:05:00.000Z",
      fields: {
        "kickoff.scope[0]": "grounded",
        "kickoff.licensed_seats": "unverified",
        "stakeholders[0]": "grounded",
        "goals[0]": "unverified",
        "onboarding.forms[0]": "grounded",
        "onboarding.flow": "grounded",
      },
    });
    expect((third.result?.["branches"] as any).brief.detail).toMatch(
      /Checked 6 items, 2 to confirm/,
    );

    // The three calls: one system prompt, one prefix, the pass's own ask last.
    const calls = h.ai.runStructured.mock.calls.map((c: any[]) => c[0]);
    expect(calls.map((c: any) => c.kind)).toEqual(["brief_core", "brief_plan", "verify"]);
    const prefixes = calls.map((c: any) => c.content.slice(0, -1));
    expect(prefixes[1]).toEqual(prefixes[0]);
    expect(prefixes[2]).toEqual(prefixes[0]);
    expect(calls[1].system).toBe(calls[0].system);
    expect(calls[2].system).toBe(calls[0].system);
    const last = prefixes[0][prefixes[0].length - 1];
    // No cache marker on the prefix: the three passes send three output
    // schemas, and the API caches nothing across a schema change, so a
    // marker here would be paid for and never read.
    expect(prefixes[0].some((b: any) => b.cache_control)).toBe(false);
    expect(last.text).toContain("Every crew fills a paper daily report");
    expect(prefixes[0][0]).toMatchObject({
      type: "text",
      text: expect.stringMatching(/STATEMENT OF WORK/),
    });
    expect(prefixes[0][1].type).toBe("document");
    // The plan pass sees the core; the verifier sees the whole brief.
    expect(calls[1].content.at(-1).text).toContain('"account_name":"Summit Roofing"');
    expect(calls[2].content.at(-1).text).toContain("THE BRIEF TO CHECK");
    expect(calls.every((c: any) => c.jobId === "job-1" && c.dealId === DEAL)).toBe(true);

    h.brief.applyBriefToDeal.mockResolvedValue(["the onboarding flow", "the first form"]);
    const fourth = await apply(
      { ...next, step: "apply", result: { brief_id: briefId, brief_sources: ["1 call note"] } },
      ctx,
    );
    expect(h.brief.applyBriefToDeal).toHaveBeenCalledTimes(1);
    expect(h.brief.applyBriefToDeal).toHaveBeenCalledWith(
      { kind: "system", label: "the AI reading" },
      DEAL,
      expect.objectContaining({ id: briefId, status: "complete", generator: "llm" }),
    );
    expect(fourth.filled).toEqual(["the onboarding flow", "the first form"]);
    expect((fourth.result?.["branches"] as any).brief.detail).toBe("Read 1 call note");
  });

  it("puts the kept SOW reading in the prefix so the brief agrees with it", async () => {
    fake.store["portal_ai_readings"]!.push({
      id: "rd-1",
      deal_id: DEAL,
      kind: "sow",
      source_hash: sha256Hex(PDF),
      output: sowPlanProposalSchema.parse({
        readable: true,
        summary: "One form, QuickBooks",
        services: [],
      }),
      created_at: "2026-10-07T00:00:00Z",
    });
    await brief_core(job({ step: "brief_core" }), ctx);
    const content = h.ai.runStructured.mock.calls[0]![0].content;
    expect(content.at(-2).text).toContain("WHAT THE SIGNED SOW SAYS, ALREADY EXTRACTED");
    expect(content.at(-2).text).toContain("One form, QuickBooks");
  });

  it("skips to finalize when there is nothing to read", async () => {
    fake.store["portal_gong_reports"] = [];
    const out = await brief_core(job({ step: "brief_core" }), ctx);
    expect(h.ai.runStructured).not.toHaveBeenCalled();
    expect(out.skipTo).toBe("finalize");
    expect(out.result?.["branches"]).toMatchObject({ brief: { status: "skipped" } });
    expect(fake.store["portal_briefs"]).toHaveLength(0);
  });

  it("runs on the summary alone", async () => {
    fake.store["portal_gong_reports"] = [];
    account().summary = "Closed won. 3 crews, QuickBooks next year.";
    const out = await brief_core(job({ step: "brief_core" }), ctx);
    expect((out.result?.["branches"] as any).brief.detail).toMatch(/the deal's summary/);
    const content = h.ai.runStructured.mock.calls[0]![0].content;
    expect(content.at(-2).text).toContain("3 crews, QuickBooks next year");
  });

  it("keeps the core this job already wrote instead of spending the pass again", async () => {
    fake.store["portal_briefs"] = [
      {
        id: "b-mine",
        account_id: DEAL,
        status: "generating",
        generator: null,
        created_by: null,
        structured_json: core,
        created_at: "2026-10-08T10:02:00Z",
      },
    ];
    const out = await brief_core(job({ step: "brief_core" }), ctx);
    expect(h.ai.runStructured).not.toHaveBeenCalled();
    expect(out.result).toMatchObject({ brief_id: "b-mine" });
    expect((out.result?.["branches"] as any).brief.detail).toMatch(/kept from an earlier attempt/);
  });

  it("fails the brief row and goes to finalize when a pass fails", async () => {
    h.ai.runStructured.mockRejectedValue(new Error("rate limited"));
    const out = await brief_core(job({ step: "brief_core" }), ctx);
    expect(out.skipTo).toBe("finalize");
    expect(out.result?.["branches"]).toMatchObject({ brief: { status: "failed" } });
    expect(out.problems?.[0]).toMatch(/The brief did not finish: The brief failed: rate limited/);
    expect(fake.store["portal_briefs"]![0]).toMatchObject({ status: "failed" });
  });

  it("fails when AI is not configured, without a row", async () => {
    delete process.env["ANTHROPIC_API_KEY"];
    const out = await brief_core(job({ step: "brief_core" }), ctx);
    expect(out.skipTo).toBe("finalize");
    expect(out.problems?.[0]).toMatch(/not configured/);
    expect(fake.store["portal_briefs"]).toHaveLength(0);
  });

  it("completes the brief with every item to confirm when the checker cannot run", async () => {
    fake.store["portal_briefs"] = [
      {
        id: "b-1",
        account_id: DEAL,
        status: "generating",
        generator: null,
        created_by: null,
        structured_json: { ...core, ...plan },
        created_at: "2026-10-08T10:02:00Z",
      },
    ];
    h.ai.runStructured.mockRejectedValue(new Error("rate limited"));
    const out = await verify(job({ step: "verify", result: { brief_id: "b-1" } }), ctx);
    expect(out.result?.["branches"]).toMatchObject({ brief: { status: "ok" } });
    expect(out.usage).toBeUndefined();
    const row = fake.store["portal_briefs"]![0]!;
    expect(row.status).toBe("complete");
    expect(row.structured_json.verification.fields).toEqual({
      "kickoff.scope[0]": "unverified",
      "kickoff.licensed_seats": "unverified",
      "stakeholders[0]": "unverified",
      "goals[0]": "unverified",
      "onboarding.forms[0]": "unverified",
      "onboarding.flow": "unverified",
    });
  });

  it("applies nothing when there is no finished brief", async () => {
    const out = await apply(job({ step: "apply" }), ctx);
    expect(h.brief.applyBriefToDeal).not.toHaveBeenCalled();
    expect(out.result?.["branches"]).toMatchObject({ brief: { status: "skipped" } });
  });

  it("decides the sources it can read from", () => {
    expect(briefSourcesFor({ reports: 0, notes: 0, summary: null }).any).toBe(false);
    expect(briefSourcesFor({ reports: 0, notes: 0, summary: "  " }).any).toBe(false);
    expect(briefSourcesFor({ reports: 0, notes: 0, summary: "x" }).what).toEqual([
      "the deal's summary",
    ]);
    expect(briefSourcesFor({ reports: 2, notes: 1, summary: null }).what).toEqual([
      "2 call notes",
      "1 reviewed note",
    ]);
  });

  it("turns the record's summary into one call-notes report, never inserted", () => {
    const r = summaryAsReport({
      id: DEAL,
      summary: " Opportunity: Forms 2026\nClosed: 2026-09-08 ",
      updated_at: "2026-09-08T12:00:00Z",
      created_at: "2026-09-01T00:00:00Z",
    } as any);
    expect(r).toMatchObject({
      account_id: DEAL,
      report_type: "call_notes",
      title: "Notes on the deal",
      content_md: "Opportunity: Forms 2026\nClosed: 2026-09-08",
      created_at: "2026-09-08T12:00:00Z",
    });
    expect(summaryAsReport({ id: DEAL, summary: "  " } as any)).toBeNull();
  });
});

describe("finalize", () => {
  const branches = {
    sow: { status: "ok" as const, detail: "2 services" },
    brief: { status: "ok" as const, detail: "read" },
  };

  it("is done when something was filled, failed when a part failed and nothing was", () => {
    expect(finalStatus({ filled: ["a"], problems: [], branches })).toBe("done");
    expect(finalStatus({ filled: [], problems: [], branches })).toBe("done");
    expect(finalStatus({ filled: ["a"], problems: ["p"], branches })).toBe("done");
    expect(finalStatus({ filled: [], problems: ["p"], branches })).toBe("failed");
    expect(
      finalStatus({
        filled: [],
        problems: [],
        branches: { sow: { status: "failed", detail: "x" } },
      }),
    ).toBe("failed");
  });

  it("writes the record, issues the link, audits and tells the TIS once", async () => {
    const out = await finalize(
      job({
        step: "finalize",
        steps_done: ["sources", "sow", "brief_core", "brief_plan", "verify", "apply"],
        result: {
          filled: ["2 services from the SOW", "the onboarding flow", "the forms"],
          problems: [],
          branches,
          services_added: 2,
        },
        usage: { input_tokens: 10, output_tokens: 5, calls: 2 },
      }),
      ctx,
    );
    expect(out.result).toMatchObject({ status: "done", notified: true });
    expect(h.welcome.issueWelcomeLinkAs).toHaveBeenCalledWith(null, DEAL);
    expect(account().intake.ai_reading).toMatchObject({
      status: "done",
      job_id: "job-1",
      step: "finalize",
      finished_at: "2026-10-08T10:05:00.000Z",
      filled: ["2 services from the SOW", "the onboarding flow", "the forms"],
      error: null,
      branches,
    });
    expect(h.audit.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_type: "system",
        action: "ai.prepare_deal",
        entity_id: DEAL,
        payload: expect.objectContaining({ job_id: "job-1", status: "done" }),
      }),
    );
    expect(h.email.sendEmail).toHaveBeenCalledTimes(1);
    const mail = (h.email.sendEmail.mock.calls as unknown as Array<[any]>)[0]![0];
    expect(mail.kind).toBe("requested");
    expect(mail.to).toBe("priya@gocanvas.com");
    expect(mail.html).toContain(
      "The AI read the SOW and the calls for Summit Roofing: 2 services, 2 fields filled — review them on the deal.",
    );
  });

  it("is failed with the problems on the record when nothing was filled", async () => {
    account().welcome_share_url = "https://x/w/already";
    const out = await finalize(
      job({
        step: "finalize",
        result: {
          filled: [],
          problems: ["The SOW could not be read: brochure."],
          branches: {
            sow: { status: "failed", detail: "brochure." },
            brief: { status: "skipped", detail: null },
          },
        },
      }),
      ctx,
    );
    expect(out.result).toMatchObject({ status: "failed", notified: false });
    expect(h.welcome.issueWelcomeLinkAs).not.toHaveBeenCalled();
    expect(h.email.sendEmail).not.toHaveBeenCalled();
    expect(account().intake.ai_reading).toMatchObject({
      status: "failed",
      error: "The SOW could not be read: brochure.",
      branches: { sow: { status: "failed", detail: "brochure." } },
    });
  });

  it("keeps the earlier reading's list when nothing was new", async () => {
    account().intake.ai_reading = {
      status: "running",
      started_at: "2026-10-08T10:00:00Z",
      job_id: "job-1",
      step: "sources",
      filled: ["the onboarding flow"],
      branches: { brief: { status: "ok", detail: "read" } },
      error: null,
    };
    const out = await finalize(
      job({
        step: "finalize",
        result: { nothing_new: true, filled: [], problems: [], previous_error: null },
      }),
      ctx,
    );
    expect(out.result).toMatchObject({ status: "done", notified: false });
    expect(account().intake.ai_reading).toMatchObject({
      status: "done",
      filled: ["the onboarding flow"],
      branches: { brief: { status: "ok" } },
    });
    expect(h.email.sendEmail).not.toHaveBeenCalled();
  });

  it("writes to the TIS once: a retry after the message was sent sends nothing", async () => {
    fake.store["portal_ai_jobs"]!.push({ id: "job-1", result: { filled: ["x"], notified: true } });
    const out = await finalize(
      job({
        step: "finalize",
        result: { filled: ["x"], problems: [], branches, notified: true },
      }),
      ctx,
    );
    expect(out.result).toMatchObject({ status: "done", notified: true });
    expect(h.email.sendEmail).not.toHaveBeenCalled();
  });

  it("marks the job before the message goes, so a failed advance cannot repeat it", async () => {
    fake.store["portal_ai_jobs"]!.push({ id: "job-1", result: { filled: ["x"] } });
    await finalize(
      job({ step: "finalize", result: { filled: ["x"], problems: [], branches } }),
      ctx,
    );
    expect(h.email.sendEmail).toHaveBeenCalledTimes(1);
    expect(fake.store["portal_ai_jobs"]![0]!.result.notified).toBe(true);
  });

  it("skips the message when the deal has no assignee", async () => {
    h.assignment.dealAssignment.mockResolvedValueOnce({ owner: null } as any);
    const out = await finalize(
      job({ step: "finalize", result: { filled: ["x"], problems: [], branches } }),
      ctx,
    );
    expect(out.result).toMatchObject({ status: "done", notified: false });
    expect(h.email.sendEmail).not.toHaveBeenCalled();
  });

  it("words the summary line from what was read", () => {
    expect(
      readingSummaryLine({
        dealName: "Acme",
        services: 1,
        filled: ["1 service from the SOW", "the contact"],
        branches: { sow: { status: "ok", detail: null } },
      }),
    ).toBe("The AI read the SOW for Acme: 1 service, 1 field filled — review them on the deal.");
    expect(
      readingSummaryLine({
        dealName: "Acme",
        services: 0,
        filled: ["the onboarding flow", "the forms", "the contact"],
        branches: {
          brief: { status: "ok", detail: null },
          sow: { status: "skipped", detail: null },
        },
      }),
    ).toBe(
      "The AI read the calls for Acme: 0 services, 3 fields filled — review them on the deal.",
    );
    // What the prefill drafted, by name: the handoff's answers, the story, the focus.
    expect(
      readingSummaryLine({
        dealName: "Acme",
        services: 2,
        filled: [
          "2 services from the SOW",
          "the first form",
          "Decision maker",
          "Who will be at kickoff",
          "the workflow story",
          "3 focus items",
        ],
        branches: { sow: { status: "ok", detail: null }, brief: { status: "ok", detail: null } },
      }),
    ).toBe(
      "The AI read the SOW and the calls for Acme: 2 services, 1 field filled, 2 handoff answers, the workflow story, 3 focus items — review them on the deal.",
    );
  });
});
