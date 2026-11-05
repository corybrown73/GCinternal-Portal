import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The automatic journey sync, over the fake database. An AI-prepared brief moves
 * no stage. A kickoff booked or confirmed held is its own fact: each moves the
 * stage at most one gated step, and each completes only its own work item. A
 * gate that blocks a move is recorded, never forced with an override.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    milestones: [] as Array<{ key: string; doneOn: string | null }>,
    advanceStage: null as any,
    audit: null as any,
    setWorkItem: null as any,
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  state.advanceStage = { fn: async () => undefined as unknown };
  state.audit = { fn: async () => undefined as unknown };
  state.setWorkItem = { fn: async () => undefined as unknown };
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../hub.server", () => ({
  advanceStage: (...args: unknown[]) => (h.advanceStage.fn as any)(...args),
}));
vi.mock("../plan.server", () => ({
  setWorkItemStatus: (...args: unknown[]) => (h.setWorkItem.fn as any)(...args),
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

type Intake = { timeline?: Record<string, unknown> };

function rows(intake: Intake = {}, workItems: Array<Record<string, unknown>> = []): Rows {
  return {
    portal_accounts: [{ id: "deal-1", customer_id: "cust-1", intake }],
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
    work_items: workItems,
  };
}

const kickoffCall = {
  id: "w-call",
  implementation_id: "impl-1",
  task_key: "nl.kickoff_call",
  status: "not_started",
};
const kickoffScheduled = {
  id: "w-sched",
  implementation_id: "impl-1",
  task_key: "nl.kickoff_scheduled",
  status: "not_started",
};
const booked: Intake = {
  timeline: { overrides: { kickoff: "2026-11-10" }, times: { kickoff: "10:00" } },
};

let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  h.milestones = [];
  h.advanceStage.fn = async () => undefined;
  h.audit.fn = async () => undefined;
  h.setWorkItem.fn = async () => undefined;
});

describe("the automatic journey sync", () => {
  it("a complete AI brief moves no stage, even though it is on file", async () => {
    fake = createFakeSupabase({
      ...rows(),
      portal_briefs: [{ id: "brief-1", account_id: "deal-1", status: "complete" }],
    });
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

  it("a booked kickoff completes the scheduling item and nothing else", async () => {
    fake = createFakeSupabase(rows(booked, [kickoffScheduled, kickoffCall]));
    h.supabase.client = fake.client;
    const advance = vi.fn(async (_args: Record<string, unknown>) => undefined);
    const setItem = vi.fn(async (_args: Record<string, unknown>) => undefined);
    h.advanceStage.fn = advance;
    h.setWorkItem.fn = setItem;

    const result = await syncJourneyStage("deal-1", null);

    // Booked is not held: the call item is untouched, and no later stage moves.
    expect(setItem.mock.calls.map(([a]) => a)).toEqual([
      expect.objectContaining({ workItemId: "w-sched", status: "done" }),
    ]);
    expect(result?.steps).toEqual(["plan-internal"]);
    expect(advance).toHaveBeenCalledTimes(1);
    expect(advance.mock.calls[0]?.[0]).toMatchObject({ toStage: "plan-internal", automatic: true });
  });

  it("a kickoff confirmed held moves one stage, never several, with no override", async () => {
    fake = createFakeSupabase(rows(booked, [kickoffScheduled, kickoffCall]));
    h.supabase.client = fake.client;
    h.milestones = [{ key: "kickoff", doneOn: "2026-10-20" }];
    const advance = vi.fn(async (_args: Record<string, unknown>) => undefined);
    const setItem = vi.fn(async (_args: Record<string, unknown>) => undefined);
    h.advanceStage.fn = advance;
    h.setWorkItem.fn = setItem;

    const result = await syncJourneyStage("deal-1", null);

    expect(setItem.mock.calls.map(([a]) => a)).toEqual(
      expect.arrayContaining([expect.objectContaining({ workItemId: "w-call", status: "done" })]),
    );
    expect(result?.steps).toEqual(["plan-internal"]);
    expect(advance).toHaveBeenCalledTimes(1);
    const [sent] = advance.mock.calls[0] ?? [];
    expect(sent).not.toHaveProperty("override");
    expect(sent).toHaveProperty("automatic", true);
  });

  it("removing the kickoff confirmation returns only the call item to not started", async () => {
    fake = createFakeSupabase(
      rows(booked, [
        { ...kickoffCall, status: "done" },
        { ...kickoffScheduled, status: "done" },
      ]),
    );
    h.supabase.client = fake.client;
    const setItem = vi.fn(async (_args: Record<string, unknown>) => undefined);
    h.setWorkItem.fn = setItem;

    await syncJourneyStage("deal-1", null);

    const sent = setItem.mock.calls.map(([a]) => a);
    expect(sent).toEqual([
      expect.objectContaining({ workItemId: "w-call", status: "not_started" }),
    ]);
  });

  it("a skipped kickoff item is left alone", async () => {
    fake = createFakeSupabase(rows(booked, [{ ...kickoffScheduled, status: "skipped" }]));
    h.supabase.client = fake.client;
    const setItem = vi.fn(async (_args: Record<string, unknown>) => undefined);
    h.setWorkItem.fn = setItem;

    await syncJourneyStage("deal-1", null);

    expect(setItem).not.toHaveBeenCalled();
  });

  it("a gate that blocks the move is recorded once, not forced with an override", async () => {
    fake = createFakeSupabase(rows({}, [kickoffCall]));
    h.supabase.client = fake.client;
    h.milestones = [{ key: "kickoff", doneOn: "2026-10-20" }];
    const advance = vi.fn(async (_args: Record<string, unknown>) => {
      throw new Error("Waiting on: Schedule the kickoff call");
    });
    const audit = vi.fn(async (_row: Record<string, unknown>) => undefined);
    h.advanceStage.fn = advance;
    h.audit.fn = audit;

    const result = await syncJourneyStage("deal-1", null);

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
      expect.objectContaining({
        action: "journey.autosync_blocked",
        entity_id: "impl-1",
        payload: expect.objectContaining({ reason: "Waiting on: Schedule the kickoff call" }),
      }),
    );
  });
});
