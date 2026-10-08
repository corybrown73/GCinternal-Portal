import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The prepare_deal steps against an in-memory database: the source hash and
 * the short-circuit, a SOW reading served from the table instead of the
 * model, a brief that runs on the summary alone, and the final record.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    brief: { generateDealBriefAs: vi.fn() },
    sow: { readSowDocument: vi.fn(), stampSowFacts: vi.fn(async () => ["reference"]) },
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
vi.mock("../assignment.server", () => h.assignment);
vi.mock("../server/email", () => h.email);
vi.mock("../welcome.server", () => h.welcome);
vi.mock("../server/audit", () => h.audit);

import {
  brief,
  briefSourcesFor,
  finalize,
  finalStatus,
  PREPARE_DEAL_STEPS,
  readingSummaryLine,
  sources,
  sow,
} from "../server/ai/steps/prepare-deal";
import { sourceHashOf } from "../server/ai/sources";
import { sha256Hex } from "../server/ai/documents";
import { sowPlanProposalSchema } from "../sow-plan";
import { summaryAsReport } from "../server/brief/prompt";
import type { AiJobRow } from "../server/ai/jobs";

const DEAL = "22222222-2222-4222-8222-222222222222";
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const SOW_PATH = `deals/${DEAL}/sow.pdf`;

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
      content_md: "notes",
      created_at: "2026-10-01T00:00:00Z",
    },
  ],
  portal_onboarding_notes: [],
  portal_ai_jobs: [],
  portal_ai_readings: [],
};

let fake: ReturnType<typeof createFakeSupabase>;
const account = () => fake.store["portal_accounts"]![0]!;

beforeEach(() => {
  fake = createFakeSupabase(baseRows, { objects: { [`attachments/${SOW_PATH}`]: PDF } });
  h.supabase.client = fake.client;
  h.brief.generateDealBriefAs.mockReset();
  h.sow.readSowDocument.mockReset();
  h.email.sendEmail.mockClear();
  h.welcome.issueWelcomeLinkAs.mockClear();
  h.audit.audit.mockClear();
  process.env["ANTHROPIC_API_KEY"] = "test-key";
});

describe("the step list", () => {
  it("is sources, sow, brief, finalize for now", () => {
    expect([...PREPARE_DEAL_STEPS]).toEqual(["sources", "sow", "brief", "finalize"]);
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
    expect(out.sourceHash).toBe(
      sourceHashOf({
        sow: { sha256: sha256Hex(PDF) },
        contract: null,
        reports: [{ id: "r1", content_md: "notes", created_at: "2026-10-01T00:00:00Z" }],
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
});

describe("sow", () => {
  const proposal = sowPlanProposalSchema.parse({
    readable: true,
    reference: "SOW-42",
    summary: "QuickBooks integration plus one extra form",
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
    });
    const out = await sow(job({ step: "sow", steps_done: ["sources"] }), ctx);
    expect(h.sow.readSowDocument).not.toHaveBeenCalled();
    expect(out.result?.["branches"]).toMatchObject({ sow: { status: "ok" } });
    expect((out.result?.["branches"] as any).sow.detail).toMatch(/kept from an earlier reading/);
    expect(out.filled).toEqual(["2 services from the SOW", "the SOW reference"]);
    expect(out.result).toMatchObject({ services_added: 2, sow_reused: true });
    expect(out.usage).toBeUndefined();
    const services = account().intake.timeline.services as Array<{ name: string }>;
    expect(services.map((s) => s.name)).toEqual(["QuickBooks Online", "Job Safety Analysis"]);
    expect(h.sow.stampSowFacts).toHaveBeenCalledWith(
      DEAL,
      expect.objectContaining({ reference: "SOW-42" }),
    );
    expect(account().intake.ai_reading.step).toBe("sow");
  });

  it("reads a new document once and keeps the reading", async () => {
    const usage = {
      input_tokens: 900,
      output_tokens: 300,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    };
    h.sow.readSowDocument.mockResolvedValue({ proposal, usage, model: "claude-opus-5-5" });
    const out = await sow(job({ step: "sow" }), ctx);
    expect(h.sow.readSowDocument).toHaveBeenCalledWith(
      DEAL,
      expect.objectContaining({ sha256: sha256Hex(PDF), kind: "pdf" }),
      { jobId: "job-1" },
    );
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

describe("brief", () => {
  it("runs on the summary alone, as the system", async () => {
    fake.store["portal_gong_reports"] = [];
    account().summary = "Closed won. 3 crews, QuickBooks next year.";
    h.brief.generateDealBriefAs.mockResolvedValue({
      id: "b1",
      status: "complete",
      generator: "llm",
      error: null,
      filled: ["the onboarding flow", "the forms"],
    });
    const out = await brief(job({ step: "brief" }), ctx);
    expect(h.brief.generateDealBriefAs).toHaveBeenCalledWith(
      { kind: "system", label: "the AI reading" },
      DEAL,
    );
    expect(out.filled).toEqual(["the onboarding flow", "the forms"]);
    expect(out.result?.["branches"]).toMatchObject({ brief: { status: "ok" } });
    expect((out.result?.["branches"] as any).brief.detail).toMatch(/the deal's summary/);
  });

  it("skips when there is nothing to read", async () => {
    fake.store["portal_gong_reports"] = [];
    const out = await brief(job({ step: "brief" }), ctx);
    expect(h.brief.generateDealBriefAs).not.toHaveBeenCalled();
    expect(out.result?.["branches"]).toMatchObject({ brief: { status: "skipped" } });
  });

  it("keeps a brief this job already wrote instead of writing a second on a retry", async () => {
    fake.store["portal_briefs"] = [
      {
        id: "b-old",
        account_id: DEAL,
        status: "complete",
        generator: "llm",
        created_by: null,
        created_at: "2026-10-01T00:00:00Z",
      },
      {
        id: "b-mine",
        account_id: DEAL,
        status: "complete",
        generator: "llm",
        created_by: null,
        created_at: "2026-10-08T10:02:00Z",
      },
    ];
    const out = await brief(job({ step: "brief" }), ctx);
    expect(h.brief.generateDealBriefAs).not.toHaveBeenCalled();
    expect(out.result).toMatchObject({ brief_id: "b-mine" });
    expect((out.result?.["branches"] as any).brief.detail).toMatch(/kept from an earlier attempt/);
  });

  it("reports a brief that fell back to the template as a failure of the reading", async () => {
    h.brief.generateDealBriefAs.mockResolvedValue({
      id: "b1",
      status: "complete",
      generator: "template",
      error: "AI synthesis failed: rate limited.",
      filled: [],
    });
    const out = await brief(job({ step: "brief" }), ctx);
    expect(out.result?.["branches"]).toMatchObject({ brief: { status: "failed" } });
    expect(out.problems).toEqual(["AI synthesis failed: rate limited."]);
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
        steps_done: ["sources", "sow", "brief"],
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
  });
});
