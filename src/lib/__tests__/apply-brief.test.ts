import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The finished brief onto the deal, against an in-memory database: every
 * intake write goes through the merge RPC (never a whole-object write), a
 * field a person answered is never touched, the welcome page's own facts
 * land still to confirm, the help picks are picked again with a person's
 * kept, and the deck is drawn last, from the merged intake.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    flagModule: null as any,
    deck: { buildAndStoreDeck: vi.fn() },
    journey: { syncJourneyStage: vi.fn(async () => {}) },
    help: { pickHelpArticles: vi.fn() },
    audit: { audit: vi.fn(async () => {}) },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  state.flagModule = {
    isFlagOn: async () => false,
    getV2Flags: async () => ({}),
    resetFlagCache: () => {},
  };
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../../integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("@/lib/app-config.server", () => h.flagModule);
vi.mock("../app-config.server", () => h.flagModule);
vi.mock("../server/brief/generate", () => h.deck);
vi.mock("../journey-sync.server", () => h.journey);
vi.mock("../server/help/articles.server", () => h.help);
vi.mock("../server/audit", () => h.audit);

import { applyBriefToDeal, saveDealIntake } from "../presale.server";
import { briefJsonSchema } from "../server/schemas";
import { sowReadingSchema } from "../sow-plan";

const DEAL = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const at = "2026-10-08T10:00:00Z";

const brief = briefJsonSchema.parse({
  account_name: "Summit Roofing",
  one_liner: "Crews on paper.",
  account: { industry: "Roofing", company_size: null, field_users: null, website: "summit.com" },
  current_process: [{ title: "Daily", bullets: ["Paper daily report"] }],
  goals: ["Same-day reports"],
  what_we_know: [],
  stakeholders: [
    {
      name: "Dana Whitfield",
      role: "Office manager",
      notes: "Runs the office",
      role_kind: "admin_builder",
      email: "dana@summit.com",
    },
  ],
  risks_open_items: [],
  dates: [],
  discovery_questions: [],
  process_gaps: [],
  kickoff: {
    day_90_definition: null,
    scope: [],
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
  onboarding: {
    flow: "new_logo",
    flow_evidence: { quote: "new to GoCanvas", source: "Discovery" },
    training_only: false,
    solutions_involved: null,
    forms: [],
    current_process: { summary: "The AI's paraphrase.", quote: "paper", source: "Discovery" },
  },
  welcome: {
    field_tester: { name: "Ray Cole", role: "Foreman", quote: "Ray will run it" },
    customer_side: {
      forms_today: null,
      data_lists: null,
      devices: { value: "Company iPads", quote: "the crews carry iPads" },
      kickoff_attendees: { value: "Pat and Sam", quote: "Pat and Sam will be on" },
    },
    workflow_story: { before: "Dispatch calls the crew.", during: null, after: null },
    focus_items: [
      { text: "Daily report live", source_type: "sow", source_label: "SOW", quote: "one form" },
    ],
  },
});

const rows: Rows = {
  portal_accounts: [
    {
      id: DEAL,
      name: "Summit Roofing",
      // The reading below is of this document: only the SOW on file lends its seats and forms.
      sow_document_path: `deals/${DEAL}/sow.pdf`,
      primary_contact_name: null,
      primary_contact_role: null,
      domain: null,
      intake: {
        // A person's process, and the customer's own attendee list: theirs.
        current_process: "Whiteboard in the shop.",
        current_process_source: "person",
        person_set: ["current_process"],
        forms_built: false,
        wanted_forms: [],
        timeline: {},
        help_picks: [
          {
            article_id: "mine",
            title: "Kept",
            url: "https://help.gocanvas.com/mine",
            why: "",
            source: "person",
          },
        ],
        handoff: {
          answers: {
            kickoff_attendees: { value: "Just Pat", source: "customer", at, by: null, quote: null },
          },
        },
      },
    },
  ],
  portal_gong_reports: [{ id: "r1", account_id: DEAL, content_md: "Discovery notes." }],
  portal_ai_readings: [
    {
      id: "rd-1",
      deal_id: DEAL,
      kind: "sow",
      source_hash: "abc",
      source_path: `deals/${DEAL}/sow.pdf`,
      created_at: "2026-10-07T00:00:00Z",
      output: sowReadingSchema.parse({
        readable: true,
        summary: "One form, 25 seats",
        services: [],
        seats: 25,
        forms: [{ name: "Daily report", quote: "one Daily report form" }],
      }),
    },
  ],
};

let fake: ReturnType<typeof createFakeSupabase>;
const intake = () => fake.store["portal_accounts"]![0]!.intake;

beforeEach(() => {
  fake = createFakeSupabase(rows);
  h.supabase.client = fake.client;
  h.deck.buildAndStoreDeck.mockReset();
  h.journey.syncJourneyStage.mockClear();
  h.help.pickHelpArticles.mockReset();
  h.help.pickHelpArticles.mockResolvedValue({
    picks: [
      {
        article_id: "a1",
        title: "Dispatch",
        url: "https://help.gocanvas.com/a1",
        why: "",
        source: "ai",
      },
    ],
    query: { features: [], excluded: [], allowedIntegrations: [] },
  });
  h.audit.audit.mockClear();
});

describe("applyBriefToDeal", () => {
  it("merges only what the reading may fill, drafts the welcome facts to confirm, then draws the deck", async () => {
    // The deck sees the deal as it stands after the merge.
    let seatsWhenDrawn: number | null = null;
    h.deck.buildAndStoreDeck.mockImplementation(async () => {
      seatsWhenDrawn = intake().field_users ?? null;
      return `${DEAL}/b1.pptx`;
    });

    const filled = await applyBriefToDeal({ kind: "system", label: "the AI reading" }, DEAL, {
      id: "b1",
      status: "complete",
      generator: "llm",
      structured_json: brief,
      pptx_storage_path: null,
    });

    // Every intake write is the merge RPC; nothing replaced the object whole.
    expect(fake.rpcs.length).toBeGreaterThan(0);
    expect(fake.rpcs.every((r) => r.fn === "portal_merge_intake")).toBe(true);
    const patches = fake.rpcs.map((r) => r.args["p_patch"] as Record<string, unknown>);
    expect(patches.some((p) => "current_process" in p)).toBe(false);

    const a = intake();
    // A person's process stands; the customer's attendees stand.
    expect(a.current_process).toBe("Whiteboard in the shop.");
    expect(a.person_set).toEqual(["current_process"]);
    expect(a.handoff.answers.kickoff_attendees).toMatchObject({
      value: "Just Pat",
      source: "customer",
    });
    // The SOW's seats and form, quoted to the SOW, where the calls gave none.
    expect(a.field_users).toBe(25);
    expect(a.ai_sources.field_users).toEqual({ quote: "25 seats", source: "SOW" });
    expect(a.wanted_forms).toEqual([{ id: "sow-1", name: "Daily report", template_id: null }]);
    // The handoff's drafts, as the AI's: the contact by kind, the devices.
    expect(a.handoff.answers.contact_admin_builder).toMatchObject({
      value: "Dana Whitfield · Office manager · dana@summit.com",
      source: "ai",
    });
    expect(a.handoff.answers.devices).toMatchObject({ value: "Company iPads", source: "ai" });
    // The welcome page's own facts, still to confirm.
    expect(a.workflow_story).toMatchObject({
      before: "Dispatch calls the crew.",
      validated_at: null,
    });
    // The form just filled is the first anchor; the brief's item sits behind it.
    expect(a.implementation_focus.items.map((i: { id: string }) => i.id)).toEqual([
      "focus-1",
      "focus-ai-1",
    ]);
    expect(a.implementation_focus.items[0].text).toMatch(/Daily report/);
    expect(a.timeline.field_tester).toBe("Ray Cole · Foreman");
    expect(a.ai_filled).toContain("field_tester");
    // Help picked again, the person's pick kept.
    expect(a.help_picks.map((p: { article_id: string }) => p.article_id)).toEqual(["mine", "a1"]);
    // The header's blanks, the deck last, from the merged intake.
    expect(fake.store["portal_accounts"]![0]!.primary_contact_name).toBe("Dana Whitfield");
    expect(fake.store["portal_accounts"]![0]!.domain).toBe("summit.com");
    expect(h.deck.buildAndStoreDeck).toHaveBeenCalledTimes(1);
    expect(h.deck.buildAndStoreDeck).toHaveBeenCalledWith(DEAL, "b1", brief);
    expect(seatsWhenDrawn).toBe(25);
    expect(h.journey.syncJourneyStage).toHaveBeenCalledWith(DEAL, null);

    expect(filled).toEqual(
      expect.arrayContaining([
        "people in the field",
        "the first form",
        "Admin / builder",
        "Devices in the field",
        "the workflow story",
        "1 focus item",
        "the field tester",
        "the contact",
        "the website",
      ]),
    );
    expect(filled).not.toContain("the process today");
    expect(filled).not.toContain("Who will be at kickoff");

    // The plan saved whole with the proposed tester untouched keeps it the
    // reading's; a retyped name is the person's from then on.
    fake.store["portal_profiles"] = [{ id: USER, role: "sales", email: "s@x", full_name: "S" }];
    await saveDealIntake(USER, DEAL, { timeline: { ...intake().timeline, holidays: [] } });
    expect(intake().ai_filled).toContain("field_tester");
    await saveDealIntake(USER, DEAL, {
      timeline: { ...intake().timeline, field_tester: "Lee Park · Crew lead" },
    });
    expect(intake().timeline.field_tester).toBe("Lee Park · Crew lead");
    expect(intake().ai_filled).not.toContain("field_tester");
    expect(intake().ai_sources.field_tester).toBeUndefined();
  });

  it("draws the deck for a template brief too, and prefills nothing from it", async () => {
    h.deck.buildAndStoreDeck.mockResolvedValue(`${DEAL}/b2.pptx`);
    const filled = await applyBriefToDeal({ kind: "user", userId: DEAL }, DEAL, {
      id: "b2",
      status: "complete",
      generator: "template",
      structured_json: brief,
      pptx_storage_path: null,
    });
    expect(filled).toEqual([]);
    expect(fake.rpcs).toEqual([]);
    expect(h.deck.buildAndStoreDeck).toHaveBeenCalledWith(DEAL, "b2", brief);
  });
});
