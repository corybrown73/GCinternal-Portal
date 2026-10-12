import { describe, expect, it } from "vitest";

import {
  KICKOFF_EXPECTATIONS,
  KICKOFF_FORM_STEPS,
  KICKOFF_PROMISE,
  KICKOFF_STAGE_OUTCOME,
  KICKOFF_TO_CONFIRM,
  KICKOFF_UPCOMING,
  KICKOFF_WORKFLOW_QUESTIONS,
  kickoffBusinessOutcome,
  kickoffChanges,
  kickoffFocusContent,
  kickoffGraduationTarget,
  kickoffJourneyStages,
  kickoffMoveSources,
  kickoffMoveSplit,
  kickoffNextStepText,
  kickoffUpcomingDetails,
  kickoffWorkflowConfirmed,
  kickoffWorkflowFields,
  nextWorkingSession,
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

  it("keeps flagged items off the slide while the saved list is the AI reading's own and unconfirmed", () => {
    // Saved by the automatic apply, nobody pressed Generate: a Gong-only or
    // conflicting item has had no review, so it is held back exactly like a
    // flagged fallback candidate.
    const aiList = { items: fallbackItems, validatedAt: null, aiFilled: true };
    expect(kickoffFocusContent(aiList, [])).toEqual({
      state: "proposed",
      items: [fallbackItems[0]!.text],
    });
    // Nothing safe on it: empty, not the fallback (the same anchors again).
    expect(
      kickoffFocusContent({ items: [fallbackItems[1]!], validatedAt: null, aiFilled: true }, [
        fallbackItems[0]!,
      ]),
    ).toEqual({ state: "empty" });
    // A person's save lifts the hold; so does Confirm.
    expect(kickoffFocusContent({ ...aiList, aiFilled: false }, [])).toEqual({
      state: "proposed",
      items: fallbackItems.map((i) => i.text),
    });
    expect(
      kickoffFocusContent({ ...aiList, validatedAt: "2026-10-07T12:00:00Z" }, []),
    ).toMatchObject({ state: "agreed" });
  });

  it("falls back to the presentation-only proposal, always as proposed, when nothing is saved", () => {
    // fallbackItems[1] is review_flag: "gong_only" — excluded automatically;
    // see the dedicated customer-safety describe block below.
    expect(kickoffFocusContent(null, fallbackItems)).toEqual({
      state: "proposed",
      items: [fallbackItems[0]!.text],
    });
    expect(kickoffFocusContent({ items: [], validatedAt: null }, fallbackItems)).toEqual({
      state: "proposed",
      items: [fallbackItems[0]!.text],
    });
  });

  it("is still empty when there is nothing saved and no fallback either", () => {
    expect(kickoffFocusContent(null, null)).toEqual({ state: "empty" });
    expect(kickoffFocusContent({ items: [], validatedAt: null }, [])).toEqual({ state: "empty" });
  });

  it("never exposes a safe fallback item's sources or review flag", () => {
    const content = kickoffFocusContent(null, fallbackItems);
    expect(content).toEqual({ state: "proposed", items: [fallbackItems[0]!.text] });
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

describe("kickoffFocusContent — fallback customer-safety filter (Aquatic/Jobber)", () => {
  // The internal proposeImplementationFocus() output, unfiltered — this
  // shape, review flags included, is exactly what the internal
  // ImplementationFocusPanel shows the TIS. Only kickoffFocusContent's
  // FALLBACK path (nothing saved yet) applies a customer-safety filter on
  // top of it; proposeImplementationFocus itself is never touched.
  const safeIntake = {
    id: "focus-1",
    text: "Build and configure the Chemical Delivery Ticket workflow for the field team to complete on site.",
    status: "proposed" as const,
    sources: [{ type: "intake" as const, label: "Chemical Delivery Ticket", quote: null }],
    reviewFlag: null,
  };
  const safeSow = {
    id: "focus-2",
    text: "Connect approved submission data to QuickBooks Online.",
    status: "proposed" as const,
    sources: [{ type: "sow" as const, label: "QuickBooks Online", quote: null }],
    reviewFlag: null,
  };
  const gongOnly = {
    id: "focus-3",
    text: "Build Jobber analytics for the ops team.",
    status: "proposed" as const,
    sources: [{ type: "gong" as const, label: "Discovery call", quote: "mentioned Jobber" }],
    reviewFlag: "gong_only" as const,
  };
  const conflict = {
    id: "focus-4",
    text: "Candidate conflicting with purchased scope.",
    status: "proposed" as const,
    sources: [{ type: "gong" as const, label: "Discovery call", quote: null }],
    reviewFlag: "conflict" as const,
  };

  it("1. a saved agreed item still renders", () => {
    const agreed = { ...safeSow, status: "agreed" as const };
    expect(
      kickoffFocusContent({ items: [agreed], validatedAt: "2026-10-07T12:00:00Z" }, [gongOnly]),
    ).toEqual({ state: "agreed", items: [agreed.text] });
  });

  it("2. a saved proposed item still renders as today — saved items are never re-filtered by review_flag", () => {
    // A saved item carrying a review flag is still the TIS's own working
    // proposal (deliberately generated/edited in the Hub) — this PR does
    // not newly filter it.
    const savedWithFlag = { ...gongOnly, id: "saved-1" };
    expect(kickoffFocusContent({ items: [savedWithFlag], validatedAt: null }, [])).toEqual({
      state: "proposed",
      items: [savedWithFlag.text],
    });
  });

  it("3. a safe fallback item (review_flag: null) renders", () => {
    expect(kickoffFocusContent(null, [safeIntake])).toEqual({
      state: "proposed",
      items: [safeIntake.text],
    });
  });

  it("4. a gong_only fallback item does NOT render", () => {
    expect(kickoffFocusContent(null, [gongOnly])).toEqual({ state: "empty" });
  });

  it("5. a conflict fallback item does NOT render", () => {
    expect(kickoffFocusContent(null, [conflict])).toEqual({ state: "empty" });
  });

  it("6. a mixed fallback list renders only the safe items, in order", () => {
    expect(kickoffFocusContent(null, [safeIntake, gongOnly, safeSow, conflict])).toEqual({
      state: "proposed",
      items: [safeIntake.text, safeSow.text],
    });
  });

  it("7. is empty, not an invented replacement, once every fallback item is filtered out", () => {
    expect(kickoffFocusContent(null, [gongOnly, conflict])).toEqual({ state: "empty" });
    expect(kickoffFocusContent({ items: [], validatedAt: null }, [gongOnly, conflict])).toEqual({
      state: "empty",
    });
  });

  it("8. provenance/review metadata is still not exposed, even by the filtering step itself", () => {
    const content = kickoffFocusContent(null, [safeIntake, gongOnly, conflict]);
    expect(Object.keys(content)).toEqual(["state", "items"]);
    expect(JSON.stringify(content)).not.toMatch(/gong_only|conflict|sources|reviewFlag/);
  });
});

describe("kickoffNextStepText — testing-oriented, never administrative", () => {
  it("uses the customer's own first-form name when there is one", () => {
    expect(kickoffNextStepText("Daily Water Haul Ticket")).toBe(
      "Put it to work. Test Daily Water Haul Ticket on a real job and see what needs to change.",
    );
  });

  it("falls back safely to a generic workflow reference when there is no form name", () => {
    expect(kickoffNextStepText(null)).toBe(
      "Put it to work. Test your GoCanvas workflow on a real job and see what needs to change.",
    );
  });
});

describe("kickoffJourneyStages — Kickoff View is the presentation used during Kickoff", () => {
  const sixStages = [
    { key: "pre_kickoff" as const, label: "Intake & Process", state: "now" as const, blurb: "" },
    { key: "kickoff" as const, label: "Kickoff", state: "later" as const, blurb: "" },
    { key: "get_it_working" as const, label: "Get it working", state: "later" as const, blurb: "" },
    { key: "make_it_yours" as const, label: "Make it yours", state: "later" as const, blurb: "" },
    { key: "make_it_run" as const, label: "Make it run", state: "later" as const, blurb: "" },
    { key: "complete" as const, label: "Graduate", state: "later" as const, blurb: "" },
  ];

  it("renders Intake & Process as done when the account is still pre_kickoff", () => {
    const stages = kickoffJourneyStages({ stages: sixStages, current: sixStages[0]! });
    expect(stages.find((s) => s.key === "pre_kickoff")!.state).toBe("done");
  });

  it("renders Kickoff as now / you are here when the account is still pre_kickoff", () => {
    const stages = kickoffJourneyStages({ stages: sixStages, current: sixStages[0]! });
    expect(stages.find((s) => s.key === "kickoff")!.state).toBe("now");
  });

  it("leaves every later stage untouched", () => {
    const stages = kickoffJourneyStages({ stages: sixStages, current: sixStages[0]! });
    for (const key of ["get_it_working", "make_it_yours", "make_it_run", "complete"] as const) {
      expect(stages.find((s) => s.key === key)!.state).toBe("later");
    }
  });

  it("does not mutate the source journey — a presentation read, never a write", () => {
    const frozenStages = sixStages.map((s) => Object.freeze({ ...s }));
    const before = JSON.parse(JSON.stringify(frozenStages));
    expect(() =>
      kickoffJourneyStages({ stages: frozenStages, current: frozenStages[0]! }),
    ).not.toThrow();
    expect(frozenStages).toEqual(before);
  });

  it("keeps the canonical six-stage order unchanged", () => {
    const stages = kickoffJourneyStages({ stages: sixStages, current: sixStages[0]! });
    expect(stages.map((s) => s.key)).toEqual([
      "pre_kickoff",
      "kickoff",
      "get_it_working",
      "make_it_yours",
      "make_it_run",
      "complete",
    ]);
  });

  it("changes nothing once the account has actually moved past Kickoff", () => {
    const atWorking = sixStages.map((s) =>
      s.key === "pre_kickoff" || s.key === "kickoff"
        ? { ...s, state: "done" as const }
        : s.key === "get_it_working"
          ? { ...s, state: "now" as const }
          : s,
    );
    const current = atWorking.find((s) => s.key === "get_it_working")!;
    const stages = kickoffJourneyStages({ stages: atWorking, current });
    // Identical to the input — nothing to correct once Kickoff is behind us.
    expect(stages).toEqual(atWorking);
  });
});

describe("the Kickoff conversation framework — static, never account-specific", () => {
  // These exist to prove, structurally, that none of the reusable
  // conversation copy takes a WelcomeView or any account-shaped input at
  // all — it is plain exported data, so there is nowhere for an
  // account-specific branch to be added without changing the type.
  it("KICKOFF_PROMISE is three plain icon/text entries", () => {
    expect(KICKOFF_PROMISE).toHaveLength(3);
    for (const item of KICKOFF_PROMISE) {
      expect(typeof item.icon).toBe("string");
      expect(typeof item.text).toBe("string");
    }
  });

  it("KICKOFF_STAGE_OUTCOME covers exactly the six canonical stage keys", () => {
    expect(Object.keys(KICKOFF_STAGE_OUTCOME).sort()).toEqual(
      [
        "complete",
        "get_it_working",
        "kickoff",
        "make_it_run",
        "make_it_yours",
        "pre_kickoff",
      ].sort(),
    );
    for (const text of Object.values(KICKOFF_STAGE_OUTCOME)) {
      expect(text.length).toBeGreaterThan(0);
      expect(text.length).toBeLessThan(60);
    }
  });

  it("KICKOFF_EXPECTATIONS names the three responsibility columns in the agreed order", () => {
    expect(KICKOFF_EXPECTATIONS.columns.map((c) => c.label)).toEqual([
      "GoCanvas",
      "Together",
      "Your Team",
    ]);
    expect(KICKOFF_EXPECTATIONS.columns.map((c) => c.role)).toEqual([
      "We lead and guide",
      "We keep things moving",
      "You participate and own",
    ]);
  });

  it("KICKOFF_EXPECTATIONS carries no response term, penalty or contract wording", () => {
    const all = [
      ...KICKOFF_EXPECTATIONS.columns.flatMap((c) => [...c.items]),
      KICKOFF_EXPECTATIONS.momentum.text,
    ].join(" ");
    expect(all).not.toMatch(
      /business.day|response term|within \d+|penalt|contract|signed|hours?\b/i,
    );
    expect(all).toMatch(/blocker/i);
    expect(KICKOFF_EXPECTATIONS.momentum.text).toBe(
      "Test, share feedback and complete agreed actions between meetings. Raise blockers early so we can adjust the plan together.",
    );
  });

  it("KICKOFF_FORM_STEPS are the three form-review steps, in order", () => {
    expect(KICKOFF_FORM_STEPS.map((s) => s.label)).toEqual(["Review", "Refine", "Test"]);
  });
});

describe("the 'to confirm' markers — nothing the AI or Sales wrote reads as the customer's word", () => {
  const known = (confirmed: boolean) => ({
    intake: {
      known: [
        {
          key: "business_outcome",
          ask: "What success looks like for you",
          value: "Same day",
          confirmed,
        },
      ],
      needed: [],
    },
  });

  it("marks the business outcome until the customer confirms it on their page", async () => {
    const { kickoffBusinessOutcomeConfirmed } = await import("../kickoff-view");
    expect(kickoffBusinessOutcomeConfirmed({ intake: null })).toBe(false);
    expect(kickoffBusinessOutcomeConfirmed(known(false))).toBe(false);
    expect(kickoffBusinessOutcomeConfirmed(known(true))).toBe(true);
  });

  it("marks the workflow as confirmed only once a person has validated it", () => {
    expect(kickoffWorkflowConfirmed(null)).toBe(false);
    expect(kickoffWorkflowConfirmed({ validatedAt: null })).toBe(false);
    expect(kickoffWorkflowConfirmed({ validatedAt: "2026-10-07T12:00:00Z" })).toBe(true);
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
