import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

const h = vi.hoisted(() => {
  const state = { supabase: { client: null as any }, forward: null as any };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../server/audit", () => ({ audit: async () => undefined }));

import { readIntake } from "../intake-answers";
import { kickoffDeckBlocked } from "../kickoff-slides";
import { addBusinessDays } from "../onboarding-timeline";
import { assertScheduleValid, kickoffDeckView, saveKickoffDeck } from "../kickoff-slides.server";

const RIVERBAY =
  "The estimated timeline for completion of the solution is 4 to 6 weeks, commencing once all form builds and edits have been finalized. These deliverables may include necessary systems or environments, submitting finalized forms and documentation.";

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
        journey_template_id: "tpl-new",
        partner_key: null,
        journey_type: null,
        superseded_by_implementation_id: null,
        created_at: "2026-11-01T00:00:00Z",
      },
    ],
    journey_templates: [{ id: "tpl-new", key: "new-logo" }],
    portal_profiles: [
      {
        id: "profile-7",
        full_name: "Test Manager",
        email: "m@example.test",
        role: "manager",
        team_member_id: "tm-m",
      },
    ],
    scoping_answers: [],
    portal_app_config: [{ key: "complexity_tiers", value: CONFIGURED_TIERS }],
    ...over,
  };
}

/** The Settings complexity tiers under test: the authoritative Tier 1 to 5 targets, and the seeded Tier 0. */
const CONFIGURED_TIERS = {
  tiers: [
    { tier: 0, name: "None", business_days: 15, qualifies: "No integration in scope." },
    { tier: 1, name: "Standard", business_days: 30, qualifies: "Free form build only." },
    { tier: 2, name: "Intermediate", business_days: 45, qualifies: "Level 1." },
    { tier: 3, name: "Advanced", business_days: 90, qualifies: "Level 2." },
    { tier: 4, name: "Complex", business_days: 120, qualifies: "Level 3." },
    { tier: 5, name: "Unknown", business_days: 150, qualifies: "Level 4." },
  ],
};

/** A deal recorded at a complexity tier, with no SOW timeline. */
const tierIntake = (n: number) =>
  readIntake({ path: "new_logo", timeline: { services: [], holidays: [], integration_tier: n } });

/** A deal whose SOW was applied: the paragraph kept on the timeline, and the deal's own holidays. */
const sowIntake = (extra: Record<string, unknown> = {}) =>
  readIntake({
    path: "new_logo",
    solutions_involved: false,
    timeline: {
      services: [],
      holidays: [],
      sow_notes: [],
      sow_dates: [],
      sow_delivery: {
        quote: RIVERBAY,
        duration_text: "4 to 6 weeks",
        duration_unit: "week",
        duration_min: 4,
        duration_max: 6,
        start_condition: "forms_finalised",
        start_text: "all form builds and edits have been finalized",
        dependencies: [
          "necessary systems or environments",
          "submitting finalized forms and documentation",
        ],
      },
    },
    ...extra,
  });

let fake: ReturnType<typeof createFakeSupabase>;
function use(r: Rows, fail: Record<string, { message: string; code?: string }> = {}) {
  fake = createFakeSupabase(r, { fail });
  h.supabase.client = fake.client;
}

const args = (intake = sowIntake(), signedDate: string | null = null) => ({
  dealId: "deal-1",
  intake,
  firstFormNamed: true,
  firstFormConfirmed: true,
  firstFormName: "Site Check",
  kickoffDate: "2026-09-07",
  closeDate: "2026-08-20",
  signedDate,
});

const savedRow = (
  schedule: Record<string, unknown> | null,
  extra: Record<string, unknown> = {},
) => ({
  implementation_id: "impl-2",
  question_key: "kickoff_deck",
  value: {
    deck_type: "standard",
    form_ready: true,
    saved_at: "2026-11-05T10:00:00.000Z",
    ...(schedule === null ? {} : { schedule }),
    ...extra,
  },
  source: "manual",
  answered_by: "profile-7",
});

beforeEach(() => {
  h.supabase.client = null;
});

describe("the SOW's start condition is read from the saved paragraph, not from kickoff", () => {
  it("with the form-finalisation day not recorded, no completion is proposed, even with a kickoff date", async () => {
    use(rows());
    const view = await kickoffDeckView(args());
    expect(view.delivery?.suggestion.basis).toBe("sow");
    expect(view.delivery?.suggestion.from).toBeNull();
    expect(view.delivery?.suggestion.missing).toMatch(/not recorded yet/);
    expect(view.delivery?.effective.source).toBe("sow");
    expect(view.delivery?.label).toBeNull();
  });

  it("the TIS's recorded finalisation day starts the SOW's clock: 4 to 6 weeks from that day", async () => {
    use(
      rows({
        scoping_answers: [
          savedRow({
            forms_finalised_on: "2026-10-05",
            completion_from: null,
            completion_to: null,
            adjusted_reason: null,
          }),
        ],
      }),
    );
    const view = await kickoffDeckView(args());
    expect(view.delivery?.suggestion.startDate).toBe("2026-10-05");
    expect(view.delivery?.suggestion.from).toBe("2026-11-02");
    expect(view.delivery?.suggestion.to).toBe("2026-11-16");
    expect(view.delivery?.label).toMatch(/Proposed from the SOW Delivery Timeline/);
    expect(view.delivery?.label).toMatch(/Not yet agreed with the customer/);
  });

  it("a deal with no SOW paragraph falls back to the tier target, in business days", async () => {
    use(rows());
    const view = await kickoffDeckView({
      ...args(tierIntake(1)),
    });
    // A recorded Tier 1 takes Settings' Tier 1 target: 30 business days from the close (2026-08-20).
    expect(view.delivery?.suggestion.basis).toBe("tier");
    expect(view.delivery?.suggestion.from).toBe(addBusinessDays("2026-08-20", 30));
    expect(view.delivery?.label).toMatch(/complexity-tier target, in business days/);
  });
});

describe("the TIS's saved dates are the TIS's adjustment, never the customer's agreement", () => {
  it("a saved completion range replaces the suggestion, labelled as adjusted by the TIS", async () => {
    use(
      rows({
        scoping_answers: [
          savedRow({
            forms_finalised_on: "2026-10-05",
            completion_from: "2026-11-20",
            completion_to: "2026-12-04",
            adjusted_reason: "Client review is in late November.",
          }),
        ],
      }),
    );
    const view = await kickoffDeckView(args());
    expect(view.delivery?.effective).toEqual({
      from: "2026-11-20",
      to: "2026-12-04",
      source: "tis",
    });
    expect(view.delivery?.saved?.adjustedReason).toBe("Client review is in late November.");
    expect(view.delivery?.label).toMatch(/Adjusted by the TIS/);
    expect(view.delivery?.label).toMatch(/Not yet agreed/);
  });

  it("a choice saved before dates existed still reads, with no dates", async () => {
    use(rows({ scoping_answers: [savedRow(null)] }));
    const view = await kickoffDeckView(args());
    expect(view.loadError).toBeNull();
    expect(view.delivery?.saved).toBeNull();
    expect(view.selection?.formReady).toBe(true);
  });

  it("a stored schedule that does not read is an explicit error, and the presentation is held", async () => {
    use(
      rows({
        scoping_answers: [
          savedRow({
            forms_finalised_on: "not a date",
            completion_from: null,
            completion_to: null,
            adjusted_reason: null,
          }),
        ],
      }),
    );
    const view = await kickoffDeckView(args());
    expect(view.loadError).toBeTruthy();
    expect(kickoffDeckBlocked({ kickoffDeck: view })).toBe(true);
  });
});

describe("saving dates: validation, and nothing else moves", () => {
  it("rejects a completion range that runs backwards", () => {
    expect(() =>
      assertScheduleValid({
        formsFinalisedOn: null,
        completionFrom: "2026-12-04",
        completionTo: "2026-11-20",
        adjustedReason: "x",
      }),
    ).toThrow(/end on or after/);
  });

  it("rejects completion dates with no reason", () => {
    expect(() =>
      assertScheduleValid({
        formsFinalisedOn: null,
        completionFrom: "2026-11-20",
        completionTo: "2026-12-04",
        adjustedReason: "  ",
      }),
    ).toThrow(/needs a reason/);
  });

  it("rejects one end of a completion range", () => {
    expect(() =>
      assertScheduleValid({
        formsFinalisedOn: null,
        completionFrom: "2026-11-20",
        completionTo: null,
        adjustedReason: "x",
      }),
    ).toThrow(/both ends/);
  });

  it("rejects a value that is not a calendar day", () => {
    expect(() =>
      assertScheduleValid({
        formsFinalisedOn: "5 October",
        completionFrom: null,
        completionTo: null,
        adjustedReason: null,
      }),
    ).toThrow(/calendar day/);
  });

  it("accepts a valid proposal, and accepts no schedule at all", () => {
    expect(() =>
      assertScheduleValid({
        formsFinalisedOn: "2026-10-05",
        completionFrom: "2026-11-02",
        completionTo: "2026-11-16",
        adjustedReason: "Client availability.",
      }),
    ).not.toThrow();
    expect(() => assertScheduleValid(null)).not.toThrow();
  });

  it("a save writes the deck row only; stages, milestones, work and the deal are untouched", async () => {
    use(
      rows({
        work_items: [{ id: "w1", implementation_id: "impl-2", task_key: "x", status: "open" }],
        stage_instances: [
          { id: "s1", implementation_id: "impl-2", stage_key: "build", gate_mode: "auto" },
        ],
        portal_accounts: [
          { id: "deal-1", customer_id: "cust-1", is_test: false, stage: "kickoff" },
        ],
      }),
    );
    const snapshot = JSON.stringify({
      implementations: fake.store["implementations"],
      work_items: fake.store["work_items"],
      stage_instances: fake.store["stage_instances"],
      portal_accounts: fake.store["portal_accounts"],
    });
    await saveKickoffDeck({
      actorProfileId: "profile-7",
      dealId: "deal-1",
      implementationId: "impl-2",
      choice: {
        deckType: "standard",
        formReady: true,
        schedule: {
          formsFinalisedOn: "2026-10-05",
          completionFrom: "2026-11-20",
          completionTo: "2026-12-04",
          adjustedReason: "Client availability.",
        },
      },
    });
    const after = JSON.stringify({
      implementations: fake.store["implementations"],
      work_items: fake.store["work_items"],
      stage_instances: fake.store["stage_instances"],
      portal_accounts: fake.store["portal_accounts"],
    });
    expect(after).toBe(snapshot);
    const row = (fake.store["scoping_answers"] ?? []).find(
      (r: any) => r.question_key === "kickoff_deck",
    ) as any;
    expect(row.value.schedule).toMatchObject({
      forms_finalised_on: "2026-10-05",
      completion_from: "2026-11-20",
      completion_to: "2026-12-04",
      adjusted_reason: "Client availability.",
    });
  });

  it("an invalid schedule is refused before anything is written", async () => {
    use(rows());
    await expect(
      saveKickoffDeck({
        actorProfileId: "profile-7",
        dealId: "deal-1",
        implementationId: "impl-2",
        choice: {
          deckType: "standard",
          formReady: false,
          schedule: {
            formsFinalisedOn: null,
            completionFrom: "2026-12-04",
            completionTo: "2026-11-20",
            adjustedReason: "x",
          },
        },
      }),
    ).rejects.toThrow(/end on or after/);
    expect(fake.store["scoping_answers"] ?? []).toEqual([]);
  });
});

describe("deck classification: a partner signal anywhere means the partner deck is chosen or held, never the standard", () => {
  it("a partner journey type on the implementation, with a direct journey template, is ambiguous and held", async () => {
    use(
      rows({
        implementations: [
          { ...rows()["implementations"]![0]!, journey_type: "partner_implementation" },
        ],
      }),
    );
    const view = await kickoffDeckView(args());
    expect(view.recommended.ambiguous).toBe(true);
    expect(view.selection).toBeNull();
    expect(kickoffDeckBlocked({ kickoffDeck: view })).toBe(true);
  });
});

describe("the plan's save accepts the stored SOW paragraph, and refuses a malformed one", () => {
  it("a stored paragraph from the SOW reading passes the timeline save", async () => {
    const { timelinePatchSchema } = await import("../intake-patch");
    const stored = sowIntake().timeline.sow_delivery;
    expect(stored).not.toBeNull();
    const r = timelinePatchSchema.shape.sow_delivery.safeParse(stored);
    expect(r.success, JSON.stringify(r.success ? null : r.error.issues)).toBe(true);
  });

  it("a paragraph with an unknown starting condition is refused, not silently kept", async () => {
    const { timelinePatchSchema } = await import("../intake-patch");
    const stored = { ...sowIntake().timeline.sow_delivery!, start_condition: "whenever" };
    expect(timelinePatchSchema.shape.sow_delivery.safeParse(stored).success).toBe(false);
  });
});

describe("Settings is the single source of the tier targets", () => {
  it("a changed Settings value changes the deck's tier date", async () => {
    use(
      rows({
        portal_app_config: [
          {
            key: "complexity_tiers",
            value: {
              tiers: [
                ...CONFIGURED_TIERS.tiers.filter((t) => t.tier !== 1),
                { tier: 1, name: "Standard", business_days: 20, qualifies: "" },
              ],
            },
          },
        ],
      }),
    );
    const view = await kickoffDeckView({
      ...args(tierIntake(1)),
    });
    expect(view.delivery?.suggestion.from).toBe(addBusinessDays("2026-08-20", 20));
  });

  it("with no tier configuration stored, the deck proposes nothing and names Settings", async () => {
    use(rows({ portal_app_config: [] }));
    const view = await kickoffDeckView({
      ...args(tierIntake(1)),
    });
    expect(view.loadError).toBeNull();
    expect(view.delivery?.suggestion.basis).toBe("none");
    expect(view.delivery?.suggestion.missing).toMatch(/set in Settings/);
  });

  it("a failed read of the Settings tiers is an explicit error, and the presentation is held", async () => {
    use(rows(), { portal_app_config: { message: "permission denied" } });
    const view = await kickoffDeckView(args(tierIntake(1)));
    expect(view.loadError).toMatch(/complexity tiers/);
    expect(kickoffDeckBlocked({ kickoffDeck: view })).toBe(true);
  });
});

describe("the signing start uses the recorded SOW signature date, never the close date", () => {
  const signingIntake = () =>
    readIntake({
      path: "new_logo",
      timeline: {
        services: [],
        holidays: [],
        sow_delivery: {
          quote: "The timeline is 4 to 6 weeks, commencing once the Agreement is signed.",
          duration_text: "4 to 6 weeks",
          duration_unit: "week",
          duration_min: 4,
          duration_max: 6,
          start_condition: "signing",
          start_text: "the Agreement is signed",
          dependencies: [],
        },
      },
    });

  it("with no recorded signature date, nothing is proposed and the close date is not used", async () => {
    use(rows());
    const view = await kickoffDeckView(args(signingIntake(), null));
    expect(view.delivery?.suggestion.from).toBeNull();
    expect(view.delivery?.suggestion.missing).toMatch(/signature date is not recorded/);
  });

  it("with a recorded signature date, the clock starts from it", async () => {
    use(rows());
    const view = await kickoffDeckView(args(signingIntake(), "2026-09-01"));
    expect(view.delivery?.suggestion.startDate).toBe("2026-09-01");
    expect(view.delivery?.suggestion.from).toBe("2026-09-29");
  });
});

describe("the SOW's business units survive the stored path", () => {
  it("a stored business-day duration is kept in business days through the view", async () => {
    use(rows());
    const intake = readIntake({
      path: "new_logo",
      timeline: {
        services: [],
        holidays: [],
        sow_delivery: {
          quote: "Delivery is estimated at 5 business days, commencing at kickoff.",
          duration_text: "5 business days",
          duration_unit: "business_day",
          duration_min: 5,
          duration_max: 5,
          start_condition: "kickoff",
          start_text: "kickoff",
          dependencies: [],
        },
      },
    });
    const view = await kickoffDeckView({ ...args(intake), kickoffDate: "2026-10-02" });
    expect(view.delivery?.suggestion.duration?.unit).toBe("business_day");
    expect(view.delivery?.suggestion.from).toBe("2026-10-09");
  });
});

describe("unclassified deals are flagged for TIS review, never given a tier-based date", () => {
  const TIER_FLAG = /Complexity tier unclassified/;

  it("a deal recorded as Tier 0 gets no tier date, even though Settings has a Tier 1 target", async () => {
    use(rows());
    const view = await kickoffDeckView(
      args(readIntake({ path: "new_logo", timeline: { services: [], holidays: [] } })),
    );
    expect(view.tier).toEqual({ number: null, status: "unclassified" });
    expect(view.delivery?.suggestion.basis).toBe("none");
    expect(view.delivery?.suggestion.from).toBeNull();
    expect(view.delivery?.suggestion.missing).toMatch(/unclassified/);
    expect(view.recommended.flags.some((f) => TIER_FLAG.test(f))).toBe(true);
  });

  it("a deal with no valid tier recorded is unclassified in the same way", async () => {
    use(rows());
    // An integration tier above the five Settings tiers is not a valid tier.
    const view = await kickoffDeckView(
      args(
        readIntake({
          path: "new_logo",
          timeline: { services: [], holidays: [], integration_tier: 9 },
        }),
      ),
    );
    expect(view.tier.status).toBe("unclassified");
    expect(view.delivery?.suggestion.from).toBeNull();
  });

  it("the flag reaches the TIS, and the unclassified deal's SOW timeline still counts", async () => {
    use(
      rows({
        scoping_answers: [
          savedRow({
            forms_finalised_on: "2026-10-05",
            completion_from: null,
            completion_to: null,
            adjusted_reason: null,
          }),
        ],
      }),
    );
    const view = await kickoffDeckView(args());
    expect(view.recommended.flags.some((f) => TIER_FLAG.test(f))).toBe(true);
    expect(view.delivery?.suggestion.basis).toBe("sow");
    expect(view.delivery?.suggestion.from).toBe("2026-11-02");
  });

  it("a recorded tier Settings has no target for is unconfigured, and says which tier", async () => {
    use(
      rows({
        portal_app_config: [
          {
            key: "complexity_tiers",
            value: { tiers: CONFIGURED_TIERS.tiers.filter((t) => t.tier !== 4) },
          },
        ],
      }),
    );
    const view = await kickoffDeckView(args(tierIntake(4)));
    expect(view.tier).toEqual({ number: 4, status: "unconfigured" });
    expect(view.delivery?.suggestion.from).toBeNull();
    expect(view.recommended.flags.join(" ")).toMatch(/no target for Tier 4/);
  });

  it("the recorded Tier 3 and Tier 5 take their own Settings targets", async () => {
    use(rows());
    const t3 = await kickoffDeckView(args(tierIntake(3)));
    expect(t3.tier).toEqual({ number: 3, status: "classified" });
    expect(t3.delivery?.suggestion.from).toBe(addBusinessDays("2026-08-20", 90));
    const t5 = await kickoffDeckView(args(tierIntake(5)));
    expect(t5.delivery?.suggestion.from).toBe(addBusinessDays("2026-08-20", 150));
  });

  it("a recorded Tier 1 is classified, with no flag", async () => {
    use(rows());
    const view = await kickoffDeckView(args(tierIntake(1)));
    expect(view.tier).toEqual({ number: 1, status: "classified" });
    expect(view.recommended.flags.some((f) => TIER_FLAG.test(f))).toBe(false);
  });
});
