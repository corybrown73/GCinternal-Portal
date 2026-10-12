import { describe, expect, it } from "vitest";

import { readIntake } from "../intake-answers";
import { implementationFocusView, workflowStoryView } from "../welcome";

/**
 * The pure mapping from the persisted intake fields (workflow_story,
 * implementation_focus) to what the Welcome pipeline exposes — camelcase,
 * same facts, nothing invented. The future Kickoff view and Implementation
 * Plan will read these through WelcomeView; this just proves the plumbing
 * carries the truth across without changing it.
 */

describe("workflowStoryView", () => {
  it("exposes an empty intake's story as all-null, camelcased", () => {
    const view = workflowStoryView(readIntake({}));
    expect(view).toEqual({
      before: null,
      during: null,
      after: null,
      validatedAt: null,
      validatedBy: null,
    });
  });

  it("carries a filled-in story through unchanged", () => {
    const intake = readIntake({
      workflow_story: {
        before: "A dispatch ticket from the office.",
        during: "The tech fills it out on their phone.",
        after: "The office invoices off it same day.",
        validated_at: "2026-10-07T12:00:00Z",
        validated_by: "11111111-1111-4111-8111-111111111111",
      },
    });
    expect(workflowStoryView(intake)).toEqual({
      before: "A dispatch ticket from the office.",
      during: "The tech fills it out on their phone.",
      after: "The office invoices off it same day.",
      validatedAt: "2026-10-07T12:00:00Z",
      validatedBy: "11111111-1111-4111-8111-111111111111",
    });
  });
});

describe("implementationFocusView", () => {
  it("exposes an empty intake's focus as an empty list", () => {
    expect(implementationFocusView(readIntake({}))).toEqual({
      items: [],
      validatedAt: null,
      validatedBy: null,
      aiFilled: false,
    });
  });

  it("carries items, every source, and the review flag through, camelcased", () => {
    const intake = readIntake({
      implementation_focus: {
        items: [
          {
            id: "f1",
            text: "Daily job report",
            status: "proposed",
            sources: [
              { type: "sow", label: "Daily Job Report", quote: null },
              { type: "gong", label: "Discovery call", quote: "we fill out a report every day" },
            ],
            review_flag: "conflict",
          },
          {
            id: "f2",
            text: "QuickBooks sync",
            status: "agreed",
            sources: [{ type: "sow", label: "QuickBooks Online", quote: null }],
          },
        ],
        validated_at: "2026-10-07T12:00:00Z",
        validated_by: "11111111-1111-4111-8111-111111111111",
      },
    });
    const view = implementationFocusView(intake);
    expect(view.validatedAt).toBe("2026-10-07T12:00:00Z");
    expect(view.validatedBy).toBe("11111111-1111-4111-8111-111111111111");
    expect(view.items).toEqual([
      {
        id: "f1",
        text: "Daily job report",
        status: "proposed",
        sources: [
          { type: "sow", label: "Daily Job Report", quote: null },
          { type: "gong", label: "Discovery call", quote: "we fill out a report every day" },
        ],
        reviewFlag: "conflict",
      },
      {
        id: "f2",
        text: "QuickBooks sync",
        status: "agreed",
        sources: [{ type: "sow", label: "QuickBooks Online", quote: null }],
        reviewFlag: null,
      },
    ]);
  });

  it("never promotes a gong_only item to agreed on its own — that stays a person's decision", () => {
    const intake = readIntake({
      implementation_focus: {
        items: [
          {
            id: "f1",
            text: "Safety walk checklist",
            status: "proposed",
            sources: [{ type: "gong", label: "Discovery call", quote: "we do a safety walk" }],
            review_flag: "gong_only",
          },
        ],
      },
    });
    const view = implementationFocusView(intake);
    expect(view.items[0]!.status).toBe("proposed");
    expect(view.items[0]!.reviewFlag).toBe("gong_only");
  });
});
