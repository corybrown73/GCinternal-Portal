import { describe, expect, it } from "vitest";

import {
  addWantedForm,
  EMPTY_INTAKE,
  flowAnswered,
  intakeAnswersSchema,
  intakeStatus,
  INDUSTRIES,
  makeFirstWantedForm,
  readIntake,
  toggleWantedTemplate,
} from "../intake-answers";

/**
 * The intake answers are a jsonb column whose shape lives here, so this is
 * where a malformed row has to be made harmless.
 */

describe("readIntake", () => {
  it("returns a complete object from nothing", () => {
    expect(readIntake(null)).toEqual(EMPTY_INTAKE);
    expect(readIntake(undefined)).toEqual(EMPTY_INTAKE);
    expect(readIntake({})).toEqual(EMPTY_INTAKE);
  });

  it("fills in what a partial row leaves out", () => {
    const a = readIntake({ forms_built: false, industry: "Roofing" });
    expect(a.industry).toBe("Roofing");
    expect(a.uploaded_forms).toEqual([]);
    expect(a.chosen_templates).toEqual([]);
    expect(a.field_users).toBeNull();
  });

  // A hand-edited or corrupted row must not take the deal page down.
  it("falls back to empty rather than throwing on garbage", () => {
    expect(readIntake("not an object")).toEqual(EMPTY_INTAKE);
    expect(readIntake({ field_users: "twenty-four" })).toEqual(EMPTY_INTAKE);
    expect(readIntake({ uploaded_forms: [{ path: "" }] })).toEqual(EMPTY_INTAKE);
  });
});

describe("the schema", () => {
  it("refuses a negative head count and a non-uuid template id", () => {
    expect(intakeAnswersSchema.safeParse({ field_users: -1 }).success).toBe(false);
    expect(intakeAnswersSchema.safeParse({ chosen_templates: ["nope"] }).success).toBe(false);
  });
});

describe("intakeStatus — what to ask next", () => {
  it("starts with the sale — were integrations or solutions involved — then who they are", () => {
    expect(intakeStatus(EMPTY_INTAKE)).toEqual({
      done: false,
      next: "Were integrations or solutions involved?",
    });
    expect(intakeStatus(readIntake({ solutions_involved: false }))).toEqual({
      done: false,
      next: "What industry are they in?",
    });
  });

  it("never asks about forms: that question belongs to the flow, and step 2 must not wait on it", () => {
    // The old rule made step 2 wait for an answer only step 3 could give,
    // and step 3 was locked until step 2 finished. Nobody could get out.
    const facts = readIntake({
      solutions_involved: true,
      industry: "Roofing",
      field_users: 40,
      current_process: "Paper tickets",
    });
    expect(facts.forms_built).toBeNull();
    expect(intakeStatus(facts)).toEqual({ done: true, next: null });
    expect(flowAnswered(facts)).toBe(false);
    const withFlow = readIntake({
      ...facts,
      path: "new_logo",
      forms_built: false,
      wanted_forms: [{ id: "f1", name: "Daily Job Card", template_id: null }],
    });
    expect(flowAnswered(withFlow)).toBe(true);
  });

  it("on the no branch, needs the industry, the field count and the process today", () => {
    const no = readIntake({ solutions_involved: false, forms_built: false });
    expect(intakeStatus(no).next).toMatch(/industry/);
    const withIndustry = readIntake({
      solutions_involved: false,
      forms_built: false,
      industry: "Roofing",
    });
    expect(intakeStatus(withIndustry).next).toMatch(/in the field/);
    const withCount = readIntake({
      solutions_involved: false,
      forms_built: false,
      industry: "Roofing",
      field_users: 40,
    });
    expect(intakeStatus(withCount).next).toMatch(/process today/);
    const done = readIntake({
      solutions_involved: false,
      forms_built: false,
      industry: "Roofing",
      field_users: 40,
      current_process: "Paper, then rekeyed on Fridays.",
    });
    expect(intakeStatus(done).done).toBe(true);
    // "Complete" with the field count blank was the lie the audit caught.
    const noCount = readIntake({
      forms_built: false,
      industry: "Roofing",
      current_process: "Paper.",
    });
    expect(intakeStatus(noCount).done).toBe(false);
  });
});

describe("the industry list", () => {
  it("covers the industries production customers already carry", () => {
    for (const seen of [
      "Energy",
      "Environmental",
      "Facilities",
      "HVAC",
      "Mining",
      "Pipeline",
      "Roofing",
      "Utilities",
    ]) {
      expect(INDUSTRIES).toContain(seen);
    }
  });
});

describe("the forms they want built", () => {
  const a = readIntake({ forms_built: false });
  const card = { id: "11111111-1111-4111-8111-111111111111", name: "Daily Site Inspection" };

  it("picking a card adds it to the list and to chosen_templates; picking again removes it", () => {
    const on = toggleWantedTemplate(a, card);
    expect(on.wanted_forms.map((f) => f.name)).toEqual(["Daily Site Inspection"]);
    expect(on.wanted_forms[0]!.template_id).toBe(card.id);
    expect(on.chosen_templates).toEqual([card.id]);
    const off = toggleWantedTemplate({ ...a, ...on }, card);
    expect(off.wanted_forms).toEqual([]);
    expect(off.chosen_templates).toEqual([]);
  });

  it("a form named on the call has no card behind it, and the first on the list is the first form", () => {
    const one = addWantedForm(a, "  Chemical Delivery Ticket ");
    const two = addWantedForm({ ...a, ...one }, "Job Safety Analysis");
    expect(two.wanted_forms.map((f) => f.name)).toEqual([
      "Chemical Delivery Ticket",
      "Job Safety Analysis",
    ]);
    expect(two.wanted_forms.every((f) => f.template_id === null)).toBe(true);
    const jsaFirst = makeFirstWantedForm(two.wanted_forms, two.wanted_forms[1]!.id);
    expect(jsaFirst.map((f) => f.name)).toEqual([
      "Job Safety Analysis",
      "Chemical Delivery Ticket",
    ]);
    expect(addWantedForm(a, "   ").wanted_forms).toBe(a.wanted_forms);
  });

  it("reads a stored list and rejects a nameless entry", () => {
    const ok = readIntake({ wanted_forms: [{ id: "f-1", name: "Ticket" }] });
    expect(ok.wanted_forms).toEqual([{ id: "f-1", name: "Ticket", template_id: null }]);
    expect(readIntake({ wanted_forms: [{ id: "f-1", name: "" }] })).toEqual(EMPTY_INTAKE);
  });
});
