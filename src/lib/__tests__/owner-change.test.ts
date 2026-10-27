import { describe, expect, it } from "vitest";

import {
  OWNER_CHANGE_REASONS,
  OWNER_CHANGE_REASON_LABEL,
  ownerChangeFrom,
  ownerChangeFromRaw,
  ownerChangeReasonInput,
} from "../owner-change";

/**
 * The reasons an owner may be changed for. One vocabulary for the screens, the
 * server and the ledger, so a reason means the same thing wherever it is recorded.
 */
describe("the reasons for changing an owner", () => {
  it("offers the five agreed reasons, each with a label", () => {
    expect(OWNER_CHANGE_REASONS).toEqual([
      "tis_leave",
      "workload",
      "customer_escalation",
      "coverage",
      "other",
    ]);
    for (const code of OWNER_CHANGE_REASONS) expect(OWNER_CHANGE_REASON_LABEL[code]).toBeTruthy();
  });

  it("requires a reason code", () => {
    expect(ownerChangeReasonInput.safeParse({ reason: "back soon" }).success).toBe(false);
    expect(ownerChangeReasonInput.safeParse({ reasonCode: "bored" }).success).toBe(false);
    expect(ownerChangeReasonInput.safeParse({ reasonCode: "tis_leave" }).success).toBe(true);
  });

  it("needs a few words when the reason is Other, and not otherwise", () => {
    expect(ownerChangeReasonInput.safeParse({ reasonCode: "other", reason: "  " }).success).toBe(
      false,
    );
    expect(ownerChangeReasonInput.safeParse({ reasonCode: "other" }).success).toBe(false);
    expect(
      ownerChangeReasonInput.safeParse({ reasonCode: "other", reason: "Cover for the partner" })
        .success,
    ).toBe(true);
    expect(ownerChangeReasonInput.safeParse({ reasonCode: "workload" }).success).toBe(true);
  });

  it("keeps the reason to 500 characters", () => {
    expect(
      ownerChangeReasonInput.safeParse({ reasonCode: "other", reason: "x".repeat(501) }).success,
    ).toBe(false);
  });
});

describe("a reason sent with a change", () => {
  it("is absent when none was sent: a system change, which needs no reason", () => {
    expect(ownerChangeFromRaw(undefined)).toBeNull();
    expect(ownerChangeFromRaw(null)).toBeNull();
  });

  it("is checked when sent, and refused with a sentence when incomplete", () => {
    expect(() => ownerChangeFromRaw({ reasonCode: "other" })).toThrow(
      "Say why, in a few words, when the reason is Other.",
    );
    expect(() => ownerChangeFromRaw({ reasonCode: "nope" })).toThrow();
  });

  it("is stored as a code and the words, with blank words becoming none", () => {
    expect(ownerChangeFromRaw({ reasonCode: "coverage", reason: "  " })).toEqual({
      reasonCode: "coverage",
      reason: null,
    });
    expect(ownerChangeFrom({ reasonCode: "workload", reason: " Spread the Acme load " })).toEqual({
      reasonCode: "workload",
      reason: "Spread the Acme load",
    });
  });
});
