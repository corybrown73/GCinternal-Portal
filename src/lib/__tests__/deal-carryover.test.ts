import { describe, expect, it } from "vitest";

import { applyCarryover, carryoverSummary, type CarryTarget } from "@/lib/deal-carryover";

const emptyTarget = (): CarryTarget => ({
  customerGoals: "",
  domain: "",
  contactName: "",
  contactEmail: "",
  contactRole: "",
  salesOwner: "",
  salesOwnerId: "",
});

const ridgeline = {
  summary: "Replace paper dig tickets before the spring season.",
  domain: "ridgelineexc.com",
  contactName: "Dana Whitfield",
  contactEmail: "dana@ridgelineexc.com",
  contactRole: "Operations Manager",
  salesOwnerId: "33333333-3333-4333-8333-333333333333",
  salesOwnerName: "Corey King",
};

describe("applyCarryover", () => {
  it("fills an empty draft from the deal", () => {
    const { target } = applyCarryover(ridgeline, emptyTarget());
    expect(target.customerGoals).toBe("Replace paper dig tickets before the spring season.");
    expect(target.contactName).toBe("Dana Whitfield");
    expect(target.domain).toBe("ridgelineexc.com");
    expect(target.salesOwner).toBe("Corey King");
    expect(target.salesOwnerId).toBe("33333333-3333-4333-8333-333333333333");
  });

  // Rule 1. The deal is a default, not an authority — somebody who has already
  // written their own goal is not corrected by a summary written months ago.
  it("never overwrites something a person typed", () => {
    const typed = { ...emptyTarget(), customerGoals: "Cut ticket turnaround to same-day." };
    const { target, carried } = applyCarryover(ridgeline, typed);
    expect(target.customerGoals).toBe("Cut ticket turnaround to same-day.");
    expect(carried.map((c) => c.field)).not.toContain("customerGoals");
  });

  it("treats whitespace as empty on both sides", () => {
    const { target } = applyCarryover({ ...ridgeline, domain: "  " }, emptyTarget());
    expect(target.domain).toBe("");
  });

  // Rule 2. The list is what the dialog renders, built by the same pass that
  // does the filling, so the two cannot drift into showing one thing and
  // saving another.
  it("reports exactly what it filled, and nothing it did not", () => {
    const thin = {
      ...ridgeline,
      contactName: null,
      contactEmail: null,
      contactRole: null,
      salesOwnerId: null,
      salesOwnerName: null,
    };
    const { carried } = applyCarryover(thin, emptyTarget());
    expect(carried.map((c) => c.field).sort()).toEqual(["customerGoals", "domain"]);
  });

  // salesOwnerId is machinery. Reporting it as its own line would show a uuid
  // to a person under a heading that already named the human.
  it("does not list the resolved id separately from the name", () => {
    const { carried } = applyCarryover(ridgeline, emptyTarget());
    expect(carried.filter((c) => c.field === "salesOwnerId")).toHaveLength(0);
    expect(carried.some((c) => c.value === "Corey King")).toBe(true);
  });
});

describe("carryoverSummary", () => {
  // An empty box looks broken; a sentence about the deal is information.
  it("says the deal is thin rather than showing nothing", () => {
    expect(carryoverSummary([])).toContain("nothing recorded");
  });

  it("names every field it filled, so the sentence matches the list", () => {
    const { carried } = applyCarryover(ridgeline, emptyTarget());
    const summary = carryoverSummary(carried);
    for (const field of carried) {
      expect(summary).toContain(field.label.toLowerCase());
    }
  });
});
