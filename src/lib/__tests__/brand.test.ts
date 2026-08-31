import { describe, expect, it } from "vitest";

import { BRAND, copyrightLine, hex, rgb } from "../brand";

describe("brand tokens", () => {
  it("stores hex without the leading hash, because pptxgenjs rejects it", () => {
    for (const value of [BRAND.ink, BRAND.navy, BRAND.cyan, BRAND.grey, BRAND.paper]) {
      expect(value).toMatch(/^[0-9A-F]{6}$/);
    }
  });

  it("is the navy the template actually uses, not the green that was guessed", () => {
    expect(BRAND.ink).toBe("031736");
    expect(BRAND.navy).toBe("00305E");
    expect(BRAND.cyan).toBe("039DE7");
  });

  it("converts to CSS and to jsPDF channels", () => {
    expect(hex(BRAND.ink)).toBe("#031736");
    expect(rgb(BRAND.ink)).toEqual([3, 23, 54]);
    expect(rgb(BRAND.paper)).toEqual([255, 255, 255]);
  });

  it("dates the footer to the document, not to today", () => {
    expect(copyrightLine("2026-03-04T00:00:00Z")).toBe("© 2026 GoCanvas");
    expect(copyrightLine("2031-12-31T23:00:00Z")).toBe("© 2031 GoCanvas");
  });
});
