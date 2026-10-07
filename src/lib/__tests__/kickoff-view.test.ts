import { describe, expect, it } from "vitest";

import {
  kickoffBusinessOutcome,
  kickoffFocusContent,
  kickoffWorkflowFallback,
  kickoffWorkflowStory,
} from "../kickoff-view";

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

describe("kickoffFocusContent — presentation-only fallback precedence", () => {
  const agreedItem = {
    id: "f1",
    text: "Connect approved submission data to QuickBooks Online.",
    status: "agreed" as const,
    sources: [{ type: "sow" as const, label: "QuickBooks Online", quote: null }],
    reviewFlag: null,
  };
  const proposedItem = {
    id: "f1",
    text: 'Build and configure the "Daily Water Haul Ticket" workflow for the field team to complete on site.',
    status: "proposed" as const,
    sources: [{ type: "sow" as const, label: "Daily Water Haul Ticket", quote: null }],
    reviewFlag: null,
  };
  const fallbackItems = [
    {
      id: "focus-1",
      text: 'Build and configure the "Daily Job Report" workflow for the field team to complete on site.',
      status: "proposed" as const,
      sources: [{ type: "sow" as const, label: "Daily Job Report", quote: null }],
      reviewFlag: null,
    },
    {
      id: "focus-2",
      text: "Something Gong-only.",
      status: "proposed" as const,
      sources: [
        { type: "gong" as const, label: "Discovery call", quote: "they mentioned Procore" },
      ],
      reviewFlag: "gong_only" as const,
    },
  ];

  it("a saved agreed item wins over any fallback", () => {
    expect(
      kickoffFocusContent(
        { items: [agreedItem], validatedAt: "2026-10-07T12:00:00Z" },
        fallbackItems,
      ),
    ).toEqual({ state: "agreed", items: [agreedItem.text] });
  });

  it("a saved, still-unvalidated proposed item wins over any fallback", () => {
    expect(
      kickoffFocusContent({ items: [proposedItem], validatedAt: null }, fallbackItems),
    ).toEqual({
      state: "proposed",
      items: [proposedItem.text],
    });
  });

  it("falls back to the presentation-only proposal, always as proposed, when nothing is saved", () => {
    expect(kickoffFocusContent(null, fallbackItems)).toEqual({
      state: "proposed",
      items: [fallbackItems[0]!.text, fallbackItems[1]!.text],
    });
    expect(kickoffFocusContent({ items: [], validatedAt: null }, fallbackItems)).toEqual({
      state: "proposed",
      items: [fallbackItems[0]!.text, fallbackItems[1]!.text],
    });
  });

  it("is still empty when there is nothing saved and no fallback either", () => {
    expect(kickoffFocusContent(null, null)).toEqual({ state: "empty" });
    expect(kickoffFocusContent({ items: [], validatedAt: null }, [])).toEqual({ state: "empty" });
  });

  it("never exposes a fallback item's sources or review flag, even gong_only/conflict ones", () => {
    const content = kickoffFocusContent(null, fallbackItems);
    expect(content).toEqual({
      state: "proposed",
      items: [fallbackItems[0]!.text, fallbackItems[1]!.text],
    });
    // Structurally — not just by assertion — there is nowhere on this
    // return shape for `sources` or `reviewFlag` to appear.
    expect(Object.keys(content)).toEqual(["state", "items"]);
  });

  it("does not mutate its inputs — a presentation read, never a write", () => {
    const frozenFallback = fallbackItems.map((i) => Object.freeze({ ...i }));
    const before = JSON.parse(JSON.stringify(frozenFallback));
    expect(() =>
      kickoffFocusContent({ items: [], validatedAt: null }, frozenFallback),
    ).not.toThrow();
    expect(frozenFallback).toEqual(before);
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

describe("kickoffWorkflowFallback — a presentation-only hypothesis from existing structured facts", () => {
  it("is null when there is no structured evidence for any leg, rather than inventing one", () => {
    expect(
      kickoffWorkflowFallback({ currentProcess: null, firstFormName: null, businessOutcome: null }),
    ).toBeNull();
  });

  it("uses only the current process for Before when that is all that is known", () => {
    expect(
      kickoffWorkflowFallback({
        currentProcess: "Paper ticket from the truck, retyped on Fridays.",
        firstFormName: null,
        businessOutcome: null,
      }),
    ).toEqual({
      before: "Paper ticket from the truck, retyped on Fridays.",
      during: null,
      after: null,
    });
  });

  it("builds a fuller hypothesis once the first form and business outcome are also known", () => {
    expect(
      kickoffWorkflowFallback({
        currentProcess: "Paper ticket from the truck, retyped on Fridays.",
        firstFormName: "Daily Water Haul Ticket",
        businessOutcome: "Invoices go out the same day, not the following Friday.",
      }),
    ).toEqual({
      before: "Paper ticket from the truck, retyped on Fridays.",
      during: "Running Daily Water Haul Ticket on the job.",
      after: "Invoices go out the same day, not the following Friday.",
    });
  });

  it("leaves an individual missing leg null rather than inventing it, so the screen shows the existing 'To confirm on the call.' treatment", () => {
    const hyp = kickoffWorkflowFallback({
      currentProcess: null,
      firstFormName: "Daily Water Haul Ticket",
      businessOutcome: null,
    });
    expect(hyp).toEqual({
      before: null,
      during: "Running Daily Water Haul Ticket on the job.",
      after: null,
    });
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
