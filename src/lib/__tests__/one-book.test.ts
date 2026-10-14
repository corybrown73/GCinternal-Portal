import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * One book (QA 7.5, 7.6, 8.1, 20.1, 21.2, 23): one owner rule, one
 * "unclaimed", one workload, test accounts out of every count — the same
 * fixture read by the board, the daily/MCP report, Home's deal inbox, the
 * project list behind Home/Customers/Reports, and the Assign picker's
 * counts, and every surface agrees.
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
  claimedOwnersByDeal,
  inActiveBook,
  isUnclaimed,
  latestImplementations,
  resolveClaimedOwner,
  workloadByOwner,
} from "../claimed-owner";
import { loadActiveWorkload, reconcileImplementationOwners } from "../claimed-owner.server";
import { pickerMembers, removeTeamMember } from "../assignment.server";
import { deriveHealth } from "../customer360-derive";
import { loadImplementations, loadLeadership } from "../hub.server";
import { ownerLoad, portfolioRollup, stageDistribution } from "../leadership";
import { triageRow } from "../home-triage";
import type { ImplementationRow, LeadershipData } from "../hub-types";
import { loadPipelineReport } from "../pipeline-report.server";
import { loadDealInbox, loadPipeline } from "../presale.server";
import { dealFactsFor } from "../server/deal-facts";
import { excludeTests, isTestAccount, readShowTests, testFlagState } from "../test-accounts";
import { loadTestFlagState, setTestAccount } from "../test-accounts.server";

describe("the owner rule", () => {
  it("is the project's owner once there is a project, else the ledger's newest, else nobody", () => {
    expect(
      resolveClaimedOwner({
        implementation: { owner_id: "teya" },
        assignment: { deal_id: "d", team_member_id: "cory" },
      }),
    ).toEqual({ id: "teya", source: "implementation" });
    // An owner cleared on the project is nobody: the ledger does not bring
    // the old name back.
    expect(
      resolveClaimedOwner({
        deal: { id: "d" },
        implementation: { owner_id: null },
        assignment: { deal_id: "d", team_member_id: "cory" },
      }),
    ).toBeNull();
    // Before the project exists, the ledger names the owner.
    expect(
      resolveClaimedOwner({
        deal: { id: "d" },
        implementation: null,
        assignment: { deal_id: "d", team_member_id: "cory" },
      }),
    ).toEqual({ id: "cory", source: "ledger" });
    // An unassignment in the ledger, or a row for another deal, is nobody.
    expect(resolveClaimedOwner({ assignment: { deal_id: "d", team_member_id: null } })).toBeNull();
    expect(
      resolveClaimedOwner({
        deal: { id: "d" },
        assignment: { deal_id: "other", team_member_id: "cory" },
      }),
    ).toBeNull();
    expect(resolveClaimedOwner({})).toBeNull();
  });

  it("reads the newest live project and the newest ledger row per deal", () => {
    const impls = [
      { deal_id: "d", owner_id: "new", superseded_by_implementation_id: "x" },
      { deal_id: "d", owner_id: null },
    ];
    expect(latestImplementations(impls).get("d")).toEqual({ deal_id: "d", owner_id: null });
    const owners = claimedOwnersByDeal(impls, [
      { deal_id: "d", team_member_id: "cory" },
      { deal_id: "d", team_member_id: "older" },
      { deal_id: "early", team_member_id: "cory" },
      { deal_id: "early", team_member_id: "older" },
    ]);
    // The live project has no owner: nobody, whatever the ledger says.
    expect(owners.get("d")).toBeUndefined();
    // No project yet: the ledger's newest row.
    expect(owners.get("early")).toEqual({ id: "cory", source: "ledger" });
  });

  it("calls a deal unclaimed from Negotiate & Finalize to Make it run, never at Prospect or Graduate", () => {
    expect(isUnclaimed("negotiate", null)).toBe(true);
    expect(isUnclaimed("closed_won", null)).toBe(true);
    expect(isUnclaimed("make_it_run", null)).toBe(true);
    expect(isUnclaimed("closed_won", "teya")).toBe(false);
    expect(isUnclaimed("prospect", null)).toBe(false);
    expect(isUnclaimed("onboarding_complete", null)).toBe(false);
  });

  it("counts the active book only: not superseded, not graduated, not a test account", () => {
    expect(inActiveBook({ stage: "kickoff" })).toBe(true);
    expect(inActiveBook({ stage: "onboarding_complete" })).toBe(false);
    expect(inActiveBook({ stage: "kickoff", superseded: true })).toBe(false);
    expect(inActiveBook({ stage: "kickoff", is_test: true })).toBe(false);
    expect(
      workloadByOwner([
        { ownerId: "a", stage: "kickoff" },
        { ownerId: "a", stage: "onboarding_complete" },
        { ownerId: "a", stage: "closed_won", is_test: true },
        { ownerId: null, stage: "kickoff" },
      ]),
    ).toEqual(new Map([["a", 1]]));
  });
});

describe("Graduate has no clock (QA 21.2)", () => {
  it("never reads a graduated deal as stalled", () => {
    const empty = { risks: [], issues: [], escalations: [], commitments: [], milestones: [] };
    const longAgo = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const graduated = deriveHealth(empty as never, {
      current_stage: "handoff",
      deal_stage: "onboarding_complete",
      stage_entered_at: longAgo,
    });
    expect(graduated.evidence.rule).not.toBe("stalled_stage");
    expect(graduated.level).not.toBe("at_risk");
    const working = deriveHealth(empty as never, {
      current_stage: "handoff",
      deal_stage: "get_it_working",
      stage_entered_at: longAgo,
    });
    expect(working.evidence.rule).toBe("stalled_stage");
  });

  it("shows no days in stage for a graduated project, on Home or in Leadership's stage rows", () => {
    const longAgo = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const row = (id: string, deal_stage: string, current_stage: string) =>
      ({
        id,
        name: id,
        customer_id: `c-${id}`,
        customer_name: id,
        segment: null,
        industry: null,
        arr: null,
        current_stage,
        deal_stage,
        deal_id: id,
        stage_entered_at: longAgo,
        status: "on_track",
        health_recorded: null,
        health_recorded_reason: null,
        owner_name: "Teya Rampaul",
        tier: null,
        target_launch_date: null,
        actual_launch_date: null,
        overdue_commitments: 0,
        open_escalations: 0,
      }) as ImplementationRow;
    const graduated = row("grad", "onboarding_complete", "graduate-to-cs");
    expect(triageRow(graduated, undefined).impact).not.toMatch(/in stage|d in /);
    // A working project with nothing open still says how long it has sat.
    const working = { ...row("work", "get_it_working", "build"), stage_entered_at: recent };
    expect(triageRow(working, undefined).impact).toMatch(/\d+d in stage/);

    const stages = stageDistribution({
      implementations: [graduated],
      triage: [],
      commitments: [],
      signal: [],
      stage_history: [],
      graduation_candidates: [],
    } as unknown as LeadershipData);
    const last = stages.find((x) => x.id === "graduate-to-cs")!;
    expect(last.implementations).toHaveLength(1);
    expect(last.longest_dwell_days).toBeNull();
    expect(last.over_flag).toBe(0);
  });
});

describe("test accounts", () => {
  it("are flagged on the deal or the customer; a missing column is real", () => {
    expect(isTestAccount({ is_test: true })).toBe(true);
    expect(isTestAccount({ is_test: false }, { is_test: true })).toBe(true);
    expect(isTestAccount({}, null, undefined)).toBe(false);
    const rows = [{ is_test: true }, { is_test: false }];
    expect(excludeTests(rows, (r) => isTestAccount(r))).toEqual([{ is_test: false }]);
    expect(excludeTests(rows, (r) => isTestAccount(r), true)).toHaveLength(2);
  });

  it("show only when the URL asks", () => {
    expect(readShowTests("1")).toBe(true);
    expect(readShowTests(true)).toBe(true);
    expect(readShowTests(undefined)).toBe(false);
    expect(readShowTests("0")).toBe(false);
  });
});

describe("the Assign picker's people (QA 20.1)", () => {
  const p = (id: string, role: string | null, inPool = false) => ({
    teamMemberId: id,
    role,
    inPool,
    active: inPool,
  });
  it("is the rotation, the implementation roles, anyone carrying work, and the deal's owner", () => {
    const pool = [
      p("cory", "admin", true),
      p("joy", "TIS"),
      p("jordan", "implementation"),
      p("liesl", "manager"),
      p("onb", "onboarding"),
      p("bryan", "AM"),
      p("tyler", "SE"),
      p("reid", "TAM"),
      p("stephen", "super_admin"),
      // An admin who owns active projects (Nicole-Joy) is an owner whatever
      // the team role says.
      { ...p("nicole", "super_admin"), owned: 2 },
      { ...p("ian", "super_admin"), owned: 0 },
    ];
    expect(pickerMembers(pool, null).map((m) => m.teamMemberId)).toEqual([
      "cory",
      "joy",
      "jordan",
      "liesl",
      "onb",
      "nicole",
    ]);
    // The Field Fusion setup owner, an SE, stays listed on their own deal.
    expect(pickerMembers(pool, "tyler").map((m) => m.teamMemberId)).toContain("tyler");
  });
});

/* ------------------------------------------------ one fixture, every surface */

const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
const deal = (id: string, name: string, stage: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  stage,
  stage_entered_at: recent,
  intake: {},
  customer_id: `c-${id}`,
  am_owner_id: null,
  se_owner_id: null,
  sow_document_path: null,
  sow_reference: null,
  welcome_share_url: null,
  updated_at: recent,
  ...over,
});
const impl = (id: string, dealId: string, owner: string | null, over = {}) => ({
  id,
  deal_id: dealId,
  customer_id: `c-${dealId}`,
  name: `${id} onboarding`,
  owner_id: owner,
  current_stage: "handoff",
  stage_entered_at: recent,
  status: "on_track",
  superseded_by_implementation_id: null,
  created_at: recent,
  ...over,
});

const rows: Rows = {
  portal_accounts: [
    // The project names an owner, the ledger has nothing (Grinder, Midland).
    deal("grinder", "Grinder", "closed_won"),
    // Claimed at the close, before its project exists: the ledger names Cory.
    deal("ledger", "Ledger Only", "closed_won", { customer_id: null }),
    // Assigned onto its project, then cleared on the customer page: nobody.
    deal("unowned", "Nobody Home", "closed_won"),
    // Graduated with no owner: not waiting for one (Varley).
    deal("varley", "Varley", "onboarding_complete"),
    // A test customer (FF Test Nikki) and a test deal with no customer (Bayou).
    deal("ff", "FF Test Nikki", "closed_won"),
    deal("bayou", "QA Test - Bayou", "closed_won", { customer_id: null, is_test: true }),
    // A real deal closed with no customer page yet.
    deal("noimpl", "Closed No Page", "closed_won", { customer_id: null }),
  ],
  customers: [
    { id: "c-grinder", name: "Grinder" },
    { id: "c-unowned", name: "Nobody Home" },
    { id: "c-varley", name: "Varley" },
    { id: "c-ff", name: "FF Test Nikki", is_test: true },
  ],
  implementations: [
    impl("i-grinder", "grinder", "teya"),
    impl("i-unowned", "unowned", null),
    impl("i-varley", "varley", null),
    impl("i-ff", "ff", "cory"),
  ],
  portal_assignments: [
    {
      deal_id: "ledger",
      implementation_id: null,
      team_member_id: "cory",
      weight: 1,
      created_at: recent,
    },
    {
      deal_id: "unowned",
      implementation_id: "i-unowned",
      team_member_id: "cory",
      weight: 1,
      created_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    },
  ],
  team_members: [
    { id: "teya", name: "Teya Rampaul", role: "TIS" },
    { id: "cory", name: "Cory", role: "admin", active: true },
  ],
  portal_profiles: [],
  portal_gong_reports: [],
  portal_briefs: [],
  portal_stage_transitions: [],
  commitments: [],
  escalations: [],
};

let fake: ReturnType<typeof createFakeSupabase>;
beforeEach(() => {
  fake = createFakeSupabase(rows);
  h.supabase.client = fake.client;
  h.audit.audit.mockClear();
});

describe("one fixture, every surface", () => {
  it("the board names the claimed owner and leaves test accounts off unless asked", async () => {
    const { deals } = await loadPipeline(null);
    const owner = Object.fromEntries(deals.map((d) => [d.id, d.owner_name]));
    expect(owner).toEqual({
      grinder: "Teya Rampaul",
      ledger: "Cory",
      unowned: null,
      varley: null,
      noimpl: null,
    });
    const all = await loadPipeline(null, { includeTests: true });
    expect(
      all.deals
        .filter((d) => d.is_test)
        .map((d) => d.id)
        .sort(),
    ).toEqual(["bayou", "ff"]);
  });

  it("the report, Home's inbox and Reports agree on who is unclaimed", async () => {
    const report = await loadPipelineReport();
    expect(report.unclaimed.map((u) => u.name).sort()).toEqual(["Closed No Page", "Nobody Home"]);
    expect(report.stages.reduce((n, s) => n + s.count, 0)).toBe(5);

    const inbox = await loadDealInbox(null);
    expect(
      inbox
        .filter((d) => d.unclaimed)
        .map((d) => d.name)
        .sort(),
    ).toEqual(["Closed No Page", "Nobody Home"]);
    // Grinder has a project owner and no ledger row: claimed, with a name.
    expect(inbox.find((d) => d.id === "grinder")).toMatchObject({
      unclaimed: false,
      owner_name: "Teya Rampaul",
    });

    const implementations = await loadImplementations(null);
    expect(implementations.map((i) => i.id).sort()).toEqual(["i-grinder", "i-unowned", "i-varley"]);

    // Reports' "Unassigned" is the report's "unclaimed": the project with no
    // owner (Nobody Home) and the deal with no project yet (Closed No Page).
    const data = await loadLeadership(null);
    expect(data.unclaimed_deals?.map((d) => d.name)).toEqual(["Closed No Page"]);
    const rollup = portfolioRollup(data);
    expect(rollup.unassigned).toBe(report.unclaimed.length);
    expect(rollup.unassigned).toBe(2);
    expect(rollup.unassigned_deals).toBe(1);

    // "Who carries what" and the Assign picker's "N active" are one count.
    const carried = Object.fromEntries(
      ownerLoad(data).map((o) => [o.owner, o.implementations.length + o.pending_deals.length]),
    );
    expect(carried).toEqual({ "Teya Rampaul": 1, Unassigned: 2 });
    const workload = await loadActiveWorkload();
    expect(Object.fromEntries(workload)).toEqual({ teya: 1 });
  });

  it("the deal facts take the ledger's owner before the project, and keep a cleared owner cleared", async () => {
    const facts = await dealFactsFor(["ledger", "unowned", "grinder"], "2026-10-09");
    expect(facts.get("ledger")?.owner_name).toBe("Cory");
    expect(facts.get("grinder")?.owner_name).toBe("Teya Rampaul");
    expect(facts.get("unowned")?.owner_name).toBeNull();
  });

  it("the deal facts read partner as the board and the stall sweep do: the path, or the live project", async () => {
    fake = createFakeSupabase({
      ...rows,
      portal_accounts: rows["portal_accounts"]!.map((d) =>
        d["id"] === "grinder" ? { ...d, intake: { path: "partner_implementation" } } : d,
      ),
      implementations: [
        ...rows["implementations"]!,
        // Superseded partner project, replaced by a standard one: not partner.
        impl("i-unowned-old", "unowned", null, {
          journey_type: "partner_implementation",
          superseded_by_implementation_id: "i-unowned",
          created_at: "2026-01-01T00:00:00Z",
        }),
      ],
    });
    h.supabase.client = fake.client;
    const facts = await dealFactsFor(["grinder", "unowned", "ledger"], "2026-10-09");
    expect(facts.get("grinder")?.partner).toBe(true);
    expect(facts.get("unowned")?.partner).toBe(false);
    expect(facts.get("ledger")?.partner).toBe(false);
  });

  it("a superseded project is out of the book: the deal is counted once", async () => {
    fake = createFakeSupabase({
      ...rows,
      implementations: [
        ...rows["implementations"]!,
        impl("i-grinder-old", "grinder", "teya", { superseded_by_implementation_id: "i-grinder" }),
      ],
    });
    h.supabase.client = fake.client;
    const implementations = await loadImplementations(null);
    expect(implementations.filter((i) => i.deal_id === "grinder").map((i) => i.id)).toEqual([
      "i-grinder",
    ]);
    const rollup = portfolioRollup(await loadLeadership(null));
    expect(rollup.total).toBe(3);
  });

  it("the list shows test accounts, marked, when asked for", async () => {
    const all = await loadImplementations(null, { includeTests: true });
    expect(all.find((i) => i.id === "i-ff")).toMatchObject({ is_test: true, owner_name: "Cory" });
    expect(all.find((i) => i.id === "i-grinder")?.is_test).toBe(false);
  });
});

describe("the one-off owner repair (QA 8.1)", () => {
  it("fills a project whose ledger owner never reached it, and leaves an owner a person cleared", async () => {
    fake = createFakeSupabase({
      ...rows,
      portal_accounts: [
        ...rows["portal_accounts"]!,
        deal("copyfail", "Copy Failed", "onboarding_kickoff"),
        deal("cleared", "Cleared By Hand", "onboarding_kickoff"),
      ],
      implementations: [
        ...rows["implementations"]!,
        impl("i-copyfail", "copyfail", null),
        impl("i-cleared", "cleared", null),
      ],
      portal_assignments: [
        ...rows["portal_assignments"]!,
        {
          deal_id: "copyfail",
          implementation_id: null,
          team_member_id: "cory",
          created_at: recent,
        },
        { deal_id: "cleared", implementation_id: null, team_member_id: "cory", created_at: recent },
      ],
      // The activity feed saw a person change this project's owner.
      audit_log: [
        { entity_type: "implementation", entity_id: "i-cleared", field_name: "owner_id" },
      ],
    });
    h.supabase.client = fake.client;

    const dry = await reconcileImplementationOwners();
    // "Nobody Home" is skipped too: its ledger row wrote Cory onto that very
    // project, so the empty owner came later, by hand.
    expect(dry).toEqual({
      rows: [{ implementationId: "i-copyfail", dealId: "copyfail", teamMemberId: "cory" }],
      applied: 0,
    });
    const owner = (id: string) =>
      fake.store["implementations"]!.find((i) => i.id === id)!.owner_id as string | null;
    expect(owner("i-copyfail")).toBeNull();

    const done = await reconcileImplementationOwners({ apply: true });
    expect(done.applied).toBe(1);
    expect(owner("i-copyfail")).toBe("cory");
    expect(owner("i-cleared")).toBeNull();
    expect(owner("i-unowned")).toBeNull();
    expect((await reconcileImplementationOwners()).rows).toEqual([]);
  });
});

describe("removing a team member (owner guard)", () => {
  it("refuses while a deal is claimed through the ledger alone", async () => {
    await expect(removeTeamMember("cory")).rejects.toThrow(/still owns 1 account/);
    expect(fake.store["team_members"]!.find((m) => m.id === "cory")!.active).toBe(true);
  });
});

describe("the Test account switch", () => {
  it("flags the deal and its customer, and audits who did it", async () => {
    await setTestAccount("profile-1", "grinder", true);
    expect(fake.store["portal_accounts"]!.find((d) => d.id === "grinder")!.is_test).toBe(true);
    expect(fake.store["customers"]!.find((c) => c.id === "c-grinder")!.is_test).toBe(true);
    expect(h.audit.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account.marked_test", entity_id: "grinder" }),
    );
    const { deals } = await loadPipeline(null);
    expect(deals.map((d) => d.id)).not.toContain("grinder");

    await setTestAccount("profile-1", "grinder", false);
    expect(fake.store["customers"]!.find((c) => c.id === "c-grinder")!.is_test).toBe(false);
    expect((await loadPipeline(null)).deals.map((d) => d.id)).toContain("grinder");
  });

  it("reads as test when only the customer is, and clearing keeps a customer another deal still marks", async () => {
    fake = createFakeSupabase({
      ...rows,
      portal_accounts: [
        ...rows["portal_accounts"]!,
        // FF Test Nikki's services deal, on the same customer, marked itself.
        deal("ff2", "FF Test Nikki — services", "closed_won", {
          customer_id: "c-ff",
          is_test: true,
        }),
      ],
    });
    h.supabase.client = fake.client;

    // "ff" carries no flag of its own: its customer does.
    const ff = fake.store["portal_accounts"]!.find((d) => d.id === "ff")!;
    expect(await loadTestFlagState(ff)).toEqual({
      isTest: true,
      carriedBy: "customer",
      otherFlaggedDeals: 1,
    });

    // Clearing the services deal clears the customer: no other deal of it is
    // marked ("ff" was test only through the customer).
    const r = await setTestAccount("profile-1", "ff2", false);
    expect(r.customerKeptBy).toBe(0);
    expect(fake.store["customers"]!.find((c) => c.id === "c-ff")!.is_test).toBe(false);

    // With a sibling still marked, the customer stays and the result says why.
    await setTestAccount("profile-1", "ff2", true);
    await setTestAccount("profile-1", "ff", true);
    const kept = await setTestAccount("profile-1", "ff", false);
    expect(kept.customerKeptBy).toBe(1);
    expect(fake.store["customers"]!.find((c) => c.id === "c-ff")!.is_test).toBe(true);
    expect(fake.store["portal_accounts"]!.find((d) => d.id === "ff")!.is_test).toBe(false);
  });

  it("names which record carries the flag", () => {
    expect(testFlagState({ deal: { is_test: true }, customer: { is_test: true } })).toMatchObject({
      isTest: true,
      carriedBy: "deal",
    });
    expect(testFlagState({ deal: {}, customer: null })).toEqual({
      isTest: false,
      carriedBy: null,
      otherFlaggedDeals: 0,
    });
  });

  it("refuses a deal that does not exist", async () => {
    await expect(setTestAccount("profile-1", "nope", true)).rejects.toThrow(/not found/i);
  });
});
