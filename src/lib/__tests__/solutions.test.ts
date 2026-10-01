import { describe, expect, it } from "vitest";

import { readIntake } from "../intake-answers";
import {
  foundationFor,
  launchCriticalOpen,
  servicesFromBought,
  solutionBall,
  solutionStatus,
  undispositioned,
  type ServiceSpec,
} from "../onboarding-services";
import { buildTimeline } from "../onboarding-timeline";
import { stageFlow } from "../stage-flow";

/**
 * Purchased solutions (the operating model): Define → Build → Accept, ended
 * Accepted, Descoped or Transferred; launch-critical ones gate Ready to run;
 * every one gates Implementation Complete; someone always has the ball.
 */
const qb: ServiceSpec = { id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2 };
const pdf: ServiceSpec = { id: "pdf", kind: "custom_pdf", name: "Invoice PDF", phase: 2 };

describe("a solution's status and ball", () => {
  it("follows the plan's steps under the model's names", () => {
    expect(solutionStatus(qb, {})).toBe("define");
    expect(solutionStatus(qb, { "qb:kickoff": "2026-10-01" })).toBe("build");
    expect(solutionStatus(qb, { "qb:kickoff": "2026-10-01", "qb:build": "2026-10-05" })).toBe(
      "accept",
    );
    expect(solutionStatus(qb, { "qb:live": "2026-10-12" })).toBe("accepted");
    expect(solutionStatus({ ...qb, feasibility_needed: true }, {})).toBe("feasibility");
    expect(
      solutionStatus({ ...qb, feasibility_needed: true }, { "qb:feasible": "2026-10-01" }),
    ).toBe("define");
    expect(
      solutionStatus(
        { ...qb, disposition: { kind: "descoped", at: "x", by: null, reason: "Budget" } },
        { "qb:live": "2026-10-12" },
      ),
    ).toBe("descoped");
  });

  it("puts the ball with us while we define and build, with the customer while they test, nowhere when it is done", () => {
    expect(solutionBall(qb, {}, "Dana")).toEqual({
      who: "us",
      person: "Dana",
      date: null,
      note: null,
    });
    expect(
      solutionBall({ ...qb, due: "2026-10-09" }, { "qb:kickoff": "x", "qb:build": "x" }),
    ).toEqual({
      who: "customer",
      person: null,
      date: "2026-10-09",
      note: null,
    });
    expect(solutionBall(qb, { "qb:live": "x" })).toBeNull();
    const set = {
      who: "blocked_internal" as const,
      person: "Kim",
      date: null,
      note: "Waiting on IT",
    };
    expect(solutionBall({ ...qb, ball: set }, {})).toEqual(set);
  });

  it("names the launch-critical ones still open, and the ones with no ending", () => {
    const services = [{ ...qb, launch_critical: true }, pdf];
    expect(launchCriticalOpen(services, {}).map((s) => s.id)).toEqual(["qb"]);
    expect(launchCriticalOpen(services, { "qb:live": "x" })).toEqual([]);
    expect(undispositioned(services, {}).map((s) => s.id)).toEqual(["qb", "pdf"]);
    expect(
      undispositioned(
        [
          { ...qb, launch_critical: true },
          { ...pdf, disposition: { kind: "transferred", at: "x", by: null, reason: "To Support" } },
        ],
        { "qb:live": "x" },
      ),
    ).toEqual([]);
    // A data load is a service the plan runs, not a solution a customer signs off.
    expect(
      undispositioned([{ id: "cl", kind: "data_load", name: "Customer list", phase: 1 }], {}),
    ).toEqual([]);
  });

  it("knows a new customer from an existing one", () => {
    expect(foundationFor("new_logo")).toBe("A");
    expect(foundationFor("field_fusion")).toBe("A");
    expect(foundationFor(null)).toBe("A");
    expect(foundationFor("existing")).toBe("B");
    expect(foundationFor("dm_conversion")).toBe("B");
  });
});

describe("what was bought becomes the plan's solutions", () => {
  it("reads a line per solution, flags launch-critical, and never doubles one already there", () => {
    const out = servicesFromBought(
      [
        "Form Build · Daily job report (launch-critical)",
        "Integration: QuickBooks Online *",
        "Custom PDF — Invoice",
        "Analytics dashboard",
        "",
      ],
      [qb],
    );
    expect(out.map((s) => [s.kind, s.name, Boolean(s.launch_critical)])).toEqual([
      ["integration", "QuickBooks Online", true],
      ["paid_form", "Daily job report", true],
      ["custom_pdf", "Invoice", false],
      ["analytics", "Analytics dashboard", false],
    ]);
    expect(out[0]!.id).toBe("qb");
    expect(new Set(out.map((s) => s.id)).size).toBe(out.length);
  });
});

describe("solutions on the stages", () => {
  const input = (services: ServiceSpec[], completed: Record<string, string>) => {
    const intake = readIntake({
      path: "new_logo",
      wanted_forms: [{ id: "f1", name: "Daily job report", template_id: null }],
      timeline: { services, completed },
    });
    const t = buildTimeline({
      closeDate: "2026-09-22",
      path: "new_logo",
      completed,
      services: services as never,
    });
    return stageFlow({
      stage: "make_it_yours",
      intake,
      owner: "Dana",
      gongReports: 1,
      hasSow: true,
      hasBrief: true,
      hasLink: true,
      timeline: t,
    });
  };

  it("holds Ready to run on a launch-critical solution, and Complete on every undecided one", () => {
    const f = input([{ ...qb, launch_critical: true }, pdf], {});
    const yours = f.stages.find((s) => s.key === "make_it_yours")!.tasks;
    expect(yours.map((t) => t.key)).toContain("lc:qb");
    expect(yours.map((t) => t.key)).not.toContain("lc:pdf");
    expect(yours.find((t) => t.key === "lc:qb")).toMatchObject({ action: "solution", done: false });
    const complete = f.stages.find((s) => s.key === "complete")!.tasks.map((t) => t.key);
    expect(complete).toContain("disp:qb");
    expect(complete).toContain("disp:pdf");
    // Accepted: the gate item goes.
    const accepted = input([{ ...qb, launch_critical: true }, pdf], { "qb:live": "2026-10-12" });
    expect(
      accepted.stages.find((s) => s.key === "make_it_yours")!.tasks.map((t) => t.key),
    ).not.toContain("lc:qb");
    expect(accepted.stages.find((s) => s.key === "complete")!.tasks.map((t) => t.key)).toEqual(
      expect.arrayContaining(["disp:pdf"]),
    );
    expect(
      accepted.stages.find((s) => s.key === "complete")!.tasks.map((t) => t.key),
    ).not.toContain("disp:qb");
  });

  it("parses the new fields on the record and leaves old rows alone", () => {
    const a = readIntake({
      timeline: {
        services: [
          { id: "qb", kind: "integration", name: "QuickBooks Online", phase: 2 },
          {
            id: "pdf",
            kind: "custom_pdf",
            name: "Invoice",
            phase: 2,
            launch_critical: true,
            ball: { who: "customer", date: "2026-10-09" },
            disposition: { kind: "accepted", at: "2026-10-12T00:00:00Z" },
          },
        ],
      },
    });
    expect(a.timeline.services[0]).not.toHaveProperty("launch_critical");
    expect(a.timeline.services[1]).toMatchObject({
      launch_critical: true,
      ball: { who: "customer", person: null, date: "2026-10-09", note: null },
      disposition: { kind: "accepted", by: null, reason: null },
    });
  });
});
