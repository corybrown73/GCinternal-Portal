import { describe, expect, it } from "vitest";
import { allowedImplIds, grantAllows, type CustomerGrant } from "../tickets.server";

/**
 * Portal authorization. Every portal read/write runs on the service-role
 * client, so these pure helpers — not RLS — are what keep an
 * implementation-scoped customer contact out of a sibling implementation's
 * data. Pinned deliberately: a regression here is a cross-customer leak.
 */

const ACCOUNT_WIDE: CustomerGrant[] = [{ customer_id: "cust-a", implementation_id: null }];
const SCOPED: CustomerGrant[] = [{ customer_id: "cust-a", implementation_id: "impl-1" }];
const TWO_SCOPES: CustomerGrant[] = [
  { customer_id: "cust-a", implementation_id: "impl-1" },
  { customer_id: "cust-a", implementation_id: "impl-2" },
];

describe("allowedImplIds", () => {
  it("returns null (meaning all) for an account-wide grant", () => {
    expect(allowedImplIds(ACCOUNT_WIDE, "cust-a")).toBeNull();
  });

  it("returns the scoped set for scoped grants", () => {
    expect(allowedImplIds(SCOPED, "cust-a")).toEqual(new Set(["impl-1"]));
    expect(allowedImplIds(TWO_SCOPES, "cust-a")).toEqual(new Set(["impl-1", "impl-2"]));
  });

  it("returns an empty set for a customer the caller has no grant on", () => {
    expect(allowedImplIds(SCOPED, "cust-b")).toEqual(new Set());
  });

  it("an account-wide grant wins over a scoped one for the same customer", () => {
    const mixed: CustomerGrant[] = [...SCOPED, ...ACCOUNT_WIDE];
    expect(allowedImplIds(mixed, "cust-a")).toBeNull();
  });
});

describe("grantAllows", () => {
  it("account-wide grants see every implementation of their customer", () => {
    expect(grantAllows(ACCOUNT_WIDE, "cust-a", "impl-1")).toBe(true);
    expect(grantAllows(ACCOUNT_WIDE, "cust-a", "impl-99")).toBe(true);
  });

  it("a scoped grant sees its own implementation but NOT a sibling", () => {
    expect(grantAllows(SCOPED, "cust-a", "impl-1")).toBe(true);
    expect(grantAllows(SCOPED, "cust-a", "impl-2")).toBe(false);
  });

  it("never crosses to another customer, scoped or not", () => {
    expect(grantAllows(SCOPED, "cust-b", "impl-1")).toBe(false);
    expect(grantAllows(ACCOUNT_WIDE, "cust-b", null)).toBe(false);
    expect(grantAllows([], "cust-a", "impl-1")).toBe(false);
  });

  it("account-level records (no implementation) stay visible to scoped grants", () => {
    // An account-level ticket is about the account, not a sibling project.
    expect(grantAllows(SCOPED, "cust-a", null)).toBe(true);
  });
});
