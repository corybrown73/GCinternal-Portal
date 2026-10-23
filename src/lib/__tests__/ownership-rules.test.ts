import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The approved ownership rules, as the application enforces them (issue #83).
 *
 * SIMULATED. The database functions are scripted in the fake client, so these tests
 * check the application's half: who may call what, what is sent, and what is refused
 * before anything is sent. What the database itself does (its role check, its locks,
 * its history rows, the guard on owner changes, the append-only history) is proven
 * against PostgreSQL in supabase/tests/0087_ownership.sql and 0087_claim_deal.sql,
 * and under overlapping sessions in 0087_ownership_concurrency.sh.
 */

const h = vi.hoisted(() => {
  const state = {
    client: null as any,
    forward: null as any,
    emails: [] as Array<Record<string, unknown>>,
    audits: [] as Array<Record<string, unknown>>,
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../../integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));

vi.mock("@/lib/auth", () => ({
  canManage: (role: string | undefined) => ["admin", "super_admin", "manager"].includes(role ?? ""),
}));

vi.mock("@/lib/app-config.server", () => ({
  isFlagOn: async () => false,
  getV2Flags: async () => ({}),
  resetFlagCache: () => {},
}));
vi.mock("../app-config.server", () => ({
  isFlagOn: async () => false,
  getV2Flags: async () => ({}),
  resetFlagCache: () => {},
}));

vi.mock("../server/email", () => ({
  sendEmail: async (message: Record<string, unknown>) => {
    h.emails.push(message);
  },
}));

vi.mock("../server/audit", () => ({
  audit: async (entry: Record<string, unknown>) => {
    h.audits.push(entry);
  },
}));

vi.mock("../claimed-owner.server", () => ({
  loadActiveWorkload: async () => new Map<string, number>(),
}));

vi.mock("../welcome.server", () => ({
  issueWelcomeLinkUnlessOff: async () => null,
}));

import { assignDeal, removeTeamMember } from "../assignment.server";
import { changeImplementationOwner } from "../owner-change.server";
import { setImplementationOwner, updateImplementation, updateRecordField } from "../hub.server";
import { toImplementationUpdatePatch, updateImplementationInput } from "../implementation-input";

const DEAL = "22222222-2222-4222-8222-222222222222";
const CUSTOMER = "44444444-4444-4444-8444-444444444444";
const IMPL = "33333333-3333-4333-8333-333333333333";
const TM_ADA = "77777777-7777-4777-8777-777777777771";
const TM_BEN = "77777777-7777-4777-8777-777777777772";
const TM_CY = "77777777-7777-4777-8777-777777777773";

const PROFILE = {
  admin: "11111111-1111-4111-8111-000000000001",
  super_admin: "11111111-1111-4111-8111-000000000002",
  manager: "11111111-1111-4111-8111-000000000003",
  sales: "11111111-1111-4111-8111-000000000004",
  am: "11111111-1111-4111-8111-000000000005",
  se: "11111111-1111-4111-8111-000000000006",
  tam_se: "11111111-1111-4111-8111-000000000007",
  implementation: "11111111-1111-4111-8111-000000000008",
  onboarding: "11111111-1111-4111-8111-000000000009",
  customer: "11111111-1111-4111-8111-00000000000a",
};

const CLAIM = {
  mode: "claim",
  window_days: 90,
  base_points: 1,
  service_points: 1,
  arr_bands: [],
  seat_bands: [],
  integration_points: {},
};

const baseRows = (): Rows => ({
  portal_app_config: [{ key: "assignment_rules", value: CLAIM }],
  team_members: [
    { id: TM_ADA, name: "Ada", email: "ada@gocanvas.com", role: "am", active: true },
    { id: TM_BEN, name: "Ben", email: "ben@gocanvas.com", role: "se", active: true },
    { id: TM_CY, name: "Cy", email: "cy@gocanvas.com", role: "se", active: true },
  ],
  portal_assignment_pool: [
    { team_member_id: TM_ADA, active: true, capacity: 1 },
    { team_member_id: TM_BEN, active: true, capacity: 1 },
    { team_member_id: TM_CY, active: true, capacity: 1 },
  ],
  portal_profiles: Object.entries(PROFILE).map(([role, id]) => ({
    id,
    email: `${role}@gocanvas.com`,
    full_name: role,
    role,
  })),
  portal_accounts: [
    {
      id: DEAL,
      name: "Acme",
      customer_id: CUSTOMER,
      arr: 10000,
      intake: {},
      am_owner_id: null,
      stage: "closed_won",
      welcome_share_url: null,
    },
  ],
  implementations: [
    {
      id: IMPL,
      name: "Acme implementation",
      deal_id: DEAL,
      customer_id: CUSTOMER,
      owner_id: TM_BEN,
      superseded_by_implementation_id: null,
      created_at: "2026-10-01T00:00:00Z",
    },
  ],
  portal_assignments: [],
});

let fake: ReturnType<typeof createFakeSupabase>;

const implRow = () => fake.store["implementations"]!.find((r) => r["id"] === IMPL)!;

/** A complete save from the implementation form, with nothing filled in beyond the name. */
const formSave = (extra: Record<string, unknown>) => ({
  id: IMPL,
  name: "Renamed",
  status: "on_track",
  salesOwner: null,
  tier: null,
  healthRecorded: null,
  healthRecordedReason: null,
  sowReference: null,
  sowDocumentUrl: null,
  sowDocumentName: null,
  sowValue: null,
  sowSignedDate: null,
  contractStartDate: null,
  targetLaunchDate: null,
  actualLaunchDate: null,
  customerGoals: null,
  ...extra,
});
const callsTo = (fn: string) => fake.rpcs.filter((c) => c.fn === fn).map((c) => c.args);

beforeEach(() => {
  fake = createFakeSupabase(baseRows());
  h.client = fake.client;
  h.emails.length = 0;
  h.audits.length = 0;
  // The database's answer when the change is allowed: the owner it set.
  fake.handlers["portal_set_implementation_owner"] = (args) => ({
    data: { changed: true, previous_owner_id: TM_BEN, new_owner_id: args["p_new_owner"] },
    error: null,
  });
  fake.handlers["portal_record_assignment"] = () => ({
    data: { assigned: true, implementation_id: IMPL, ledger_id: "ledger-1" },
    error: null,
  });
  fake.handlers["portal_deactivate_team_member"] = () => ({ data: { name: "Cy" }, error: null });
});

describe("who may deliberately assign, reassign or clear an owner", () => {
  it.each(["admin", "super_admin", "manager"] as const)(
    "lets the %s role change an owner",
    async (role) => {
      await setImplementationOwner({
        implementationId: IMPL,
        ownerId: TM_ADA,
        actorProfileId: PROFILE[role],
        reason: "Reassigned",
      });
      expect(callsTo("portal_set_implementation_owner")).toEqual([
        expect.objectContaining({
          p_implementation: IMPL,
          p_new_owner: TM_ADA,
          p_actor_profile: PROFILE[role],
          p_reason: "Reassigned",
        }),
      ]);
    },
  );

  it.each(["sales", "am", "se", "tam_se", "implementation", "onboarding", "customer"] as const)(
    "refuses the %s role before anything is sent",
    async (role) => {
      await expect(
        setImplementationOwner({
          implementationId: IMPL,
          ownerId: TM_ADA,
          actorProfileId: PROFILE[role],
        }),
      ).rejects.toThrow(/Forbidden: only an admin, super admin or manager/);
      expect(callsTo("portal_set_implementation_owner")).toEqual([]);
      expect(h.audits).toEqual([]);
    },
  );

  it("refuses a change with no signed-in person", async () => {
    await expect(
      setImplementationOwner({ implementationId: IMPL, ownerId: TM_ADA, actorProfileId: "" }),
    ).rejects.toThrow(/Forbidden/);
    expect(callsTo("portal_set_implementation_owner")).toEqual([]);
  });

  it("clears an owner by sending no new owner, and records no assignee", async () => {
    const result = await setImplementationOwner({
      implementationId: IMPL,
      ownerId: null,
      actorProfileId: PROFILE.manager,
    });
    expect(callsTo("portal_set_implementation_owner")).toEqual([
      expect.objectContaining({ p_new_owner: null }),
    ]);
    expect(result).toEqual(expect.objectContaining({ changed: true, newOwnerId: null }));
  });

  it("reports the database's refusal in plain words, and does not change the owner", async () => {
    fake.handlers["portal_set_implementation_owner"] = () => ({
      data: null,
      error: {
        message: "forbidden: only an admin, super admin or manager may change an account owner",
      },
    });
    await expect(
      changeImplementationOwner({
        implementationId: IMPL,
        ownerId: TM_ADA,
        actorProfileId: PROFILE.manager,
        reason: null,
      }),
    ).rejects.toThrow(/^Forbidden: only an admin/);
    expect(implRow()["owner_id"]).toBe(TM_BEN);
  });
});

describe("a stale view never reassigns an account", () => {
  it("asks the database to refuse when the owner is no longer the one the person saw", async () => {
    await setImplementationOwner({
      implementationId: IMPL,
      ownerId: TM_CY,
      actorProfileId: PROFILE.manager,
      expectedOwnerId: null,
    });
    expect(callsTo("portal_set_implementation_owner")).toEqual([
      expect.objectContaining({ p_check_expected: true, p_expected_owner: null }),
    ]);
  });

  it("shows the reload message the database gives when the owner has moved", async () => {
    fake.handlers["portal_set_implementation_owner"] = () => ({
      data: null,
      error: {
        message:
          "owner_changed: the owner was changed by someone else while you were editing. Reload to see who owns it.",
      },
    });
    await expect(
      setImplementationOwner({
        implementationId: IMPL,
        ownerId: TM_CY,
        actorProfileId: PROFILE.manager,
        expectedOwnerId: null,
      }),
    ).rejects.toThrow(/Reload to see who owns it/);
  });
});

describe("an ordinary save never changes the owner", () => {
  it("drops an owner sent with the form, so a form loaded before a claim cannot undo it", () => {
    const parsed = updateImplementationInput.parse(formSave({ ownerId: null }));
    expect(parsed).not.toHaveProperty("ownerId");
    expect(toImplementationUpdatePatch(parsed)).not.toHaveProperty("owner_id");
  });

  it("saves the other details and leaves the owner the database holds", async () => {
    // The form was opened when Ben owned it, and Ada was assigned while it was open.
    implRow()["owner_id"] = TM_ADA;
    const parsed = updateImplementationInput.parse(formSave({ ownerId: TM_BEN }));
    await updateImplementation(IMPL, toImplementationUpdatePatch(parsed), {
      actorProfileId: PROFILE.se,
    });
    expect(implRow()["name"]).toBe("Renamed");
    expect(implRow()["owner_id"]).toBe(TM_ADA);
    expect(callsTo("portal_set_implementation_owner")).toEqual([]);
  });

  it("refuses any caller that tries to put an owner into a plain save", async () => {
    await expect(
      updateImplementation(
        IMPL,
        { name: "x", owner_id: TM_CY },
        { actorProfileId: PROFILE.manager },
      ),
    ).rejects.toThrow(/owner function, never a plain save/);
    expect(implRow()["owner_id"]).toBe(TM_BEN);
  });
});

describe("the customer page's owner field follows the same rule", () => {
  it("refuses a sales user, and changes nothing", async () => {
    await expect(
      updateRecordField({
        implementationId: IMPL,
        field: "owner_id",
        value: TM_ADA,
        actorProfileId: PROFILE.sales,
      }),
    ).rejects.toThrow(/Forbidden/);
    expect(callsTo("portal_set_implementation_owner")).toEqual([]);
    expect(implRow()["owner_id"]).toBe(TM_BEN);
  });

  it("refuses a change with no signed-in person", async () => {
    await expect(
      updateRecordField({
        implementationId: IMPL,
        field: "owner_id",
        value: TM_ADA,
        actorProfileId: null,
      }),
    ).rejects.toThrow(/Forbidden/);
  });

  it("lets a manager reassign, through the owner function, with the reason the page gives", async () => {
    await updateRecordField({
      implementationId: IMPL,
      field: "owner_id",
      value: TM_ADA,
      actorProfileId: PROFILE.manager,
    });
    expect(callsTo("portal_set_implementation_owner")).toEqual([
      expect.objectContaining({
        p_new_owner: TM_ADA,
        p_reason: "Changed on the customer page",
        p_check_expected: false,
      }),
    ]);
  });
});

describe("assignments by a person, a rule and an integration", () => {
  it("refuses a sales user who names an owner, before anything is written", async () => {
    await expect(
      assignDeal({ dealId: DEAL, teamMemberId: TM_ADA, actorProfileId: PROFILE.sales }),
    ).rejects.toThrow(/Only an admin, super admin or manager can choose/);
    expect(callsTo("portal_record_assignment")).toEqual([]);
    expect(h.audits).toEqual([]);
  });

  it("lets a manager name an owner, as a manager's assignment", async () => {
    await assignDeal({ dealId: DEAL, teamMemberId: TM_ADA, actorProfileId: PROFILE.manager });
    expect(callsTo("portal_record_assignment")).toEqual([
      expect.objectContaining({
        p_team_member: TM_ADA,
        p_actor_profile: PROFILE.manager,
        p_mode: "manager",
        p_actor_kind: "user",
      }),
    ]);
  });

  it("assigns by rule, for an unowned account only, when a person is not naming one", async () => {
    fake.store["portal_app_config"] = [
      { key: "assignment_rules", value: { ...CLAIM, mode: "auto" } },
    ];
    await assignDeal({ dealId: DEAL, actorProfileId: PROFILE.sales });
    expect(callsTo("portal_record_assignment")).toEqual([
      expect.objectContaining({ p_mode: "unowned_only", p_actor_kind: "user" }),
    ]);
  });

  it("lets Salesforce name an owner only for an unowned account, and says it is an integration", async () => {
    await assignDeal({
      dealId: DEAL,
      teamMemberId: TM_ADA,
      actorProfileId: null,
      actorKind: "integration",
    });
    expect(callsTo("portal_record_assignment")).toEqual([
      expect.objectContaining({
        p_team_member: TM_ADA,
        p_actor_profile: null,
        p_mode: "unowned_only",
        p_actor_kind: "integration",
      }),
    ]);
  });

  it("announces nothing and returns nothing when the account already has an owner", async () => {
    fake.handlers["portal_record_assignment"] = () => ({
      data: { assigned: false, implementation_id: IMPL, current_owner_id: TM_BEN },
      error: null,
    });
    const result = await assignDeal({
      dealId: DEAL,
      teamMemberId: TM_ADA,
      actorProfileId: null,
      actorKind: "integration",
    });
    expect(result).toBeNull();
    expect(h.audits).toEqual([]);
    expect(h.emails).toEqual([]);
    expect(implRow()["owner_id"]).toBe(TM_BEN);
  });
});

describe("removing a team member is decided by the database", () => {
  it("passes the signed-in manager, and records the removal", async () => {
    const result = await removeTeamMember(TM_CY, PROFILE.manager);
    expect(callsTo("portal_deactivate_team_member")).toEqual([
      { p_team_member: TM_CY, p_actor_profile: PROFILE.manager },
    ]);
    expect(result).toEqual({ removed: true, name: "Cy" });
    expect(h.audits).toEqual([
      expect.objectContaining({ action: "team.member_removed", actor_id: PROFILE.manager }),
    ]);
  });

  it("reports a refusal from the database, and records no removal", async () => {
    fake.handlers["portal_deactivate_team_member"] = () => ({
      data: null,
      error: { message: "Cy still owns 1 account. Reassign them first, then remove." },
    });
    await expect(removeTeamMember(TM_CY, PROFILE.manager)).rejects.toThrow(/still owns 1 account/);
    expect(h.audits).toEqual([]);
  });
});
