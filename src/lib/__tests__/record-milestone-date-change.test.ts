import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * recordMilestoneDateChange() (0078) is the one write path that can move a
 * milestone's date AND leave a required, non-empty, append-only reason —
 * in one atomic database call. These tests are mostly about what it
 * REFUSES (a blank reason, writing anything when the atomic call fails) and
 * about what it hands the database function to record (the previous and
 * new dates, which cascaded, whether the old date was already overdue) —
 * the database function's own constraints (0078's migration) are the ones
 * actually enforcing atomicity and append-only history; see
 * supabase/tests/0078_milestone_date_history.sql for those.
 */

type AccountRow = { id: string; intake: any };
type Cascade = { milestoneKey: string; previousDate: string; newDate: string; wasOverdue: boolean };
type RpcParams = {
  p_account: string;
  p_milestone_key: string;
  p_previous_date: string;
  p_new_date: string;
  p_reason: string;
  p_actor: string | null;
  p_was_overdue: boolean;
  p_cascades: Cascade[];
};

const PROFILE_ID = "11111111-1111-1111-1111-111111111111";
const DEAL_ID = "22222222-2222-2222-2222-222222222222";

const h = vi.hoisted(() => {
  const state = {
    account: null as AccountRow | null,
    rpcCalls: [] as Array<{ name: string; params: RpcParams }>,
    rpcError: null as { message: string } | null,
    audits: [] as Array<Record<string, unknown>>,
    db: null as any,
  };

  state.db = {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          if (table === "portal_profiles") {
            return {
              data: { id: PROFILE_ID, role: "sales", email: "p@gocanvas.com" },
              error: null,
            };
          }
          if (table === "portal_accounts") {
            return { data: state.account, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return builder;
    },
    rpc: async (name: string, params: RpcParams) => {
      state.rpcCalls.push({ name, params });
      if (state.rpcError) return { data: null, error: state.rpcError };
      // Emulates 0078's atomic write: the override lands in the stored
      // intake exactly as the real function would land it.
      const account = state.account!;
      const timeline = account.intake.timeline ?? {};
      account.intake = {
        ...account.intake,
        timeline: {
          ...timeline,
          overrides: { ...timeline.overrides, [params.p_milestone_key]: params.p_new_date },
        },
      };
      return { data: `change-${state.rpcCalls.length}`, error: null };
    },
  };
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.db }));
vi.mock("../../integrations/supabase/client.server", () => ({ supabaseAdmin: h.db }));
vi.mock("../server/audit", () => ({
  audit: async (entry: Record<string, unknown>) => {
    h.audits.push(entry);
  },
}));
vi.mock("../app-config.server", () => ({ isFlagOn: async () => false }));

import { recordMilestoneDateChange } from "../presale.server";
import { todayIn } from "../onboarding-timeline";
import { wasOverdueAsOf } from "../milestone-history";

const CLOSE_DATE = "2026-09-09"; // Wednesday — matches onboarding-timeline.test.ts's fixtures

function freshIntake() {
  return {
    path: "new_logo",
    timeline: { close_date: CLOSE_DATE, overrides: {}, times: {}, completed: {} },
  };
}

beforeEach(() => {
  h.account = { id: DEAL_ID, intake: freshIntake() };
  h.rpcCalls = [];
  h.rpcError = null;
  h.audits = [];
});

describe("recordMilestoneDateChange", () => {
  it("records the first change: the previous effective date, the new date, and who made it", async () => {
    await recordMilestoneDateChange(
      PROFILE_ID,
      DEAL_ID,
      "kickoff",
      "2026-09-15",
      "customer asked to delay",
    );
    expect(h.rpcCalls).toHaveLength(1);
    const params = h.rpcCalls[0]!.params;
    expect(h.rpcCalls[0]!.name).toBe("portal_record_milestone_date_change");
    expect(params.p_milestone_key).toBe("kickoff");
    expect(params.p_previous_date).toBe("2026-09-11"); // the plan's own kickoff date, 2 bd after close
    expect(params.p_new_date).toBe("2026-09-15");
    expect(params.p_reason).toBe("customer asked to delay");
    expect(params.p_actor).toBe(PROFILE_ID);
    // Whatever day the suite runs on — computed the same way the function
    // itself computes it, not hardcoded against today's date.
    expect(params.p_was_overdue).toBe(wasOverdueAsOf("2026-09-11", todayIn(null)));
  });

  it("passes the cascaded later milestones separately, distinct from the one directly moved", async () => {
    await recordMilestoneDateChange(PROFILE_ID, DEAL_ID, "kickoff", "2026-09-15", "pushed a week");
    const cascades = h.rpcCalls[0]!.params.p_cascades;
    expect(cascades.length).toBeGreaterThan(0);
    expect(cascades.map((c) => c.milestoneKey)).not.toContain("kickoff");
    expect(cascades.map((c) => c.milestoneKey)).toContain("working");
    for (const c of cascades) expect(c.previousDate).not.toBe(c.newDate);
  });

  it("refuses a blank reason before making the atomic call at all", async () => {
    await expect(
      recordMilestoneDateChange(PROFILE_ID, DEAL_ID, "kickoff", "2026-09-15", "   "),
    ).rejects.toThrow(/reason/i);
    expect(h.rpcCalls).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
  });

  it("marks a change overdue at the time it was made, from the date that was in effect, not the new one", async () => {
    // "today" is read from the real clock inside todayIn(); to pin this
    // test regardless of when it runs, move the planned kickoff date itself
    // into the past relative to a close date far enough back.
    h.account!.intake = {
      path: "new_logo",
      timeline: { close_date: "2020-01-01", overrides: {}, times: {}, completed: {} },
    };
    await recordMilestoneDateChange(
      PROFILE_ID,
      DEAL_ID,
      "kickoff",
      "2020-01-10",
      "very late change",
    );
    expect(h.rpcCalls[0]!.params.p_was_overdue).toBe(true);
  });

  it("repeated changes: each call's previous date is the last call's new date — append-only, not a replace", async () => {
    await recordMilestoneDateChange(PROFILE_ID, DEAL_ID, "kickoff", "2026-09-15", "first move");
    await recordMilestoneDateChange(PROFILE_ID, DEAL_ID, "kickoff", "2026-09-22", "second move");
    expect(h.rpcCalls).toHaveLength(2);
    expect(h.rpcCalls[0]!.params.p_previous_date).toBe("2026-09-11");
    expect(h.rpcCalls[0]!.params.p_new_date).toBe("2026-09-15");
    // The second call reads the account fresh — it sees the first call's
    // own write, not a stale in-memory value.
    expect(h.rpcCalls[1]!.params.p_previous_date).toBe("2026-09-15");
    expect(h.rpcCalls[1]!.params.p_new_date).toBe("2026-09-22");
  });

  it("is a no-op that writes nothing when the given date is already the one in effect", async () => {
    const result = await recordMilestoneDateChange(
      PROFILE_ID,
      DEAL_ID,
      "kickoff",
      "2026-09-11", // the plan's own kickoff date — nothing to record
      "reaffirming, nothing actually changed",
    );
    expect(result).toBeNull();
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("refuses an unknown milestone key rather than silently recording nothing useful", async () => {
    await expect(
      recordMilestoneDateChange(PROFILE_ID, DEAL_ID, "not_a_real_key", "2026-09-15", "reason"),
    ).rejects.toThrow(/unknown milestone/i);
    expect(h.rpcCalls).toHaveLength(0);
  });

  it("write failure: when the atomic call fails, the error surfaces and nothing downstream runs as if it had succeeded", async () => {
    h.rpcError = { message: "constraint violation" };
    await expect(
      recordMilestoneDateChange(PROFILE_ID, DEAL_ID, "kickoff", "2026-09-15", "a reason"),
    ).rejects.toThrow(/constraint violation/);
    // The override must not appear to have moved...
    expect(h.account!.intake.timeline.overrides.kickoff).toBeUndefined();
    // ...and no audit entry is written for a change that never landed.
    expect(h.audits).toHaveLength(0);
  });
});
