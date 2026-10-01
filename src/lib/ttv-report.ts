import { businessDaysBetween } from "./onboarding-timeline";
import { timing, type Timing } from "./pipeline-report";

/**
 * Time to value, as the operating model measures it. Every number is
 * business days between two stamps the Hub already keeps: the stage
 * transitions (when a deal entered each of the five stages) and the
 * project's dates (Go-Live, the tier-expected Go-Live, the baseline, the
 * target). Pure: the server gathers one row per deal, this counts.
 *
 * Variance is kept separate per reference date — "slower than the tier
 * said", "slower than we agreed", "slower than the plan says now" are three
 * different conversations — and the dates are never averaged into one.
 */
export type TtvDeal = {
  id: string;
  name: string;
  owner: string | null;
  /** ISO timestamps: when the deal entered each stage. */
  closedAt: string | null;
  preKickoffAt: string | null;
  workingAt: string | null;
  yoursAt: string | null;
  runAt: string | null;
  completeAt: string | null;
  /** ISO dates from the project row. */
  goLiveOn: string | null;
  tierExpectedOn: string | null;
  baselineOn: string | null;
  targetOn: string | null;
  outcome: "proven" | "not_proven" | null;
  /** Who covers the account after launch. */
  coverage: "named_am" | "customer_success";
};

export type Variance = {
  count: number;
  /** Signed business days, positive = late. */
  median: number | null;
  average: number | null;
  late: number;
  worst: { name: string; days: number } | null;
};

export type TtvReport = {
  asOf: string;
  /** Deals that have gone live, over all deals that closed. */
  live: number;
  closed: number;
  ttv: Timing;
  handoff: Timing;
  preKickoff: Timing;
  toWorking: Timing;
  makeItYours: Timing;
  launchLag: Timing;
  proof: Timing;
  total: Timing;
  variance: { vsTier: Variance; vsBaseline: Variance; vsTarget: Variance };
  outcomes: { proven: number; notProven: number; open: number };
  coverage: {
    namedAm: { count: number; ttv: Timing };
    customerSuccess: { count: number; ttv: Timing };
  };
};

const day = (s: string) => s.slice(0, 10);

function span(
  deals: readonly TtvDeal[],
  from: keyof TtvDeal,
  to: keyof TtvDeal,
  inWindow: (d: TtvDeal) => boolean,
): Timing {
  return timing(
    deals
      .filter((d) => d[from] && d[to] && inWindow(d))
      .map((d) => ({
        name: d.name,
        days: businessDaysBetween(day(d[from] as string), day(d[to] as string)),
      })),
  );
}

function variance(rows: Array<{ name: string; days: number }>): Variance {
  const days = rows.map((r) => r.days).sort((a, b) => a - b);
  if (!days.length) return { count: 0, median: null, average: null, late: 0, worst: null };
  const mid = Math.floor(days.length / 2);
  const median = days.length % 2 ? days[mid]! : Math.round((days[mid - 1]! + days[mid]!) / 2);
  const worst = [...rows].sort((a, b) => b.days - a.days)[0]!;
  return {
    count: days.length,
    median,
    average: Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10,
    late: days.filter((d) => d > 0).length,
    worst: worst.days > 0 ? worst : null,
  };
}

export function buildTtvReport(
  deals: readonly TtvDeal[],
  today: string,
  opts: { since?: string | null } = {},
): TtvReport {
  const since = opts.since ?? null;
  const inWindow = (d: TtvDeal) => !since || (d.closedAt ?? "") >= since;
  const closedDeals = deals.filter((d) => d.closedAt && inWindow(d));
  const liveDeals = closedDeals.filter((d) => d.goLiveOn);

  const vs = (ref: "tierExpectedOn" | "baselineOn" | "targetOn") =>
    variance(
      liveDeals
        .filter((d) => d[ref])
        .map((d) => ({
          name: d.name,
          days: businessDaysBetween(d[ref] as string, d.goLiveOn!),
        })),
    );

  const byCoverage = (c: TtvDeal["coverage"]) => {
    const here = closedDeals.filter((d) => d.coverage === c);
    return { count: here.length, ttv: span(here, "closedAt", "goLiveOn", () => true) };
  };

  return {
    asOf: today,
    live: liveDeals.length,
    closed: closedDeals.length,
    ttv: span(deals, "closedAt", "goLiveOn", inWindow),
    handoff: span(deals, "closedAt", "preKickoffAt", inWindow),
    preKickoff: span(deals, "preKickoffAt", "workingAt", inWindow),
    toWorking: span(deals, "workingAt", "yoursAt", inWindow),
    makeItYours: span(deals, "yoursAt", "runAt", inWindow),
    launchLag: span(deals, "runAt", "goLiveOn", inWindow),
    proof: span(deals, "goLiveOn", "completeAt", inWindow),
    total: span(deals, "closedAt", "completeAt", inWindow),
    variance: {
      vsTier: vs("tierExpectedOn"),
      vsBaseline: vs("baselineOn"),
      vsTarget: vs("targetOn"),
    },
    outcomes: {
      proven: closedDeals.filter((d) => d.outcome === "proven").length,
      notProven: closedDeals.filter((d) => d.outcome === "not_proven").length,
      open: closedDeals.filter((d) => !d.outcome).length,
    },
    coverage: { namedAm: byCoverage("named_am"), customerSuccess: byCoverage("customer_success") },
  };
}

/** The eight timings in the model's order, with the words a tile shows. */
export const TTV_TIMINGS: ReadonlyArray<{
  key: keyof Pick<
    TtvReport,
    "ttv" | "handoff" | "preKickoff" | "toWorking" | "makeItYours" | "launchLag" | "proof" | "total"
  >;
  label: string;
  hint: string;
}> = [
  { key: "ttv", label: "Time to value", hint: "Close → Operational Go-Live" },
  { key: "handoff", label: "Handoff time", hint: "Close → Pre-Kickoff" },
  { key: "preKickoff", label: "Pre-Kickoff time", hint: "Pre-Kickoff → Get it working" },
  { key: "toWorking", label: "Time to working", hint: "Get it working → Make it yours" },
  { key: "makeItYours", label: "Make-it-yours time", hint: "Make it yours → Make it run" },
  { key: "launchLag", label: "Launch lag", hint: "Make it run → Go-Live" },
  { key: "proof", label: "Proof time", hint: "Go-Live → Implementation Complete" },
  { key: "total", label: "Total duration", hint: "Close → Implementation Complete" },
];
