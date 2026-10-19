import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  commitmentState,
  customerCommitmentView,
  customerStatusLabel,
  isCustomerVisibleCommitment,
  isOutstandingCommitment,
} from "../commitment-status";
import { COMMITMENT_STATUSES } from "../delivery-input";

/**
 * Issue #81's final rule: a renegotiated commitment stays outstanding until it
 * is actually delivered. Open, missed and renegotiated are outstanding; met and
 * fulfilled are completed; cancelled is withdrawn. Nothing here changes what
 * the customer sees, and no stored record is rewritten.
 */
describe("commitmentState", () => {
  it("reads the accepted vocabulary as the rule says", () => {
    expect(Object.fromEntries(COMMITMENT_STATUSES.map((s) => [s, commitmentState(s)]))).toEqual({
      open: "outstanding",
      met: "completed",
      missed: "outstanding",
      renegotiated: "outstanding",
    });
  });

  it("reads fulfilled as completed, and cancelled as withdrawn", () => {
    expect(commitmentState("fulfilled")).toBe("completed");
    expect(commitmentState("cancelled")).toBe("withdrawn");
  });

  it("is not case-sensitive", () => {
    expect(commitmentState("MET")).toBe("completed");
    expect(commitmentState("Cancelled")).toBe("withdrawn");
    expect(commitmentState("Renegotiated")).toBe("outstanding");
  });

  it("counts an unrecognised, null or empty status as outstanding", () => {
    expect(commitmentState("sort_of_done_ish")).toBe("outstanding");
    expect(commitmentState(null)).toBe("outstanding");
    expect(commitmentState(undefined)).toBe("outstanding");
    expect(commitmentState("")).toBe("outstanding");
  });

  it("is outstanding only when still owed", () => {
    expect(isOutstandingCommitment("renegotiated")).toBe(true);
    expect(isOutstandingCommitment("missed")).toBe(true);
    expect(isOutstandingCommitment("open")).toBe(true);
    expect(isOutstandingCommitment("met")).toBe(false);
    expect(isOutstandingCommitment("fulfilled")).toBe(false);
    expect(isOutstandingCommitment("cancelled")).toBe(false);
  });
});

/**
 * The internal surfaces must read commitment status through this module, not
 * compare against the legacy words themselves. This guard fails if one of them
 * starts doing its own check again.
 */
describe("internal surfaces read commitment status through the shared rule", () => {
  const ROOT = join(__dirname, "..", "..", "..");
  const surfaces = [
    "src/lib/hub.server.ts",
    "src/lib/home-today.ts",
    "src/lib/home-triage.ts",
    "src/lib/calendar-events.ts",
    "src/lib/customer360-derive.ts",
  ];

  for (const rel of surfaces) {
    it(`${rel} does not compare commitment status to the legacy words itself`, () => {
      const source = readFileSync(join(ROOT, rel), "utf8");
      // Comparing or querying status against a legacy word (display labels and comments are fine).
      expect(source).not.toMatch(/status\s*===?\s*["'](fulfilled|cancelled)["']/);
      expect(source).not.toMatch(/["']status["']\s*,\s*["'](fulfilled|cancelled)["']/);
    });
  }
});

/** What a customer is told about each status (#81, customer-facing). */
describe("customerStatusLabel", () => {
  it("words each accepted and legacy status the way the customer sees it", () => {
    expect(customerStatusLabel("met")).toBe("Done");
    expect(customerStatusLabel("fulfilled")).toBe("Done");
    expect(customerStatusLabel("cancelled")).toBe("Withdrawn");
    expect(customerStatusLabel("renegotiated")).toBe("Renegotiated — Outstanding");
    expect(customerStatusLabel("missed")).toBe("Missed — Outstanding");
    expect(customerStatusLabel("open")).toBe("Outstanding");
  });

  it("shows an unknown or missing status as Outstanding, not as nothing", () => {
    expect(customerStatusLabel("sort_of_done_ish")).toBe("Outstanding");
    expect(customerStatusLabel(null)).toBe("Outstanding");
  });
});

describe("isCustomerVisibleCommitment", () => {
  it("hides a commitment made to our own team, whatever the case or spacing", () => {
    expect(isCustomerVisibleCommitment("internal")).toBe(false);
    expect(isCustomerVisibleCommitment("Internal")).toBe(false);
    expect(isCustomerVisibleCommitment("  internal ")).toBe(false);
  });

  it("shows a commitment to the customer, or to a named party", () => {
    expect(isCustomerVisibleCommitment("customer")).toBe(true);
    expect(isCustomerVisibleCommitment("Ada")).toBe(true);
    expect(isCustomerVisibleCommitment(null)).toBe(true);
  });
});

describe("customerCommitmentView", () => {
  const TODAY = "2026-10-19";

  it("treats met as Done even with no date, and never overdue", () => {
    expect(customerCommitmentView({ status: "met", due_date: null }, TODAY)).toEqual({
      state: "completed",
      done: true,
      status_label: "Done",
      overdue: false,
    });
    expect(customerCommitmentView({ status: "met", due_date: "2020-01-01" }, TODAY).overdue).toBe(
      false,
    );
  });

  it("never shows a withdrawn commitment as owed or overdue", () => {
    const v = customerCommitmentView({ status: "cancelled", due_date: "2020-01-01" }, TODAY);
    expect(v.state).toBe("withdrawn");
    expect(v.done).toBe(false);
    expect(v.overdue).toBe(false);
  });

  it("keeps a renegotiated commitment outstanding, whatever its completion date", () => {
    const v = customerCommitmentView({ status: "renegotiated", due_date: "2020-01-01" }, TODAY);
    expect(v.state).toBe("outstanding");
    expect(v.done).toBe(false);
    expect(v.overdue).toBe(true);
  });

  it("is overdue only when its due day is before today, on the shared day basis", () => {
    expect(customerCommitmentView({ status: "open", due_date: TODAY }, TODAY).overdue).toBe(false);
    expect(customerCommitmentView({ status: "open", due_date: "2026-10-18" }, TODAY).overdue).toBe(
      true,
    );
    expect(customerCommitmentView({ status: "open", due_date: null }, TODAY).overdue).toBe(false);
  });
});
