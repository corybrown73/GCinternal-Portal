import { describe, expect, it } from "vitest";
import { isPartnerJourney } from "../partner-implementation";
import {
  customerPartnerStages,
  partnerDashboardView,
  partnerProgress,
  partnerStepperStages,
  partnerWorkspace,
  TO_BE_CONFIRMED,
  type PartnerProgressInput,
} from "../partner-journey";
import {
  partnerAttentionItems,
  partnerBlockerItems,
  partnerDashboardHeader,
} from "../customer-dashboard";

type Item = PartnerProgressInput["workItems"][number];

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
      { stage_key: "closed_won_planning", status: "done", gate_mode: "advisory" },
      { stage_key: "partner_setup", status: "active", gate_mode: "blocking" },
      { stage_key: "form_finalisation", status: "pending", gate_mode: "advisory" },
      { stage_key: "pilot", status: "pending", gate_mode: "advisory" },
      { stage_key: "trial_run", status: "pending", gate_mode: "advisory" },
      { stage_key: "roll_out", status: "pending", gate_mode: "blocking" },
    ],
    stageHistory: [
      { stage: "closed_won_planning", exited_at: "2026-03-10T16:00:00Z" },
      { stage: "partner_setup", exited_at: null },
    ],
    milestones: [
      {
        name: "Implementation Ready",
        stage: "partner_setup",
        status: "not_started",
        target_date: "2026-05-01",
        completed_date: null,
      },
    ],
    workItems: [
      item({
        id: "w-solution",
        stage_key: "partner_setup",
        title: "Solution configured",
        party: "partner",
        visibility: "internal",
        status: "done",
        is_gate: true,
      }),
      item({
        id: "w-connection",
        stage_key: "partner_setup",
        title: "Connection verified",
        party: "customer",
        visibility: "shared",
        status: "not_started",
        is_gate: true,
      }),
      item({
        id: "w-ready",
        stage_key: "partner_setup",
        title: "Partner lead confirms readiness",
        party: "internal",
        visibility: "internal",
        status: "not_started",
        is_gate: true,
      }),
    ],
    ...overrides,
  };
}

function item(over: Partial<Item> & Pick<Item, "id" | "title">): Item {
  return {
    stage_key: null,
    party: "internal",
    visibility: "internal",
    status: "not_started",
    is_gate: false,
    due_at: null,
    ...over,
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
          item({
            id: "w-old",
            stage_key: "partner_setup",
            title: "Old customer step",
            party: "customer",
            visibility: "shared",
            status: "skipped",
          }),
        ],
      }),
    ).stages.find((s) => s.key === "partner_setup")!;
    expect(setup.customerTasks).toEqual([
      { id: "w-connection", title: "Connection verified", done: false, blocked: false },
    ]);
  });

  it("keeps every work item for the TIS, with its party, gate flag and status", () => {
    const setup = partnerProgress(midSetup()).stages.find((s) => s.key === "partner_setup")!;
    expect(setup.items.map((i) => [i.id, i.party, i.isGate])).toEqual([
      ["w-solution", "partner", true],
      ["w-connection", "customer", true],
      ["w-ready", "internal", true],
    ]);
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
            { stage_key: "closed_won_planning", status: "done", gate_mode: "advisory" },
            { stage_key: "partner_setup", status: "done", gate_mode: "blocking" },
            { stage_key: "form_finalisation", status: "done", gate_mode: "advisory" },
            { stage_key: "pilot", status: "pending", gate_mode: "advisory" },
            { stage_key: "trial_run", status: "active", gate_mode: "advisory" },
            { stage_key: "roll_out", status: "pending", gate_mode: "blocking" },
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

describe("partnerStepperStages — the generic stepper's partner input", () => {
  it("draws all seven stages, with the actual stage current and the passed stages checked", () => {
    const stages = partnerStepperStages(partnerProgress(midSetup()));
    expect(stages).toHaveLength(7);
    expect(stages.find((s) => s.isCurrent)!.key).toBe("partner_setup");
    expect(stages.filter((s) => s.passed).map((s) => s.key)).toEqual([
      "pre_sale_poc",
      "closed_won_planning",
    ]);
  });

  it("dates completed stages from their completion, and open stages from their target", () => {
    const stages = partnerStepperStages(partnerProgress(midSetup()));
    expect(stages.find((s) => s.key === "closed_won_planning")!.date).toEqual({
      label: "Completed",
      text: "2026-03-10",
    });
    expect(stages.find((s) => s.key === "partner_setup")!.date).toEqual({
      label: "Target",
      text: "2026-05-01",
    });
  });

  it("says To be confirmed wherever no date is recorded, rather than leaving the stage undated", () => {
    const stages = partnerStepperStages(partnerProgress(midSetup({ milestones: [] })));
    expect(stages.find((s) => s.key === "partner_setup")!.date).toEqual({
      label: "Target",
      text: TO_BE_CONFIRMED,
    });
    expect(stages.find((s) => s.key === "pilot")!.date).toEqual({
      label: "Planned",
      text: TO_BE_CONFIRMED,
    });
  });
});

describe("partnerWorkspace — the status strip", () => {
  it("names the open gate criterion first, and what is waiting", () => {
    const strip = partnerWorkspace(partnerProgress(midSetup()));
    expect(strip.stageLabel).toBe("Partner Setup & Connection");
    expect(strip.nextAction).toBe("Connection verified");
    expect(strip.waitingOn).toBe("Connection verified (+1 more)");
  });

  it("reads Nothing open once the stage's items are settled", () => {
    const strip = partnerWorkspace(
      partnerProgress(
        midSetup({
          workItems: midSetup().workItems.map((w) => ({ ...w, status: "done" })),
        }),
      ),
    );
    expect(strip.nextAction).toBe("Nothing open");
    expect(strip.waitingOn).toBe("Nothing on anyone's desk");
  });
});

describe("partnerDashboardView — the customer's dashboard", () => {
  it("shows five stages with the bar's states, and the actions on the current stage only", () => {
    const view = partnerDashboardView(partnerProgress(midSetup()));
    expect(view.stages.map((s) => [s.key, s.state])).toEqual([
      ["partner_setup", "now"],
      ["form_finalisation", "later"],
      ["pilot", "later"],
      ["trial_run", "later"],
      ["roll_out", "later"],
    ]);
    expect(view.currentLabel).toBe("Partner Setup & Connection");
    expect(view.actions).toEqual([
      { id: "w-connection", title: "Connection verified", blocked: false },
    ]);
  });

  it("never includes an internal or partner-party item, even on the current stage", () => {
    const view = partnerDashboardView(partnerProgress(midSetup()));
    const titles = view.actions.map((a) => a.title);
    expect(titles).not.toContain("Solution configured");
    expect(titles).not.toContain("Partner lead confirms readiness");
  });

  it("shows a blocked customer action as a blocker, not as an open action", () => {
    const view = partnerDashboardView(
      partnerProgress(
        midSetup({
          workItems: midSetup().workItems.map((w) =>
            w.id === "w-connection" ? { ...w, status: "blocked" } : w,
          ),
        }),
      ),
    );
    expect(view.actions).toEqual([]);
    expect(view.blockers).toEqual([{ id: "w-connection", title: "Connection verified" }]);
  });

  it("uses the planning label while the implementation is still in its internal planning stage", () => {
    const view = partnerDashboardView(
      partnerProgress(midSetup({ currentStage: "closed_won_planning" })),
    );
    expect(view.currentLabel).toBe("Planning with you");
    expect(view.stages.every((s) => s.state !== "now")).toBe(true);
  });

  it("names the earliest recorded milestone still ahead, and nothing when none is recorded", () => {
    const ahead = partnerDashboardView(
      partnerProgress(
        midSetup({
          milestones: [
            {
              name: "Later",
              stage: "pilot",
              status: "not_started",
              target_date: "2026-08-01",
              completed_date: null,
            },
            {
              name: "Sooner",
              stage: "partner_setup",
              status: "not_started",
              target_date: "2026-06-01",
              completed_date: null,
            },
          ],
        }),
      ),
    );
    expect(ahead.nextMilestone).toEqual({ name: "Sooner", date: "2026-06-01" });

    const none = partnerDashboardView(partnerProgress(midSetup({ milestones: [] })));
    expect(none.nextMilestone).toBeNull();
  });

  it("keeps Roll Out & Graduation completed after graduation, with its recorded target", () => {
    const graduated: PartnerProgressInput = {
      currentStage: "roll_out",
      dealStage: "onboarding_complete",
      dealTransitions: [{ to_stage: "closed_won", occurred_at: "2026-03-01T09:00:00Z" }],
      stageInstances: [
        "closed_won_planning",
        "partner_setup",
        "form_finalisation",
        "pilot",
        "trial_run",
        "roll_out",
      ].map((k) => ({ stage_key: k, status: "done", gate_mode: null })),
      stageHistory: [{ stage: "roll_out", exited_at: "2026-09-30T12:00:00Z" }],
      milestones: [
        {
          name: "Roll Out & Graduation",
          stage: "roll_out",
          status: "completed",
          target_date: "2026-09-30",
          completed_date: "2026-09-30",
        },
      ],
      workItems: [],
    };
    const view = partnerDashboardView(partnerProgress(graduated));
    expect(view.stages.every((s) => s.state === "done")).toBe(true);
    expect(view.currentLabel).toBe("Roll Out & Graduation");
    expect(view.graduationTarget).toBe("2026-09-30");
    // Re-reading the same records gives the same journey: a refresh changes nothing.
    expect(partnerDashboardView(partnerProgress(graduated))).toEqual(view);
  });

  it("returns the same header shape the existing dashboard bar reads", () => {
    const header = partnerDashboardHeader(partnerDashboardView(partnerProgress(midSetup())));
    expect(header.started).toBe(true);
    expect(header.currentLabel).toBe("Partner Setup & Connection");
    expect(header.stages.map((s) => s.state)).toEqual(["now", "later", "later", "later", "later"]);
    expect(header.graduation).toEqual({ current: null, original: null, moved: false });
  });

  it("gives the customer only their own change items and open actions, never kickoff items", () => {
    const view = partnerDashboardView(partnerProgress(midSetup()));
    const items = partnerAttentionItems({
      partner: view,
      parkingLot: [
        {
          request: "Add a second site",
          target: "2026-11-01",
          status: "open",
          neededForLaunch: false,
          owner: "customer",
        },
        {
          request: "Internal idea",
          target: "",
          status: "open",
          neededForLaunch: false,
          owner: "gocanvas",
        },
      ],
    });
    expect(items.map((i) => i.kind)).toEqual(["action", "change"]);
    expect(items.map((i) => i.what)).toEqual(["Connection verified", "Add a second site"]);
    expect(partnerBlockerItems(view)).toEqual([]);
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
