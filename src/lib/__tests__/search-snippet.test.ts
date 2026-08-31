import { describe, expect, it } from "vitest";

import { snippet } from "@/lib/search-snippet";

const note = `## Discovery call, 14 March

They are losing about six hours a week rekeying dig tickets from paper into
the ERP. Champion is the ops manager; the CFO signs. Main objection was the
mobile signal on remote sites, which they said is solved by offline capture.`;

describe("snippet", () => {
  it("returns the text around the match", () => {
    const s = snippet(note, "objection");
    expect(s).toContain("objection");
    expect(s).toContain("mobile signal");
  });

  // A snippet that keeps its markdown reads as broken rather than as an
  // excerpt from a document.
  it("flattens whitespace and markdown line breaks", () => {
    const s = snippet(note, "rekeying");
    expect(s).not.toContain("\n");
    expect(s).not.toContain("##");
  });

  it("marks both ends when it is a middle slice", () => {
    const s = snippet(note, "objection")!;
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
  });

  it("does not lead with an ellipsis when the match is at the start", () => {
    expect(snippet("Champion is the ops manager", "Champion")?.startsWith("…")).toBe(false);
  });

  it("matches case-insensitively, as the query itself did", () => {
    expect(snippet(note, "CHAMPION")).toContain("Champion");
  });

  it("returns null rather than an empty box when there is no match", () => {
    expect(snippet(note, "helicopter")).toBeNull();
    expect(snippet(null, "anything")).toBeNull();
    expect(snippet("   ", "x")).toBeNull();
  });

  it("keeps the excerpt short enough to sit on one line", () => {
    expect(snippet(note, "rekeying")!.length).toBeLessThanOrEqual(110);
  });
});
