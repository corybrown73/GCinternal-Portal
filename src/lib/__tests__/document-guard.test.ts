import { describe, expect, it } from "vitest";

import { documentRefusal } from "../document-guard";

/**
 * Issue #80. Partner implementations get no standard kickoff deck and no
 * standard onboarding plan deck. Standard implementations are unchanged.
 */

const STANDARD = { journey_type: "new_logo", partner_key: null };
const PARTNER_BY_JOURNEY = { journey_type: "partner_implementation", partner_key: null };
const PARTNER_BY_KEY = { journey_type: null, partner_key: "field_fusion_iq" };

describe("standard implementations generate both documents as before", () => {
  it.each(["kickoff-deck", "onboarding-plan"] as const)("allows the %s", (document) => {
    expect(documentRefusal(document, { implementation: STANDARD, intake: null })).toBeNull();
  });

  it("allows a standard deal that has no project yet", () => {
    expect(
      documentRefusal("kickoff-deck", { implementation: null, intake: { path: "new_logo" } }),
    ).toBeNull();
  });

  it("allows a deal with neither a project nor an intake to judge", () => {
    expect(documentRefusal("onboarding-plan", { implementation: null, intake: null })).toBeNull();
  });
});

describe("a partner identified by journey type is refused", () => {
  it.each(["kickoff-deck", "onboarding-plan"] as const)("refuses the %s", (document) => {
    const reason = documentRefusal(document, { implementation: PARTNER_BY_JOURNEY, intake: null });
    expect(reason).not.toBeNull();
    expect(reason).toContain("partner implementation");
    expect(reason).toContain("partner journey");
  });
});

describe("a partner identified by partner key is refused", () => {
  it.each(["kickoff-deck", "onboarding-plan"] as const)("refuses the %s", (document) => {
    const reason = documentRefusal(document, { implementation: PARTNER_BY_KEY, intake: null });
    expect(reason).not.toBeNull();
    expect(reason).toContain("partner implementation");
  });
});

describe("a partner deal before its project exists is refused too", () => {
  it("refuses on the intake path, so a standard deck cannot be drawn ahead of the start", () => {
    const reason = documentRefusal("kickoff-deck", {
      implementation: null,
      intake: { path: "partner_implementation" },
    });
    expect(reason).not.toBeNull();
    expect(reason).toContain("partner deal");
  });

  it("refuses a partner intake even when a standard project is linked, rather than falling through", () => {
    const reason = documentRefusal("onboarding-plan", {
      implementation: STANDARD,
      intake: { path: "partner_implementation" },
    });
    expect(reason).not.toBeNull();
  });
});

describe("the refusal says what it means in plain words", () => {
  it("names the document and points to where the partner planning lives", () => {
    const reason = documentRefusal("kickoff-deck", {
      implementation: PARTNER_BY_KEY,
      intake: null,
    });
    expect(reason).toBe(
      "No kickoff deck is generated for a partner implementation. Its planning is the partner journey, shown in Current Implementation, so there is no standard kickoff deck to make.",
    );
  });
});
