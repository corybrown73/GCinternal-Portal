import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The two clicks on a kept proposal, against an in-memory database: Apply
 * runs the existing create path and marks the row with what it created,
 * Dismiss marks it, both say who and leave an audit row, a decided row
 * cannot be decided twice, a target date goes to the plan's live override
 * when the implementation came from a deal, and a suggested handoff answer
 * never replaces a person's own.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    hub: {
      createRisk: vi.fn(async () => ({ ok: true, id: "risk-9" })),
      createIssue: vi.fn(async () => ({ ok: true, id: "issue-9" })),
      createDecision: vi.fn(async () => ({ ok: true, id: "decision-9" })),
      createJournalEntry: vi.fn(async () => ({ ok: true, stage: "build" })),
      updateRecordField: vi.fn(async () => ({ ok: true })),
    },
    presale: { saveDealIntake: vi.fn(async (..._args: unknown[]) => ({})) },
    audit: { audit: vi.fn(async () => {}) },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../hub.server", () => h.hub);
vi.mock("../presale.server", () => h.presale);
vi.mock("../server/audit", () => h.audit);

import {
  applyProposal,
  dismissProposal,
  loadTranscriptWork,
  pendingProposalCounts,
} from "../transcript-proposals.server";

const IMPL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DEAL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PRIYA = "11111111-1111-4111-8111-111111111111";
const actor = { profileId: "u-1" };

const proposal = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  implementation_id: IMPL,
  evidence_id: "ev-1",
  attachment_id: "file-1",
  job_id: null,
  type: "risk",
  title: "Tablets late",
  text: "No tablets yet.",
  quote: "we still have no tablets",
  confidence: "stated",
  severity: "high",
  likelihood: "low",
  owner_team_member_id: PRIYA,
  proposed_date: null,
  duplicate_of_type: null,
  duplicate_of_id: null,
  intake_key: null,
  status: "pending",
  applied_entity_type: null,
  applied_entity_id: null,
  decided_by: null,
  decided_at: null,
  created_at: "2026-10-08T10:00:00Z",
  ...over,
});

const rows = (): Rows => ({
  implementations: [{ id: IMPL, deal_id: DEAL }],
  portal_accounts: [
    {
      id: DEAL,
      intake: {
        timeline: { close_date: "2026-09-28", overrides: { kickoff: "2026-09-30" } },
        handoff: {
          answers: {
            business_outcome: { value: "Fewer missed jobs", source: "sales", at: "", by: null },
            commitments: { value: "A demo", source: "ai", at: "", by: null },
          },
        },
      },
    },
  ],
  portal_stage_transitions: [],
  portal_profiles: [{ id: "u-1", team_member_id: PRIYA }],
  account_files: [
    { id: "file-1", title: "kickoff.txt" },
    { id: "file-2", title: "sync.vtt" },
    { id: "file-3", title: "list.txt" },
    { id: "file-4", title: "quiet.txt" },
    { id: "file-5", title: "broken.pdf" },
  ],
  portal_ai_jobs: [
    {
      id: "job-1",
      kind: "analyze_transcript",
      implementation_id: IMPL,
      subject_id: "file-2",
      status: "running",
      step: "analyze",
      created_at: "2026-10-08T09:30:00Z",
    },
    {
      id: "job-0",
      kind: "analyze_transcript",
      implementation_id: IMPL,
      subject_id: "file-1",
      status: "done",
      step: "analyze",
      result: { readable: true, proposals: 8 },
      created_at: "2026-10-08T09:00:00Z",
    },
    // The model's verdict on a file that was not a transcript.
    {
      id: "job-3",
      kind: "analyze_transcript",
      implementation_id: IMPL,
      subject_id: "file-3",
      status: "done",
      step: "analyze",
      result: { readable: false, problem: "This is a shopping list.", proposals: 0 },
      created_at: "2026-10-08T09:10:00Z",
    },
    // A transcript that proposed nothing.
    {
      id: "job-4",
      kind: "analyze_transcript",
      implementation_id: IMPL,
      subject_id: "file-4",
      status: "done",
      step: "analyze",
      result: { readable: true, proposals: 0 },
      created_at: "2026-10-08T09:15:00Z",
    },
    // The runner gave up; an earlier attempt on the same file is not the latest.
    {
      id: "job-5b",
      kind: "analyze_transcript",
      implementation_id: IMPL,
      subject_id: "file-5",
      status: "failed",
      step: "analyze",
      last_error: "The transcript analysis failed: the model did not answer.",
      created_at: "2026-10-08T09:20:00Z",
    },
    {
      id: "job-5a",
      kind: "analyze_transcript",
      implementation_id: IMPL,
      subject_id: "file-5",
      status: "running",
      step: "analyze",
      created_at: "2026-10-08T09:05:00Z",
    },
    // Too old to still be worth a line.
    {
      id: "job-old",
      kind: "analyze_transcript",
      implementation_id: IMPL,
      subject_id: "file-6",
      status: "failed",
      step: "analyze",
      last_error: "old",
      created_at: "2026-09-01T09:00:00Z",
    },
  ],
  evidence: [
    { id: "ev-1", title: "Meeting transcript — kickoff.txt", created_at: "2026-10-08T09:00:00Z" },
  ],
  risks: [{ id: "r-1", title: "Tablets not ordered" }],
  issues: [],
  decisions: [],
  evidence_proposals: [
    proposal("p-risk"),
    proposal("p-dup", { type: "issue", duplicate_of_type: "risk", duplicate_of_id: "r-1" }),
    proposal("p-date", { type: "target_date", text: "Go-live", proposed_date: "2026-10-20" }),
    proposal("p-owner", { type: "owner", text: "Priya Nair", owner_team_member_id: null }),
    proposal("p-note", { type: "note", quote: null }),
    proposal("p-answer", {
      type: "intake_suggestion",
      intake_key: "field_users",
      text: "About 40",
    }),
    proposal("p-taken", {
      type: "intake_suggestion",
      intake_key: "business_outcome",
      text: "Less paper",
    }),
    proposal("p-ai", {
      type: "intake_suggestion",
      intake_key: "commitments",
      text: "A demo and training",
    }),
    proposal("p-done", {
      status: "applied",
      applied_entity_type: "risk",
      applied_entity_id: "risk-1",
    }),
  ],
});

let fake: ReturnType<typeof createFakeSupabase>;
const row = (id: string) => fake.store["evidence_proposals"]!.find((p) => p.id === id)!;

beforeEach(() => {
  fake = createFakeSupabase(rows());
  h.supabase.client = fake.client;
  for (const fn of Object.values(h.hub)) fn.mockClear();
  h.presale.saveDealIntake.mockClear();
  h.audit.audit.mockClear();
});

describe("loadTranscriptWork", () => {
  it("lists the readings in flight or with nothing to show, and every row with its source and duplicate titles", async () => {
    const w = await loadTranscriptWork(IMPL, new Date("2026-10-08T10:00:00Z"));
    // Newest first; a reading whose proposals are listed (file-1) needs no line.
    expect(w.jobs).toEqual([
      {
        attachment_id: "file-2",
        title: "sync.vtt",
        status: "running",
        step: "analyze",
        problem: null,
        proposals: null,
      },
      {
        attachment_id: "file-5",
        title: "broken.pdf",
        status: "failed",
        step: "analyze",
        problem: "The transcript analysis failed: the model did not answer.",
        proposals: null,
      },
      {
        attachment_id: "file-4",
        title: "quiet.txt",
        status: "done",
        step: "analyze",
        problem: null,
        proposals: 0,
      },
      {
        attachment_id: "file-3",
        title: "list.txt",
        status: "done",
        step: "analyze",
        problem: "This is a shopping list.",
        proposals: 0,
      },
    ]);
    expect(w.proposals).toHaveLength(9);
    const dup = w.proposals.find((p) => p.id === "p-dup")!;
    expect(dup.duplicate_title).toBe("Tablets not ordered");
    expect(dup.source_title).toBe("Meeting transcript — kickoff.txt");
    expect(dup.source_at).toBe("2026-10-08T09:00:00Z");
    expect(w.proposals.find((p) => p.id === "p-owner")!.owner_name).toBe("Priya Nair");
    expect(w.proposals.find((p) => p.id === "p-answer")!.intake_key).toBe("field_users");
  });

  it("counts only the pending rows, per implementation", async () => {
    expect(await pendingProposalCounts([IMPL, "other"])).toEqual(new Map([[IMPL, 8]]));
    expect(await pendingProposalCounts([])).toEqual(new Map());
  });
});

describe("applyProposal", () => {
  it("creates the risk through the existing path with the proposed levels and owner, then marks the row", async () => {
    const out = await applyProposal("p-risk", {}, actor);
    expect(out).toEqual({ ok: true, entityType: "risk", entityId: "risk-9" });
    expect(h.hub.createRisk).toHaveBeenCalledWith(
      IMPL,
      expect.objectContaining({
        title: "Tablets late",
        severity: "high",
        likelihood: "low",
        owner_id: PRIYA,
      }),
      { actorProfileId: "u-1" },
    );
    expect(row("p-risk")).toMatchObject({
      status: "applied",
      applied_entity_type: "risk",
      applied_entity_id: "risk-9",
      decided_by: "u-1",
    });
    expect(row("p-risk").decided_at).toBeTruthy();
    expect(h.audit.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "evidence_proposal.applied",
        actor_id: "u-1",
        entity_id: "p-risk",
        payload: expect.objectContaining({ applied_entity_id: "risk-9" }),
      }),
    );
  });

  it("lets the reviewer's picks override the reading", async () => {
    await applyProposal("p-risk", { severity: "low", ownerTeamMemberId: null }, actor);
    expect(h.hub.createRisk).toHaveBeenCalledWith(
      IMPL,
      expect.objectContaining({ severity: "low", likelihood: "low", owner_id: null }),
      expect.anything(),
    );
  });

  it("moves the plan's live date when the implementation came from a deal", async () => {
    const out = await applyProposal("p-date", {}, actor);
    expect(out.entityType).toBe("plan");
    expect(h.hub.updateRecordField).not.toHaveBeenCalled();
    const [userId, dealId, patch] = h.presale.saveDealIntake.mock.calls[0]! as unknown as [
      string,
      string,
      { timeline: { overrides: Record<string, string> } },
    ];
    expect(userId).toBe("u-1");
    expect(dealId).toBe(DEAL);
    // The earlier override survives; the plan's last milestone takes the date.
    expect(patch.timeline.overrides["kickoff"]).toBe("2026-09-30");
    expect(patch.timeline.overrides["live"]).toBe("2026-10-20");
  });

  it("sets the record's target column when there is no deal", async () => {
    fake.store["implementations"]![0]!.deal_id = null;
    await applyProposal("p-date", { proposedDate: "2026-11-02" }, actor);
    expect(h.hub.updateRecordField).toHaveBeenCalledWith({
      implementationId: IMPL,
      field: "target_launch_date",
      value: "2026-11-02",
      actorProfileId: "u-1",
    });
    expect(h.presale.saveDealIntake).not.toHaveBeenCalled();
  });

  it("needs the picker's owner for an owner change, and writes the record field", async () => {
    await expect(applyProposal("p-owner", {}, actor)).rejects.toThrow(/Pick who/);
    expect(row("p-owner").status).toBe("pending");
    await applyProposal("p-owner", { ownerTeamMemberId: PRIYA }, actor);
    expect(h.hub.updateRecordField).toHaveBeenCalledWith(
      expect.objectContaining({ field: "owner_id", value: PRIYA }),
    );
    expect(row("p-owner")).toMatchObject({
      status: "applied",
      applied_entity_type: "implementation",
    });
  });

  it("writes a note as the signed-in person's working note", async () => {
    await applyProposal("p-note", {}, actor);
    expect(h.hub.createJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({ implementationId: IMPL, authorId: PRIYA, kind: "note" }),
    );
    expect(row("p-note")).toMatchObject({
      status: "applied",
      applied_entity_type: "journal_entry",
    });
  });

  it("answers a blank or AI-filled handoff question as the TIS, never a person's", async () => {
    await applyProposal("p-answer", {}, actor);
    const patch = (h.presale.saveDealIntake.mock.calls[0] as unknown as [string, string, any])[2];
    expect(patch.handoff.answers.field_users).toMatchObject({
      value: "About 40",
      source: "tis",
      by: "u-1",
    });
    expect(patch.field_users).toBe(40);

    await applyProposal("p-ai", {}, actor);
    expect(h.presale.saveDealIntake).toHaveBeenCalledTimes(2);

    await expect(applyProposal("p-taken", {}, actor)).rejects.toThrow(/answered by a person/);
    expect(row("p-taken").status).toBe("pending");
  });

  it("refuses a row already decided, or gone", async () => {
    await expect(applyProposal("p-done", {}, actor)).rejects.toThrow(/already decided/);
    await expect(applyProposal("nope", {}, actor)).rejects.toThrow(/no longer exists/);
    expect(h.hub.createRisk).not.toHaveBeenCalled();
  });

  it("claims the row before creating anything, so a second reviewer in the same moment creates nothing", async () => {
    // Another reviewer's apply is in flight: the row is pending and stamped.
    row("p-risk").decided_by = "u-2";
    row("p-risk").decided_at = new Date(Date.now() - 10_000).toISOString();
    await expect(applyProposal("p-risk", {}, actor)).rejects.toThrow(/Someone else is applying/);
    expect(h.hub.createRisk).not.toHaveBeenCalled();
    expect(row("p-risk")).toMatchObject({ status: "pending", decided_by: "u-2" });
  });

  it("takes over a claim left behind by a cut-off request", async () => {
    row("p-risk").decided_by = "u-2";
    row("p-risk").decided_at = new Date(Date.now() - 10 * 60_000).toISOString();
    const out = await applyProposal("p-risk", {}, actor);
    expect(out.entityType).toBe("risk");
    expect(row("p-risk")).toMatchObject({ status: "applied", decided_by: "u-1" });
  });

  it("hands the row back when the create fails", async () => {
    h.hub.createRisk.mockRejectedValueOnce(new Error("risks table is read-only today"));
    await expect(applyProposal("p-risk", {}, actor)).rejects.toThrow(/read-only today/);
    expect(row("p-risk")).toMatchObject({ status: "pending", decided_by: null, decided_at: null });
    // And the next click works.
    await applyProposal("p-risk", {}, actor);
    expect(row("p-risk").status).toBe("applied");
  });
});

describe("dismissProposal", () => {
  it("marks the row dismissed with who and when, writes nothing else, and audits", async () => {
    await dismissProposal("p-dup", actor);
    expect(row("p-dup")).toMatchObject({ status: "dismissed", decided_by: "u-1" });
    expect(h.hub.createIssue).not.toHaveBeenCalled();
    expect(h.audit.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "evidence_proposal.dismissed", entity_id: "p-dup" }),
    );
    await expect(dismissProposal("p-dup", actor)).rejects.toThrow(/already decided/);
  });

  it("will not dismiss a row someone is applying right now", async () => {
    row("p-note").decided_by = "u-2";
    row("p-note").decided_at = new Date().toISOString();
    await expect(dismissProposal("p-note", actor)).rejects.toThrow(/Someone else is applying/);
    expect(row("p-note").status).toBe("pending");
  });
});
