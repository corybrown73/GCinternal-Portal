import { describe, expect, it } from "vitest";
import { formatTaskOffset } from "../hub-format";

/**
 * Template tasks store a basis plus a signed day offset (0013). Reviewers read
 * the phrase, not the columns, so the sign has to survive the rendering — a
 * "T-14" task shown as "+14d" would read as two weeks after the thing it is
 * supposed to precede.
 */
describe("formatTaskOffset", () => {
  it("names the basis in plain English", () => {
    expect(formatTaskOffset("stage_entry", 3)).toBe("stage entry +3d");
    expect(formatTaskOffset("project_start", 5)).toBe("project start +5d");
    expect(formatTaskOffset("target_launch", 2)).toBe("target launch +2d");
  });

  it("keeps a negative offset negative", () => {
    expect(formatTaskOffset("target_launch", -14)).toBe("target launch -14d");
  });

  it("drops the offset entirely when it is zero", () => {
    expect(formatTaskOffset("stage_entry", 0)).toBe("on stage entry");
    expect(formatTaskOffset("stage_entry", null)).toBe("on stage entry");
  });

  it("falls back readably for an unknown or missing basis", () => {
    expect(formatTaskOffset("first_invoice", 1)).toBe("first invoice +1d");
    expect(formatTaskOffset(null, 1)).toBe("stage entry +1d");
  });
});
