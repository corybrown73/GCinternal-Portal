import { describe, expect, it, vi } from "vitest";

import type { ClosedWonDeps } from "../server/closed-won";
import {
  buildSoql,
  CORE_FIELDS,
  defaultPullState,
  isSoqlFieldPath,
  mappedFieldPaths,
  recordToRow,
  runPoll,
  type PullDeps,
  type PullState,
  type SalesforceOpportunity,
} from "../server/salesforce-poll";
import type { FieldMap } from "../server/sf-field-maps";

/**
 * The Salesforce pull. What matters: the query asks for exactly the fields
 * the map and the defaults need; a raw Salesforce record becomes the deal's
 * row with the TIS resolved from a custom lookup; the watermark never skips
 * a record that failed.
 */

function map(over: Partial<FieldMap>): FieldMap {
  return {
    direction: "inbound_deal",
    source_path: "TIS_Assigned__r.Email",
    target_field: "implementation_owner",
    transform: "lowercase",
    fill_policy: "never",
    required: false,
    active: true,
    ...over,
  };
}

const opp = (over: Partial<SalesforceOpportunity> = {}): SalesforceOpportunity => ({
  Id: "0066g00000ABCDEAA5",
  Name: "Acme Roofing — Forms 2026",
  StageName: "Closed Won",
  IsWon: true,
  CloseDate: "2026-10-01",
  SystemModstamp: "2026-10-06T15:00:00.000Z",
  Amount: 90000,
  Description: "Three crews",
  AccountId: "0016g00000XYZ12AAB",
  Account: {
    Id: "0016g00000XYZ12AAB",
    Name: "Acme Roofing",
    Website: "https://acmeroofing.com",
    Industry: "Construction",
  },
  Owner: { Email: "Dana@GoCanvas.com" },
  TIS_Assigned__r: { Email: "Priya.Nair@GoCanvas.com", Name: "Priya Nair" },
  Field_Users__c: 120,
  ...over,
});

describe("the query", () => {
  it("asks for the core fields plus every mapped path, once each", () => {
    const soql = buildSoql(
      [
        map({}),
        map({ source_path: "Field_Users__c", target_field: "seats", transform: "number" }),
        map({ source_path: "Account.Name", target_field: "company", transform: null }),
        map({ source_path: "Inactive__c", target_field: "notes", active: false }),
      ],
      "2026-10-06T14:00:00.000Z",
      50,
    );
    for (const f of CORE_FIELDS) expect(soql).toContain(f);
    expect(soql).toContain("TIS_Assigned__r.Email");
    expect(soql).toContain("Field_Users__c");
    expect(soql).not.toContain("Inactive__c");
    expect(soql.match(/Account\.Name/g)).toHaveLength(1);
    expect(soql).toContain("WHERE IsWon = true AND SystemModstamp > 2026-10-06T14:00:00Z");
    expect(soql).toMatch(/ORDER BY SystemModstamp ASC LIMIT 50$/);
  });

  it("refuses a path that is not a field", () => {
    expect(isSoqlFieldPath("Account.Name")).toBe(true);
    expect(isSoqlFieldPath("TIS_Assigned__r.Email")).toBe(true);
    expect(isSoqlFieldPath("Name; DROP")).toBe(false);
    expect(isSoqlFieldPath("a.b.c.d")).toBe(false);
    expect(mappedFieldPaths([map({ source_path: "bad path" })])).toEqual([]);
  });
});

describe("a record becomes a row", () => {
  it("fills the defaults, lets the map win, and names where each value came from", () => {
    const r = recordToRow(opp(), [map({})]);
    expect(r.row).toMatchObject({
      company: "Acme Roofing",
      salesforce_id: "0016g00000XYZ12AAB",
      opportunity: "Acme Roofing — Forms 2026",
      amount: 90000,
      close_date: "2026-10-01",
      notes: "Three crews",
      domain: "https://acmeroofing.com",
      industry: "Construction",
      rep_email: "Dana@GoCanvas.com",
      implementation_owner: "priya.nair@gocanvas.com",
    });
    expect(r.sources["implementation_owner"]).toBe("map:TIS_Assigned__r.Email");
    expect(r.sources["company"]).toBe("default:Account.Name");
    // The opportunity's Name is not the company, and a nested Account is not a string.
    const noAccountName = recordToRow(opp({ Account: { Id: "0016g00000XYZ12AAB" } }), []);
    expect(noAccountName.row["company"]).toBeUndefined();
    expect(r.unmappedKeys).toContain("Field_Users__c");
  });

  it("works with no map rows at all", () => {
    const r = recordToRow(opp(), []);
    expect(r.row["company"]).toBe("Acme Roofing");
    expect(r.row["implementation_owner"]).toBeUndefined();
  });
});

function pullDeps(records: SalesforceOpportunity[], over: Partial<PullDeps> = {}) {
  const saved: PullState[] = [];
  const logged: Array<{ external_id: string; status: string; error: string | null }> = [];
  const ingestDeps: ClosedWonDeps = {
    upsertAccount: vi.fn(async (input) => ({
      account: { id: `deal-${input.name}`, customer_id: null, stage: "closed_won" },
      created: true,
    })),
    recordContact: vi.fn(async () => {}),
    startOnboarding: vi.fn(async () => ({
      outcome: "started" as const,
      customerId: "cust-1",
      implementationId: "impl-1",
    })),
    existingImplementation: vi.fn(async () => null),
    assign: vi.fn(async () => ({ assigneeName: "Priya Nair" })),
  };
  const deps: PullDeps = {
    now: () => new Date("2026-10-06T16:00:00.000Z"),
    loadMaps: async () => [map({})],
    loadState: async () => ({
      ...defaultPullState(new Date("2026-10-06T16:00:00.000Z")),
      watermark: "2026-10-06T14:00:00.000Z",
    }),
    saveState: async (s) => {
      saved.push(s);
    },
    query: vi.fn(async () => records),
    ingestDeps,
    log: async (e) => {
      logged.push({ external_id: e.external_id, status: e.status, error: e.error });
    },
    ...over,
  };
  return { deps, saved, logged, ingestDeps };
}

describe("running the poll", () => {
  it("ingests each won opportunity, assigns the TIS, and moves the watermark", async () => {
    const { deps, saved, logged, ingestDeps } = pullDeps([
      opp(),
      opp({
        Id: "0066g00000ZZZZZAAA",
        Name: "Beta Co",
        SystemModstamp: "2026-10-06T15:30:00.000Z",
        Account: { Id: "0016g00000BBBBBAAA", Name: "Beta Co" },
      }),
    ]);
    const s = await runPoll(deps);
    expect(s.found).toBe(2);
    expect(s.created).toBe(2);
    expect(s.failed).toBe(0);
    expect(s.watermark).toBe("2026-10-06T15:30:00.000Z");
    expect(ingestDeps.assign).toHaveBeenCalledWith(
      "deal-Acme Roofing",
      "impl-1",
      "priya.nair@gocanvas.com",
    );
    expect(logged.map((l) => l.status)).toEqual(["succeeded", "succeeded"]);
    expect(saved.at(-1)?.watermark).toBe("2026-10-06T15:30:00.000Z");
    expect(saved.at(-1)?.last_error).toBeNull();
  });

  it("counts a company already onboarding as updated, not created", async () => {
    const { deps, logged } = pullDeps([opp()], {});
    (deps.ingestDeps.upsertAccount as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      account: { id: "deal-1", customer_id: "cust-1", stage: "closed_won" },
      created: false,
    });
    const s = await runPoll(deps);
    expect(s.updated).toBe(1);
    expect(logged[0]?.status).toBe("replayed");
  });

  it("stops the watermark at a failed record so it is fetched again", async () => {
    const bad = opp({
      Id: "0066g00000BADBADAAA",
      // No account and no name: nothing can be the company, so the row is refused.
      Name: "",
      Account: undefined as never,
      SystemModstamp: "2026-10-06T15:10:00.000Z",
    });
    const after = opp({
      Id: "0066g00000AFTERAAAA",
      Name: "After",
      SystemModstamp: "2026-10-06T15:20:00.000Z",
    });
    const { deps, saved, logged } = pullDeps([opp(), bad, after]);
    const s = await runPoll(deps);
    expect(s.found).toBe(3);
    expect(s.created).toBe(1);
    expect(s.failed).toBe(1);
    // The record after the failure waits for the next run too.
    expect(s.records.map((r) => r.status)).toEqual(["created", "failed"]);
    expect(s.watermark).toBe("2026-10-06T15:00:00.000Z");
    expect(logged.map((l) => l.status)).toEqual(["succeeded", "failed"]);
    expect(logged[1]?.error).toMatch(/company is required/);
    expect(saved.at(-1)?.last_error).toMatch(/company is required/);
  });

  it("records a query failure and rethrows it", async () => {
    const { deps, saved } = pullDeps([], {
      query: vi.fn(async () => {
        throw new Error("INVALID_FIELD: No such column 'Nope__c'");
      }),
    });
    await expect(runPoll(deps)).rejects.toThrow(/INVALID_FIELD/);
    expect(saved.at(-1)?.last_error).toMatch(/INVALID_FIELD/);
    expect(saved.at(-1)?.watermark).toBe("2026-10-06T14:00:00.000Z");
  });
});
