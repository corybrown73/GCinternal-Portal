import { describe, expect, it } from "vitest";

import { signedInProfileId, signedInTeamMemberId } from "../session-identity";

/** Issue #83, Part 1. Identity is read from the session, and an unusable one is refused or treated as absent. */

const USER = "11111111-1111-4111-8111-111111111111";
const TM = "77777777-7777-4777-8777-777777777771";

describe("signedInProfileId", () => {
  it("returns the session's user id", () => {
    expect(signedInProfileId({ id: USER })).toBe(USER);
  });

  it.each([undefined, null, {}, { id: "" }, { id: "not-an-id" }, { id: 7 }])(
    "refuses a session with no usable id (%j)",
    (profile) => {
      expect(() => signedInProfileId(profile as never)).toThrow(/no signed-in user/);
    },
  );
});

describe("signedInTeamMemberId", () => {
  it("returns the linked team member", () => {
    expect(signedInTeamMemberId({ team_member_id: TM })).toBe(TM);
  });

  it.each([
    undefined,
    null,
    {},
    { team_member_id: null },
    { team_member_id: "" },
    { team_member_id: "x" },
  ])("treats a missing or unusable link (%j) as no link", (profile) => {
    expect(signedInTeamMemberId(profile as never)).toBeNull();
  });
});
