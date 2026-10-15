import { describe, expect, it } from "vitest";

import { customerFacingName, displayName, looksInternal, possessive } from "../names";

describe("the customer's name in customer-facing copy", () => {
  it("drops the services bookkeeping suffix and the opportunity clutter", () => {
    expect(displayName("Varley Group — services")).toBe("Varley Group");
    expect(displayName("Varley Group - services")).toBe("Varley Group");
    expect(displayName("Varley Group")).toBe("Varley Group");
    expect(displayName(null)).toBe("");
  });

  it("writes the possessive the way English does", () => {
    expect(possessive("Varley Group")).toBe("Varley Group's");
    expect(possessive("Acme Services")).toBe("Acme Services'");
    expect(possessive("")).toBe("");
  });
});

describe("internal markers on the deal name (display only)", () => {
  it("drops a test prefix, a trailing parenthetical and a close period", () => {
    expect(displayName("QA Test - Summit Plumbing (Claude QA)")).toBe("Summit Plumbing");
    expect(displayName("Test - Summit Plumbing")).toBe("Summit Plumbing");
    expect(displayName("QA test: Summit Plumbing")).toBe("Summit Plumbing");
    expect(displayName("Midland Industrial Services LLC (ATG) - SEP '26")).toBe(
      "Midland Industrial Services LLC",
    );
    expect(displayName("Midland Industrial Services LLC - SEP 2026")).toBe(
      "Midland Industrial Services LLC",
    );
    expect(displayName("Midland Industrial Services LLC – Sept. ’26")).toBe(
      "Midland Industrial Services LLC",
    );
  });

  it("leaves a real name alone", () => {
    expect(displayName("Test-Rite Products")).toBe("Test-Rite Products");
    expect(displayName("Smith (Holdings) Ltd")).toBe("Smith (Holdings) Ltd");
    expect(displayName("Summit Line Construction")).toBe("Summit Line Construction");
    expect(displayName("Mayfield Dairy - 2026 rollout")).toBe("Mayfield Dairy - 2026 rollout");
  });

  it("keeps the name when it is nothing but markers", () => {
    expect(displayName("(ATG)")).toBe("(ATG)");
  });

  it("lets a saved customer-facing name win", () => {
    expect(
      customerFacingName({
        name: "QA Test - Summit Plumbing (Claude QA)",
        display_name: "Summit Plumbing & Heating",
      }),
    ).toBe("Summit Plumbing & Heating");
    expect(customerFacingName({ name: "QA Test - Summit Plumbing (Claude QA)" })).toBe(
      "Summit Plumbing",
    );
  });

  it("asks for a customer-facing name while the deal name carries a marker", () => {
    expect(looksInternal("QA Test - Summit Plumbing (Claude QA)")).toBe(true);
    expect(looksInternal("Midland Industrial Services LLC (ATG) - SEP '26")).toBe(true);
    expect(looksInternal("Summit Plumbing - Sep 2026")).toBe(true);
    expect(looksInternal("Summit Plumbing")).toBe(false);
    expect(looksInternal("Test-Rite Products")).toBe(false);
  });
});
