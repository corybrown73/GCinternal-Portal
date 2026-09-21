import { describe, expect, it } from "vitest";

import { isScreenShown, toggleScreen } from "../welcome";

describe("deck screens — five by default, the rest on request", () => {
  it("shows the core screens unless hidden, and the optional ones only when switched on", () => {
    expect(isScreenShown("cover", [])).toBe(true);
    expect(isScreenShown("plan", ["plan"])).toBe(false);
    expect(isScreenShown("overview", [])).toBe(false);
    expect(isScreenShown("overview", ["+overview"])).toBe(true);
    expect(isScreenShown("form", ["form"])).toBe(false);
  });

  it("toggles both kinds through one list", () => {
    expect(toggleScreen([], "plan", false)).toEqual(["plan"]);
    expect(toggleScreen(["plan"], "plan", true)).toEqual([]);
    expect(toggleScreen([], "overview", true)).toEqual(["+overview"]);
    expect(toggleScreen(["+overview", "plan"], "overview", false)).toEqual(["plan"]);
  });
});
