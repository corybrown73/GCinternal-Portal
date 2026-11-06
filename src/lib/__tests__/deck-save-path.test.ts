import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * Integration over the real saveDealIntake: a Kickoff deck save or reset, by each
 * role, must persist exactly its own entry and nothing else. It must not move a
 * stage, change an owner, touch tasks or milestones, or run the journey work. A
 * control save with an unrelated field shows the harness does see that work.
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

import { KICKOFF_DECK_REFUSED } from "../kickoff-slides.server";
import { readIntake } from "../intake-answers";
import { saveDealIntake } from "../presale.server";

const TABLES_THAT_MUST_NOT_CHANGE = [
  "implementations",
  "stage_instances",
  "work_items",
  "implementation_stage_history",
] as const;

function seed(overrides: Partial<Rows> = {}): Rows {
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
        id: "p-admin",
        role: "admin",
        team_member_id: null,
        full_name: "An Admin",
        email: "a@example.test",
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
        intake: { kickoff_deck: {} },
        stage: "onboarding_kickoff",
      },
    ],
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
    portal_stage_transitions: [],
    ...overrides,
  };
}

const DECK = { included: ["kickoff-training"], order: ["kickoff-training", "kickoff-purchased"] };
/** A stored entry, as the save writes it: the selection, when, and by whom. */
const stored = (deck: { included: string[]; order: string[] }, by: string) => ({
  ...deck,
  saved_at: "2026-11-01T00:00:00.000Z",
  saved_by: by,
});

let fake: ReturnType<typeof createFakeSupabase>;
let before: Record<string, string>;
let audits: Array<Record<string, unknown>>;

function setup(overrides: Partial<Rows> = {}) {
  fake = createFakeSupabase(seed(overrides));
  h.supabase.client = fake.client;
  audits = [];
  h.audit.fn = async (row: Record<string, unknown>) => {
    audits.push(row);
  };
  h.syncJourney.fn = vi.fn(async () => null);
  h.syncDealStage.fn = vi.fn(async () => undefined);
  before = Object.fromEntries(
    TABLES_THAT_MUST_NOT_CHANGE.map((t) => [t, JSON.stringify(fake.store[t])]),
  );
}

const intakeOf = () => fake.store["portal_accounts"]![0]!["intake"] as Record<string, any>;
const sideEffects = () => ({
  journey: (h.syncJourney.fn as any).mock.calls.length,
  dealStage: (h.syncDealStage.fn as any).mock.calls.length,
});

function expectNoSideEffects() {
  expect(sideEffects()).toEqual({ journey: 0, dealStage: 0 });
  for (const t of TABLES_THAT_MUST_NOT_CHANGE) {
    expect(JSON.stringify(fake.store[t]), `${t} changed`).toBe(before[t]);
  }
  expect(fake.inserts.filter((i) => i.table === "implementation_stage_history")).toHaveLength(0);
  // The only audit a deck save writes is the intake update itself: no stage, journey or kickoff audit.
  expect(audits.map((a) => a["action"])).toEqual(["deal.intake_updated"]);
}

beforeEach(() => {
  h.supabase.client = null;
});

describe("saving a deck selection", () => {
  it("a manager saves the selection for an implementation, and nothing else moves", async () => {
    setup();
    await saveDealIntake("p-manager", "deal-1", { kickoff_deck: { "impl-1": DECK } });

    const saved = intakeOf()["kickoff_deck"]["impl-1"];
    expect(saved).toMatchObject({
      included: DECK.included,
      order: DECK.order,
      saved_by: "p-manager",
    });
    expect(typeof saved.saved_at).toBe("string");
    expectNoSideEffects();
  });

  it("the owner of the implementation may save its selection", async () => {
    setup();
    await saveDealIntake("p-impl", "deal-1", { kickoff_deck: { "impl-1": DECK } });
    expect(intakeOf()["kickoff_deck"]["impl-1"]).toMatchObject({ saved_by: "p-impl" });
    expectNoSideEffects();
  });

  it.each(["p-super", "p-admin"])(
    "%s may save for any implementation on the deal",
    async (profile) => {
      setup();
      await saveDealIntake(profile, "deal-1", { kickoff_deck: { "impl-2": DECK } });
      expect(intakeOf()["kickoff_deck"]["impl-2"]).toMatchObject({ saved_by: profile });
      expectNoSideEffects();
    },
  );

  it("saving one implementation's selection leaves another's as it was", async () => {
    const other = {
      included: ["kickoff-workflow"],
      order: ["kickoff-workflow"],
      saved_at: "2026-11-01T00:00:00Z",
      saved_by: "p-other-impl",
    };
    setup({
      portal_accounts: [
        {
          id: "deal-1",
          customer_id: "cust-1",
          intake: { kickoff_deck: { "impl-2": other } },
          stage: "onboarding_kickoff",
        },
      ],
    });
    await saveDealIntake("p-manager", "deal-1", { kickoff_deck: { "impl-1": DECK } });
    expect(intakeOf()["kickoff_deck"]["impl-2"]).toEqual(other);
    expect(intakeOf()["kickoff_deck"]["impl-1"]).toMatchObject({ included: DECK.included });
  });
});

describe("resetting a deck selection", () => {
  it("a manager's reset removes only that implementation's selection", async () => {
    const other = {
      included: ["kickoff-workflow"],
      order: ["kickoff-workflow"],
      saved_at: "2026-11-01T00:00:00Z",
      saved_by: "p-impl",
    };
    setup({
      portal_accounts: [
        {
          id: "deal-1",
          customer_id: "cust-1",
          intake: { kickoff_deck: { "impl-1": DECK, "impl-2": other } },
          stage: "onboarding_kickoff",
        },
      ],
    });
    await saveDealIntake("p-manager", "deal-1", { kickoff_deck: { "impl-1": null } });
    expect(intakeOf()["kickoff_deck"]).toEqual({ "impl-2": other });
    expectNoSideEffects();
  });

  it("the assigned owner may reset its own implementation", async () => {
    setup({
      portal_accounts: [
        {
          id: "deal-1",
          customer_id: "cust-1",
          intake: { kickoff_deck: { "impl-1": DECK } },
          stage: "onboarding_kickoff",
        },
      ],
    });
    await saveDealIntake("p-impl", "deal-1", { kickoff_deck: { "impl-1": null } });
    expect(intakeOf()["kickoff_deck"]).toEqual({});
    expectNoSideEffects();
  });
});

describe("refusals write nothing", () => {
  it("an implementation specialist cannot save for another's implementation", async () => {
    setup();
    await expect(
      saveDealIntake("p-impl", "deal-1", { kickoff_deck: { "impl-2": DECK } }),
    ).rejects.toThrow(KICKOFF_DECK_REFUSED);
    expect(intakeOf()["kickoff_deck"]).toEqual({});
    expect(audits).toHaveLength(0);
    expect(sideEffects()).toEqual({ journey: 0, dealStage: 0 });
  });

  it("an implementation specialist cannot reset another's implementation", async () => {
    const existing = {
      included: ["kickoff-workflow"],
      order: ["kickoff-workflow"],
      saved_at: "2026-11-01T00:00:00Z",
      saved_by: "p-other-impl",
    };
    setup({
      portal_accounts: [
        {
          id: "deal-1",
          customer_id: "cust-1",
          intake: { kickoff_deck: { "impl-2": existing } },
          stage: "onboarding_kickoff",
        },
      ],
    });
    await expect(
      saveDealIntake("p-impl", "deal-1", { kickoff_deck: { "impl-2": null } }),
    ).rejects.toThrow(KICKOFF_DECK_REFUSED);
    expect(intakeOf()["kickoff_deck"]["impl-2"]).toEqual(existing);
  });

  it("a sales role gets no deck authority, even as the named owner, for a save or a reset", async () => {
    setup();
    await expect(
      saveDealIntake("p-sales", "deal-1", { kickoff_deck: { "impl-1": DECK } }),
    ).rejects.toThrow(KICKOFF_DECK_REFUSED);
    await expect(
      saveDealIntake("p-sales", "deal-1", { kickoff_deck: { "impl-1": null } }),
    ).rejects.toThrow(KICKOFF_DECK_REFUSED);
    expect(intakeOf()["kickoff_deck"]).toEqual({});
    expect(sideEffects()).toEqual({ journey: 0, dealStage: 0 });
  });

  it("an implementation that is not on this deal is refused, even for management", async () => {
    setup();
    await expect(
      saveDealIntake("p-manager", "deal-1", { kickoff_deck: { "impl-x": DECK } }),
    ).rejects.toThrow(/not on this deal/);
    expect(intakeOf()["kickoff_deck"]).toEqual({});
  });
});

describe("a malformed stored entry does not erase the others", () => {
  it("drops the malformed entry and keeps every well-formed selection", async () => {
    setup({
      portal_accounts: [
        {
          id: "deal-1",
          customer_id: "cust-1",
          intake: {
            kickoff_deck: {
              "impl-1": { included: "not-a-list" },
              "impl-2": stored(
                { included: ["kickoff-workflow"], order: ["kickoff-workflow"] },
                "p-other-impl",
              ),
            },
          },
          stage: "onboarding_kickoff",
        },
      ],
    });
    await saveDealIntake("p-manager", "deal-1", { kickoff_deck: { "impl-1": DECK } });
    expect(intakeOf()["kickoff_deck"]["impl-2"]).toMatchObject({ included: ["kickoff-workflow"] });
    expect(intakeOf()["kickoff_deck"]["impl-1"]).toMatchObject({ included: DECK.included });
  });
});

describe("the harness observes journey work when it happens", () => {
  it("an ordinary save still runs the journey and deal-stage synchronisation", async () => {
    setup();
    await saveDealIntake("p-manager", "deal-1", { welcome_hidden_screens: ["kickoff-next"] });
    expect((h.syncJourney.fn as any).mock.calls.length).toBe(1);
    expect((h.syncDealStage.fn as any).mock.calls.length).toBe(1);
  });
});

// Keep the readIntake import referenced for readers comparing defaults.
void readIntake;
