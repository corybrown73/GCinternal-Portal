import { describe, expect, it } from "vitest";

import { readIntake } from "../intake-answers";
import { timelineFor } from "../onboarding-plan";
import {
  readinessFor,
  stageFlow,
  taskKind,
  usesDatasets,
  type StageFlowInput,
} from "../stage-flow";
import { byKind, shortMeeting, workspaceFor, type WorkspaceInput } from "../workspace";

/**
 * The owner's workspace: the window of work before the next stage, the
 * kinds kept apart, the next meeting, who we are waiting on.
 */

const CLOSE = "2026-09-14";

function build(over: Partial<Record<string, unknown>> = {}, stage = "get_it_working") {
  const intake = readIntake({
    path: "new_logo",
    wanted_forms: [{ id: "f1", name: "Daily job report", template_id: null }],
    handoff_tasks: { reviewed: "2026-09-15T15:00:00Z", reply_ae: "2026-09-16T10:00:00Z" },
    timeline: {
      overrides: { kickoff: "2026-09-17", working: "2026-09-22", adjust: "2026-09-30" },
      times: { kickoff: "10:00", working: "10:00", adjust: "10:00" },
      completed: {},
      ...((over["timeline"] as object) ?? {}),
    },
    ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== "timeline")),
  });
  const timeline = timelineFor(intake, CLOSE);
  const flowInput: StageFlowInput = {
    stage,
    intake,
    owner: "Dana",
    gongReports: 1,
    hasSow: true,
    hasBrief: true,
    hasLink: true,
    timeline,
  };
  const flow = stageFlow(flowInput);
  const input: WorkspaceInput = {
    flow,
    intake,
    timeline,
    today: "2026-09-18",
    parkingLot: [],
    homeworkDone: {},
    link: { sharedAt: "2026-09-16T10:00:00Z", openedAt: "2026-09-16T12:00:00Z" },
  };
  return { intake, timeline, flow, input };
}

describe("the window of work", () => {
  it("before Stage 1: the pre-kickoff tasks, and the first meeting is next", () => {
    const { input } = build({}, "onboarding_kickoff");
    const w = workspaceFor(input);
    expect(w.windowLabel).toBe("Before Stage 1");
    expect(w.now.map((t) => t.key)).toEqual([
      "handoff",
      "customer_ready",
      "reply_ae",
      "cadence",
      "prep",
      "kickoff",
    ]);
    expect(w.nextMeeting?.key).toBe("kickoff");
    expect(w.nextMeeting?.booked).toBe(true);
    // The handoff from Sales comes before anything else before Stage 1.
    expect(w.nextStep?.key).toBe("handoff");
  });

  it("Get it working, Stage 1 held: the gate's own facts, nothing from Stage 2", () => {
    const { input } = build({ timeline: { completed: { kickoff: "2026-09-17" } } });
    const w = workspaceFor(input);
    // Stage 1 (Kickoff) is its own stage now, so Get it working's own window
    // no longer straddles it — there is nothing left to be "after".
    expect(w.windowLabel).toBe("Get it working · Finishing");
    expect(w.now.map((t) => t.key)).toEqual(["baseline_locked", "e2e_working", "between_1"]);
    expect(w.now.find((t) => t.key.startsWith("func_"))).toBeUndefined();
    expect(w.nextMeeting?.key).toBe("working");
    expect(w.nextStep?.key).toBe("baseline_locked");
    expect(w.where.gate).toBe("Working end to end");
  });

  it("Make it run, Stage 3 held: what the SOW bought and Operational Go-Live", () => {
    const { input } = build(
      {
        timeline: {
          completed: { kickoff: "2026-09-17", working: "2026-09-22", adjust: "2026-09-30" },
        },
      },
      "make_it_run",
    );
    const w = workspaceFor(input);
    expect(w.windowLabel).toMatch(/^Make it run · After Stage 3/);
    expect(w.now.some((t) => t.key === "go_live")).toBe(true);
    expect(w.now.some((t) => t.key === "func_submit")).toBe(false);
    expect(w.now.some((t) => t.key === "kickoff")).toBe(false);
    expect(w.nextMeeting).toBeNull();
    expect(w.where.gate).toBe("Operational Go-Live");
  });

  it("keeps meetings, actions, handoffs and readiness apart", () => {
    const held = {
      timeline: {
        completed: { kickoff: "2026-09-17", working: "2026-09-22", adjust: "2026-09-30" },
      },
    };
    const yours = byKind(workspaceFor(build(held, "make_it_yours").input).now);
    expect(yours.map((g) => g.kind)).toContain("readiness");
    expect(yours.map((g) => g.kind)).toContain("action");
    const complete = byKind(workspaceFor(build(held, "onboarding_complete").input).now);
    expect(complete.map((g) => g.kind)).toContain("gate");
    expect(complete.find((g) => g.kind === "gate")!.items.map((t) => t.key)).toContain("closeout");
    expect(taskKind({ key: "working", action: "tick" } as never)).toBe("meeting");
    expect(taskKind({ key: "between_1", action: "tick" } as never)).toBe("action");
    expect(taskKind({ key: "func_users", action: "tick" } as never)).toBe("readiness");
    expect(taskKind({ key: "review", action: "review" } as never)).toBe("gate");
  });

  it("says where we are, as a target and never a promise", () => {
    const { input } = build({ timeline: { completed: { kickoff: "2026-09-17" } } });
    const w = workspaceFor(input);
    expect(w.where.stageLabel).toBe("Get it working");
    expect(w.where.day?.label).toMatch(/Day \d+/);
    expect(w.where.target).toEqual({ word: "Functional", date: input.timeline!.liveDate });
  });
});

describe("waiting on", () => {
  it("after the reply, before a booking: the customer owes a time", () => {
    const { input } = build({ timeline: { overrides: {}, times: {} } }, "onboarding_kickoff");
    const w = workspaceFor(input);
    expect(w.nextMeeting?.booked).toBe(false);
    expect(w.waiting.some((x) => x.source === "reply" && x.who === "customer")).toBe(true);
  });

  it("after Stage 1: the homework they have not ticked, and the recap's parts", () => {
    const { input } = build({
      timeline: { completed: { kickoff: "2026-09-17" } },
      recaps: {
        kickoff: {
          completed: "Form validated",
          open_items: "",
          customer_prep: "Send the customer list",
          gocanvas_prep: "Add the PDF output",
          next_objective: "",
          at: "2026-09-17T16:00:00Z",
        },
      },
    });
    const w = workspaceFor({ ...input, homeworkDone: { app: "2026-09-18T09:00:00Z" } });
    const customer = w.waiting.filter((x) => x.who === "customer").map((x) => x.what);
    expect(customer).toContain("Add a field user");
    expect(customer).toContain("Send us their list");
    expect(customer).not.toContain("Install the app");
    expect(customer.some((x) => x.startsWith("Send the customer list"))).toBe(true);
    expect(w.waiting.find((x) => x.who === "gocanvas")?.what).toMatch(/Add the PDF output/);
  });

  it("an unopened welcome link and the customer's parking-lot items", () => {
    const { input } = build({ timeline: { completed: { kickoff: "2026-09-17" } } });
    const w = workspaceFor({
      ...input,
      link: { sharedAt: "2026-09-16T10:00:00Z", openedAt: null },
      parkingLot: [
        {
          id: "p1",
          request: "Export to QuickBooks",
          why: "",
          needed_for_launch: false,
          owner: "customer",
          target: "Week 4",
          status: "open",
          created_at: "2026-09-17T16:00:00Z",
        },
        {
          id: "p2",
          request: "Second PDF",
          why: "",
          needed_for_launch: false,
          owner: "gocanvas",
          target: "",
          status: "open",
          created_at: "2026-09-17T16:00:00Z",
        },
      ],
    });
    expect(w.waiting.some((x) => x.source === "link")).toBe(true);
    expect(w.waiting.some((x) => x.what.startsWith("Export to QuickBooks"))).toBe(true);
    expect(w.ourOpen).toBe(1);
  });
});

describe("who has the ball", () => {
  it("is ours while something on the checklist is ours to do", () => {
    const { input } = build({ timeline: { completed: { kickoff: "2026-09-17" } } });
    const w = workspaceFor(input);
    expect(w.ball).toEqual({
      who: "us",
      detail: "Plan and dates agreed with the customer — baseline locked",
      since: null,
    });
  });

  it("passes to the customer when only their desk holds something", () => {
    const { input } = build(
      {
        timeline: {
          completed: {
            kickoff: "2026-09-17",
            baseline_locked: "2026-09-18",
            e2e_working: "2026-09-18",
            between_1: "2026-09-18",
          },
        },
      },
      "get_it_working",
    );
    const w = workspaceFor({
      ...input,
      parkingLot: [
        {
          id: "p1",
          request: "Export to QuickBooks",
          why: "",
          needed_for_launch: false,
          owner: "customer",
          target: "",
          status: "open",
          created_at: "2026-09-17T16:00:00Z",
        },
      ],
    });
    expect(w.ball?.who).toBe("customer");
    // The earliest thing on their desk: the homework from Stage 1, before the parking lot.
    expect(w.ball?.since).toBe("2026-09-17");
    expect(w.ball?.detail).toMatch(/things on their desk$/);
    // Something open on our side takes it back.
    const ours = workspaceFor({
      ...input,
      parkingLot: [
        {
          id: "p2",
          request: "Second PDF",
          why: "",
          needed_for_launch: false,
          owner: "gocanvas",
          target: "",
          status: "open",
          created_at: "2026-09-17T16:00:00Z",
        },
      ],
    });
    expect(ours.ball?.who).toBe("us");
  });

  it("is nobody's once the implementation has finished", () => {
    const { input } = build(
      { outcome: { kind: "proven", reason: null, at: "2026-10-01T10:00:00Z", by: null } },
      "onboarding_complete",
    );
    expect(workspaceFor(input).ball).toBeNull();
  });
});

describe("readiness reflects what is being implemented", () => {
  it("leaves the dataset items off when nothing puts datasets behind the form", () => {
    const { intake } = build();
    expect(usesDatasets(intake)).toBe(false);
    expect(readinessFor(intake).map((f) => f.key)).not.toContain("func_data_update");
    expect(readinessFor(intake).length).toBe(6);
  });

  it("puts them on for a data load, and lets the owner take any item off", () => {
    const { intake } = build({
      timeline: {
        services: [{ id: "s1", kind: "data_load", name: "Customer list", phase: 1 }],
      },
      readiness_off: ["func_edit"],
    });
    const keys = readinessFor(intake).map((f) => f.key);
    expect(keys).toContain("func_data_update");
    expect(keys).not.toContain("func_edit");
  });

  it("the checklist's Functional group is the tailored list", () => {
    const { flow } = build({
      timeline: {
        completed: { kickoff: "2026-09-17", working: "2026-09-22", adjust: "2026-09-30" },
      },
    });
    const ob = flow.stages.find((s) => s.key === "make_it_yours")!;
    expect(ob.tasks.filter((t) => t.key.startsWith("func_")).length).toBe(6);
  });
});

describe("meeting names", () => {
  it("shorten to the stage word", () => {
    expect(shortMeeting("Stage 2 — Make It Work for Them")).toBe("Stage 2");
    expect(shortMeeting("Session 1 — the admin portal")).toBe("Session 1");
    expect(shortMeeting("Training day 3 — the back office")).toBe("Training day 3");
    expect(shortMeeting("Walkthrough — what was bought")).toBe("Walkthrough");
  });
});
