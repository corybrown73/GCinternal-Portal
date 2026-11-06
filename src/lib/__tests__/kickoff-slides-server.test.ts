import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

const h = vi.hoisted(() => {
  const state = { supabase: { client: null as any }, forward: null as any };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));

import { readIntake } from "../intake-answers";
import { kickoffDeckView } from "../kickoff-slides.server";

const SAVED = {
  included: ["kickoff-training"],
  order: ["kickoff-training"],
  saved_at: "2026-11-05T10:00:00Z",
  saved_by: "profile-7",
};

function rows(over: Partial<Rows> = {}): Rows {
  return {
    implementations: [
      // The current implementation, the one the deck is saved against.
      {
        id: "impl-2",
        deal_id: "deal-1",
        customer_id: "cust-1",
        journey_template_id: "tpl-integration",
        partner_key: null,
        journey_type: null,
        superseded_by_implementation_id: null,
        created_at: "2026-11-01T00:00:00Z",
      },
      // The earlier implementation for the same customer, superseded by impl-2.
      {
        id: "impl-1",
        deal_id: "deal-1",
        customer_id: "cust-1",
        journey_template_id: null,
        partner_key: null,
        journey_type: null,
        superseded_by_implementation_id: "impl-2",
        created_at: "2026-10-01T00:00:00Z",
      },
    ],
    journey_templates: [{ id: "tpl-integration", key: "integration" }],
    portal_profiles: [{ id: "profile-7", full_name: "Test Specialist", email: "t@example.test" }],
    ...over,
  };
}

let fake: ReturnType<typeof createFakeSupabase>;
function use(r: Rows) {
  fake = createFakeSupabase(r);
  h.supabase.client = fake.client;
}
beforeEach(() => {
  h.supabase.client = null;
});

const baseArgs = {
  dealId: "deal-1",
  firstFormNamed: false,
  firstFormConfirmed: false,
};

describe("the deck for the current implementation", () => {
  it("uses the TIS's saved selection for that implementation, and says it differs from the recommendation", async () => {
    use(rows());
    const intake = readIntake({
      solutions_involved: true,
      timeline: { services: [{ id: "s1", kind: "integration", name: "QuickBooks", phase: 2 }] },
      kickoff_deck: { "impl-2": SAVED },
    });
    const view = await kickoffDeckView({ ...baseArgs, intake });

    expect(view.implementationId).toBe("impl-2");
    expect(view.selection.included).toEqual(["kickoff-training"]);
    expect(view.recommended.included).toContain("kickoff-purchased");
    expect(view.recommendationChanged).toBe(true);
    expect(view.saved).toEqual({ savedAt: SAVED.saved_at, savedBy: "Test Specialist" });
  });

  it("never applies a selection saved against a different implementation", async () => {
    use(rows());
    const intake = readIntake({
      solutions_involved: true,
      timeline: { services: [{ id: "s1", kind: "integration", name: "QuickBooks", phase: 2 }] },
      kickoff_deck: { "impl-1": SAVED },
    });
    const view = await kickoffDeckView({ ...baseArgs, intake });
    expect(view.saved).toBeNull();
    expect(view.selection).toEqual({
      included: view.recommended.included,
      order: view.selection.order,
    });
    expect(view.recommendationChanged).toBe(false);
  });

  it("uses the recommendation, and marks nothing as changed, when nothing is saved", async () => {
    use(rows());
    const view = await kickoffDeckView({ ...baseArgs, intake: readIntake({}) });
    expect(view.saved).toBeNull();
    expect(view.recommendationChanged).toBe(false);
  });
});

describe("classification and the purchased list", () => {
  it("classifies an integration journey as an expansion, with the existing classification's reason", async () => {
    use(rows());
    const view = await kickoffDeckView({ ...baseArgs, intake: readIntake({}) });
    expect(view.kind).toBe("expansion");
    expect(view.kindReason).toMatch(/integration/);
  });

  it("carries what was bought as name, kind and phase only", async () => {
    use(rows());
    const intake = readIntake({
      timeline: {
        services: [
          { id: "s1", kind: "integration", name: "QuickBooks", phase: 2, needs: "Internal note" },
        ],
      },
    });
    const view = await kickoffDeckView({ ...baseArgs, intake });
    expect(view.purchased).toEqual([{ kind: "integration", name: "QuickBooks", phase: 2 }]);
    expect(JSON.stringify(view.purchased)).not.toMatch(/Internal note/);
  });

  it("names the partner from the explicit partner on the deal", async () => {
    use(rows());
    const intake = readIntake({ partner_implementation: { partner_key: "field_fusion_iq" } });
    const view = await kickoffDeckView({ ...baseArgs, intake });
    expect(view.partnerName).toBe("Field Fusion IQ");
    expect(view.recommended.included).toContain("kickoff-partner");
  });
});

describe("a deal with no implementation", () => {
  it("has nothing to save against, says so, and still gives a recommendation", async () => {
    use(rows({ implementations: [] }));
    const view = await kickoffDeckView({
      ...baseArgs,
      intake: readIntake({ training_only: true }),
    });
    expect(view.implementationId).toBeNull();
    expect(view.saved).toBeNull();
    expect(view.recommended.included).toContain("kickoff-training");
    expect(view.recommended.flags.join(" ")).toMatch(/cannot be saved/);
  });
});
