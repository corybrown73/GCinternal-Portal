import { describe, expect, it } from "vitest";
import { TERMINAL_STATUSES, openItems, waitingOn } from "../customer360-derive";
import {
  ESCALATION_STATUSES,
  ISSUE_STATUSES,
  RISK_STATUSES,
  COMMITMENT_STATUSES,
} from "../delivery-input";
import { commitmentState } from "../commitment-status";

/**
 * These four tables each have their OWN status vocabulary. Treating them as one
 * blended list is what let "met" fall through: it was absent from the exclusion
 * list, so every commitment that had actually been met still counted as open —
 * on Home, on the 360, in derived health and in Leadership. Meanwhile the list
 * excluded "fulfilled" and "done", which no commitment can ever be.
 *
 * The first test is the anti-drift guard: it fails when someone adds a status to
 * a write-path enum without deciding whether it is terminal.
 */

// Commitments have their own rule (commitment-status.ts), tested below.
const WRITE_PATH_ENUMS = {
  risks: RISK_STATUSES,
  issues: ISSUE_STATUSES,
  escalations: ESCALATION_STATUSES,
} as const;

/** Every status the write paths allow, minus the ones we call terminal. */
const OPEN_STATUSES = {
  risks: ["open"],
  issues: ["open", "in_progress"],
  escalations: ["open", "in_progress"],
} as const;

const rec = (over: Record<string, unknown[]>) =>
  ({
    commitments: [],
    risks: [],
    issues: [],
    escalations: [],
    decisions: [],
    milestones: [],
    stage_history: [],
    approvals: [],
    ...over,
  }) as never;

describe("open-item status vocabularies", () => {
  it("classifies every commitment status the write path can produce, and invents none", () => {
    // Every accepted commitment status has exactly one state, so none is unclassified.
    const states = Object.fromEntries(COMMITMENT_STATUSES.map((s) => [s, commitmentState(s)]));
    expect(states).toEqual({
      open: "outstanding",
      met: "completed",
      missed: "outstanding",
      renegotiated: "outstanding",
    });
  });

  it("classifies every status the other write paths can produce, and invents none", () => {
    for (const kind of Object.keys(WRITE_PATH_ENUMS) as Array<keyof typeof WRITE_PATH_ENUMS>) {
      const allowed = [...WRITE_PATH_ENUMS[kind]] as string[];
      const terminal = [...TERMINAL_STATUSES[kind]] as string[];
      const open = [...OPEN_STATUSES[kind]] as string[];

      // Nothing we call terminal is a status the table cannot hold.
      for (const t of terminal)
        expect(allowed, `${kind}: "${t}" is not a real status`).toContain(t);
      // Together they account for the whole vocabulary — no status is unclassified.
      expect([...terminal, ...open].sort()).toEqual([...allowed].sort());
    }
  });

  it("does not count a met commitment as open", () => {
    const commitments = [
      { id: "a", status: "open", description: "Send the data map" },
      { id: "b", status: "met", description: "Kickoff scheduled" },
    ];
    expect(openItems(rec({ commitments })).commitments.map((c: any) => c.id)).toEqual(["a"]);
  });

  it("keeps a missed or renegotiated commitment open — the obligation is still owed", () => {
    const commitments = [
      { id: "m", status: "missed" },
      { id: "r", status: "renegotiated" },
    ];
    expect(openItems(rec({ commitments })).commitments).toHaveLength(2);
  });

  it("keeps an in-progress issue or escalation open, and drops a resolved one", () => {
    const issues = [
      { id: "i1", status: "in_progress" },
      { id: "i2", status: "resolved" },
    ];
    const escalations = [
      { id: "e1", status: "in_progress" },
      { id: "e2", status: "resolved" },
    ];
    const open = openItems(rec({ issues, escalations }));
    expect(open.issues.map((r: any) => r.id)).toEqual(["i1"]);
    expect(open.escalations.map((r: any) => r.id)).toEqual(["e1"]);
  });

  it("drops mitigated, accepted and closed risks", () => {
    const risks = ["open", "mitigated", "accepted", "closed"].map((status, i) => ({
      id: String(i),
      status,
    }));
    expect(openItems(rec({ risks })).risks.map((r: any) => r.id)).toEqual(["0"]);
  });

  it("applies the same vocabularies inside waitingOn, not just openItems", () => {
    // waitingOn is the cross-surface backbone: a met commitment leaking through
    // here would make the product say someone owes a move they already made.
    const met = waitingOn({
      technical_solutions: [],
      approvals: [],
      commitments: [{ id: "b", status: "met", due_date: "2020-01-01" }],
      risks: [],
      issues: [],
      escalations: [],
      decisions: [],
    });
    const still = waitingOn({
      technical_solutions: [],
      approvals: [],
      commitments: [{ id: "a", status: "open", due_date: "2020-01-01" }],
      risks: [],
      issues: [],
      escalations: [],
      decisions: [],
    });
    // The met one must not produce the same waiting-on answer as the open one.
    expect(met).not.toEqual(still);
  });
});

describe("an unrecognised status", () => {
  /**
   * The deliberate choice, recorded here so it is not re-decided by accident:
   * a status outside the table's vocabulary counts as OPEN.
   *
   * It is the safe direction. An item nobody can classify should surface for a
   * human to look at, not vanish from every count. Treating the unknown as
   * closed is how a record quietly stops existing because someone typo'd a
   * status — and "quietly dying, and why" is the exact thing this product is
   * for. Failing loud costs one line of noise; failing quiet costs the account.
   */
  it("counts as open rather than disappearing", () => {
    const rows = [{ id: "weird", status: "sort_of_done_ish" }];
    expect(openItems(rec({ risks: rows })).risks).toHaveLength(1);
    expect(openItems(rec({ commitments: rows })).commitments).toHaveLength(1);
    expect(openItems(rec({ issues: rows })).issues).toHaveLength(1);
    expect(openItems(rec({ escalations: rows })).escalations).toHaveLength(1);
  });

  it("treats a null or empty status as open too", () => {
    expect(openItems(rec({ risks: [{ id: "a", status: null }] })).risks).toHaveLength(1);
    expect(openItems(rec({ risks: [{ id: "b", status: "" }] })).risks).toHaveLength(1);
  });
});

describe("commitments on the Customer 360", () => {
  const dueInPast = "2020-01-01";

  it("does not count a fulfilled or cancelled commitment as open (issue #81)", () => {
    const open = openItems(
      rec({
        commitments: [
          { id: "f", status: "fulfilled", due_date: dueInPast },
          { id: "c", status: "cancelled", due_date: dueInPast },
          { id: "o", status: "open", due_date: dueInPast },
        ],
      }),
    );
    expect(open.commitments.map((c: any) => c.id)).toEqual(["o"]);
  });

  it("keeps a missed or renegotiated commitment open until it is delivered", () => {
    const open = openItems(
      rec({
        commitments: [
          { id: "m", status: "missed", due_date: dueInPast },
          { id: "r", status: "renegotiated", due_date: dueInPast },
        ],
      }),
    );
    expect(open.commitments.map((c: any) => c.id)).toEqual(["m", "r"]);
  });

  it("never treats a past-due fulfilled or cancelled commitment as waiting on anyone", () => {
    const waiting = (status: string) =>
      waitingOn({
        technical_solutions: [],
        approvals: [],
        commitments: [
          {
            id: "x",
            status,
            due_date: dueInPast,
            committed_to: "customer",
            description: "Send the map",
          },
        ],
        risks: [],
        issues: [],
        escalations: [],
        decisions: [],
      });
    expect(waiting("fulfilled").party).not.toBe("customer");
    expect(waiting("cancelled").party).not.toBe("customer");
    expect(waiting("renegotiated").party).toBe("customer");
  });
});
