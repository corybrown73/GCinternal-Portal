import { describe, expect, it } from "vitest";

import { emailAllowed } from "../server/email";

describe("emailAllowed — who gets which email", () => {
  const doer = { internal: true, manager: false };
  const manager = { internal: true, manager: true };
  const customer = { internal: false, manager: false };

  it("a person doing the work is emailed for assignments and their own requests only", () => {
    expect(emailAllowed("assignment", doer)).toBe(true);
    expect(emailAllowed("account", doer)).toBe(true);
    expect(emailAllowed("requested", doer)).toBe(true);
    expect(emailAllowed("notification", doer)).toBe(false);
  });

  it("managers get everything", () => {
    expect(emailAllowed("notification", manager)).toBe(true);
    expect(emailAllowed("assignment", manager)).toBe(true);
  });

  it("customers are outside the rule", () => {
    expect(emailAllowed("notification", customer)).toBe(true);
  });
});
