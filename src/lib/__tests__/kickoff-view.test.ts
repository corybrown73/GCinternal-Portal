import { describe, expect, it } from "vitest";

import {
  KICKOFF_HANDOFF,
  KICKOFF_JOURNEY_BAND,
  KICKOFF_PRINCIPLES,
  KICKOFF_PROMISE,
  KICKOFF_RESPONSIBILITY,
  KICKOFF_STAGE_OUTCOME,
  KICKOFF_WORKFLOW_PROMPTS,
  kickoffBusinessOutcome,
  kickoffConcise,
  kickoffFocusContent,
  kickoffFocusGroups,
  kickoffJourneyStages,
  kickoffNextStepText,
  kickoffWorkflowFallback,
  kickoffWorkflowSlide,
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

describe("kickoffFocusGroups — NOW dominant, NEXT/LATER secondary, capped not invented", () => {
  it("puts a single item in NOW and leaves NEXT/LATER empty", () => {
    expect(kickoffFocusGroups(["Replace the paper ticket."])).toEqual({
      now: ["Replace the paper ticket."],
      next: [],
      later: [],
    });
  });

  it("groups items two and three into NEXT, not a fourth NOW/NEXT/LATER column", () => {
    expect(kickoffFocusGroups(["A", "B", "C"])).toEqual({
      now: ["A"],
      next: ["B", "C"],
      later: [],
    });
  });

  it("caps the display at six items total rather than overflowing the slide or inventing structure", () => {
    const items = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const groups = kickoffFocusGroups(items);
    expect(groups).toEqual({
      now: ["A"],
      next: ["B", "C"],
      later: ["D", "E", "F"],
    });
    // G and H are silently capped, not renamed into a fourth bucket.
    expect([...groups.now, ...groups.next, ...groups.later]).toHaveLength(6);
  });
});

describe("kickoffConcise — shortens without inventing or cutting mid-word", () => {
  it("leaves a short string untouched", () => {
    expect(kickoffConcise("Running the job.")).toBe("Running the job.");
  });

  it("leaves null as null", () => {
    expect(kickoffConcise(null)).toBeNull();
  });

  it("trims a long string at a word boundary, never mid-word", () => {
    const long =
      "Three crews fill in a paper haul ticket on the truck and the office retypes them on Fridays and chases the missing signatures every single week without fail.";
    const result = kickoffConcise(long, 60);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(61);
    expect(result!.endsWith("…")).toBe(true);
    expect(long.startsWith(result!.slice(0, -1))).toBe(true);
  });
});

describe("kickoffWorkflowSlide — precedence plus the concise slide limit, in one call", () => {
  it("a saved workflow_story wins over the structured fallback", () => {
    expect(
      kickoffWorkflowSlide({
        workflowStory: {
          before: "Saved: a dispatch ticket from the office.",
          during: null,
          after: null,
        },
        currentProcess: "Fallback: paper ticket from the truck.",
        firstFormName: "Daily Water Haul Ticket",
        businessOutcome: "Fallback outcome.",
      }),
    ).toEqual({
      before: "Saved: a dispatch ticket from the office.",
      during: null,
      after: null,
    });
  });

  it("falls back to the structured hypothesis when nothing is saved", () => {
    expect(
      kickoffWorkflowSlide({
        workflowStory: null,
        currentProcess: "Paper ticket from the truck, retyped on Fridays.",
        firstFormName: "Daily Water Haul Ticket",
        businessOutcome: "Invoices go out the same day.",
      }),
    ).toEqual({
      before: "Paper ticket from the truck, retyped on Fridays.",
      during: "Running Daily Water Haul Ticket on the job.",
      after: "Invoices go out the same day.",
    });
  });

  it("is null when there is no saved story and no structured evidence either", () => {
    expect(
      kickoffWorkflowSlide({
        workflowStory: null,
        currentProcess: null,
        firstFormName: null,
        businessOutcome: null,
      }),
    ).toBeNull();
  });

  it("trims a long saved leg to a safe slide length rather than dumping it verbatim", () => {
    const longProcess =
      "Three crews fill in a paper haul ticket on the truck and the office retypes them on Fridays and chases the missing signatures every single week without fail, which is exhausting for everyone involved.";
    const result = kickoffWorkflowSlide({
      workflowStory: { before: longProcess, during: null, after: null },
      currentProcess: null,
      firstFormName: null,
      businessOutcome: null,
    });
    expect(result!.before!.length).toBeLessThan(longProcess.length);
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

describe("KICKOFF_JOURNEY_BAND — fixed Kickoff-presentation copy, never a stage's own blurb", () => {
  it("is a plain static string, not a function of any journey/account data", () => {
    expect(typeof KICKOFF_JOURNEY_BAND).toBe("string");
    expect(KICKOFF_JOURNEY_BAND.length).toBeGreaterThan(0);
  });

  it("is not the pre-kickoff stage's own 'before we meet' blurb", () => {
    expect(KICKOFF_JOURNEY_BAND).not.toMatch(/before we meet/i);
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

  it("KICKOFF_WORKFLOW_PROMPTS has before/during/after prompts, not customer facts", () => {
    expect(KICKOFF_WORKFLOW_PROMPTS.before.length).toBeGreaterThan(0);
    expect(KICKOFF_WORKFLOW_PROMPTS.during.length).toBeGreaterThan(0);
    expect(KICKOFF_WORKFLOW_PROMPTS.after.length).toBeGreaterThan(0);
    // Every prompt is a question for the call, not an assertion of fact.
    const all = [
      ...KICKOFF_WORKFLOW_PROMPTS.before,
      ...KICKOFF_WORKFLOW_PROMPTS.during,
      ...KICKOFF_WORKFLOW_PROMPTS.after,
    ];
    for (const prompt of all) expect(prompt.trim().endsWith("?")).toBe(true);
  });

  it("KICKOFF_PRINCIPLES explains the implementation approach, not invented scope", () => {
    expect(KICKOFF_PRINCIPLES).toHaveLength(3);
    expect(KICKOFF_PRINCIPLES.map((p) => p.label)).toEqual([
      "Make the work easy",
      "Make the information useful",
      "Connect what matters",
    ]);
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

  it("KICKOFF_RESPONSIBILITY and KICKOFF_HANDOFF are plain static copy", () => {
    expect(KICKOFF_RESPONSIBILITY).toHaveLength(3);
    expect(KICKOFF_HANDOFF.map((s) => s.label)).toEqual(["We refine", "You test", "We learn"]);
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
