import { describe, expect, it } from "vitest";

import { claimByPerson, readIntake } from "../intake-answers";
import { groundOnboarding } from "../onboarding-grounding";
import { prefillFromSynthesis } from "../intake-prefill";

const calls = `Discovery call. Ray: "Every tech fills a paper Service Ticket at the end of each job."
Priya: "We also do a weekly Safety Audit on every site."
They want Salesforce cases created from tickets. They are new to GoCanvas.
Today the office retypes every ticket into Salesforce on Fridays.`;

const reading = {
  flow: "new_logo" as const,
  flow_evidence: { quote: "They are new to GoCanvas.", source: "Discovery call" },
  training_only: false,
  solutions_involved: true,
  forms: [
    {
      name: "Service Ticket",
      quote: "Every tech fills a paper Service Ticket at the end of each job",
      source: "Discovery call",
    },
    {
      name: "Salesforce integration — tickets create cases",
      quote: "They want Salesforce cases created from tickets",
      source: "Discovery call",
    },
    {
      name: "Safety Audit",
      quote: "We also do a weekly Safety Audit on every site",
      source: "Discovery call",
    },
    { name: "Invented form", quote: "nobody said this at all", source: "Discovery call" },
    { name: "Timesheet", quote: "3.2 Timesheet form for all crews", source: "SOW" },
  ],
  current_process: {
    summary: "Techs fill paper tickets; the office retypes them into Salesforce on Fridays.",
    quote: "Today the office retypes every ticket into Salesforce on Fridays.",
    source: "Discovery call",
  },
};

const brief = {
  account: { industry: "Field Service", company_size: null, field_users: 40, website: null },
  current_process: [],
  kickoff: { scope: [] },
  onboarding: reading,
};

describe("grounding the reading", () => {
  it("drops services, forms nobody said, and keeps SOW quotes for the verifier", () => {
    const g = groundOnboarding(reading, calls)!;
    expect(g.forms.map((f) => f.name)).toEqual(["Service Ticket", "Safety Audit", "Timesheet"]);
    expect(g.flow).toBe("new_logo");
  });

  it("drops a flow it cannot quote", () => {
    const g = groundOnboarding(
      {
        ...reading,
        flow_evidence: { quote: "They have run GoCanvas for years", source: "Discovery call" },
      },
      calls,
    )!;
    expect(g.flow).toBeNull();
  });
});

describe("filling from the reading", () => {
  it("fills the flow, the forms and the process, with the words they came from", () => {
    const { patch, filled } = prefillFromSynthesis(readIntake({}), {
      ...brief,
      onboarding: groundOnboarding(reading, calls),
    });
    expect(patch.path).toBe("new_logo");
    expect(patch.wanted_forms?.map((f) => f.name)).toEqual([
      "Service Ticket",
      "Safety Audit",
      "Timesheet",
    ]);
    expect(patch.forms_built).toBe(false);
    expect(patch.current_process).toMatch(/retypes them into Salesforce/);
    expect(patch.ai_sources?.["wanted_forms"]?.quote).toMatch(/paper Service Ticket/);
    expect(patch.ai_filled).toEqual(expect.arrayContaining(["path", "wanted_forms"]));
    expect(filled).toContain("the onboarding flow");
  });

  it("refreshes what it filled last time when the sources change", () => {
    const first = readIntake({
      path: "new_logo",
      forms_built: false,
      wanted_forms: [{ id: "syn-1", name: "Old guess" }],
      ai_filled: ["path", "wanted_forms", "forms_built"],
    });
    const { patch } = prefillFromSynthesis(first, {
      ...brief,
      onboarding: groundOnboarding(reading, calls),
    });
    expect(patch.wanted_forms?.[0]?.name).toBe("Service Ticket");
  });

  it("never touches an answer a person gave, even one it filled before", () => {
    const mine = readIntake({
      path: "existing",
      wanted_forms: [{ id: "f-1", name: "JSA" }],
      ai_filled: ["path", "wanted_forms"],
      person_set: ["path", "wanted_forms"],
    });
    const { patch } = prefillFromSynthesis(mine, {
      ...brief,
      onboarding: groundOnboarding(reading, calls),
    });
    expect(patch.path).toBeUndefined();
    expect(patch.wanted_forms).toBeUndefined();
  });

  it("hands a field to the person the moment they answer it", () => {
    const next = claimByPerson(
      {
        ai_filled: ["path", "wanted_forms"],
        person_set: [],
        ai_sources: { path: { quote: "q", source: "s" } },
      },
      ["path", "timeline"],
    );
    expect(next.ai_filled).toEqual(["wanted_forms"]);
    expect(next.person_set).toEqual(["path"]);
    expect(next.ai_sources).toEqual({});
  });

  it("treats what an older reading wrote as the AI's, so the first refresh replaces it", () => {
    const old = readIntake({
      wanted_forms: [
        { id: "syn-1", name: "Salesforce integration — tickets create cases automatically" },
        { id: "syn-2", name: "Timesheet form" },
      ],
      current_process: "Old paraphrase",
      current_process_source: "ai",
    });
    const { patch } = prefillFromSynthesis(old, {
      ...brief,
      onboarding: groundOnboarding(reading, calls),
    });
    expect(patch.wanted_forms?.[0]?.name).toBe("Service Ticket");
    expect(patch.current_process).toMatch(/retypes them/);
  });
});
