import { describe, expect, it } from "vitest";

import { createImplementationInput, toImplementationPatch } from "@/lib/implementation-input";

const base = {
  customerId: "11111111-1111-4111-8111-111111111111",
  newCustomer: null,
  name: "Ridgeline rollout",
  ownerId: null,
  salesOwner: null,
  tier: null,
  sowReference: null,
  sowValue: null,
  sowSignedDate: null,
  contractStartDate: null,
  targetLaunchDate: null,
  customerGoals: null,
  externalRef: null,
  dealId: null,
};

describe("creating an implementation from a deal", () => {
  it("carries the deal onto the record", () => {
    const parsed = createImplementationInput.safeParse({
      ...base,
      dealId: "22222222-2222-4222-8222-222222222222",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(toImplementationPatch(parsed.data).deal_id).toBe(
        "22222222-2222-4222-8222-222222222222",
      );
    }
  });

  // Plenty of projects have no deal — an expansion agreed on a call, a
  // migration the TIS opened themselves. A required field here would be
  // answered with whatever deal was nearest, which is worse than no answer.
  it("still accepts a project with no deal", () => {
    const parsed = createImplementationInput.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(toImplementationPatch(parsed.data).deal_id).toBeNull();
  });

  it("refuses anything that is not a deal id", () => {
    expect(createImplementationInput.safeParse({ ...base, dealId: "Ridgeline" }).success).toBe(
      false,
    );
  });
});
