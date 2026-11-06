import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows, type TableFailures } from "./fake-supabase";

const h = vi.hoisted(() => {
  const state = { supabase: { client: null as any }, forward: null as any };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../server/audit", () => ({ audit: async () => undefined }));

import { readIntake } from "../intake-answers";
import { canConfigureImplementationDeck, kickoffDeckView } from "../kickoff-slides.server";

const KEY = "kickoff_deck";

/** A test deal (flag on the deal), with one current implementation. */
function rows(over: Partial<Rows> = {}): Rows {
  return {
    portal_accounts: [{ id: "deal-1", customer_id: "cust-1", is_test: true }],
    customers: [{ id: "cust-1", is_test: false }],
    implementations: [
      {
        id: "impl-2",
        deal_id: "deal-1",
        customer_id: "cust-1",
        owner_id: "tm-owner",
        journey_template_id: null,
        partner_key: null,
        journey_type: null,
        superseded_by_implementation_id: null,
        created_at: "2026-11-01T00:00:00Z",
      },
    ],
    journey_templates: [],
    portal_profiles: [
      {
        id: "profile-7",
        full_name: "Test Specialist",
        email: "t@example.test",
        role: "manager",
        team_member_id: "tm-m",
      },
    ],
    scoping_answers: [],
    ...over,
  };
}

const SAVED = {
  included: ["kickoff-training"],
  order: ["kickoff-training"],
  saved_at: "2026-11-05T10:00:00.000Z",
};
const savedRow = (implementationId: string, value: unknown = SAVED, answeredBy = "profile-7") => ({
  implementation_id: implementationId,
  question_key: KEY,
  value,
  source: "manual",
  answered_by: answeredBy,
});

let fake: ReturnType<typeof createFakeSupabase>;
function use(r: Rows, fail: TableFailures = {}) {
  fake = createFakeSupabase(r, { fail });
  h.supabase.client = fake.client;
}

const baseArgs = { dealId: "deal-1", firstFormNamed: false, firstFormConfirmed: false };
const intake = (extra: Record<string, unknown> = {}) =>
  readIntake({
    solutions_involved: true,
    timeline: { services: [{ id: "s1", kind: "integration", name: "QuickBooks", phase: 2 }] },
    ...extra,
  });

beforeEach(() => {
  h.supabase.client = null;
});

describe("the deck is for test implementations only", () => {
  it("a live customer's deal gets no deck at all, and reads nothing for it", async () => {
    // Even a failing implementations read cannot reach a live deal: it is never read.
    use(
      rows({
        portal_accounts: [{ id: "deal-1", customer_id: "cust-1", is_test: false }],
        customers: [{ id: "cust-1", is_test: false }],
      }),
      {
        implementations: { message: "boom" },
      },
    );
    expect(await kickoffDeckView({ ...baseArgs, intake: intake() })).toBeNull();
  });

  it("a test deal is recognised by its own flag", async () => {
    use(rows());
    expect((await kickoffDeckView({ ...baseArgs, intake: intake() }))?.loadError).toBeNull();
  });

  it("a deal of a test customer is recognised by the customer's flag", async () => {
    use(
      rows({
        portal_accounts: [{ id: "deal-1", customer_id: "cust-1", is_test: false }],
        customers: [{ id: "cust-1", is_test: true }],
      }),
    );
    expect(await kickoffDeckView({ ...baseArgs, intake: intake() })).not.toBeNull();
  });
});

describe("a failed read is an explicit error, never a silent recommendation", () => {
  it("a failed implementation read says so, and offers no recommendation or selection", async () => {
    use(rows(), { implementations: { message: "column does not exist" } });
    const view = await kickoffDeckView({ ...baseArgs, intake: intake() });
    expect(view?.loadError).toMatch(/Could not load the kickoff slides/);
    expect(view?.recommended.included).toEqual([]);
    expect(view?.saved).toBeNull();
    expect(view?.canConfigure).toBe(false);
  });

  it("a failed read of the saved selection is an error, not 'nothing saved'", async () => {
    use(rows({ scoping_answers: [savedRow("impl-2")] }), {
      scoping_answers: { message: "timeout" },
    });
    const view = await kickoffDeckView({ ...baseArgs, intake: intake() });
    expect(view?.loadError).toMatch(/Could not load/);
    expect(view?.recommended.included).toEqual([]);
  });

  it("a saved selection that does not read is an explicit error, not an empty deck", async () => {
    use(rows({ scoping_answers: [savedRow("impl-2", { included: "not-a-list" })] }));
    const view = await kickoffDeckView({ ...baseArgs, intake: intake() });
    expect(view?.loadError).toMatch(/saved slide selection/);
    expect(view?.selection.included).toEqual([]);
  });

  it("a failed read of the viewer's permission is reported, not treated as no permission", async () => {
    use(rows(), { portal_profiles: { message: "boom" } });
    await expect(canConfigureImplementationDeck("profile-7", "deal-1", "impl-2")).rejects.toThrow(
      /Could not load/,
    );
  });

  it("a deal with no implementation yet reads cleanly, with nothing to save against", async () => {
    use(rows({ implementations: [] }));
    const view = await kickoffDeckView({ ...baseArgs, intake: intake() });
    expect(view?.loadError).toBeNull();
    expect(view?.implementationId).toBeNull();
  });
});

describe("the saved selection takes precedence", () => {
  it("uses the saved selection for the current implementation, and says the recommendation has changed", async () => {
    use(rows({ scoping_answers: [savedRow("impl-2")] }));
    const view = await kickoffDeckView({ ...baseArgs, intake: intake() });
    expect(view?.selection.included).toEqual(["kickoff-training"]);
    expect(view?.recommendationChanged).toBe(true);
    expect(view?.saved).toEqual({ savedAt: SAVED.saved_at, savedBy: "Test Specialist" });
  });

  it("never applies a selection saved against a different implementation", async () => {
    use(rows({ scoping_answers: [savedRow("impl-1")] }));
    const view = await kickoffDeckView({ ...baseArgs, intake: intake() });
    expect(view?.saved).toBeNull();
    expect(view?.recommendationChanged).toBe(false);
  });

  it("uses the recommendation when nothing is saved, with no error", async () => {
    use(rows());
    const view = await kickoffDeckView({ ...baseArgs, intake: intake() });
    expect(view?.loadError).toBeNull();
    expect(view?.saved).toBeNull();
  });
});

describe("the view carries the facts the deck needs", () => {
  it("carries what was bought as name, kind and phase only", async () => {
    use(rows());
    const view = await kickoffDeckView({
      ...baseArgs,
      intake: readIntake({
        timeline: {
          services: [
            { id: "s1", kind: "integration", name: "QuickBooks", phase: 2, needs: "Internal note" },
          ],
        },
      }),
    });
    expect(view?.purchased).toEqual([{ kind: "integration", name: "QuickBooks", phase: 2 }]);
    expect(JSON.stringify(view?.purchased)).not.toMatch(/Internal note/);
  });

  it("names the partner from the explicit partner on the deal", async () => {
    use(rows());
    const view = await kickoffDeckView({
      ...baseArgs,
      intake: readIntake({ partner_implementation: { partner_key: "field_fusion_iq" } }),
    });
    expect(view?.partnerName).toBe("Field Fusion IQ");
  });
});

describe("whether the viewer may configure the deck", () => {
  const people = [
    { id: "p-manager", role: "manager", team_member_id: "tm-manager" },
    { id: "p-admin", role: "admin", team_member_id: null },
    { id: "p-impl", role: "implementation", team_member_id: "tm-owner" },
    { id: "p-other-impl", role: "implementation", team_member_id: "tm-other" },
    { id: "p-sales", role: "sales", team_member_id: "tm-owner" },
  ];
  const seeded = () => rows({ portal_profiles: people as never });

  it("management may configure any implementation on the deal", async () => {
    use(seeded());
    expect(await canConfigureImplementationDeck("p-manager", "deal-1", "impl-2")).toBe(true);
    expect(await canConfigureImplementationDeck("p-admin", "deal-1", "impl-2")).toBe(true);
  });

  it("the assigned implementation specialist may configure their own implementation only", async () => {
    use(seeded());
    expect(await canConfigureImplementationDeck("p-impl", "deal-1", "impl-2")).toBe(true);
    expect(await canConfigureImplementationDeck("p-other-impl", "deal-1", "impl-2")).toBe(false);
  });

  it("no other role may configure, even as the named owner", async () => {
    use(seeded());
    expect(await canConfigureImplementationDeck("p-sales", "deal-1", "impl-2")).toBe(false);
  });
});
