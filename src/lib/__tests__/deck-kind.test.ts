import { describe, expect, it } from "vitest";

import { deckKindFor, PHASE_GATE, type DeckKindSignal } from "../deck-kind";

const signal = (over: Partial<DeckKindSignal> = {}): DeckKindSignal => ({
  journeyKey: null,
  priorImplementations: 0,
  products: null,
  ...over,
});

describe("deckKindFor", () => {
  it("treats a first project as a new logo", () => {
    const d = deckKindFor(signal());
    expect(d.kind).toBe("new-logo");
    expect(d.reason).toBe("First project for this customer.");
  });

  it("treats an integration, add-on or migration journey as an expansion", () => {
    for (const key of ["integration", "add-on", "data-migration", "upsell"]) {
      expect(deckKindFor(signal({ journeyKey: key })).kind).toBe("expansion");
    }
  });

  it("takes the chosen template over a count of prior work", () => {
    // Somebody picked the template. That beats an inference either way.
    expect(deckKindFor(signal({ journeyKey: "integration", priorImplementations: 0 })).kind).toBe(
      "expansion",
    );
    expect(deckKindFor(signal({ journeyKey: "new-logo", priorImplementations: 3 })).kind).toBe(
      "new-logo",
    );
  });

  it("says so when new-logo is running for a customer who already has projects", () => {
    // Not overridden — but the reason is what an operator needs to see.
    expect(
      deckKindFor(signal({ journeyKey: "new-logo", priorImplementations: 2 })).reason,
    ).toContain("check the template is right");
  });

  it("calls a second project for the same customer an expansion, with no template", () => {
    const d = deckKindFor(signal({ priorImplementations: 1 }));
    expect(d.kind).toBe("expansion");
    expect(d.reason).toContain("already has 1 project,");
  });

  it("pluralises the reason, because it is read by a person", () => {
    expect(deckKindFor(signal({ priorImplementations: 4 })).reason).toContain("4 projects");
  });

  it("falls back to the customer's history when the template key is unknown", () => {
    expect(deckKindFor(signal({ journeyKey: "something-new" })).kind).toBe("new-logo");
    expect(deckKindFor(signal({ journeyKey: "something-new", priorImplementations: 1 })).kind).toBe(
      "expansion",
    );
  });

  it("is case and spacing tolerant, because template keys get typed by hand", () => {
    expect(deckKindFor(signal({ journeyKey: "  Integration " })).kind).toBe("expansion");
  });
});

describe("PHASE_GATE", () => {
  it("puts connection last, and says why rather than just asserting it", () => {
    expect(PHASE_GATE.phases.map((p) => p.title)).toEqual([
      "Make the work easy",
      "Make the work visible",
      "Make the process connected",
    ]);
    expect(PHASE_GATE.why).toContain("cannot be right until a crew has used the form");
  });
});
