import { describe, expect, it } from "vitest";

import type { KickoffCorrection } from "../kickoff-held";
import { decideKickoffCorrection, sameJson } from "../kickoff-correction";

const DATE = "2026-09-25";
const held = { kickoff: DATE, intake_done: "2026-09-20" };
const later = { ...held, working: "2026-10-02" };
const intakeWith = (completed: Record<string, string>, over: Record<string, unknown> = {}) => ({
  path: "new_logo",
  timeline: { completed },
  ...over,
});

/** The page's view and the deal now are the same unless a case changes one. */
function decide(
  correction: KickoffCorrection,
  over: Partial<Parameters<typeof decideKickoffCorrection>[0]> = {},
) {
  const intake = intakeWith(held);
  return decideKickoffCorrection({
    stage: "get_it_working",
    intake,
    correction,
    expected: { stage: "get_it_working", intake, kind: "auto" },
    confirmLaterWork: false,
    ...over,
  });
}

describe("sameJson", () => {
  it("ignores object key order, as the stored jsonb does", () => {
    expect(sameJson({ a: "1", b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: "1" })).toBe(true);
  });

  it("compares arrays in order and values exactly", () => {
    expect(sameJson([1, 2], [2, 1])).toBe(false);
    expect(sameJson({ a: "2026-01-01" }, { a: "2026-01-02" })).toBe(false);
  });

  it("treats a missing key and a null key as different", () => {
    expect(sameJson({ a: 1 }, { a: 1, b: null })).toBe(false);
    expect(sameJson({ a: null }, { a: undefined })).toBe(false);
  });
});

describe("decideKickoffCorrection", () => {
  it("allows the automatic correction when no later work exists", () => {
    expect(decide({ kind: "auto", date: DATE })).toEqual({ ok: true, laterTasksDone: 0 });
  });

  it("allows the automatic correction while the deal is still in Kickoff", () => {
    const intake = intakeWith(held);
    expect(
      decide(
        { kind: "auto", date: DATE },
        { stage: "kickoff", expected: { stage: "kickoff", intake, kind: "auto" } },
      ),
    ).toEqual({ ok: true, laterTasksDone: 0 });
  });

  it("refuses the later-work correction until it is confirmed, and keeps the later work", () => {
    const intake = intakeWith(later);
    expect(
      decide(
        { kind: "confirm_later_work", date: DATE, laterTasksDone: 1 },
        { intake, expected: { stage: "get_it_working", intake, kind: "confirm_later_work" } },
      ),
    ).toEqual({ ok: false, reason: "needs_confirmation" });
  });

  it("allows the later-work correction once confirmed, and reports how many tasks stay", () => {
    const intake = intakeWith(later);
    expect(
      decide(
        { kind: "confirm_later_work", date: DATE, laterTasksDone: 2 },
        {
          intake,
          confirmLaterWork: true,
          expected: { stage: "get_it_working", intake, kind: "confirm_later_work" },
        },
      ),
    ).toEqual({ ok: true, laterTasksDone: 2 });
  });

  it("blocks when a later stage is complete, whatever the client confirms", () => {
    expect(
      decide(
        { kind: "blocked", date: DATE, completedStage: "get_it_working" },
        { confirmLaterWork: true },
      ),
    ).toEqual({ ok: false, reason: "blocked", completedStage: "get_it_working" });
  });

  it("refuses when Kickoff is not held, and for partner implementations", () => {
    expect(decide({ kind: "not_held" })).toEqual({ ok: false, reason: "not_held" });
    expect(decide({ kind: "not_applicable" })).toEqual({ ok: false, reason: "not_applicable" });
  });

  it("is stale when the stage has moved since the page was shown", () => {
    const intake = intakeWith(held);
    expect(
      decide(
        { kind: "auto", date: DATE },
        { stage: "make_it_yours", expected: { stage: "get_it_working", intake, kind: "auto" } },
      ),
    ).toEqual({ ok: false, reason: "stale" });
  });

  it("is stale when the completion record has changed since the page was shown", () => {
    const intake = intakeWith(held);
    expect(
      decide(
        { kind: "auto", date: DATE },
        {
          intake: intakeWith(later),
          expected: { stage: "get_it_working", intake, kind: "auto" },
        },
      ),
    ).toEqual({ ok: false, reason: "stale" });
  });

  it("is stale when the intake changed outside the completion record", () => {
    // The Complete stage's outcome is read from the intake too: a write that
    // is not a completion tick still changes the decision, so it must refuse.
    const before = intakeWith(held, { outcome: null });
    expect(
      decide(
        { kind: "auto", date: DATE },
        {
          stage: "onboarding_complete",
          intake: intakeWith(held, {
            outcome: { kind: "proven", reason: null, at: "2026-10-01T00:00:00Z", by: null },
          }),
          expected: { stage: "onboarding_complete", intake: before, kind: "auto" },
        },
      ),
    ).toEqual({ ok: false, reason: "stale" });
  });

  it("is stale when later work appeared after the page said there was none", () => {
    const intake = intakeWith(held);
    expect(
      decide(
        { kind: "confirm_later_work", date: DATE, laterTasksDone: 1 },
        {
          intake: intakeWith(later),
          confirmLaterWork: true,
          expected: { stage: "get_it_working", intake, kind: "auto" },
        },
      ),
    ).toEqual({ ok: false, reason: "stale" });
  });

  it("is stale when the page offered a later-work confirmation that is no longer needed", () => {
    const intake = intakeWith(later);
    expect(
      decide(
        { kind: "auto", date: DATE },
        {
          confirmLaterWork: true,
          expected: { stage: "get_it_working", intake, kind: "confirm_later_work" },
        },
      ),
    ).toEqual({ ok: false, reason: "stale" });
  });

  it("reports a later stage as blocked even when the page showed the old outcome", () => {
    // A later stage completed from the record: the block is the truth, not the stale page.
    const intake = intakeWith(held);
    expect(
      decide(
        { kind: "blocked", date: DATE, completedStage: "make_it_yours" },
        { expected: { stage: "get_it_working", intake, kind: "auto" } },
      ),
    ).toEqual({ ok: false, reason: "blocked", completedStage: "make_it_yours" });
  });
});
