import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { BRIEF_SHAPE_JSON, extractJsonObject, parseBriefText } from "../server/brief/brief-text";
import { applyVerification, itemHolds, unverifiedMap } from "../server/brief/verify";
import {
  assembleBrief,
  briefCoreSchema,
  briefJsonSchema,
  briefPlanSchema,
  type BriefJson,
} from "../server/schemas";

/**
 * The brief used to go to the API as a constrained-decoding grammar and was
 * rejected on every call ("The compiled grammar is too large") — the tool
 * then quietly wrote a template brief. It now asks for JSON in the reply and
 * validates it here.
 */
const good = {
  account_name: "Summit",
  one_liner: "Summit runs crews on paper and bought GoCanvas to stop.",
  account: { industry: "Construction", company_size: "51–200", field_users: 140, website: null },
  current_process: [
    { title: "Daily report", bullets: ["Paper, photographed", "Emailed at night"] },
  ],
  goals: ["Same-day reports"],
  what_we_know: [{ topic: "Crews", detail: "Twelve crews" }],
  stakeholders: [{ name: "Dana", role: "Ops", notes: "Champion" }],
  risks_open_items: [],
  discovery_questions: [
    { question: "Who owns devices?", why_it_matters: "Rollout", category: "users" },
  ],
  process_gaps: ["Reports lost between truck and office"],
  kickoff: {
    day_90_definition: null,
    scope: [{ workflow: "Daily report", replaces: "Paper form", teams: null }],
    out_of_scope: null,
    integrations: [],
    roles: [],
    licensed_seats: null,
    renewal_date: null,
    it_contact: null,
    training: [],
    kpi_qualifiers: [],
    next_meeting: null,
  },
  expansion: {
    integration_target: null,
    form_already_built: null,
    historical_data: null,
    current_process: null,
    time_saved: null,
    data_flows: [],
    environment_notes: [],
    blockers: [],
  },
};

describe("parseBriefText", () => {
  it("accepts a bare object, a fenced one, and one with a sentence in front", () => {
    const json = JSON.stringify(good);
    for (const text of [json, "```json\n" + json + "\n```", "Here is the brief:\n" + json]) {
      const r = parseBriefText(text);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data.account_name).toBe("Summit");
    }
  });

  it("names what is wrong so the retry can fix it", () => {
    const r = parseBriefText(JSON.stringify({ ...good, goals: "not a list" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/goals/);
    expect(parseBriefText("no json here").ok).toBe(false);
    expect(parseBriefText("{ not: json").ok).toBe(false);
    expect(extractJsonObject("plain words")).toBeNull();
  });

  it("describes the shape the prompt asks for", () => {
    const shape = JSON.parse(BRIEF_SHAPE_JSON) as { properties: Record<string, unknown> };
    expect(Object.keys(shape.properties)).toEqual(
      expect.arrayContaining(["one_liner", "kickoff", "expansion", "discovery_questions"]),
    );
  });
});

const core = briefCoreSchema.parse({
  account_name: "Summit",
  one_liner: "Summit runs crews on paper.",
  account: { industry: "Roofing", company_size: null, field_users: 40, website: null },
  current_process: [],
  goals: ["Same-day reports", "Fewer rekeyed tickets"],
  what_we_know: [],
  stakeholders: [
    {
      name: "Dana",
      role: "Ops",
      notes: "Champion",
      role_kind: "day_to_day",
      email: "dana@summit.com",
    },
    { name: "Tom", role: "IT", notes: "", role_kind: "it", email: null },
  ],
  risks_open_items: [],
  dates: [
    { type: "deadline", date: "2026-11-01", end: null, who: null, quote: "live by November 1" },
  ],
  discovery_questions: [],
  process_gaps: [],
});

const plan = briefPlanSchema.parse({
  kickoff: {
    ...good.kickoff,
    scope: [
      { workflow: "Daily report", replaces: "Paper form", teams: null },
      { workflow: "Invented", replaces: null, teams: null },
    ],
    roles: [{ responsibility: "Form and workflow build", owner: "Dana", support: null }],
    licensed_seats: "40 seats",
    it_contact: "Tom",
  },
  expansion: good.expansion,
  onboarding: {
    flow: "new_logo",
    flow_evidence: { quote: "new to GoCanvas", source: "Discovery" },
    training_only: false,
    solutions_involved: null,
    forms: [
      { name: "Daily report", quote: "the daily report on paper", source: "Discovery" },
      { name: "Made up", quote: "nobody said", source: "Discovery" },
    ],
    current_process: {
      summary: "Paper, retyped.",
      quote: "retyped on Fridays",
      source: "Discovery",
    },
  },
  welcome: {
    field_tester: { name: "Ray", role: "Foreman", quote: "Ray will test it" },
    customer_side: {
      forms_today: { value: "Paper", quote: "all paper" },
      data_lists: null,
      devices: null,
      kickoff_attendees: null,
    },
    workflow_story: { before: "Dispatch calls", during: "Crew fills the form", after: null },
    focus_items: [
      { text: "Daily report live", source_type: "sow", source_label: "SOW", quote: "one form" },
    ],
  },
});

const calls =
  "Discovery. They are new to GoCanvas. The daily report on paper is retyped on Fridays. Dana is the champion. Forty seats were agreed. Live by November 1. Ray will test it.";

describe("the brief in two passes", () => {
  it("assembles core and plan into the stored shape", () => {
    const brief = assembleBrief(core, plan);
    const parsed = briefJsonSchema.safeParse(brief);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.welcome?.field_tester?.name).toBe("Ray");
    expect(parsed.data?.stakeholders[0]).toMatchObject({
      role_kind: "day_to_day",
      email: "dana@summit.com",
    });
    // A brief stored before the new fields existed still reads.
    expect(briefJsonSchema.safeParse(good).success).toBe(true);
  });

  it("keeps a quote only where it holds: calls in the calls, the SOW with a page or in its text", () => {
    expect(
      itemHolds({ quote: "retyped on Fridays", source: "calls", page: null }, calls, null),
    ).toBe(true);
    expect(itemHolds({ quote: "nobody said", source: "notes", page: null }, calls, null)).toBe(
      false,
    );
    expect(itemHolds({ quote: "two forms", source: "sow", page: 3 }, calls, null)).toBe(true);
    expect(itemHolds({ quote: "two forms", source: "sow", page: null }, calls, null)).toBe(false);
    const docx = { text: "The SOW covers two forms." } as any;
    expect(itemHolds({ quote: "two forms", source: "sow", page: null }, calls, docx)).toBe(true);
  });

  it("applies the verifier's answer and maps every customer-facing item", () => {
    const brief: BriefJson = assembleBrief(core, plan);
    const verified = applyVerification(
      brief,
      {
        onboarding: {
          ...plan.onboarding,
          forms: [plan.onboarding.forms[0]!],
        },
        kickoff: {
          scope: [
            {
              ...plan.kickoff.scope[0]!,
              quote: "the daily report on paper",
              source: "calls",
              page: null,
            },
          ],
          licensed_seats: {
            value: "40 seats",
            quote: "Forty seats were agreed",
            source: "calls",
            page: null,
          },
          renewal_date: null,
          roles: [
            { ...plan.kickoff.roles[0]!, quote: "not in the calls", source: "calls", page: null },
          ],
          it_contact: null,
        },
        stakeholders: [
          { ...core.stakeholders[0]!, quote: "Dana is the champion", source: "calls", page: null },
        ],
        goals: [
          { text: "Same-day reports", quote: "same day", source: "calls", page: null },
          {
            text: "Fewer rekeyed tickets",
            quote: "retyped on Fridays",
            source: "calls",
            page: null,
          },
        ],
        dates: [{ ...core.dates[0]!, quote: "Live by November 1", source: "calls", page: null }],
      },
      { callsText: calls, sow: null, checkedAt: "2026-10-08T10:05:00.000Z" },
    );
    expect(verified.verification).toEqual({
      checked_at: "2026-10-08T10:05:00.000Z",
      fields: {
        "kickoff.scope[0]": "grounded",
        "kickoff.scope[1]": "dropped",
        "kickoff.roles[0]": "unverified",
        "kickoff.licensed_seats": "grounded",
        "kickoff.it_contact": "dropped",
        "stakeholders[0]": "grounded",
        "stakeholders[1]": "dropped",
        "goals[0]": "unverified",
        "goals[1]": "grounded",
        "dates[0]": "grounded",
        "onboarding.forms[0]": "grounded",
        "onboarding.forms[1]": "dropped",
        "onboarding.flow": "grounded",
      },
    });
    // The stored brief is the verified one: dropped items gone, kept ones as corrected.
    expect(verified.kickoff.scope.map((s) => s.workflow)).toEqual(["Daily report"]);
    expect(verified.kickoff.it_contact).toBeNull();
    expect(verified.kickoff.licensed_seats).toBe("40 seats");
    expect(verified.stakeholders.map((s) => s.name)).toEqual(["Dana"]);
    expect(verified.goals).toEqual(["Same-day reports", "Fewer rekeyed tickets"]);
    expect(verified.onboarding?.forms.map((f) => f.name)).toEqual(["Daily report"]);
    expect(verified.welcome).toEqual(plan.welcome);
    expect(briefJsonSchema.safeParse(verified).success).toBe(true);
  });

  it("marks everything unverified when the checker did not run", () => {
    const map = unverifiedMap(assembleBrief(core, plan), "2026-10-08T10:05:00.000Z");
    expect(map.fields).toMatchObject({
      "kickoff.scope[1]": "unverified",
      "kickoff.licensed_seats": "unverified",
      "kickoff.it_contact": "unverified",
      "stakeholders[1]": "unverified",
      "goals[1]": "unverified",
      "dates[0]": "unverified",
      "onboarding.forms[1]": "unverified",
      "onboarding.flow": "unverified",
    });
    expect(map.fields["kickoff.renewal_date"]).toBeUndefined();
  });
});
