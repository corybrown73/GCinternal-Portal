import { describe, expect, it } from "vitest";

import { EMPTY_INTAKE, claimByPerson, intakeAnswersSchema, readIntake } from "../intake-answers";

/**
 * The server's save is: merge the patch over the record, spread
 * claimByPerson's answer over that, parse. A tick on a block the AI never
 * owns must come out the other side — the Field Fusion setup, a service on
 * the plan and "is there a SOW?" all went back to their old values once,
 * because the claim answered with the whole record.
 */
function saveLike(current: ReturnType<typeof readIntake>, patch: Record<string, unknown>) {
  const merged: Record<string, unknown> = { ...patch };
  for (const block of ["field_fusion", "existing"] as const) {
    if (patch[block] && typeof patch[block] === "object") {
      merged[block] = { ...current[block], ...(patch[block] as Record<string, unknown>) };
    }
  }
  Object.assign(merged, claimByPerson(current, Object.keys(patch)));
  return intakeAnswersSchema.parse({ ...current, ...merged, updated_at: "2026-09-25T00:00:00Z" });
}

describe("saving an intake patch", () => {
  it("claimByPerson answers with its three keys only", () => {
    const current = readIntake({ path: "field_fusion", industry: "Roofing" });
    expect(Object.keys(claimByPerson(current, ["field_fusion"])).sort()).toEqual([
      "ai_filled",
      "ai_sources",
      "person_set",
    ]);
  });

  it("a Field Fusion tick lands, and the other tick and the note stay", () => {
    const current = readIntake({
      path: "field_fusion",
      field_fusion: { client_trained: true, notes: "Uses the JSA form daily." },
    });
    const next = saveLike(current, { field_fusion: { form_connected: true } });
    expect(next.field_fusion).toEqual({
      form_connected: true,
      client_trained: true,
      notes: "Uses the JSA form daily.",
      handed_off_at: null,
    });
  });

  it("a service added to the plan lands", () => {
    const current = readIntake({ path: "existing" });
    const next = saveLike(current, {
      timeline: {
        ...EMPTY_INTAKE.timeline,
        services: [
          { id: "qb-1", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 },
        ],
      },
    });
    expect(next.timeline.services.map((s) => s.name)).toEqual(["QuickBooks Online"]);
  });

  it("'is there a SOW?' and the booked meetings land", () => {
    const current = readIntake({ path: "new_logo" });
    expect(saveLike(current, { has_sow: false }).has_sow).toBe(false);
    const booked = saveLike(current, {
      timeline: {
        ...EMPTY_INTAKE.timeline,
        overrides: { kickoff: "2026-09-29", working: "2026-10-02", adjust: "2026-10-09" },
        times: { kickoff: "10:00", working: "10:00", adjust: "10:00" },
        timezone: "America/Chicago",
      },
    });
    expect(Object.keys(booked.timeline.overrides)).toEqual(["kickoff", "working", "adjust"]);
  });

  it("a person's answer on an AI-owned field is claimed, and nothing else changes", () => {
    const current = readIntake({
      path: "new_logo",
      industry: "Roofing",
      ai_filled: ["industry", "current_process"],
      current_process: "Paper.",
    });
    const next = saveLike(current, { industry: "Construction" });
    expect(next.industry).toBe("Construction");
    expect(next.current_process).toBe("Paper.");
    expect(next.ai_filled).toEqual(["current_process"]);
    expect(next.person_set).toEqual(["industry"]);
  });
});
