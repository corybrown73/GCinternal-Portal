import { describe, expect, it } from "vitest";

import { isServicesOnly, readIntake } from "../intake-answers";
import { stageFlow } from "../stage-flow";

const input = (path: string) => ({
  stage: "onboarding_kickoff",
  intake: { path },
  owner: "Cory",
  gongReports: 1,
  hasSow: true,
  hasBrief: true,
  hasLink: true,
});

describe("Pre-kickoff on an existing account", () => {
  it("has the same Intake & Process tasks as a new logo: intake, a starting solution, the process-call decision, then Kickoff only", () => {
    const pk = stageFlow(input("existing")).stages.find((s) => s.key === "pre_kickoff")!;
    expect(pk.tasks.map((t) => t.action)).toEqual([
      "intake",
      "prep",
      "process_understanding",
      "kickoff",
    ]);
  });

  it("applies the same Intake & Process gate to a new logo and a Device Magic conversion alike", () => {
    const nl = stageFlow(input("new_logo")).stages.find((s) => s.key === "pre_kickoff")!;
    expect(nl.tasks.map((t) => t.action)).toEqual([
      "intake",
      "prep",
      "process_understanding",
      "kickoff",
    ]);
    const dm = stageFlow(input("dm_conversion")).stages.find((s) => s.key === "pre_kickoff")!;
    expect(dm.tasks.map((t) => t.action)).toEqual([
      "intake",
      "prep",
      "process_understanding",
      "kickoff",
    ]);
  });

  it("does not move to Kickoff until intake, the starting solution and the process-call decision are all in, on top of the booking", () => {
    const partly = stageFlow({
      ...input("existing"),
      intake: {
        path: "existing",
        handoff_tasks: { intake_complete: "2026-09-25T00:00:00Z" },
        timeline: {
          overrides: { kickoff: "2026-09-29" },
          times: { kickoff: "10:00" },
          timezone: "America/Chicago",
        },
      },
    });
    expect(partly.advanceTo).toBeNull();
    const all = stageFlow({
      ...input("existing"),
      intake: {
        path: "existing",
        handoff_tasks: {
          intake_complete: "2026-09-25T00:00:00Z",
          prep_process: "x",
          prep_form: "x",
          prep_data: "x",
          process_understanding: "yes",
        },
        timeline: {
          overrides: { kickoff: "2026-09-29" },
          times: { kickoff: "10:00" },
          timezone: "America/Chicago",
        },
      },
    });
    expect(all.advanceTo).toBe("kickoff");
  });
});

describe("an existing account's Pre-kickoff", () => {
  it("requires the Process Call, not just the decision, once the TIS says the intake was not enough", () => {
    const f = stageFlow({
      stage: "onboarding_kickoff",
      intake: {
        path: "existing",
        existing: { form_final: false, builder: "us" },
        handoff_tasks: { process_understanding: "no" },
      },
      owner: "Dana",
      gongReports: 1,
      hasSow: true,
      hasBrief: true,
      hasLink: true,
    });
    const pk = f.stages.find((s) => s.key === "pre_kickoff")!;
    expect(pk.tasks.map((t) => t.key)).toContain("process_call_held");
    expect(pk.tasks.find((t) => t.key === "process_call_held")!.done).toBe(false);
  });

  it("books one walkthrough when the SOW is services only", () => {
    const intake = readIntake({
      path: "existing",
      existing: { form_final: true },
      timeline: {
        services: [{ id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2, tier: 3 }],
      },
    });
    expect(isServicesOnly(intake)).toBe(true);
    const f = stageFlow({
      stage: "onboarding_kickoff",
      intake,
      owner: "Dana",
      gongReports: 1,
      hasSow: true,
      hasBrief: true,
      hasLink: true,
    });
    const pk = f.stages.find((s) => s.key === "pre_kickoff")!;
    expect(pk.tasks.map((t) => t.key)).toEqual([
      "intake_complete",
      "prep",
      "process_understanding",
      "kickoff",
    ]);
    expect(pk.tasks.find((t) => t.key === "kickoff")!.label).toBe("Book the services walkthrough");
    // A paid form in the SOW brings the three form meetings back.
    const withForm = readIntake({
      path: "existing",
      existing: { form_final: true },
      timeline: {
        services: [{ id: "f", kind: "paid_form", name: "Job ticket", phase: 1 }],
      },
    });
    expect(isServicesOnly(withForm)).toBe(false);
  });
});
