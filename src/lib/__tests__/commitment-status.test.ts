import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { commitmentState, isOutstandingCommitment } from "../commitment-status";
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
