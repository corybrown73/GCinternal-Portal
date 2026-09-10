import { describe, expect, it } from "vitest";

import { companyNameFrom } from "../company-name";

describe("companyNameFrom", () => {
  it("cuts the Salesforce opportunity suffix off the names we actually get", () => {
    expect(companyNameFrom("West-Com & TV-Direct NL-Demo Request-Jul 2026")).toBe("West-Com & TV");
    expect(companyNameFrom("Dr Soot Chimney Sweep-Direct NL-Talk to an Expert-Sep 2026")).toBe(
      "Dr Soot Chimney Sweep",
    );
    expect(companyNameFrom("Varley Group - GoCanvas Transition")).toBe("Varley Group");
    expect(companyNameFrom("Acme Roofing - New Logo - Sep 2026")).toBe("Acme Roofing");
  });

  it("leaves a plain company name alone, hyphens included", () => {
    expect(companyNameFrom("Summit Line Construction")).toBe("Summit Line Construction");
    expect(companyNameFrom("West-Com & TV")).toBe("West-Com & TV");
    expect(companyNameFrom("Delta Water Works")).toBe("Delta Water Works");
  });

  it("never returns nothing for something", () => {
    expect(companyNameFrom("")).toBe("");
    expect(companyNameFrom(null)).toBe("");
    expect(companyNameFrom("  Maverick   Well Pluggers ")).toBe("Maverick Well Pluggers");
  });
});
