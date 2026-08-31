import { describe, expect, it } from "vitest";

import { createSolutionInput } from "../solution-note-input";

const base = {
  implementationId: "00000000-0000-0000-0000-000000000001",
  title: "Dispatch → ERP work order sync",
  designSummary: null,
  configurationDetails: null,
  ownerId: null,
  status: "draft" as const,
};

describe("createSolutionInput", () => {
  it("accepts a solution with nothing but a title, because the record log fills in later", () => {
    expect(createSolutionInput.parse(base).title).toBe("Dispatch → ERP work order sync");
  });

  it("refuses a title that is only whitespace", () => {
    expect(() => createSolutionInput.parse({ ...base, title: "   " })).toThrow();
  });

  it("trims the title rather than storing the padding", () => {
    expect(createSolutionInput.parse({ ...base, title: "  Sync  " }).title).toBe("Sync");
  });

  it("refuses an empty owner string: unassigned is null, not the empty string", () => {
    expect(() => createSolutionInput.parse({ ...base, ownerId: "" })).toThrow();
  });

  it("refuses a status outside the recorded set", () => {
    expect(() => createSolutionInput.parse({ ...base, status: "shipped" })).toThrow();
  });

  it("keeps free text that a person actually typed", () => {
    const parsed = createSolutionInput.parse({
      ...base,
      designSummary: "Work orders move nightly from Dispatch into the ERP.",
      configurationDetails: "REST, creds in 1Password, 02:00 UTC.",
    });
    expect(parsed.designSummary).toContain("Work orders move nightly");
    expect(parsed.configurationDetails).toContain("02:00 UTC");
  });
});
