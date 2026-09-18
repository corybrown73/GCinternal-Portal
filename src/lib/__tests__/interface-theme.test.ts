import { describe, expect, it } from "vitest";

import { readThemeChoice, resolveTheme, themeClass } from "../interface-theme";

/**
 * The person's own choice beats the team's; "follow the team" is the
 * default; Classic is the absence of a class, so the look the tool was built
 * with cannot be changed by anything but a deliberate choice.
 */
describe("resolveTheme", () => {
  it("lets a person keep Classic after the team switches", () => {
    expect(resolveTheme("gocanvas", "classic")).toBe("classic");
    expect(resolveTheme("classic", "gocanvas")).toBe("gocanvas");
  });
  it("follows the team when the person has not chosen", () => {
    expect(resolveTheme("gocanvas", "team")).toBe("gocanvas");
    expect(resolveTheme("gocanvas", null)).toBe("gocanvas");
    expect(resolveTheme(undefined, undefined)).toBe("classic");
    expect(resolveTheme("bogus", "bogus")).toBe("classic");
  });
  it("reads a stored choice and ignores junk", () => {
    expect(readThemeChoice("gocanvas")).toBe("gocanvas");
    expect(readThemeChoice("x")).toBe("team");
    expect(readThemeChoice(null)).toBe("team");
  });
  it("puts a class on the root only for GoCanvas", () => {
    expect(themeClass("classic")).toBeNull();
    expect(themeClass("gocanvas")).toBe("theme-gocanvas");
  });
});
