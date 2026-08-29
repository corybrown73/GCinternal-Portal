import { describe, expect, it } from "vitest";
import { handoffCompleteness, type HandoffInputs } from "../handoff-completeness";

/**
 * The gate's whole value is that "incomplete" can always name what is missing.
 * These tests pin that the count is derived from the listed items — never
 * asserted independently of them — and that absence is never guessed into
 * presence.
 */

const empty: HandoffInputs = {
  implementation: {},
  packet: {},
  successCriteria: [],
  contacts: [],
  commitments: [],
  risks: [],
  gongReports: [],
};

const full: HandoffInputs = {
  implementation: {
    customer_goals: "Cut inspection cycle time in half",
    sow_document_url: "https://example.com/sow.pdf",
    discovery_board_url: "https://miro.example/board",
  },
  packet: {
    integration_dependencies: "SAP work orders",
    data_migration_needs: "3 years of forms",
    roadmap_promises: "Offline photo sync, Q3",
    discovery_call_links: [{ label: "Discovery 1", url: "https://x" }],
  },
  successCriteria: [{ description: "Cycle time", metric: "hours" }],
  contacts: [
    { name: "Dana", role: "Economic buyer", email: "d@x.com" },
    { name: "Sam", role: "Champion", email: "s@x.com" },
    { name: "Alex", role: "Day-to-day owner", email: "a@x.com" },
  ],
  commitments: [{}],
  risks: [{}],
  gongReports: [{}],
};

describe("handoffCompleteness", () => {
  it("counts nothing present on an empty handoff, and names every gap", () => {
    const result = handoffCompleteness(empty);
    expect(result.present).toBe(0);
    expect(result.complete).toBe(false);
    expect(result.missingKeys).toContain("business_outcome");
    expect(result.missingKeys).toContain("success_measures");
    expect(result.missingKeys).toContain("economic_buyer");
  });

  it("is complete once every required item is present", () => {
    const result = handoffCompleteness(full);
    expect(result.complete).toBe(true);
    expect(result.missingKeys).toEqual([]);
    expect(result.present).toBe(result.required);
  });

  it("derives the count from the items rather than asserting it separately", () => {
    const result = handoffCompleteness(empty);
    const requiredItems = result.items.filter((i) => !i.optional);
    expect(result.required).toBe(requiredItems.length);
    expect(result.present).toBe(requiredItems.filter((i) => i.present).length);
    expect(result.missingKeys).toEqual(requiredItems.filter((i) => !i.present).map((i) => i.key));
  });

  it("never lets an optional item block completeness", () => {
    // Everything required, nothing optional: a handoff with no integration work
    // is complete, and asking for "n/a" in every box teaches people to type noise.
    const noOptional: HandoffInputs = {
      ...full,
      packet: {},
      implementation: { ...full.implementation, discovery_board_url: null },
    };
    const result = handoffCompleteness(noOptional);
    expect(result.complete).toBe(true);
    expect(result.items.some((i) => i.optional && !i.present)).toBe(true);
  });

  it("gives every item a reason, present or missing — never a bare tick", () => {
    for (const result of [handoffCompleteness(empty), handoffCompleteness(full)]) {
      for (const item of result.items) {
        expect(item.detail.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("matches stakeholder roles on intent, since the role field is free text", () => {
    const result = handoffCompleteness({
      ...empty,
      contacts: [
        { name: "Dana", role: "Exec sponsor" },
        { name: "Sam", role: "our champion internally" },
        { name: "Alex", role: "Project Manager" },
      ],
    });
    expect(result.missingKeys).not.toContain("economic_buyer");
    expect(result.missingKeys).not.toContain("champion");
    expect(result.missingKeys).not.toContain("day_to_day_owner");
  });

  it("does not guess an unclassifiable role into a stakeholder slot", () => {
    const result = handoffCompleteness({
      ...empty,
      contacts: [{ name: "Jo", role: "Accounts payable" }],
    });
    expect(result.missingKeys).toContain("economic_buyer");
    expect(result.missingKeys).toContain("champion");
    expect(result.missingKeys).toContain("day_to_day_owner");
  });

  it("treats whitespace as absent", () => {
    const result = handoffCompleteness({
      ...empty,
      implementation: { customer_goals: "   " },
    });
    expect(result.missingKeys).toContain("business_outcome");
  });

  it("accepts a SOW reference when no document is attached", () => {
    const result = handoffCompleteness({
      ...empty,
      implementation: { sow_reference: "SOW-1042" },
    });
    expect(result.missingKeys).not.toContain("sow_link");
  });

  it("counts Gong reports and manual call links together", () => {
    const gongOnly = handoffCompleteness({ ...empty, gongReports: [{}] });
    expect(gongOnly.missingKeys).not.toContain("discovery_calls");

    const linksOnly = handoffCompleteness({
      ...empty,
      packet: { discovery_call_links: [{ label: "Call", url: "https://x" }] },
    });
    expect(linksOnly.missingKeys).not.toContain("discovery_calls");
  });
});
