import { describe, expect, it } from "vitest";

import { readIntake } from "../intake-answers";
import { implementationFocusPatchSchema } from "../intake-patch";
import { agreeImplementationFocus, proposeImplementationFocus } from "../implementation-focus";

const UUID = "11111111-1111-4111-8111-111111111111";

/**
 * SOW = commercial anchor, Intake = process truth, Gong/Sales context =
 * supporting evidence only. See implementation-focus.ts for the exact
 * merge/flag rules these tests hold it to.
 */

describe("proposeImplementationFocus — SOW and intake truth", () => {
  it("proposes one item per purchased service, sourced to the SOW", () => {
    const intake = readIntake({
      timeline: {
        services: [{ id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 }],
      },
    });
    const items = proposeImplementationFocus(intake)!;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      text: "Connect approved submission data to QuickBooks Online.",
      status: "proposed",
      review_flag: null,
    });
    expect(items[0]!.sources).toEqual([{ type: "sow", label: "QuickBooks Online", quote: null }]);
  });

  it("proposes one item per named form, sourced to the intake, carrying the AI's quote when there is one", () => {
    const intake = readIntake({
      wanted_forms: [{ id: "f1", name: "Preventive Maintenance Report", template_id: null }],
      ai_sources: {
        wanted_forms: { quote: "they fill one out after every PM visit", source: "Discovery call" },
      },
    });
    const items = proposeImplementationFocus(intake)!;
    expect(items).toHaveLength(1);
    expect(items[0]!.text).toMatch(/Preventive Maintenance Report/);
    expect(items[0]!.sources).toEqual([
      {
        type: "intake",
        label: "Preventive Maintenance Report",
        quote: "they fill one out after every PM visit",
      },
    ]);
  });

  it("gives every purchased kind its own concrete phrasing, never a generic placeholder", () => {
    const intake = readIntake({
      timeline: {
        services: [
          { id: "pdf", kind: "custom_pdf", name: "Invoice PDF", phase: 2 },
          { id: "tr", kind: "training", name: "Crew training", phase: 1 },
        ],
      },
    });
    const items = proposeImplementationFocus(intake)!;
    expect(items.map((i) => i.text)).toEqual([
      "Produce the required customer-facing PDF output: Invoice PDF.",
      "Prepare the field team to run the workflow on real jobs.",
    ]);
  });
});

describe("proposeImplementationFocus — Gong/Sales context", () => {
  it("flags an item supported only by the handoff's systems answer as gong_only, still proposed", () => {
    const intake = readIntake({
      handoff: {
        answers: {
          system_requirements: {
            value: "Procore",
            source: "ai",
            at: "2026-10-01T00:00:00Z",
            by: null,
            quote: null,
          },
        },
      },
    });
    const items = proposeImplementationFocus(intake)!;
    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe("proposed");
    expect(items[0]!.review_flag).toBe("gong_only");
    expect(items[0]!.sources).toEqual([
      { type: "gong", label: "Systems and requirements (handoff)", quote: "Procore" },
    ]);
  });

  it("merges a Gong-named system into the matching SOW item instead of duplicating it, and clears any flag", () => {
    const intake = readIntake({
      timeline: {
        services: [{ id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 }],
      },
      handoff: {
        answers: {
          system_requirements: {
            value: "QuickBooks Online",
            source: "sales",
            at: "2026-10-01T00:00:00Z",
            by: null,
            quote: null,
          },
        },
      },
    });
    const items = proposeImplementationFocus(intake)!;
    expect(items).toHaveLength(1);
    expect(items[0]!.sources.map((s) => s.type)).toEqual(["sow", "gong"]);
    expect(items[0]!.review_flag).toBeNull();
  });

  it("flags conflict, not gong_only, when the SOW bought a different integration than the one named", () => {
    const intake = readIntake({
      timeline: {
        services: [{ id: "sf", kind: "integration", name: "Salesforce", phase: 2, tier: 3 }],
      },
      handoff: {
        answers: {
          system_requirements: {
            value: "NetSuite",
            source: "ai",
            at: "2026-10-01T00:00:00Z",
            by: null,
            quote: null,
          },
        },
      },
    });
    const items = proposeImplementationFocus(intake)!;
    expect(items).toHaveLength(2);
    const netsuite = items.find((i) => i.text.includes("NetSuite"))!;
    expect(netsuite.review_flag).toBe("conflict");
    const salesforce = items.find((i) => i.text.includes("Salesforce"))!;
    expect(salesforce.review_flag).toBeNull();
  });

  it("splits multiple handoff lines into separate items when they are genuinely different systems", () => {
    const intake = readIntake({
      handoff: {
        answers: {
          system_requirements: {
            value: "Procore\nSage",
            source: "ai",
            at: "2026-10-01T00:00:00Z",
            by: null,
            quote: null,
          },
        },
      },
    });
    const items = proposeImplementationFocus(intake)!;
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.review_flag === "gong_only")).toBe(true);
  });
});

describe("proposeImplementationFocus — human truth is never overwritten", () => {
  it("returns null once implementation_focus.validated_at is set, whatever the sources now say", () => {
    const intake = readIntake({
      implementation_focus: {
        items: [{ id: "f1", text: "Already agreed", status: "agreed", sources: [] }],
        validated_at: "2026-10-01T00:00:00Z",
        validated_by: UUID,
      },
      timeline: {
        services: [{ id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 }],
      },
    });
    expect(proposeImplementationFocus(intake)).toBeNull();
  });
});

describe("agreeImplementationFocus — what Confirm does", () => {
  it("promotes every retained item to agreed and stamps validation", () => {
    const items = [
      { id: "f1", text: "A", status: "proposed" as const, sources: [], review_flag: null },
      {
        id: "f2",
        text: "B",
        status: "proposed" as const,
        sources: [],
        review_flag: "gong_only" as const,
      },
    ];
    const result = agreeImplementationFocus(items, "2026-10-07T12:00:00Z", UUID);
    expect(result.items.map((i) => i.status)).toEqual(["agreed", "agreed"]);
    expect(result.validated_at).toBe("2026-10-07T12:00:00Z");
    expect(result.validated_by).toBe(UUID);
  });

  it("clears review_flag on promotion — a reviewed, agreed item is no longer 'unconfirmed'", () => {
    const items = [
      {
        id: "f1",
        text: "Procore",
        status: "proposed" as const,
        sources: [],
        review_flag: "gong_only" as const,
      },
    ];
    const result = agreeImplementationFocus(items, "2026-10-07T12:00:00Z", UUID);
    expect(result.items[0]!.review_flag).toBeNull();
  });
});

describe("manual add/edit/remove survive the save path", () => {
  it("round-trips an add, an edit and a remove through the patch schema and readIntake", () => {
    const base = readIntake({
      implementation_focus: {
        items: [{ id: "f1", text: "Original", status: "proposed", sources: [], review_flag: null }],
      },
    });

    const added = {
      ...base.implementation_focus,
      items: [
        ...base.implementation_focus.items,
        {
          id: "manual-1",
          text: "Hand-added item",
          status: "proposed" as const,
          sources: [],
          review_flag: null,
        },
      ],
    };
    expect(implementationFocusPatchSchema.safeParse(added).success).toBe(true);
    const afterAdd = readIntake({ ...base, implementation_focus: added });
    expect(afterAdd.implementation_focus.items.map((i) => i.text)).toEqual([
      "Original",
      "Hand-added item",
    ]);

    const edited = {
      ...afterAdd.implementation_focus,
      items: afterAdd.implementation_focus.items.map((i) =>
        i.id === "f1" ? { ...i, text: "Edited text" } : i,
      ),
    };
    const afterEdit = readIntake({ ...afterAdd, implementation_focus: edited });
    expect(afterEdit.implementation_focus.items.find((i) => i.id === "f1")!.text).toBe(
      "Edited text",
    );

    const removed = {
      ...afterEdit.implementation_focus,
      items: afterEdit.implementation_focus.items.filter((i) => i.id !== "manual-1"),
    };
    const afterRemove = readIntake({ ...afterEdit, implementation_focus: removed });
    expect(afterRemove.implementation_focus.items.map((i) => i.id)).toEqual(["f1"]);
  });
});
