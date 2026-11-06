import { describe, expect, it } from "vitest";

import {
  canConfigureKickoffDeck,
  CORE_SLIDE_KEYS,
  OPTIONAL_SLIDE_KEYS,
  defaultSelection,
  isKickoffDeckOnlyPatch,
  mergeKickoffDeck,
  moveWithinZone,
  presentedSlideKeys,
  recommendKickoffSlides,
  resolveKickoffSelection,
  type KickoffFacts,
  type SavedKickoffDeck,
} from "../kickoff-slides";

const NEW_CUSTOMER: KickoffFacts = {
  path: "new_logo",
  trainingOnly: false,
  expansion: false,
  partnerLed: false,
  partnerName: null,
  services: [],
  solutionsInvolved: null,
  firstFormNamed: true,
  firstFormConfirmed: true,
  hasImplementation: true,
};
const facts = (over: Partial<KickoffFacts>): KickoffFacts => ({ ...NEW_CUSTOMER, ...over });
const has = (rec: ReturnType<typeof recommendKickoffSlides>, key: string) =>
  rec.included.includes(key);

describe("training-only", () => {
  const rec = recommendKickoffSlides(
    facts({
      path: "existing",
      trainingOnly: true,
      expansion: false,
      firstFormNamed: false,
      firstFormConfirmed: false,
      services: [{ kind: "training", name: "Crew training" }],
    }),
  );
  it("includes training and enablement, and never recommends form building", () => {
    expect(has(rec, "kickoff-training")).toBe(true);
    expect(has(rec, "kickoff-form-v1")).toBe(false);
    expect(has(rec, "kickoff-workflow")).toBe(false);
  });
  it("says why training is in", () => {
    expect(rec.reasons["kickoff-training"]).toMatch(/Training only/);
  });
  it("has no purchased-solutions slide when only training was bought", () => {
    expect(has(rec, "kickoff-purchased")).toBe(false);
  });
});

describe("new customer with purchased solutions", () => {
  const rec = recommendKickoffSlides(
    facts({
      services: [
        { kind: "paid_form", name: "Inspection form" },
        { kind: "integration", name: "Salesforce" },
        { kind: "training", name: "Crew training" },
      ],
    }),
  );
  it("includes the purchased deliverables, the form and its workflow, training and responsibilities", () => {
    for (const key of [
      "kickoff-purchased",
      "kickoff-form-v1",
      "kickoff-workflow",
      "kickoff-training",
      "kickoff-communication",
    ]) {
      expect(has(rec, key), key).toBe(true);
    }
  });
  it("is not a partner deck", () => {
    expect(has(rec, "kickoff-partner")).toBe(false);
  });
  it("has no flags when everything is confirmed", () => {
    expect(rec.flags).toEqual([]);
  });
});

describe("existing customer adding solutions", () => {
  const rec = recommendKickoffSlides(
    facts({
      path: "existing",
      expansion: true,
      firstFormNamed: false,
      firstFormConfirmed: false,
      solutionsInvolved: true,
      services: [{ kind: "integration", name: "QuickBooks" }],
    }),
  );
  it("focuses on the added scope and the workflows it depends on", () => {
    expect(has(rec, "kickoff-purchased")).toBe(true);
    expect(has(rec, "kickoff-workflow")).toBe(true);
    expect(rec.reasons["kickoff-workflow"]).toMatch(/existing workflows/);
  });
  it("avoids first-time onboarding content: no training, no form build", () => {
    expect(has(rec, "kickoff-training")).toBe(false);
    expect(has(rec, "kickoff-form-v1")).toBe(false);
  });
});

describe("partner implementation", () => {
  it("includes the partner slide, and purchased solutions too: scope and partner are not exclusive", () => {
    const rec = recommendKickoffSlides(
      facts({
        path: "partner_implementation",
        partnerLed: true,
        partnerName: "Field Fusion IQ",
        expansion: false,
        services: [{ kind: "integration", name: "Dispatch" }],
      }),
    );
    expect(has(rec, "kickoff-partner")).toBe(true);
    expect(has(rec, "kickoff-purchased")).toBe(true);
    expect(rec.flags.some((f) => /partner is not named/.test(f))).toBe(false);
  });

  it("flags a partner-led deal whose partner is not named, rather than naming one", () => {
    const rec = recommendKickoffSlides(facts({ partnerLed: true, partnerName: null }));
    expect(has(rec, "kickoff-partner")).toBe(true);
    expect(rec.flags.join(" ")).toMatch(/partner is not named/);
  });
});

describe("a free form, where the entitlement is confirmed", () => {
  it("includes the form and its workflow when a paid form was bought", () => {
    const rec = recommendKickoffSlides(
      facts({ firstFormConfirmed: false, services: [{ kind: "paid_form", name: "Form" }] }),
    );
    expect(has(rec, "kickoff-form-v1")).toBe(true);
    expect(has(rec, "kickoff-workflow")).toBe(true);
  });
  it("leaves the form out when the first form was only read from the paperwork, and says so", () => {
    const rec = recommendKickoffSlides(facts({ firstFormNamed: true, firstFormConfirmed: false }));
    expect(has(rec, "kickoff-form-v1")).toBe(false);
    expect(rec.flags.join(" ")).toMatch(/read from the paperwork and is not confirmed/);
  });
});

describe("missing and conflicting information is flagged, never assumed", () => {
  it("flags an unset account type, and treats it as a new customer, saying so", () => {
    const rec = recommendKickoffSlides(facts({ path: null }));
    expect(rec.flags.join(" ")).toMatch(/account type is not set/);
    expect(has(rec, "kickoff-training")).toBe(true);
  });

  it("does not invent purchased solutions when it is not known whether any were sold", () => {
    const rec = recommendKickoffSlides(facts({ solutionsInvolved: null, services: [] }));
    expect(has(rec, "kickoff-purchased")).toBe(false);
    expect(rec.flags.join(" ")).toMatch(/Whether solutions were sold is not recorded/);
  });

  it("flags solutions sold with none listed", () => {
    const rec = recommendKickoffSlides(facts({ solutionsInvolved: true, services: [] }));
    expect(has(rec, "kickoff-purchased")).toBe(false);
    expect(rec.flags.join(" ")).toMatch(/none are listed/);
  });

  it("flags a new customer with no first form named, and leaves the form out", () => {
    const rec = recommendKickoffSlides(facts({ firstFormNamed: false, firstFormConfirmed: false }));
    expect(has(rec, "kickoff-form-v1")).toBe(false);
    expect(rec.flags.join(" ")).toMatch(/No first form is named/);
  });

  it("flags training-only that contradicts a paid form, and keeps the form out", () => {
    const rec = recommendKickoffSlides(
      facts({ trainingOnly: true, services: [{ kind: "paid_form", name: "Form" }] }),
    );
    expect(has(rec, "kickoff-form-v1")).toBe(false);
    expect(rec.flags.join(" ")).toMatch(/Training only is set, but a paid form/);
  });

  it("flags a deal with no implementation, which cannot be saved", () => {
    const rec = recommendKickoffSlides(facts({ hasImplementation: false }));
    expect(rec.flags.join(" ")).toMatch(/cannot be saved/);
  });
});

describe("the saved selection takes precedence over the recommendation", () => {
  const rec = recommendKickoffSlides(
    facts({ services: [{ kind: "integration", name: "Dispatch" }] }),
  );

  it("uses the saved selection even when a new recommendation would differ", () => {
    const saved = {
      included: ["kickoff-training"],
      order: [
        "kickoff-training",
        "kickoff-workflow",
        "kickoff-purchased",
        "kickoff-partner",
        "kickoff-communication",
        "kickoff-form-v1",
      ],
    };
    const sel = resolveKickoffSelection(saved, rec);
    expect(sel.included).toEqual(["kickoff-training"]);
    expect(sel.included).not.toContain("kickoff-purchased");
  });

  it("keeps the order the TIS chose", () => {
    const saved = {
      included: ["kickoff-workflow", "kickoff-purchased"],
      order: [
        "kickoff-purchased",
        "kickoff-workflow",
        "kickoff-partner",
        "kickoff-training",
        "kickoff-communication",
        "kickoff-form-v1",
      ],
    };
    expect(resolveKickoffSelection(saved, rec).included).toEqual([
      "kickoff-purchased",
      "kickoff-workflow",
    ]);
  });

  it("drops unknown keys and cannot remove a core slide", () => {
    const saved = {
      included: ["kickoff-cover", "not-a-slide", "kickoff-purchased"],
      order: ["kickoff-purchased"],
    };
    const sel = resolveKickoffSelection(saved, rec);
    expect(sel.included).toEqual(["kickoff-purchased"]);
    expect(sel.order).not.toContain("not-a-slide");
  });

  it("falls back to the recommendation when nothing is saved", () => {
    expect(resolveKickoffSelection(null, rec)).toEqual(defaultSelection(rec));
  });
});

describe("the presented order keeps the narrative", () => {
  it("always starts with the core opening and ends with the core close", () => {
    const keys = presentedSlideKeys(defaultSelection(recommendKickoffSlides(facts({}))));
    expect(keys[0]).toBe("kickoff-cover");
    expect(keys[1]).toBe("kickoff-achieve");
    expect(keys[keys.length - 1]).toBe("kickoff-next");
    expect(keys).toContain("kickoff-journey");
  });

  it("places the before-journey slides before the journey, and the after-journey slides after it", () => {
    const keys = presentedSlideKeys({
      included: ["kickoff-workflow", "kickoff-training"],
      order: [...OPTIONAL_SLIDE_KEYS],
    });
    expect(keys.indexOf("kickoff-workflow")).toBeLessThan(keys.indexOf("kickoff-journey"));
    expect(keys.indexOf("kickoff-training")).toBeGreaterThan(keys.indexOf("kickoff-journey"));
  });

  it("shows only the selected slides, with every core slide still present, in narrative order", () => {
    const keys = presentedSlideKeys({ included: [], order: [...OPTIONAL_SLIDE_KEYS] });
    expect(keys).toEqual(["kickoff-cover", "kickoff-achieve", "kickoff-journey", "kickoff-next"]);
  });
});

describe("reordering never disrupts the core narrative", () => {
  const order = [
    "kickoff-workflow",
    "kickoff-purchased",
    "kickoff-partner",
    "kickoff-training",
    "kickoff-communication",
    "kickoff-form-v1",
  ];

  it("moves a slide within its own zone", () => {
    expect(moveWithinZone(order, "kickoff-purchased", -1)).toEqual([
      "kickoff-purchased",
      "kickoff-workflow",
      "kickoff-partner",
      "kickoff-training",
      "kickoff-communication",
      "kickoff-form-v1",
    ]);
  });

  it("does not move a slide past its zone boundary", () => {
    expect(moveWithinZone(order, "kickoff-partner", 1)).toEqual(order);
    expect(moveWithinZone(order, "kickoff-training", -1)).toEqual(order);
  });

  it("never moves a core slide", () => {
    expect(moveWithinZone([...order, "kickoff-cover"], "kickoff-cover", -1)).toEqual([
      ...order,
      "kickoff-cover",
    ]);
  });
});

describe("saving is per implementation", () => {
  const a: SavedKickoffDeck = {
    included: ["kickoff-training"],
    order: [],
    saved_at: "2026-11-06",
    saved_by: "p1",
  };
  const b: SavedKickoffDeck = {
    included: ["kickoff-purchased"],
    order: [],
    saved_at: "2026-11-06",
    saved_by: "p2",
  };

  it("saving one implementation leaves another's selection as it was", () => {
    const merged = mergeKickoffDeck({ "impl-a": a }, { "impl-b": b });
    expect(merged["impl-a"]).toEqual(a);
    expect(merged["impl-b"]).toEqual(b);
  });

  it("a null removes only that implementation's selection", () => {
    const merged = mergeKickoffDeck({ "impl-a": a, "impl-b": b }, { "impl-a": null });
    expect(merged).toEqual({ "impl-b": b });
  });

  it("a deck-only save is recognised, so it can skip the journey work", () => {
    expect(isKickoffDeckOnlyPatch({ kickoff_deck: {} })).toBe(true);
    expect(isKickoffDeckOnlyPatch({ kickoff_deck: {}, timeline: {} })).toBe(false);
    expect(isKickoffDeckOnlyPatch({})).toBe(false);
  });
});

describe("who may configure a Kickoff deck", () => {
  for (const role of ["super_admin", "admin", "manager"]) {
    it(`${role} may configure any implementation, without being its owner`, () => {
      expect(
        canConfigureKickoffDeck({ role, actorTeamMemberId: "tm-x", ownerTeamMemberId: "tm-owner" }),
      ).toBe(true);
    });
  }
  it("an implementation specialist may configure only their assigned implementation", () => {
    expect(
      canConfigureKickoffDeck({
        role: "implementation",
        actorTeamMemberId: "tm-owner",
        ownerTeamMemberId: "tm-owner",
      }),
    ).toBe(true);
    expect(
      canConfigureKickoffDeck({
        role: "implementation",
        actorTeamMemberId: "tm-other",
        ownerTeamMemberId: "tm-owner",
      }),
    ).toBe(false);
    expect(
      canConfigureKickoffDeck({
        role: "implementation",
        actorTeamMemberId: "tm-other",
        ownerTeamMemberId: null,
      }),
    ).toBe(false);
    expect(
      canConfigureKickoffDeck({
        role: "implementation",
        actorTeamMemberId: null,
        ownerTeamMemberId: null,
      }),
    ).toBe(false);
  });
  for (const role of ["sales", "am", "se", "tam_se", "onboarding", "customer", null]) {
    it(`${String(role)} gets no deck authority, even as the named owner`, () => {
      expect(
        canConfigureKickoffDeck({
          role,
          actorTeamMemberId: "tm-owner",
          ownerTeamMemberId: "tm-owner",
        }),
      ).toBe(false);
    });
  }
});
