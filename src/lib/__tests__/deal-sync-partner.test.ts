import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The automatic deal sync must never move a partner implementation's deal
 * through the standard stages. Its progress is the implementation's own record.
 * A standard implementation still goes through the existing sync, and a legacy
 * Field Fusion implementation (not a partner journey) is unaffected.
 */

const h = vi.hoisted(() => {
  const state = {
    account: { id: "d1", stage: "onboarding_kickoff" } as Record<string, unknown>,
    implementations: [] as Array<Record<string, unknown>>,
    transitions: [] as unknown[],
    flowCalls: 0,
  };
  type Query = {
    select: () => Query;
    eq: (col: string, val: unknown) => Query;
    is: () => Query;
    order: () => Query;
    limit: () => Query;
    maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
  };
  const builder = (table: string): Query => {
    let rows: Array<Record<string, unknown>> =
      table === "portal_accounts"
        ? [state.account]
        : table === "implementations"
          ? state.implementations
          : [];
    const api: Query = {
      select: () => api,
      eq: (col, val) => {
        rows = rows.filter((r) => r[col] === val);
        return api;
      },
      is: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    };
    return api;
  };
  return { state, supabase: { from: builder } };
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.supabase }));
// The standard checklist always wants to advance the deal. Without the partner
// guard, a partner deal would be moved; with it, it is not.
vi.mock("../stage-flow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../stage-flow")>();
  return {
    ...actual,
    stageFlow: () => ({ current: "kickoff", advanceTo: "get_it_working", stages: [] }),
  };
});
vi.mock("../server/accounts", () => ({
  transitionStage: vi.fn(async (...args: unknown[]) => {
    h.state.transitions.push(args);
    return { changed: true };
  }),
}));

const { dealHasPartnerJourney } = await import("../partner-implementation.server");
const { syncDealStage } = await import("../stage-flow.server");

beforeEach(() => {
  h.state.implementations = [];
  h.state.transitions = [];
  h.state.account = { id: "d1", stage: "onboarding_kickoff" };
});

describe("the deal's journey is read from its stored implementation", () => {
  it("a new partner implementation is a partner journey", async () => {
    h.state.implementations = [
      {
        deal_id: "d1",
        journey_type: "partner_implementation",
        partner_key: "field_fusion_iq",
        created_at: "2026-10-01",
      },
    ];
    expect(await dealHasPartnerJourney("d1")).toBe(true);
  });

  it("a standard implementation is not", async () => {
    h.state.implementations = [
      { deal_id: "d1", journey_type: "new_logo", partner_key: null, created_at: "2026-10-01" },
    ];
    expect(await dealHasPartnerJourney("d1")).toBe(false);
  });

  it("a legacy Field Fusion implementation is not a partner journey", async () => {
    h.state.implementations = [
      { deal_id: "d1", journey_type: "new_logo", partner_key: null, created_at: "2026-10-01" },
    ];
    expect(await dealHasPartnerJourney("d1")).toBe(false);
  });

  it("a deal with no implementation is not a partner journey", async () => {
    expect(await dealHasPartnerJourney("d1")).toBe(false);
  });
});

describe("syncDealStage: the standard path still moves a standard deal", () => {
  it("a standard deal the checklist would advance is moved, as before", async () => {
    h.state.implementations = [
      { deal_id: "d1", journey_type: "new_logo", partner_key: null, created_at: "2026-10-01" },
    ];
    const result = await syncDealStage("d1", null);
    expect(result).toEqual({ moved: "get_it_working" });
    expect(h.state.transitions).toHaveLength(1);
  });

  it("a legacy Field Fusion deal the checklist would advance is moved, as before", async () => {
    h.state.implementations = [
      { deal_id: "d1", journey_type: "new_logo", partner_key: null, created_at: "2026-10-01" },
    ];
    h.state.account = { id: "d1", stage: "onboarding_kickoff" };
    expect((await syncDealStage("d1", null)).moved).toBe("get_it_working");
  });
});

describe("syncDealStage never moves a partner deal", () => {
  it("a partner deal at onboarding_kickoff is left where it is, even when the standard checklist would move it", async () => {
    h.state.implementations = [
      {
        deal_id: "d1",
        journey_type: "partner_implementation",
        partner_key: "field_fusion_iq",
        created_at: "2026-10-01",
      },
    ];
    const result = await syncDealStage("d1", null);
    expect(result).toEqual({ moved: null });
    expect(h.state.transitions).toEqual([]);
  });
});
