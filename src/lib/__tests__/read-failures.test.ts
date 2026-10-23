import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows, type TableFailures } from "./fake-supabase";

/**
 * A failed read is "could not load", never an empty list.
 *
 * Every loader here used to destructure only `{ data }`, so a read that failed
 * (a missing column, a revoked grant, a dropped connection) came back as no
 * rows, and the page said there was nothing: an empty onboarding plan for a
 * customer, "no alerts", "nobody in the pool", "no results". These tests make
 * the database fail on purpose and require the loader to say so instead.
 *
 * Each group also keeps a "reads succeed" case, so the change is shown not to
 * touch what a working read returns.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    flags: {
      isFlagOn: async (name: string) =>
        ["global_search", "saved_views", "signals_alerts", "conversations"].includes(name),
      getV2Flags: async () => ({}),
      resetFlagCache: () => {},
    },
    audit: { audit: vi.fn(async () => {}) },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("@/lib/app-config.server", () => h.flags);
vi.mock("../app-config.server", () => h.flags);
vi.mock("../server/audit", () => h.audit);
vi.mock("../server/customer-facing-name", () => ({
  customerFacingNameFor: async ({ fallback }: { fallback: string }) => fallback,
}));
vi.mock("../server/deal-stage", () => ({
  dealStagesFor: async () => new Map(),
  dealStageFor: () => null,
}));

import { loadAccessOverview } from "../access.server";
import { chooseAssignee, loadPool, loadRules } from "../assignment.server";
import { loadClaimedOwners } from "../claimed-owner.server";
import { loadCustomerOptions } from "../hub.server";
import { loadPortalHome, loadPortalTickets, submitPortalTicket } from "../portal.server";
import { globalSearch, listSavedViews } from "../search.server";
import { ExternalAccessError, grantForToken, loadSharedPlan } from "../server/external-viewer";
import { couldNotLoad } from "../server/db-read";
import { loadSignals, runSignalAlerts } from "../signals.server";
import { loadAlertList, loadTicket, loadTickets } from "../tickets.server";

const DB_DOWN = { message: "connection reset by peer", code: "08006" };
const MISSING_COLUMN = { message: "column tickets.closed_at does not exist", code: "42703" };

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorLog.mockRestore();
});

/** Every line console.error was called with, joined. */
const logged = () => errorLog.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n");

let fake: ReturnType<typeof createFakeSupabase>;
function use(rows: Rows, fail?: TableFailures) {
  fake = createFakeSupabase(rows, fail ? { fail } : {});
  h.supabase.client = fake.client;
}

/** Fails exactly one table, to prove each read is guarded on its own. */
const failing = (table: string, error = DB_DOWN): TableFailures => ({ [table]: error });

const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();

/* ------------------------------------------------------- customer portal home */

const portalRows = (): Rows => ({
  customers: [{ id: "cust-1", name: "Northwind Fleet" }],
  customer_users: [{ profile_id: "user-1", customer_id: "cust-1", implementation_id: null }],
  implementations: [
    {
      id: "impl-1",
      customer_id: "cust-1",
      name: "Field inspections rollout",
      current_stage: "build",
      stage_entered_at: "2026-02-01T00:00:00Z",
      status: "active",
      target_date: "2026-12-01",
      target_launch_date: null,
      actual_launch_date: null,
      go_live_at: null,
    },
  ],
  milestones: [
    {
      id: "m-1",
      implementation_id: "impl-1",
      name: "Forms built",
      status: "complete",
      target_date: "2026-03-01",
      completed_date: "2026-03-01",
      stage: "build",
    },
  ],
  commitments: [
    {
      id: "c-1",
      implementation_id: "impl-1",
      description: "Deliver the asset list",
      due_date: "2026-03-01",
      status: "open",
      committed_to: "customer",
    },
  ],
  implementation_stage_history: [
    { id: "h-1", implementation_id: "impl-1", stage: "build", entered_at: "2026-02-01T00:00:00Z" },
  ],
  work_items: [],
});

describe("the customer's onboarding plan (loadPortalHome)", () => {
  it("is unchanged when the reads succeed", async () => {
    use(portalRows());
    const home = await loadPortalHome("user-1");
    expect(home.implementations.map((i) => [i.id, i.name, i.milestones.length])).toEqual([
      ["impl-1", "Field inspections rollout", 1],
    ]);
    expect(home.we_owe.map((c) => c.id)).toEqual(["c-1"]);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it.each(["customers", "implementations", "milestones", "commitments", "work_items"])(
    "rejects, and never returns an empty plan, when %s cannot be read",
    async (table) => {
      use(portalRows(), failing(table));
      await expect(loadPortalHome("user-1")).rejects.toThrow(couldNotLoad("your onboarding plan"));
      expect(logged()).toContain("connection reset by peer (08006)");
    },
  );

  it("rejects when the stage history cannot be read", async () => {
    use(portalRows(), failing("implementation_stage_history"));
    await expect(loadPortalHome("user-1")).rejects.toThrow(couldNotLoad("your onboarding plan"));
  });

  it("does not tell a real customer that no customer is linked to their login", async () => {
    use(portalRows(), failing("customer_users"));
    const error = await loadPortalHome("user-1").catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(couldNotLoad("your account access"));
    expect((error as Error).message).not.toMatch(/No customer is linked/);
  });

  it("still says no customer is linked when the login really has no link", async () => {
    use({ ...portalRows(), customer_users: [] });
    await expect(loadPortalHome("user-1")).rejects.toThrow(/No customer is linked/);
  });

  it("never puts the database's message in front of the customer", async () => {
    use(portalRows(), failing("milestones", MISSING_COLUMN));
    const error = (await loadPortalHome("user-1").catch((e: Error) => e)) as Error;
    expect(error.message).not.toMatch(/closed_at|42703|column/);
    expect(logged()).toContain("column tickets.closed_at does not exist (42703)");
  });
});

describe("the customer's requests (loadPortalTickets, submitPortalTicket)", () => {
  const rows = (): Rows => ({
    ...portalRows(),
    portal_profiles: [
      { id: "user-1", email: "pat@northwind.test", full_name: "Pat", role: "customer" },
    ],
    tickets: [
      {
        id: "t-1",
        customer_id: "cust-1",
        implementation_id: null,
        subject: "Sync is slow",
        body: "It takes a minute.",
        category: "technical",
        status: "open",
        priority: "normal",
        created_at: recent,
      },
    ],
    ticket_comments: [
      {
        id: "tc-1",
        ticket_id: "t-1",
        author_id: null,
        author_email: "pat@northwind.test",
        body: "Any news?",
        internal: false,
        created_at: recent,
      },
    ],
  });

  it("is unchanged when the reads succeed", async () => {
    use(rows());
    const out = await loadPortalTickets("user-1");
    expect(out.tickets.map((t) => [t.id, t.comments.length])).toEqual([["t-1", 1]]);
  });

  it.each(["customers", "tickets", "ticket_comments"])(
    "rejects rather than showing no requests when %s cannot be read",
    async (table) => {
      use(rows(), failing(table));
      await expect(loadPortalTickets("user-1")).rejects.toThrow(couldNotLoad("your requests"));
    },
  );

  it("does not file a ticket at account level when the implementations cannot be read", async () => {
    use(
      {
        ...rows(),
        implementations: [
          ...portalRows().implementations,
          { id: "impl-2", customer_id: "cust-1", name: "Second" },
        ],
      },
      failing("implementations"),
    );
    await expect(
      submitPortalTicket("user-1", {
        customerId: "cust-1",
        category: "technical",
        subject: "Cannot sync",
        body: "It fails every time.",
        priority: "normal",
      }),
    ).rejects.toThrow(couldNotLoad("your onboarding plan"));
    expect(fake.inserts.filter((i) => i.table === "tickets")).toEqual([]);
  });
});

/* -------------------------------------------------- customer plan link (token) */

describe("the customer's shared plan link", () => {
  const viewer = {
    kind: "grant" as const,
    grantId: "g-1",
    implementationId: "impl-1",
    customerId: "cust-1",
    contactId: null,
    canComplete: false,
  };
  const rows = (): Rows => ({
    ...portalRows(),
    work_items: [],
    work_item_comments: [],
    work_item_files: [],
    team_members: [],
    project_conversations: [],
    customer_contacts: [],
    portal_profiles: [],
    external_access_grants: [],
  });

  it("is unchanged when the reads succeed", async () => {
    use(rows());
    const plan = await loadSharedPlan(viewer);
    expect(plan.customer_name).toBe("Northwind Fleet");
    expect(plan.implementation_name).toBe("Field inspections rollout");
    expect(plan.our_commitments.map((c) => c.description)).toEqual(["Deliver the asset list"]);
  });

  it.each(["customers", "work_items", "milestones", "commitments", "implementations"])(
    "rejects, and shows no half-empty plan, when %s cannot be read",
    async (table) => {
      use(rows(), failing(table));
      await expect(loadSharedPlan(viewer)).rejects.toThrow(/^Could not load this plan/);
    },
  );

  it("does not report a good link as expired when the grant cannot be read", async () => {
    use(rows(), failing("external_access_grants"));
    const error = await grantForToken("gcpl_anything").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ExternalAccessError);
    expect(logged()).toContain("connection reset by peer (08006)");
  });

  it("still reports a link that does not exist as unavailable", async () => {
    use(rows());
    const error = await grantForToken("gcpl_unknown").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExternalAccessError);
    expect((error as ExternalAccessError).code).toBe("unavailable");
  });
});

/* ------------------------------------------------------------------- tickets */

describe("the staff ticket list and detail", () => {
  const rows = (): Rows => ({
    tickets: [
      {
        id: "t-1",
        customer_id: "cust-1",
        implementation_id: null,
        assigned_to: "p-1",
        subject: "Sync is slow",
        created_at: recent,
      },
    ],
    ticket_comments: [
      {
        id: "tc-1",
        ticket_id: "t-1",
        author_id: "p-1",
        author_email: "sam@gocanvas.test",
        body: "Looking.",
        internal: false,
        created_at: recent,
      },
    ],
    customers: [{ id: "cust-1", name: "Northwind Fleet" }],
    portal_profiles: [{ id: "p-1", full_name: "Sam Specialist", email: "sam@gocanvas.test" }],
  });

  it("is unchanged when the reads succeed", async () => {
    use(rows());
    const list = await loadTickets({});
    expect(list.map((t) => [t.id, t.customer_name, t.assignee_name])).toEqual([
      ["t-1", "Northwind Fleet", "Sam Specialist"],
    ]);
    const detail = await loadTicket("t-1", { includeInternal: true });
    expect(detail?.comments.map((c) => c.author_name)).toEqual(["Sam Specialist"]);
  });

  it("rejects, rather than listing no tickets, when the tickets cannot be read", async () => {
    use(rows(), failing("tickets", MISSING_COLUMN));
    await expect(loadTickets({})).rejects.toThrow(couldNotLoad("tickets"));
    await expect(loadTicket("t-1", { includeInternal: true })).rejects.toThrow(
      couldNotLoad("this ticket"),
    );
  });

  it("rejects, rather than showing a ticket with no conversation, when the comments cannot be read", async () => {
    use(rows(), failing("ticket_comments"));
    await expect(loadTicket("t-1", { includeInternal: true })).rejects.toThrow(
      couldNotLoad("the ticket's comments"),
    );
  });

  it("still lists the tickets, with the failure logged, when only the names cannot be read", async () => {
    use(rows(), failing("customers"));
    const list = await loadTickets({});
    expect(list.map((t) => [t.id, t.customer_name])).toEqual([["t-1", null]]);
    expect(logged()).toContain("[db] ticket customer names failed");
  });

  it("still answers 'no such ticket' when the ticket really is not there", async () => {
    use(rows());
    await expect(loadTicket("missing", { includeInternal: true })).resolves.toBeNull();
  });
});

/* -------------------------------------------------------------------- alerts */

describe("the alerts list", () => {
  const rows = (): Rows => ({
    alerts: [
      {
        id: "a-1",
        kind: "stalled",
        severity: "warning",
        title: "Stalled",
        detail: null,
        customer_id: "cust-1",
        implementation_id: null,
        source: "cron",
        acknowledged_at: null,
        acknowledged_by: null,
        notified_at: null,
        created_at: recent,
        payload: { deal_id: "d-1" },
      },
    ],
    customers: [{ id: "cust-1", name: "Northwind Fleet" }],
  });

  it("is unchanged when the reads succeed", async () => {
    use(rows());
    const list = await loadAlertList();
    expect(list.map((a) => [a.id, a.customer_name, a.deal_id])).toEqual([
      ["a-1", "Northwind Fleet", "d-1"],
    ]);
  });

  it("rejects rather than saying nothing is wrong when the alerts cannot be read", async () => {
    use(rows(), failing("alerts"));
    await expect(loadAlertList()).rejects.toThrow(couldNotLoad("alerts"));
  });

  it("still lists the alerts, with the failure logged, when only the customer names fail", async () => {
    use(rows(), failing("customers"));
    const list = await loadAlertList();
    expect(list.map((a) => [a.id, a.customer_name])).toEqual([["a-1", null]]);
    expect(logged()).toContain("[db] alert customer names failed");
  });
});

/* ------------------------------------------------------------------- signals */

describe("signals", () => {
  const rows = (): Rows => ({
    implementations: [
      {
        id: "i-1",
        name: "Northwind rollout",
        customer_id: "cust-1",
        deal_id: null,
        current_stage: "build",
        stage_entered_at: recent,
        target_launch_date: null,
        actual_launch_date: null,
        go_live_at: null,
        health_recorded: null,
        health_recorded_reason: null,
        health_computed: null,
        owner_id: null,
      },
    ],
    customers: [{ id: "cust-1", name: "Northwind Fleet" }],
    team_members: [],
    implementation_stage_history: [],
    approvals: [],
    commitments: [],
    escalations: [],
    risks: [],
    issues: [],
    decisions: [],
    technical_solutions: [],
    field_mappings: [],
    stage_instances: [],
    external_plan_events: [],
  });

  it("is unchanged when the reads succeed", async () => {
    use(rows());
    const view = await loadSignals(new Date());
    expect(view.implementations.map((i) => i.implementation_id)).toEqual(["i-1"]);
  });

  // Each of these is an input to a rule. A failed read must not become "no
  // approvals, no risks, nobody waiting" and a page, or an alert sweep, that
  // carries on from there.
  it.each([
    "implementations",
    "implementation_stage_history",
    "approvals",
    "commitments",
    "escalations",
    "risks",
    "issues",
    "decisions",
    "technical_solutions",
    "field_mappings",
    "stage_instances",
  ])("rejects when %s cannot be read", async (table) => {
    use(rows(), failing(table));
    await expect(loadSignals(new Date())).rejects.toThrow(/^Could not load /);
    expect(logged()).toContain("connection reset by peer (08006)");
  });

  it("stops the alert sweep rather than raising or withholding alerts on nothing", async () => {
    use(rows(), failing("commitments"));
    await expect(runSignalAlerts(new Date())).rejects.toThrow(couldNotLoad("commitments"));
    expect(fake.inserts.filter((i) => i.table === "alerts")).toEqual([]);
  });

  it("still renders when only the names cannot be read, with the failure logged", async () => {
    use(rows(), failing("team_members"));
    const view = await loadSignals(new Date());
    expect(view.implementations).toHaveLength(1);
    expect(logged()).toContain("[db] owner names failed");
  });

  it("keeps reading the engagement source as 'no signal' when it is unavailable", async () => {
    use(rows(), failing("external_plan_events"));
    const view = await loadSignals(new Date());
    expect(view.engagement.available).toBe(false);
  });
});

/* -------------------------------------------------------------------- search */

describe("search", () => {
  const rows = (): Rows => ({
    customers: [{ id: "cust-1", name: "Northwind Fleet", segment: null, industry: null }],
    implementations: [],
    portal_accounts: [],
    portal_onboarding_notes: [],
    portal_gong_reports: [],
    tickets: [],
    technical_solutions: [],
    people: [],
    saved_views: [],
  });

  it("is unchanged when the reads succeed", async () => {
    use(rows());
    // The fake's ilike matches the whole value, so the full name is searched.
    const out = await globalSearch("Northwind Fleet");
    expect(out.groups.map((g) => g.id)).toEqual(["customers"]);
    expect(out.total).toBe(1);
  });

  it.each([
    "customers",
    "implementations",
    "portal_accounts",
    "portal_onboarding_notes",
    "portal_gong_reports",
    "tickets",
    "technical_solutions",
    "people",
  ])("rejects rather than answering 'no results' when %s cannot be read", async (table) => {
    use(rows(), failing(table));
    await expect(globalSearch("Northwind Fleet")).rejects.toThrow(couldNotLoad("search results"));
  });

  it("rejects rather than listing no saved views when they cannot be read", async () => {
    // The fake has no .or(); a chain that fails at the end is the same read.
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "or"]) chain[m] = () => chain;
    chain["order"] = async () => ({ data: null, error: DB_DOWN });
    h.supabase.client = { from: () => chain };
    await expect(listSavedViews("p-1", "customers" as never)).rejects.toThrow(
      couldNotLoad("saved views"),
    );
  });
});

/* -------------------------------------------------- owners and the assignment */

describe("owners and assignment", () => {
  const rows = (): Rows => ({
    portal_app_config: [],
    team_members: [
      { id: "tm-1", name: "Sam Specialist", email: "sam@gocanvas.test", role: "se", active: true },
    ],
    portal_assignment_pool: [{ team_member_id: "tm-1", active: true, capacity: 1 }],
    portal_assignments: [],
    portal_accounts: [
      {
        id: "d-1",
        name: "Northwind",
        arr: null,
        intake: {},
        customer_id: "cust-1",
        stage: "closed_won",
      },
    ],
    implementations: [
      {
        id: "i-1",
        deal_id: "d-1",
        customer_id: "cust-1",
        owner_id: "tm-1",
        current_stage: "build",
        created_at: recent,
      },
    ],
    customers: [{ id: "cust-1", name: "Northwind Fleet" }],
  });

  it("is unchanged when the reads succeed", async () => {
    use(rows());
    const pool = await loadPool();
    expect(pool.map((p) => [p.teamMemberId, p.inPool, p.rank, p.owned])).toEqual([
      ["tm-1", true, 1, 1],
    ]);
    const choice = await chooseAssignee({ dealId: "d-1" });
    expect(choice.kind).toBe("chosen");
    const owners = await loadClaimedOwners(["d-1"]);
    expect(owners.get("d-1")?.name).toBe("Sam Specialist");
  });

  it("does not fall back to default rules when the configured rules cannot be read", async () => {
    use(rows(), failing("portal_app_config"));
    await expect(loadRules()).rejects.toThrow(couldNotLoad("the assignment rules"));
  });

  it.each(["team_members", "portal_assignment_pool", "portal_assignments"])(
    "rejects rather than reporting an empty pool when %s cannot be read",
    async (table) => {
      use(rows(), failing(table));
      await expect(loadPool()).rejects.toThrow(/^Could not load /);
    },
  );

  it("does not leave a deal unassigned ('none') because the pool could not be read", async () => {
    use(rows(), failing("portal_assignment_pool"));
    await expect(chooseAssignee({ dealId: "d-1" })).rejects.toThrow(
      couldNotLoad("the assignment pool"),
    );
  });

  it("still ranks the pool when only the owned-count cannot be read, with the failure logged", async () => {
    use(rows(), failing("customers"));
    const pool = await loadPool();
    expect(pool.map((p) => [p.teamMemberId, p.rank, p.owned])).toEqual([["tm-1", 1, 0]]);
    expect(logged()).toContain("could not count what each person owns");
  });

  it.each(["implementations", "portal_assignments"])(
    "does not show every deal as unclaimed when %s cannot be read",
    async (table) => {
      use(rows(), failing(table));
      await expect(loadClaimedOwners(["d-1"])).rejects.toThrow(couldNotLoad("who owns each deal"));
    },
  );
});

/* ----------------------------------------------- customer lists in the admin UI */

describe("customer access and the new-account picker", () => {
  const rows = (): Rows => ({
    customers: [{ id: "cust-1", name: "Northwind Fleet", industry: "Fleet" }],
    customer_users: [],
    customer_invites: [],
    customer_contacts: [],
    portal_profiles: [],
    portal_accounts: [{ id: "d-1", name: "Northwind", stage: "closed_won" }],
  });

  it("are unchanged when the reads succeed", async () => {
    use(rows());
    expect((await loadAccessOverview()).map((c) => c.id)).toEqual(["cust-1"]);
    const options = await loadCustomerOptions();
    expect(options.customers.map((c) => c.id)).toEqual(["cust-1"]);
    expect(options.deals.map((d) => d.id)).toEqual(["d-1"]);
  });

  it.each([
    "customers",
    "customer_users",
    "customer_invites",
    "customer_contacts",
    "portal_profiles",
  ])(
    "the access list rejects rather than showing nobody has access when %s cannot be read",
    async (table) => {
      use(rows(), failing(table));
      await expect(loadAccessOverview()).rejects.toThrow(couldNotLoad("customer access"));
    },
  );

  it.each(["customers", "portal_accounts"])(
    "the picker rejects rather than inviting a duplicate account when %s cannot be read",
    async (table) => {
      use(rows(), failing(table));
      await expect(loadCustomerOptions()).rejects.toThrow(couldNotLoad("existing accounts"));
    },
  );
});
