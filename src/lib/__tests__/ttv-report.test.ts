import { describe, expect, it } from "vitest";

import { buildTtvReport, EXCLUSION, TTV_TIMINGS, type TtvDeal } from "../ttv-report";

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

// Mon Sep 7 close → Pre-Kickoff Wed Sep 9 (2 bd) → Kickoff Fri Sep 11 (2 bd)
// → Get it working Mon Sep 14 (1 bd) → Make it yours Mon Sep 21 (5 bd) → Make it run Mon Sep 28 (5 bd) →
// Go-Live Fri Oct 2 (4 bd) → Complete Fri Oct 16 (10 bd). TTV = 19 bd.
const atlantic: TtvDeal = {
  ...base,
  id: "1",
  name: "Atlantic",
  closedAt: "2026-09-07T12:00:00Z",
  preKickoffAt: "2026-09-09T12:00:00Z",
  kickoffAt: "2026-09-11T12:00:00Z",
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
  kickoffAt: "2026-09-22T12:00:00Z",
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
    // Intake & Process and Kickoff are two tiles (QA 22.2).
    expect(r.preKickoff).toMatchObject({ count: 2, median: 2 });
    expect(r.kickoff).toMatchObject({ count: 2, median: 1 });
    expect(r.toWorking).toMatchObject({ count: 1, median: 5 });
    expect(r.makeItYours).toMatchObject({ count: 1, median: 5 });
    expect(r.launchLag).toMatchObject({ count: 1, median: 4 });
    expect(r.proof).toMatchObject({ count: 1, median: 10 });
    expect(r.total).toMatchObject({ count: 1, median: 29 });
    expect(TTV_TIMINGS.map((t) => t.key)).toHaveLength(9);
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

describe("the TTV report's checks (QA 22)", () => {
  const t = (
    from: string | null,
    to: string,
    at: string,
    source = "ui",
    actor: string | null = "cory",
  ) => ({
    from,
    to,
    at,
    source,
    actor,
  });

  it("measures every tile over one cohort, the deals that closed, and says n of N", () => {
    const r = buildTtvReport([atlantic, miller, prospect], "2026-10-20");
    expect(r.handoff).toMatchObject({ count: 2, of: 2, excluded: 0 });
    expect(r.ttv).toMatchObject({ count: 1, of: 2 });
    expect(r.excluded).toEqual([]);
  });

  it("leaves a deal that graduated without a Go-Live out of Close → Graduate", () => {
    const varley: TtvDeal = {
      ...base,
      id: "4",
      name: "Varley",
      closedAt: "2026-09-07T12:00:00Z",
      completeAt: "2026-09-08T12:00:00Z",
    };
    const r = buildTtvReport([atlantic, varley], "2026-10-20");
    expect(r.total).toMatchObject({ count: 1, of: 2, excluded: 1, median: 29 });
    expect(r.excluded).toContainEqual({
      name: "Varley",
      tile: "Total duration",
      reason: EXCLUSION.noGoLive,
    });
  });

  it("drops backfilled, skipped and bulk-ticked spans, and a negative one as a data error", () => {
    const deal: TtvDeal = {
      ...base,
      id: "5",
      name: "FGP",
      closedAt: "2026-09-07T12:00:00Z",
      preKickoffAt: "2026-09-07T12:00:02Z",
      workingAt: "2026-09-14T12:00:00Z",
      yoursAt: "2026-10-08T18:30:00Z",
      runAt: "2026-10-08T18:31:00Z",
      completeAt: "2026-10-09T12:00:00Z",
      goLiveOn: "2026-10-12",
      transitions: [
        t(null, "closed_won", "2026-09-07T12:00:00Z", "api", "key"),
        t("closed_won", "onboarding_kickoff", "2026-09-07T12:00:02Z", "api", "key"),
        t("onboarding_kickoff", "get_it_working", "2026-09-14T12:00:00Z", "system", null),
        t("get_it_working", "make_it_yours", "2026-10-08T18:30:00Z"),
        t("make_it_yours", "make_it_run", "2026-10-08T18:31:00Z"),
        t("make_it_run", "onboarding_complete", "2026-10-09T12:00:00Z"),
      ],
    };
    const skipper: TtvDeal = {
      ...base,
      id: "6",
      name: "SKO",
      closedAt: "2026-10-01T12:00:00Z",
      workingAt: "2026-10-06T12:00:00Z",
      completeAt: "2026-10-09T12:00:00Z",
      goLiveOn: "2026-10-05",
      transitions: [
        t(null, "closed_won", "2026-10-01T12:00:00Z", "api", "key"),
        t("closed_won", "onboarding_kickoff", "2026-10-01T15:00:00Z"),
        t("onboarding_kickoff", "kickoff", "2026-10-02T15:00:00Z"),
        t("kickoff", "get_it_working", "2026-10-06T12:00:00Z", "ui", "nikki"),
        t("get_it_working", "onboarding_complete", "2026-10-09T12:00:00Z"),
      ],
    };
    const r = buildTtvReport([deal, skipper], "2026-10-20");
    const why = (name: string, tile: string) =>
      r.excluded.find((e) => e.name === name && e.tile === tile)?.reason;
    expect(why("FGP", "Handoff time")).toBe(EXCLUSION.bulk);
    expect(why("FGP", "Time to working")).toBe(EXCLUSION.system);
    expect(why("FGP", "Make-it-yours time")).toBe(EXCLUSION.bulk);
    expect(why("FGP", "Launch lag")).toBeUndefined();
    // Go-Live on Oct 12, Graduate on Oct 9: never clamped to 0.
    expect(why("FGP", "Proof time")).toBe(EXCLUSION.negative);
    expect(r.proof.count).toBe(0);
    expect(why("SKO", "Total duration")).toBe(EXCLUSION.skipped);
    expect(why("SKO", "Proof time")).toBe(EXCLUSION.skipped);
    expect(r.ttv).toMatchObject({ count: 2, of: 2, excluded: 0 });
    expect(r.makeItYours).toMatchObject({ count: 0, of: 2, excluded: 1 });
  });

  it("counts the checklist's own move, written as system when nobody clicked, and drops a backfill", () => {
    // SKO: a person moved it into Kickoff; ticking "Kickoff held" nearly two
    // hours later moved it on through the lifecycle sync (source system, no actor).
    const sko: TtvDeal = {
      ...base,
      id: "7",
      name: "SKO",
      closedAt: "2026-09-30T12:00:00Z",
      preKickoffAt: "2026-10-01T12:00:00Z",
      kickoffAt: "2026-10-06T19:13:43Z",
      workingAt: "2026-10-06T20:59:24Z",
      transitions: [
        t(null, "closed_won", "2026-09-30T12:00:00Z", "api", "key"),
        t("closed_won", "onboarding_kickoff", "2026-10-01T12:00:00Z"),
        t("onboarding_kickoff", "kickoff", "2026-10-06T19:13:43Z"),
        {
          ...t("kickoff", "get_it_working", "2026-10-06T20:59:24Z", "system", null),
          note: "Kickoff held — moved on by the checklist",
        },
      ],
    };
    const placed: TtvDeal = {
      ...base,
      id: "8",
      name: "Placed",
      closedAt: "2026-09-01T12:00:00Z",
      preKickoffAt: "2026-09-02T12:00:00Z",
      kickoffAt: "2026-10-01T04:38:07Z",
      transitions: [
        t(null, "closed_won", "2026-09-01T12:00:00Z", "api", "key"),
        t("closed_won", "onboarding_kickoff", "2026-09-02T12:00:00Z"),
        {
          ...t("onboarding_kickoff", "kickoff", "2026-10-01T04:38:07Z", "system", null),
          note: "Five-stage model (0072): placed by what the plan records",
        },
      ],
    };
    const r = buildTtvReport([sko, placed], "2026-10-20");
    expect(r.preKickoff).toMatchObject({ count: 1, median: 3, excluded: 1 });
    expect(r.kickoff).toMatchObject({ count: 1, median: 0, excluded: 0 });
    expect(r.excluded).toEqual([
      { name: "Placed", tile: "Intake & Process time", reason: EXCLUSION.system },
    ]);
  });

  it("a tick-through into and out of Kickoff is bulk, though the sync wrote the second move", () => {
    // SKO services: moved into Kickoff, then "Kickoff held" ticked 14 seconds later.
    const services: TtvDeal = {
      ...base,
      id: "9",
      name: "SKO services",
      closedAt: "2026-10-06T16:58:12Z",
      preKickoffAt: "2026-10-06T21:52:36Z",
      kickoffAt: "2026-10-07T12:46:28Z",
      workingAt: "2026-10-07T12:46:42Z",
      transitions: [
        t(null, "closed_won", "2026-10-06T16:58:12Z"),
        t("closed_won", "onboarding_kickoff", "2026-10-06T21:52:36Z"),
        t("onboarding_kickoff", "kickoff", "2026-10-07T12:46:28Z"),
        {
          ...t("kickoff", "get_it_working", "2026-10-07T12:46:42Z", "system", null),
          note: "Kickoff held — moved on by the checklist",
        },
      ],
    };
    const r = buildTtvReport([services], "2026-10-20");
    expect(r.kickoff).toMatchObject({ count: 0, excluded: 1 });
    expect(r.excluded).toContainEqual({
      name: "SKO services",
      tile: "Kickoff time",
      reason: EXCLUSION.bulk,
    });
  });
});
