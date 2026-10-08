import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The transcript reading against an in-memory database: the context the
 * model is given, the pending rows it leaves behind, the ids it may not
 * invent, and a second reading of the same file replacing only what nobody
 * has decided on. The model is a stub; the document preparation is real.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    ai: {
      runStructured: vi.fn(),
      describeAiError: (e: unknown, what = "AI synthesis") =>
        `${what} failed: ${e instanceof Error ? e.message : String(e)}`,
      AiRefusedError: class AiRefusedError extends Error {
        constructor() {
          super("The model declined to read this content.");
        }
      },
    },
    hub: {
      loadTeamOptions: vi.fn(async () => [
        { id: "11111111-1111-4111-8111-111111111111", name: "Priya Nair", role: "implementation" },
      ]),
    },
    audit: { audit: vi.fn(async () => {}) },
    flags: { isFlagOn: vi.fn(async () => true) },
    jobs: {
      enqueueAiJob: vi.fn(async () => ({ created: true })),
      kickAiJobs: vi.fn(async () => {}),
    },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../server/ai/client", () => h.ai);
vi.mock("../hub.server", () => h.hub);
vi.mock("../server/audit", () => h.audit);
vi.mock("../app-config.server", () => h.flags);
vi.mock("../server/ai/jobs", () => h.jobs);

import {
  analyzeTranscript,
  loadTranscriptContext,
  queueTranscriptReading,
  transcriptReadable,
} from "../transcript-analysis.server";
import { attachmentReferenceFor } from "../transcript-analysis";

const IMPL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CUSTOMER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DEAL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FILE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PRIYA = "11111111-1111-4111-8111-111111111111";
const PATH = `accounts/${IMPL}/kickoff.txt`;

const TRANSCRIPT = new TextEncoder().encode(
  [
    "Kickoff call, 6 October 2026.",
    "Priya: we still have no tablets for the crew, that worries me.",
    "Customer: forty guys in the field, so about forty seats.",
    "Priya: let's say two weeks from today for go-live, then.",
  ].join("\n"),
);

const rows = (): Rows => ({
  customers: [{ id: CUSTOMER, name: "Summit Roofing" }],
  implementations: [
    {
      id: IMPL,
      name: "Summit — new logo",
      customer_id: CUSTOMER,
      deal_id: DEAL,
      current_stage: "build",
      target_launch_date: null,
      owner_id: PRIYA,
    },
  ],
  portal_accounts: [
    {
      id: DEAL,
      stage: "get_it_working",
      intake: {
        wanted_forms: [{ id: "f1", name: "Daily job sheet" }],
        timeline: { close_date: "2026-09-28" },
        handoff: { answers: { bought: { value: ["Forms"], source: "sales", at: "", by: null } } },
      },
    },
  ],
  portal_stage_transitions: [],
  account_files: [
    {
      id: FILE,
      implementation_id: IMPL,
      title: "kickoff.txt",
      storage_path: PATH,
      content_type: "text/plain",
      created_at: "2026-10-08T09:00:00Z",
    },
  ],
  evidence: [
    {
      id: "ev-1",
      implementation_id: IMPL,
      title: "Meeting transcript — kickoff.txt",
      description: attachmentReferenceFor(FILE),
      created_at: "2026-10-08T09:00:01Z",
    },
  ],
  risks: [{ id: "r-1", implementation_id: IMPL, title: "Tablets not ordered", status: "open" }],
  issues: [],
  decisions: [],
  evidence_proposals: [],
});

let fake: ReturnType<typeof createFakeSupabase>;

const reply = (proposals: unknown[]) => ({
  data: {
    readable: true,
    problem: null,
    summary: "Kickoff.",
    meeting_date: "2026-10-06",
    proposals,
  },
  usage: {
    input_tokens: 10,
    output_tokens: 5,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
  model: "m",
  stop_reason: "end_turn",
  attempts: 1,
  ms: 1,
});

beforeEach(() => {
  fake = createFakeSupabase(rows(), { objects: { [`attachments/${PATH}`]: TRANSCRIPT } });
  h.supabase.client = fake.client;
  h.ai.runStructured.mockReset();
  h.audit.audit.mockClear();
  h.jobs.enqueueAiJob.mockClear();
  h.jobs.kickAiJobs.mockClear();
  h.flags.isFlagOn.mockReset().mockResolvedValue(true);
  process.env["ANTHROPIC_API_KEY"] = "test";
});

describe("loadTranscriptContext", () => {
  it("reads the deal's stage, plan dates, first form, open records, roster and answered questions", async () => {
    const ctx = await loadTranscriptContext(IMPL, {
      title: "kickoff.txt",
      created_at: "2026-10-08T09:00:00Z",
    });
    expect(ctx.customerName).toBe("Summit Roofing");
    expect(ctx.stageLabel).toBe("Get it working");
    expect(ctx.timeline.closeDate).toBe("2026-09-28");
    expect(ctx.timeline.liveDate).toMatch(/^2026-10-\d\d$/);
    expect(ctx.timeline.firstForm).toBe("Daily job sheet");
    expect(ctx.open.risks).toEqual([{ id: "r-1", title: "Tablets not ordered" }]);
    expect(ctx.roster).toEqual([{ id: PRIYA, name: "Priya Nair", role: "implementation" }]);
    expect(ctx.attachment).toEqual({ title: "kickoff.txt", uploadedAt: "2026-10-08" });
    expect(ctx.owner).toEqual({ id: PRIYA, name: "Priya Nair" });
    expect(ctx.hasHandoff).toBe(true);
    expect(ctx.handoffAnswered).toContain("bought");
  });

  it("falls back to the record's own stage and target without a deal, and offers no handoff", async () => {
    fake.store["implementations"]![0]!.deal_id = null;
    fake.store["implementations"]![0]!.target_launch_date = "2026-11-01";
    fake.store["implementations"]![0]!.owner_id = null;
    const ctx = await loadTranscriptContext(IMPL, { title: null, created_at: null });
    expect(ctx.stageLabel).toBe("build");
    expect(ctx.timeline).toEqual({ closeDate: null, liveDate: "2026-11-01", firstForm: null });
    expect(ctx.owner).toBeNull();
    expect(ctx.hasHandoff).toBe(false);
    expect(ctx.handoffAnswered).toEqual([]);
  });
});

describe("analyzeTranscript", () => {
  it("sends the context before the transcript and keeps every proposal as a pending row", async () => {
    h.ai.runStructured.mockResolvedValueOnce(
      reply([
        {
          type: "risk",
          title: "Tablets late",
          text: "No tablets for the crew yet.",
          quote: "we still have no tablets",
          confidence: "stated",
          severity: "high",
          likelihood: "medium",
          owner_team_member_id: PRIYA,
          duplicate_of: { type: "risk", id: "r-1" },
        },
        {
          type: "target_date",
          title: "Go-live in two weeks",
          text: "2026-10-20",
          quote: "two weeks from today",
          confidence: "implied",
          proposed_date: "2026-10-20",
        },
        {
          type: "intake_suggestion",
          title: "Field users",
          text: "About 40",
          quote: "forty guys in the field",
          confidence: "stated",
          intake_key: "field_users",
        },
      ]),
    );

    const r = await analyzeTranscript(IMPL, FILE, {
      actor: { type: "user", profileId: "u-1" },
      jobId: "job-9",
    });

    const call = h.ai.runStructured.mock.calls[0]![0];
    expect(call.kind).toBe("transcript");
    expect(call.jobId).toBe("job-9");
    expect(call.dealId).toBe(DEAL);
    expect(call.content[0]).toMatchObject({ type: "text" });
    expect(call.content[0].text).toContain("Implementation context");
    expect(call.content[0].text).toContain(`[${PRIYA}] Priya Nair`);
    expect(call.content[1]).toMatchObject({ type: "document" });

    expect(r.proposalIds).toHaveLength(3);
    expect(r.usage?.input_tokens).toBe(10);
    const kept = fake.store["evidence_proposals"]!;
    expect(kept).toHaveLength(3);
    expect(kept[0]).toMatchObject({
      implementation_id: IMPL,
      evidence_id: "ev-1",
      attachment_id: FILE,
      job_id: "job-9",
      type: "risk",
      severity: "high",
      likelihood: "medium",
      owner_team_member_id: PRIYA,
      duplicate_of_type: "risk",
      duplicate_of_id: "r-1",
      status: "pending",
    });
    expect(kept[1]).toMatchObject({
      type: "target_date",
      proposed_date: "2026-10-20",
      severity: null,
    });
    expect(kept[2]).toMatchObject({ type: "intake_suggestion", intake_key: "field_users" });
    expect(h.audit.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "transcript.analyzed",
        actor_type: "user",
        actor_id: "u-1",
      }),
    );
  });

  it("drops an owner id or a duplicate id the context never listed", async () => {
    h.ai.runStructured.mockResolvedValueOnce(
      reply([
        {
          type: "owner",
          title: "Dana takes over",
          text: "Dana Cole",
          owner_name: "Dana Cole",
          owner_team_member_id: "99999999-9999-4999-8999-999999999999",
          quote: "Dana will run it",
          confidence: "stated",
          duplicate_of: { type: "issue", id: "nope" },
        },
      ]),
    );
    await analyzeTranscript(IMPL, FILE);
    expect(fake.store["evidence_proposals"]![0]).toMatchObject({
      type: "owner",
      text: "Dana Cole",
      owner_team_member_id: null,
      duplicate_of_type: null,
      duplicate_of_id: null,
    });
  });

  it("replaces the pending rows of an earlier reading of the same file, keeping decided ones", async () => {
    fake.store["evidence_proposals"] = [
      {
        id: "old-pending",
        implementation_id: IMPL,
        attachment_id: FILE,
        type: "note",
        status: "pending",
      },
      {
        id: "old-applied",
        implementation_id: IMPL,
        attachment_id: FILE,
        type: "risk",
        status: "applied",
      },
      {
        id: "other-file",
        implementation_id: IMPL,
        attachment_id: "other",
        type: "note",
        status: "pending",
      },
    ];
    h.ai.runStructured.mockResolvedValueOnce(
      reply([
        {
          type: "note",
          title: "Follow up",
          text: "Send the seat count",
          quote: "send it over",
          confidence: "stated",
        },
      ]),
    );
    const r = await analyzeTranscript(IMPL, FILE);
    const ids = fake.store["evidence_proposals"]!.map((p) => p.id);
    expect(ids).not.toContain("old-pending");
    expect(ids).toContain("old-applied");
    expect(ids).toContain("other-file");
    expect(ids).toContain(r.proposalIds[0]);
  });

  it("keeps a suggested handoff answer as a note when the implementation has no handoff", async () => {
    fake.store["implementations"]![0]!.deal_id = null;
    h.ai.runStructured.mockResolvedValueOnce(
      reply([
        {
          type: "intake_suggestion",
          title: "Field users",
          text: "About 40",
          quote: "forty guys in the field",
          confidence: "stated",
          intake_key: "field_users",
        },
      ]),
    );
    await analyzeTranscript(IMPL, FILE);
    const call = h.ai.runStructured.mock.calls[0]![0];
    expect(call.content[0].text).toContain("propose no intake_suggestion");
    expect(fake.store["evidence_proposals"]![0]).toMatchObject({
      type: "note",
      title: "Field users",
      intake_key: null,
    });
  });

  it("refuses a file that is not on the implementation", async () => {
    await expect(analyzeTranscript("ffffffff-ffff-4fff-8fff-ffffffffffff", FILE)).rejects.toThrow(
      /no longer on this implementation/,
    );
  });

  it("returns an unreadable reply as the answer, keeping nothing and leaving earlier rows alone", async () => {
    fake.store["evidence_proposals"] = [
      {
        id: "old-pending",
        implementation_id: IMPL,
        attachment_id: FILE,
        type: "note",
        status: "pending",
      },
    ];
    h.ai.runStructured.mockResolvedValueOnce({
      ...reply([]),
      data: {
        readable: false,
        problem: "This is a shopping list.",
        summary: "",
        meeting_date: null,
        proposals: [],
      },
    });
    const r = await analyzeTranscript(IMPL, FILE);
    expect(r.analysis).toMatchObject({ readable: false, problem: "This is a shopping list." });
    expect(r.proposalIds).toEqual([]);
    expect(fake.store["evidence_proposals"]!.map((p) => p.id)).toEqual(["old-pending"]);
    expect(h.audit.audit).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ readable: false }) }),
    );
  });

  it("returns a refusal as unreadable, so the job is not retried; other faults still throw", async () => {
    h.ai.runStructured.mockRejectedValueOnce(new h.ai.AiRefusedError());
    const r = await analyzeTranscript(IMPL, FILE);
    expect(r.analysis.readable).toBe(false);
    expect(r.analysis.problem).toMatch(/declined to read/);

    h.ai.runStructured.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(analyzeTranscript(IMPL, FILE)).rejects.toThrow(/socket hang up/);
  });
});

describe("queueTranscriptReading", () => {
  it("queues a job for a readable upload and wakes the cron", async () => {
    const r = await queueTranscriptReading({
      implementationId: IMPL,
      attachmentId: FILE,
      requestedBy: "u-1",
    });
    expect(r).toEqual({ queued: true, reason: null });
    expect(h.jobs.enqueueAiJob).toHaveBeenCalledWith({
      kind: "analyze_transcript",
      implementationId: IMPL,
      subjectId: FILE,
      trigger: "upload",
      requestedBy: "u-1",
    });
    expect(h.jobs.kickAiJobs).toHaveBeenCalled();
  });

  it("does nothing when the flag is off, the file is missing, or the type cannot be read", async () => {
    h.flags.isFlagOn.mockResolvedValueOnce(false);
    expect(
      await queueTranscriptReading({
        implementationId: IMPL,
        attachmentId: FILE,
        requestedBy: null,
      }),
    ).toEqual({
      queued: false,
      reason: "flag off",
    });
    expect(
      await queueTranscriptReading({
        implementationId: IMPL,
        attachmentId: "missing",
        requestedBy: null,
      }),
    ).toMatchObject({ queued: false, reason: "no stored file" });
    fake.store["account_files"]![0]!.content_type = "image/png";
    fake.store["account_files"]![0]!.title = "photo.png";
    expect(
      await queueTranscriptReading({
        implementationId: IMPL,
        attachmentId: FILE,
        requestedBy: null,
      }),
    ).toEqual({
      queued: false,
      reason: "unreadable type",
    });
    expect(h.jobs.enqueueAiJob).not.toHaveBeenCalled();
  });

  it("judges readability from the stored type, then the name", () => {
    expect(transcriptReadable("application/pdf", "x.pdf")).toBe(true);
    expect(
      transcriptReadable(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "x.docx",
      ),
    ).toBe(true);
    expect(transcriptReadable("text/vtt", null)).toBe(true);
    expect(transcriptReadable("application/octet-stream", "call.srt")).toBe(true);
    expect(transcriptReadable("application/octet-stream", "deck.pptx")).toBe(false);
    expect(transcriptReadable(null, null)).toBe(false);
  });
});
