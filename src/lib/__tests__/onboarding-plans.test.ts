import { afterEach, describe, expect, it } from "vitest";

import { planProblems, readPlanOverrides } from "../onboarding-plans";
import {
  applyPlanOverrides,
  basePlanFor,
  buildTimeline,
  CUSTOMER_BUILD_PLAN,
  EXISTING_PLAN,
  planFor,
  planKeyFor,
  withPlanOverrides,
} from "../onboarding-timeline";

afterEach(() => applyPlanOverrides({}));

describe("the existing-account plans run the three core meetings", () => {
  it("the form the integration reads: three 60-minute calls, Functional on day 15", () => {
    const calls = EXISTING_PLAN.filter((m) => m.kind === "call");
    expect(calls.map((m) => [m.day, m.minutes])).toEqual([
      [2, 60],
      [5, 60],
      [11, 60],
    ]);
    expect(EXISTING_PLAN[EXISTING_PLAN.length - 1]).toMatchObject({ key: "live", day: 15 });
    const t = buildTimeline({ closeDate: "2026-09-09", path: "existing" }); // Wed
    expect(t.liveDate).toBe("2026-09-30");
    expect(t.milestones.find((m) => m.key === "adjust")?.kind).toBe("call");
  });

  it("they build the form: the same days, frozen on day 15", () => {
    expect(CUSTOMER_BUILD_PLAN.filter((m) => m.kind === "call").map((m) => m.day)).toEqual([
      2, 5, 11,
    ]);
    expect(CUSTOMER_BUILD_PLAN[CUSTOMER_BUILD_PLAN.length - 1]).toMatchObject({
      key: "live",
      day: 15,
    });
  });

  it("names the plan a deal runs", () => {
    expect(planKeyFor("new_logo")).toBe("new_logo");
    expect(planKeyFor("existing")).toBe("existing_review");
    expect(planKeyFor("existing", { existingBuild: "us" })).toBe("existing_us");
    expect(planKeyFor("existing", { existingBuild: "customer" })).toBe("existing_customer");
    expect(planKeyFor("dm_conversion")).toBe("dm_conversion");
    expect(planKeyFor("field_fusion")).toBe("training");
    expect(planKeyFor("new_logo", { trainingOnly: true })).toBe("training");
  });
});

describe("an admin's changes to a plan", () => {
  const base = basePlanFor("new_logo");

  it("move a day, a length and a label; the rest of the plan stands", () => {
    const out = withPlanOverrides(base, {
      working: { day: 6, minutes: 90, label: "Stage 2 — the long one" },
      fieldtest: { throughDay: 12 },
    });
    expect(out.find((m) => m.key === "working")).toMatchObject({
      day: 6,
      minutes: 90,
      label: "Stage 2 — the long one",
    });
    expect(out.find((m) => m.key === "fieldtest")).toMatchObject({ day: 6, throughDay: 12 });
    expect(out.find((m) => m.key === "kickoff")).toEqual(base.find((m) => m.key === "kickoff"));
  });

  it("drop what would break the plan", () => {
    // Out of range, a length on a step that is not a call, an end before its start.
    const out = withPlanOverrides(base, {
      kickoff: { day: 400, minutes: 5 },
      homework: { minutes: 60 },
      fieldtest: { day: 8, throughDay: 7 },
    });
    expect(out.find((m) => m.key === "kickoff")).toMatchObject({ day: 2, minutes: 60 });
    expect(out.find((m) => m.key === "homework")?.minutes).toBeUndefined();
    expect(out.find((m) => m.key === "fieldtest")).toMatchObject({ day: 8 });
    expect(out.find((m) => m.key === "fieldtest")?.throughDay).toBeUndefined();
    // Days out of order: the whole plan falls back to the one in code.
    expect(withPlanOverrides(base, { adjust: { day: 3 } })).toBe(base);
    expect(withPlanOverrides(base, undefined)).toBe(base);
  });

  it("apply to planFor once installed, and only to that plan", () => {
    applyPlanOverrides({ existing_review: { live: { day: 20 } } });
    expect(planFor("existing")[planFor("existing").length - 1]!.day).toBe(20);
    expect(planFor("new_logo")[planFor("new_logo").length - 1]!.day).toBe(15);
    applyPlanOverrides({});
    expect(planFor("existing")[planFor("existing").length - 1]!.day).toBe(15);
  });

  it("are read forgivingly from the column", () => {
    expect(readPlanOverrides(null)).toEqual({});
    expect(readPlanOverrides("garbage")).toEqual({});
    expect(readPlanOverrides({ nope: { kickoff: { day: 3 } } })).toEqual({});
    expect(
      readPlanOverrides({
        new_logo: { kickoff: { day: 3 }, not_a_step: { day: 4 }, working: {} },
      }),
    ).toEqual({ new_logo: { kickoff: { day: 3 } } });
  });

  it("are checked strictly on the way out of the form", () => {
    expect(planProblems({ new_logo: { working: { day: 6 } } })).toEqual([]);
    const p = planProblems({
      new_logo: { adjust: { day: 3 }, homework: { minutes: 30 }, fieldtest: { throughDay: 2 } },
    });
    expect(p.some((x) => x.includes("would run before"))).toBe(true);
    expect(p.some((x) => x.includes("is not a call"))).toBe(true);
    expect(p.some((x) => x.includes("ends on day 2"))).toBe(true);
  });
});
