import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * Who may change a post-sale implementation, checked on the server before any
 * write. The database holds the rule (post_sale_may_manage, implementation_set_owner,
 * portal_guard_team_lead); these tests prove the server asks it, refuses in plain
 * words, fails closed, and passes the database's own refusals through unchanged.
 * The SQL probes prove the rule itself.
 */

const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    flags: { isFlagOn: async () => false, getV2Flags: async () => ({}), resetFlagCache: () => {} },
    audit: { audit: vi.fn(async () => {}) },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("@/lib/app-config.server", () => h.flags);
vi.mock("../app-config.server", () => h.flags);
vi.mock("../server/audit", () => h.audit);

import {
  assertCanManagePostSale,
  canManagePostSale,
  POST_SALE_REFUSAL,
  reassignImplementationOwner,
  setTeamLead,
} from "../post-sale-access.server";
import {
  createRequirement,
  updateImplementation,
  updateRisk,
  updateSuccessCriterion,
  graduatePartner,
} from "../hub.server";

const ORG = "00000000-0000-4000-8000-000000000001";
const IMPL = "d0000000-0000-4000-8000-0000000000f1";
const OTHER_IMPL = "d0000000-0000-4000-8000-0000000000f2";
const ACTOR = "a0000000-0000-4000-8000-0000000000f1";
const TM_OLD = "70000000-0000-4000-8000-0000000000f1";
const TM_NEW = "70000000-0000-4000-8000-0000000000f2";
const RISK_ON_OTHER = "90000000-0000-4000-8000-0000000000f2";
const CRITERION_ON_OTHER = "91000000-0000-4000-8000-0000000000f2";

let fake: ReturnType<typeof createFakeSupabase>;
let rpcResult: Record<string, { data?: unknown; error?: unknown }> = {};

function rows(): Rows {
  return {
    implementations: [
      { id: IMPL, org_id: ORG, name: "Rollout", current_stage: "build", owner_id: TM_OLD },
      { id: OTHER_IMPL, org_id: ORG, name: "Other", current_stage: "build", owner_id: TM_NEW },
    ],
    risks: [
      { id: RISK_ON_OTHER, org_id: ORG, implementation_id: OTHER_IMPL, title: "Existing risk" },
    ],
    success_criteria: [
      {
        id: CRITERION_ON_OTHER,
        org_id: ORG,
        implementation_id: OTHER_IMPL,
        description: "Dispatch within 2 hours",
        status: "pending",
      },
    ],
    requirements: [],
    portal_profiles: [
      { id: ACTOR, full_name: "Sam", email: "sam@gocanvas.test", role: "implementation" },
    ],
    portal_assignments: [],
    implementation_owner_changes: [],
  };
}

/** Scripts the database's answer for each RPC the test cares about; others succeed. */
function load(initial: Rows = rows(), answers: typeof rpcResult = {}) {
  rpcResult = answers;
  const handlers: Record<string, (args: Record<string, any>) => { data?: any; error?: any }> = {};
  for (const name of ["post_sale_may_manage", "implementation_set_owner"]) {
    handlers[name] = () => {
      const a = rpcResult[name] ?? { data: null };
      return { data: a.data ?? null, error: a.error ?? null } as any;
    };
  }
  fake = createFakeSupabase(initial, { rpcHandlers: handlers });
  h.supabase.client = fake.client;
}

beforeEach(() => {
  h.audit.audit.mockClear();
});

const calls = (fn: string) => fake.rpcs.filter((r) => r.fn === fn);

describe("the server asks the database, and refuses in plain words", () => {
  it("allows the change when the database says the person may make it", async () => {
    load(rows(), { post_sale_may_manage: { data: true } });
    expect(await canManagePostSale(ACTOR, IMPL)).toBe(true);
    expect(calls("post_sale_may_manage")[0]!.args).toEqual({
      p_profile: ACTOR,
      p_implementation: IMPL,
    });
  });

  it("refuses with the plain sentence when the database says the person may not", async () => {
    load(rows(), { post_sale_may_manage: { data: false } });
    await expect(assertCanManagePostSale(ACTOR, IMPL)).rejects.toThrow(POST_SALE_REFUSAL);
    expect(POST_SALE_REFUSAL).toMatch(/A Team Lead, a manager or an admin/);
  });

  it("fails closed when the check itself cannot be made, and says nothing was changed", async () => {
    load(rows(), { post_sale_may_manage: { error: { code: "08006", message: "down" } } });
    await expect(assertCanManagePostSale(ACTOR, IMPL)).rejects.toThrow(
      "Could not check your access to this implementation. Nothing has been changed.",
    );
  });
});

describe("delivery writes are checked before anything is written", () => {
  it("refuses a new requirement for an implementation the person may not change, and writes nothing", async () => {
    load(rows(), { post_sale_may_manage: { data: false } });
    await expect(
      createRequirement(IMPL, { title: "Sandbox access" }, { actorProfileId: ACTOR }),
    ).rejects.toThrow(POST_SALE_REFUSAL);
    expect(fake.store["requirements"]).toEqual([]);
  });

  it("allows the same new requirement when the database says yes", async () => {
    load(rows(), { post_sale_may_manage: { data: true } });
    await createRequirement(IMPL, { title: "Sandbox access" }, { actorProfileId: ACTOR });
    expect(fake.store["requirements"]!.map((r) => r["title"])).toEqual(["Sandbox access"]);
  });

  it("checks an edit against the implementation the record belongs to, not the id the caller sent", async () => {
    load(rows(), { post_sale_may_manage: { data: false } });
    await expect(
      updateRisk(RISK_ON_OTHER, { title: "Changed" }, { actorProfileId: ACTOR }),
    ).rejects.toThrow(POST_SALE_REFUSAL);
    expect(calls("post_sale_may_manage")[0]!.args["p_implementation"]).toBe(OTHER_IMPL);
    expect(fake.store["risks"]![0]!["title"]).toBe("Existing risk");
  });

  it("checks a success criterion against the implementation it belongs to, however the request names it", async () => {
    load(rows(), { post_sale_may_manage: { data: false } });
    await expect(
      updateSuccessCriterion(CRITERION_ON_OTHER, { description: "Changed" } as any, ACTOR),
    ).rejects.toThrow(POST_SALE_REFUSAL);
    expect(calls("post_sale_may_manage")[0]!.args["p_implementation"]).toBe(OTHER_IMPL);
    expect(fake.store["success_criteria"]![0]!["description"]).toBe("Dispatch within 2 hours");
  });

  it("refuses a Technical Solutions or other-TIS edit with the same plain sentence (the database decides)", async () => {
    load(rows(), { post_sale_may_manage: { data: false } });
    await expect(
      updateImplementation(IMPL, { name: "Renamed" }, { actorProfileId: ACTOR }),
    ).rejects.toThrow(POST_SALE_REFUSAL);
    expect(fake.store["implementations"]![0]!["name"]).toBe("Rollout");
  });
});

describe("graduation and handover are post-sale decisions", () => {
  it("refuses graduation for someone who may not change the implementation, before reading it", async () => {
    load(rows(), { post_sale_may_manage: { data: false } });
    await expect(
      graduatePartner({ implementationId: IMPL, actorTeamMember: null, actorProfileId: ACTOR }),
    ).rejects.toThrow(POST_SALE_REFUSAL);
    expect(calls("post_sale_may_manage")).toHaveLength(1);
  });
});

describe("owner changes go through the reassignment, which the database records", () => {
  it("sends an owner change from a person to the reassignment function, not to the row", async () => {
    load(rows(), {
      post_sale_may_manage: { data: true },
      implementation_set_owner: { data: null },
    });
    await updateImplementation(
      IMPL,
      { name: "Renamed", owner_id: TM_NEW },
      { actorProfileId: ACTOR, ownerChange: { reasonCode: "workload", reason: null } },
    );
    expect(calls("implementation_set_owner")[0]!.args).toEqual({
      p_profile: ACTOR,
      p_implementation: IMPL,
      p_team_member: TM_NEW,
      p_reason_code: "workload",
      p_reason: null,
    });
    // The rest of the edit is written; the owner is not written by this path.
    expect(fake.store["implementations"]![0]!["name"]).toBe("Renamed");
    expect(fake.store["implementations"]![0]!["owner_id"]).toBe(TM_OLD);
  });

  it("refuses a manual owner change with no reason, before anything is sent", async () => {
    load(rows(), {
      post_sale_may_manage: { data: true },
      implementation_set_owner: { data: null },
    });
    await expect(
      updateImplementation(IMPL, { name: "Renamed", owner_id: TM_NEW }, { actorProfileId: ACTOR }),
    ).rejects.toThrow("Choose why the implementation is being reassigned.");
    expect(calls("implementation_set_owner")).toEqual([]);
    expect(fake.store["implementations"]![0]!["name"]).toBe("Rollout");
    expect(fake.store["implementations"]![0]!["owner_id"]).toBe(TM_OLD);
  });

  it("refuses a reason code that is not one of the five, and Other with no words", async () => {
    load(rows(), { implementation_set_owner: { data: null } });
    await expect(
      reassignImplementationOwner(
        {
          implementationId: IMPL,
          teamMemberId: TM_NEW,
          reasonCode: "bored" as never,
          reason: null,
        },
        ACTOR,
      ),
    ).rejects.toThrow();
    await expect(
      reassignImplementationOwner(
        { implementationId: IMPL, teamMemberId: TM_NEW, reasonCode: "other", reason: "  " },
        ACTOR,
      ),
    ).rejects.toThrow("Say why, in a few words, when the reason is Other.");
    expect(calls("implementation_set_owner")).toEqual([]);
  });

  it("does not reassign when the owner is unchanged", async () => {
    load(rows(), { post_sale_may_manage: { data: true } });
    await updateImplementation(
      IMPL,
      { name: "Renamed", owner_id: TM_OLD },
      { actorProfileId: ACTOR },
    );
    expect(calls("implementation_set_owner")).toEqual([]);
  });

  it("lets the system change an owner with no reason, as it always has", async () => {
    load(rows(), { post_sale_may_manage: { data: false } });
    // No actor: an automatic path (the Closed Won start, the Salesforce sync). It is not refused
    // for want of a reason, and the database records it as a system change.
    await updateImplementation(IMPL, { owner_id: TM_NEW });
    expect(fake.store["implementations"]![0]!["owner_id"]).toBe(TM_NEW);
    expect(calls("implementation_set_owner")).toEqual([]);
  });

  it("refuses an assigned TIS reassigning their own implementation, and passes the database's sentence through", async () => {
    load(rows(), {
      implementation_set_owner: {
        error: {
          code: "42501",
          message: "Only a Team Lead, a manager or an admin can reassign an implementation",
        },
      },
    });
    await expect(
      reassignImplementationOwner(
        { implementationId: IMPL, teamMemberId: TM_NEW, reasonCode: "workload", reason: null },
        ACTOR,
      ),
    ).rejects.toThrow("Only a Team Lead, a manager or an admin can reassign an implementation");
    expect(h.audit.audit).not.toHaveBeenCalled();
  });

  it("records a successful reassignment with who made it", async () => {
    load(rows(), { implementation_set_owner: { data: null } });
    await reassignImplementationOwner(
      {
        implementationId: IMPL,
        teamMemberId: TM_NEW,
        reasonCode: "tis_leave",
        reason: "Cover while on leave",
      },
      ACTOR,
    );
    expect(calls("implementation_set_owner")[0]!.args).toMatchObject({
      p_profile: ACTOR,
      p_team_member: TM_NEW,
      p_reason_code: "tis_leave",
      p_reason: "Cover while on leave",
    });
    expect(h.audit.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "implementation.owner_reassigned", entity_id: IMPL }),
    );
  });

  it("says nothing was changed for an unexpected failure", async () => {
    load(rows(), { implementation_set_owner: { error: { code: "08006", message: "down" } } });
    await expect(
      reassignImplementationOwner(
        { implementationId: IMPL, teamMemberId: TM_NEW, reasonCode: "workload", reason: null },
        ACTOR,
      ),
    ).rejects.toThrow("Could not reassign the implementation. Nothing has been changed.");
  });
});

describe("Team Lead authority is granted only through the caller's own session", () => {
  const PROFILE = "a0000000-0000-4000-8000-0000000000f9";

  function sessionWith(update: unknown, after: unknown) {
    return {
      from: () => ({
        update: () => ({ eq: async () => update }),
        select: () => ({ eq: () => ({ maybeSingle: async () => after }) }),
      }),
    };
  }

  it("grants Team Lead and confirms it by reading it back", async () => {
    load(rows());
    const result = await setTeamLead(
      sessionWith({ error: null }, { data: { team_lead: true }, error: null }),
      PROFILE,
      true,
    );
    expect(result).toEqual({ ok: true });
  });

  it("shows the database's refusal of a grant by someone who is not an admin, unchanged", async () => {
    load(rows());
    await expect(
      setTeamLead(
        sessionWith(
          {
            error: {
              code: "42501",
              message: "Only an admin or super admin can grant or remove Team Lead authority",
            },
          },
          null,
        ),
        PROFILE,
        true,
      ),
    ).rejects.toThrow("Only an admin or super admin can grant or remove Team Lead authority");
  });

  it("refuses a self-grant with the database's sentence, so nobody grants themselves authority", async () => {
    load(rows());
    await expect(
      setTeamLead(
        sessionWith(
          { error: { code: "42501", message: "Nobody can change their own Team Lead authority" } },
          null,
        ),
        PROFILE,
        true,
      ),
    ).rejects.toThrow("Nobody can change their own Team Lead authority");
  });

  it("says so when the change did not take effect (row-level security can match no rows)", async () => {
    load(rows());
    await expect(
      setTeamLead(sessionWith({ error: null }, { data: null, error: null }), PROFILE, true),
    ).rejects.toThrow("Could not confirm the Team Lead change");
    await expect(
      setTeamLead(
        sessionWith({ error: null }, { data: { team_lead: false }, error: null }),
        PROFILE,
        true,
      ),
    ).rejects.toThrow("The Team Lead change did not take effect. Nothing has been changed.");
  });
});
