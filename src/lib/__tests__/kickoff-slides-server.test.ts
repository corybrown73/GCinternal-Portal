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
import { kickoffDeckBlocked, presentedSlideKeys } from "../kickoff-slides";
import {
  canConfigureImplementationDeck,
  kickoffDeckView,
  saveKickoffDeck,
} from "../kickoff-slides.server";

const KEY = "kickoff_deck";
const PARTNER_TEMPLATE = "tpl-partner";
const DIRECT_TEMPLATE = "tpl-new-logo";

/** One deal, one current implementation. The journey template and partner key set the deck type signals. */
function rows(over: Partial<Rows> = {}): Rows {
  return {
    portal_accounts: [{ id: "deal-1", customer_id: "cust-1", is_test: false }],
    customers: [{ id: "cust-1", is_test: false }],
    implementations: [
      {
        id: "impl-2",
        deal_id: "deal-1",
        customer_id: "cust-1",
        owner_id: "tm-owner",
        journey_template_id: DIRECT_TEMPLATE,
        partner_key: null,
        journey_type: null,
        superseded_by_implementation_id: null,
        created_at: "2026-11-01T00:00:00Z",
      },
    ],
    journey_templates: [
      { id: DIRECT_TEMPLATE, key: "new-logo" },
      { id: PARTNER_TEMPLATE, key: "partner-implementation" },
    ],
    portal_profiles: [
      {
        id: "profile-7",
        full_name: "Test Manager",
        email: "m@example.test",
        role: "manager",
        team_member_id: "tm-m",
      },
      {
        id: "profile-tis",
        full_name: "Owner TIS",
        email: "t@example.test",
        role: "implementation",
        team_member_id: "tm-owner",
      },
      {
        id: "profile-other",
        full_name: "Other TIS",
        email: "o@example.test",
        role: "implementation",
        team_member_id: "tm-other",
      },
      {
        id: "profile-sales",
        full_name: "Sales",
        email: "s@example.test",
        role: "sales",
        team_member_id: "tm-sales",
      },
    ],
    scoping_answers: [],
    ...over,
  };
}

const SAVED = { deck_type: "standard", form_ready: false, saved_at: "2026-11-05T10:00:00.000Z" };
const savedRow = (value: unknown = SAVED, answeredBy = "profile-7") => ({
  implementation_id: "impl-2",
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

const baseArgs = {
  dealId: "deal-1",
  firstFormNamed: true,
  firstFormConfirmed: true,
  firstFormName: "Site Check",
  kickoffDate: null,
  closeDate: null,
};
const intake = (extra: Record<string, unknown> = {}) =>
  readIntake({
    path: "new_logo",
    solutions_involved: false,
    timeline: { services: [] },
    ...extra,
  });

beforeEach(() => {
  h.supabase.client = null;
});

describe("the automatic deck: direct GoCanvas is standard, a partner implementation is partner", () => {
  it("a direct implementation with no saved choice presents the standard core slides", async () => {
    use(rows());
    const view = await kickoffDeckView({ ...baseArgs, intake: intake() });
    expect(view.loadError).toBeNull();
    expect(view.selection).toEqual({
      deckType: "standard",
      formReady: false,
      hasAdditional: false,
    });
    expect(presentedSlideKeys(view.selection)).not.toContain("kickoff-form-v1");
    expect(view.saved).toBeNull();
  });

  it("a partner implementation whose record and journey agree gets the partner deck, with the partner named", async () => {
    use(
      rows({
        implementations: [
          {
            ...rows()["implementations"]![0]!,
            journey_template_id: PARTNER_TEMPLATE,
            partner_key: "field_fusion_iq",
          },
        ],
      }),
    );
    const view = await kickoffDeckView({
      ...baseArgs,
      intake: intake({ path: "partner_implementation" }),
    });
    expect(view.selection?.deckType).toBe("partner");
    expect(view.partnerName).toBe("Field Fusion IQ");
    expect(presentedSlideKeys(view.selection)).toHaveLength(6);
  });

  it("additional solutions come from the record, never training or the paid form", async () => {
    use(rows());
    const view = await kickoffDeckView({
      ...baseArgs,
      intake: intake({
        solutions_involved: true,
        timeline: {
          services: [
            { id: "a", kind: "training", name: "Crew training", phase: 1 },
            { id: "b", kind: "paid_form", name: "Form build", phase: 1 },
            { id: "c", kind: "integration", name: "QuickBooks", phase: 2 },
          ],
        },
      }),
    });
    expect(view.additional.map((s) => s.name)).toEqual(["QuickBooks"]);
    expect(view.selection?.hasAdditional).toBe(true);
  });
});

describe("ambiguous deck type is surfaced, and the presentation is blocked until the TIS chooses", () => {
  it("a partner key with a direct journey template is ambiguous: no selection, blocked", async () => {
    use(
      rows({
        implementations: [{ ...rows()["implementations"]![0]!, partner_key: "field_fusion_iq" }],
      }),
    );
    const view = await kickoffDeckView({ ...baseArgs, intake: intake() });
    expect(view.loadError).toBeNull();
    expect(view.selection).toBeNull();
    expect(view.recommended.ambiguous).toBe(true);
    expect(kickoffDeckBlocked({ kickoffDeck: view })).toBe(true);
  });

  it("the TIS's saved deck type settles it, and the presentation is no longer blocked", async () => {
    use(
      rows({
        implementations: [{ ...rows()["implementations"]![0]!, partner_key: "field_fusion_iq" }],
        scoping_answers: [
          savedRow({ deck_type: "partner", form_ready: false, saved_at: SAVED.saved_at }),
        ],
      }),
    );
    const view = await kickoffDeckView({ ...baseArgs, intake: intake() });
    expect(view.selection?.deckType).toBe("partner");
    expect(kickoffDeckBlocked({ kickoffDeck: view })).toBe(false);
  });
});

describe("the saved choice wins for the deck type and the form readiness", () => {
  it("a saved form-ready choice presents the first form, with who saved it", async () => {
    use(rows({ scoping_answers: [savedRow({ ...SAVED, form_ready: true })] }));
    const view = await kickoffDeckView({ ...baseArgs, intake: intake() });
    expect(view.selection?.formReady).toBe(true);
    expect(presentedSlideKeys(view.selection)).toContain("kickoff-form-v1");
    expect(view.saved).toMatchObject({
      deckType: "standard",
      formReady: true,
      savedBy: "Test Manager",
    });
  });

  it("the first-form name is shown only when a first form is named", async () => {
    use(rows());
    const named = await kickoffDeckView({ ...baseArgs, intake: intake() });
    expect(named.firstFormName).toBe("Site Check");
    const none = await kickoffDeckView({
      ...baseArgs,
      firstFormNamed: false,
      firstFormName: null,
      intake: intake(),
    });
    expect(none.firstFormName).toBeNull();
    expect(none.recommended.flags.join(" ")).toMatch(/No first form is named/);
  });
});

describe("a failed or malformed read blocks the presentation with an explicit error", () => {
  it("a failed implementation read is an error, not a recommendation", async () => {
    use(rows(), { implementations: { message: "column does not exist" } });
    const view = await kickoffDeckView({ ...baseArgs, intake: intake() });
    expect(view.loadError).toMatch(/kickoff deck/);
    expect(view.selection).toBeNull();
    expect(kickoffDeckBlocked({ kickoffDeck: view })).toBe(true);
  });

  it("a failed read of the saved choice is an error, not 'nothing saved'", async () => {
    use(rows(), { scoping_answers: { message: "permission denied" } });
    const view = await kickoffDeckView({ ...baseArgs, intake: intake() });
    expect(view.loadError).toBeTruthy();
    expect(view.selection).toBeNull();
  });

  it("a malformed saved row is an explicit error, never a guessed deck", async () => {
    use(rows({ scoping_answers: [savedRow({ included: ["kickoff-training"], order: [] })] }));
    const view = await kickoffDeckView({ ...baseArgs, intake: intake() });
    expect(view.loadError).toBeTruthy();
    expect(view.selection).toBeNull();
    expect(kickoffDeckBlocked({ kickoffDeck: view })).toBe(true);
  });
});

describe("who may configure the deck", () => {
  it("managers may configure any implementation on the deal", async () => {
    use(rows());
    expect(await canConfigureImplementationDeck("profile-7", "deal-1", "impl-2")).toBe(true);
  });

  it("the implementation's own TIS may, another TIS may not, and sales may not", async () => {
    use(rows());
    expect(await canConfigureImplementationDeck("profile-tis", "deal-1", "impl-2")).toBe(true);
    expect(await canConfigureImplementationDeck("profile-other", "deal-1", "impl-2")).toBe(false);
    expect(await canConfigureImplementationDeck("profile-sales", "deal-1", "impl-2")).toBe(false);
  });
});

describe("saving writes only the deck choice, and only for someone allowed to", () => {
  it("a manager's save writes the deck type and form readiness, and nothing else", async () => {
    use(rows());
    const before = JSON.stringify({
      implementations: fake.store["implementations"]!,
      journey_templates: fake.store["journey_templates"],
    });
    await saveKickoffDeck({
      actorProfileId: "profile-7",
      dealId: "deal-1",
      implementationId: "impl-2",
      choice: { deckType: "standard", formReady: true },
    });
    const row = (fake.store["scoping_answers"] ?? []).find((r: any) => r.question_key === KEY);
    expect(row).toMatchObject({
      implementation_id: "impl-2",
      question_key: KEY,
      source: "manual",
      answered_by: "profile-7",
      value: { deck_type: "standard", form_ready: true },
    });
    const after = JSON.stringify({
      implementations: fake.store["implementations"]!,
      journey_templates: fake.store["journey_templates"],
    });
    expect(after).toBe(before);
  });

  it("the implementation's own TIS may save their deck", async () => {
    use(rows());
    await expect(
      saveKickoffDeck({
        actorProfileId: "profile-tis",
        dealId: "deal-1",
        implementationId: "impl-2",
        choice: { deckType: "standard", formReady: false },
      }),
    ).resolves.toMatchObject({ saved: true });
  });

  it("another TIS, or sales, is refused and nothing is written", async () => {
    use(rows());
    await expect(
      saveKickoffDeck({
        actorProfileId: "profile-other",
        dealId: "deal-1",
        implementationId: "impl-2",
        choice: { deckType: "standard", formReady: true },
      }),
    ).rejects.toThrow(/Only an administrator, a manager, or the TIS/);
    await expect(
      saveKickoffDeck({
        actorProfileId: "profile-sales",
        dealId: "deal-1",
        implementationId: "impl-2",
        choice: { deckType: "standard", formReady: true },
      }),
    ).rejects.toThrow(/Only an administrator, a manager, or the TIS/);
    expect(fake.store["scoping_answers"] ?? []).toEqual([]);
  });

  it("an implementation that is not on this deal is refused", async () => {
    use(rows());
    await expect(
      saveKickoffDeck({
        actorProfileId: "profile-7",
        dealId: "deal-1",
        implementationId: "impl-elsewhere",
        choice: { deckType: "standard", formReady: true },
      }),
    ).rejects.toThrow(/not on this deal/);
  });

  it("a reset removes the saved choice, so the automatic deck applies again", async () => {
    use(rows({ scoping_answers: [savedRow({ ...SAVED, form_ready: true })] }));
    await saveKickoffDeck({
      actorProfileId: "profile-7",
      dealId: "deal-1",
      implementationId: "impl-2",
      choice: null,
    });
    expect((fake.store["scoping_answers"] ?? []).some((r: any) => r.question_key === KEY)).toBe(
      false,
    );
    const view = await kickoffDeckView({ ...baseArgs, intake: intake() });
    expect(view.saved).toBeNull();
    expect(view.selection?.formReady).toBe(false);
  });
});
