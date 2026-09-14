import { describe, expect, it } from "vitest";

import { firstName, normalizeBookingUrl } from "../team-profile";

describe("normalizeBookingUrl", () => {
  it("accepts https, adds it when missing, trims a trailing slash", () => {
    expect(normalizeBookingUrl("https://calendly.com/cory/30min/")).toBe(
      "https://calendly.com/cory/30min",
    );
    expect(normalizeBookingUrl("  calendly.com/cory ")).toBe("https://calendly.com/cory");
    expect(normalizeBookingUrl("")).toBeNull();
    expect(normalizeBookingUrl(null)).toBeNull();
  });
  it("refuses anything that is not an https link to a real domain", () => {
    expect(() => normalizeBookingUrl("http://calendly.com/cory")).toThrow(/https/);
    expect(() => normalizeBookingUrl("javascript:alert(1)")).toThrow();
    expect(() => normalizeBookingUrl("localhost")).toThrow(/domain/);
  });
});

describe("firstName", () => {
  it("takes the first word, and has a fallback", () => {
    expect(firstName("Cory Brown")).toBe("Cory");
    expect(firstName("  Priya  Nair ")).toBe("Priya");
    expect(firstName(null)).toBe("us");
  });
});
