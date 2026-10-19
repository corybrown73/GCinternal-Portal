import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * Issue #83, Part 2. Taking an unowned account for yourself is allowed only when
 * the saved assignment rules are in claim mode. The caller must be in the active
 * pool, the deal must have a project, and that project must have no owner. Every
 * refusal writes nothing. A manager's assignment is unaffected.
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

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (d: unknown) => unknown = (d) => d;
    const chain: any = {
      middleware: () => chain,
      inputValidator: (v: (d: unknown) => unknown) => {
        validate = v;
        return chain;
      },
      handler: (fn: (a: any) => unknown) => async (input: { data: unknown; context?: unknown }) =>
        fn({ data: validate(input.data), context: input.context }),
    };
    return chain;
  },
}));

vi.mock("@/integrations/supabase/internal-middleware", () => ({
  requireInternalAuth: {},
  requireManager: {},
  requireDealEditor: {},
}));

vi.mock("@/lib/auth", () => ({
  canManage: (role: string) => ["admin", "super_admin", "manager"].includes(role),
}));

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../../integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));

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

import { claimDeal, assignDeal, dealAssignment } from "../assignment.server";
import { assignDealFn, claimDealFn } from "../assignment.functions";

const DEAL = "22222222-2222-4222-8222-222222222222";
const CUSTOMER = "44444444-4444-4444-8444-444444444444";
const IMPL = "33333333-3333-4333-8333-333333333333";
const TM_ADA = "77777777-7777-4777-8777-777777777771";
const TM_BEN = "77777777-7777-4777-8777-777777777772";
const TM_CY = "77777777-7777-4777-8777-777777777773";
const TM_LEFT = "77777777-7777-4777-8777-777777777774";
const USER_ADA = "11111111-1111-4111-8111-111111111111";
const USER_BEN = "11111111-1111-4111-8111-111111111112";
const USER_CY = "11111111-1111-4111-8111-111111111113";
const USER_LEFT = "11111111-1111-4111-8111-111111111114";
const USER_NOEMAIL = "11111111-1111-4111-8111-111111111115";
const MANAGER = "11111111-1111-4111-8111-111111111116";

const CLAIM = {
  mode: "claim",
  window_days: 90,
  base_points: 1,
  service_points: 1,
  arr_bands: [],
  seat_bands: [],
  integration_points: {},
};
const AUTO = { ...CLAIM, mode: "auto" };

const baseRows = (): Rows => ({
  portal_app_config: [{ key: "assignment_rules", value: CLAIM }],
  team_members: [
    { id: TM_ADA, name: "Ada", email: "ada@gocanvas.com", role: "am", active: true },
    { id: TM_BEN, name: "Ben", email: "ben@gocanvas.com", role: "se", active: true },
    { id: TM_CY, name: "Cy", email: "cy@gocanvas.com", role: "se", active: true },
    { id: TM_LEFT, name: "Left", email: "left@gocanvas.com", role: "se", active: false },
  ],
  portal_assignment_pool: [
    { team_member_id: TM_ADA, active: true, capacity: 1 },
    { team_member_id: TM_BEN, active: true, capacity: 1 },
    { team_member_id: TM_LEFT, active: true, capacity: 1 },
  ],
  portal_profiles: [
    { id: USER_ADA, email: "ada@gocanvas.com", full_name: "Ada" },
    { id: USER_BEN, email: "ben@gocanvas.com", full_name: "Ben" },
    { id: USER_CY, email: "cy@gocanvas.com", full_name: "Cy" },
    { id: USER_LEFT, email: "left@gocanvas.com", full_name: "Left" },
    { id: USER_NOEMAIL, email: null, full_name: "No Email" },
    { id: MANAGER, email: "manager@gocanvas.com", full_name: "Manager" },
  ],
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
      deal_id: DEAL,
      customer_id: CUSTOMER,
      owner_id: null,
      superseded_by_implementation_id: null,
      created_at: "2026-10-01T00:00:00Z",
    },
  ],
  portal_assignments: [],
});

let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  fake = createFakeSupabase(baseRows());
  h.client = fake.client;
  h.emails.length = 0;
  h.audits.length = 0;
});

const implRow = () => fake.store["implementations"]!.find((r) => r["id"] === IMPL)!;
const ledger = () => fake.store["portal_assignments"] ?? [];
// The fake creates an empty table the first time a read touches it. Only rows count.
const snapshot = () =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(fake.store).filter(([, rows]) => !(Array.isArray(rows) && rows.length === 0)),
    ),
  );

/** A refusal: the message, and nothing written, emailed or audited. */
async function expectRefusedWithoutWrites(run: () => Promise<unknown>, message: RegExp) {
  const before = snapshot();
  await expect(run()).rejects.toThrow(message);
  expect(snapshot()).toBe(before);
  expect(h.emails).toEqual([]);
  expect(h.audits).toEqual([]);
}

function setRules(value: unknown) {
  fake.store["portal_app_config"] = [{ key: "assignment_rules", value }];
}

describe("claiming is allowed when the rules are in claim mode and the person is eligible", () => {
  it("takes an unowned project for an eligible employee, with a ledger row, an audit entry and an email", async () => {
    await claimDeal(USER_ADA, DEAL);
    expect(implRow()["owner_id"]).toBe(TM_ADA);
    expect(ledger()).toEqual([
      expect.objectContaining({
        deal_id: DEAL,
        implementation_id: IMPL,
        team_member_id: TM_ADA,
        source: "manual",
        note: "Claimed by Ada",
        actor_profile_id: USER_ADA,
      }),
    ]);
    expect(h.audits).toEqual([
      expect.objectContaining({ action: "implementation.assigned", actor_id: USER_ADA }),
    ]);
    expect(h.emails).toHaveLength(1);
  });

  it("is reported as claimable to the people who can see the Claim button", async () => {
    const a = await dealAssignment(DEAL);
    expect(a.mode).toBe("claim");
    expect(a.claimable).toBe(true);
    expect(a.owner).toBeNull();
  });
});

describe("claiming is refused in manager-assignment mode", () => {
  it("refuses an eligible employee when the rules are in auto mode, and writes nothing", async () => {
    setRules(AUTO);
    await expectRefusedWithoutWrites(() => claimDeal(USER_ADA, DEAL), /assigned by a manager/);
    expect(implRow()["owner_id"]).toBeNull();
  });

  it("is not claimable in the interface when the rules are in auto mode", async () => {
    setRules(AUTO);
    const a = await dealAssignment(DEAL);
    expect(a.mode).toBe("auto");
    expect(a.claimable).toBe(false);
  });
});

describe("missing or invalid assignment configuration refuses claiming, with a reason", () => {
  it("refuses when no rules have been saved, and says so", async () => {
    fake.store["portal_app_config"] = [];
    await expectRefusedWithoutWrites(
      () => claimDeal(USER_ADA, DEAL),
      /No assignment rules are saved/,
    );
    expect((await dealAssignment(DEAL)).claimable).toBe(false);
  });

  it.each([
    ["an upper-case mode", { ...CLAIM, mode: "Claim" }],
    ["a missing mode", { window_days: 90 }],
    ["a string instead of an object", "claim"],
    ["an empty value", {}],
  ])("refuses a stored value with %s, and says the rules are not valid", async (_label, value) => {
    setRules(value);
    await expectRefusedWithoutWrites(() => claimDeal(USER_ADA, DEAL), /not valid/);
    expect((await dealAssignment(DEAL)).claimable).toBe(false);
  });
});

describe("the person must be eligible for the pool", () => {
  it("refuses an internal user who is not in the pool", async () => {
    await expectRefusedWithoutWrites(() => claimDeal(USER_CY, DEAL), /not in the assignment pool/);
  });

  it("refuses a pool member whose team membership has been deactivated", async () => {
    await expectRefusedWithoutWrites(
      () => claimDeal(USER_LEFT, DEAL),
      /not in the assignment pool/,
    );
  });

  it("refuses a profile with no email, which cannot be matched to the pool", async () => {
    await expectRefusedWithoutWrites(
      () => claimDeal(USER_NOEMAIL, DEAL),
      /No profile for this sign-in/,
    );
  });

  it("refuses an unknown profile", async () => {
    await expectRefusedWithoutWrites(
      () => claimDeal("11111111-1111-4111-8111-1111111111ff", DEAL),
      /No profile for this sign-in/,
    );
  });
});

describe("a deal that is already owned, or has no project, cannot be claimed", () => {
  it("refuses when the project already has an owner, and names them", async () => {
    fake.store["implementations"]![0]!["owner_id"] = TM_BEN;
    await expectRefusedWithoutWrites(
      () => claimDeal(USER_ADA, DEAL),
      /Ben already owns this account/,
    );
    expect(implRow()["owner_id"]).toBe(TM_BEN);
    expect(ledger()).toEqual([]);
  });

  it("refuses a deal with no project, because a project is where ownership is held", async () => {
    fake.store["implementations"] = [];
    await expectRefusedWithoutWrites(() => claimDeal(USER_ADA, DEAL), /no project yet/);
    expect((await dealAssignment(DEAL)).claimable).toBe(false);
  });
});

describe("concurrent claims of the same deal", () => {
  it("lets exactly one of two eligible employees take the account", async () => {
    const results = await Promise.allSettled([
      claimDeal(USER_ADA, DEAL),
      claimDeal(USER_BEN, DEAL),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0]!.reason.message)).toMatch(/already owns|just taken/);
    expect(ledger()).toHaveLength(1);
    expect(implRow()["owner_id"]).toBe(ledger()[0]!["team_member_id"]);
  });

  it("does not let a claim overwrite a manager's assignment that lands first", async () => {
    const orig = fake.client.from;
    let managerWrote = false;
    fake.client.from = (table: string) => {
      const builder = orig(table);
      if (table !== "implementations") return builder;
      return new Proxy(builder, {
        get(target, prop) {
          if (prop === "update" && !managerWrote) {
            managerWrote = true;
            // A manager assigns the project between the claim's check and its write.
            fake.store["implementations"]![0]!["owner_id"] = TM_BEN;
          }
          const v = Reflect.get(target, prop, target);
          return typeof v === "function" ? v.bind(target) : v;
        },
      });
    };
    await expect(claimDeal(USER_ADA, DEAL)).rejects.toThrow(/already owns|just taken/);
    expect(implRow()["owner_id"]).toBe(TM_BEN);
    expect(ledger()).toEqual([]);
  });

  it("is refused when the project cannot be written to, and says nothing was taken", async () => {
    const orig = fake.client.from;
    fake.client.from = (table: string) => {
      const builder = orig(table);
      if (table !== "implementations") return builder;
      return new Proxy(builder, {
        get(target, prop) {
          if (prop === "update") {
            const chain: any = {
              eq: () => chain,
              is: () => chain,
              select: async () => ({ data: null, error: { message: "write refused" } }),
            };
            return () => chain;
          }
          const v = Reflect.get(target, prop, target);
          return typeof v === "function" ? v.bind(target) : v;
        },
      });
    };
    await expectRefusedWithoutWrites(
      () => claimDeal(USER_ADA, DEAL),
      /Could not take the account: write refused/,
    );
  });
});

describe("the server function enforces the rules even when called directly", () => {
  const callClaim = (data: Record<string, unknown>, email = "ada@gocanvas.com", id = USER_ADA) =>
    claimDealFn({ data, context: { profile: { id, email, role: "am" } } } as never);

  it("refuses a direct call in auto mode, even from an eligible employee", async () => {
    setRules(AUTO);
    await expectRefusedWithoutWrites(() => callClaim({ dealId: DEAL }), /assigned by a manager/);
  });

  it("allows a direct call in claim mode, and ignores a team member named in the body", async () => {
    await callClaim({ dealId: DEAL, teamMemberId: TM_BEN, owner_id: TM_BEN, claimable: true });
    expect(implRow()["owner_id"]).toBe(TM_ADA);
  });

  it("refuses a direct call from a profile that is not in the pool", async () => {
    await expectRefusedWithoutWrites(
      () => callClaim({ dealId: DEAL }, "cy@gocanvas.com", USER_CY),
      /not in the assignment pool/,
    );
  });

  it("refuses a direct call with no usable deal id, before anything is read", async () => {
    await expect(callClaim({ dealId: "not-an-id" })).rejects.toThrow();
  });
});

describe("the manager's assignment workflow is unaffected", () => {
  const assignAs = (data: Record<string, unknown>, role = "manager") =>
    assignDealFn({
      data,
      context: { profile: { id: MANAGER, email: "manager@gocanvas.com", role } },
    } as never);

  it.each([
    ["claim", CLAIM],
    ["auto", AUTO],
  ])("lets a manager assign a named person by hand in %s mode", async (_label, rules) => {
    setRules(rules);
    await assignAs({ dealId: DEAL, teamMemberId: TM_BEN });
    expect(implRow()["owner_id"]).toBe(TM_BEN);
    expect(ledger()).toEqual([
      expect.objectContaining({
        team_member_id: TM_BEN,
        source: "manual",
        actor_profile_id: MANAGER,
      }),
    ]);
  });

  it("lets a manager reassign an account that already has an owner", async () => {
    fake.store["implementations"]![0]!["owner_id"] = TM_BEN;
    setRules(AUTO);
    await assignAs({ dealId: DEAL, teamMemberId: TM_ADA });
    expect(implRow()["owner_id"]).toBe(TM_ADA);
  });

  it("keeps the manager's direct assignDeal path working in claim mode", async () => {
    await assignDeal({
      dealId: DEAL,
      implementationId: IMPL,
      teamMemberId: TM_CY,
      actorProfileId: MANAGER,
    });
    expect(implRow()["owner_id"]).toBe(TM_CY);
  });

  it("does not let a manager-assigned owner be overwritten by a claim", async () => {
    await assignAs({ dealId: DEAL, teamMemberId: TM_BEN });
    await expect(claimDeal(USER_ADA, DEAL)).rejects.toThrow(/Ben already owns this account/);
    expect(implRow()["owner_id"]).toBe(TM_BEN);
  });
});

/* ---------------------------------------------------------------------------
 * Partial failures after the owner is written (Part 2 correction).
 * The owner is set first, so each failure below must leave the owner and the
 * assignment record agreeing, must not revert a manager's change, and must not
 * remove any ledger row.
 * ------------------------------------------------------------------------- */

const failingChain = (message: string): any => {
  const chain: any = {
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: null, error: { message } }),
    select: async () => ({ data: null, error: { message } }),
  };
  return chain;
};

/** Makes a read of one table fail when its column list matches. */
function failSelect(table: string, when: (cols: string) => boolean, message = "read failed") {
  const orig = fake.client.from;
  fake.client.from = (t: string) => {
    const builder = orig(t);
    if (t !== table) return builder;
    return new Proxy(builder, {
      get(target, prop) {
        if (prop === "select") {
          return (cols?: string) =>
            when(cols ?? "") ? failingChain(message) : target.select(cols);
        }
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  };
}

/**
 * Makes an insert into one table fail. With `persist`, the row is written and only
 * the reply is lost. `beforeFail` runs first, to simulate a change landing in the window.
 */
function failInsert(
  table: string,
  opts: { persist?: boolean; once?: boolean; beforeFail?: () => void } = {},
) {
  const orig = fake.client.from;
  let failures = 0;
  fake.client.from = (t: string) => {
    const builder = orig(t);
    if (t !== table) return builder;
    return new Proxy(builder, {
      get(target, prop) {
        if (prop === "insert") {
          return (row: Record<string, unknown>) => ({
            then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
              return (async () => {
                if (opts.once && failures > 0) return target.insert(row).then((v: any) => v);
                failures += 1;
                if (opts.persist) await target.insert(row);
                opts.beforeFail?.();
                return { data: null, error: { message: "write refused" } };
              })().then(res, rej);
            },
          });
        }
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  };
}

/** Makes releasing an owner (an update that sets owner_id to null) fail. */
function failRelease() {
  const orig = fake.client.from;
  fake.client.from = (t: string) => {
    const builder = orig(t);
    if (t !== "implementations") return builder;
    return new Proxy(builder, {
      get(target, prop) {
        if (prop === "update") {
          return (patch: Record<string, unknown>) => {
            if (patch["owner_id"] === null) return failingChain("release refused");
            return target.update(patch);
          };
        }
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  };
}

/** The owner and the assignment record agree: no owner with a record, and no record without the owner. */
function ownerMatchesRecord() {
  const latest = ledger()[ledger().length - 1];
  return (implRow()["owner_id"] ?? null) === (latest ? latest["team_member_id"] : null);
}

describe("a failure while choosing the assignee leaves no owner behind", () => {
  it("releases the owner this claim set, writes no record, and reports the failure", async () => {
    failSelect("portal_accounts", (cols) => cols.includes("arr"), "read failed");
    await expectRefusedWithoutWrites(() => claimDeal(USER_ADA, DEAL), /Deal not found/);
    expect(implRow()["owner_id"]).toBeNull();
    expect(ownerMatchesRecord()).toBe(true);
  });
});

describe("a failure writing the assignment record releases the owner", () => {
  it("releases the owner, writes no record, sends no notice, and reports the failure", async () => {
    failInsert("portal_assignments");
    await expectRefusedWithoutWrites(
      () => claimDeal(USER_ADA, DEAL),
      /Could not record the assignment/,
    );
    expect(implRow()["owner_id"]).toBeNull();
    expect(ledger()).toEqual([]);
    expect(ownerMatchesRecord()).toBe(true);
  });

  it("lets the same person claim again once the failure is cleared", async () => {
    failInsert("portal_assignments", { once: true });
    await expect(claimDeal(USER_ADA, DEAL)).rejects.toThrow(/Could not record/);
    await claimDeal(USER_ADA, DEAL);
    expect(implRow()["owner_id"]).toBe(TM_ADA);
    expect(ledger()).toHaveLength(1);
    expect(ownerMatchesRecord()).toBe(true);
  });
});

describe("a record written before its reply was lost keeps the claim", () => {
  it("keeps the owner that matches the record, and tells the person to refresh", async () => {
    failInsert("portal_assignments", { persist: true });
    await expect(claimDeal(USER_ADA, DEAL)).rejects.toThrow(
      /recorded, but a later step failed.*Refresh/s,
    );
    expect(implRow()["owner_id"]).toBe(TM_ADA);
    expect(ledger()).toHaveLength(1);
    expect(ownerMatchesRecord()).toBe(true);
  });
});

describe("a manager's assignment is never reverted by a failed claim", () => {
  it("leaves the manager's owner in place when the claim's record fails", async () => {
    failInsert("portal_assignments", {
      beforeFail: () => {
        fake.store["implementations"]![0]!["owner_id"] = TM_BEN;
      },
    });
    await expect(claimDeal(USER_ADA, DEAL)).rejects.toThrow(/Could not record/);
    expect(implRow()["owner_id"]).toBe(TM_BEN);
    expect(ledger()).toEqual([]);
  });
});

describe("a release that itself fails is logged, and the claim's own error is still reported", () => {
  it("reports the original error and records the inconsistency for reconciliation", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    failInsert("portal_assignments");
    failRelease();
    await expect(claimDeal(USER_ADA, DEAL)).rejects.toThrow(/Could not record/);
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("could not release the owner"),
      expect.anything(),
    );
    logged.mockRestore();
  });
});

describe("concurrent claims during a failed claim never give two owners", () => {
  it("keeps the owner and the record in agreement after two claimants race a failing first attempt", async () => {
    failInsert("portal_assignments", { once: true });
    await Promise.allSettled([claimDeal(USER_ADA, DEAL), claimDeal(USER_BEN, DEAL)]);
    expect(ledger().length).toBeLessThanOrEqual(1);
    expect(ownerMatchesRecord()).toBe(true);
  });
});
