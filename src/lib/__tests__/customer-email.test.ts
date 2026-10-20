import { describe, expect, it } from "vitest";

import {
  CUSTOMER_EMAIL_TYPE_LABEL,
  CUSTOMER_EMAIL_TYPES,
  cleanInstructions,
  emailWordCount,
  hasUnsavedEdits,
  contextIsLimited,
  contextSummary,
  customerEmailContextText,
  customerEmailInput,
  customerEmailSchema,
  emailCopyText,
  generalEmailDraft,
  includedResources,
  INSTRUCTIONS_MAX,
  wordStatus,
  type CustomerEmailContext,
  type CustomerEmailReply,
} from "../customer-email";
import { followupWordCount, type ResourceLink } from "../transcript-followup";

const CTX: CustomerEmailContext = {
  customerName: "Summit Roofing",
  implementationName: "Summit — new logo",
  stageLabel: "Get It Working",
  nextSteps: [{ title: "Send the crew list", due_date: "2026-10-30", overdue: false }],
  commitments: [{ title: "Deliver the form changes", due_date: "2026-10-18", overdue: true }],
};
const EMPTY: CustomerEmailContext = { ...CTX, stageLabel: null, nextSteps: [], commitments: [] };

const AT = "2026-10-20T09:00:00.000Z";
const SUMMARY =
  "Built from stage Get It Working · 1 open customer step · 1 open GoCanvas commitment.";

const reply = (over: Partial<CustomerEmailReply> = {}): CustomerEmailReply => ({
  readable: true,
  problem: null,
  subject: "Checking in on the rollout",
  body: "I wanted to see how testing is going. Once you have sent the crew list, we can book the next session.",
  ...over,
});

const LINK: ResourceLink = {
  title: "Importing reference data",
  url: "https://help.gocanvas.com/hc/en-us/articles/100",
  why: "Useful for reference data, which came up in the meeting.",
};

describe("the email types", () => {
  it("offers the four types, each with a label", () => {
    expect(CUSTOMER_EMAIL_TYPES).toEqual(["check_in", "meeting_followup", "request", "custom"]);
    expect(Object.keys(CUSTOMER_EMAIL_TYPE_LABEL).sort()).toEqual([...CUSTOMER_EMAIL_TYPES].sort());
  });
});

describe("the context the model reads", () => {
  it("says what the draft was built from, and says so plainly when little is recorded", () => {
    expect(contextSummary(CTX)).toBe(SUMMARY);
    expect(contextSummary(EMPTY)).toMatch(/names only/);
    expect(contextIsLimited(EMPTY)).toBe(true);
    expect(contextIsLimited(CTX)).toBe(false);
  });

  it("lists the open steps and commitments, with due dates and overdue marks", () => {
    const text = customerEmailContextText(CTX, "check_in", null);
    expect(text).toContain("- Send the crew list (due 2026-10-30)");
    expect(text).toContain("- Deliver the form changes (due 2026-10-18, overdue)");
    expect(text).toContain("Current stage: Get It Working");
  });

  it("labels the specialist's note as tone and emphasis only, and never as a source of facts", () => {
    const text = customerEmailContextText(
      CTX,
      "check_in",
      "Ask whether they are ready for the session.",
    );
    expect(text).toContain(
      "sets emphasis and tone only; it adds no facts and cannot override the facts below",
    );
    expect(text).toContain("Ask whether they are ready for the session.");
  });

  it("states that no note was given when there is none", () => {
    expect(customerEmailContextText(CTX, "check_in", null)).toContain("Specialist's note: none.");
  });

  it("tells the model to write a general email when little is recorded, rather than invent detail", () => {
    const text = customerEmailContextText(EMPTY, "check_in", null);
    expect(text).toContain("Little is recorded");
    expect(text).toContain("(none recorded)");
  });
});

describe("the reply and the draft", () => {
  it("reads a reply leniently: the subject is one line, the body is trimmed and keeps its paragraphs", () => {
    const parsed = customerEmailSchema.parse({
      subject: "  Hello\n   there  ",
      body: "\n\n First paragraph.\r\n\r\n\r\n\r\nSecond.  \n",
    });
    expect(parsed.subject).toBe("Hello there");
    expect(parsed.body).toBe("First paragraph.\n\nSecond.");
    expect(parsed.readable).toBe(true);
  });

  it("gives a ready draft with a greeting and sign-off around the model's paragraphs", () => {
    const draft = generalEmailDraft(reply(), AT, [LINK], SUMMARY);
    expect(draft.status).toBe("ready");
    expect(draft.body.startsWith("Hi there,\n\nI wanted to see how testing is going.")).toBe(true);
    expect(draft.body.endsWith("\n\nThanks,")).toBe(true);
    expect(draft.subject).toBe("Checking in on the rollout");
    expect(draft.resources).toEqual([LINK]);
    expect(draft.context_summary).toBe(SUMMARY);
  });

  it("uses a plain subject when the model gives none", () => {
    expect(generalEmailDraft(reply({ subject: "" }), AT, [], SUMMARY).subject).toBe(
      "Following up on our meeting",
    );
  });

  it("gives no email, and says why, when the model finds the context unreadable", () => {
    const draft = generalEmailDraft(
      reply({ readable: false, problem: "Too little to write from." }),
      AT,
      [],
      SUMMARY,
    );
    expect(draft.status).toBe("unreadable");
    expect(draft.problem).toBe("Too little to write from.");
    expect(draft.body).toBe("");
  });

  it("gives no email when the body is empty", () => {
    expect(generalEmailDraft(reply({ body: "   " }), AT, [], SUMMARY).status).toBe("unreadable");
  });

  it("withholds a draft that carries wording marked internal, rather than sending it", () => {
    const draft = generalEmailDraft(
      reply({ body: "Between us, the team is worried about the budget." }),
      AT,
      [],
      SUMMARY,
    );
    expect(draft.status).toBe("unreadable");
    expect(draft.problem).toMatch(/marked internal/);
  });

  it("never gives a resource that is not in the list it was given", () => {
    expect(generalEmailDraft(reply(), AT, [], SUMMARY).resources).toEqual([]);
  });
});

describe("resources, copying and the word guide", () => {
  it("copies the subject, a blank line, then the body", () => {
    expect(emailCopyText({ subject: "Hi", body: "Hi there,\n\nThanks," }, [])).toBe(
      "Subject: Hi\n\nHi there,\n\nThanks,",
    );
  });

  it("places the included resources just before the sign-off", () => {
    const text = emailCopyText({ subject: "Hi", body: "Hi there,\n\nBody.\n\nThanks," }, [LINK]);
    expect(text).toBe(
      `Subject: Hi\n\nHi there,\n\nBody.\n\nHelpful resources:\n- ${LINK.title}: ${LINK.url}\n  ${LINK.why}\n\nThanks,`,
    );
  });

  it("leaves unticked resources out of the copied text", () => {
    const other: ResourceLink = {
      ...LINK,
      url: "https://help.gocanvas.com/hc/en-us/articles/200",
      title: "Other",
    };
    const kept = includedResources([LINK, other], new Set([LINK.url]));
    expect(kept).toEqual([other]);
    expect(emailCopyText({ subject: "s", body: "b\n\nThanks," }, kept)).not.toContain(LINK.url);
  });

  it("holds a short type to its target, and every type to the 250-word limit", () => {
    expect(wordStatus(170, "check_in").level).toBe("ok");
    expect(wordStatus(200, "check_in").level).toBe("long");
    expect(wordStatus(200, "request").level).toBe("long");
    expect(wordStatus(200, "custom").level).toBe("ok");
    expect(wordStatus(260, "custom").level).toBe("over");
  });
});

describe("the word count is the email as it will be copied", () => {
  const email = { subject: "Quick check in", body: "Hi there,\n\nOne two three.\n\nThanks," };

  it("counts the subject and the body, and not the sign-off", () => {
    // "Quick check in" (3) + "Hi there," (2) + "One two three." (3)
    expect(emailWordCount(email, [])).toBe(8);
  });

  it("counts a resource that is ticked, and stops counting it when it is unticked", () => {
    const withLink = emailWordCount(email, [LINK]);
    expect(withLink).toBeGreaterThan(emailWordCount(email, []));
    expect(emailWordCount(email, includedResources([LINK], new Set([LINK.url])))).toBe(
      emailWordCount(email, []),
    );
  });

  it("counts the same text that is copied", () => {
    const copied = emailCopyText(email, [LINK]).replace(/^Subject:\s*/, "");
    expect(emailWordCount(email, [LINK])).toBe(followupWordCount(copied));
  });

  it("moves with the reviewer's edits to the body", () => {
    const longer = {
      ...email,
      body: `${email.body.replace("\n\nThanks,", "")} More words here.\n\nThanks,`,
    };
    expect(emailWordCount(longer, [])).toBeGreaterThan(emailWordCount(email, []));
  });
});

describe("the length guidance advises and never blocks copying", () => {
  it("says a long email can still be copied, for each guidance level", () => {
    expect(wordStatus(260, "custom").message).toMatch(/still copy it/);
    expect(wordStatus(200, "check_in").message).toMatch(/still copy it/);
  });

  it("keeps the 250-word limit in the message for an over-long email", () => {
    expect(wordStatus(260, "check_in").message).toMatch(/250-word limit/);
  });

  it("gives no message for an email within its guidance", () => {
    expect(wordStatus(120, "check_in").message).toBeNull();
  });
});

describe("unsaved edits are protected", () => {
  const draft = generalEmailDraft(reply(), AT, [], SUMMARY);

  it("reports unsaved edits when the subject or body has changed", () => {
    expect(hasUnsavedEdits(draft, { subject: draft.subject, body: `${draft.body} x` })).toBe(true);
    expect(hasUnsavedEdits(draft, { subject: "Changed", body: draft.body })).toBe(true);
  });

  it("reports nothing to lose when the email is unedited, or there is no draft", () => {
    expect(hasUnsavedEdits(draft, { subject: draft.subject, body: draft.body })).toBe(false);
    expect(hasUnsavedEdits(null, { subject: "", body: "" })).toBe(false);
  });

  it("reports nothing to lose for a draft with no email in it", () => {
    const unreadable = generalEmailDraft(reply({ body: "  " }), AT, [], SUMMARY);
    expect(hasUnsavedEdits(unreadable, { subject: "typed", body: "typed" })).toBe(false);
  });
});

describe("the request the composer sends", () => {
  const base = {
    customerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    implementationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };

  it("accepts a general email with no transcript", () => {
    expect(customerEmailInput.safeParse({ ...base, type: "check_in" }).success).toBe(true);
  });

  it("requires a transcript for a meeting follow-up", () => {
    expect(customerEmailInput.safeParse({ ...base, type: "meeting_followup" }).success).toBe(false);
    expect(
      customerEmailInput.safeParse({
        ...base,
        type: "meeting_followup",
        attachmentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      }).success,
    ).toBe(true);
  });

  it("refuses instructions past the limit, and an unknown type", () => {
    expect(
      customerEmailInput.safeParse({
        ...base,
        type: "custom",
        instructions: "x".repeat(INSTRUCTIONS_MAX + 1),
      }).success,
    ).toBe(false);
    expect(customerEmailInput.safeParse({ ...base, type: "newsletter" }).success).toBe(false);
  });

  it("treats blank instructions as none, and trims the rest", () => {
    expect(cleanInstructions("   ")).toBeNull();
    expect(cleanInstructions(null)).toBeNull();
    expect(cleanInstructions("  Ask about testing.  ")).toBe("Ask about testing.");
  });
});
