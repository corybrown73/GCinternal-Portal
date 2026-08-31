import { describe, expect, it } from "vitest";

import { BRAND, copyrightLine, hex, pt, rgb } from "../brand";

describe("brand tokens", () => {
  it("stores hex without the leading hash, because pptxgenjs rejects it", () => {
    for (const value of [BRAND.navy950, BRAND.navy900, BRAND.blue500, BRAND.fg2, BRAND.white]) {
      expect(value).toMatch(/^[0-9A-F]{6}$/);
    }
  });

  it("matches colors_and_type.css, the design system's own source of truth", () => {
    expect(BRAND.navy950).toBe("041633");
    expect(BRAND.navy900).toBe("072B57");
    expect(BRAND.blue500).toBe("039DE7");
    // The one value the earlier reading got wrong: secondary text is a COOL
    // grey. Reading it off the QBR PDF's content streams gave a warm #757070.
    expect(BRAND.fg2).toBe("556477");
  });

  it("carries the design's own pixel canvas across to points, once", () => {
    // The template is built to 1920px wide; a 16:9 slide is 720pt wide.
    expect(pt(1920)).toBe(720);
    expect(pt(128)).toBe(48);
    expect(pt(24)).toBe(9);
  });

  it("converts to CSS and to jsPDF channels", () => {
    expect(hex(BRAND.navy950)).toBe("#041633");
    expect(rgb(BRAND.navy950)).toEqual([4, 22, 51]);
    expect(rgb(BRAND.white)).toEqual([255, 255, 255]);
  });

  it("dates the footer to the document, not to today", () => {
    expect(copyrightLine("2026-03-04T00:00:00Z")).toBe("© 2026 GoCanvas");
    expect(copyrightLine("2031-12-31T23:00:00Z")).toBe("© 2031 GoCanvas");
  });
});
