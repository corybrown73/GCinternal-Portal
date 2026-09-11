import { describe, expect, it } from "vitest";

import { readIntake } from "../intake-answers";
import { prefillFromSynthesis } from "../intake-prefill";

const brief = {
  current_process: [{ title: "Field", bullets: ["Paper tickets on the truck."] }],
  stakeholders: [],
  kickoff: {
    day_90_definition: null,
    scope: [
      { workflow: "Daily Water Haul Ticket", replaces: "paper ticket", teams: null },
      { workflow: "Chemical Delivery Ticket", replaces: null, teams: null },
    ],
    integrations: ["QuickBooks Online · invoice from closed tickets"],
    licensed_seats: "about 40 on the Business plan",
  },
  expansion: { integration_target: null },
};

describe("prefillFromSynthesis", () => {
  it("fills every blank the synthesis can speak to", () => {
    const { patch, filled } = prefillFromSynthesis(readIntake({ forms_built: false }), brief);
    expect(patch.current_process).toBe("Paper tickets on the truck.");
    expect(patch.wanted_forms?.map((f) => f.name)).toEqual([
      "Daily Water Haul Ticket",
      "Chemical Delivery Ticket",
    ]);
    expect(patch.field_users).toBe(40);
    expect(patch.timeline?.services).toEqual([
      { id: "syn-int-1", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 },
    ]);
    expect(filled).toEqual([
      "the process today",
      "2 forms to build",
      "people in the field",
      "the QuickBooks Online integration",
    ]);
  });

  it("never overwrites what a person typed", () => {
    const intake = readIntake({
      forms_built: false,
      current_process: "Whiteboard in the shop.",
      field_users: 12,
      wanted_forms: [{ id: "f-1", name: "JSA" }],
      timeline: { services: [{ id: "pdf", kind: "custom_pdf", name: "Invoice PDF", phase: 2 }] },
    });
    const { patch, filled } = prefillFromSynthesis(intake, brief);
    expect(patch).toEqual({});
    expect(filled).toEqual([]);
  });

  it("is quiet for nothing", () => {
    expect(prefillFromSynthesis(readIntake(null), null)).toEqual({ patch: {}, filled: [] });
    expect(prefillFromSynthesis(readIntake(null), {})).toEqual({ patch: {}, filled: [] });
  });
});
