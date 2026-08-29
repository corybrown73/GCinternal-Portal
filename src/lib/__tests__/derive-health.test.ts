import { describe, expect, it } from "vitest";
import { deriveHealth } from "../customer360-derive";
import { normalizeStage } from "../hub-format";

const emptyRecord = {
  commitments: [],
  risks: [],
  issues: [],
  escalations: [],
  milestones: [],
} as any;

describe("deriveHealth", () => {
  it("returns no_signal with zero signals", () => {
    const { level } = deriveHealth(emptyRecord, {});
    expect(level).toBe("no_signal");
  });

  it("blocks on a critical open escalation, with a reason naming it", () => {
    const record = {
      ...emptyRecord,
      escalations: [{ status: "open", severity: "critical", title: "Exec escalation" }],
    };
    const { level, reason } = deriveHealth(record, {});
    expect(level).toBe("blocked");
    expect(reason).toContain("Exec escalation");
  });

  it("does not block on resolved escalations (history counts as signal, so on_track)", () => {
    const record = {
      ...emptyRecord,
      escalations: [{ status: "resolved", severity: "critical", title: "Done" }],
    };
    expect(deriveHealth(record, {}).level).toBe("on_track");
  });

  it("flags at_risk on a high-severity open risk", () => {
    const record = {
      ...emptyRecord,
      risks: [{ status: "open", severity: "high", likelihood: "likely", title: "Data risk" }],
    };
    const { level, reason } = deriveHealth(record, {});
    expect(level).toBe("at_risk");
    expect(reason).toContain("Data risk");
  });
});

describe("normalizeStage", () => {
  it("normalizes underscores and case", () => {
    expect(normalizeStage("Graduate_To_CS")).toBe("graduate-to-cs");
  });

  it("returns null for unknown vocab instead of guessing", () => {
    expect(normalizeStage("totally-made-up")).toBeNull();
    expect(normalizeStage(null)).toBeNull();
  });
});

describe("deriveHealth evidence", () => {
  it("names the rule that decided, and carries the deciding row", () => {
    const record = {
      ...emptyRecord,
      escalations: [{ id: "e1", status: "open", severity: "critical", title: "Exec escalation" }],
    };
    const { level, evidence } = deriveHealth(record, {});
    expect(level).toBe("blocked");
    expect(evidence.rule).toBe("escalation_blocked");
    expect(evidence.top_escalation).toEqual({
      id: "e1",
      severity: "critical",
      title: "Exec escalation",
    });
  });

  it("records counts alongside the deciding row, so the snapshot explains itself", () => {
    const record = {
      ...emptyRecord,
      risks: [
        { id: "r1", status: "open", severity: "high", likelihood: "likely", title: "Data risk" },
        { id: "r2", status: "open", severity: "low", title: "Minor" },
      ],
    };
    const { evidence } = deriveHealth(record, {});
    expect(evidence.rule).toBe("risk_at_risk");
    expect(evidence.top_risk?.id).toBe("r1");
    expect(evidence.counts.open_risks).toBe(2);
  });

  it("caps overdue commitments so one bad account cannot bloat the cache", () => {
    const commitments = Array.from({ length: 15 }, (_, i) => ({
      id: `c${i}`,
      status: "open",
      description: `Promise ${i}`,
      due_date: "2020-01-01",
    }));
    const { level, evidence } = deriveHealth({ ...emptyRecord, commitments } as any, {});
    expect(level).toBe("at_risk");
    expect(evidence.rule).toBe("overdue_commitments");
    expect(evidence.overdue_commitments).toHaveLength(10);
    expect(evidence.counts.open_commitments).toBe(15);
  });

  it("uses rule 'clear' when signals exist but none is open against it", () => {
    const record = {
      ...emptyRecord,
      risks: [{ id: "r1", status: "resolved", severity: "critical", title: "Was bad" }],
    };
    const { level, evidence } = deriveHealth(record, {});
    expect(level).toBe("on_track");
    expect(evidence.rule).toBe("clear");
  });
});
