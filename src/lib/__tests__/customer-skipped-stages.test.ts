import { describe, expect, it } from "vitest";

import { dashboardHeader } from "../customer-dashboard";
import { readIntake } from "../intake-answers";
import { timelineFor } from "../onboarding-plan";
import { customerJourney, skippedJourneyStages } from "../welcome-journey";

/**
 * Fixture-based validation only. These rows are the shapes stage_instances
 * takes (template stage_key + status); no live implementation was read.
 * A stage is hidden only when its plan rows are explicitly 'skipped'.
 */
const CLOSE = "2026-09-14";

function journeyFor(stage: string, skippedStages: string[] = []) {
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
    skippedStages: skippedStages as never,
  });
}

const row = (stage_key: string, status: string) => ({ stage_key, status });

/** BSI's internal journey: Intake & Process, Get It Working and Make It Yours skipped. */
const BSI_ROWS = [
  row("handoff", "skipped"),
  row("plan-internal", "skipped"),
  row("align-external", "skipped"),
  row("build", "skipped"),
  row("validate-iterate", "skipped"),
  row("adopt", "active"),
  row("graduate-to-cs", "pending"),
];

describe("explicitly skipped stages", () => {
  it("BSI-style fixture: the customer sees Kickoff, Make it run and Graduate only", () => {
    const skipped = skippedJourneyStages(BSI_ROWS);
    expect(skipped).toEqual(["pre_kickoff", "get_it_working", "make_it_yours"]);
    const j = journeyFor("make_it_run", skipped)!;
    expect(j.stages.map((s) => s.label)).toEqual(["Kickoff", "Make it run", "Graduate"]);
    expect(j.stages.map((s) => s.state)).toEqual(["done", "now", "later"]);
    expect(j.current.key).toBe("make_it_run");
  });

  it("a customer with all six stages keeps all six, with the same states as before", () => {
    const j = journeyFor("make_it_yours", skippedJourneyStages([row("build", "done")]))!;
    expect(j.stages).toHaveLength(6);
    expect(j.stages.map((s) => s.state)).toEqual(["done", "done", "done", "now", "later", "later"]);
  });

  it("a customer with no skipped stage keeps all six when every row is done, active or pending", () => {
    const rows = [row("handoff", "done"), row("build", "done"), row("adopt", "active")];
    expect(skippedJourneyStages(rows)).toEqual([]);
    expect(journeyFor("make_it_run", [])!.stages).toHaveLength(6);
  });

  it("missing or incomplete stage history never hides a stage", () => {
    expect(skippedJourneyStages([])).toEqual([]);
    // A mixed group is not a skip: one row skipped, its sibling not.
    expect(skippedJourneyStages([row("handoff", "skipped"), row("plan-internal", "done")])).toEqual(
      [],
    );
    // A stage with no rows at all is not read as skipped either.
    expect(skippedJourneyStages([row("build", "skipped")])).toEqual(["get_it_working"]);
  });

  it("the stage the customer is in is never hidden, even if a row says skipped", () => {
    const j = journeyFor("get_it_working", ["get_it_working"])!;
    expect(j.stages.map((s) => s.key)).toContain("get_it_working");
    expect(j.stages.find((s) => s.key === "get_it_working")?.state).toBe("now");
  });

  it("a skipped stage is not counted as completed in the progress bar", () => {
    const skipped = skippedJourneyStages(BSI_ROWS);
    const journey = journeyFor("make_it_run", skipped)!;
    const header = dashboardHeader({ journey, timeline: { milestones: [] } as never }, CLOSE);
    expect(header.stages.map((s) => s.label)).toEqual(["Kickoff", "Make It Run", "Graduate"]);
    expect(header.stages.filter((s) => s.state === "done")).toHaveLength(1);
  });

  it("the progress bar keeps six segments when nothing is skipped, and before setup", () => {
    const journey = journeyFor("make_it_run", [])!;
    const header = dashboardHeader({ journey, timeline: { milestones: [] } as never }, CLOSE);
    expect(header.stages).toHaveLength(6);
    const notStarted = dashboardHeader({ journey: null, timeline: { milestones: [] } as never });
    expect(notStarted.stages).toHaveLength(6);
    expect(notStarted.stages.every((s) => s.state === "later")).toBe(true);
  });
});
