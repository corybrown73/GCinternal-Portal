import { describe, expect, it } from "vitest";

import {
  addWantedForm,
  EMPTY_INTAKE,
  flowAnswered,
  intakeAnswersSchema,
  intakeStatus,
  INDUSTRIES,
  makeFirstWantedForm,
  readIntake,
  toggleWantedTemplate,
} from "../intake-answers";

/**
 * The intake answers are a jsonb column whose shape lives here, so this is
 * where a malformed row has to be made harmless.
 */

describe("readIntake", () => {
  it("returns a complete object from nothing", () => {
    expect(readIntake(null)).toEqual(EMPTY_INTAKE);
    expect(readIntake(undefined)).toEqual(EMPTY_INTAKE);
    expect(readIntake({})).toEqual(EMPTY_INTAKE);
  });

  it("fills in what a partial row leaves out", () => {
    const a = readIntake({ forms_built: false, industry: "Roofing" });
    expect(a.industry).toBe("Roofing");
    expect(a.uploaded_forms).toEqual([]);
    expect(a.chosen_templates).toEqual([]);
    expect(a.field_users).toBeNull();
  });

  // A hand-edited or corrupted row must not take the deal page down.
  it("falls back to empty rather than throwing on garbage", () => {
    expect(readIntake("not an object")).toEqual(EMPTY_INTAKE);
    expect(readIntake({ field_users: "twenty-four" })).toEqual(EMPTY_INTAKE);
    expect(readIntake({ uploaded_forms: [{ path: "" }] })).toEqual(EMPTY_INTAKE);
  });
});

describe("the schema", () => {
  it("refuses a negative head count and a non-uuid template id", () => {
    expect(intakeAnswersSchema.safeParse({ field_users: -1 }).success).toBe(false);
    expect(intakeAnswersSchema.safeParse({ chosen_templates: ["nope"] }).success).toBe(false);
  });
});

describe("intakeStatus — what to ask next", () => {
  it("starts with the sale — were integrations or solutions involved — then who they are", () => {
    expect(intakeStatus(EMPTY_INTAKE)).toEqual({
      done: false,
      next: "Were integrations or solutions involved?",
    });
    expect(intakeStatus(readIntake({ solutions_involved: false }))).toEqual({
      done: false,
      next: "What industry are they in?",
    });
  });

  it("never asks about forms: that question belongs to the flow, and step 2 must not wait on it", () => {
    // The old rule made step 2 wait for an answer only step 3 could give,
    // and step 3 was locked until step 2 finished. Nobody could get out.
    const facts = readIntake({
      solutions_involved: true,
      industry: "Roofing",
      field_users: 40,
      current_process: "Paper tickets",
    });
    expect(facts.forms_built).toBeNull();
    expect(intakeStatus(facts)).toEqual({ done: true, next: null });
    expect(flowAnswered(facts)).toBe(false);
    const withFlow = readIntake({
      ...facts,
      path: "new_logo",
      forms_built: false,
      wanted_forms: [{ id: "f1", name: "Daily Job Card", template_id: null }],
    });
    expect(flowAnswered(withFlow)).toBe(true);
  });

  it("on the no branch, needs the industry, the field count and the process today", () => {
    const no = readIntake({ solutions_involved: false, forms_built: false });
    expect(intakeStatus(no).next).toMatch(/industry/);
    const withIndustry = readIntake({
      solutions_involved: false,
      forms_built: false,
      industry: "Roofing",
    });
    expect(intakeStatus(withIndustry).next).toMatch(/in the field/);
    const withCount = readIntake({
      solutions_involved: false,
      forms_built: false,
      industry: "Roofing",
      field_users: 40,
    });
    expect(intakeStatus(withCount).next).toMatch(/process today/);
    const done = readIntake({
      solutions_involved: false,
      forms_built: false,
      industry: "Roofing",
      field_users: 40,
      current_process: "Paper, then rekeyed on Fridays.",
    });
    expect(intakeStatus(done).done).toBe(true);
    // "Complete" with the field count blank was the lie the audit caught.
    const noCount = readIntake({
      forms_built: false,
      industry: "Roofing",
      current_process: "Paper.",
    });
    expect(intakeStatus(noCount).done).toBe(false);
  });
});

describe("the industry list", () => {
  it("covers the industries production customers already carry", () => {
    for (const seen of [
      "Energy",
      "Environmental",
      "Facilities",
      "HVAC",
      "Mining",
      "Pipeline",
      "Roofing",
      "Utilities",
    ]) {
      expect(INDUSTRIES).toContain(seen);
    }
  });
});

describe("the forms they want built", () => {
  const a = readIntake({ forms_built: false });
  const card = { id: "11111111-1111-4111-8111-111111111111", name: "Daily Site Inspection" };

  it("picking a card marks it for the talk track, never the build list; picking again unmarks it", () => {
    const on = toggleWantedTemplate(a, card);
    expect(on.wanted_forms).toEqual([]);
    expect(on.chosen_templates).toEqual([card.id]);
    const off = toggleWantedTemplate({ ...a, ...on }, card);
    expect(off.wanted_forms).toEqual([]);
    expect(off.chosen_templates).toEqual([]);
  });

  it("naming a form to build leaves the talk-track picks alone", () => {
    const picked = { ...a, ...toggleWantedTemplate(a, card) };
    const named = addWantedForm(picked, "Chemical Delivery Ticket");
    expect(named.chosen_templates).toEqual([card.id]);
    expect(named.wanted_forms.map((f) => f.name)).toEqual(["Chemical Delivery Ticket"]);
  });

  it("a form named on the call has no card behind it, and the first on the list is the first form", () => {
    const one = addWantedForm(a, "  Chemical Delivery Ticket ");
    const two = addWantedForm({ ...a, ...one }, "Job Safety Analysis");
    expect(two.wanted_forms.map((f) => f.name)).toEqual([
      "Chemical Delivery Ticket",
      "Job Safety Analysis",
    ]);
    expect(two.wanted_forms.every((f) => f.template_id === null)).toBe(true);
    const jsaFirst = makeFirstWantedForm(two.wanted_forms, two.wanted_forms[1]!.id);
    expect(jsaFirst.map((f) => f.name)).toEqual([
      "Job Safety Analysis",
      "Chemical Delivery Ticket",
    ]);
    expect(addWantedForm(a, "   ").wanted_forms).toBe(a.wanted_forms);
  });

  it("reads a stored list and rejects a nameless entry", () => {
    const ok = readIntake({ wanted_forms: [{ id: "f-1", name: "Ticket" }] });
    expect(ok.wanted_forms).toEqual([{ id: "f-1", name: "Ticket", template_id: null }]);
    expect(readIntake({ wanted_forms: [{ id: "f-1", name: "" }] })).toEqual(EMPTY_INTAKE);
  });
});

describe("workflow_story — the customer-readable before/during/after", () => {
  it("defaults every field to null on an intake with neither new field", () => {
    const a = readIntake({ industry: "Roofing" });
    expect(a.workflow_story).toEqual({
      before: null,
      during: null,
      after: null,
      validated_at: null,
      validated_by: null,
    });
    // The rest of an old row still parses exactly as it did.
    expect(a.industry).toBe("Roofing");
  });

  it("parses a filled-in story and keeps validation as its own fact", () => {
    const a = readIntake({
      workflow_story: {
        before: "They get a dispatch ticket from the office.",
        during: "The tech fills out the form on their phone at the job.",
        after: "The office reviews it and invoices off it the same day.",
        validated_at: "2026-10-07T12:00:00Z",
        validated_by: "11111111-1111-4111-8111-111111111111",
      },
    });
    expect(a.workflow_story.before).toMatch(/dispatch ticket/);
    expect(a.workflow_story.validated_at).toBe("2026-10-07T12:00:00Z");
  });
});

describe("implementation_focus — proposed vs. agreed scope, with provenance", () => {
  it("defaults to an empty list on an intake with neither new field", () => {
    const a = readIntake({ industry: "Roofing" });
    expect(a.implementation_focus).toEqual({
      items: [],
      validated_at: null,
      validated_by: null,
    });
  });

  it("parses a proposed item with a single source", () => {
    const a = readIntake({
      implementation_focus: {
        items: [
          {
            id: "f1",
            text: "Daily job report replaces the paper ticket",
            status: "proposed",
            sources: [{ type: "sow", label: "Daily Job Report", quote: null }],
          },
        ],
      },
    });
    expect(a.implementation_focus.items).toHaveLength(1);
    expect(a.implementation_focus.items[0]).toMatchObject({
      id: "f1",
      status: "proposed",
      review_flag: null,
    });
  });

  it("parses an agreed item and keeps validation separate from the item itself", () => {
    const a = readIntake({
      implementation_focus: {
        items: [{ id: "f1", text: "QuickBooks sync", status: "agreed", sources: [] }],
        validated_at: "2026-10-07T12:00:00Z",
        validated_by: "11111111-1111-4111-8111-111111111111",
      },
    });
    expect(a.implementation_focus.items[0]!.status).toBe("agreed");
    expect(a.implementation_focus.validated_at).toBe("2026-10-07T12:00:00Z");
  });

  it("keeps every source on an item supported by more than one of SOW, intake and Gong", () => {
    const a = readIntake({
      implementation_focus: {
        items: [
          {
            id: "f1",
            text: "Safety inspection form",
            status: "proposed",
            sources: [
              { type: "sow", label: "Safety Inspection", quote: "1x Safety Inspection form" },
              { type: "intake", label: null, quote: "they mentioned a safety walk" },
              {
                type: "gong",
                label: "Discovery call",
                quote: "we do a safety check every morning",
              },
            ],
          },
        ],
      },
    });
    expect(a.implementation_focus.items[0]!.sources).toHaveLength(3);
    expect(a.implementation_focus.items[0]!.sources.map((s) => s.type)).toEqual([
      "sow",
      "intake",
      "gong",
    ]);
  });

  it("parses the gong_only and conflict review flags, and defaults to no flag", () => {
    const flagged = (flag: "gong_only" | "conflict" | null) =>
      readIntake({
        implementation_focus: {
          items: [
            {
              id: "f1",
              text: "Something",
              status: "proposed",
              sources: [],
              review_flag: flag,
            },
          ],
        },
      }).implementation_focus.items[0]!.review_flag;
    expect(flagged("gong_only")).toBe("gong_only");
    expect(flagged("conflict")).toBe("conflict");
    expect(flagged(null)).toBeNull();
    // Unset entirely still defaults to null, not an error.
    const a = readIntake({
      implementation_focus: {
        items: [{ id: "f1", text: "Something", status: "proposed", sources: [] }],
      },
    });
    expect(a.implementation_focus.items[0]!.review_flag).toBeNull();
  });

  it("rejects a review flag outside the two known values", () => {
    expect(
      intakeAnswersSchema.safeParse({
        implementation_focus: {
          items: [
            { id: "f1", text: "Something", status: "proposed", sources: [], review_flag: "bogus" },
          ],
        },
      }).success,
    ).toBe(false);
  });
});
