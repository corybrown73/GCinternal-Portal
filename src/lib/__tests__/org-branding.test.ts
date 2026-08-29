import { describe, expect, it } from "vitest";
import { DEFAULT_SCHEME_KEY, NAV_SCHEMES, schemeFor } from "../org-branding";

/**
 * Branding renders on every page, so the failure mode that matters is a nav
 * that comes out unstyled or unreadable rather than one that looks wrong.
 */

const REQUIRED_VARS = ["--nav-bg", "--nav-fg", "--nav-muted", "--nav-active", "--nav-border"];

describe("nav schemes", () => {
  it("every scheme defines the full variable set", () => {
    // The sidebar's markup does not know which scheme is active — it just reads
    // these five. A scheme missing one renders a transparent or black element
    // depending on the browser, which is exactly the sort of thing nobody
    // notices until a customer is looking at it.
    for (const s of NAV_SCHEMES) {
      for (const v of REQUIRED_VARS) {
        expect(Object.keys(s.vars), `${s.key} is missing ${v}`).toContain(v);
        expect(s.vars[v], `${s.key}'s ${v} is empty`).toBeTruthy();
      }
    }
  });

  it("has unique keys, since the key is what gets stored", () => {
    const keys = NAV_SCHEMES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("contains the default key it falls back to", () => {
    expect(NAV_SCHEMES.some((s) => s.key === DEFAULT_SCHEME_KEY)).toBe(true);
  });

  it("gives every scheme a name and a note for the picker", () => {
    for (const s of NAV_SCHEMES) {
      expect(s.name.length).toBeGreaterThan(1);
      expect(s.note.length).toBeGreaterThan(8);
    }
  });
});

describe("schemeFor", () => {
  it("resolves a known key", () => {
    expect(schemeFor("slate").key).toBe("slate");
  });

  it("falls back to the default for an unknown, null or empty key", () => {
    // Config is hand-editable and a scheme can be removed in a later release.
    // Either way the nav must still paint.
    expect(schemeFor("a-scheme-that-was-deleted").key).toBe(DEFAULT_SCHEME_KEY);
    expect(schemeFor(null).key).toBe(DEFAULT_SCHEME_KEY);
    expect(schemeFor(undefined).key).toBe(DEFAULT_SCHEME_KEY);
    expect(schemeFor("").key).toBe(DEFAULT_SCHEME_KEY);
  });

  it("never returns undefined, whatever it is handed", () => {
    for (const key of ["", " ", "DEFAULT", "0", "null"]) {
      expect(schemeFor(key)).toBeTruthy();
      expect(schemeFor(key).vars["--nav-bg"]).toBeTruthy();
    }
  });
});
