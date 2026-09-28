import { describe, expect, it } from "vitest";

import { displayName, possessive } from "../names";

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
