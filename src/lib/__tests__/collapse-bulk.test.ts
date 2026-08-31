import { describe, expect, it } from "vitest";

import { resolveBulk } from "@/components/record";

const at = (version: number, open: boolean) => ({ version, open });

describe("resolveBulk", () => {
  it("uses the scope's own instruction when there is no parent", () => {
    expect(resolveBulk(null, at(3, false))).toEqual(at(3, false));
  });

  // The account rail is a nested scope. Without inheritance, "Collapse all"
  // folds the tab content and leaves the rail open, which reads as the button
  // half-working rather than as two independent scopes.
  it("obeys the parent when the nested scope has no instruction of its own", () => {
    expect(resolveBulk(at(5, false), null)).toEqual(at(5, false));
  });

  it("takes the newer of the two, whichever raised it", () => {
    expect(resolveBulk(at(9, true), at(4, false))).toEqual(at(9, true));
    expect(resolveBulk(at(4, false), at(9, true))).toEqual(at(9, true));
  });

  // The reason instructions are versioned rather than a bare boolean: pressing
  // Collapse all, opening one section, then pressing it again must fold that
  // section a second time. A value that has not changed would be ignored.
  it("treats a repeat of the same choice as a new instruction", () => {
    const first = resolveBulk(null, at(1, false));
    const second = resolveBulk(null, at(2, false));
    expect(second!.version).toBeGreaterThan(first!.version);
    expect(second!.open).toBe(false);
  });

  it("is null when nobody has asked for anything", () => {
    expect(resolveBulk(null, null)).toBeNull();
  });
});
