import { describe, expect, it } from "vitest";

import { documentRefusal, readIntakeReading } from "../document-guard";

/**
 * Issue #80. Partner implementations get no standard kickoff deck and no
 * standard onboarding plan deck. Standard implementations are unchanged.
 */

const STANDARD = { journey_type: "new_logo", partner_key: null };
const PARTNER_BY_JOURNEY = { journey_type: "partner_implementation", partner_key: null };
const PARTNER_BY_KEY = { journey_type: null, partner_key: "field_fusion_iq" };

const BASE = { timeline: {}, ai_filled: [], person_set: [] };

describe("standard implementations generate both documents as before", () => {
  it.each(["kickoff-deck", "onboarding-plan"] as const)("allows the %s", (document) => {
    expect(documentRefusal(document, { implementation: STANDARD, intake: null })).toBeNull();
  });

  it("allows a standard deal that has no project yet", () => {
    expect(
      documentRefusal("kickoff-deck", {
        implementation: null,
        intake: { ...BASE, path: "new_logo", partner_implementation: null },
      }),
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
      intake: { ...BASE, path: "partner_implementation", partner_implementation: null },
    });
    expect(reason).not.toBeNull();
    expect(reason).toContain("partner deal");
  });

  it("refuses a partner intake even when a standard project is linked, rather than falling through", () => {
    const reason = documentRefusal("onboarding-plan", {
      implementation: STANDARD,
      intake: { ...BASE, path: "partner_implementation", partner_implementation: null },
    });
    expect(reason).not.toBeNull();
  });
});

describe("readIntakeReading: what the stored intake says", () => {
  it("reads a missing intake as absent, with nothing to refuse on", () => {
    expect(readIntakeReading(null)).toBe("absent");
    expect(readIntakeReading(undefined)).toBe("absent");
  });

  it("reads a valid intake with no partner classification as standard", () => {
    expect(readIntakeReading({ ...BASE, path: "new_logo" })).toBe("standard");
    expect(readIntakeReading({ ...BASE, path: "existing", partner_implementation: null })).toBe(
      "standard",
    );
  });

  it("reads a valid intake with no path recorded as standard, as the app's plan does", () => {
    expect(readIntakeReading({ ...BASE, path: null, partner_implementation: null })).toBe(
      "standard",
    );
    expect(readIntakeReading({})).toBe("standard");
  });

  it("reads an explicit partner path as partner", () => {
    expect(readIntakeReading({ ...BASE, path: "partner_implementation" })).toBe("partner");
  });

  it("reads an explicit partner key as partner, even with no path recorded", () => {
    expect(
      readIntakeReading({
        ...BASE,
        path: null,
        partner_implementation: { partner_key: "field_fusion_iq" },
      }),
    ).toBe("partner");
  });

  it("reads a legacy Field Fusion path as partner", () => {
    expect(readIntakeReading({ ...BASE, path: "field_fusion" })).toBe("partner");
  });

  it("reads an intake that does not parse, with no partner evidence, as malformed", () => {
    expect(readIntakeReading("not an intake")).toBe("malformed");
    expect(readIntakeReading({ ...BASE, path: "not_a_path" })).toBe("malformed");
    expect(readIntakeReading(["new_logo"])).toBe("malformed");
  });

  it("still reads partner evidence in an intake that does not parse", () => {
    expect(
      readIntakeReading({
        ...BASE,
        path: "partner_implementation",
        partner_implementation: { partner_key: "not_registered" },
      }),
    ).toBe("partner");
    expect(readIntakeReading({ ...BASE, path: "field_fusion", timeline: "broken" })).toBe(
      "partner",
    );
    expect(
      readIntakeReading({ path: "not_a_path", partner_implementation: { partner_key: "x" } }),
    ).toBe("partner");
  });
});

describe("a malformed intake is refused, never read as standard", () => {
  it.each(["kickoff-deck", "onboarding-plan"] as const)(
    "refuses the %s when a standard project exists",
    (document) => {
      const reason = documentRefusal(document, {
        implementation: STANDARD,
        intake: { path: "not_a_path" },
      });
      expect(reason).not.toBeNull();
      expect(reason).toContain("could not be read");
      expect(reason).toContain("cannot be ruled out as a partner deal");
    },
  );

  it.each(["kickoff-deck", "onboarding-plan"] as const)(
    "refuses the %s when no project exists",
    (document) => {
      expect(
        documentRefusal(document, { implementation: null, intake: "not an intake" }),
      ).toContain("could not be read");
    },
  );
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
