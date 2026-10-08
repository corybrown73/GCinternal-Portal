import { describe, expect, it } from "vitest";

import { readIntake } from "../intake-answers";
import {
  prefillFromSynthesis,
  prefillHandoffFromSynthesis,
  prefillWelcomeFromBrief,
} from "../intake-prefill";

const brief = {
  current_process: [{ title: "Field", bullets: ["Paper tickets on the truck."] }],
  stakeholders: [],
  kickoff: {
    day_90_definition: null,
    scope: [
      { workflow: "Daily Water Haul Ticket", replaces: "paper ticket", teams: null },
      { workflow: "Chemical Delivery Ticket", replaces: null, teams: null },
    ],
    integrations: ["QuickBooks Online · invoice from closed tickets"],
    licensed_seats: "about 40 on the Business plan",
  },
  expansion: { integration_target: null },
};

describe("prefillFromSynthesis", () => {
  it("fills every blank the synthesis can speak to", () => {
    const { patch, filled } = prefillFromSynthesis(readIntake({ forms_built: false }), brief);
    expect(patch.current_process).toBe("Paper tickets on the truck.");
    // The brief's paraphrase, marked as such: the deck quotes only a person's words.
    expect(patch.current_process_source).toBe("ai");
    expect(patch.wanted_forms?.map((f) => f.name)).toEqual([
      "Daily Water Haul Ticket",
      "Chemical Delivery Ticket",
    ]);
    expect(patch.field_users).toBe(40);
    // An integration named on a call is not on the plan: only the SOW read adds services.
    expect(patch.timeline).toBeUndefined();
    expect(filled).toEqual(["the process today", "2 forms to build", "people in the field"]);
  });

  it("never overwrites what a person typed", () => {
    const intake = readIntake({
      forms_built: false,
      current_process: "Whiteboard in the shop.",
      field_users: 12,
      wanted_forms: [{ id: "f-1", name: "JSA" }],
      timeline: { services: [{ id: "pdf", kind: "custom_pdf", name: "Invoice PDF", phase: 2 }] },
    });
    const { patch, filled } = prefillFromSynthesis(intake, brief);
    expect(patch).toEqual({});
    expect(filled).toEqual([]);
  });

  it("is quiet for nothing", () => {
    expect(prefillFromSynthesis(readIntake(null), null)).toEqual({ patch: {}, filled: [] });
    expect(prefillFromSynthesis(readIntake(null), {})).toEqual({ patch: {}, filled: [] });
  });
});

describe("Device Magic conversions", () => {
  it("reads the kind of account from the pasted notes when nobody has said", async () => {
    const { mentionsDeviceMagic } = await import("../intake-prefill");
    expect(mentionsDeviceMagic("They have 40 users on Device Magic and want to move by Q1.")).toBe(
      true,
    );
    expect(mentionsDeviceMagic("Converting from DM; ~30 DM forms in use.")).toBe(true);
    expect(mentionsDeviceMagic("Ray will DM me the site list.")).toBe(false);
    const { patch, filled } = prefillFromSynthesis(
      readIntake({ forms_built: false }),
      brief,
      "Ops runs everything in Device Magic today.",
    );
    expect(patch.path).toBeUndefined();
    expect(patch.path_suggested).toBe("dm_conversion");
    expect(filled).toContain("a suggested flow (Device Magic conversion)");
  });

  it("leaves a path a person chose alone", () => {
    const { patch } = prefillFromSynthesis(
      readIntake({ path: "new_logo", forms_built: false }),
      brief,
      "Ops runs everything in Device Magic today.",
    );
    expect(patch.path).toBeUndefined();
    expect(patch.path_suggested).toBeUndefined();
  });
});

describe("the kept SOW reading behind the calls", () => {
  const sowReading = {
    seats: 25,
    first_form: "Chemical Delivery Ticket",
    forms: [
      { name: "Daily Water Haul Ticket", purpose: null, quote: "one Daily Water Haul Ticket" },
      { name: "Chemical Delivery Ticket", purpose: null, quote: "the delivery ticket" },
      { name: "chemical delivery ticket", purpose: null, quote: null },
    ],
  };
  const quiet = {
    ...brief,
    kickoff: { ...brief.kickoff, scope: [], licensed_seats: null },
  };

  it("fills the seats and the forms from the SOW when the calls gave none, quoted to the SOW", () => {
    const { patch, filled } = prefillFromSynthesis(
      readIntake({ forms_built: false }),
      quiet,
      null,
      {
        sowReading,
      },
    );
    expect(patch.field_users).toBe(25);
    expect(patch.ai_sources?.["field_users"]).toEqual({ quote: "25 seats", source: "SOW" });
    // The first form first, one entry per form, the SOW's own ids.
    expect(patch.wanted_forms).toEqual([
      { id: "sow-1", name: "Chemical Delivery Ticket", template_id: null },
      { id: "sow-2", name: "Daily Water Haul Ticket", template_id: null },
    ]);
    expect(patch.ai_sources?.["wanted_forms"]).toEqual({
      quote: "the delivery ticket",
      source: "SOW",
    });
    expect(patch.ai_filled).toEqual(expect.arrayContaining(["field_users", "wanted_forms"]));
    expect(filled).toContain("people in the field");
    expect(filled).toContain("2 forms to build");
  });

  it("lets the calls win where both speak", () => {
    const { patch } = prefillFromSynthesis(readIntake({ forms_built: false }), brief, null, {
      sowReading,
    });
    expect(patch.field_users).toBe(40);
    expect(patch.ai_sources?.["field_users"]).toBeUndefined();
    expect(patch.wanted_forms?.map((f) => f.id)).toEqual(["syn-1", "syn-2"]);
  });

  it("only claims what the SOW step already wrote, and never a person's count", () => {
    const already = readIntake({
      forms_built: false,
      field_users: 25,
      ai_filled: ["field_users"],
      ai_sources: { field_users: { quote: "25 seats", source: "SOW" } },
    });
    const same = prefillFromSynthesis(already, quiet, null, { sowReading });
    expect(same.patch.field_users).toBeUndefined();
    expect(same.filled).not.toContain("people in the field");

    const theirs = readIntake({ forms_built: false, field_users: 12, person_set: ["field_users"] });
    const kept = prefillFromSynthesis(theirs, quiet, null, { sowReading });
    expect(kept.patch.field_users).toBeUndefined();
  });
});

describe("prefillHandoffFromSynthesis — the typed brief", () => {
  const at = "2026-10-08T10:00:00Z";
  const typedBrief = {
    goals: ["Invoices out the same day"],
    what_we_know: [
      { topic: "What was promised", detail: "A free invoice PDF with the first form" },
      { topic: "Crews", detail: "Three crews" },
    ],
    stakeholders: [
      {
        name: "Pat Lee",
        role: "Director of Operations",
        notes: "signs the contract",
        role_kind: "decision_maker",
        email: "pat@summit.com",
      },
      {
        name: "Sam Ortiz",
        role: "Office manager",
        notes: "",
        role_kind: "admin_builder",
        email: null,
      },
      {
        name: "Dana Whitfield",
        role: "Dispatcher",
        notes: "books the meetings",
        role_kind: "day_to_day",
        email: "dana@summit.com",
      },
      { name: "Kim", role: "IT", notes: "", role_kind: "it", email: null },
    ],
    dates: [
      { type: "start", date: "2026-12-01", end: null, who: null, quote: "after the busy season" },
    ],
    welcome: {
      field_tester: null,
      customer_side: {
        forms_today: { value: "Paper tickets, one per well", quote: "paper ticket per well" },
        data_lists: null,
        devices: { value: "Company iPads", quote: "the crews carry iPads" },
        kickoff_attendees: {
          value: "Pat, Sam and two crew leads",
          quote: "Pat and Sam will be on",
        },
      },
      workflow_story: { before: null, during: null, after: null },
      focus_items: [],
    },
  };

  it("names the contacts by their kind, with the email the question asks for", () => {
    const { answers, filled } = prefillHandoffFromSynthesis(readIntake({}), typedBrief, at);
    expect(answers["contact_decision_maker"]).toMatchObject({
      value: "Pat Lee · Director of Operations · pat@summit.com",
      source: "ai",
      quote: "signs the contract",
    });
    expect(answers["contact_admin_builder"]!.value).toBe("Sam Ortiz · Office manager");
    expect(answers["contact_day_to_day"]).toMatchObject({
      value: "Dana Whitfield · Dispatcher · dana@summit.com",
      quote: "books the meetings",
    });
    expect(answers["commitments"]).toMatchObject({
      value: "A free invoice PDF with the first form",
      source: "ai",
    });
    expect(answers["agreed_start"]).toMatchObject({
      value: "2026-12-01 — after the busy season",
      quote: "after the busy season",
    });
    expect(filled).toEqual(
      expect.arrayContaining(["Decision maker", "Day-to-day contact", "What was promised"]),
    );
    // An entry that describes the sale is not a promise beyond it.
    const described = prefillHandoffFromSynthesis(
      readIntake({}),
      {
        ...typedBrief,
        what_we_know: [{ topic: "Included services", detail: "One integration, one PDF" }],
      },
      at,
    );
    expect(described.answers["commitments"]).toBeUndefined();
  });

  it("drafts the customer's own answers as the AI's, never over the customer's or a person's", () => {
    const fresh = prefillHandoffFromSynthesis(readIntake({}), typedBrief, at);
    expect(fresh.answers["forms_today"]).toMatchObject({
      value: "Paper tickets, one per well",
      source: "ai",
      quote: "paper ticket per well",
    });
    expect(fresh.answers["devices"]!.source).toBe("ai");
    expect(fresh.answers["kickoff_attendees"]!.source).toBe("ai");
    expect(fresh.answers["data_lists"]).toBeUndefined();

    const answered = readIntake({
      uploaded_forms: [{ path: "x/jsa.pdf", name: "JSA.pdf", uploaded_at: at }],
      handoff: {
        commitments_none: true,
        answers: {
          kickoff_attendees: { value: "Just Pat", source: "customer", at, by: null, quote: null },
          devices: { value: "Android phones", source: "tis", at, by: null, quote: null },
        },
      },
    });
    const again = prefillHandoffFromSynthesis(answered, typedBrief, at);
    expect(again.answers["kickoff_attendees"]).toBeUndefined();
    expect(again.answers["devices"]).toBeUndefined();
    // An uploaded form answers "the forms today" for the customer; "nothing promised" stands.
    expect(again.answers["forms_today"]).toBeUndefined();
    expect(again.answers["commitments"]).toBeUndefined();
  });
});

describe("prefillWelcomeFromBrief", () => {
  const welcome = {
    field_tester: { name: "Ray Cole", role: "Foreman", quote: "Ray will run it on his jobs" },
    customer_side: { forms_today: null, data_lists: null, devices: null, kickoff_attendees: null },
    workflow_story: {
      before: "Dispatch calls the crew with the job.",
      during: "The crew fills the ticket on site.",
      after: null,
    },
    focus_items: [
      { text: "Daily report live", source_type: "sow", source_label: "SOW", quote: "one form" },
    ],
  };

  it("writes the story, the focus and the tester onto a blank record, all still to confirm", () => {
    const { patch, timeline, filled } = prefillWelcomeFromBrief(readIntake({}), { welcome });
    expect(patch.workflow_story).toEqual({
      before: "Dispatch calls the crew with the job.",
      during: "The crew fills the ticket on site.",
      after: null,
      validated_at: null,
      validated_by: null,
    });
    expect(patch.implementation_focus?.items.map((i) => i.id)).toEqual(["focus-ai-1"]);
    expect(patch.implementation_focus?.validated_at).toBeNull();
    expect(timeline).toEqual({ field_tester: "Ray Cole · Foreman" });
    expect(patch.ai_filled).toContain("field_tester");
    expect(patch.ai_sources?.["field_tester"]).toEqual({
      quote: "Ray will run it on his jobs",
      source: "the calls",
    });
    expect(filled).toEqual(["the workflow story", "1 focus item", "the field tester"]);
  });

  it("leaves a story somebody wrote, a list a person edited and a named tester alone", () => {
    const theirs = readIntake({
      workflow_story: { before: "Their words", during: null, after: null },
      implementation_focus: {
        items: [{ id: "manual-1", text: "Hand-added", status: "proposed", sources: [] }],
      },
      timeline: { field_tester: "Lee" },
    });
    expect(prefillWelcomeFromBrief(theirs, { welcome })).toEqual({
      patch: {},
      timeline: null,
      filled: [],
    });
    expect(prefillWelcomeFromBrief(readIntake({}), {})).toEqual({
      patch: {},
      timeline: null,
      filled: [],
    });
  });
});
