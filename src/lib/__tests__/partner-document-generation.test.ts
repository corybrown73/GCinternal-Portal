import { beforeEach, describe, expect, it, vi } from "vitest";

/* Issue #80. The generators are called directly, as every entry point reaches
 * them. Each partner case must stop before anything is built, stored or filed,
 * and must not write to or remove anything that already exists. Every value is
 * disposable test data. */

const h = vi.hoisted(() => {
  type Row = any;
  const state = {
    accounts: [] as Row[],
    implementations: [] as Row[],
    writes: [] as Array<{ target: string; op: string }>,
    storage: [] as Array<{ bucket: string; op: string }>,
    audits: [] as Row[],
    uploads: [] as Row[],
    deckBuilds: 0,
    onboardingBuilds: 0,
    // A table named here answers every read with this database error.
    fail: {} as Record<string, string>,
  };

  const rowsOf = (table: string): Row[] =>
    table === "portal_accounts"
      ? state.accounts
      : table === "implementations"
        ? state.implementations
        : [];

  function from(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    const matching = () => rowsOf(table).filter((r) => filters.every((f) => f(r)));
    const builder: Record<string, any> = {
      select: () => builder,
      eq: (col: string, v: unknown) => {
        filters.push((r) => r[col] === v);
        return builder;
      },
      is: (col: string, v: unknown) => {
        filters.push((r) => (r[col] ?? null) === v);
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () =>
        state.fail[table]
          ? { data: null, error: { message: state.fail[table] } }
          : { data: matching()[0] ?? null, error: null },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(
          state.fail[table]
            ? { data: null, error: { message: state.fail[table] } }
            : { data: matching(), error: null },
        ).then(res, rej),
      insert: (row: Row) => {
        state.writes.push({ target: table, op: "insert" });
        return Promise.resolve({ data: row, error: null });
      },
      update: () => {
        state.writes.push({ target: table, op: "update" });
        const chain: Record<string, any> = {
          eq: () => Promise.resolve({ error: null }),
        };
        return chain;
      },
      delete: () => {
        state.writes.push({ target: table, op: "delete" });
        return { eq: () => Promise.resolve({ error: null }) };
      },
    };
    return builder;
  }

  const storage = {
    from: (bucket: string) => ({
      download: async () => {
        state.storage.push({ bucket, op: "download" });
        return { data: null, error: { message: "none" } };
      },
      upload: async () => {
        state.storage.push({ bucket, op: "upload" });
        return { error: null };
      },
      remove: async () => {
        state.storage.push({ bucket, op: "remove" });
        return { error: null };
      },
      createSignedUrl: async () => ({ data: { signedUrl: "https://signed.test/x" }, error: null }),
    }),
  };

  return { state, db: { from, storage } };
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.db }));
vi.mock("../../integrations/supabase/client.server", () => ({ supabaseAdmin: h.db }));

vi.mock("../server/handoff-context", () => ({
  loadHandoffContext: async () => ({
    deal: { name: "Acme Fleet", products: null, primaryContact: { name: null, role: null } },
    project: {
      journeyType: null,
      lead: null,
      stages: [],
      openCustomerTasks: [],
      openRisks: [],
      successCriteria: [],
      requirements: [],
      solutions: [],
    },
    priorImplementations: 0,
    plan: null,
    planUnavailable: "No plan for this deal.",
  }),
}));

vi.mock("../server/brief/pptx", () => ({
  buildKickoffDeckFile: async () => {
    h.state.deckBuilds += 1;
    return Buffer.from("PPTX");
  },
}));

vi.mock("@/lib/attachments.server", () => ({
  addAccountUpload: async (args: Record<string, unknown>) => {
    h.state.uploads.push(args);
    return { id: "upload-1" };
  },
}));

vi.mock("../server/audit", () => ({
  audit: async (entry: Record<string, unknown>) => {
    h.state.audits.push(entry);
  },
}));

vi.mock("../server/brief/onboarding-deck", () => ({
  buildOnboardingDeckFile: async () => {
    h.state.onboardingBuilds += 1;
    return Buffer.from("PPTX");
  },
}));

import { generateDeckFromMcp } from "../server/handoff-tools";
import { generateOnboardingDeck } from "../server/onboarding-deck-generate";
import { buildAndStoreDeck } from "../server/brief/generate";

const { state } = h;

const DEAL = "22222222-2222-2222-2222-222222222222";
const CUSTOMER = "44444444-4444-4444-4444-444444444444";
const IMPL = "33333333-3333-3333-3333-333333333333";

const REFUSAL_PHRASE = "is generated for a partner";

function seed(opts: { intakePath?: string; implementation?: Record<string, unknown> | null }) {
  state.accounts = [
    {
      id: DEAL,
      name: "Acme Fleet",
      display_name: null,
      customer_id: CUSTOMER,
      intake: { path: opts.intakePath ?? "new_logo", timeline: {}, ai_filled: [], person_set: [] },
      logo_path: null,
      sow_document_path: null,
      sow_document_url: null,
    },
  ];
  state.implementations =
    opts.implementation === null
      ? []
      : [
          {
            id: IMPL,
            deal_id: DEAL,
            customer_id: CUSTOMER,
            created_at: "2026-09-01T00:00:00Z",
            superseded_by_implementation_id: null,
            ...(opts.implementation ?? { journey_type: "new_logo", partner_key: null }),
          },
        ];
  state.writes = [];
  state.storage = [];
  state.audits = [];
  state.uploads = [];
  state.deckBuilds = 0;
  state.onboardingBuilds = 0;
  state.fail = {};
}

/** Nothing was written, stored, removed or filed: the refusal left every existing document alone. */
function expectNothingCreatedOrRemoved() {
  expect(state.writes).toEqual([]);
  expect(state.storage.filter((s) => s.op !== "download")).toEqual([]);
  expect(state.uploads).toEqual([]);
  expect(state.audits).toEqual([]);
}

beforeEach(() => {
  seed({});
});

describe("the kickoff deck over MCP", () => {
  it("still generates and files the kickoff deck for a standard implementation", async () => {
    const result = await generateDeckFromMcp({ dealId: DEAL, fields: {}, note: null });
    expect(result.filed).toBe(true);
    expect(state.deckBuilds).toBe(1);
    expect(state.uploads).toHaveLength(1);
    expect(state.uploads[0]!.kind).toBe("deck");
    expect(state.uploads[0]!.title).toBe("Client kickoff — Acme Fleet");
    expect(state.audits.map((a) => a.action)).toEqual(["deck.generated"]);
  });

  it("refuses a partner identified by journey type, before building or filing anything", async () => {
    seed({ implementation: { journey_type: "partner_implementation", partner_key: null } });
    await expect(generateDeckFromMcp({ dealId: DEAL, fields: {}, note: null })).rejects.toThrow(
      REFUSAL_PHRASE,
    );
    expect(state.deckBuilds).toBe(0);
    expectNothingCreatedOrRemoved();
  });

  it("refuses a partner identified by partner key, even when its journey type says standard", async () => {
    seed({ implementation: { journey_type: "new_logo", partner_key: "field_fusion_iq" } });
    await expect(generateDeckFromMcp({ dealId: DEAL, fields: {}, note: null })).rejects.toThrow(
      REFUSAL_PHRASE,
    );
    expect(state.deckBuilds).toBe(0);
    expectNothingCreatedOrRemoved();
  });

  it("refuses a partner deal that has no project yet, on its intake", async () => {
    seed({ intakePath: "partner_implementation", implementation: null });
    await expect(generateDeckFromMcp({ dealId: DEAL, fields: {}, note: null })).rejects.toThrow(
      REFUSAL_PHRASE,
    );
    expect(state.deckBuilds).toBe(0);
    expectNothingCreatedOrRemoved();
  });
});

describe("the onboarding plan deck", () => {
  it("does not refuse a standard implementation at the rule", async () => {
    try {
      await generateOnboardingDeck(null, DEAL);
    } catch (error) {
      // The rest of the onboarding build reads records this fixture does not
      // carry. What matters is that the partner rule let the standard deck through.
      expect(String((error as Error).message)).not.toContain(REFUSAL_PHRASE);
    }
  });

  it("refuses a partner identified by journey type, before building or storing anything", async () => {
    seed({ implementation: { journey_type: "partner_implementation", partner_key: null } });
    await expect(generateOnboardingDeck(null, DEAL)).rejects.toThrow(REFUSAL_PHRASE);
    expect(state.onboardingBuilds).toBe(0);
    expectNothingCreatedOrRemoved();
  });

  it("refuses a partner identified by partner key, before building or storing anything", async () => {
    seed({ implementation: { journey_type: null, partner_key: "field_fusion_iq" } });
    await expect(generateOnboardingDeck(null, DEAL)).rejects.toThrow(REFUSAL_PHRASE);
    expect(state.onboardingBuilds).toBe(0);
    expectNothingCreatedOrRemoved();
  });
});

describe("the brief's kickoff deck, drawn when a brief completes", () => {
  it("refuses a partner deal, before drawing or storing the deck", async () => {
    seed({ implementation: { journey_type: "partner_implementation", partner_key: null } });
    await expect(buildAndStoreDeck(DEAL, "brief-1", {} as never)).rejects.toThrow(REFUSAL_PHRASE);
    expect(state.deckBuilds).toBe(0);
    expectNothingCreatedOrRemoved();
  });

  it("refuses a partner identified by partner key", async () => {
    seed({ implementation: { journey_type: null, partner_key: "field_fusion_iq" } });
    await expect(buildAndStoreDeck(DEAL, "brief-1", {} as never)).rejects.toThrow(REFUSAL_PHRASE);
    expect(state.deckBuilds).toBe(0);
    expectNothingCreatedOrRemoved();
  });

  it("lets a standard deal past the rule", async () => {
    try {
      await buildAndStoreDeck(DEAL, "brief-1", {} as never);
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(REFUSAL_PHRASE);
    }
  });
});

/* ---------------------------------------------------------------------------
 * A failed or incomplete read never allows generation (#80 correction).
 * ------------------------------------------------------------------------- */

import { assertDocumentAllowed } from "../server/document-guard.server";

describe("a failed read cannot confirm that a deal is standard", () => {
  it("refuses when the deal cannot be read, and the guard says so", async () => {
    seed({});
    state.fail = { portal_accounts: "connection reset" };
    await expect(assertDocumentAllowed("kickoff-deck", DEAL)).rejects.toThrow(
      /could not be read, so it cannot be checked/,
    );
  });

  it("refuses every generator when the deal cannot be read, and builds, files and writes nothing", async () => {
    seed({});
    state.fail = { portal_accounts: "connection reset" };
    await expect(generateDeckFromMcp({ dealId: DEAL, fields: {}, note: null })).rejects.toThrow();
    await expect(buildAndStoreDeck(DEAL, "brief-1", {} as never)).rejects.toThrow();
    await expect(generateOnboardingDeck(null, DEAL)).rejects.toThrow(/could not be read/);
    expect(state.deckBuilds).toBe(0);
    expect(state.onboardingBuilds).toBe(0);
    expectNothingCreatedOrRemoved();
  });

  it("refuses when the project cannot be read, even though the deal reads fine", async () => {
    seed({ implementation: { journey_type: "new_logo", partner_key: null } });
    state.fail = { implementations: "statement timeout" };
    await expect(assertDocumentAllowed("kickoff-deck", DEAL)).rejects.toThrow(
      /project could not be read, so it cannot be checked/,
    );
  });

  it("refuses every generator when the project cannot be read, and builds, files and writes nothing", async () => {
    seed({ implementation: { journey_type: "new_logo", partner_key: null } });
    state.fail = { implementations: "statement timeout" };
    await expect(generateDeckFromMcp({ dealId: DEAL, fields: {}, note: null })).rejects.toThrow(
      /could not be read/,
    );
    await expect(buildAndStoreDeck(DEAL, "brief-1", {} as never)).rejects.toThrow(
      /could not be read/,
    );
    await expect(generateOnboardingDeck(null, DEAL)).rejects.toThrow(/could not be read/);
    expect(state.deckBuilds).toBe(0);
    expect(state.onboardingBuilds).toBe(0);
    expectNothingCreatedOrRemoved();
  });
});

describe("missing classification information cannot silently allow generation", () => {
  it("refuses when the deal is not there to classify", async () => {
    seed({});
    state.accounts = [];
    await expect(assertDocumentAllowed("onboarding-plan", DEAL)).rejects.toThrow(/was not found/);
  });

  it("refuses when the deal's record is missing the fields the check needs", async () => {
    seed({});
    state.accounts = [{ id: DEAL, name: "Acme Fleet" }];
    await expect(assertDocumentAllowed("kickoff-deck", DEAL)).rejects.toThrow(
      /record is incomplete/,
    );
  });

  it("refuses when the project's record is missing its journey fields", async () => {
    seed({ implementation: { id: IMPL } as never });
    await expect(assertDocumentAllowed("kickoff-deck", DEAL)).rejects.toThrow(
      /project's record is incomplete/,
    );
  });

  it("refuses a deal with no project whose path is not recorded, rather than assuming standard", async () => {
    seed({ implementation: null });
    state.accounts[0]!.intake = { path: null, timeline: {}, ai_filled: [], person_set: [] };
    await expect(assertDocumentAllowed("kickoff-deck", DEAL)).rejects.toThrow(
      /path is not recorded/,
    );
    await expect(generateDeckFromMcp({ dealId: DEAL, fields: {}, note: null })).rejects.toThrow(
      /path is not recorded/,
    );
    expect(state.deckBuilds).toBe(0);
    expectNothingCreatedOrRemoved();
  });

  it("refuses a deal with no project whose stored intake does not parse", async () => {
    seed({ implementation: null });
    state.accounts[0]!.intake = "not an intake";
    await expect(assertDocumentAllowed("onboarding-plan", DEAL)).rejects.toThrow(
      /path is not recorded/,
    );
  });
});

describe("a successfully read standard deal still works", () => {
  it("allows a standard deal with no project, once its path is recorded", async () => {
    seed({ implementation: null });
    await expect(assertDocumentAllowed("kickoff-deck", DEAL)).resolves.toBeUndefined();
    await expect(assertDocumentAllowed("onboarding-plan", DEAL)).resolves.toBeUndefined();
  });

  it("allows a standard project on a deal that reads cleanly", async () => {
    seed({ implementation: { journey_type: "new_logo", partner_key: null } });
    await expect(assertDocumentAllowed("kickoff-deck", DEAL)).resolves.toBeUndefined();
  });
});

describe("partner identification still blocks after the correction", () => {
  it("blocks a partner identified by journey type", async () => {
    seed({ implementation: { journey_type: "partner_implementation", partner_key: null } });
    await expect(assertDocumentAllowed("kickoff-deck", DEAL)).rejects.toThrow(REFUSAL_PHRASE);
  });

  it("blocks a partner identified by partner key", async () => {
    seed({ implementation: { journey_type: "new_logo", partner_key: "field_fusion_iq" } });
    await expect(assertDocumentAllowed("onboarding-plan", DEAL)).rejects.toThrow(REFUSAL_PHRASE);
  });

  it("blocks a deal whose intake names a partner key before a project exists", async () => {
    seed({ implementation: null });
    state.accounts[0]!.intake = {
      path: "new_logo",
      partner_implementation: { partner_key: "field_fusion_iq" },
      timeline: {},
      ai_filled: [],
      person_set: [],
    };
    await expect(assertDocumentAllowed("kickoff-deck", DEAL)).rejects.toThrow(REFUSAL_PHRASE);
  });

  it("blocks a legacy Field Fusion deal before a project exists", async () => {
    seed({ implementation: null, intakePath: "field_fusion" });
    await expect(assertDocumentAllowed("kickoff-deck", DEAL)).rejects.toThrow(REFUSAL_PHRASE);
  });
});
