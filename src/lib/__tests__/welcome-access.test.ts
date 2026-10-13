import { describe, expect, it, vi, beforeEach } from "vitest";

import { hashToken } from "../server/plan-tokens";
import { intakeAnswersSchema } from "../intake-answers";
import { timelineFor } from "../onboarding-plan";

/**
 * The customer's link, end to end through the real server read: a valid token
 * opens the page, and an unknown, malformed or revoked token gets nothing. The
 * database is a small in-memory stand-in; the rest of the page's inputs are the
 * real plan engine. These tests read what the customer's view contains.
 */

const h = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, Array<Record<string, unknown>>>,
    updates: [] as Array<{ table: string; patch: Record<string, unknown> }>,
    reads: 0,
    deckInput: null as unknown,
    // Tables whose reads fail, to prove the optional partner lookup cannot take a dashboard down.
    failing: new Set<string>(),
  };
  type Query = {
    select: () => Query;
    in: () => Query;
    eq: (col: string, val: unknown) => Query;
    is: (col: string, val: unknown) => Query;
    order: () => Query;
    limit: () => Query;
    update: (patch: Record<string, unknown>) => Query;
    maybeSingle: () => Promise<{
      data: Record<string, unknown> | null;
      error: { message: string } | null;
    }>;
    then: (
      resolve: (v: { data: unknown; error: { message: string } | null }) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise<unknown>;
  };
  const builder = (table: string): Query => {
    let rows = state.tables[table] ?? [];
    const failed = { data: null, error: { message: `${table} is unavailable` } };
    const api: Query = {
      select: () => api,
      in: () => api,
      eq: (col, val) => {
        state.reads += 1;
        rows = rows.filter((r) => r[col] === val);
        return api;
      },
      is: (col, val) => {
        rows = rows.filter((r) => (r[col] ?? null) === val);
        return api;
      },
      order: () => api,
      limit: () => api,
      update: (patch) => {
        state.updates.push({ table, patch });
        return api;
      },
      maybeSingle: async () =>
        state.failing.has(table) ? failed : { data: rows[0] ?? null, error: null },
      // A filtered list read is awaited directly, as the partner progress loader does.
      then: (resolve, reject) =>
        Promise.resolve(state.failing.has(table) ? failed : { data: rows, error: null }).then(
          resolve,
          reject,
        ),
    };
    return api;
  };
  return { state, supabase: { from: builder } };
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.supabase }));
vi.mock("../server/onboarding-deck-generate", () => ({
  buildOnboardingDeckInput: async () => h.state.deckInput,
}));
vi.mock("../industry-photos.server", () => ({ photoForIndustry: async () => null }));
vi.mock("../tool-marks.server", () => ({ toolMarkUrls: async () => ({}) }));
vi.mock("../team-profile.server", () => ({ leadCardForDeal: async () => null }));
vi.mock("../parking-lot.server", () => ({ listParkingLot: async () => [] }));
vi.mock("../assignment.server", () => ({ implementationForDeal: async () => null }));
vi.mock("../server/help/articles.server", () => ({ helpOpensFor: async () => ({}) }));
vi.mock("../server/audit", () => ({ audit: async () => {} }));
vi.mock("../app-url", () => ({ appUrl: () => "https://hub.example" }));

const { openWelcome, loadWelcome, customerPreviewView } = await import("../welcome.server");

const TOKEN = "gcwl_" + "a".repeat(43);

const intake = intakeAnswersSchema.parse({
  implementation_focus: {
    items: [
      {
        id: "agreed-1",
        text: "Service ticket form",
        status: "agreed",
        sources: [{ type: "sow", label: "SOW", quote: "contract wording stays internal" }],
        review_flag: null,
      },
      {
        id: "gong-1",
        text: "Gong-only idea",
        status: "proposed",
        sources: [{ type: "gong", label: "call", quote: "private Gong quote" }],
        review_flag: "gong_only",
      },
    ],
    validated_at: null,
  },
});

function seed(overrides: { welcome_token_hash?: string | null } = {}) {
  const closeDate = "2026-10-01";
  const timeline = timelineFor(intake, closeDate);
  h.state.deckInput = {
    clientName: "Aquatic Facility Services",
    industry: "Pools",
    lead: "Priya Lead",
    team: {
      lead: "Priya Lead",
      leadEmail: null,
      leadCard: null,
      accountManager: null,
      solutionsEngineer: null,
      champion: null,
    },
    firstForm: { name: "Pool Service Ticket", objective: null, source: "library" },
    firstFormSource: "person",
    currentProcess: null,
    currentProcessSource: null,
    fieldTester: null,
    fieldTesterSource: null,
    nextUseCases: [],
    timeline,
  };
  h.state.tables = {
    portal_accounts: [
      {
        id: "deal-1",
        name: "Aquatic",
        display_name: "Aquatic Facility Services",
        logo_path: null,
        stage: "get_it_working",
        se_owner_id: null,
        am_owner_id: null,
        welcome_token_hash:
          overrides.welcome_token_hash === undefined
            ? hashToken(TOKEN)
            : overrides.welcome_token_hash,
        welcome_issued_at: null,
        welcome_opened_at: null,
        welcome_homework: {},
        welcome_share_url: null,
        intake,
      },
    ],
  };
  h.state.updates = [];
  h.state.reads = 0;
  h.state.failing.clear();
}

beforeEach(() => seed());

describe("customer link access", () => {
  it("refuses a value that is not a link of ours, without reading the record", async () => {
    expect(await openWelcome("not-a-link")).toBeNull();
    expect(await openWelcome("gcwl_short")).toBeNull();
    expect(h.state.reads).toBe(0);
  });

  it("refuses a well-formed link that matches no deal", async () => {
    expect(await openWelcome("gcwl_" + "b".repeat(43))).toBeNull();
  });

  it("refuses the old link once it has been revoked or rotated", async () => {
    seed({ welcome_token_hash: null });
    expect(await openWelcome(TOKEN)).toBeNull();
  });

  it("opens a valid link and records that the customer opened it", async () => {
    const view = await openWelcome(TOKEN);
    expect(view?.clientName).toBe("Aquatic Facility Services");
    expect(
      h.state.updates.some((u) => u.table === "portal_accounts" && "welcome_opened_at" in u.patch),
    ).toBe(true);
  });
});

describe("customer-safe data on the customer's link", () => {
  it("carries the scope as text only: no provenance, quote or review flag reaches the customer", async () => {
    const view = await openWelcome(TOKEN);
    const text = JSON.stringify(view);
    expect(view?.implementationFocus).toBeNull();
    expect(view?.customerScope.items).toEqual(["Service ticket form", "Gong-only idea"]);
    expect(view?.customerScope.state).toBe("proposed");
    expect(text).not.toContain("contract wording stays internal");
    expect(text).not.toContain("private Gong quote");
    expect(text).not.toContain("gong_only");
    expect(text).not.toContain('"sources"');
  });

  it("the internal read keeps the full record for the preview, with the same customer scope", async () => {
    const internal = await loadWelcome("deal-1");
    const customer = await openWelcome(TOKEN);
    expect(internal?.implementationFocus?.items[0]?.sources[0]?.quote).toBe(
      "contract wording stays internal",
    );
    expect(internal?.customerScope).toEqual(customer?.customerScope);
  });
});

describe("the TIS preview of the customer's dashboard", () => {
  it("shows what the customer's link shows: same projection, no sources, no internal identifier", async () => {
    const preview = await customerPreviewView("deal-1");
    const customer = await openWelcome(TOKEN);
    const text = JSON.stringify(preview);
    expect(preview?.dealId).toBe("");
    expect(preview?.implementationFocus).toBeNull();
    expect(preview?.customerScope).toEqual(customer?.customerScope);
    expect(text).not.toContain("contract wording stays internal");
    expect(text).not.toContain("private Gong quote");
    expect(text).not.toContain("deal-1");
  });

  it("returns nothing for a deal that does not exist", async () => {
    expect(await customerPreviewView("missing-deal")).toBeNull();
  });

  it("the customer's own copy carries no internal identifier either", async () => {
    const customer = await openWelcome(TOKEN);
    expect(customer?.dealId).toBe("");
    expect(JSON.stringify(customer)).not.toContain("deal-1");
  });
});

describe("a partner deal's customer link", () => {
  beforeEach(() => {
    seed();
    h.state.tables["implementations"] = [
      {
        id: "impl-p",
        deal_id: "deal-1",
        customer_id: "cust-1",
        name: "Partner implementation",
        journey_type: "partner_implementation",
        partner_key: "field_fusion_iq",
        current_stage: "partner_setup",
        superseded_by_implementation_id: null,
        created_at: "2026-03-01T00:00:00Z",
      },
    ];
    h.state.tables["stage_instances"] = [
      ["closed_won_planning", "done", "advisory"],
      ["partner_setup", "active", "blocking"],
      ["form_finalisation", "pending", "advisory"],
      ["pilot", "pending", "advisory"],
      ["trial_run", "pending", "advisory"],
      ["roll_out", "pending", "blocking"],
    ].map(([stage_key, status, gate_mode], i) => ({
      id: `si-${i}`,
      implementation_id: "impl-p",
      stage_key,
      status,
      gate_mode,
    }));
    h.state.tables["work_items"] = [
      {
        id: "wi-connection",
        implementation_id: "impl-p",
        stage_instance_id: "si-1",
        title: "Connection verified",
        party: "customer",
        visibility: "shared",
        status: "not_started",
        is_gate: true,
        due_at: null,
      },
      {
        id: "wi-internal",
        implementation_id: "impl-p",
        stage_instance_id: "si-1",
        title: "Partner-only checklist step",
        party: "partner",
        visibility: "internal",
        status: "not_started",
        is_gate: true,
        due_at: null,
      },
    ];
    h.state.tables["milestones"] = [];
    h.state.tables["implementation_stage_history"] = [];
    h.state.tables["portal_stage_transitions"] = [
      { account_id: "deal-1", to_stage: "closed_won", occurred_at: "2026-03-01T09:00:00Z" },
    ];
  });

  it("gets the partner dashboard, and no six-stage journey is forced on it", async () => {
    const view = await openWelcome(TOKEN);
    expect(view?.journey).toBeNull();
    expect(view?.partner?.stages.map((s) => s.key)).toEqual([
      "partner_setup",
      "form_finalisation",
      "pilot",
      "trial_run",
      "roll_out",
    ]);
    expect(view?.partner?.currentLabel).toBe("Partner Setup & Connection");
  });

  it("shows the customer only the customer's shared action, never the partner-only item", async () => {
    const view = await openWelcome(TOKEN);
    expect(view?.partner?.actions.map((a) => a.title)).toEqual(["Connection verified"]);
    expect(JSON.stringify(view?.partner)).not.toContain("Partner-only checklist step");
  });

  it("leaves a legacy Field Fusion deal on its own journey, with no partner view", async () => {
    // Legacy Field Fusion keeps the standard journey type and no partner key; its
    // intake path is what identifies it, and its six-stage journey is unchanged.
    h.state.tables["implementations"] = [
      {
        id: "impl-ff",
        deal_id: "deal-1",
        customer_id: "cust-1",
        name: "Legacy Field Fusion",
        journey_type: "standard",
        partner_key: null,
        current_stage: "get_it_working",
        superseded_by_implementation_id: null,
        created_at: "2026-03-01T00:00:00Z",
      },
    ];
    const view = await openWelcome(TOKEN);
    expect(view?.partner).toBeNull();
    expect(view?.journey).not.toBeNull();
  });

  it("leaves a standard deal's view unchanged: no partner view, its journey stays", async () => {
    h.state.tables["implementations"] = [];
    const view = await openWelcome(TOKEN);
    expect(view?.partner).toBeNull();
    expect(view?.journey).not.toBeNull();
  });
});

describe("a failed partner lookup", () => {
  beforeEach(() => {
    seed();
    h.state.tables["implementations"] = [
      {
        id: "impl-p",
        deal_id: "deal-1",
        customer_id: "cust-1",
        name: "Partner implementation",
        journey_type: "partner_implementation",
        partner_key: "field_fusion_iq",
        current_stage: "partner_setup",
        superseded_by_implementation_id: null,
        created_at: "2026-03-01T00:00:00Z",
      },
    ];
    h.state.tables["stage_instances"] = [
      {
        id: "si-1",
        implementation_id: "impl-p",
        stage_key: "partner_setup",
        status: "active",
        gate_mode: "blocking",
      },
    ];
    h.state.tables["work_items"] = [];
    h.state.tables["milestones"] = [];
    h.state.tables["portal_stage_transitions"] = [];
  });

  it("a known partner whose progress cannot load shows no standard journey and no partner stages", async () => {
    h.state.failing.add("stage_instances");
    const view = await openWelcome(TOKEN);
    expect(view).not.toBeNull();
    expect(view?.partnerUnavailable).toBe(true);
    expect(view?.partner).toBeNull();
    expect(view?.journey).toBeNull();
  });

  it("a standard customer's dashboard survives a failed partner lookup, with its six-stage journey", async () => {
    h.state.tables["implementations"] = [];
    h.state.failing.add("implementations");
    const view = await openWelcome(TOKEN);
    expect(view).not.toBeNull();
    expect(view?.partnerUnavailable).toBe(false);
    expect(view?.partner).toBeNull();
    expect(view?.journey).not.toBeNull();
  });

  it("a partner's dashboard is complete again once its progress can be read", async () => {
    h.state.failing.add("stage_instances");
    expect((await openWelcome(TOKEN))?.partnerUnavailable).toBe(true);
    h.state.failing.clear();
    const view = await openWelcome(TOKEN);
    expect(view?.partnerUnavailable).toBe(false);
    expect(view?.partner?.stages).toHaveLength(5);
  });
});

describe("a partner deal before Closed Won", () => {
  beforeEach(() => {
    seed();
    const account = h.state.tables["portal_accounts"]![0]!;
    account["intake"] = {
      ...(account["intake"] as object),
      path: "partner_implementation",
      partner_implementation: { partner_key: "field_fusion_iq" },
    };
    h.state.tables["implementations"] = [];
  });

  it("is a partner deal with no six-stage journey, no partner stages, and no New Logo help picks", async () => {
    const view = await openWelcome(TOKEN);
    expect(view?.partnerDeal).toBe(true);
    expect(view?.partnerName).toBe("Field Fusion IQ");
    expect(view?.journey).toBeNull();
    expect(view?.partner).toBeNull();
    expect(view?.partnerUnavailable).toBe(false);
    expect(view?.helpPicks).toEqual([]);
  });

  it("a standard deal is not a partner deal, and keeps its journey", async () => {
    h.state.tables["portal_accounts"]![0]!["intake"] = { ...intake, path: "new_logo" };
    const view = await openWelcome(TOKEN);
    expect(view?.partnerDeal).toBe(false);
    expect(view?.partnerName).toBeNull();
  });
});
