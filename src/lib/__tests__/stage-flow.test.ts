import { describe, expect, it } from "vitest";

import { readIntake } from "../intake-answers";
import { buildTimeline } from "../onboarding-timeline";
import { stageFlow, type StageFlowInput } from "../stage-flow";

const ready = {
  path: "new_logo",
  forms_built: false,
  wanted_forms: [{ id: "f1", name: "Daily job report", template_id: null }],
  handoff_tasks: { reviewed: "2026-09-22T15:00:00Z" },
};

function input(over: Partial<StageFlowInput> = {}): StageFlowInput {
  return {
    stage: "closed_won",
    intake: ready,
    owner: "Dana",
    gongReports: 1,
    hasSow: true,
    hasBrief: true,
    hasLink: true,
    ...over,
  };
}

describe("the stage checklist", () => {
  it("keeps a closed deal in Closed Won until every task is done", () => {
    const f = stageFlow(input({ owner: null }));
    expect(f.current).toBe("closed_won");
    expect(f.advanceTo).toBeNull();
    expect(f.stages[0]!.tasks.find((t) => t.key === "assign")!.done).toBe(false);
  });

  it("moves to Pre-kickoff once the AI's reading is approved and the deck exists", () => {
    expect(stageFlow(input()).advanceTo).toBe("onboarding_kickoff");
    expect(stageFlow(input({ hasLink: false })).advanceTo).toBeNull();
    expect(stageFlow(input({ intake: { ...ready, handoff_tasks: {} } })).advanceTo).toBeNull();
  });

  it("is four tasks, and the review waits for the Gong brief and the SOW", () => {
    const f = stageFlow(input({ gongReports: 0, hasSow: false, intake: {} }));
    expect(f.stages[0]!.tasks.map((t) => t.key)).toEqual(["assign", "notes", "sow", "review"]);
    const review = f.stages[0]!.tasks.find((t) => t.key === "review")!;
    expect(review.locked).toBe("Needs the Gong brief and the SOW first");
  });

  it("says the AI is reading while it reads", () => {
    const f = stageFlow(
      input({
        intake: {
          ...ready,
          handoff_tasks: {},
          ai_reading: { status: "running", started_at: new Date().toISOString() },
        },
      }),
    );
    expect(f.stages[0]!.tasks.find((t) => t.key === "review")!.summary).toMatch(/reading/);
  });

  it("counts no SOW as answered", () => {
    const f = stageFlow(input({ hasSow: false, intake: { ...ready, has_sow: false } }));
    expect(f.stages[0]!.tasks.find((t) => t.key === "sow")!.done).toBe(true);
  });

  it("moves Pre-kickoff to Onboarding when the AE reply, the cadence and the booked kickoff are all in", () => {
    const base = {
      ...ready,
      handoff_tasks: {
        reviewed: "2026-09-22T15:00:00Z",
        reply_ae: "2026-09-22T15:00:00Z",
        cadence: "2026-09-22T15:05:00Z",
      },
    };
    expect(stageFlow(input({ stage: "onboarding_kickoff", intake: base })).advanceTo).toBeNull();
    const booked = {
      ...base,
      timeline: { overrides: { kickoff: "2026-09-25" }, times: { kickoff: "10:00" } },
    };
    expect(stageFlow(input({ stage: "onboarding_kickoff", intake: booked })).advanceTo).toBe(
      "in_onboarding",
    );
    // Everything done at once skips straight through.
    expect(stageFlow(input({ intake: booked })).advanceTo).toBe("in_onboarding");
  });

  it("never moves a deal back or on from Onboarding by itself", () => {
    expect(stageFlow(input({ stage: "in_onboarding" })).advanceTo).toBeNull();
    expect(stageFlow(input({ stage: "prospect" })).advanceTo).toBeNull();
    // Nothing to assign before the close makes the project.
    const pre = stageFlow(input({ stage: "prospect", owner: null }));
    expect(pre.stages[0]!.tasks[0]!.locked).toMatch(/Closed Won/);
    expect(stageFlow(input({ stage: "field_fusion_setup" })).advanceTo).toBeNull();
  });

  it("lists the training calls, the first form live, each SOW service, then graduation", () => {
    const intake = readIntake({
      ...ready,
      timeline: {
        completed: { kickoff: "2026-09-24" },
        services: [{ id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 }],
      },
    });
    const t = buildTimeline({
      closeDate: "2026-09-22",
      path: "new_logo",
      completed: intake.timeline.completed,
      services: intake.timeline.services as never,
    });
    const f = stageFlow(input({ stage: "in_onboarding", intake, timeline: t }));
    const tasks = f.stages.find((s) => s.key === "onboarding")!.tasks;
    expect(tasks.map((x) => x.key)).toEqual([
      "kickoff",
      "working",
      "adjust",
      "live",
      "svc:qb",
      "grad_admin_built",
      "grad_second",
      "grad_office",
    ]);
    expect(tasks[0]!.done).toBe(true);
    expect(tasks[0]!.label).toMatch(/Training day 1/);
    expect(tasks.find((x) => x.key === "svc:qb")!.label).toBe("QuickBooks Online complete");
  });

  it("asks a training account for no second form", () => {
    const intake = readIntake({ path: "field_fusion" });
    const t = buildTimeline({ closeDate: "2026-09-22", path: "field_fusion" });
    const f = stageFlow(input({ stage: "in_onboarding", intake, timeline: t }));
    const keys = f.stages.find((s) => s.key === "onboarding")!.tasks.map((x) => x.key);
    expect(keys).not.toContain("grad_second");
    expect(keys).toContain("grad_admin_built");
  });

  it("calls a deal stuck by the same limits everywhere", async () => {
    const { stuckLevel } = await import("../stage-flow");
    expect(stuckLevel("onboarding_kickoff", 2)).toBe("ok");
    expect(stuckLevel("onboarding_kickoff", 3)).toBe("warn");
    expect(stuckLevel("onboarding_kickoff", 5)).toBe("escalate");
    expect(stuckLevel("onboarding_complete", 90)).toBe("ok");
  });
});

describe("the new-logo plan", () => {
  it("is three sixty-minute training days, first form live fifteen business days from the close", () => {
    const t = buildTimeline({ closeDate: "2026-09-22", path: "new_logo" });
    const calls = t.milestones.filter((m) => m.kind === "call");
    expect(calls.map((c) => c.minutes)).toEqual([60, 60, 60]);
    expect(calls.map((c) => c.label)).toEqual([
      expect.stringMatching(/^Training day 1/),
      expect.stringMatching(/^Training day 2/),
      expect.stringMatching(/^Training day 3/),
    ]);
    // Tue 22 Sep + 15 business days = Tue 13 Oct.
    expect(t.liveDate).toBe("2026-10-13");
  });
});

describe("a service is never the first form", () => {
  it("skips services an older brief wrote onto the forms list, everywhere the first form is named", async () => {
    const { firstFormName, isServiceName } = await import("../intake-answers");
    const { deliverablesFor } = await import("../deliverables");
    const intake = readIntake({
      path: "existing",
      wanted_forms: [
        { id: "syn-1", name: "Salesforce integration — tickets create cases automatically" },
        { id: "syn-2", name: "Dispatch add-on — office pushes jobs to techs" },
        { id: "syn-3", name: "Safety Audit form" },
        { id: "syn-4", name: "Timesheet form" },
      ],
      existing: { form_final: false, builder: "us" },
      timeline: {
        services: [
          { id: "sf", kind: "integration", name: "Salesforce integration", phase: 2, tier: 3 },
          { id: "dp", kind: "integration", name: "Dispatch add-on setup", phase: 2, tier: 3 },
        ],
      },
    });
    expect(firstFormName(intake)).toBe("Safety Audit form");
    const t = (await import("../onboarding-plan")).timelineFor(intake, "2026-09-21");
    const labels = deliverablesFor(intake, t).map((d) => `${d.phase}:${d.label}`);
    expect(labels).toEqual([
      "1:Safety Audit form",
      "1:Timesheet form",
      "2:Salesforce integration",
      "2:Dispatch add-on setup",
    ]);
    // A form that happens to say dispatch or training is still a form.
    expect(isServiceName("Dispatch ticket form")).toBe(false);
    expect(isServiceName("Safety training sign-in sheet")).toBe(false);
    expect(isServiceName("QuickBooks Online sync")).toBe(true);
    expect(isServiceName("Analytics dashboard")).toBe(true);
  });
});
