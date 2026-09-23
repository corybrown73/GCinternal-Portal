import { describe, expect, it } from "vitest";

import {
  buildPipelineReport,
  reportHtml,
  reportMarkdown,
  type ReportDeal,
} from "../pipeline-report";

const base: Omit<ReportDeal, "id" | "name" | "stage"> = {
  owner: "Dana",
  nextStep: null,
  stuck: "ok",
  businessDaysInStage: 1,
  hasGongBrief: true,
  hasSow: true,
  hasAiBrief: true,
  closedAt: null,
  onboardingAt: null,
  liveOn: null,
  lastActivityAt: "2026-09-23T10:00:00Z",
};
const deals: ReportDeal[] = [
  {
    ...base,
    id: "1",
    name: "Peakhill",
    stage: "closed_won",
    owner: null,
    hasGongBrief: false,
    nextStep: "Assign an owner",
    businessDaysInStage: 2,
    stuck: "warn",
    lastActivityAt: "2026-09-15T10:00:00Z",
  },
  {
    ...base,
    id: "2",
    name: "Kenvirons",
    stage: "onboarding_kickoff",
    stuck: "escalate",
    businessDaysInStage: 9,
    nextStep: "Book the kickoff call",
  },
  {
    ...base,
    id: "3",
    name: "Miller's",
    stage: "in_onboarding",
    closedAt: "2026-09-01T12:00:00Z",
    onboardingAt: "2026-09-04T12:00:00Z",
  },
  {
    ...base,
    id: "4",
    name: "Atlantic",
    stage: "onboarding_complete",
    closedAt: "2026-08-03T12:00:00Z",
    onboardingAt: "2026-08-10T12:00:00Z",
    liveOn: "2026-08-24",
  },
  { ...base, id: "5", name: "Prospect Co", stage: "prospect", hasGongBrief: false },
];

describe("the pipeline report", () => {
  const r = buildPipelineReport(deals, "2026-09-23");

  it("counts every stage and how many are past their limit", () => {
    const cw = r.stages.find((s) => s.stage === "closed_won")!;
    expect(cw).toMatchObject({ label: "Closed Won", count: 1, warn: 1, escalate: 0 });
    expect(r.stages.find((s) => s.stage === "onboarding_kickoff")!.escalate).toBe(1);
  });

  it("lists the stuck worst first, the unclaimed, the untouched and the missing Gong briefs", () => {
    expect(r.stuck.map((s) => s.name)).toEqual(["Kenvirons", "Peakhill"]);
    expect(r.unclaimed.map((u) => u.name)).toEqual(["Peakhill"]);
    expect(r.untouched).toEqual([
      expect.objectContaining({ name: "Peakhill", businessDaysQuiet: 6 }),
    ]);
    // Prospects are still being sold: no Gong brief expected yet.
    expect(r.gong.without.map((g) => g.name)).toEqual(["Peakhill"]);
  });

  it("times close to onboarding and to first form live, in business days", () => {
    expect(r.timeToOnboarding).toMatchObject({
      count: 2,
      median: 4,
      slowest: { name: "Atlantic", days: 5 },
    });
    expect(r.timeToFirstFormLive).toMatchObject({ count: 1, median: 15 });
  });

  it("reads the same as Markdown and as an email", () => {
    const md = reportMarkdown(r);
    expect(md).toContain("| Closed Won | 1 | 1 | — |");
    expect(md).toContain("**Kenvirons** — Pre-kickoff, 9 business days");
    expect(reportHtml(r, "https://x/pipeline")).toContain("Unclaimed (1)");
  });
});
