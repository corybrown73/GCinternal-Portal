import { describe, expect, it } from "vitest";
import { stageSegments, type HistoryRow } from "../signals/stage-history";

/**
 * The load-bearing rule of Phase 6: only a RECORDED transition is an
 * observation, and every row that produced no observation is named rather than
 * quietly dropped. These tests pin both halves.
 */

const row = (over: Partial<HistoryRow> & { stage: string }): HistoryRow => ({
  implementation_id: "impl-1",
  entered_at: "2026-01-01T00:00:00.000Z",
  exited_at: null,
  ...over,
});

const NOW = new Date("2026-03-01T00:00:00.000Z");

describe("stageSegments", () => {
  it("counts a closed transition as an observation, in whole days", () => {
    const out = stageSegments(
      [
        row({
          stage: "build",
          entered_at: "2026-01-01T00:00:00Z",
          exited_at: "2026-01-11T00:00:00Z",
        }),
      ],
      NOW,
    );
    expect(out.completed).toHaveLength(1);
    expect(out.completed[0]?.days).toBe(10);
    expect(out.completed[0]?.stage).toBe("build");
    expect(out.excluded).toHaveLength(0);
  });

  it("never treats an open stage as a dwell, but reports it as current", () => {
    // "So far" is not a duration. Counting it would make the slowest work look
    // fastest, which is exactly backwards.
    const out = stageSegments([row({ stage: "build", entered_at: "2026-02-01T00:00:00Z" })], NOW);
    expect(out.completed).toHaveLength(0);
    expect(out.open).toHaveLength(1);
    expect(out.open[0]?.days_so_far).toBe(28);
    expect(out.excluded_by_reason.still_open).toBe(1);
  });

  it("aliases legacy stage spellings forward instead of discarding real history", () => {
    const out = stageSegments(
      [
        row({
          stage: "prove-value",
          entered_at: "2026-01-01T00:00:00Z",
          exited_at: "2026-01-03T00:00:00Z",
        }),
      ],
      NOW,
    );
    expect(out.completed[0]?.stage).toBe("adopt");
  });

  it("excludes a pre-sales stage from the post-sale lifecycle, and names why", () => {
    const out = stageSegments(
      [
        row({
          stage: "qualify",
          entered_at: "2026-01-01T00:00:00Z",
          exited_at: "2026-01-05T00:00:00Z",
        }),
      ],
      NOW,
    );
    expect(out.completed).toHaveLength(0);
    expect(out.excluded_by_reason.stage_not_in_lifecycle).toBe(1);
    expect(out.excluded[0]?.stage).toBe("qualify");
  });

  it("refuses an exit recorded before its entry rather than averaging the defect in", () => {
    // implementation_stage_history has no DB guard, so this row can exist.
    const out = stageSegments(
      [
        row({
          stage: "build",
          entered_at: "2026-02-01T00:00:00Z",
          exited_at: "2026-01-01T00:00:00Z",
        }),
      ],
      NOW,
    );
    expect(out.completed).toHaveLength(0);
    expect(out.excluded_by_reason.impossible_interval).toBe(1);
  });

  it("keeps a zero-day transition — someone really did click through in a day", () => {
    const out = stageSegments(
      [
        row({
          stage: "handoff",
          entered_at: "2026-01-01T09:00:00Z",
          exited_at: "2026-01-01T17:00:00Z",
        }),
      ],
      NOW,
    );
    expect(out.completed).toHaveLength(1);
    expect(out.completed[0]?.days).toBe(0);
  });

  it("accounts for every row it read", () => {
    const out = stageSegments(
      [
        row({
          stage: "handoff",
          entered_at: "2026-01-01T00:00:00Z",
          exited_at: "2026-01-02T00:00:00Z",
        }),
        row({ stage: "build" }),
        row({
          stage: "scoping",
          entered_at: "2025-12-01T00:00:00Z",
          exited_at: "2025-12-09T00:00:00Z",
        }),
      ],
      NOW,
    );
    expect(out.rows_read).toBe(3);
    expect(out.completed.length + out.excluded.length).toBe(3);
  });
});
