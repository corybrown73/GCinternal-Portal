import { describe, expect, it } from "vitest";

import { assigneeLabel, unlinkedStaffNote } from "@/lib/ticket-assignees";

const humanize = (r: string) => r.replace(/_/g, " ");

describe("assigneeLabel", () => {
  it("prefers the full name", () => {
    expect(
      assigneeLabel(
        { id: "1", email: "joy@example.com", full_name: "Joy Jenkins", role: "implementation" },
        humanize,
      ),
    ).toBe("Joy Jenkins · implementation");
  });

  it("falls back to the email when the name is missing or blank", () => {
    expect(
      assigneeLabel(
        { id: "1", email: "joy@example.com", full_name: null, role: "manager" },
        humanize,
      ),
    ).toBe("joy@example.com · manager");
    expect(
      assigneeLabel(
        { id: "1", email: "joy@example.com", full_name: "   ", role: "manager" },
        humanize,
      ),
    ).toBe("joy@example.com · manager");
  });
});

describe("unlinkedStaffNote", () => {
  // The reported bug: the picker offered 2 people while the directory held 13,
  // and the screen said nothing about the difference.
  it("explains the gap when the directory is larger than the pool", () => {
    const note = unlinkedStaffNote({ assignable: 2, directory: 13 });
    expect(note).toContain("2 of 13");
    expect(note).toContain("11 people");
    expect(note).toContain("sign in");
  });

  it("uses the singular for a gap of one", () => {
    expect(unlinkedStaffNote({ assignable: 12, directory: 13 })).toContain("1 person");
  });

  it("says nothing when everyone in the directory can be routed to", () => {
    expect(unlinkedStaffNote({ assignable: 13, directory: 13 })).toBeNull();
  });

  // A portal account without a directory row is legitimate, so a pool larger
  // than the directory is not a shortfall to report.
  it("says nothing when the pool is larger than the directory", () => {
    expect(unlinkedStaffNote({ assignable: 5, directory: 3 })).toBeNull();
  });

  it("is explicit when nobody at all can be a fallback", () => {
    expect(unlinkedStaffNote({ assignable: 0, directory: 13 })).toContain("Nobody");
  });
});
