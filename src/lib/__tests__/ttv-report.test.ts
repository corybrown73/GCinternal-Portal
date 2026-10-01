import { describe, expect, it } from "vitest";

import { buildTtvReport, TTV_TIMINGS, type TtvDeal } from "../ttv-report";

/**
 * Time to value from the stamps the Hub keeps: each timing between two
 * stage entries or dates, variance per reference date kept apart, coverage
 * split by who looks after the account afterwards.
 */
const base: TtvDeal = {
  id: "0",
  name: "",
  owner: null,
  closedAt: null,
  preKickoffAt: null,
  workingAt: null,
  yoursAt: null,
  runAt: null,
  completeAt: null,
  goLiveOn: null,
  tierExpectedOn: null,
  baselineOn: null,
  targetOn: null,
  outcome: null,
  coverage: "customer_success",
};

// Mon Sep 7 close → Pre-Kickoff Wed Sep 9 (2 bd) → Get it working Mon Sep 14
// (3 bd) → Make it yours Mon Sep 21 (5 bd) → Make it run Mon Sep 28 (5 bd) →
// Go-Live Fri Oct 2 (4 bd) → Complete Fri Oct 16 (10 bd). TTV = 19 bd.
const atlantic: TtvDeal = {
  ...base,
  id: "1",
  name: "Atlantic",
  closedAt: "2026-09-07T12:00:00Z",
  preKickoffAt: "2026-09-09T12:00:00Z",
  workingAt: "2026-09-14T12:00:00Z",
  yoursAt: "2026-09-21T12:00:00Z",
  runAt: "2026-09-28T12:00:00Z",
  completeAt: "2026-10-16T12:00:00Z",
  goLiveOn: "2026-10-02",
  tierExpectedOn: "2026-09-28", // 4 bd late against the tier
  baselineOn: "2026-10-02", // on the agreed day
  targetOn: "2026-10-05", // a day early against the moved target
  outcome: "proven",
  coverage: "named_am",
};
const miller: TtvDeal = {
  ...base,
  id: "2",
  name: "Miller's",
  closedAt: "2026-09-14T12:00:00Z",
  preKickoffAt: "2026-09-21T12:00:00Z", // 5 bd handoff
  workingAt: "2026-09-23T12:00:00Z",
};
const prospect: TtvDeal = { ...base, id: "3", name: "Peakhill" };

describe("the TTV report", () => {
  const r = buildTtvReport([atlantic, miller, prospect], "2026-10-20");

  it("counts a deal once its Go-Live is ticked, over the deals that closed", () => {
    expect(r.closed).toBe(2);
    expect(r.live).toBe(1);
    expect(r.ttv).toMatchObject({ count: 1, median: 19, slowest: { name: "Atlantic", days: 19 } });
  });

  it("measures every stage between the two stamps that bound it", () => {
    expect(r.handoff).toMatchObject({
      count: 2,
      median: 4,
      slowest: { name: "Miller's", days: 5 },
    });
    expect(r.preKickoff.count).toBe(2);
    expect(r.toWorking).toMatchObject({ count: 1, median: 5 });
    expect(r.makeItYours).toMatchObject({ count: 1, median: 5 });
    expect(r.launchLag).toMatchObject({ count: 1, median: 4 });
    expect(r.proof).toMatchObject({ count: 1, median: 10 });
    expect(r.total).toMatchObject({ count: 1, median: 29 });
    expect(TTV_TIMINGS.map((t) => t.key)).toHaveLength(8);
  });

  it("keeps the three variances apart and signs them, late positive", () => {
    expect(r.variance.vsTier).toMatchObject({ count: 1, median: 4, late: 1 });
    expect(r.variance.vsTier.worst).toEqual({ name: "Atlantic", days: 4 });
    expect(r.variance.vsBaseline).toMatchObject({ count: 1, median: 0, late: 0, worst: null });
    expect(r.variance.vsTarget).toMatchObject({ count: 1, median: -1, late: 0 });
  });

  it("counts outcomes and splits coverage by who looks after the account", () => {
    expect(r.outcomes).toEqual({ proven: 1, notProven: 0, open: 1 });
    expect(r.coverage.namedAm).toMatchObject({ count: 1, ttv: { median: 19 } });
    expect(r.coverage.customerSuccess).toMatchObject({ count: 1, ttv: { count: 0 } });
  });

  it("windows by the close date", () => {
    const recent = buildTtvReport([atlantic, miller], "2026-10-20", {
      since: "2026-09-10T00:00:00Z",
    });
    expect(recent.closed).toBe(1);
    expect(recent.live).toBe(0);
    expect(recent.handoff.count).toBe(1);
  });
});
