import { describe, expect, it } from "vitest";

import {
  purchaseFor,
  reconcilePurchased,
  type PurchaseRecord,
  type PurchaseSolution,
} from "../complete-solutions-purchase";

/**
 * Purchased scope against the deal's purchase record. The check is read only: it
 * says where the signed scope and the deal disagree, and changes neither.
 */

const RECORDS: PurchaseRecord[] = [
  { id: "svc-1", name: "Inspections", kind: "custom_pdf" },
  { id: "svc-2", name: "Dispatch feed", kind: "integration" },
  { id: "svc-3", name: "Fuel log", kind: "analytics" },
];

function sol(over: Partial<PurchaseSolution> & { id: string; title: string }): PurchaseSolution {
  return { scope: "purchased", purchasedServiceId: null, archived: false, ...over };
}

describe("a solution matches a purchase record item", () => {
  it("by the name the item carries, ignoring case and spacing", () => {
    expect(purchaseFor("  inspections ", RECORDS)?.id).toBe("svc-1");
  });

  it("not at all when no item has the name, or more than one does", () => {
    expect(purchaseFor("Hazard reporting", RECORDS)).toBeNull();
    expect(
      purchaseFor("Fuel log", [...RECORDS, { id: "svc-9", name: "Fuel log", kind: "other" }]),
    ).toBeNull();
  });
});

describe("the check against the deal's purchase record", () => {
  it("says nothing to check when the implementation has no deal", () => {
    expect(
      reconcilePurchased({
        hasRecord: false,
        solutions: [sol({ id: "s1", title: "Inspections" })],
        records: RECORDS,
      }),
    ).toEqual({ hasRecord: false, solutionsWithoutRecord: [], recordsWithoutSolution: [] });
  });

  it("is clean when every purchased solution is linked to, or named as, a purchase item", () => {
    const check = reconcilePurchased({
      hasRecord: true,
      solutions: [
        sol({ id: "s1", title: "Inspections", purchasedServiceId: "svc-1" }),
        sol({ id: "s2", title: "Dispatch feed" }),
        sol({ id: "s3", title: "Fuel log", purchasedServiceId: "svc-3" }),
      ],
      records: RECORDS,
    });
    expect(check.solutionsWithoutRecord).toEqual([]);
    expect(check.recordsWithoutSolution).toEqual([]);
  });

  it("flags a purchased solution that matches no purchase item", () => {
    const check = reconcilePurchased({
      hasRecord: true,
      solutions: [sol({ id: "s9", title: "Hazard reporting" })],
      records: RECORDS,
    });
    expect(check.solutionsWithoutRecord).toEqual([{ solutionId: "s9", title: "Hazard reporting" }]);
  });

  it("flags a purchase item that no active solution delivers", () => {
    const check = reconcilePurchased({
      hasRecord: true,
      solutions: [sol({ id: "s1", title: "Inspections", purchasedServiceId: "svc-1" })],
      records: RECORDS,
    });
    expect(check.recordsWithoutSolution.map((r) => r.id)).toEqual(["svc-2", "svc-3"]);
  });

  it("does not check a requested solution: it is not purchased scope", () => {
    const check = reconcilePurchased({
      hasRecord: true,
      solutions: [sol({ id: "r1", title: "Hazard reporting", scope: "requested" })],
      records: [],
    });
    expect(check.solutionsWithoutRecord).toEqual([]);
  });

  it("does not count an archived solution as delivering a purchase item", () => {
    const check = reconcilePurchased({
      hasRecord: true,
      solutions: [
        sol({ id: "s1", title: "Inspections", purchasedServiceId: "svc-1", archived: true }),
      ],
      records: RECORDS,
    });
    expect(check.recordsWithoutSolution.map((r) => r.id)).toContain("svc-1");
  });

  it("treats a link to an item that no longer exists as no link, and checks the name instead", () => {
    const check = reconcilePurchased({
      hasRecord: true,
      solutions: [sol({ id: "s1", title: "Fuel log", purchasedServiceId: "svc-gone" })],
      records: RECORDS,
    });
    expect(check.solutionsWithoutRecord).toEqual([]);
  });
});
