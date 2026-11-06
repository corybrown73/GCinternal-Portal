import { describe, expect, it } from "vitest";

import { canChangeKickoffHeld, kickoffHeldBasis, kickoffHeldChanged } from "../kickoff-authority";

const impl = { hasImplementation: true };
const OWNER = "tm-owner";
const OTHER = "tm-other";

describe("management roles act on any post-sale implementation", () => {
  for (const role of ["super_admin", "admin", "manager"]) {
    it(`${role} may act without being the owner, and it is attributed to management`, () => {
      expect(
        kickoffHeldBasis({ role, actorTeamMemberId: OTHER, ownerTeamMemberId: OWNER, ...impl }),
      ).toBe("management");
      // An unassigned implementation is still a post-sale one for management.
      expect(
        kickoffHeldBasis({ role, actorTeamMemberId: null, ownerTeamMemberId: null, ...impl }),
      ).toBe("management");
    });
  }
});

describe("the implementation role acts only as the assigned primary TIS", () => {
  it("may act on an implementation they own", () => {
    expect(
      kickoffHeldBasis({
        role: "implementation",
        actorTeamMemberId: OWNER,
        ownerTeamMemberId: OWNER,
        ...impl,
      }),
    ).toBe("assigned_tis");
  });

  it("is refused on another specialist's implementation", () => {
    expect(
      canChangeKickoffHeld({
        role: "implementation",
        actorTeamMemberId: OTHER,
        ownerTeamMemberId: OWNER,
        ...impl,
      }),
    ).toBe(false);
  });

  it("is refused on an unassigned implementation, and when it has no team record", () => {
    expect(
      canChangeKickoffHeld({
        role: "implementation",
        actorTeamMemberId: OWNER,
        ownerTeamMemberId: null,
        ...impl,
      }),
    ).toBe(false);
    expect(
      canChangeKickoffHeld({
        role: "implementation",
        actorTeamMemberId: null,
        ownerTeamMemberId: null,
        ...impl,
      }),
    ).toBe(false);
  });
});

describe("every other role gains no additional permission", () => {
  for (const role of ["sales", "am", "se", "tam_se", "onboarding", "customer", "unknown"]) {
    it(`${role} is refused even on an implementation it is named against`, () => {
      expect(
        canChangeKickoffHeld({ role, actorTeamMemberId: OWNER, ownerTeamMemberId: OWNER, ...impl }),
      ).toBe(false);
    });
  }

  it("a null role is refused", () => {
    expect(
      canChangeKickoffHeld({
        role: null,
        actorTeamMemberId: OWNER,
        ownerTeamMemberId: OWNER,
        ...impl,
      }),
    ).toBe(false);
  });
});

describe("with no implementation there is nothing to attribute", () => {
  it("refuses every role", () => {
    for (const role of ["super_admin", "admin", "manager", "implementation"]) {
      expect(
        canChangeKickoffHeld({
          role,
          actorTeamMemberId: OWNER,
          ownerTeamMemberId: OWNER,
          hasImplementation: false,
        }),
      ).toBe(false);
    }
  });
});

describe("a change to the held state", () => {
  it("is a change when a hold is recorded or taken back, and not otherwise", () => {
    expect(kickoffHeldChanged(undefined, "2026-11-06")).toBe(true);
    expect(kickoffHeldChanged("2026-11-06", undefined)).toBe(true);
    expect(kickoffHeldChanged("2026-11-06", "2026-11-07")).toBe(false);
    expect(kickoffHeldChanged(undefined, null)).toBe(false);
  });
});
