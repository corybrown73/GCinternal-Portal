import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The automatic journey sync, over the fake database. An AI-prepared brief moves
 * no stage; a fact a person recorded moves the stage one gate-checked step at a
 * time; and a gate that blocks a move is recorded, never forced with an override.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    milestones: [] as Array<{ key: string; doneOn: string | null }>,
    advanceStage: null as any,
    audit: null as any,
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  state.advanceStage = { fn: async () => undefined as unknown };
  state.audit = { fn: async () => undefined as unknown };
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../hub.server", () => ({
  advanceStage: (...args: unknown[]) => (h.advanceStage.fn as any)(...args),
}));
vi.mock("../server/audit", () => ({
  audit: (...args: unknown[]) => (h.audit.fn as any)(...args),
}));
vi.mock("../activity.server", () => ({ teamMemberIdForProfile: async () => null }));
vi.mock("../lifecycle-stages.server", () => ({ loadLifecycleStages: async () => [] }));
vi.mock("../pipeline-stages.server", () => ({ loadPipelineStages: async () => [] }));
vi.mock("../onboarding-plan", () => ({
  closeDateFor: () => ({ date: null }),
  timelineFor: () => ({ milestones: h.milestones, liveDoneOn: null }),
}));

import { syncJourneyStage } from "../journey-sync.server";

function rows(overrides: Partial<Rows> = {}): Rows {
  return {
    portal_accounts: [{ id: "deal-1", customer_id: "cust-1", intake: {} }],
    implementations: [
      {
        id: "impl-1",
        deal_id: "deal-1",
        current_stage: "handoff",
        superseded_by_implementation_id: null,
        created_at: "2026-10-01T00:00:00Z",
      },
    ],
    portal_stage_transitions: [],
    ...overrides,
  };
}

let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  h.milestones = [];
  h.advanceStage.fn = async () => undefined;
  h.audit.fn = async () => undefined;
});

describe("the automatic journey sync", () => {
  it("a complete AI brief moves no stage, even though it is on file", async () => {
    fake = createFakeSupabase(
      rows({ portal_briefs: [{ id: "brief-1", account_id: "deal-1", status: "complete" }] }),
    );
    h.supabase.client = fake.client;
    const advance = vi.fn(async () => undefined);
    h.advanceStage.fn = advance;

    const result = await syncJourneyStage("deal-1", null);

    expect(result).toEqual({
      implementationId: "impl-1",
      from: "handoff",
      to: "handoff",
      steps: [],
    });
    expect(advance).not.toHaveBeenCalled();
  });

  it("a kickoff a person recorded moves the stage step by step, with no override", async () => {
    fake = createFakeSupabase(rows());
    h.supabase.client = fake.client;
    h.milestones = [{ key: "kickoff", doneOn: "2026-10-20" }];
    const advance = vi.fn(async (_args: Record<string, unknown>) => undefined);
    h.advanceStage.fn = advance;

    const result = await syncJourneyStage("deal-1", null);

    // The live lifecycle, in order: each step is a separate gate-checked move.
    expect(result?.steps).toEqual(["plan-internal", "align-external", "build"]);
    expect(advance).toHaveBeenCalledTimes(3);
    const sent = advance.mock.calls.map(([args]) => args);
    for (const args of sent) {
      expect(args).not.toHaveProperty("override");
      // The guard in advanceStage refuses any gate gap for an automatic move.
      expect(args).toHaveProperty("automatic", true);
    }
    expect(sent.map((args) => args["toStage"])).toEqual([
      "plan-internal",
      "align-external",
      "build",
    ]);
  });

  it("a gate that blocks the move is recorded, not forced with an override", async () => {
    fake = createFakeSupabase(rows());
    h.supabase.client = fake.client;
    h.milestones = [{ key: "kickoff", doneOn: "2026-10-20" }];
    const advance = vi.fn(async (_args: Record<string, unknown>) => {
      throw new Error("Open criteria: the stage cannot be left yet.");
    });
    const audit = vi.fn(async (_row: Record<string, unknown>) => undefined);
    h.advanceStage.fn = advance;
    h.audit.fn = audit;

    const result = await syncJourneyStage("deal-1", null);

    // One refused attempt, no retry with an override, and nothing moved.
    expect(advance).toHaveBeenCalledTimes(1);
    const [sent] = advance.mock.calls[0] ?? [];
    expect(sent).not.toHaveProperty("override");
    expect(result).toEqual({
      implementationId: "impl-1",
      from: "handoff",
      to: "handoff",
      steps: [],
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "journey.autosync_blocked", entity_id: "impl-1" }),
    );
  });
});
