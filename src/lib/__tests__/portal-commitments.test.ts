import { beforeEach, describe, expect, it, vi } from "vitest";

/* The customer portal's home, loaded against a small in-memory stand-in for the
 * database. Every row is disposable test data. Internal values are marked
 * INTERNAL so that a leak is one substring away. */

const h = vi.hoisted(() => {
  const store: Record<string, any[]> = {};
  const from = (table: string) => {
    const filters: Array<(r: any) => boolean> = [];
    const rows = () => (store[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const builder: any = {
      select: () => builder,
      eq: (col: string, v: unknown) => {
        filters.push((r) => r[col] === v);
        return builder;
      },
      in: (col: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[col]));
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    };
    return builder;
  };
  return { store, from };
});

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: h.from },
}));

vi.mock("../server/customer-facing-name", () => ({
  customerFacingNameFor: async ({ fallback }: { fallback: string }) => fallback,
}));

import { loadPortalHome } from "../portal.server";

const { store } = h;

function seed() {
  for (const k of Object.keys(store)) delete store[k];
  Object.assign(store, {
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
    milestones: [],
    implementation_stage_history: [],
    commitments: [
      {
        id: "owed-open",
        implementation_id: "impl-1",
        description: "Deliver the asset list",
        due_date: "2026-03-01",
        status: "open",
        committed_to: "customer",
      },
      {
        id: "owed-missed",
        implementation_id: "impl-1",
        description: "Confirm the go-live window",
        due_date: "2026-02-15",
        status: "missed",
        committed_to: "Customer",
      },
      {
        id: "done",
        implementation_id: "impl-1",
        description: "Shipped the guide",
        due_date: "2026-01-20",
        status: "met",
        committed_to: "customer",
      },
      {
        id: "withdrawn",
        implementation_id: "impl-1",
        description: "Dropped the paper process",
        due_date: "2026-01-10",
        status: "cancelled",
        committed_to: "customer",
      },
      {
        id: "internal",
        implementation_id: "impl-1",
        description: "INTERNAL-COMMITMENT: fix the rate limit",
        due_date: "2026-02-01",
        status: "open",
        committed_to: "internal",
      },
      {
        id: "named",
        implementation_id: "impl-1",
        description: "INTERNAL-COMMITMENT: promised to a person",
        due_date: "2026-02-01",
        status: "open",
        committed_to: "Dana Ortiz",
      },
    ],
    work_items: [
      {
        id: "task-customer",
        implementation_id: "impl-1",
        title: "Provide the sample data",
        status: "open",
        party: "customer",
        visibility: "shared",
        due_at: "2026-03-10T09:00:00Z",
      },
      {
        id: "task-customer-done",
        implementation_id: "impl-1",
        title: "Sign the kickoff form",
        status: "done",
        party: "customer",
        visibility: "shared",
        due_at: "2026-01-10T09:00:00Z",
      },
      {
        id: "task-internal",
        implementation_id: "impl-1",
        title: "INTERNAL-TASK: negotiate the discount",
        status: "open",
        party: "internal",
        visibility: "internal",
        due_at: "2026-03-10T09:00:00Z",
      },
      {
        id: "task-gocanvas-shared",
        implementation_id: "impl-1",
        title: "GoCanvas-side shared task",
        status: "open",
        party: "internal",
        visibility: "shared",
        due_at: "2026-03-12T09:00:00Z",
      },
    ],
  });
}

beforeEach(() => {
  seed();
});

describe("the customer portal's home", () => {
  it("lists only the customer's own shared tasks under 'Your next steps'", async () => {
    const home = await loadPortalHome("user-1");
    expect(home.next_steps.map((s) => s.id)).toEqual(["task-customer"]);
    expect(home.next_steps[0]!.implementation_name).toBe("Field inspections rollout");
  });

  it("lists GoCanvas promises still owed under 'What we owe you', earliest first", async () => {
    const home = await loadPortalHome("user-1");
    expect(home.we_owe.map((c) => c.id)).toEqual(["owed-missed", "owed-open"]);
    expect(home.we_owe.find((c) => c.id === "owed-missed")!.status_label).toBe(
      "Missed — Outstanding",
    );
  });

  it("puts done and withdrawn promises under History, and never in what is owed", async () => {
    const home = await loadPortalHome("user-1");
    expect(home.commitment_history.map((c) => c.id).sort()).toEqual(["done", "withdrawn"]);
    const owed = home.we_owe.map((c) => c.id);
    expect(owed).not.toContain("done");
    expect(owed).not.toContain("withdrawn");
  });

  it("never shows a promise to our own team or to a named person", async () => {
    const home = await loadPortalHome("user-1");
    const everything = JSON.stringify(home);
    expect(everything).not.toContain("INTERNAL-COMMITMENT");
    expect(everything).not.toContain("Dana Ortiz");
    expect(everything).not.toContain('"internal"');
  });

  it("never shows a GoCanvas-owned task, even one that is shared", async () => {
    const home = await loadPortalHome("user-1");
    const everything = JSON.stringify(home);
    expect(everything).not.toContain("INTERNAL-TASK");
    expect(everything).not.toContain("GoCanvas-side shared task");
  });

  it("does not list milestones as the customer's own next steps", async () => {
    store["milestones"] = [
      {
        id: "m1",
        implementation_id: "impl-1",
        name: "Go-live readiness",
        status: "open",
        target_date: "2026-03-20",
        completed_date: null,
        stage: "build",
      },
    ];
    const home = await loadPortalHome("user-1");
    expect(home.next_steps.map((s) => s.id)).not.toContain("m1");
  });
});
