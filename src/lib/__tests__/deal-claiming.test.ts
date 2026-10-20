import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * Issue #83, Part 2: how the app calls the claim and assignment functions in the
 * database, and what it tells the person when they refuse.
 *
 * SIMULATED. These tests run the TypeScript against a fake client. The database
 * functions (portal_claim_deal, portal_record_assignment, portal_inherit_pre_project_owner)
 * are scripted here, so these tests check the app's half: which arguments it
 * sends, which refusal it shows, and that it announces only what the database
 * committed. They do not check the rules themselves.
 *
 * DATABASE-VERIFIED, not here: the rules (claim mode, eligibility, already owned,
 * the newest record before a project exists), the locks, and that two claims
 * cannot both succeed. Those live in supabase/tests/0087_claim_deal.sql (single
 * session) and supabase/tests/0087_claim_deal_concurrency.sh (overlapping sessions
 * against a real Postgres).
 */

const h = vi.hoisted(() => {
  const state = {
    client: null as any,
    forward: null as any,
    emails: [] as Array<Record<string, unknown>>,
    audits: [] as Array<Record<string, unknown>>,
    emailFails: false,
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
    if (h.emailFails) throw new Error("smtp down");
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

/** The database's answer, as the client receives it. */
const accept = (implementationId: string | null = IMPL) => ({
  data: { implementation_id: implementationId, ledger_id: "ledger-1" },
  error: null,
});
const refuse = (message: string) => ({ data: null, error: { message } });

beforeEach(() => {
  fake = createFakeSupabase(baseRows());
  h.client = fake.client;
  h.emails.length = 0;
  h.audits.length = 0;
  h.emailFails = false;
  fake.handlers["portal_claim_deal"] = () => accept();
  fake.handlers["portal_record_assignment"] = () => accept();
});

const implRow = () => fake.store["implementations"]!.find((r) => r["id"] === IMPL)!;
const callsTo = (fn: string) => fake.rpcs.filter((c) => c.fn === fn).map((c) => c.args);
const claimCalls = () => callsTo("portal_claim_deal");
const recordCalls = () => callsTo("portal_record_assignment");
// The fake creates an empty table the first time a read touches it. Only rows count.
const snapshot = () =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(fake.store).filter(([, rows]) => !(Array.isArray(rows) && rows.length === 0)),
    ),
  );

/** A refusal: the message, and nothing written, emailed or audited on this side. */
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

describe("a claim asks the database, with the signed-in person's team member", () => {
  it("sends the claimant, the weight and the note, and announces the committed claim once", async () => {
    const result = await claimDeal(USER_ADA, DEAL);

    expect(claimCalls()).toEqual([
      expect.objectContaining({
        p_deal: DEAL,
        p_team_member: TM_ADA,
        p_actor_profile: USER_ADA,
        p_weight: expect.any(Number),
        p_breakdown: expect.any(Object),
        p_note: "Claimed by Ada",
      }),
    ]);
    expect(h.audits).toEqual([
      expect.objectContaining({ action: "implementation.assigned", actor_id: USER_ADA }),
    ]);
    expect(h.emails).toEqual([expect.objectContaining({ to: "ada@gocanvas.com" })]);
    expect(result).toEqual(
      expect.objectContaining({
        teamMemberId: TM_ADA,
        assigneeName: "Ada",
        source: "manual",
        notified: true,
      }),
    );
  });

  it("does not take the team member from the request: the caller's own pool entry is used", async () => {
    await claimDealFn({
      data: { dealId: DEAL, teamMemberId: TM_BEN, owner_id: TM_BEN, claimable: true },
      context: { profile: { id: USER_ADA, email: "ada@gocanvas.com", role: "am" } },
    } as never);
    expect(claimCalls()).toEqual([expect.objectContaining({ p_team_member: TM_ADA })]);
  });

  it("does not check the project itself: a deal with no project is sent to the database as well", async () => {
    fake.store["implementations"] = [];
    await claimDeal(USER_ADA, DEAL);
    expect(claimCalls()).toEqual([
      expect.objectContaining({ p_deal: DEAL, p_team_member: TM_ADA }),
    ]);
    expect(h.emails).toHaveLength(1);
  });

  it("keeps the claim when the notice cannot be sent, and reports the assignee as not notified", async () => {
    h.emailFails = true;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await claimDeal(USER_ADA, DEAL);
    expect(result).toEqual(expect.objectContaining({ notified: false, teamMemberId: TM_ADA }));
    expect(claimCalls()).toHaveLength(1);
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("could not email the assignee"),
      expect.anything(),
    );
    logged.mockRestore();
  });
});

describe("the Claim buttons follow the rules the database enforces", () => {
  it("is claimable in claim mode when nobody owns the account", async () => {
    const a = await dealAssignment(DEAL);
    expect(a.mode).toBe("claim");
    expect(a.claimable).toBe(true);
    expect(a.owner).toBeNull();
  });

  it("is claimable before a project exists, as closing a deal in claim mode already allows", async () => {
    fake.store["implementations"] = [];
    const a = await dealAssignment(DEAL);
    expect(a.claimable).toBe(true);
  });

  it("is not claimable once a project owner is set, and names the owner", async () => {
    fake.store["implementations"]![0]!["owner_id"] = TM_BEN;
    const a = await dealAssignment(DEAL);
    expect(a.claimable).toBe(false);
    expect(a.owner).toEqual(expect.objectContaining({ teamMemberId: TM_BEN, name: "Ben" }));
  });

  it("is not claimable before a project exists when the newest assignment record names an owner", async () => {
    fake.store["implementations"] = [];
    fake.store["portal_assignments"] = [
      {
        id: "ledger-old",
        deal_id: DEAL,
        team_member_id: TM_BEN,
        weight: 1,
        breakdown: {},
        source: "manual",
        note: "Claimed by Ben",
        created_at: "2026-10-02T00:00:00Z",
      },
    ];
    const a = await dealAssignment(DEAL);
    expect(a.claimable).toBe(false);
    expect(a.owner).toEqual(expect.objectContaining({ teamMemberId: TM_BEN }));
  });

  it.each([
    ["auto", AUTO],
    ["missing", undefined],
    ["an upper-case mode", { ...CLAIM, mode: "Claim" }],
    ["a string instead of an object", "claim"],
  ])("is not claimable with %s rules", async (_label, value) => {
    if (value === undefined) fake.store["portal_app_config"] = [];
    else setRules(value);
    expect((await dealAssignment(DEAL)).claimable).toBe(false);
  });
});

describe("a refusal from the database is shown in its own words, and nothing is announced", () => {
  it.each([
    [
      "auto mode",
      "claim_refused:rules_auto|Accounts are assigned by a manager in this workspace, so you cannot claim this one. Ask a manager to assign it.",
      /Accounts are assigned by a manager/,
    ],
    [
      "missing rules",
      "claim_refused:rules_missing|No assignment rules are saved, so accounts cannot be claimed. A manager assigns this account.",
      /No assignment rules are saved/,
    ],
    [
      "invalid rules",
      "claim_refused:rules_invalid|The assignment rules are not valid, so accounts cannot be claimed until a manager saves them again.",
      /not valid/,
    ],
    [
      "an existing owner",
      "claim_refused:already_owned|Ben already owns this account.",
      /Ben already owns this account\./,
    ],
    [
      "a project taken mid-claim",
      "claim_refused:already_owned|This account was just taken, so it cannot be claimed. Reload to see who owns it.",
      /just taken/,
    ],
  ])("shows the refusal for %s and writes nothing", async (_label, message, expected) => {
    fake.handlers["portal_claim_deal"] = () => refuse(message);
    await expectRefusedWithoutWrites(() => claimDeal(USER_ADA, DEAL), expected);
  });

  it("asks the person to try again when the project changed during the claim", async () => {
    fake.handlers["portal_claim_deal"] = () =>
      refuse(
        "ownership_retry: the project for this deal changed while it was being updated. Try again.",
      );
    await expectRefusedWithoutWrites(
      () => claimDeal(USER_ADA, DEAL),
      /The project for this deal changed while the assignment was being made\. Try again\./,
    );
  });

  it("reports any other database error as a failure to take the account", async () => {
    fake.handlers["portal_claim_deal"] = () => refuse("connection reset");
    await expectRefusedWithoutWrites(
      () => claimDeal(USER_ADA, DEAL),
      /Could not take the account: connection reset/,
    );
  });
});

describe("a person who is not eligible is refused before the database is asked", () => {
  it("refuses an internal user who is not in the pool", async () => {
    await expectRefusedWithoutWrites(() => claimDeal(USER_CY, DEAL), /not in the assignment pool/);
    expect(claimCalls()).toEqual([]);
  });

  it("refuses a pool member whose team membership has been deactivated", async () => {
    await expectRefusedWithoutWrites(
      () => claimDeal(USER_LEFT, DEAL),
      /not in the assignment pool/,
    );
    expect(claimCalls()).toEqual([]);
  });

  it("refuses a profile with no email, which cannot be matched to the pool", async () => {
    await expectRefusedWithoutWrites(
      () => claimDeal(USER_NOEMAIL, DEAL),
      /No profile for this sign-in/,
    );
    expect(claimCalls()).toEqual([]);
  });

  it("refuses an unknown profile", async () => {
    await expectRefusedWithoutWrites(
      () => claimDeal("11111111-1111-4111-8111-1111111111ff", DEAL),
      /No profile for this sign-in/,
    );
    expect(claimCalls()).toEqual([]);
  });

  it("refuses a deal that does not exist", async () => {
    fake.store["portal_accounts"] = [];
    await expectRefusedWithoutWrites(() => claimDeal(USER_ADA, DEAL), /Deal not found/);
    expect(claimCalls()).toEqual([]);
  });
});

describe("two claims at once: the database lets one through, and the app reports the other", () => {
  // Simulated. The database serializes the two claims; the real behaviour under
  // overlapping sessions is verified by supabase/tests/0087_claim_deal_concurrency.sh.
  it("announces one claim and refuses the other with the owner's name", async () => {
    let owner: string | null = null;
    fake.handlers["portal_claim_deal"] = (args) => {
      if (owner) {
        return refuse(
          `claim_refused:already_owned|${owner === TM_ADA ? "Ada" : "Ben"} already owns this account.`,
        );
      }
      owner = String(args["p_team_member"]);
      return accept();
    };

    const results = await Promise.allSettled([
      claimDeal(USER_ADA, DEAL),
      claimDeal(USER_BEN, DEAL),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0]!.reason.message)).toMatch(/already owns this account/);
    expect(h.audits).toHaveLength(1);
    expect(h.emails).toHaveLength(1);
  });
});

describe("the server function leaves the rules to the database, even when called directly", () => {
  const callClaim = (data: Record<string, unknown>, email = "ada@gocanvas.com", id = USER_ADA) =>
    claimDealFn({ data, context: { profile: { id, email, role: "am" } } } as never);

  it("passes a direct call to the database, which refuses it in auto mode", async () => {
    setRules(AUTO);
    fake.handlers["portal_claim_deal"] = () =>
      refuse(
        "claim_refused:rules_auto|Accounts are assigned by a manager in this workspace, so you cannot claim this one. Ask a manager to assign it.",
      );
    await expectRefusedWithoutWrites(() => callClaim({ dealId: DEAL }), /assigned by a manager/);
    expect(claimCalls()).toHaveLength(1);
  });

  it("refuses a direct call from a profile that is not in the pool, before the database", async () => {
    await expectRefusedWithoutWrites(
      () => callClaim({ dealId: DEAL }, "cy@gocanvas.com", USER_CY),
      /not in the assignment pool/,
    );
    expect(claimCalls()).toEqual([]);
  });

  it("refuses a direct call with no usable deal id, before anything is read", async () => {
    await expect(callClaim({ dealId: "not-an-id" })).rejects.toThrow();
    expect(fake.rpcs).toEqual([]);
  });
});

describe("a manager's assignment is recorded by the database, with no claim rules applied", () => {
  const assignAs = (data: Record<string, unknown>, role = "manager") =>
    assignDealFn({
      data,
      context: { profile: { id: MANAGER, email: "manager@gocanvas.com", role } },
    } as never);

  it.each([
    ["claim", CLAIM],
    ["auto", AUTO],
  ])("records a named person chosen by a manager in %s mode", async (_label, rules) => {
    setRules(rules);
    await assignAs({ dealId: DEAL, teamMemberId: TM_BEN });
    expect(recordCalls()).toEqual([
      expect.objectContaining({
        p_deal: DEAL,
        p_team_member: TM_BEN,
        p_source: "manual",
        p_actor_profile: MANAGER,
        p_note: "Chosen by hand",
      }),
    ]);
    expect(h.audits).toEqual([
      expect.objectContaining({ action: "implementation.assigned", actor_id: MANAGER }),
    ]);
    expect(h.emails).toEqual([expect.objectContaining({ to: "ben@gocanvas.com" })]);
  });

  it("lets a manager reassign an account that already has an owner: the app does not refuse it", async () => {
    fake.store["implementations"]![0]!["owner_id"] = TM_BEN;
    setRules(AUTO);
    await assignAs({ dealId: DEAL, teamMemberId: TM_ADA });
    expect(recordCalls()).toEqual([expect.objectContaining({ p_team_member: TM_ADA })]);
  });

  it("does not pass a project id: the database finds the project under its lock", async () => {
    await assignDeal({
      dealId: DEAL,
      implementationId: "not-the-project",
      teamMemberId: TM_CY,
      actorProfileId: MANAGER,
    });
    expect(recordCalls()).toHaveLength(1);
    expect(recordCalls()[0]).not.toHaveProperty("p_implementation");
  });

  it("reports a retry from the database and announces nothing", async () => {
    fake.handlers["portal_record_assignment"] = () =>
      refuse(
        "ownership_retry: the project for this deal changed while it was being updated. Try again.",
      );
    await expectRefusedWithoutWrites(
      () => assignAs({ dealId: DEAL, teamMemberId: TM_BEN }),
      /changed while the assignment was being made\. Try again\./,
    );
  });

  it("reports a record that could not be written, and announces nothing", async () => {
    fake.handlers["portal_record_assignment"] = () => refuse("write refused");
    await expectRefusedWithoutWrites(
      () => assignAs({ dealId: DEAL, teamMemberId: TM_BEN }),
      /Could not record the assignment: write refused/,
    );
  });

  it("does not let a claim overwrite a manager's owner: the database refuses it, and the app says who owns it", async () => {
    fake.handlers["portal_claim_deal"] = () =>
      refuse("claim_refused:already_owned|Ben already owns this account.");
    await assignAs({ dealId: DEAL, teamMemberId: TM_BEN });
    await expect(claimDeal(USER_ADA, DEAL)).rejects.toThrow(/Ben already owns this account/);
    expect(h.audits).toEqual([expect.objectContaining({ actor_id: MANAGER })]);
  });
});
