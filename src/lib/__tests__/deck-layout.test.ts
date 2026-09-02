import { describe, expect, it } from "vitest";

import { fitSize } from "@/lib/server/brief/pptx";

/**
 * Text has to fit the box it is drawn in.
 *
 * WHY THIS IS A TEST AND NOT A JUDGEMENT CALL. Every heading in the deck was
 * sized against the template's own example copy — "Acme Construction" — and
 * PowerPoint does not clip text that is too big for its box. It overflows, and
 * because these boxes were centred it overflowed UPWARDS into whatever was
 * above. Three defects came from that, all invisible to a test that checked
 * only that a file was produced:
 *
 *   - the client name printed through the word "Welcome," on slide one
 *   - the title struck through the "ABOUT GOCANVAS" eyebrow on slide four
 *   - "60/wk -> 0" wrapped out of its KPI card and over the label beneath it
 *
 * These assert the sizing rule that replaced the guesswork. The visual check
 * they cannot replace lives in `scripts/deck-visual-qa.ts`.
 */

/** The real widths from the renderer: a full-bleed heading, and a KPI card. */
const HEADING_W = 8.75;
const CARD_W = 1.8;

describe("fitSize", () => {
  it("leaves short text at the template's own size", () => {
    expect(fitSize("Acme Construction", HEADING_W, 128, 52)).toBe(128);
    expect(fitSize("24", CARD_W, 80, 26, 1, 0.72)).toBe(80);
  });

  it("shrinks text that would not fit, rather than letting it overflow", () => {
    const long = fitSize("Maverick Well Pluggers & Remediation Services", HEADING_W, 128, 52);
    expect(long).toBeLessThan(128);
    // And the result must actually fit: chars * size * em <= box width.
    const widthIn = (44 * (long * 0.375) * 0.58) / 72;
    expect(widthIn).toBeLessThanOrEqual(HEADING_W);
  });

  it("never goes below the floor, however long the text", () => {
    expect(fitSize("x".repeat(400), HEADING_W, 128, 52)).toBe(52);
  });

  it("is monotonic — longer text is never set larger", () => {
    const sizes = ["Acme", "Acme Construction", "Acme Construction & Civil", "x".repeat(60)].map(
      (t) => fitSize(t, HEADING_W, 128, 20),
    );
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i]!).toBeLessThanOrEqual(sizes[i - 1]!);
    }
  });

  it("allows a bigger size when the text may use two lines", () => {
    const name = "Maverick Well Pluggers & Remediation Services";
    expect(fitSize(name, HEADING_W, 128, 20, 2)).toBeGreaterThan(
      fitSize(name, HEADING_W, 128, 20, 1),
    );
  });

  // The KPI regression. At the prose estimate this string was set large enough
  // to wrap to two lines and spill out of its card, over the label below it.
  it("sets an arrow-and-slash value small enough to stay on one line", () => {
    const value = "60/wk → 0";
    const size = fitSize(value, CARD_W, 80, 26, 1, 0.72);
    expect(size).toBeLessThan(80);
    const widthIn = (value.length * (size * 0.375) * 0.72) / 72;
    expect(widthIn).toBeLessThanOrEqual(CARD_W);
  });

  it("treats glyph-dense text as wider than prose of the same length", () => {
    const dense = fitSize("60/wk → 0", CARD_W, 80, 10, 1, 0.72);
    const prose = fitSize("some words", CARD_W, 80, 10, 1, 0.58);
    expect(dense).toBeLessThan(prose);
  });
});
