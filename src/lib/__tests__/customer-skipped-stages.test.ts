import { describe, expect, it } from "vitest";

import { dashboardHeader } from "../customer-dashboard";
import { readIntake } from "../intake-answers";
import { timelineFor } from "../onboarding-plan";
import { railStatuses, type RailStatus } from "../stage-flow";
import { customerJourney, type RailStageStatus } from "../welcome-journey";

/**
 * Fixture-based. The customer's journey reads the same rail rule Current
 * Implementation shows (railStatuses), so a stage is hidden only where the
 * rail says Skipped, and only where that stage has its own records to judge by.
 */
const CLOSE = "2026-09-14";

function journeyFor(stage: string, railStatusesInput: RailStageStatus[] = []) {
  const intake = readIntake({
    path: "new_logo",
    timeline: { overrides: { kickoff: "2026-09-17" }, completed: {}, services: [] },
  });
  return customerJourney({
    stage,
    intake,
    timeline: timelineFor(intake, CLOSE),
    homeworkDone: {},
    parkingLot: [],
    leadName: "Dana",
    railStatuses: railStatusesInput,
  });
}

/** A rail stage as stageFlow builds it: its key, whether it is done, and its checklist. */
const stage = (key: string, done: boolean, tasks = 1) => ({
  key: key as never,
  done,
  tasks: Array.from({ length: tasks }, () => ({})),
});

/** BSI as observed on Current Implementation: Make it run is current. */
const BSI_STAGES = [
  stage("pre_kickoff", false, 2),
  stage("kickoff", true, 1),
  stage("get_it_working", false, 1),
  stage("make_it_yours", false, 1),
  stage("make_it_run", false, 1),
  stage("complete", false, 1),
];

const toRail = (stages: typeof BSI_STAGES, current: string | null): RailStageStatus[] =>
  railStatuses(stages, current as never).map((r) => ({ ...r, key: r.key }));

describe("the rail rule", () => {
  it("skipped is before the current stage and not done; completed is done; the rest is current or upcoming", () => {
    const rail = railStatuses(BSI_STAGES, "make_it_run");
    expect(rail.map((r) => [r.key, r.status])).toEqual([
      ["pre_kickoff", "skipped"],
      ["kickoff", "completed"],
      ["get_it_working", "skipped"],
      ["make_it_yours", "skipped"],
      ["make_it_run", "current"],
      ["complete", "upcoming"],
    ]);
  });

  it("a stage with nothing to judge it by has no records, and a current stage that is done reads as completed", () => {
    const rail = railStatuses(
      [stage("get_it_working", false, 0), stage("make_it_yours", true, 1)],
      "make_it_yours",
    );
    expect(rail).toEqual([
      { key: "get_it_working", status: "skipped", hasRecords: false },
      { key: "make_it_yours", status: "completed", hasRecords: true },
    ]);
  });
});

describe("the customer's journey follows the Current Implementation rail", () => {
  it("BSI: Intake & Process, Get It Working and Make It Yours are Skipped, so the customer sees Kickoff → Make it run → Graduate", () => {
    const j = journeyFor("make_it_run", toRail(BSI_STAGES, "make_it_run"))!;
    expect(j.stages.map((s) => s.label)).toEqual(["Kickoff", "Make it run", "Graduate"]);
    expect(j.stages.map((s) => s.state)).toEqual(["done", "now", "later"]);
    expect(j.current.key).toBe("make_it_run");
  });

  it("BSI's progress bar shows the same three stages, with Kickoff done and Make It Run now", () => {
    const j = journeyFor("make_it_run", toRail(BSI_STAGES, "make_it_run"))!;
    const header = dashboardHeader({ journey: j, timeline: { milestones: [] } as never }, CLOSE);
    expect(header.stages.map((s) => [s.label, s.state])).toEqual([
      ["Kickoff", "done"],
      ["Make It Run", "now"],
      ["Graduate", "later"],
    ]);
  });

  it("a six-stage implementation keeps all six, with the same states it always had", () => {
    const six = [
      stage("pre_kickoff", true),
      stage("kickoff", true),
      stage("get_it_working", true),
      stage("make_it_yours", false),
      stage("make_it_run", false),
      stage("complete", false),
    ];
    const j = journeyFor("make_it_yours", toRail(six, "make_it_yours"))!;
    expect(j.stages.map((s) => s.state)).toEqual(["done", "done", "done", "now", "later", "later"]);
    expect(j.stages).toHaveLength(6);
  });

  it("incomplete records never hide a stage: no rail at all, or a past stage with no checklist", () => {
    expect(journeyFor("make_it_run", [])!.stages).toHaveLength(6);
    const missing = toRail(
      [
        stage("pre_kickoff", false, 0),
        stage("kickoff", false, 0),
        stage("get_it_working", false, 0),
      ],
      "get_it_working",
    );
    const j = journeyFor("get_it_working", missing)!;
    expect(j.stages).toHaveLength(6);
    expect(j.stages.map((s) => s.key)).toEqual(expect.arrayContaining(["pre_kickoff", "kickoff"]));
  });

  it("a stage the rail shows as completed stays visible as done, even after the current stage", () => {
    const rail: RailStageStatus[] = [
      { key: "make_it_yours", status: "current", hasRecords: true },
      { key: "make_it_run", status: "completed", hasRecords: true },
    ];
    const j = journeyFor("make_it_yours", rail)!;
    expect(j.stages.find((s) => s.key === "make_it_run")?.state).toBe("done");
  });

  it("the current stage is never hidden, even if a rail row says Skipped", () => {
    const rail: RailStageStatus[] = [{ key: "make_it_run", status: "skipped", hasRecords: true }];
    const j = journeyFor("make_it_run", rail)!;
    expect(j.stages.map((s) => s.key)).toContain("make_it_run");
    expect(j.stages.find((s) => s.key === "make_it_run")?.state).toBe("now");
  });

  it("a skipped stage is never counted as done in the progress bar", () => {
    const j = journeyFor("make_it_run", toRail(BSI_STAGES, "make_it_run"))!;
    const header = dashboardHeader({ journey: j, timeline: { milestones: [] } as never }, CLOSE);
    expect(header.stages.filter((s) => s.state === "done")).toHaveLength(1);
  });
});

describe("the rail rule covers every status the customer can see", () => {
  it("uses only the four rail statuses", () => {
    const statuses: RailStatus[] = railStatuses(BSI_STAGES, "make_it_run").map((r) => r.status);
    expect(new Set(statuses)).toEqual(new Set(["skipped", "completed", "current", "upcoming"]));
  });
});
