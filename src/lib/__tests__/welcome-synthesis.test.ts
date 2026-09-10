import { describe, expect, it } from "vitest";

import { synthesisFromBrief } from "../welcome-synthesis";

const brief = {
  current_process: [
    {
      title: "Field",
      bullets: [
        "Three crews fill in a paper ticket per well.",
        "Photos live on the foreman's phone.",
      ],
    },
    { title: "Office", bullets: ["The office retypes tickets into QuickBooks on Fridays."] },
  ],
  stakeholders: [
    { name: "Priya Nair", role: "Solutions Engineer, GoCanvas", notes: "" },
    { name: "Tom Alvarez", role: "Operations Manager", notes: "Owns the rollout" },
  ],
  kickoff: {
    day_90_definition: "Every plugging job invoiced the same day it closes.",
    scope: [
      { workflow: "Daily Water Haul Ticket", replaces: "paper ticket", teams: "All crews" },
      { workflow: "Chemical Delivery Ticket", replaces: "the delivery log book", teams: null },
      { workflow: "JSA", replaces: null, teams: null },
    ],
  },
};

describe("synthesisFromBrief", () => {
  it("reads today, what comes next, the champion and day 90 out of a brief", () => {
    const s = synthesisFromBrief(brief)!;
    expect(s.currentProcess).toBe(
      "Three crews fill in a paper ticket per well; photos live on the foreman's phone; the office retypes tickets into QuickBooks on Fridays.",
    );
    expect(s.nextUseCases).toEqual([
      { name: "Chemical Delivery Ticket", objective: "the delivery log book" },
      { name: "JSA", objective: null },
    ]);
    expect(s.champion).toEqual({ name: "Tom Alvarez", role: "Operations Manager" });
    expect(s.day90).toBe("Every plugging job invoiced the same day it closes.");
  });

  it("is null for nothing, and for a brief that said nothing usable", () => {
    expect(synthesisFromBrief(null)).toBeNull();
    expect(synthesisFromBrief({})).toBeNull();
    expect(
      synthesisFromBrief({ current_process: [], stakeholders: [], kickoff: { scope: [] } }),
    ).toBeNull();
  });

  it("never picks our own people as the customer's champion", () => {
    const s = synthesisFromBrief({
      stakeholders: [{ name: "Priya Nair", role: "Account Manager", notes: "GoCanvas" }],
    });
    expect(s).toBeNull();
  });
});
