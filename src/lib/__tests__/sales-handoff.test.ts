import { describe, expect, it } from "vitest";

import { readIntake } from "../intake-answers";
import { prefillHandoffFromSynthesis } from "../intake-prefill";
import {
  answerSource,
  answerValue,
  customerPrompt,
  defaultAsk,
  handoffChecks,
  handoffPatch,
  HANDOFF_QUESTIONS,
  mergeHandoffBlock,
  missingLine,
  sourceForRole,
} from "../sales-handoff";
import { stageFlow } from "../stage-flow";

const at = "2026-10-01T15:00:00Z";
const who = (source: "sales" | "tis" | "customer") => ({ source, by: null, at });

/** A handoff with every required Sales answer in. */
const salesDone = {
  handoff: {
    answers: {
      bought: {
        value: ["Form Build · Daily job report"],
        source: "sales",
        at,
        by: null,
        quote: null,
      },
      business_outcome: {
        value: "Invoices out the same day",
        source: "ai",
        at,
        by: null,
        quote: "same day",
      },
      contact_decision_maker: {
        value: "Pat · Ops director",
        source: "sales",
        at,
        by: null,
        quote: null,
      },
      contact_admin_builder: {
        value: "Sam · Office manager",
        source: "sales",
        at,
        by: null,
        quote: null,
      },
      desired_launch_date: { value: "2026-11-02", source: "sales", at, by: null, quote: null },
    },
    commitments_none: true,
  },
};

describe("the Sales → TIS handoff", () => {
  it("reads answers from where they live: the handoff block, an intake field, or the plan", () => {
    const a = readIntake({
      current_process: "Paper tickets on the truck.",
      field_users: 40,
      timeline: {
        services: [{ id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2 }],
      },
      ...salesDone,
    });
    expect(answerValue(a, "current_process")).toBe("Paper tickets on the truck.");
    expect(answerValue(a, "field_users")).toBe("40");
    expect(answerValue(a, "bought")).toEqual(["Form Build · Daily job report"]);
    // Nothing stored for "bought": the plan's services stand in.
    const plan = readIntake({
      timeline: {
        services: [{ id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2 }],
      },
    });
    expect(answerValue(plan, "bought")).toEqual(["Integration · QuickBooks Online"]);
    expect(answerSource(plan, "bought")).toBe("sales");
    expect(answerValue(plan, "open_questions")).toBeNull();
    expect(answerSource(plan, "open_questions")).toBeNull();
  });

  it("knows who answered: the stamp, else the AI marks on the field, else a person", () => {
    const ai = readIntake({ current_process: "From the brief", ai_filled: ["current_process"] });
    expect(answerSource(ai, "current_process")).toBe("ai");
    const typed = readIntake({ current_process: "Whiteboard", current_process_source: "person" });
    expect(answerSource(typed, "current_process")).toBe("sales");
    const confirmed = readIntake({
      current_process: "Whiteboard",
      handoff: {
        answers: {
          current_process: { value: "Whiteboard", source: "customer", at, by: null, quote: null },
        },
      },
    });
    expect(answerSource(confirmed, "current_process")).toBe("customer");
    expect(answerSource(readIntake({ ...salesDone }), "business_outcome")).toBe("ai");
  });

  it("writes a stamp, and the intake field when the question lives there", () => {
    const stored = handoffPatch("business_outcome", "Same-day invoices", who("sales"));
    expect(stored).toEqual({
      handoff: {
        answers: {
          business_outcome: {
            value: "Same-day invoices",
            source: "sales",
            at,
            by: null,
            quote: null,
          },
        },
      },
    });
    const field = handoffPatch("field_users", "about 40", who("customer"));
    expect(field["field_users"]).toBe(40);
    const process = handoffPatch("current_process", " Paper. ", who("customer"));
    expect(process["current_process"]).toBe("Paper.");
    expect(process["current_process_source"]).toBe("person");
    // Clearing removes the stamp and the field.
    const cleared = handoffPatch("current_process", null, who("tis"));
    expect((cleared["handoff"] as any).answers.current_process).toBeNull();
    expect(cleared["current_process"]).toBeNull();
    expect(() => handoffPatch("nope", "x", who("tis"))).toThrow(/Unknown handoff question/);
  });

  it("merges the block one answer at a time", () => {
    const cur = readIntake({ ...salesDone }).handoff;
    const next = mergeHandoffBlock(cur, {
      answers: {
        open_questions: { value: "Who owns the list?", source: "tis", at, by: null, quote: null },
        bought: null,
      },
      completed_at: at,
    });
    expect(Object.keys(next.answers).sort()).toEqual([
      "business_outcome",
      "contact_admin_builder",
      "contact_decision_maker",
      "desired_launch_date",
      "open_questions",
    ]);
    expect(next.completed_at).toBe(at);
    expect(next.commitments_none).toBe(true);
    expect(mergeHandoffBlock(cur, null)).toBe(cur);
  });

  it("checks both sides and names the status", () => {
    const blank = handoffChecks(readIntake({}));
    expect(blank.status).toBe("outstanding");
    expect(blank.salesComplete.done).toBe(false);
    expect(blank.salesComplete.missing.map((q) => q.key)).toEqual([
      "bought",
      "business_outcome",
      "commitments",
      "contact_decision_maker",
      "contact_admin_builder",
      "desired_launch_date",
    ]);
    expect(missingLine(blank.salesComplete.missing)).toBe(
      "Missing: what was bought, the outcome the customer wants, what was promised +3",
    );

    // Every Sales answer in, "nothing promised" ticked: the Sales side is done.
    const sales = handoffChecks(readIntake({ ...salesDone }));
    expect(sales.salesComplete.done).toBe(true);
    expect(sales.customerReady.done).toBe(false);
    expect(sales.status).toBe("outstanding");

    // What was promised, drafted by the AI, is a draft: a person says it.
    const promised = handoffChecks(
      readIntake({
        handoff: {
          ...salesDone.handoff,
          commitments_none: false,
          answers: {
            ...salesDone.handoff.answers,
            commitments: { value: "A free PDF", source: "ai", at, by: null, quote: "free PDF" },
          },
        },
      }),
    );
    expect(promised.salesComplete.done).toBe(false);
    expect(promised.salesComplete.missing.map((q) => q.key)).toEqual(["commitments"]);
    const stated = handoffChecks(
      readIntake({
        handoff: {
          ...salesDone.handoff,
          commitments_none: false,
          answers: {
            ...salesDone.handoff.answers,
            commitments: { value: "A free PDF", source: "sales", at, by: null, quote: null },
          },
        },
      }),
    );
    expect(stated.salesComplete.done).toBe(true);

    // Sent to the customer: with them until their answers come back.
    const sent = handoffChecks(
      readIntake({
        ...salesDone,
        handoff: { ...salesDone.handoff, sent_to_customer_at: at, asked: ["current_process"] },
      }),
    );
    expect(sent.status).toBe("sent");

    // Their answers in: complete.
    const done = handoffChecks(
      readIntake({
        ...salesDone,
        current_process: "Paper",
        field_users: 12,
        handoff: {
          ...salesDone.handoff,
          sent_to_customer_at: at,
          answers: {
            ...salesDone.handoff.answers,
            kickoff_attendees: {
              value: "Pat, Sam, two crew leads",
              source: "customer",
              at,
              by: null,
              quote: null,
            },
          },
        },
      }),
    );
    expect(done.status).toBe("complete");

    // A person's say-so on either side counts.
    const forced = handoffChecks(
      readIntake({
        handoff: {
          completed_at: at,
          customer_ready_override: { at, by: null, reason: "Covered on the closing call" },
        },
      }),
    );
    expect(forced.status).toBe("complete");
    expect(forced.customerReady.overridden).toBe(true);
  });

  it("builds the customer's page: what we know (shareable), what we still need (asked, blank)", () => {
    expect(customerPrompt(readIntake({ ...salesDone }))).toBeNull();
    const p = customerPrompt(
      readIntake({
        ...salesDone,
        current_process: "Paper",
        handoff: {
          ...salesDone.handoff,
          sent_to_customer_at: at,
          asked: ["kickoff_attendees", "field_users", "current_process"],
          answers: {
            ...salesDone.handoff.answers,
            commitments: { value: "A free PDF", source: "sales", at, by: null, quote: null },
            current_process: { value: "Paper", source: "customer", at, by: null, quote: null },
          },
        },
      }),
    )!;
    // Commitments never go to the customer; the process shows as confirmed.
    expect(p.known.map((k) => k.key)).not.toContain("commitments");
    expect(p.known.find((k) => k.key === "current_process")).toMatchObject({ confirmed: true });
    expect(p.known.find((k) => k.key === "business_outcome")).toMatchObject({ confirmed: false });
    expect(p.needed.map((n) => n.key)).toEqual(["field_users", "kickoff_attendees"]);
    expect(defaultAsk(readIntake({}))).toEqual(
      HANDOFF_QUESTIONS.filter((q) => q.side === "customer").map((q) => q.key),
    );
  });

  it("shows what the AI drafted for the customer as theirs to confirm, and counts it outstanding until they do", () => {
    const drafted = readIntake({
      ...salesDone,
      current_process: "Paper tickets",
      current_process_source: "ai",
      field_users: 12,
      handoff: {
        ...salesDone.handoff,
        sent_to_customer_at: at,
        asked: ["kickoff_attendees"],
        answers: {
          ...salesDone.handoff.answers,
          kickoff_attendees: {
            value: "Pat, Sam and two crew leads",
            source: "ai",
            at,
            by: null,
            quote: "Pat and Sam will be on",
          },
          devices: { value: "Company iPads", source: "ai", at, by: null, quote: "iPads" },
        },
      },
    });
    const p = customerPrompt(drafted)!;
    // On their page as an answer to confirm, not as something they said.
    expect(p.known.find((k) => k.key === "kickoff_attendees")).toMatchObject({
      value: "Pat, Sam and two crew leads",
      confirmed: false,
    });
    expect(p.known.find((k) => k.key === "devices")).toMatchObject({ confirmed: false });
    expect(p.needed.map((n) => n.key)).not.toContain("kickoff_attendees");
    // The readiness check waits for their word.
    const checks = handoffChecks(drafted);
    expect(checks.customerReady.done).toBe(false);
    expect(checks.customerReady.missing.map((q) => q.key)).toEqual([
      "current_process",
      "kickoff_attendees",
    ]);
    expect(checks.status).toBe("sent");

    const confirmed = readIntake({
      ...drafted,
      handoff: {
        ...drafted.handoff,
        answers: {
          ...drafted.handoff.answers,
          current_process: {
            value: "Paper tickets",
            source: "customer",
            at,
            by: null,
            quote: null,
          },
          kickoff_attendees: {
            value: "Pat, Sam and two crew leads",
            source: "customer",
            at,
            by: null,
            quote: null,
          },
        },
      },
    });
    expect(
      customerPrompt(confirmed)!.known.find((k) => k.key === "kickoff_attendees"),
    ).toMatchObject({ confirmed: true });
    expect(handoffChecks(confirmed).customerReady.done).toBe(true);
    expect(handoffChecks(confirmed).status).toBe("complete");
  });

  it("maps a role to the source it implies", () => {
    expect(sourceForRole("sales")).toBe("sales");
    expect(sourceForRole("am")).toBe("sales");
    expect(sourceForRole("implementation")).toBe("tis");
    expect(sourceForRole("manager")).toBe("tis");
  });

  it("no longer gates Pre-Kickoff on the Sales handoff — that boundary is Closed Won's", () => {
    const input = {
      stage: "onboarding_kickoff",
      intake: {
        path: "new_logo",
        handoff_tasks: {
          intake_complete: at,
          prep_process: at,
          prep_form: at,
          prep_data: at,
          process_understanding: "yes",
        },
        timeline: {
          overrides: { kickoff: "2026-10-06", working: "2026-10-09", adjust: "2026-10-16" },
          times: { kickoff: "10:00", working: "10:00", adjust: "10:00" },
        },
      },
      owner: "Dana",
      gongReports: 1,
      hasSow: true,
      hasBrief: true,
      hasLink: true,
    };
    const f = stageFlow(input);
    const pk = f.stages.find((s) => s.key === "pre_kickoff")!;
    expect(pk.tasks.map((t) => t.key)).not.toContain("handoff");
    expect(pk.done).toBe(true);
    expect(f.advanceTo).toBe("kickoff");
    // Field Fusion has its own handoff from the setup owner, and skips
    // straight to booking Kickoff.
    const ff = stageFlow({ ...input, intake: { path: "field_fusion" } });
    expect(ff.stages.find((s) => s.key === "pre_kickoff")!.tasks.map((t) => t.key)).toEqual([
      "kickoff",
    ]);
  });

  it("lets the AI fill the handoff's blanks, never a person's or the customer's words", () => {
    const brief = {
      goals: ["Invoices out the same day", "No more re-typing"],
      stakeholders: [
        { name: "Pat Lee", role: "Director of Operations", notes: "signs the contract" },
        { name: "Sam Ortiz", role: "Office manager", notes: "will build the forms" },
      ],
      risks_open_items: ["Who owns the parts list?"],
      dates: [
        { type: "deadline", date: "2026-11-02", end: null, who: null, quote: "live by Nov 2" },
      ],
      kickoff: {
        day_90_definition: "Every crew submitting daily",
        integrations: ["QuickBooks Online · invoice from closed tickets"],
        it_contact: "Kim (IT)",
      },
    };
    const fresh = prefillHandoffFromSynthesis(readIntake({}), brief, at);
    expect(Object.keys(fresh.answers).sort()).toEqual([
      "business_outcome",
      "contact_admin_builder",
      "contact_decision_maker",
      "desired_launch_date",
      "open_questions",
      "success_measure",
      "system_requirements",
    ]);
    expect(fresh.answers["contact_decision_maker"]).toMatchObject({
      value: "Pat Lee · Director of Operations",
      source: "ai",
      quote: "signs the contract",
    });
    expect(fresh.answers["desired_launch_date"]!.value).toBe("2026-11-02");
    expect(fresh.answers["commitments"]).toBeUndefined();

    const typed = readIntake({
      handoff: {
        answers: {
          business_outcome: { value: "Their words", source: "sales", at, by: null, quote: null },
          desired_launch_date: {
            value: "2026-12-01",
            source: "customer",
            at,
            by: null,
            quote: null,
          },
        },
      },
    });
    const again = prefillHandoffFromSynthesis(typed, brief, at);
    expect(again.answers["business_outcome"]).toBeUndefined();
    expect(again.answers["desired_launch_date"]).toBeUndefined();
    expect(again.answers["success_measure"]).toBeDefined();
  });
});
