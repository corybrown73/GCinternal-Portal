import { describe, expect, it } from "vitest";

import { FORM_LIBRARY_SEED, formLibraryRows } from "../form-library-seed";
import { INDUSTRIES } from "../intake-answers";

/**
 * The seed is what a customer with no forms is shown. A hole in it — an
 * industry with nothing, a duplicate name, an entry with no objective — is a
 * blank screen in the onboarding conversation.
 */

describe("the form library seed", () => {
  it("covers every industry the intake offers, except Other", () => {
    for (const industry of INDUSTRIES) {
      if (industry === "Other") continue;
      expect(FORM_LIBRARY_SEED[industry], `${industry} has no forms`).toBeDefined();
    }
  });

  it("files nothing under an industry the intake does not know", () => {
    for (const industry of Object.keys(FORM_LIBRARY_SEED)) {
      expect(INDUSTRIES as readonly string[]).toContain(industry);
    }
  });

  it("has five or six forms per industry", () => {
    for (const [industry, entries] of Object.entries(FORM_LIBRARY_SEED)) {
      expect(entries.length, industry).toBeGreaterThanOrEqual(5);
      expect(entries.length, industry).toBeLessThanOrEqual(6);
    }
  });

  it("gives every form a name, an objective and at least one tag", () => {
    for (const r of formLibraryRows()) {
      expect(r.name.trim().length, r.industry).toBeGreaterThan(0);
      // An objective is a sentence or two, not a label.
      expect(r.description.trim().length, r.name).toBeGreaterThan(60);
      expect(r.tags.length, r.name).toBeGreaterThan(0);
    }
  });

  // The seed is upserted on (industry, name); a duplicate would silently
  // overwrite its twin.
  it("has no duplicate names within an industry", () => {
    for (const [industry, entries] of Object.entries(FORM_LIBRARY_SEED)) {
      const names = entries.map((e) => e.name.toLowerCase());
      expect(new Set(names).size, industry).toBe(names.length);
    }
  });
});
