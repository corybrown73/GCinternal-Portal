import { beforeEach, describe, expect, it, vi } from "vitest";

/* Partner implementations keep the dates they were recorded with. The standard
 * plan's target sync must never calculate or write one for them (#76).
 *
 * The database is a small in-memory stand-in that records every write, so each
 * test can say exactly what was changed and what was left alone. Every value is
 * disposable test data. */

const PROFILE_ID = "11111111-1111-1111-1111-111111111111";
const DEAL_ID = "22222222-2222-2222-2222-222222222222";
const CUSTOMER_ID = "44444444-4444-4444-4444-444444444444";
const IMPL_ID = "33333333-3333-3333-3333-333333333333";
const RECORDED = "2026-12-15";

const h = vi.hoisted(() => {
  type Row = any;
  type Write = { table: string; op: "insert" | "update"; row: Row; filter?: [string, unknown] };
  const state = {
    tables: {} as Record<string, Row[]>,
    writes: [] as Write[],
    audits: [] as Row[],
    rpcCalls: [] as Array<{ name: string; params: Row }>,
    implError: null as { message: string } | null,
    nextId: 1,
  };

  const rowsOf = (table: string): Row[] => state.tables[table] ?? [];

  function from(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    const matching = () => rowsOf(table).filter((r) => filters.every((f) => f(r)));
    const readError = () => (table === "implementations" ? state.implError : null);
    const builder: Record<string, any> = {
      select: () => builder,
      eq: (col: string, v: unknown) => {
        filters.push((r) => r[col] === v);
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: matching()[0] ?? null, error: readError() }),
      insert: (row: Row) => {
        const stored = { id: `new-${state.nextId++}`, ...row };
        state.tables[table] = [...rowsOf(table), stored];
        state.writes.push({ table, op: "insert", row: stored });
        const done = Promise.resolve({ data: stored, error: null });
        return Object.assign(done, {
          select: () => ({
            single: async () => ({ data: stored, error: null }),
            maybeSingle: async () => ({ data: stored, error: null }),
          }),
        });
      },
      update: (patch: Row) => ({
        eq: async (col: string, v: unknown) => {
          const target = rowsOf(table).filter((r) => r[col] === v);
          for (const r of target) Object.assign(r, patch);
          state.writes.push({ table, op: "update", row: patch, filter: [col, v] });
          return { error: null };
        },
      }),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: matching(), error: readError() }).then(resolve, reject),
    };
    return builder;
  }

  const rpc = async (name: string, params: Row) => {
    state.rpcCalls.push({ name, params });
    // Emulates the atomic write: the override lands in the stored intake.
    const account = rowsOf("portal_accounts")[0]!;
    const timeline = account.intake.timeline ?? {};
    account.intake = {
      ...account.intake,
      timeline: {
        ...timeline,
        overrides: { ...timeline.overrides, [params["p_milestone_key"]]: params["p_new_date"] },
      },
    };
    return { data: `change-${state.rpcCalls.length}`, error: null };
  };

  return { state, db: { from, rpc } };
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.db }));
vi.mock("../../integrations/supabase/client.server", () => ({ supabaseAdmin: h.db }));
vi.mock("../server/audit", () => ({
  audit: async (entry: Record<string, unknown>) => {
    h.state.audits.push(entry);
  },
}));
vi.mock("../app-config.server", () => ({ isFlagOn: async () => false }));
vi.mock("../journey-sync.server", () => ({ syncJourneyStage: async () => {} }));

import { recordMilestoneDateChange, saveDealIntake, syncTargetLaunch } from "../presale.server";

const { state } = h;

function freshIntake() {
  return {
    path: "new_logo",
    timeline: { close_date: "2026-09-09", overrides: {}, times: {}, completed: {} },
  };
}

function implRow(over: Record<string, unknown> = {}) {
  return {
    id: IMPL_ID,
    deal_id: DEAL_ID,
    customer_id: CUSTOMER_ID,
    created_at: "2026-09-01T00:00:00Z",
    journey_type: null,
    partner_key: null,
    target_date: null,
    target_launch_date: null,
    baseline_date: null,
    baseline_locked_at: null,
    ...over,
  };
}

function seed(impl: Record<string, unknown>) {
  state.tables = {
    portal_profiles: [{ id: PROFILE_ID, role: "sales", email: "p@gocanvas.com" }],
    portal_accounts: [{ id: DEAL_ID, customer_id: CUSTOMER_ID, intake: freshIntake() }],
    implementations: [implRow(impl)],
    target_date_changes: [],
    portal_stage_transitions: [],
  };
  state.writes = [];
  state.audits = [];
  state.rpcCalls = [];
  state.implError = null;
}

const impl = () => state.tables["implementations"]![0]!;
const writesTo = (table: string) => state.writes.filter((w) => w.table === table);
const targetWrites = () => writesTo("implementations").filter((w) => "target_date" in w.row);

const PARTNER_BY_JOURNEY = {
  journey_type: "partner_implementation",
  target_date: RECORDED,
  target_launch_date: RECORDED,
};
const PARTNER_BY_KEY = {
  partner_key: "field_fusion_iq",
  target_date: RECORDED,
  target_launch_date: RECORDED,
};

beforeEach(() => {
  seed({});
});

describe("syncTargetLaunch: standard implementations", () => {
  it("writes the standard plan end to both target dates", async () => {
    const error = await syncTargetLaunch(DEAL_ID, PROFILE_ID);
    expect(error).toBeNull();
    const target = impl().target_date;
    expect(target).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(impl().target_launch_date).toBe(target);
    expect(targetWrites()).toHaveLength(1);
  });

  it("moves an existing standard target when the plan end changes", async () => {
    seed({ target_date: "2020-01-01", target_launch_date: "2020-01-01" });
    await syncTargetLaunch(DEAL_ID, PROFILE_ID);
    expect(impl().target_date).not.toBe("2020-01-01");
    expect(impl().target_launch_date).toBe(impl().target_date);
  });

  it("does nothing when the standard plan end already matches", async () => {
    await syncTargetLaunch(DEAL_ID, PROFILE_ID);
    const settled = impl().target_date;
    state.writes = [];
    await syncTargetLaunch(DEAL_ID, PROFILE_ID);
    expect(impl().target_date).toBe(settled);
    expect(targetWrites()).toHaveLength(0);
  });
});

describe("syncTargetLaunch: partner implementations are protected", () => {
  it("protects a partner identified by journey_type, and leaves its dates alone", async () => {
    seed(PARTNER_BY_JOURNEY);
    const error = await syncTargetLaunch(DEAL_ID, PROFILE_ID);
    expect(error).toBeNull();
    expect(impl().target_date).toBe(RECORDED);
    expect(impl().target_launch_date).toBe(RECORDED);
    expect(writesTo("implementations")).toHaveLength(0);
  });

  it("protects a partner identified by partner_key, and leaves its dates alone", async () => {
    seed(PARTNER_BY_KEY);
    const error = await syncTargetLaunch(DEAL_ID, PROFILE_ID);
    expect(error).toBeNull();
    expect(impl().target_date).toBe(RECORDED);
    expect(impl().target_launch_date).toBe(RECORDED);
    expect(writesTo("implementations")).toHaveLength(0);
  });

  it("writes no target_date_changes row for a partner, even after a baseline is locked", async () => {
    seed({
      ...PARTNER_BY_JOURNEY,
      baseline_locked_at: "2026-09-02T00:00:00Z",
      baseline_date: RECORDED,
    });
    await syncTargetLaunch(DEAL_ID, PROFILE_ID);
    expect(writesTo("target_date_changes")).toHaveLength(0);
    expect(impl().baseline_date).toBe(RECORDED);
  });

  it("does not calculate a standard-plan date for a partner: the intake is never read into one", async () => {
    seed({ ...PARTNER_BY_KEY, target_date: null, target_launch_date: null });
    await syncTargetLaunch(DEAL_ID, PROFILE_ID);
    expect(impl().target_date).toBeNull();
    expect(impl().target_launch_date).toBeNull();
    expect(targetWrites()).toHaveLength(0);
  });
});

describe("saving an intake timeline", () => {
  const timelinePatch = {
    timeline: { close_date: "2026-10-01", overrides: {}, times: {}, completed: {} },
  };

  it("still moves a standard implementation's target when the timeline is saved", async () => {
    seed({ target_date: "2020-01-01", target_launch_date: "2020-01-01" });
    await saveDealIntake(PROFILE_ID, DEAL_ID, timelinePatch);
    expect(impl().target_date).not.toBe("2020-01-01");
    expect(impl().target_launch_date).toBe(impl().target_date);
  });

  it("does not overwrite a partner's recorded dates when the timeline is saved", async () => {
    seed(PARTNER_BY_JOURNEY);
    await saveDealIntake(PROFILE_ID, DEAL_ID, timelinePatch);
    expect(impl().target_date).toBe(RECORDED);
    expect(impl().target_launch_date).toBe(RECORDED);
    expect(targetWrites()).toHaveLength(0);
  });

  it("does not overwrite a partner identified by partner_key when the timeline is saved", async () => {
    seed(PARTNER_BY_KEY);
    await saveDealIntake(PROFILE_ID, DEAL_ID, timelinePatch);
    expect(impl().target_date).toBe(RECORDED);
    expect(impl().target_launch_date).toBe(RECORDED);
    expect(targetWrites()).toHaveLength(0);
  });
});

describe("changing a plan milestone date", () => {
  it("still moves a standard implementation's target when a milestone moves", async () => {
    seed({ target_date: "2020-01-01", target_launch_date: "2020-01-01" });
    await recordMilestoneDateChange(PROFILE_ID, DEAL_ID, "kickoff", "2026-09-15", "customer asked");
    expect(state.rpcCalls).toHaveLength(1);
    expect(impl().target_date).not.toBe("2020-01-01");
    expect(impl().target_launch_date).toBe(impl().target_date);
  });

  it("records the change but does not overwrite a partner's recorded dates", async () => {
    seed(PARTNER_BY_JOURNEY);
    await recordMilestoneDateChange(PROFILE_ID, DEAL_ID, "kickoff", "2026-09-15", "customer asked");
    expect(state.rpcCalls).toHaveLength(1);
    expect(impl().target_date).toBe(RECORDED);
    expect(impl().target_launch_date).toBe(RECORDED);
    expect(targetWrites()).toHaveLength(0);
  });
});

describe("missing or incomplete data never falls back to the standard plan", () => {
  it("writes nothing when the implementation row cannot be read, and says so", async () => {
    state.implError = { message: "connection reset" };
    const error = await syncTargetLaunch(DEAL_ID, PROFILE_ID);
    expect(error).toContain("connection reset");
    expect(writesTo("implementations")).toHaveLength(0);
  });

  it("writes nothing when the deal has no implementation to write to", async () => {
    state.tables["implementations"] = [];
    const error = await syncTargetLaunch(DEAL_ID, PROFILE_ID);
    expect(error).toBeNull();
    expect(writesTo("implementations")).toHaveLength(0);
  });

  it("protects a partner whose journey_type is set but whose partner_key is missing", async () => {
    seed({ journey_type: "partner_implementation", partner_key: null, target_date: null });
    await syncTargetLaunch(DEAL_ID, PROFILE_ID);
    expect(impl().target_date).toBeNull();
    expect(targetWrites()).toHaveLength(0);
  });

  it("protects a partner whose partner_key is set but whose journey_type is missing", async () => {
    seed({ journey_type: null, partner_key: "field_fusion_iq", target_date: null });
    await syncTargetLaunch(DEAL_ID, PROFILE_ID);
    expect(impl().target_date).toBeNull();
    expect(targetWrites()).toHaveLength(0);
  });

  it("protects a partner with no dates recorded yet, rather than filling them from the standard plan", async () => {
    seed({ journey_type: "partner_implementation", partner_key: "field_fusion_iq" });
    await saveDealIntake(PROFILE_ID, DEAL_ID, {
      timeline: { close_date: "2026-10-01", overrides: {}, times: {}, completed: {} },
    });
    expect(impl().target_date).toBeNull();
    expect(impl().target_launch_date).toBeNull();
    expect(targetWrites()).toHaveLength(0);
  });
});
