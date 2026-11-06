import { describe, expect, it } from "vitest";

import { canChangeKickoffHeld, kickoffHeldChanged } from "../kickoff-authority";

describe("who may record the kickoff as held", () => {
  it("allows the assigned TIS", () => {
    expect(
      canChangeKickoffHeld({
        actorTeamMemberId: "tm-1",
        ownerTeamMemberId: "tm-1",
        hasImplementation: true,
      }),
    ).toBe(true);
  });

  it("refuses another specialist, an unassigned implementation, and a person with no team record", () => {
    expect(
      canChangeKickoffHeld({
        actorTeamMemberId: "tm-2",
        ownerTeamMemberId: "tm-1",
        hasImplementation: true,
      }),
    ).toBe(false);
    expect(
      canChangeKickoffHeld({
        actorTeamMemberId: "tm-1",
        ownerTeamMemberId: null,
        hasImplementation: true,
      }),
    ).toBe(false);
    expect(
      canChangeKickoffHeld({
        actorTeamMemberId: null,
        ownerTeamMemberId: null,
        hasImplementation: true,
      }),
    ).toBe(false);
  });

  it("refuses when there is no implementation to be assigned to", () => {
    expect(
      canChangeKickoffHeld({
        actorTeamMemberId: "tm-1",
        ownerTeamMemberId: "tm-1",
        hasImplementation: false,
      }),
    ).toBe(false);
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
