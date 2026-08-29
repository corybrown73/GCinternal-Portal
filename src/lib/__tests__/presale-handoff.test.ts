import { describe, expect, it } from "vitest";
import { resolveHandoffCustomer, type HandoffInput } from "../presale-handoff";

/**
 * The presale → onboarding handoff decision. Two things are pinned deliberately:
 * a regression in the first silently merges two unrelated companies, and a
 * regression in the second silently creates a duplicate account.
 */

const base: HandoffInput = {
  flagOn: true,
  linkedCustomerId: null,
  salesforceMatchCustomerId: null,
  choice: {},
};

const on = (patch: Partial<HandoffInput>): HandoffInput => ({ ...base, ...patch });
const off = (patch: Partial<HandoffInput>): HandoffInput => ({ ...base, ...patch, flagOn: false });

describe("resolveHandoffCustomer — flag off (today's behavior, frozen)", () => {
  it("dead-ends on an already-linked deal", () => {
    expect(resolveHandoffCustomer(off({ linkedCustomerId: "cust-a" }))).toEqual({
      action: "already_linked",
      customerId: "cust-a",
    });
  });

  it("always creates a new account when the deal is unlinked", () => {
    expect(resolveHandoffCustomer(off({}))).toEqual({ action: "create_new" });
  });

  it("ignores a Salesforce match and any explicit choice", () => {
    expect(resolveHandoffCustomer(off({ salesforceMatchCustomerId: "cust-sf" }))).toEqual({
      action: "create_new",
    });
    expect(resolveHandoffCustomer(off({ choice: { customerId: "cust-picked" } }))).toEqual({
      action: "create_new",
    });
    expect(
      resolveHandoffCustomer(off({ linkedCustomerId: "cust-a", choice: { createNew: true } })),
    ).toEqual({ action: "already_linked", customerId: "cust-a" });
  });
});

describe("resolveHandoffCustomer — flag on", () => {
  it("reuses the account the deal is already linked to (no dead-end)", () => {
    expect(resolveHandoffCustomer(on({ linkedCustomerId: "cust-a" }))).toEqual({
      action: "use_existing",
      customerId: "cust-a",
      matchedBy: "deal_link",
    });
  });

  it("reuses the account whose salesforce_account_id matches the deal", () => {
    expect(resolveHandoffCustomer(on({ salesforceMatchCustomerId: "cust-sf" }))).toEqual({
      action: "use_existing",
      customerId: "cust-sf",
      matchedBy: "salesforce",
    });
  });

  it("never matches by name: an unmatched deal asks for a decision instead of creating", () => {
    // Same-named company already in `customers` is irrelevant — nothing here
    // looks at names, so the only outcome is an explicit choice.
    expect(resolveHandoffCustomer(on({}))).toEqual({
      action: "needs_choice",
      reason: "no_salesforce_match",
    });
  });

  it("links to a picked account only when there is nothing else to match on", () => {
    expect(resolveHandoffCustomer(on({ choice: { customerId: "cust-picked" } }))).toEqual({
      action: "use_existing",
      customerId: "cust-picked",
      matchedBy: "chosen",
    });
  });

  it("creates a new account only on an explicit instruction", () => {
    expect(resolveHandoffCustomer(on({ choice: { createNew: true } }))).toEqual({
      action: "create_new",
    });
    expect(resolveHandoffCustomer(on({ choice: { createNew: false } }))).toEqual({
      action: "needs_choice",
      reason: "no_salesforce_match",
    });
  });

  it("prefers the Salesforce match over an explicit create-new", () => {
    expect(
      resolveHandoffCustomer(
        on({ salesforceMatchCustomerId: "cust-sf", choice: { createNew: true } }),
      ),
    ).toEqual({ action: "use_existing", customerId: "cust-sf", matchedBy: "salesforce" });
  });

  it("agreeing with the match is not a conflict", () => {
    expect(
      resolveHandoffCustomer(
        on({ salesforceMatchCustomerId: "cust-sf", choice: { customerId: "cust-sf" } }),
      ),
    ).toEqual({ action: "use_existing", customerId: "cust-sf", matchedBy: "salesforce" });
    expect(
      resolveHandoffCustomer(on({ linkedCustomerId: "cust-a", choice: { customerId: "cust-a" } })),
    ).toEqual({ action: "use_existing", customerId: "cust-a", matchedBy: "deal_link" });
  });

  it("refuses a stale pick that contradicts the link or the Salesforce match", () => {
    expect(
      resolveHandoffCustomer(
        on({ linkedCustomerId: "cust-a", choice: { customerId: "cust-other" } }),
      ),
    ).toEqual({ action: "conflict", reason: "deal_link_differs", customerId: "cust-a" });
    expect(
      resolveHandoffCustomer(
        on({ salesforceMatchCustomerId: "cust-sf", choice: { customerId: "cust-other" } }),
      ),
    ).toEqual({ action: "conflict", reason: "salesforce_match_differs", customerId: "cust-sf" });
  });
});
