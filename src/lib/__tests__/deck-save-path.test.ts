import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * The Kickoff deck save and reset, over the fake database. A save or reset:
 *   - is refused, and writes nothing, for a live customer's deal;
 *   - is refused, and writes nothing, for a role without authority;
 *   - writes exactly one row for one implementation, and nothing else;
 *   - leaves the deal's intake alone, so a rolled-back release cannot drop it.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    audit: null as any,
    syncJourney: null as any,
    syncDealStage: null as any,
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  state.audit = { fn: async () => undefined as unknown };
  state.syncJourney = { fn: async () => null as unknown };
  state.syncDealStage = { fn: async () => undefined as unknown };
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../server/audit", () => ({ audit: (...args: unknown[]) => (h.audit.fn as any)(...args) }));
vi.mock("../journey-sync.server", () => ({
  syncJourneyStage: (...args: unknown[]) => (h.syncJourney.fn as any)(...args),
}));
vi.mock("../stage-flow.server", () => ({
  syncDealStage: (...args: unknown[]) => (h.syncDealStage.fn as any)(...args),
}));

import { KICKOFF_DECK_REFUSED, saveKickoffDeck } from "../kickoff-slides.server";
import { intakeAnswersSchema } from "../intake-answers";
import { saveDealIntake } from "../presale.server";

const UNCHANGED = [
  "implementations",
  "stage_instances",
  "work_items",
  "implementation_stage_history",
] as const;

function seed(over: Partial<Rows> = {}): Rows {
  return {
    portal_profiles: [
      {
        id: "p-manager",
        role: "manager",
        team_member_id: "tm-manager",
        full_name: "A Manager",
        email: "m@example.test",
      },
      {
        id: "p-super",
        role: "super_admin",
        team_member_id: null,
        full_name: "A Super Admin",
        email: "s@example.test",
      },
      {
        id: "p-impl",
        role: "implementation",
        team_member_id: "tm-owner",
        full_name: "The Owner TIS",
        email: "o@example.test",
      },
      {
        id: "p-other-impl",
        role: "implementation",
        team_member_id: "tm-other",
        full_name: "Another TIS",
        email: "x@example.test",
      },
      {
        id: "p-sales",
        role: "sales",
        team_member_id: "tm-owner",
        full_name: "A Seller",
        email: "sl@example.test",
      },
    ],
    portal_accounts: [
      {
        id: "deal-1",
        customer_id: "cust-1",
        is_test: true,
        intake: { welcome_hidden_screens: [] },
        stage: "onboarding_kickoff",
      },
    ],
    customers: [{ id: "cust-1", is_test: true }],
    implementations: [
      {
        id: "impl-1",
        deal_id: "deal-1",
        owner_id: "tm-owner",
        current_stage: "build",
        superseded_by_implementation_id: null,
        created_at: "2026-10-01T00:00:00Z",
      },
      {
        id: "impl-2",
        deal_id: "deal-1",
        owner_id: "tm-other",
        current_stage: "handoff",
        superseded_by_implementation_id: null,
        created_at: "2026-10-02T00:00:00Z",
      },
      {
        id: "impl-x",
        deal_id: "deal-2",
        owner_id: "tm-owner",
        current_stage: "handoff",
        superseded_by_implementation_id: null,
        created_at: "2026-10-03T00:00:00Z",
      },
    ],
    stage_instances: [
      { id: "st-1", implementation_id: "impl-1", stage_key: "build", status: "active" },
    ],
    work_items: [
      {
        id: "w-1",
        implementation_id: "impl-1",
        stage_instance_id: "st-1",
        status: "not_started",
        task_key: "t",
      },
    ],
    implementation_stage_history: [
      { id: "h-1", implementation_id: "impl-1", stage: "build", exited_at: null },
    ],
    scoping_answers: [],
    portal_stage_transitions: [],
    ...over,
  };
}

const DECK = { deckType: "standard" as const, formReady: true };

let fake: ReturnType<typeof createFakeSupabase>;
let before: Record<string, string>;
let audits: Array<Record<string, unknown>>;

function setup(over: Partial<Rows> = {}) {
  fake = createFakeSupabase(seed(over));
  h.supabase.client = fake.client;
  audits = [];
  h.audit.fn = async (row: Record<string, unknown>) => {
    audits.push(row);
  };
  h.syncJourney.fn = vi.fn(async () => null);
  h.syncDealStage.fn = vi.fn(async () => undefined);
  before = Object.fromEntries(
    [...UNCHANGED, "portal_accounts", "scoping_answers"].map((t) => [
      t,
      JSON.stringify(fake.store[t]),
    ]),
  );
}

const rowsFor = (implementationId?: string) =>
  (fake.store["scoping_answers"] as Array<Record<string, any>>).filter(
    (r) => implementationId === undefined || r["implementation_id"] === implementationId,
  );

/** Nothing outside the deck's own row changed: no stage, owner, task, milestone, history or journey work. */
function expectOnlyTheDeckChanged() {
  for (const t of UNCHANGED) expect(JSON.stringify(fake.store[t]), `${t} changed`).toBe(before[t]);
  expect(fake.store["portal_accounts"]).toEqual(JSON.parse(before["portal_accounts"]!));
  expect((h.syncJourney.fn as any).mock.calls.length).toBe(0);
  expect((h.syncDealStage.fn as any).mock.calls.length).toBe(0);
  expect(fake.inserts.filter((i) => i.table === "implementation_stage_history")).toHaveLength(0);
}

beforeEach(() => {
  h.supabase.client = null;
});

describe("saving a deck selection", () => {
  it("a manager saves one implementation's row, and nothing else moves", async () => {
    setup();
    await saveKickoffDeck({
      actorProfileId: "p-manager",
      dealId: "deal-1",
      implementationId: "impl-1",
      choice: DECK,
    });
    const [row] = rowsFor("impl-1");
    expect(row).toMatchObject({
      question_key: "kickoff_deck",
      answered_by: "p-manager",
      source: "manual",
    });
    expect(row!["value"]).toMatchObject({ deck_type: DECK.deckType, form_ready: DECK.formReady });
    expectOnlyTheDeckChanged();
    expect(audits).toEqual([
      expect.objectContaining({
        action: "kickoff_deck.saved",
        actor_id: "p-manager",
        entity_id: "impl-1",
      }),
    ]);
  });

  it("the assigned owner saves their implementation", async () => {
    setup();
    await saveKickoffDeck({
      actorProfileId: "p-impl",
      dealId: "deal-1",
      implementationId: "impl-1",
      choice: DECK,
    });
    expect(rowsFor("impl-1")[0]!["answered_by"]).toBe("p-impl");
    expectOnlyTheDeckChanged();
  });

  it("a super administrator saves for any implementation on the deal", async () => {
    setup();
    await saveKickoffDeck({
      actorProfileId: "p-super",
      dealId: "deal-1",
      implementationId: "impl-2",
      choice: DECK,
    });
    expect(rowsFor("impl-2")[0]!["answered_by"]).toBe("p-super");
    expectOnlyTheDeckChanged();
  });

  it("saving one implementation leaves another's row exactly as it was", async () => {
    setup({
      scoping_answers: [
        {
          implementation_id: "impl-2",
          question_key: "kickoff_deck",
          value: {
            deck_type: "standard",
            form_ready: false,
            saved_at: "2026-11-01T00:00:00.000Z",
          },
          source: "manual",
          answered_by: "p-other-impl",
        },
      ],
    });
    const other = JSON.stringify(rowsFor("impl-2"));
    await saveKickoffDeck({
      actorProfileId: "p-manager",
      dealId: "deal-1",
      implementationId: "impl-1",
      choice: DECK,
    });
    expect(JSON.stringify(rowsFor("impl-2"))).toBe(other);
    expect(rowsFor("impl-1")).toHaveLength(1);
  });

  it("saving again replaces the one row, never adds a second", async () => {
    setup();
    await saveKickoffDeck({
      actorProfileId: "p-manager",
      dealId: "deal-1",
      implementationId: "impl-1",
      choice: DECK,
    });
    await saveKickoffDeck({
      actorProfileId: "p-manager",
      dealId: "deal-1",
      implementationId: "impl-1",
      choice: { deckType: "partner" as const, formReady: false },
    });
    expect(rowsFor("impl-1")).toHaveLength(1);
    expect(rowsFor("impl-1")[0]!["value"]).toMatchObject({
      deck_type: "partner",
      form_ready: false,
    });
  });
});

describe("resetting a deck selection", () => {
  it("removes only that implementation's row", async () => {
    setup({
      scoping_answers: [
        {
          implementation_id: "impl-1",
          question_key: "kickoff_deck",
          value: {
            deck_type: DECK.deckType,
            form_ready: DECK.formReady,
            saved_at: "2026-11-01T00:00:00.000Z",
          },
          source: "manual",
          answered_by: "p-manager",
        },
        {
          implementation_id: "impl-2",
          question_key: "kickoff_deck",
          value: {
            deck_type: DECK.deckType,
            form_ready: DECK.formReady,
            saved_at: "2026-11-01T00:00:00.000Z",
          },
          source: "manual",
          answered_by: "p-other-impl",
        },
      ],
    });
    await saveKickoffDeck({
      actorProfileId: "p-manager",
      dealId: "deal-1",
      implementationId: "impl-1",
      choice: null,
    });
    expect(rowsFor("impl-1")).toHaveLength(0);
    expect(rowsFor("impl-2")).toHaveLength(1);
    expect(audits).toEqual([expect.objectContaining({ action: "kickoff_deck.reset" })]);
  });
});

describe("refusals write nothing", () => {
  it("a customer's deal that is not a test account is saved and reset like any other", async () => {
    setup({
      portal_accounts: [
        {
          id: "deal-1",
          customer_id: "cust-1",
          is_test: false,
          intake: {},
          stage: "onboarding_kickoff",
        },
      ],
      customers: [{ id: "cust-1", is_test: false }],
    });
    await saveKickoffDeck({
      actorProfileId: "p-manager",
      dealId: "deal-1",
      implementationId: "impl-1",
      choice: DECK,
    });
    expect(rowsFor("impl-1")).toHaveLength(1);
    await saveKickoffDeck({
      actorProfileId: "p-manager",
      dealId: "deal-1",
      implementationId: "impl-1",
      choice: null,
    });
    expect(rowsFor("impl-1")).toHaveLength(0);
    expect(audits.map((a) => a["action"])).toEqual(["kickoff_deck.saved", "kickoff_deck.reset"]);
  });

  it("the implementation specialist cannot save another's implementation", async () => {
    setup();
    await expect(
      saveKickoffDeck({
        actorProfileId: "p-impl",
        dealId: "deal-1",
        implementationId: "impl-2",
        choice: DECK,
      }),
    ).rejects.toThrow(KICKOFF_DECK_REFUSED);
    expect(rowsFor()).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("another specialist cannot reset someone else's saved row", async () => {
    const existing = {
      implementation_id: "impl-2",
      question_key: "kickoff_deck",
      value: {
        deck_type: DECK.deckType,
        form_ready: DECK.formReady,
        saved_at: "2026-11-01T00:00:00.000Z",
      },
      source: "manual",
      answered_by: "p-other-impl",
    };
    setup({ scoping_answers: [existing] });
    await expect(
      saveKickoffDeck({
        actorProfileId: "p-impl",
        dealId: "deal-1",
        implementationId: "impl-2",
        choice: null,
      }),
    ).rejects.toThrow(KICKOFF_DECK_REFUSED);
    expect(rowsFor("impl-2")).toHaveLength(1);
  });

  it("a sales role gets no authority, even as the named owner", async () => {
    setup();
    await expect(
      saveKickoffDeck({
        actorProfileId: "p-sales",
        dealId: "deal-1",
        implementationId: "impl-1",
        choice: DECK,
      }),
    ).rejects.toThrow(KICKOFF_DECK_REFUSED);
    await expect(
      saveKickoffDeck({
        actorProfileId: "p-sales",
        dealId: "deal-1",
        implementationId: "impl-1",
        choice: null,
      }),
    ).rejects.toThrow(KICKOFF_DECK_REFUSED);
    expect(rowsFor()).toHaveLength(0);
  });

  it("an implementation on another deal is refused, even for management", async () => {
    setup();
    await expect(
      saveKickoffDeck({
        actorProfileId: "p-manager",
        dealId: "deal-1",
        implementationId: "impl-x",
        choice: DECK,
      }),
    ).rejects.toThrow(/not on this deal/);
    expect(rowsFor()).toHaveLength(0);
  });

  it("a failed write says so, and leaves nothing half-saved", async () => {
    setup();
    fake = createFakeSupabase(seed(), { fail: { scoping_answers: { message: "boom" } } });
    h.supabase.client = fake.client;
    await expect(
      saveKickoffDeck({
        actorProfileId: "p-manager",
        dealId: "deal-1",
        implementationId: "impl-1",
        choice: DECK,
      }),
    ).rejects.toThrow();
    expect(audits).toHaveLength(0);
    expect(fake.store["portal_accounts"]).toEqual(JSON.parse(before["portal_accounts"]!));
  });
});

describe("rollback safety: the saved selection is not in the deal's intake", () => {
  it("the deal's intake schema drops an unknown deck key, so the deck can never live there", () => {
    expect(intakeAnswersSchema.parse({ kickoff_deck: { x: 1 } })).not.toHaveProperty(
      "kickoff_deck",
    );
  });

  it("a save of the deck leaves the deal's intake exactly as it was", async () => {
    setup();
    await saveKickoffDeck({
      actorProfileId: "p-manager",
      dealId: "deal-1",
      implementationId: "impl-1",
      choice: DECK,
    });
    expect(fake.store["portal_accounts"]![0]!["intake"]).toEqual({ welcome_hidden_screens: [] });
  });

  it("an ordinary save through the deal's intake path, as a rolled-back release makes it, keeps the deck row", async () => {
    setup();
    await saveKickoffDeck({
      actorProfileId: "p-manager",
      dealId: "deal-1",
      implementationId: "impl-1",
      choice: DECK,
    });
    const rowBefore = JSON.stringify(rowsFor("impl-1"));
    await saveDealIntake("p-manager", "deal-1", { welcome_hidden_screens: ["kickoff-next"] });
    expect(JSON.stringify(rowsFor("impl-1"))).toBe(rowBefore);
    expect((h.syncJourney.fn as any).mock.calls.length).toBe(1);
  });
});
