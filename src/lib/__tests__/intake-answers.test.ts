import { describe, expect, it } from "vitest";

import {
  EMPTY_INTAKE,
  intakeAnswersSchema,
  intakeStatus,
  INDUSTRIES,
  readIntake,
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
  it("starts with the fork", () => {
    expect(intakeStatus(EMPTY_INTAKE)).toEqual({
      done: false,
      next: "Do they already have forms built?",
    });
  });

  it("on the yes branch, is done once something is uploaded", () => {
    const yes = readIntake({ forms_built: true });
    expect(intakeStatus(yes).next).toMatch(/Upload/);
    const uploaded = readIntake({
      forms_built: true,
      uploaded_forms: [{ path: "deals/x/forms/a.pdf", name: "a.pdf", uploaded_at: "2026-09-09" }],
    });
    expect(intakeStatus(uploaded).done).toBe(true);
  });

  it("on the no branch, needs the industry and the process today", () => {
    const no = readIntake({ forms_built: false });
    expect(intakeStatus(no).next).toMatch(/industry/);
    const withIndustry = readIntake({ forms_built: false, industry: "Roofing" });
    expect(intakeStatus(withIndustry).next).toMatch(/process today/);
    const done = readIntake({
      forms_built: false,
      industry: "Roofing",
      current_process: "Paper, then rekeyed on Fridays.",
    });
    expect(intakeStatus(done).done).toBe(true);
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
