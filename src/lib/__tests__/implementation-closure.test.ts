import { describe, expect, it } from "vitest";

import {
  canCloseImplementation,
  CLOSED_BADGE,
  CLOSURE_EXPLANATION,
  closureInput,
  closureSummary,
  isClosed,
  openOnly,
} from "../implementation-closure";
import { workloadByOwner } from "../claimed-owner";

const OWNER = "b0000000-0000-4000-8000-000000000003";
const OTHER = "b0000000-0000-4000-8000-000000000004";
const IMPL = "d0000000-0000-4000-8000-000000000001";

describe("who may close an implementation mirrors the database rule", () => {
  const may = (over: Partial<Parameters<typeof canCloseImplementation>[0]>) =>
    canCloseImplementation({ role: "se", teamMemberId: OWNER, ownerTeamMemberId: OWNER, ...over });

  it("lets a manager, an admin and a super admin close any implementation", () => {
    for (const role of ["manager", "admin", "super_admin"]) {
      expect(may({ role, teamMemberId: null, ownerTeamMemberId: OTHER })).toBe(true);
    }
  });

  it("lets the assigned technical specialist close their own implementation", () => {
    for (const role of ["se", "tam_se", "implementation"]) {
      expect(may({ role })).toBe(true);
    }
  });

  it("does not let a specialist close someone else's implementation", () => {
    expect(may({ role: "se", ownerTeamMemberId: OTHER })).toBe(false);
  });

  it("does not let an unowned specialist close anything", () => {
    expect(may({ role: "se", ownerTeamMemberId: null })).toBe(false);
    expect(may({ role: "se", teamMemberId: null, ownerTeamMemberId: null })).toBe(false);
  });

  it("does not let sales or an account manager close, even as the owner", () => {
    expect(may({ role: "sales" })).toBe(false);
    expect(may({ role: "am" })).toBe(false);
  });

  it("never offers closure for an implementation already closed, or for no signed-in role", () => {
    expect(may({ role: "manager", closedAt: "2026-10-21T10:00:00Z" })).toBe(false);
    expect(may({ role: null })).toBe(false);
    expect(may({ role: undefined })).toBe(false);
  });
});

describe("the closing form", () => {
  const base = { implementationId: IMPL, reason: "implementation_not_required" as const };

  it("requires a real explanation, trimmed", () => {
    expect(closureInput.safeParse({ ...base, note: "   " }).success).toBe(false);
    expect(closureInput.safeParse({ ...base, note: "" }).success).toBe(false);
    expect(closureInput.parse({ ...base, note: "  Customer runs it in-house.  " }).note).toBe(
      "Customer runs it in-house.",
    );
  });

  it("accepts only the reason on the list", () => {
    expect(closureInput.safeParse({ ...base, note: "ok", reason: "graduated" }).success).toBe(
      false,
    );
  });

  it("refuses an explanation past the limit", () => {
    expect(closureInput.safeParse({ ...base, note: "x".repeat(501) }).success).toBe(false);
  });
});

describe("what a closed implementation says about itself", () => {
  it("is open, with no label, when it has no closure time", () => {
    expect(closureSummary({ closed_at: null })).toBeNull();
    expect(isClosed({ closed_at: null })).toBe(false);
  });

  it("carries the exact badge, the reason, the note and the day", () => {
    expect(
      closureSummary({
        closed_at: "2026-10-21T10:15:00.000Z",
        closure_reason: "implementation_not_required",
        closure_note: "Customer runs it in-house.",
      }),
    ).toEqual({
      badge: "Closed — Implementation Not Required",
      reason: "Implementation not required",
      note: "Customer runs it in-house.",
      closedOn: "2026-10-21",
    });
    expect(CLOSED_BADGE).toBe("Closed — Implementation Not Required");
  });

  it("never reports an unrecognised reason as a real one", () => {
    expect(
      closureSummary({ closed_at: "2026-10-21T10:00:00Z", closure_reason: "graduated" })?.reason,
    ).toBe("Not recorded");
  });

  it("says plainly that closing is not graduating", () => {
    expect(CLOSURE_EXPLANATION).toMatch(/without completing or graduating it/);
    expect(CLOSURE_EXPLANATION).toMatch(/sales outcome does not change/);
  });
});

describe("closed implementations leave the active lists", () => {
  it("keeps only the open rows", () => {
    const rows = [
      { id: "a", closed_at: null },
      { id: "b", closed_at: "2026-10-21T10:00:00Z" },
      { id: "c" },
    ];
    expect(openOnly(rows).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("drops a closed implementation from what its owner carries", () => {
    const counts = workloadByOwner([
      { ownerId: OWNER, stage: "build", superseded: false, closed: false, is_test: false },
      { ownerId: OWNER, stage: "build", superseded: false, closed: true, is_test: false },
      { ownerId: OWNER, stage: "handoff", superseded: false, is_test: false },
    ]);
    expect(counts.get(OWNER)).toBe(2);
  });
});
