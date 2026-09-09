import { describe, expect, it } from "vitest";

import { hideableKeys, NAV_CATALOGUE, sanitizeHidden, visibleNav } from "../nav-visibility";

/**
 * Hiding a section is a nav change, not a permission change — and two
 * sections can never be hidden, because hiding them would strand the app.
 */

const everyone = { canManage: false, isSuperAdmin: false };
const superAdmin = { canManage: true, isSuperAdmin: true };

describe("visibleNav", () => {
  it("shows everything to a super admin when nothing is hidden", () => {
    expect(visibleNav({ hidden: [] }, superAdmin).map((e) => e.to)).toEqual(
      NAV_CATALOGUE.map((e) => e.to),
    );
  });

  it("removes a hidden section for everyone", () => {
    const nav = visibleNav({ hidden: ["/tickets", "/sequences"] }, superAdmin);
    expect(nav.map((e) => e.to)).not.toContain("/tickets");
    expect(nav.map((e) => e.to)).not.toContain("/sequences");
    expect(nav.map((e) => e.to)).toContain("/pipeline");
  });

  it("still applies the role gate before visibility", () => {
    const nav = visibleNav({ hidden: [] }, everyone);
    expect(nav.map((e) => e.to)).not.toContain("/admin");
    expect(nav.map((e) => e.to)).not.toContain("/portfolio");
  });

  // The two that must survive anything, including a hand-edited config row.
  it("never hides Home or Admin, even when the stored row names them", () => {
    const nav = visibleNav({ hidden: ["/", "/admin"] }, superAdmin);
    expect(nav.map((e) => e.to)).toContain("/");
    expect(nav.map((e) => e.to)).toContain("/admin");
  });

  it("keeps the catalogue's order", () => {
    const nav = visibleNav({ hidden: ["/search"] }, superAdmin).map((e) => e.to);
    const expected = NAV_CATALOGUE.map((e) => e.to).filter((t) => t !== "/search");
    expect(nav).toEqual(expected);
  });
});

describe("what may be hidden", () => {
  it("excludes the locked entries from the hideable set", () => {
    const keys = hideableKeys();
    expect(keys).not.toContain("/");
    expect(keys).not.toContain("/admin");
    expect(keys).toContain("/tickets");
  });

  it("drops unknown and locked keys on the way in, so a bad write cannot poison the row", () => {
    expect(sanitizeHidden(["/tickets", "/nope", "/admin", 42, "/tickets"])).toEqual(["/tickets"]);
    expect(sanitizeHidden("not a list")).toEqual([]);
  });
});
