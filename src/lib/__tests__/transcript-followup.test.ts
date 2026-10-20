import { describe, expect, it } from "vitest";

import type { HelpArticle } from "../help-articles";
import {
  composeFollowupBody,
  customerPoints,
  draftFromReply,
  FALLBACK_SUBJECT,
  followupEmailSchema,
  followupEmailText,
  followupWordCount,
  isApprovedResourceUrl,
  isFollowupEdited,
  pickResourceLinks,
  resourcesForReply,
  storedFollowupDraft,
  UNREADABLE_PROBLEM,
  WORD_GUIDE,
  type FollowupReply,
} from "../transcript-followup";

const AT = "2026-10-20T09:00:00.000Z";

/** A reply as the model would send it, run through the schema the way the server does. */
const reply = (over: Record<string, unknown> = {}): FollowupReply =>
  followupEmailSchema.parse({
    readable: true,
    problem: null,
    subject: "Kickoff follow-up: forms and go-live",
    recipient_name: null,
    recap: "We met to plan the forms rollout for the crew.",
    decisions: ["Go-live stays on the agreed date."],
    gocanvas_next_steps: ["Send the reference data template."],
    customer_next_steps: ["Share the list of crew members."],
    agreed_dates: ["Go-live review on 3 November 2026."],
    open_questions: ["Whether the crew needs offline mode."],
    ...over,
  });

const article = (
  over: Partial<HelpArticle> & Pick<HelpArticle, "article_id" | "title">,
): HelpArticle => ({
  category: "Reference Data",
  tags: [],
  url: `https://help.gocanvas.com/hc/en-us/articles/${over.article_id}`,
  ...over,
});

const REFERENCE = article({
  article_id: "100",
  title: "Importing reference data from a spreadsheet",
});

describe("the reply is read leniently and kept to what the email may hold", () => {
  it("strips bullets and numbers, drops empty and non-text items, and caps the lists", () => {
    const parsed = followupEmailSchema.parse({
      readable: true,
      decisions: ["- Keep the date", "1. Use the new form", "", 42, null, "  "],
      open_questions: Array.from({ length: 10 }, (_, i) => `Question ${i}`),
    });
    expect(parsed.decisions).toEqual(["Keep the date", "Use the new form"]);
    expect(parsed.open_questions).toHaveLength(6);
  });

  it("cuts an over-long item to the limit rather than failing the whole reply", () => {
    const parsed = followupEmailSchema.parse({ decisions: ["x".repeat(500)] });
    expect(parsed.decisions[0]).toHaveLength(200);
  });

  it("reads a missing readable flag as readable, and a missing list as empty", () => {
    const parsed = followupEmailSchema.parse({ recap: "Thanks for the call." });
    expect(parsed.readable).toBe(true);
    expect(parsed.decisions).toEqual([]);
  });
});

describe("what the customer may see", () => {
  it("withholds an internal point and counts it, rather than sending it", () => {
    const p = customerPoints(
      reply({
        customer_next_steps: ["Share the crew list.", "Internal only: they are slow to decide."],
      }),
    );
    expect(p.customer).toEqual(["Share the crew list."]);
    expect(p.withheld).toBe(1);
  });

  it("withholds an internal recap entirely", () => {
    const p = customerPoints(
      reply({ recap: "Off the record, the team is worried about the budget." }),
    );
    expect(p.recap).toBe("");
    expect(p.withheld).toBe(1);
  });

  it("never lists a settled decision again as an open question", () => {
    const p = customerPoints(
      reply({
        decisions: ["Go-live stays on the agreed date."],
        open_questions: [
          "go-live stays on the agreed date",
          "Whether the crew needs offline mode.",
        ],
      }),
    );
    expect(p.open).toEqual(["Whether the crew needs offline mode."]);
  });
});

describe("the draft says what it can, and never invents a section", () => {
  it("is ready, with the sections that have content and the sign-off, and no empty heading", () => {
    const draft = draftFromReply(reply({ agreed_dates: [] }), AT);
    expect(draft.status).toBe("ready");
    expect(draft.body).toContain("Decisions we agreed:\n- Go-live stays on the agreed date.");
    expect(draft.body).toContain("Next steps for GoCanvas:");
    expect(draft.body).toContain("Next steps for you:");
    expect(draft.body).toContain("Still to confirm:");
    expect(draft.body).not.toContain("Dates we agreed");
    expect(draft.body.endsWith("Thanks,")).toBe(true);
  });

  it("keeps the sections in the order the email is meant to read in", () => {
    const body = draftFromReply(reply(), AT).body;
    const order = [
      "Decisions we agreed",
      "Next steps for GoCanvas",
      "Next steps for you",
      "Dates we agreed",
      "Still to confirm",
      "Thanks,",
    ].map((s) => body.indexOf(s));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("greets the named contact only when the transcript named one", () => {
    expect(draftFromReply(reply({ recipient_name: "Dana" }), AT).body.startsWith("Hi Dana,")).toBe(
      true,
    );
    expect(draftFromReply(reply(), AT).body.startsWith("Hi there,")).toBe(true);
  });

  it("uses a plain subject when the model gave an internal one", () => {
    const draft = draftFromReply(reply({ subject: "Internal only: escalation plan" }), AT);
    expect(draft.subject).toBe(FALLBACK_SUBJECT);
  });

  it("gives no email, and says why, when the reply is unreadable", () => {
    const draft = draftFromReply(
      reply({ readable: false, problem: "This is a shopping list." }),
      AT,
    );
    expect(draft.status).toBe("unreadable");
    expect(draft.problem).toBe("This is a shopping list.");
    expect(draft.body).toBe("");
  });

  it("gives no email when there is nothing to follow up on, rather than padding one", () => {
    const empty = reply({
      recap: "",
      decisions: [],
      gocanvas_next_steps: [],
      customer_next_steps: [],
      agreed_dates: [],
      open_questions: [],
    });
    const draft = draftFromReply(empty, AT);
    expect(draft.status).toBe("unreadable");
    expect(draft.problem).toBe(UNREADABLE_PROBLEM);
  });

  it("says so when everything was internal, instead of reporting an unreadable file", () => {
    const draft = draftFromReply(
      reply({
        recap: "",
        decisions: [],
        gocanvas_next_steps: ["Internal only: pricing review."],
        customer_next_steps: [],
        agreed_dates: [],
        open_questions: [],
      }),
      AT,
    );
    expect(draft.status).toBe("unreadable");
    expect(draft.problem).toMatch(/marked internal/);
  });

  it("counts the points left out, for the reviewer to see", () => {
    const draft = draftFromReply(reply({ customer_next_steps: ["Internal only: x."] }), AT);
    expect(draft.withheld).toBe(1);
  });
});

describe("resource links: only verified help-centre articles the email calls for", () => {
  it("links an article whose title and feature both appear in what the email says", () => {
    const text = "We agreed to import reference data from a spreadsheet.";
    expect(pickResourceLinks(text, [REFERENCE])).toEqual([
      {
        title: REFERENCE.title,
        url: REFERENCE.url,
        why: "Useful for reference data, which came up in the meeting.",
      },
    ]);
  });

  it("adds nothing when the email names no feature the article teaches", () => {
    const text = "We talked about importing the crew details.";
    expect(pickResourceLinks(text, [REFERENCE])).toEqual([]);
  });

  it("never links release notes, webinars or legacy pages", () => {
    const notes = article({
      article_id: "200",
      title: "Platform release notes for reference data",
      category: "Feature Releases",
    });
    expect(pickResourceLinks("reference data", [notes])).toEqual([]);
  });

  it("only links the GoCanvas help centre, over https", () => {
    expect(isApprovedResourceUrl("https://help.gocanvas.com/hc/x")).toBe(true);
    expect(isApprovedResourceUrl("http://help.gocanvas.com/hc/x")).toBe(false);
    expect(isApprovedResourceUrl("https://evil.example.com/help.gocanvas.com")).toBe(false);
    expect(isApprovedResourceUrl("not a url")).toBe(false);
  });

  it("drops a catalogue entry from outside the help centre rather than linking it", () => {
    const foreign = article({
      article_id: "300",
      title: "Importing reference data",
      url: "https://example.com/reference-data",
    });
    expect(pickResourceLinks("reference data import", [foreign])).toEqual([]);
  });

  it("gives at most two, and never the same article twice", () => {
    const more = [
      REFERENCE,
      article({ article_id: "101", title: "Reference data formats" }),
      article({ article_id: "102", title: "Reference data lookups" }),
    ];
    const links = pickResourceLinks("reference data for the crew", more);
    expect(links).toHaveLength(2);
    expect(new Set(links.map((l) => l.url)).size).toBe(2);
  });

  it("matches on the customer-safe text only, so an internal mention cannot add a link", () => {
    const r = reply({
      recap: "",
      decisions: [],
      gocanvas_next_steps: ["Internal only: look at reference data pricing."],
      customer_next_steps: [],
      agreed_dates: [],
      open_questions: [],
    });
    expect(resourcesForReply(r, [REFERENCE])).toEqual([]);
  });

  it("puts the resources in one compact section, just before the sign-off", () => {
    const body = composeFollowupBody(
      customerPoints(reply({ open_questions: [] })),
      null,
      pickResourceLinks("reference data", [REFERENCE]),
    );
    expect(body).toContain(`Helpful resources:\n- ${REFERENCE.title}: ${REFERENCE.url}`);
    expect(body.indexOf("Helpful resources")).toBeLessThan(body.indexOf("Thanks,"));
    expect(body.match(/Helpful resources/g)).toHaveLength(1);
  });

  it("leaves the section out when no resource qualifies", () => {
    const body = composeFollowupBody(customerPoints(reply()), null, []);
    expect(body).not.toContain("Helpful resources");
  });
});

describe("length, editing and the copy", () => {
  it("counts the words of the email, not counting the sign-off", () => {
    expect(followupWordCount("Hi there,\n\nOne two three.\n\nThanks,")).toBe(5);
  });

  it("names the guide length it is held to", () => {
    expect(WORD_GUIDE).toBe(250);
  });

  it("reports an edit when the subject or body differs from the suggestion", () => {
    const draft = draftFromReply(reply(), AT);
    expect(isFollowupEdited(draft, { subject: draft.subject, body: draft.body })).toBe(false);
    expect(isFollowupEdited(draft, { subject: draft.subject, body: `${draft.body}!` })).toBe(true);
    expect(isFollowupEdited(draft, { subject: "Changed", body: draft.body })).toBe(true);
  });

  it("copies the subject line, a blank line, then the body", () => {
    expect(followupEmailText({ subject: "Hello", body: "Hi there," })).toBe(
      "Subject: Hello\n\nHi there,",
    );
  });
});

describe("a draft as the job row keeps it", () => {
  it("reads back a stored draft", () => {
    const draft = draftFromReply(reply(), AT);
    expect(storedFollowupDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  });

  it("gives nothing for a reading with no draft, or a draft that is not one", () => {
    expect(storedFollowupDraft(undefined)).toBeNull();
    expect(storedFollowupDraft({ status: "weird" })).toBeNull();
  });
});
