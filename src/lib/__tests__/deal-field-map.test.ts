import { describe, expect, it, vi } from "vitest";

import {
  CLOSED_WON_FIELDS,
  closedWonSchema,
  ingestClosedWon,
  intakeFactsOf,
  pathFrom,
  resolveClosedWonRow,
  type ClosedWonDeps,
} from "../server/closed-won";
import { DEAL_FIELDS, DEAL_FIELD_KEYS, isDealFieldKey } from "../deal-field-catalog";
import { applyDealMaps, dealMapRoots, type FieldMap } from "../server/sf-field-maps";

/**
 * The deal-side field map: an admin's rows turn whatever Salesforce calls a
 * field into one of the deal's, the aliases cover the rest, and what neither
 * consumed is reported. The catalogue the admin picks from and the schema
 * the endpoint runs must agree, or a row could name a target nothing writes.
 */

function map(over: Partial<FieldMap>): FieldMap {
  return {
    direction: "inbound_deal",
    source_path: "Amount",
    target_field: "amount",
    transform: "number",
    fill_policy: "never",
    required: false,
    active: true,
    ...over,
  };
}

// A Salesforce Flow posting the Opportunity as it is, lookups nested.
const opportunity = {
  Id: "0066g00000ABCDEAA5",
  Name: "Acme Roofing — Forms 2026",
  Amount: 90000,
  CloseDate: "2026-10-01",
  StageName: "Closed Won",
  Account: { Id: "0016g00000XYZ12AAB", Name: "Acme Roofing", Website: "https://acmeroofing.com" },
  Owner: { Email: "dana@gocanvas.com" },
  TIS_Assigned__r: { Name: "Priya Nair", Email: "priya.nair@gocanvas.com" },
  Industry__c: "Roofing contractors",
  Field_Users__c: "120",
  Onboarding_Type__c: "New Logo",
  Launch_Wanted_By__c: "2026-12-01",
  Internal_Notes__c: "Three crews, QuickBooks next year",
};

const maps: FieldMap[] = [
  map({ source_path: "Account.Name", target_field: "company", transform: "none", required: true }),
  map({ source_path: "Account.Id", target_field: "salesforce_id", transform: "none" }),
  map({ source_path: "Account.Website", target_field: "domain", transform: "none" }),
  map({ source_path: "Name", target_field: "opportunity", transform: "none" }),
  map({ source_path: "Amount", target_field: "amount", transform: "number" }),
  map({ source_path: "CloseDate", target_field: "close_date", transform: "date" }),
  map({ source_path: "Owner.Email", target_field: "rep_email", transform: "lowercase" }),
  map({
    source_path: "TIS_Assigned__r.Email",
    target_field: "implementation_owner",
    transform: "lowercase",
  }),
  map({ source_path: "Industry__c", target_field: "industry", transform: "none" }),
  map({ source_path: "Field_Users__c", target_field: "seats", transform: "number" }),
  map({ source_path: "Onboarding_Type__c", target_field: "path", transform: "none" }),
  map({
    source_path: "Launch_Wanted_By__c",
    target_field: "desired_launch_date",
    transform: "date",
  }),
];

describe("the catalogue and the schema agree", () => {
  it("every target an admin can pick is a field the endpoint resolves", () => {
    for (const key of DEAL_FIELD_KEYS) expect(CLOSED_WON_FIELDS).toContain(key);
  });
  it("exactly one target is required, and it is the company", () => {
    expect(DEAL_FIELDS.filter((f) => f.required).map((f) => f.key)).toEqual(["company"]);
  });
  it("refuses a target it does not know", () => {
    expect(isDealFieldKey("sow_value")).toBe(false);
    expect(isDealFieldKey("implementation_owner")).toBe(true);
  });
});

describe("applying the deal map", () => {
  it("reads dotted paths out of the raw Opportunity and transforms them", () => {
    const m = applyDealMaps(opportunity, maps);
    expect(m.values).toMatchObject({
      company: "Acme Roofing",
      salesforce_id: "0016g00000XYZ12AAB",
      amount: 90000,
      close_date: "2026-10-01",
      rep_email: "dana@gocanvas.com",
      implementation_owner: "priya.nair@gocanvas.com",
      seats: 120,
      path: "New Logo",
    });
    expect(m.sources["implementation_owner"]).toBe("TIS_Assigned__r.Email");
    expect(m.missingRequired).toEqual([]);
  });

  it("names a required source the payload did not carry", () => {
    const m = applyDealMaps({ Amount: 5 }, maps);
    expect(m.missingRequired).toEqual(["Account.Name"]);
  });

  it("skips inactive rows and the other directions", () => {
    const m = applyDealMaps(opportunity, [
      map({ active: false }),
      map({ direction: "inbound", source_path: "Amount", target_field: "sow_value" }),
    ]);
    expect(m.values).toEqual({});
  });

  it("knows which top-level keys it consumed", () => {
    expect([...dealMapRoots(maps)].sort()).toContain("TIS_Assigned__r");
  });
});

describe("resolving a row", () => {
  it("lets the map win over an alias, and fills the rest from aliases", () => {
    const body = { ...opportunity, tis: "somebody.else@gocanvas.com", notes: "from the alias" };
    const m = applyDealMaps(body, maps);
    const r = resolveClosedWonRow(body, m.values, dealMapRoots(maps));
    expect(r.row["implementation_owner"]).toBe("priya.nair@gocanvas.com");
    expect(r.sources["implementation_owner"]).toBe("map");
    expect(r.row["notes"]).toBe("from the alias");
    expect(r.sources["notes"]).toBe("alias");
  });

  it("reports what nobody consumed, by the key as it was sent", () => {
    const m = applyDealMaps(opportunity, maps);
    const r = resolveClosedWonRow(opportunity, m.values, dealMapRoots(maps));
    expect(r.unmappedKeys).toEqual(expect.arrayContaining(["StageName", "Internal_Notes__c"]));
    expect(r.unmappedKeys).not.toContain("Account");
    expect(r.unmappedKeys).not.toContain("TIS_Assigned__r");
  });

  it("parses the resolved row into the deal's facts", () => {
    const m = applyDealMaps(opportunity, maps);
    const r = resolveClosedWonRow(opportunity, m.values, dealMapRoots(maps));
    const parsed = closedWonSchema.parse(r.row);
    expect(parsed.company).toBe("Acme Roofing");
    expect(parsed.salesforce_id).toBe("0016g00000XYZ12AAB");
    expect(parsed.domain).toBe("acmeroofing.com");
    expect(parsed.implementation_owner).toBe("priya.nair@gocanvas.com");
    expect(parsed.path).toBe("new_logo");
    expect(parsed.industry).toBe("Roofing contractors");
    expect(parsed.handoff).toEqual({ desired_launch_date: "2026-12-01" });
    expect(intakeFactsOf(parsed)).toMatchObject({
      seats: 120,
      industry: "Roofing contractors",
      path: "new_logo",
      handoff: { desired_launch_date: "2026-12-01" },
    });
  });
});

describe("the TIS field", () => {
  it("takes an email or a name, and hands either to the assigner", async () => {
    const assign = vi.fn(async () => ({ assigneeName: "Priya Nair" }));
    const d: ClosedWonDeps = {
      upsertAccount: vi.fn(async () => ({
        account: { id: "deal-1", customer_id: null, stage: "closed_won" },
        created: true,
      })),
      recordContact: vi.fn(async () => {}),
      startOnboarding: vi.fn(async () => ({
        outcome: "started" as const,
        customerId: "cust-1",
        implementationId: "impl-1",
      })),
      existingImplementation: vi.fn(async () => null),
      assign,
    };
    const byName = closedWonSchema.parse({ company: "Acme", tis_assigned: "Priya Nair" });
    expect(byName.implementation_owner).toBe("Priya Nair");
    await ingestClosedWon(byName, d);
    expect(assign).toHaveBeenCalledWith("deal-1", "impl-1", "Priya Nair");

    const byEmail = closedWonSchema.parse({ company: "Acme", TIS: "Priya.Nair@GoCanvas.com" });
    expect(byEmail.implementation_owner).toBe("priya.nair@gocanvas.com");
  });

  it("drops a malformed email rather than assigning by it", () => {
    expect(
      closedWonSchema.parse({ company: "Acme", tis: "priya@" }).implementation_owner,
    ).toBeUndefined();
  });
});

describe("the onboarding type", () => {
  it("reads what Salesforce pick-lists say", () => {
    expect(pathFrom("New Logo")).toBe("new_logo");
    expect(pathFrom("Existing Customer")).toBe("existing");
    expect(pathFrom("DM Conversion")).toBe("dm_conversion");
    expect(pathFrom("Field Fusion")).toBe("field_fusion");
    expect(pathFrom("Renewal")).toBeUndefined();
  });
});
