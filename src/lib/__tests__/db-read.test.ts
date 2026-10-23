import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows, type TableFailures } from "./fake-supabase";

/**
 * A failed primary read is a page that says it could not load — never an
 * empty book. The incident: implementations were filtered on a column
 * production did not have yet, every read errored, the loaders destructured
 * only `{ data }`, and Home, Customers and Pipeline said "no accounts".
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

import { couldNotLoad, rowOrLog, rowOrThrow, rowsOrLog, rowsOrThrow } from "../server/db-read";
import { loadCustomer360, loadImplementations, loadLeadership } from "../hub.server";
import type { ResolvedScope } from "../ownership.server";
import { loadPipeline } from "../presale.server";

const MISSING_COLUMN = {
  code: "42703",
  message: "column implementations.closed_at does not exist",
};

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorLog.mockRestore();
});

/** Every line console.error was called with, joined. */
const logged = () => errorLog.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n");

describe("rowsOrThrow", () => {
  it("returns the rows when there is no error", () => {
    expect(rowsOrThrow({ data: [{ id: 1 }], error: null }, "implementations")).toEqual([{ id: 1 }]);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("reads null data with no error as no rows", () => {
    expect(rowsOrThrow({ data: null, error: null }, "implementations")).toEqual([]);
  });

  it("logs the database's message and throws a plain sentence", () => {
    expect(() => rowsOrThrow({ data: null, error: MISSING_COLUMN }, "implementations")).toThrow(
      new Error(
        "Could not load implementations. Try again in a minute; if it keeps happening, tell an admin.",
      ),
    );
    expect(logged()).toContain(
      "[db] implementations failed: column implementations.closed_at does not exist (42703)",
    );
  });

  it("never puts the SQL in what staff see", () => {
    let message = "";
    try {
      rowsOrThrow({ data: null, error: MISSING_COLUMN }, "implementations");
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe(couldNotLoad("implementations"));
    expect(message).not.toMatch(/closed_at|42703|column/);
  });
});

describe("rowOrThrow / rowsOrLog", () => {
  it("rowOrThrow returns the row, null for no row, and throws on a failed read", () => {
    expect(rowOrThrow({ data: { id: "c" }, error: null }, "this customer")).toEqual({ id: "c" });
    expect(rowOrThrow({ data: null, error: null }, "this customer")).toBeNull();
    expect(() => rowOrThrow({ data: null, error: MISSING_COLUMN }, "this customer")).toThrow(
      couldNotLoad("this customer"),
    );
  });

  it("rowOrLog reads a failure as no row, but logs it", () => {
    expect(
      rowOrLog({ data: null, error: { message: "boom", code: "XX000" } }, "a name"),
    ).toBeNull();
    expect(logged()).toContain("[db] a name failed: boom (XX000)");
    expect(rowOrLog({ data: { id: "x" }, error: null }, "a name")).toEqual({ id: "x" });
  });

  it("rowsOrLog reads a failure as no rows, but logs it", () => {
    expect(rowsOrLog({ data: null, error: { message: "boom", code: "XX000" } }, "badges")).toEqual(
      [],
    );
    expect(logged()).toContain("[db] badges failed: boom (XX000)");
    expect(rowsOrLog({ data: [1, 2], error: null }, "badges")).toEqual([1, 2]);
  });
});

/* ------------------------------------------------------------- the loaders */

const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
const rows: Rows = {
  portal_accounts: [
    {
      id: "d-acme",
      name: "Acme",
      stage: "closed_won",
      stage_entered_at: recent,
      intake: {},
      customer_id: "c-acme",
      am_owner_id: null,
      se_owner_id: null,
      updated_at: recent,
    },
  ],
  customers: [{ id: "c-acme", name: "Acme" }],
  implementations: [
    {
      id: "i-acme",
      deal_id: "d-acme",
      customer_id: "c-acme",
      name: "Acme onboarding",
      owner_id: "teya",
      current_stage: "handoff",
      stage_entered_at: recent,
      status: "on_track",
      superseded_by_implementation_id: null,
      created_at: recent,
    },
  ],
  team_members: [{ id: "teya", name: "Teya Rampaul", role: "TIS", active: true }],
  portal_profiles: [],
  portal_assignments: [],
  portal_gong_reports: [],
  portal_briefs: [],
  portal_stage_transitions: [],
  commitments: [],
  escalations: [],
};

function useFake(fail?: TableFailures) {
  h.supabase.client = createFakeSupabase(rows, fail ? { fail } : {}).client;
}

describe("loadImplementations", () => {
  it("is unchanged when the reads succeed", async () => {
    useFake();
    const book = await loadImplementations(null);
    expect(book.map((i) => [i.id, i.customer_name, i.owner_name])).toEqual([
      ["i-acme", "Acme", "Teya Rampaul"],
    ]);
  });

  it("rejects with the plain message when implementations fail, and logs the real one", async () => {
    useFake({ implementations: MISSING_COLUMN });
    await expect(loadImplementations(null)).rejects.toThrow(couldNotLoad("implementations"));
    expect(logged()).toContain("column implementations.closed_at does not exist (42703)");
  });

  it("rejects when customers fail", async () => {
    useFake({ customers: { message: "permission denied for table customers", code: "42501" } });
    await expect(loadImplementations(null)).rejects.toThrow(couldNotLoad("customers"));
  });

  it("still renders when a badge read fails, with the failure in the log", async () => {
    useFake({ escalations: { message: "boom", code: "XX000" } });
    const book = await loadImplementations(null);
    expect(book.map((i) => [i.id, i.open_escalations])).toEqual([["i-acme", 0]]);
    expect(logged()).toContain("escalations (open count) failed: boom (XX000)");
  });
});

describe("loadPipeline", () => {
  it("is unchanged when the reads succeed", async () => {
    useFake();
    const { deals } = await loadPipeline(null);
    expect(deals.map((d) => [d.id, d.implementation_id, d.owner_name])).toEqual([
      ["d-acme", "i-acme", "Teya Rampaul"],
    ]);
  });

  it("rejects with the plain message when the deals fail", async () => {
    useFake({ portal_accounts: { message: 'column "closed_at" does not exist', code: "42703" } });
    await expect(loadPipeline(null)).rejects.toThrow(couldNotLoad("deals"));
    expect(logged()).toContain('[db] deals failed: column "closed_at" does not exist (42703)');
  });

  it("rejects when the deals' implementations fail", async () => {
    useFake({ implementations: MISSING_COLUMN });
    await expect(loadPipeline(null)).rejects.toThrow(couldNotLoad("the deals' implementations"));
  });

  // The claim ledger decides which deals are "mine": under a scope a failed
  // read would quietly drop deals, so it fails the page; unscoped it only
  // names an owner, so it is logged and the board still renders.
  const mine: ResolvedScope = {
    scope: { mode: "mine", personId: null },
    viewer: { profileId: "p-teya", teamMemberId: "teya", name: "Teya Rampaul" },
    person: null,
    personName: null,
  };

  it("rejects a scoped board when the claim ledger fails", async () => {
    useFake({ portal_assignments: { message: "boom", code: "XX000" } });
    await expect(loadPipeline(mine)).rejects.toThrow(couldNotLoad("deal owners"));
    expect(logged()).toContain("[db] deal owners failed: boom (XX000)");
  });

  it("keeps an unscoped board when the claim ledger fails, with the failure in the log", async () => {
    useFake({ portal_assignments: { message: "boom", code: "XX000" } });
    const { deals } = await loadPipeline(null);
    expect(deals.map((d) => d.id)).toEqual(["d-acme"]);
    expect(logged()).toContain("[db] pipeline: assignments failed: boom (XX000)");
  });
});

describe("loadCustomer360", () => {
  it("is unchanged when the reads succeed", async () => {
    useFake();
    const record = await loadCustomer360("c-acme");
    expect(record?.customer.name).toBe("Acme");
    expect(record?.implementations.map((i) => i.id)).toEqual(["i-acme"]);
    expect(await loadCustomer360("c-nobody")).toBeNull();
  });

  it("rejects, rather than saying not found, when the customer read fails", async () => {
    useFake({ customers: { message: "boom", code: "XX000" } });
    await expect(loadCustomer360("c-acme")).rejects.toThrow(couldNotLoad("this customer"));
  });

  it("rejects, rather than showing no projects, when its implementations fail", async () => {
    useFake({ implementations: MISSING_COLUMN });
    await expect(loadCustomer360("c-acme")).rejects.toThrow(
      couldNotLoad("this customer's implementations"),
    );
  });
});

describe("loadLeadership", () => {
  it("leaves out a graduation candidate whose record fails, rather than failing Reports", async () => {
    const adopt: Rows = {
      ...rows,
      implementations: (rows["implementations"] ?? []).map((i) => ({
        ...i,
        current_stage: "adopt",
      })),
    };
    const fake = createFakeSupabase(adopt).client;
    // Only the 360's single-customer read fails; the book's own reads succeed.
    h.supabase.client = {
      ...fake,
      from: (table: string) => {
        const b = fake.from(table);
        if (table === "customers") {
          b.maybeSingle = async () => ({
            data: null,
            error: { message: "pool timeout", code: "57014" },
          });
        }
        return b;
      },
    };
    const data = await loadLeadership(null);
    expect(data.implementations.map((i) => i.id)).toEqual(["i-acme"]);
    expect(data.graduation_candidates).toEqual([]);
    expect(logged()).toContain("[leadership] graduation candidate c-acme");
    expect(logged()).toContain("[db] this customer failed: pool timeout (57014)");
  });
});
