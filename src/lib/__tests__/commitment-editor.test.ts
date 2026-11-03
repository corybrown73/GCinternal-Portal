import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  commitmentInput,
  commitmentStatusChange,
  commitmentStatusChoices,
  commitmentStatusLabel,
  toCommitmentPatch,
  updateCommitmentInput,
} from "../delivery-input";

/**
 * The commitment editor accepts every status a row can hold, so a commitment
 * stored under an older word can still be edited and is saved back unchanged.
 */
const base = {
  description: "Send the rollout checklist",
  committedTo: "customer" as const,
  ownerId: null,
  madeBy: null,
  dueDate: "2026-09-01",
  fulfilledAt: null,
};

describe("commitment editor vocabulary", () => {
  for (const status of ["fulfilled", "cancelled"] as const) {
    it(`a stored '${status}' row passes validation and is saved back unchanged`, () => {
      const parsed = commitmentInput.parse({ ...base, status });
      expect(parsed.status).toBe(status);
      expect(toCommitmentPatch(parsed).status).toBe(status);
      expect(
        updateCommitmentInput.safeParse({
          ...base,
          status,
          id: "00000000-0000-4000-8000-000000000001",
        }).success,
      ).toBe(true);
    });
  }

  it("still accepts the current choices and refuses an invented one", () => {
    for (const status of ["open", "met", "missed", "renegotiated"]) {
      expect(commitmentInput.safeParse({ ...base, status }).success).toBe(true);
    }
    expect(commitmentInput.safeParse({ ...base, status: "done" }).success).toBe(false);
  });

  it("offers Open, Done (stored as met), Missed, Renegotiated, Cancelled", () => {
    const choices = commitmentStatusChoices("open");
    expect(choices).toEqual(["open", "met", "missed", "renegotiated", "cancelled"]);
    expect(choices.map(commitmentStatusLabel)).toEqual([
      "Open",
      "Done",
      "Missed",
      "Renegotiated",
      "Cancelled",
    ]);
  });

  it("shows a stored 'fulfilled' as Done without rewriting it", () => {
    const choices = commitmentStatusChoices("fulfilled");
    expect(choices).toEqual(["open", "fulfilled", "missed", "renegotiated", "cancelled"]);
    expect(choices).not.toContain("met");
    expect(commitmentStatusLabel("fulfilled")).toBe("Done");
  });

  it("stamps today when Done is chosen with no fulfilled date, and keeps a date already set", () => {
    const today = "2026-10-21";
    expect(commitmentStatusChange({ fulfilledAt: "" }, "met", today)).toEqual({
      status: "met",
      fulfilledAt: today,
    });
    expect(commitmentStatusChange({ fulfilledAt: "2026-10-01" }, "met", today)).toEqual({
      status: "met",
    });
    expect(commitmentStatusChange({ fulfilledAt: "" }, "missed", today)).toEqual({
      status: "missed",
    });
    expect(commitmentStatusChange({ fulfilledAt: "" }, "cancelled", today)).toEqual({
      status: "cancelled",
    });
  });
});

describe("Details panel Overdue badge", () => {
  it("reads outstanding through the shared rule, not the raw 'open' status", () => {
    const source = readFileSync(
      join(__dirname, "..", "..", "routes", "customers.$customerId.tsx"),
      "utf8",
    );
    expect(source).toContain("isOutstandingCommitment(c.status) && isOverdue(c.due_date)");
    expect(source).not.toMatch(/c\.status\s*===\s*["']open["']\s*&&\s*isOverdue/);
  });
});
