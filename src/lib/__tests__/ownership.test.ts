import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCOPE,
  defaultScopeFor,
  describeScope,
  isCovering,
  isOwnedBy,
  matchesScope,
  parseScope,
  scopeParam,
  scopeWasSpecified,
  type OwnershipFacts,
  type Viewer,
} from "../ownership";

const TEYA: Viewer = {
  profileId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  teamMemberId: "11111111-1111-4111-8111-111111111111",
  name: "Teya",
};
const RAJ: Viewer = {
  profileId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  teamMemberId: "22222222-2222-4222-8222-222222222222",
  name: "Raj",
};

const facts = (over: Partial<OwnershipFacts> = {}): OwnershipFacts => ({
  implementationOwnerId: null,
  csmOwnerId: null,
  amOwnerProfileId: null,
  seOwnerProfileId: null,
  ...over,
});

describe("parseScope", () => {
  it("defaults to mine", () => {
    expect(parseScope(null)).toEqual(DEFAULT_SCOPE);
    expect(parseScope(undefined)).toEqual(DEFAULT_SCOPE);
    expect(parseScope("")).toEqual(DEFAULT_SCOPE);
    expect(parseScope("mine")).toEqual(DEFAULT_SCOPE);
  });

  it("reads all", () => {
    expect(parseScope("all")).toEqual({ mode: "all", personId: null });
    expect(parseScope("ALL")).toEqual({ mode: "all", personId: null });
  });

  it("reads a specific owner", () => {
    expect(parseScope(`owner:${RAJ.teamMemberId}`)).toEqual({
      mode: "person",
      personId: RAJ.teamMemberId,
    });
  });

  it("falls back to MINE, never to all, on anything it does not understand", () => {
    // A typo in a shared link should show somebody less than they expected,
    // never more.
    for (const bad of ["everything", "owner:", "owner:not-a-uuid", "team:1", "  ", "*"]) {
      expect(parseScope(bad), bad).toEqual(DEFAULT_SCOPE);
    }
  });

  it("round-trips through scopeParam", () => {
    for (const s of [
      DEFAULT_SCOPE,
      { mode: "all" as const, personId: null },
      { mode: "person" as const, personId: RAJ.teamMemberId },
    ]) {
      expect(parseScope(scopeParam(s))).toEqual(s);
    }
  });

  it("leaves the default off the URL", () => {
    expect(scopeParam(DEFAULT_SCOPE)).toBeNull();
  });
});

describe("isOwnedBy", () => {
  it("matches the delivery lead", () => {
    expect(isOwnedBy(facts({ implementationOwnerId: TEYA.teamMemberId }), TEYA)).toBe(true);
  });

  it("matches the CSM owner", () => {
    expect(isOwnedBy(facts({ csmOwnerId: TEYA.teamMemberId }), TEYA)).toBe(true);
  });

  it("matches the AM and the SE, who are profile ids not team ids", () => {
    // The schema keeps two owner vocabularies. An SE with an empty dashboard
    // because only team_members counted is the bug this test exists for.
    expect(isOwnedBy(facts({ amOwnerProfileId: TEYA.profileId }), TEYA)).toBe(true);
    expect(isOwnedBy(facts({ seOwnerProfileId: TEYA.profileId }), TEYA)).toBe(true);
  });

  it("does not match somebody else's account", () => {
    expect(isOwnedBy(facts({ implementationOwnerId: RAJ.teamMemberId }), TEYA)).toBe(false);
    expect(isOwnedBy(facts({ seOwnerProfileId: RAJ.profileId }), TEYA)).toBe(false);
  });

  it("does not match an unowned account", () => {
    expect(isOwnedBy(facts(), TEYA)).toBe(false);
  });

  it("never matches on a null team_member id", () => {
    // Somebody with no team_members row must not suddenly own every account
    // whose owner_id is also null.
    const noTeamRow: Viewer = { ...TEYA, teamMemberId: null };
    expect(isOwnedBy(facts(), noTeamRow)).toBe(false);
    expect(isOwnedBy(facts({ implementationOwnerId: null }), noTeamRow)).toBe(false);
  });
});

describe("matchesScope", () => {
  const mine = DEFAULT_SCOPE;
  const all = { mode: "all" as const, personId: null };
  const raj = { mode: "person" as const, personId: RAJ.teamMemberId };

  it("all matches everything, including unowned", () => {
    expect(matchesScope(facts(), all, TEYA)).toBe(true);
    expect(matchesScope(facts({ implementationOwnerId: RAJ.teamMemberId }), all, TEYA)).toBe(true);
  });

  it("mine matches only the viewer's own", () => {
    expect(matchesScope(facts({ csmOwnerId: TEYA.teamMemberId }), mine, TEYA)).toBe(true);
    expect(matchesScope(facts({ csmOwnerId: RAJ.teamMemberId }), mine, TEYA)).toBe(false);
  });

  it("covering for a named person uses all four fields when they are resolved", () => {
    expect(matchesScope(facts({ seOwnerProfileId: RAJ.profileId }), raj, TEYA, RAJ)).toBe(true);
  });

  it("covering falls back to the team fields only, never wider, without a resolved person", () => {
    expect(matchesScope(facts({ implementationOwnerId: RAJ.teamMemberId }), raj, TEYA, null)).toBe(
      true,
    );
    // Narrower, deliberately: with no resolved profile this cannot be matched,
    // and answering "yes" would be a guess in the direction of showing more.
    expect(matchesScope(facts({ seOwnerProfileId: RAJ.profileId }), raj, TEYA, null)).toBe(false);
  });

  it("a person scope with no id behaves as mine", () => {
    const broken = { mode: "person" as const, personId: null };
    expect(matchesScope(facts({ csmOwnerId: TEYA.teamMemberId }), broken, TEYA)).toBe(true);
    expect(matchesScope(facts({ csmOwnerId: RAJ.teamMemberId }), broken, TEYA)).toBe(false);
  });
});

describe("describeScope", () => {
  it("always names whose book is on screen", () => {
    // A filtered list that does not say it is filtered is how somebody
    // concludes an account was deleted.
    expect(describeScope(DEFAULT_SCOPE, TEYA)).toBe("Teya's accounts");
    expect(describeScope({ mode: "all", personId: null }, TEYA)).toBe("All accounts");
    expect(describeScope({ mode: "person", personId: RAJ.teamMemberId }, TEYA, "Raj")).toBe(
      "Raj's accounts",
    );
  });

  it("still says something useful when the name is unknown", () => {
    expect(describeScope({ mode: "person", personId: RAJ.teamMemberId }, TEYA, null)).toBe(
      "One owner's accounts",
    );
  });
});

describe("isCovering", () => {
  it("is true only for somebody else's book", () => {
    expect(isCovering(DEFAULT_SCOPE)).toBe(false);
    expect(isCovering({ mode: "all", personId: null })).toBe(false);
    expect(isCovering({ mode: "person", personId: RAJ.teamMemberId })).toBe(true);
  });
});

describe("scopeWasSpecified", () => {
  it("separates an absent scope from an explicit one", () => {
    // parseScope folds both into MINE, which is right for reading a URL and
    // wrong for choosing a default. This is the distinction that makes an
    // explicit ?scope=mine survive.
    expect(scopeWasSpecified(null)).toBe(false);
    expect(scopeWasSpecified(undefined)).toBe(false);
    expect(scopeWasSpecified("")).toBe(false);
    expect(scopeWasSpecified("   ")).toBe(false);
    expect(scopeWasSpecified("mine")).toBe(true);
    expect(scopeWasSpecified("all")).toBe(true);
  });
});

describe("defaultScopeFor", () => {
  it("shows everything to someone who owns nothing", () => {
    // THE BUG. The only account with a login owns nothing, so every screen
    // opened reading zero against nine live implementations.
    expect(defaultScopeFor({ ownsAnything: false, isAdmin: false })).toEqual({
      mode: "all",
      personId: null,
    });
  });

  it("shows everything to an admin even when they do own accounts", () => {
    // An admin is here to see across the team; their own book is the unusual
    // view for them, not the default one.
    expect(defaultScopeFor({ ownsAnything: true, isAdmin: true })).toEqual({
      mode: "all",
      personId: null,
    });
  });

  it("still lands an ordinary owner on their own book", () => {
    // The whole point of the feature for the people it was built for — a TIS
    // opening the app should see their projects, not all forty.
    expect(defaultScopeFor({ ownsAnything: true, isAdmin: false })).toEqual(DEFAULT_SCOPE);
  });
});
