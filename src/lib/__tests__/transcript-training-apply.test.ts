import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * A transcript may suggest training changes. Applying one is a person's click, and
 * each approved change goes through one database function with the version the
 * suggestion was made against. A stale version, a disabled feature, or a suggestion
 * with no quote writes nothing and leaves the suggestion pending. No stage, checklist
 * task or purchased solution is touched.
 */

const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    audit: { audit: vi.fn(async () => {}) },
    flags: { isFlagOn: async (_flag: string) => true },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../server/audit", () => h.audit);
vi.mock("../app-config.server", () => h.flags);
vi.mock("../hub.server", () => ({}));
vi.mock("../presale.server", () => ({}));

import { applyProposal } from "../transcript-proposals.server";
import { proposalRowFor } from "../transcript-analysis.server";
import type { TranscriptContext, TranscriptProposal } from "../transcript-analysis";

const ORG = "00000000-0000-4000-8000-000000000001";
const IMPL = "d0000000-0000-4000-8000-0000000000e1";
const NEED = "a7000000-0000-4000-8000-0000000000e1";
const VERSION = "2026-11-01T10:00:00.000001+00:00";
const ACTOR = { profileId: "a0000000-0000-4000-8000-0000000000e1" };
const QUOTE = "Dana said her crew will run the form on their own now.";

let fake: ReturnType<typeof createFakeSupabase>;

function rowsFor(): Rows {
  return {
    implementations: [
      {
        id: IMPL,
        org_id: ORG,
        deal_id: null,
        journey_type: null,
        partner_key: null,
        name: "Rollout",
        current_stage: "build",
      },
    ],
    implementation_training: [
      {
        id: NEED,
        org_id: ORG,
        implementation_id: IMPL,
        topic: "Form basics",
        responsibility: null,
        responsibility_source: null,
        demonstrated_status: "not_assessed",
        updated_at: VERSION,
        created_at: "2026-10-30T00:00:00Z",
      },
    ],
    evidence_proposals: [],
    portal_profiles: [{ id: ACTOR.profileId, full_name: "Sam TIS", email: "sam@gocanvas.test" }],
  };
}

function proposal(over: Record<string, unknown>): Rows["evidence_proposals"][number] {
  return {
    id: "p-1",
    implementation_id: IMPL,
    evidence_id: null,
    attachment_id: null,
    job_id: null,
    type: "training_update",
    title: "Training change",
    text: "",
    quote: QUOTE,
    confidence: "stated",
    severity: null,
    likelihood: null,
    owner_team_member_id: null,
    proposed_date: null,
    duplicate_of_type: null,
    duplicate_of_id: null,
    intake_key: null,
    training_id: NEED,
    training_field: "audience",
    training_value: "Field crews",
    training_date: null,
    training_version: VERSION,
    status: "pending",
    applied_entity_type: null,
    applied_entity_id: null,
    decided_by: null,
    decided_at: null,
    created_at: "2026-11-02T10:00:00Z",
    ...over,
  };
}

const RPC_OK = { data: null };

function use(rows: Rows, handlers: Record<string, () => { data?: any; error?: any }> = {}) {
  fake = createFakeSupabase(rows, {
    rpcHandlers: {
      training_create: () => ({ data: "a7000000-0000-4000-8000-0000000000e9" }),
      training_update: () => RPC_OK,
      training_record_delivery: () => RPC_OK,
      training_record_demonstration: () => RPC_OK,
      training_demonstrate_from_transcript: () => ({
        data: "f7000000-0000-4000-8000-0000000000e1",
      }),
      ...handlers,
    },
  });
  h.supabase.client = fake.client;
}

const rpcCalls = (fn: string) => fake.rpcs.filter((r) => r.fn === fn);
const proposalRow = () => fake.store["evidence_proposals"]![0]!;

beforeEach(() => {
  h.audit.audit.mockClear();
  h.flags.isFlagOn = async () => true;
});

describe("approving a training suggestion", () => {
  it("an audience change is written through the training update, with the version the suggestion was made against", async () => {
    const rows = rowsFor();
    rows["evidence_proposals"] = [proposal({})];
    use(rows);
    await applyProposal("p-1", {}, ACTOR);
    expect(rpcCalls("training_update")).toEqual([
      {
        fn: "training_update",
        args: {
          p_profile: ACTOR.profileId,
          p_id: NEED,
          p_expected: VERSION,
          p_fields: { audience: "Field crews" },
          p_reason: `From the call: ${QUOTE}`,
        },
      },
    ]);
    expect(proposalRow()).toMatchObject({
      status: "applied",
      applied_entity_type: "implementation_training",
      applied_entity_id: NEED,
    });
  });

  it("a responsibility the TIS approves is recorded as TIS-confirmed, never as SOW", async () => {
    const rows = rowsFor();
    rows["evidence_proposals"] = [
      proposal({ training_field: "responsibility", training_value: "customer" }),
    ];
    use(rows);
    await applyProposal("p-1", {}, ACTOR);
    expect(rpcCalls("training_update")[0]!.args["p_fields"]).toEqual({
      responsibility: "customer",
      responsibility_source: "tis_confirmed",
    });
  });

  it("delivery is recorded on the date the call gave", async () => {
    const rows = rowsFor();
    rows["evidence_proposals"] = [
      proposal({
        type: "training_delivered",
        training_field: null,
        training_value: null,
        training_date: "2026-11-03",
      }),
    ];
    use(rows);
    await applyProposal("p-1", {}, ACTOR);
    expect(rpcCalls("training_record_delivery")[0]!.args).toMatchObject({
      p_id: NEED,
      p_expected: VERSION,
      p_delivered_on: "2026-11-03",
    });
    expect(rpcCalls("training_demonstrate_from_transcript")).toEqual([]);
  });

  it("delivery with no date from the call takes the reviewer's date", async () => {
    const rows = rowsFor();
    rows["evidence_proposals"] = [
      proposal({
        type: "training_delivered",
        training_field: null,
        training_value: null,
        training_date: null,
      }),
    ];
    use(rows);
    await applyProposal("p-1", { trainingDate: "2026-11-02" }, ACTOR);
    expect(rpcCalls("training_record_delivery")[0]!.args["p_delivered_on"]).toBe("2026-11-02");
  });

  it("readiness shown creates its evidence from the quote, in the database, linked to this proposal", async () => {
    const rows = rowsFor();
    rows["evidence_proposals"] = [
      proposal({
        type: "training_demonstrated",
        training_field: null,
        training_value: "demonstrated",
      }),
    ];
    use(rows);
    await applyProposal("p-1", {}, ACTOR);
    expect(rpcCalls("training_demonstrate_from_transcript")[0]!.args).toEqual({
      p_profile: ACTOR.profileId,
      p_id: NEED,
      p_expected: VERSION,
      p_quote: QUOTE,
      p_proposal: "p-1",
      p_reason: `From the call: ${QUOTE}`,
    });
    expect(rpcCalls("training_record_demonstration")).toEqual([]);
  });

  it("practice still needed sets the status, with no evidence", async () => {
    const rows = rowsFor();
    rows["evidence_proposals"] = [
      proposal({
        type: "training_demonstrated",
        training_field: null,
        training_value: "practice_needed",
      }),
    ];
    use(rows);
    await applyProposal("p-1", {}, ACTOR);
    expect(rpcCalls("training_record_demonstration")[0]!.args).toMatchObject({
      p_status: "practice_needed",
      p_evidence: null,
    });
  });

  it("a follow-up writes the next step", async () => {
    const rows = rowsFor();
    rows["evidence_proposals"] = [
      proposal({
        type: "training_follow_up",
        training_field: null,
        training_value: "Second practice run next week",
      }),
    ];
    use(rows);
    await applyProposal("p-1", {}, ACTOR);
    expect(rpcCalls("training_update")[0]!.args["p_fields"]).toEqual({
      next_step: "Second practice run next week",
    });
  });

  it("a new training need is created with its topic and the call's words as the outcome", async () => {
    const rows = rowsFor();
    rows["evidence_proposals"] = [
      proposal({
        type: "training_add",
        title: "Dispatch basics",
        text: "Runs a dispatch alone",
        training_id: null,
        training_field: null,
        training_version: null,
      }),
    ];
    use(rows);
    await applyProposal("p-1", {}, ACTOR);
    expect(rpcCalls("training_create")[0]!.args).toMatchObject({
      p_profile: ACTOR.profileId,
      p_fields: { topic: "Dispatch basics", outcome: "Runs a dispatch alone" },
    });
    expect(proposalRow()).toMatchObject({
      status: "applied",
      applied_entity_type: "implementation_training",
    });
  });
});

describe("a suggestion that cannot be applied writes nothing", () => {
  it("a stale version is refused by the database, and the suggestion stays pending", async () => {
    const rows = rowsFor();
    rows["evidence_proposals"] = [proposal({})];
    use(rows, {
      training_update: () => ({
        error: {
          code: "P0409",
          message:
            "This changed while you were looking at it. Reload to see the latest, then make the change again.",
        },
      }),
    });
    await expect(applyProposal("p-1", {}, ACTOR)).rejects.toThrow(/changed while you were looking/);
    expect(proposalRow()).toMatchObject({ status: "pending", decided_by: null });
  });

  it("while the feature is off, nothing is written and the suggestion stays pending", async () => {
    h.flags.isFlagOn = async () => false;
    const rows = rowsFor();
    rows["evidence_proposals"] = [proposal({})];
    use(rows);
    await expect(applyProposal("p-1", {}, ACTOR)).rejects.toThrow(/not turned on/);
    expect(fake.rpcs).toEqual([]);
    expect(proposalRow()).toMatchObject({ status: "pending" });
  });

  it("no training suggestion touches the implementation row, its stage or a solution", async () => {
    const rows = rowsFor();
    rows["evidence_proposals"] = [
      proposal({
        type: "training_demonstrated",
        training_field: null,
        training_value: "demonstrated",
      }),
    ];
    use(rows);
    const before = JSON.stringify(fake.store["implementations"]);
    await applyProposal("p-1", {}, ACTOR);
    expect(JSON.stringify(fake.store["implementations"])).toBe(before);
    const fns = fake.rpcs.map((r) => r.fn);
    expect(fns.every((f) => f.startsWith("training_"))).toBe(true);
    expect(fns).not.toContain("solution_confirm_readiness");
    expect(fns).not.toContain("component_update");
  });
});

/* ------------------------------------------------ how a reading stores them */

const ctx = (over: Partial<TranscriptContext> = {}): TranscriptContext =>
  ({
    customerName: "Acme",
    implementationName: "Rollout",
    stageLabel: "Build",
    timeline: { closeDate: null, liveDate: null, firstForm: null },
    open: { risks: [], issues: [], decisions: [] },
    roster: [],
    owner: null,
    attachment: { title: "call.txt", uploadedAt: null },
    hasHandoff: false,
    handoffAnswered: false,
    trainingNeeds: [
      {
        id: NEED,
        topic: "Form basics",
        responsibility: null,
        delivered: false,
        readiness: "not_assessed",
        updatedAt: VERSION,
      },
    ],
    ...over,
  }) as TranscriptContext;

const raw = (over: Partial<TranscriptProposal>): TranscriptProposal =>
  ({
    type: "training_update",
    title: "Audience",
    text: "",
    confidence: "stated",
    quote: QUOTE,
    severity: null,
    likelihood: null,
    owner_team_member_id: null,
    owner_name: null,
    proposed_date: null,
    duplicate_of: null,
    intake_key: null,
    component_id: null,
    component_field: null,
    component_value: null,
    training_id: NEED,
    training_field: "audience",
    training_value: "Field crews",
    training_date: null,
    ...over,
  }) as TranscriptProposal;

const IDS = { implementationId: IMPL, evidenceId: null, attachmentId: "att-1", jobId: null };

describe("how a reading stores a training suggestion", () => {
  it("a suggestion that names a listed need keeps its need, field, value and the version it was read at", () => {
    const row = proposalRowFor(raw({}), ctx(), IDS);
    expect(row).toMatchObject({
      type: "training_update",
      training_id: NEED,
      training_field: "audience",
      training_value: "Field crews",
      training_version: VERSION,
    });
  });

  it("a suggestion with no quote is kept as a note, so its words are not lost", () => {
    const row = proposalRowFor(raw({ quote: null }), ctx(), IDS);
    expect(row).toMatchObject({ type: "note", training_id: null, training_version: null });
  });

  it("a suggestion that names a need not in the context is kept as a note", () => {
    const row = proposalRowFor(
      raw({ training_id: "a7000000-0000-4000-8000-0000000000ff" }),
      ctx(),
      IDS,
    );
    expect(row).toMatchObject({ type: "note", training_id: null });
  });

  it("while the feature is off, no training suggestion is kept, even a new need", () => {
    const off = ctx();
    delete off.trainingNeeds;
    expect(proposalRowFor(raw({}), off, IDS)).toMatchObject({ type: "note" });
    expect(
      proposalRowFor(raw({ type: "training_add", training_id: null, title: "New" }), off, IDS),
    ).toMatchObject({
      type: "note",
    });
  });

  it("a new need needs no listed id and carries no version", () => {
    const row = proposalRowFor(
      raw({ type: "training_add", training_id: null, title: "Dispatch" }),
      ctx(),
      IDS,
    );
    expect(row).toMatchObject({ type: "training_add", training_id: null, training_version: null });
  });
});
