import { describe, expect, it } from "vitest";

import { kickoffBusinessOutcome, kickoffFocusContent, kickoffWorkflowStory } from "../kickoff-view";

/**
 * The pure decisions behind Kickoff View's trickier screens. The JSX
 * (src/components/kickoff-view.tsx) only renders what these return, so
 * proving the shape here is enough to prove the screen can never show
 * more than it should — there is no component-rendering test harness in
 * this codebase to render the screens themselves.
 */

describe("kickoffFocusContent — proposed vs. agreed, never fabricated", () => {
  it("is empty when there are no items, rather than fabricating scope", () => {
    expect(kickoffFocusContent(null)).toEqual({ state: "empty" });
    expect(kickoffFocusContent({ items: [], validatedAt: null })).toEqual({
      state: "empty",
    });
  });

  it("is proposed, never agreed, while implementationFocus is unvalidated", () => {
    const content = kickoffFocusContent({
      items: [
        {
          id: "f1",
          text: "Connect approved submission data to QuickBooks Online.",
          status: "proposed",
          sources: [{ type: "sow", label: "QuickBooks Online", quote: null }],
          reviewFlag: null,
        },
        {
          id: "f2",
          text: "Something Gong-only.",
          status: "proposed",
          sources: [{ type: "gong", label: "Discovery call", quote: "they mentioned Procore" }],
          reviewFlag: "gong_only",
        },
      ],
      validatedAt: null,
    });
    expect(content.state).toBe("proposed");
    expect(content).not.toMatchObject({ state: "agreed" });
    // Only item text is returned — structurally, there is nowhere for a
    // source chip or a review flag to come from on the Kickoff screen.
    expect(content).toEqual({
      state: "proposed",
      items: ["Connect approved submission data to QuickBooks Online.", "Something Gong-only."],
    });
  });

  it("is agreed once implementationFocus.validatedAt is set", () => {
    const content = kickoffFocusContent({
      items: [
        {
          id: "f1",
          text: "Connect approved submission data to QuickBooks Online.",
          status: "agreed",
          sources: [{ type: "sow", label: "QuickBooks Online", quote: null }],
          reviewFlag: null,
        },
      ],
      validatedAt: "2026-10-07T12:00:00Z",
    });
    expect(content).toEqual({
      state: "agreed",
      items: ["Connect approved submission data to QuickBooks Online."],
    });
  });
});

describe("kickoffWorkflowStory — Before/During/After, with a graceful fallback", () => {
  it("is null when workflowStory is empty, so the caller falls back rather than showing three empty columns", () => {
    expect(kickoffWorkflowStory(null)).toBeNull();
    expect(kickoffWorkflowStory({ before: null, during: null, after: null })).toBeNull();
  });

  it("is the three-part story once any of before/during/after has useful content", () => {
    expect(
      kickoffWorkflowStory({
        before: "A dispatch ticket from the office.",
        during: null,
        after: null,
      }),
    ).toEqual({ before: "A dispatch ticket from the office.", during: null, after: null });
  });
});

describe("kickoffBusinessOutcome", () => {
  it("is null when the handoff has not shared a business outcome yet", () => {
    expect(kickoffBusinessOutcome({ intake: null })).toBeNull();
    expect(kickoffBusinessOutcome({ intake: { known: [], needed: [] } })).toBeNull();
  });

  it("reads the shared, answered business_outcome line", () => {
    expect(
      kickoffBusinessOutcome({
        intake: {
          known: [
            {
              key: "business_outcome",
              ask: "What success looks like for you",
              value: "Stop re-typing field tickets so invoices go out the same day.",
              confirmed: true,
            },
          ],
          needed: [],
        },
      }),
    ).toBe("Stop re-typing field tickets so invoices go out the same day.");
  });
});
