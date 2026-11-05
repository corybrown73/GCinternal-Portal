import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The deal-stage mirror, over the fake database. Before kickoff a deal may take
 * the implementation one gated stage on, and no further. After kickoff a deal
 * stage never moves the implementation: not backwards, not forward through
 * uncompleted stages, and never into graduation.
 */
const h = vi.hoisted(() => {
  const state = { supabase: { client: null as any }, forward: null as any };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../server/audit", () => ({ audit: async () => undefined }));
vi.mock("../server/events", () => ({ recordStageChange: async () => undefined }));
vi.mock("../activity.server", () => ({ teamMemberIdForProfile: async () => null }));
vi.mock("../lifecycle-stages.server", () => ({ loadLifecycleStages: async () => [] }));

import { mirrorJourneyToDeal } from "../journey-for-deal.server";

type Impl = {
  id: string;
  current_stage: string;
  journey_type?: string | null;
  partner_key?: string | null;
};

function rows(impl: Impl, gate: Array<{ status: string }> = [], gateMode = "blocking"): Rows {
  const stageRow = {
    id: "st-1",
    implementation_id: impl.id,
    stage_key: impl.current_stage,
    gate_mode: gateMode,
  };
  return {
    implementations: [
      {
        deal_id: "deal-1",
        superseded_by_implementation_id: null,
        created_at: "2026-10-01T00:00:00Z",
        journey_type: null,
        partner_key: null,
        ...impl,
      },
    ],
    stage_instances: [stageRow],
    work_items: gate.map((g, i) => ({
      id: `w${i}`,
      implementation_id: impl.id,
      stage_instance_id: "st-1",
      task_key: `t${i}`,
      title: `Criterion ${i}`,
      status: g.status,
      is_gate: true,
      party: "internal",
    })),
    implementation_stage_history: [],
  };
}

let fake: ReturnType<typeof createFakeSupabase>;

function moved(): Array<{ table: string; row: any }> {
  return fake.inserts.filter((i) => i.table === "implementation_stage_history");
}

function currentStage(): string {
  return fake.store["implementations"]![0]!["current_stage"];
}

beforeEach(() => {
  fake = undefined as any;
});

async function run(
  impl: Impl,
  dealStage: any,
  gate: Array<{ status: string }> = [],
  gateMode = "blocking",
) {
  fake = createFakeSupabase(rows(impl, gate, gateMode));
  h.supabase.client = fake.client;
  return mirrorJourneyToDeal("deal-1", dealStage, null);
}

describe("a deal-stage change cannot move an active implementation backwards", () => {
  it("closed won does not pull a journey at Build back to Handoff", async () => {
    const result = await run({ id: "impl-1", current_stage: "build" }, "closed_won");
    expect(result).toBeNull();
    expect(currentStage()).toBe("build");
    expect(moved()).toHaveLength(0);
  });

  it("make it yours does not pull a journey at Launch back to Validate", async () => {
    const result = await run({ id: "impl-1", current_stage: "launch" }, "make_it_yours");
    expect(result).toBeNull();
    expect(currentStage()).toBe("launch");
    expect(moved()).toHaveLength(0);
  });
});

describe("a deal-stage change cannot push an active implementation forward", () => {
  it("onboarding complete does not graduate a journey still in validation", async () => {
    const result = await run(
      { id: "impl-1", current_stage: "validate-iterate" },
      "onboarding_complete",
    );
    expect(result).toBeNull();
    expect(currentStage()).toBe("validate-iterate");
    expect(moved()).toHaveLength(0);
  });

  it("onboarding complete does not skip Launch from Validate to Graduate", async () => {
    const result = await run({ id: "impl-1", current_stage: "launch" }, "onboarding_complete");
    expect(result).toBeNull();
    expect(currentStage()).toBe("launch");
    expect(moved()).toHaveLength(0);
  });
});

describe("before kickoff, the deal's synchronisation still works", () => {
  it("moves a Handoff journey one stage on when its handoff gate is complete", async () => {
    const complete = [{ status: "done" }, { status: "done" }, { status: "done" }];
    const result = await run(
      { id: "impl-1", current_stage: "handoff" },
      "get_it_working",
      complete,
    );
    expect(result).toEqual({ implementationId: "impl-1", from: "handoff", to: "plan-internal" });
    expect(currentStage()).toBe("plan-internal");
    expect(moved().map((i) => i.row.stage)).toEqual(["plan-internal"]);
  });

  it("holds a Handoff journey while its handoff gate is open", async () => {
    const open = [{ status: "done" }, { status: "not_started" }];
    const result = await run({ id: "impl-1", current_stage: "handoff" }, "get_it_working", open);
    expect(result).toBeNull();
    expect(currentStage()).toBe("handoff");
    expect(moved()).toHaveLength(0);
  });

  it("holds a Handoff journey whose handoff stage has no criteria, rather than moving on empty", async () => {
    const result = await run({ id: "impl-1", current_stage: "handoff" }, "get_it_working", []);
    expect(result).toBeNull();
    expect(currentStage()).toBe("handoff");
  });

  it("never skips a stage on the deal's say-so, even with the gate complete", async () => {
    const complete = [{ status: "done" }];
    const result = await run({ id: "impl-1", current_stage: "handoff" }, "make_it_yours", complete);
    expect(result).toBeNull();
    expect(currentStage()).toBe("handoff");
    expect(moved()).toHaveLength(0);
  });

  it("does nothing when the deal's stage already matches the journey", async () => {
    const result = await run({ id: "impl-1", current_stage: "handoff" }, "closed_won");
    expect(result).toBeNull();
    expect(moved()).toHaveLength(0);
  });
});

describe("partner implementations keep their own path", () => {
  it("the deal never moves a partner implementation", async () => {
    const result = await run(
      { id: "impl-1", current_stage: "handoff", journey_type: "partner_implementation" },
      "get_it_working",
      [{ status: "done" }],
    );
    expect(result).toBeNull();
    expect(currentStage()).toBe("handoff");
    expect(moved()).toHaveLength(0);
  });
});
