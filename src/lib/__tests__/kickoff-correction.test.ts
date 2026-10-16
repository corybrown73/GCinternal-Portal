import { describe, expect, it } from "vitest";

import type { KickoffCorrection } from "../kickoff-held";
import { decideKickoffCorrection, sameCompleted } from "../kickoff-correction";

const DATE = "2026-09-25";
const held = { kickoff: DATE, intake_done: "2026-09-20" };
const later = { ...held, working: "2026-10-02" };

/** The page's view and the record now are the same unless a case changes one. */
function decide(
  correction: KickoffCorrection,
  over: Partial<Parameters<typeof decideKickoffCorrection>[0]> = {},
) {
  return decideKickoffCorrection({
    stage: "get_it_working",
    completed: held,
    correction,
    expected: { stage: "get_it_working", completed: held, kind: "auto" },
    confirmLaterWork: false,
    ...over,
  });
}

describe("sameCompleted", () => {
  it("ignores key order and compares dates exactly", () => {
    expect(
      sameCompleted({ a: "2026-01-01", b: "2026-01-02" }, { b: "2026-01-02", a: "2026-01-01" }),
    ).toBe(true);
    expect(sameCompleted({ a: "2026-01-01" }, { a: "2026-01-02" })).toBe(false);
    expect(sameCompleted({ a: "2026-01-01" }, { a: "2026-01-01", b: "2026-01-02" })).toBe(false);
  });
});

describe("decideKickoffCorrection", () => {
  it("allows the automatic correction when no later work exists", () => {
    expect(decide({ kind: "auto", date: DATE })).toEqual({ ok: true, laterTasksDone: 0 });
  });

  it("allows the automatic correction while the deal is still in Kickoff", () => {
    expect(
      decide(
        { kind: "auto", date: DATE },
        { stage: "kickoff", expected: { stage: "kickoff", completed: held, kind: "auto" } },
      ),
    ).toEqual({ ok: true, laterTasksDone: 0 });
  });

  it("refuses the later-work correction until it is confirmed, and keeps the later work", () => {
    const correction: KickoffCorrection = {
      kind: "confirm_later_work",
      date: DATE,
      laterTasksDone: 1,
    };
    expect(
      decide(correction, {
        completed: later,
        expected: { stage: "get_it_working", completed: later, kind: "confirm_later_work" },
      }),
    ).toEqual({ ok: false, reason: "needs_confirmation" });
  });

  it("allows the later-work correction once confirmed, and reports how many tasks stay", () => {
    const correction: KickoffCorrection = {
      kind: "confirm_later_work",
      date: DATE,
      laterTasksDone: 2,
    };
    expect(
      decide(correction, {
        completed: later,
        confirmLaterWork: true,
        expected: { stage: "get_it_working", completed: later, kind: "confirm_later_work" },
      }),
    ).toEqual({ ok: true, laterTasksDone: 2 });
  });

  it("blocks when a later stage is complete, whatever the client confirms", () => {
    const correction: KickoffCorrection = {
      kind: "blocked",
      date: DATE,
      completedStage: "get_it_working",
    };
    expect(decide(correction, { confirmLaterWork: true })).toEqual({
      ok: false,
      reason: "blocked",
      completedStage: "get_it_working",
    });
  });

  it("refuses when Kickoff is not held, and for partner implementations", () => {
    expect(decide({ kind: "not_held" })).toEqual({ ok: false, reason: "not_held" });
    expect(decide({ kind: "not_applicable" })).toEqual({ ok: false, reason: "not_applicable" });
  });

  it("is stale when the stage has moved since the page was shown", () => {
    expect(
      decide(
        { kind: "auto", date: DATE },
        {
          stage: "make_it_yours",
          expected: { stage: "get_it_working", completed: held, kind: "auto" },
        },
      ),
    ).toEqual({ ok: false, reason: "stale" });
  });

  it("is stale when the completion record has changed since the page was shown", () => {
    expect(
      decide(
        { kind: "auto", date: DATE },
        { completed: later, expected: { stage: "get_it_working", completed: held, kind: "auto" } },
      ),
    ).toEqual({ ok: false, reason: "stale" });
  });

  it("is stale when later work appeared after the page said there was none", () => {
    // The page offered the plain correction; the record now has later work.
    expect(
      decide(
        { kind: "confirm_later_work", date: DATE, laterTasksDone: 1 },
        {
          completed: later,
          confirmLaterWork: true,
          expected: { stage: "get_it_working", completed: later, kind: "auto" },
        },
      ),
    ).toEqual({ ok: false, reason: "stale" });
  });

  it("is stale when the page offered a later-work confirmation that is no longer needed", () => {
    expect(
      decide(
        { kind: "auto", date: DATE },
        {
          completed: held,
          confirmLaterWork: true,
          expected: { stage: "get_it_working", completed: later, kind: "confirm_later_work" },
        },
      ),
    ).toEqual({ ok: false, reason: "stale" });
  });

  it("reports a later stage as blocked even when the page showed the old outcome", () => {
    // A later stage completed from facts outside the record: the block is the truth.
    expect(
      decide(
        { kind: "blocked", date: DATE, completedStage: "make_it_yours" },
        { expected: { stage: "get_it_working", completed: held, kind: "auto" } },
      ),
    ).toEqual({ ok: false, reason: "blocked", completedStage: "make_it_yours" });
  });
});
