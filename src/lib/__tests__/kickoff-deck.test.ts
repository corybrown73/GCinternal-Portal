import { describe, expect, it } from "vitest";

import { buildKickoffDeck, fit, type KickoffDeckInput } from "../kickoff-deck";
import type { BriefJson } from "../server/schemas";

const emptyBrief: BriefJson = {
  account_name: "Northwind Fleet",
  one_liner: "",
  current_process: [],
  goals: [],
  what_we_know: [],
  stakeholders: [],
  risks_open_items: [],
  discovery_questions: [],
  process_gaps: [],
};

function input(over: Partial<KickoffDeckInput> = {}): KickoffDeckInput {
  return {
    brief: emptyBrief,
    account: {
      name: "Northwind Fleet",
      domain: "northwindfleet.com",
      arr: 84000,
      products: ["Field Work", "Safety"],
      primaryContactName: "Rachel Adeyemi",
      primaryContactEmail: "rachel@northwindfleet.com",
      primaryContactRole: "Ops Director",
      salesOwner: "Marcus Webb",
      seOwner: "Dana Okafor",
    },
    sow: null,
    sources: [],
    team: [],
    plan: null,
    preparedAt: "2026-08-31T14:00:00.000Z",
    ...over,
  };
}

const slide = (plan: ReturnType<typeof buildKickoffDeck>, title: string) =>
  plan.slides.find((s) => s.title === title && !s.divider)!;

describe("buildKickoffDeck", () => {
  it("opens each act with a divider, and the agenda lists exactly those acts", () => {
    const plan = buildKickoffDeck(input());
    const dividers = plan.slides.filter((s) => s.divider).map((s) => s.title);
    expect(plan.agenda).toEqual(dividers);
    expect(plan.agenda).toEqual([
      "The account",
      "What we heard",
      "What we sold",
      "Working together",
      "Starting delivery",
    ]);
  });

  it("names the GoCanvas team, because that is the fact a handoff turns on", () => {
    const plan = buildKickoffDeck(
      input({
        team: [
          { name: "Dana Okafor", role: "Implementation lead — runs the project from here" },
          { name: "Marcus Webb", role: "Account manager — commercial owner" },
        ],
      }),
    );
    const rows = (slide(plan, "Your GoCanvas team").body as { rows: string[][] }).rows;
    expect(rows[0]).toEqual(["Dana Okafor", "Implementation lead — runs the project from here"]);
  });

  it("says nobody is assigned rather than showing an empty team table", () => {
    const note = (slide(buildKickoffDeck(input()), "Your GoCanvas team").body as { note: string })
      .note;
    expect(note).toContain("handed to a team that does not exist yet");
  });

  it("shows the plan when the project exists", () => {
    const plan = buildKickoffDeck(
      input({
        plan: {
          implementationName: "Field inspections rollout",
          targetLaunchDate: "2026-04-01",
          stages: [
            { name: "Onboarding", intent: "Kickoff held and access granted.", targetDays: 14 },
            { name: "Build", intent: "Forms and integrations configured.", targetDays: 30 },
          ],
          firstCustomerTasks: [{ title: "Send three sample export files", stage: "Onboarding" }],
          planUrl: "https://example.test/portal/plan/abc",
        },
      }),
    );
    const stages = (slide(plan, "The plan").body as { rows: string[][] }).rows;
    expect(stages[0]).toEqual(["Onboarding", "Kickoff held and access granted.", "14 days"]);
    expect(slide(plan, "The plan").subtitle).toBe("Target launch 2026-04-01");
    const asks = (slide(plan, "What we need from you first").body as { rows: string[][] }).rows;
    expect(asks[0]).toEqual(["Send three sample export files", "Onboarding"]);
    expect(slide(plan, "Where to follow it")).toBeDefined();
  });

  it("says no project exists yet rather than pretending there is a plan", () => {
    const plan = buildKickoffDeck(input());
    expect((slide(plan, "The plan").body as { note: string }).note).toContain(
      "No project has been created",
    );
    expect(plan.slides.some((s) => s.title === "Where to follow it")).toBe(false);
  });

  it("flags a plan that asks nothing of the customer", () => {
    const plan = buildKickoffDeck(
      input({
        plan: {
          implementationName: "x",
          targetLaunchDate: null,
          stages: [{ name: "Build", intent: null, targetDays: null }],
          firstCustomerTasks: [],
          planUrl: null,
        },
      }),
    );
    expect((slide(plan, "What we need from you first").body as { note: string }).note).toContain(
      "somebody is about to be surprised",
    );
  });

  it("says the SOW is missing rather than dropping the slide", () => {
    const plan = buildKickoffDeck(input());
    const sow = slide(plan, "The SOW");
    expect(sow.body!.kind).toBe("absent");
    expect((sow.body as { note: string }).note).toContain("No SOW is recorded");
  });

  it("renders the SOW when the deal recorded one", () => {
    const plan = buildKickoffDeck(
      input({
        sow: {
          reference: "SOW-2026-0114",
          signedDate: "2026-01-14",
          value: 84000,
          documentName: "Northwind SOW signed.pdf",
          documentUrl: "https://example.test/sow.pdf",
        },
      }),
    );
    const sow = slide(plan, "The SOW");
    expect(sow.body!.kind).toBe("pairs");
    expect((sow.body as { items: Array<[string, string]> }).items).toContainEqual([
      "Value",
      "$84,000",
    ]);
    expect((sow.body as { items: Array<[string, string]> }).items).toContainEqual([
      "Reference",
      "SOW-2026-0114",
    ]);
  });

  it("counts a SOW with only a signed date as present, not missing", () => {
    const plan = buildKickoffDeck(
      input({
        sow: {
          reference: null,
          signedDate: "2026-01-14",
          value: null,
          documentName: null,
          documentUrl: null,
        },
      }),
    );
    expect(slide(plan, "The SOW").body!.kind).toBe("pairs");
  });

  it("treats a SOW row of nothing but nulls as no SOW", () => {
    const plan = buildKickoffDeck(
      input({
        sow: {
          reference: "  ",
          signedDate: null,
          value: null,
          documentName: null,
          documentUrl: null,
        },
      }),
    );
    expect(slide(plan, "The SOW").body!.kind).toBe("absent");
  });

  it("names the calls the deck was built from", () => {
    const plan = buildKickoffDeck(
      input({
        sources: [
          { title: "Discovery call", reportType: "call_notes", createdAt: "2026-01-04T00:00:00Z" },
          { title: "Org chart", reportType: "account_map", createdAt: "2026-01-09T00:00:00Z" },
        ],
      }),
    );
    const src = slide(plan, "Where this came from");
    expect(src.body!.kind).toBe("table");
    const rows = (src.body as { rows: string[][] }).rows;
    expect(rows[0]).toEqual(["Discovery call", "Call notes", "2026-01-04"]);
    expect(rows[1]![1]).toBe("Account map");
  });

  it("warns in the deck itself when it was built with no call notes at all", () => {
    const plan = buildKickoffDeck(input());
    expect((slide(plan, "Where this came from").body as { note: string }).note).toContain(
      "without a single call note",
    );
  });

  it("puts the account's recorded facts on one slide, dashing what is unset", () => {
    const plan = buildKickoffDeck(
      input({ account: { ...input().account, domain: null, products: null } }),
    );
    const items = (slide(plan, "At a glance").body as { items: Array<[string, string]> }).items;
    expect(items).toContainEqual(["Annual value", "$84,000"]);
    expect(items).toContainEqual(["Domain", "—"]);
    expect(items).toContainEqual(["Products", "—"]);
    expect(items).toContainEqual(["Sold by", "Marcus Webb"]);
  });

  it("leaves the next-steps table blank, because it is filled in during the meeting", () => {
    const plan = buildKickoffDeck(input());
    const next = slide(plan, "Next steps and action plan");
    expect((next.body as { header: string[] }).header).toEqual([
      "Step",
      "Owner",
      "Due",
      "Status",
      "Notes",
    ]);
    expect((next.body as { rows: string[][] }).rows.every((r) => r.every((c) => c === ""))).toBe(
      true,
    );
  });

  it("carries the brief's discovery questions through", () => {
    const plan = buildKickoffDeck(
      input({
        brief: {
          ...emptyBrief,
          discovery_questions: [
            {
              question: "Which depots go first?",
              why_it_matters: "Sequencing the rollout decides the whole plan.",
              category: "rollout",
            },
          ],
        },
      }),
    );
    const q = slide(plan, "Questions for onboarding");
    expect((q.body as { rows: string[][] }).rows[0]![0]).toBe("Which depots go first?");
  });

  it("renders one slide per current-process section", () => {
    const plan = buildKickoffDeck(
      input({
        brief: {
          ...emptyBrief,
          current_process: [
            { title: "Inspections", bullets: ["Paper packs", "Scanned nightly"] },
            { title: "Dispatch", bullets: ["Phone calls"] },
          ],
        },
      }),
    );
    const sections = plan.slides.filter((s) => s.title === "How they work today");
    expect(sections).toHaveLength(2);
    expect(sections[1]!.subtitle).toBe("Dispatch");
  });
});

describe("fit", () => {
  it("leaves short text alone", () => {
    expect(fit("Short enough", 40)).toBe("Short enough");
  });

  it("collapses the whitespace a pasted note brings with it", () => {
    expect(fit("one\n  two   three", 40)).toBe("one two three");
  });

  it("cuts on a word boundary rather than mid-word", () => {
    const out = fit("alpha beta gamma delta epsilon", 20);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toContain("gam…");
  });

  it("still cuts when there is no boundary to cut on", () => {
    expect(fit("x".repeat(50), 10)).toBe(`${"x".repeat(10)}…`);
  });
});
