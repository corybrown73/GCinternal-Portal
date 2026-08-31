import { describe, expect, it } from "vitest";

import { MARKS, winAnsi } from "../pdf-kit";

/**
 * jsPDF's built-in fonts are WinAnsi-encoded and jsPDF does not fail on a
 * character it cannot represent — it emits whatever byte falls out. Every
 * document here renders text a person typed, so the failure surface is every
 * PDF the company sends.
 */
describe("winAnsi", () => {
  it("keeps the arrow's meaning rather than emitting a broken byte", () => {
    // The real defect: "Dispatch → ERP work order sync" printed as
    // "Dispatch !' ERP work order sync" in a document filed against a
    // customer's Salesforce account.
    expect(winAnsi("Dispatch → ERP work order sync")).toBe("Dispatch -> ERP work order sync");
    expect(winAnsi("ERP ← Dispatch")).toBe("ERP <- Dispatch");
    expect(winAnsi("Dispatch ↔ ERP")).toBe("Dispatch <-> ERP");
  });

  it("leaves everything cp1252 already has exactly as typed", () => {
    // Em dash, curly quotes, ellipsis, bullet and accents are all in WinAnsi.
    // Replacing them would make every document worse to read.
    const kept = "Rachel Adeyemi — “we’ll see”… • café naïve Ångström €84,000";
    expect(winAnsi(kept)).toBe(kept);
  });

  it("turns ticks and crosses into the marks the documents already use", () => {
    expect(winAnsi("✓ done")).toBe(`${MARKS.done} done`);
    expect(winAnsi("☐ open")).toBe(`${MARKS.open} open`);
    expect(winAnsi("✗ failed")).toBe("x failed");
  });

  it("converts comparisons a spec sheet is full of", () => {
    expect(winAnsi("≥ 90% within 24h, ≤ 3 retries, ≠ zero")).toBe(
      ">= 90% within 24h, <= 3 retries, != zero",
    );
  });

  it("drops what it cannot render instead of printing mojibake", () => {
    // A gap reads as "something was here". "!'" reads as a bug in the document.
    expect(winAnsi("Rollout 🚀 begins")).toBe("Rollout begins");
    expect(winAnsi("東京 depot")).toBe(" depot");
  });

  it("keeps newlines, which the wrapper depends on", () => {
    expect(winAnsi("one\ntwo")).toBe("one\ntwo");
  });

  it("collapses the runs of spaces a substitution can leave behind", () => {
    expect(winAnsi("a 🚀 🚀 b")).toBe("a b");
  });
});
