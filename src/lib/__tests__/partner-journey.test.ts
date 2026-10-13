import { describe, expect, it } from "vitest";
import { isPartnerJourney } from "../partner-implementation";
import {
  customerPartnerStages,
  partnerProgress,
  type PartnerProgressInput,
} from "../partner-journey";

/** A generic partner implementation, partway through partner setup. */
function midSetup(overrides: Partial<PartnerProgressInput> = {}): PartnerProgressInput {
  return {
    currentStage: "partner_setup",
    dealStage: "onboarding_kickoff",
    dealTransitions: [
      { to_stage: "prospect", occurred_at: "2026-02-01T10:00:00Z" },
      { to_stage: "closed_won", occurred_at: "2026-03-01T09:00:00Z" },
    ],
    stageInstances: [
      { stage_key: "closed_won_planning", status: "done" },
      { stage_key: "partner_setup", status: "active" },
      { stage_key: "form_finalisation", status: "pending" },
      { stage_key: "pilot", status: "pending" },
      { stage_key: "trial_run", status: "pending" },
      { stage_key: "roll_out", status: "pending" },
    ],
    stageHistory: [
      { stage: "closed_won_planning", exited_at: "2026-03-10T16:00:00Z" },
      { stage: "partner_setup", exited_at: null },
    ],
    milestones: [
      {
        stage: "partner_setup",
        status: "not_started",
        target_date: "2026-05-01",
        completed_date: null,
      },
    ],
    workItems: [
      {
        stage_key: "partner_setup",
        title: "Solution configured",
        party: "partner",
        visibility: "internal",
        status: "done",
      },
      {
        stage_key: "partner_setup",
        title: "Connection verified",
        party: "customer",
        visibility: "shared",
        status: "not_started",
      },
      {
        stage_key: "partner_setup",
        title: "Partner lead confirms readiness",
        party: "internal",
        visibility: "internal",
        status: "not_started",
      },
    ],
    ...overrides,
  };
}

describe("partnerProgress — generic partner implementation", () => {
  it("returns all seven stages in order, with the actual partner stage as current", () => {
    const p = partnerProgress(midSetup());
    expect(p.stages.map((s) => s.key)).toEqual([
      "pre_sale_poc",
      "closed_won_planning",
      "partner_setup",
      "form_finalisation",
      "pilot",
      "trial_run",
      "roll_out",
    ]);
    expect(p.current).toBe("partner_setup");
    expect(p.currentLabel).toBe("Partner Setup & Connection");
    expect(p.stages.find((s) => s.key === "partner_setup")!.status).toBe("current");
  });

  it("reads Pre-Sale & POC from the deal's own transitions", () => {
    const pre = partnerProgress(midSetup()).stages[0]!;
    expect(pre.status).toBe("completed");
    expect(pre.completedDate).toBe("2026-03-01");
    expect(pre.visibility).toBe("internal");
  });

  it("treats Pre-Sale & POC as done past Closed Won, and shows its date only when recorded", () => {
    const pre = partnerProgress(midSetup({ dealTransitions: [] })).stages[0]!;
    expect(pre.status).toBe("completed");
    expect(pre.completedDate).toBeNull();
  });

  it("does not count Pre-Sale & POC as done while the deal is still pre-close", () => {
    const pre = partnerProgress(midSetup({ dealStage: "negotiate", dealTransitions: [] }))
      .stages[0]!;
    expect(pre.status).not.toBe("completed");
    expect(pre.completedDate).toBeNull();
  });

  it("dates a completed stage from its recorded exit, and a target only from a recorded milestone", () => {
    const planning = partnerProgress(midSetup()).stages.find(
      (s) => s.key === "closed_won_planning",
    )!;
    expect(planning.status).toBe("completed");
    expect(planning.completedDate).toBe("2026-03-10");

    const setup = partnerProgress(midSetup()).stages.find((s) => s.key === "partner_setup")!;
    expect(setup.targetDate).toBe("2026-05-01");
    expect(setup.completedDate).toBeNull();
  });

  it("shows no target or completion where none is recorded (To be confirmed)", () => {
    const setup = partnerProgress(midSetup({ milestones: [] })).stages.find(
      (s) => s.key === "partner_setup",
    )!;
    expect(setup.targetDate).toBeNull();
    expect(setup.completedDate).toBeNull();
  });

  it("gives the customer only customer-party, shared, unskipped tasks", () => {
    const setup = partnerProgress(
      midSetup({
        workItems: [
          ...midSetup().workItems,
          {
            stage_key: "partner_setup",
            title: "Old customer step",
            party: "customer",
            visibility: "shared",
            status: "skipped",
          },
        ],
      }),
    ).stages.find((s) => s.key === "partner_setup")!;
    expect(setup.customerTasks).toEqual([{ title: "Connection verified", done: false }]);
  });
});

describe("customerPartnerStages", () => {
  it("shows five customer stages beginning with Partner Setup & Connection", () => {
    const stages = customerPartnerStages(partnerProgress(midSetup()));
    expect(stages.map((s) => s.key)).toEqual([
      "partner_setup",
      "form_finalisation",
      "pilot",
      "trial_run",
      "roll_out",
    ]);
    expect(stages.map((s) => s.status)).toEqual([
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("hides a genuinely skipped stage from the customer, and never shows it as done", () => {
    // Pilot was passed over: trial run is now current and pilot never completed.
    const stages = customerPartnerStages(
      partnerProgress(
        midSetup({
          currentStage: "trial_run",
          stageInstances: [
            { stage_key: "closed_won_planning", status: "done" },
            { stage_key: "partner_setup", status: "done" },
            { stage_key: "form_finalisation", status: "done" },
            { stage_key: "pilot", status: "pending" },
            { stage_key: "trial_run", status: "active" },
            { stage_key: "roll_out", status: "pending" },
          ],
        }),
      ),
    );
    expect(stages.map((s) => s.key)).toEqual([
      "partner_setup",
      "form_finalisation",
      "trial_run",
      "roll_out",
    ]);
    expect(stages.find((s) => s.key === "partner_setup")!.status).toBe("completed");
  });
});

describe("partnerProgress — graduation", () => {
  const graduated: PartnerProgressInput = {
    currentStage: "roll_out",
    dealStage: "onboarding_complete",
    dealTransitions: [
      { to_stage: "closed_won", occurred_at: "2026-03-01T09:00:00Z" },
      { to_stage: "onboarding_complete", occurred_at: "2026-09-30T12:00:00Z" },
    ],
    stageInstances: [
      { stage_key: "closed_won_planning", status: "done" },
      { stage_key: "partner_setup", status: "done" },
      { stage_key: "form_finalisation", status: "done" },
      { stage_key: "pilot", status: "done" },
      { stage_key: "trial_run", status: "done" },
      { stage_key: "roll_out", status: "done" },
    ],
    stageHistory: [{ stage: "roll_out", exited_at: null }],
    milestones: [
      {
        stage: "roll_out",
        status: "completed",
        target_date: null,
        completed_date: "2026-09-30",
      },
    ],
    workItems: [],
  };

  it("keeps Roll Out & Graduation completed, dated from its completion", () => {
    const roll = partnerProgress(graduated).stages.find((s) => s.key === "roll_out")!;
    expect(roll.status).toBe("completed");
    expect(roll.completedDate).toBe("2026-09-30");
  });

  it("reads the same on every read: a refresh does not change a graduated journey", () => {
    expect(partnerProgress(graduated)).toEqual(partnerProgress(graduated));
    const stages = customerPartnerStages(partnerProgress(graduated));
    expect(stages.every((s) => s.status === "completed")).toBe(true);
  });

  it("would show it as current if its stage were reset to active (what the resync rule prevents)", () => {
    // Negative control for the partner-aware resync (migration 0084): a done
    // current stage that is reset to active would re-open the journey.
    const reset = partnerProgress({
      ...graduated,
      stageInstances: graduated.stageInstances.map((s) =>
        s.stage_key === "roll_out" ? { ...s, status: "active" } : s,
      ),
    });
    expect(reset.stages.find((s) => s.key === "roll_out")!.status).toBe("current");
  });
});

describe("standard and legacy Field Fusion implementations", () => {
  it("are not read as partner journeys, so their existing reads are unchanged", () => {
    expect(isPartnerJourney({ journey_type: null, partner_key: null })).toBe(false);
    // A legacy Field Fusion record is identified by its intake path and keeps
    // its standard journey_type with no partner_key, so it is not a partner
    // journey here and its existing reads stay as they are.
    expect(isPartnerJourney({ journey_type: "standard", partner_key: null })).toBe(false);
  });

  it("are read as partner journeys only when stored as one", () => {
    expect(isPartnerJourney({ journey_type: "partner_implementation", partner_key: null })).toBe(
      true,
    );
    expect(isPartnerJourney({ journey_type: null, partner_key: "field_fusion_iq" })).toBe(true);
  });
});
