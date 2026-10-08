import { describe, expect, it } from "vitest";

import { EMPTY_INTAKE, claimByPerson, intakeAnswersSchema, readIntake } from "../intake-answers";
import { implementationFocusPatchSchema, timelinePatchSchema } from "../intake-patch";

describe("the timeline as the save accepts it", () => {
  it("takes the record's whole timeline back, every key the record can hold", () => {
    // The plan panel and the booking form spread the stored timeline into
    // the save. A key the record holds that the save refuses breaks both.
    expect(timelinePatchSchema.safeParse(EMPTY_INTAKE.timeline).success).toBe(true);
    const full = readIntake({
      timeline: {
        close_date: "2026-09-21",
        overrides: { kickoff: "2026-10-01" },
        times: { kickoff: "10:00" },
        timezone: "America/New_York",
        sow_applied_at: "2026-09-25T00:00:00Z",
        sow_notes: ["Go-live by 30 Oct."],
        sow_dates: [
          { type: "deadline", date: "2026-10-30", end: null, who: null, quote: "by 30 Oct" },
        ],
        removed_services: ["integration:quickbooksonline"],
        session_minutes: 30,
        services: [{ id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 }],
      },
    }).timeline;
    const r = timelinePatchSchema.safeParse(full);
    expect(r.success, JSON.stringify(r.success ? null : r.error.issues)).toBe(true);
    expect(Object.keys(full).sort()).toEqual(Object.keys(timelinePatchSchema.shape).sort());
  });
});

describe("implementation_focus as the save accepts it", () => {
  it("takes the record's whole implementation_focus back, every key the record can hold", () => {
    expect(
      implementationFocusPatchSchema.safeParse(EMPTY_INTAKE.implementation_focus).success,
    ).toBe(true);
    const full = readIntake({
      implementation_focus: {
        items: [
          {
            id: "focus-1",
            text: "Connect approved submission data to QuickBooks Online.",
            status: "agreed",
            sources: [{ type: "sow", label: "QuickBooks Online", quote: null }],
            review_flag: null,
          },
        ],
        validated_at: "2026-10-07T12:00:00Z",
        validated_by: "11111111-1111-4111-8111-111111111111",
      },
    }).implementation_focus;
    const r = implementationFocusPatchSchema.safeParse(full);
    expect(r.success, JSON.stringify(r.success ? null : r.error.issues)).toBe(true);
    expect(Object.keys(full).sort()).toEqual(
      Object.keys(implementationFocusPatchSchema.shape).sort(),
    );
  });
});

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

  it("a person's save of the Implementation Focus claims the list from the reading", () => {
    const current = readIntake({ ai_filled: ["implementation_focus", "field_users"] });
    const own = claimByPerson(current, ["implementation_focus"]);
    expect(own.person_set).toEqual(["implementation_focus"]);
    expect(own.ai_filled).toEqual(["field_users"]);
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
      poc: false,
      request: null,
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
