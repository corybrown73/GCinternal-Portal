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
    // The brief's paraphrase, marked as such: the deck quotes only a person's words.
    expect(patch.current_process_source).toBe("ai");
    expect(patch.wanted_forms?.map((f) => f.name)).toEqual([
      "Daily Water Haul Ticket",
      "Chemical Delivery Ticket",
    ]);
    expect(patch.field_users).toBe(40);
    // An integration named on a call is not on the plan: only the SOW read adds services.
    expect(patch.timeline).toBeUndefined();
    expect(filled).toEqual(["the process today", "2 forms to build", "people in the field"]);
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

describe("Device Magic conversions", () => {
  it("reads the kind of account from the pasted notes when nobody has said", async () => {
    const { mentionsDeviceMagic } = await import("../intake-prefill");
    expect(mentionsDeviceMagic("They have 40 users on Device Magic and want to move by Q1.")).toBe(
      true,
    );
    expect(mentionsDeviceMagic("Converting from DM; ~30 DM forms in use.")).toBe(true);
    expect(mentionsDeviceMagic("Ray will DM me the site list.")).toBe(false);
    const { patch, filled } = prefillFromSynthesis(
      readIntake({ forms_built: false }),
      brief,
      "Ops runs everything in Device Magic today.",
    );
    expect(patch.path).toBeUndefined();
    expect(patch.path_suggested).toBe("dm_conversion");
    expect(filled).toContain("a suggested flow (Device Magic conversion)");
  });

  it("leaves a path a person chose alone", () => {
    const { patch } = prefillFromSynthesis(
      readIntake({ path: "new_logo", forms_built: false }),
      brief,
      "Ops runs everything in Device Magic today.",
    );
    expect(patch.path).toBeUndefined();
    expect(patch.path_suggested).toBeUndefined();
  });
});
