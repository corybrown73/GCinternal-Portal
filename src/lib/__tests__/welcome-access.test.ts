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
  };
  type Query = {
    select: () => Query;
    in: () => Query;
    eq: (col: string, val: unknown) => Query;
    update: (patch: Record<string, unknown>) => Query;
    maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
  };
  const builder = (table: string): Query => {
    let rows = state.tables[table] ?? [];
    const api: Query = {
      select: () => api,
      in: () => api,
      eq: (col, val) => {
        state.reads += 1;
        rows = rows.filter((r) => r[col] === val);
        return api;
      },
      update: (patch) => {
        state.updates.push({ table, patch });
        return api;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
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
