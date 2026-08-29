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
