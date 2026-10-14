import { businessDaysBetween } from "./onboarding-timeline";
import type { Timing } from "./pipeline-report";

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
  /** First entry into Kickoff; absent on a deal that went the legacy way. */
  kickoffAt?: string | null;
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
  /**
   * The deal's stage history, oldest first, when the server has it: what
   * lets a span be judged (a backfill, a skipped stage, a bulk tick) and not
   * only measured. Without it every pair of stamps counts as is.
   */
  transitions?: TtvTransition[];
};

export type TtvTransition = {
  from: string | null;
  to: string;
  /** ISO timestamp. */
  at: string;
  /**
   * "ui", "api", "system"…: a system row is a backfill or a mirror, not a
   * move, unless its note says the checklist moved the deal on (see
   * `isBackfill`).
   */
  source: string | null;
  /** The transition's note, which tells a live checklist move from a backfill. */
  note?: string | null;
  /** The person or API key that made the move. */
  actor: string | null;
};

/** A tile's number, over one cohort: the deals that closed in the window. */
export type TtvTiming = Timing & {
  /** The cohort the tile is out of: "n of N". */
  of: number;
  /** Deals that had both stamps but were left out, each with a reason. */
  excluded: number;
};

export type TtvExclusion = { name: string; tile: string; reason: string };

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
  ttv: TtvTiming;
  handoff: TtvTiming;
  preKickoff: TtvTiming;
  kickoff: TtvTiming;
  toWorking: TtvTiming;
  makeItYours: TtvTiming;
  launchLag: TtvTiming;
  proof: TtvTiming;
  total: TtvTiming;
  variance: { vsTier: Variance; vsBaseline: Variance; vsTarget: Variance };
  outcomes: { proven: number; notProven: number; open: number };
  coverage: {
    namedAm: { count: number; ttv: TtvTiming };
    customerSuccess: { count: number; ttv: TtvTiming };
  };
  /** Every deal a tile left out, and why: the panel's data-quality line. */
  excluded: TtvExclusion[];
};

const day = (s: string) => s.slice(0, 10);

type StampKey =
  "closedAt" | "preKickoffAt" | "kickoffAt" | "workingAt" | "yoursAt" | "runAt" | "completeAt";
type Endpoint = StampKey | "goLiveOn";

/** The stages a stamp is the first entry into. */
const STAMP_STAGES: Record<StampKey, readonly string[]> = {
  closedAt: ["closed_won"],
  preKickoffAt: ["onboarding_kickoff"],
  kickoffAt: ["kickoff"],
  workingAt: ["get_it_working", "in_onboarding"],
  yoursAt: ["make_it_yours"],
  runAt: ["make_it_run"],
  completeAt: ["onboarding_complete"],
};

/** Where a stage is entered from when nothing is skipped. */
const ENTERED_FROM: Record<string, readonly string[]> = {
  field_fusion_setup: ["closed_won"],
  onboarding_kickoff: ["closed_won", "field_fusion_setup"],
  kickoff: ["onboarding_kickoff"],
  in_onboarding: ["onboarding_kickoff", "kickoff"],
  get_it_working: ["kickoff", "in_onboarding"],
  make_it_yours: ["get_it_working"],
  make_it_run: ["make_it_yours"],
  onboarding_complete: ["make_it_run"],
};

const ORDER = [
  "prospect",
  "negotiate",
  "closed_won",
  "field_fusion_setup",
  "onboarding_kickoff",
  "kickoff",
  "in_onboarding",
  "get_it_working",
  "make_it_yours",
  "make_it_run",
  "onboarding_complete",
];

/** A forward move that jumped a stage. A move back is not a skip. */
function skipped(t: TtvTransition): boolean {
  const allowed = ENTERED_FROM[t.to];
  if (!allowed || !t.from || allowed.includes(t.from)) return false;
  return ORDER.indexOf(t.from) < ORDER.indexOf(t.to);
}

const HOUR = 3_600_000;

export const EXCLUSION = {
  system: "a backfilled stage date, not a person's move",
  skipped: "skipped a stage",
  bulk: "ticked through in bulk (same person, under an hour)",
  negative: "ends before it starts (data error)",
  noGoLive: "graduated without a Go-Live",
} as const;

/**
 * The checklist's own live moves (stage-flow.server syncDealStage): written
 * as source "system" when nobody clicked (the lifecycle sync, a customer's
 * last welcome answer), but they happen when the deal moves, so they count.
 */
const CHECKLIST_MOVE = /moved on by the checklist$|^Welcome brief generated/i;

/** A system row that is not a live checklist move: a backfill or a mirror. */
function isBackfill(t: TtvTransition): boolean {
  return t.source === "system" && !CHECKLIST_MOVE.test((t.note ?? "").trim());
}

/** The transition a stamp came from, when the history is there. */
function transitionOf(d: TtvDeal, key: Endpoint): { t: TtvTransition; i: number } | null {
  if (key === "goLiveOn" || !d.transitions || !d[key]) return null;
  const i = d.transitions.findIndex((t) => t.at === d[key] && STAMP_STAGES[key].includes(t.to));
  return i < 0 ? null : { t: d.transitions[i]!, i };
}

/**
 * Who made the move at `i`. A checklist move written as system has no actor:
 * it is the sync after a person's click, so the click under an hour before it
 * stands in, and a quick tick-through reads as bulk.
 */
function moverOf(d: TtvDeal, i: number): string | null {
  const t = d.transitions?.[i];
  if (!t) return null;
  if (t.actor) return t.actor;
  const prev = i > 0 ? d.transitions![i - 1] : undefined;
  if (t.source !== "system" || !prev?.actor) return null;
  return Math.abs(Date.parse(t.at) - Date.parse(prev.at)) < HOUR ? prev.actor : null;
}

/** Why this deal's span is left out, or null when it counts. */
function exclusionOf(d: TtvDeal, from: Endpoint, to: Endpoint, days: number): string | null {
  const a = transitionOf(d, from);
  const b = transitionOf(d, to);
  if ((a && isBackfill(a.t)) || (b && isBackfill(b.t))) return EXCLUSION.system;
  if (b && d.transitions) {
    // Every move between the two stamps, and the one into the end stamp.
    const hops = d.transitions.slice(a ? a.i + 1 : b.i, b.i + 1);
    if (hops.some(skipped)) return EXCLUSION.skipped;
  }
  const mover = a ? moverOf(d, a.i) : null;
  if (
    a &&
    b &&
    mover &&
    mover === moverOf(d, b.i) &&
    Math.abs(Date.parse(b.t.at) - Date.parse(a.t.at)) < HOUR
  )
    return EXCLUSION.bulk;
  if (days < 0) return EXCLUSION.negative;
  return null;
}

/**
 * Median, average and slowest, never clamped: a negative span is excluded as
 * a data error before it gets here. (pipeline-report's `timing` clamps to 0
 * for its own report; this one does not share that.)
 */
function spanTiming(rows: Array<{ name: string; days: number }>): Timing {
  const days = rows.map((r) => r.days).sort((a, b) => a - b);
  if (!days.length) return { count: 0, median: null, average: null, slowest: null };
  const mid = Math.floor(days.length / 2);
  const median = days.length % 2 ? days[mid]! : Math.round((days[mid - 1]! + days[mid]!) / 2);
  const slow = [...rows].sort((a, b) => b.days - a.days)[0]!;
  return {
    count: days.length,
    median,
    average: Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10,
    slowest: { name: slow.name, days: slow.days },
  };
}

/**
 * One tile over the cohort (the deals that closed in the window): the deals
 * with both stamps that pass the checks, and the ones left out, each named.
 */
function span(
  cohort: readonly TtvDeal[],
  from: Endpoint,
  to: Endpoint,
  tile: string,
  out: TtvExclusion[],
  extra?: (d: TtvDeal) => string | null,
): TtvTiming {
  const rows: Array<{ name: string; days: number }> = [];
  let excluded = 0;
  for (const d of cohort) {
    if (!d[from] || !d[to]) continue;
    const days = businessDaysBetween(day(d[from] as string), day(d[to] as string));
    const reason = extra?.(d) ?? exclusionOf(d, from, to, days);
    if (reason) {
      excluded += 1;
      out.push({ name: d.name, tile, reason });
      continue;
    }
    rows.push({ name: d.name, days });
  }
  return { ...spanTiming(rows), of: cohort.length, excluded };
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

  // One cohort for every lifecycle tile: the deals that closed in the window.
  const excluded: TtvExclusion[] = [];
  const tile = (key: (typeof TTV_TIMINGS)[number]["key"]) =>
    TTV_TIMINGS.find((t) => t.key === key)!.label;
  const byCoverage = (c: TtvDeal["coverage"]) => {
    const here = closedDeals.filter((d) => d.coverage === c);
    return { count: here.length, ttv: span(here, "closedAt", "goLiveOn", "", []) };
  };

  return {
    asOf: today,
    live: liveDeals.length,
    closed: closedDeals.length,
    ttv: span(closedDeals, "closedAt", "goLiveOn", tile("ttv"), excluded),
    handoff: span(closedDeals, "closedAt", "preKickoffAt", tile("handoff"), excluded),
    preKickoff: span(closedDeals, "preKickoffAt", "kickoffAt", tile("preKickoff"), excluded),
    kickoff: span(closedDeals, "kickoffAt", "workingAt", tile("kickoff"), excluded),
    toWorking: span(closedDeals, "workingAt", "yoursAt", tile("toWorking"), excluded),
    makeItYours: span(closedDeals, "yoursAt", "runAt", tile("makeItYours"), excluded),
    launchLag: span(closedDeals, "runAt", "goLiveOn", tile("launchLag"), excluded),
    proof: span(closedDeals, "goLiveOn", "completeAt", tile("proof"), excluded),
    // Graduate without a Go-Live is not a finished journey: Close → Graduate
    // would be shorter than Close → Go-Live.
    total: span(closedDeals, "closedAt", "completeAt", tile("total"), excluded, (d) =>
      d.goLiveOn ? null : EXCLUSION.noGoLive,
    ),
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
    excluded,
  };
}

/** The nine timings in the model's order, with the words a tile shows. */
export const TTV_TIMINGS: ReadonlyArray<{
  key: keyof Pick<
    TtvReport,
    | "ttv"
    | "handoff"
    | "preKickoff"
    | "kickoff"
    | "toWorking"
    | "makeItYours"
    | "launchLag"
    | "proof"
    | "total"
  >;
  label: string;
  hint: string;
}> = [
  { key: "ttv", label: "Time to value", hint: "Close → Operational Go-Live" },
  { key: "handoff", label: "Handoff time", hint: "Close → Intake & Process" },
  { key: "preKickoff", label: "Intake & Process time", hint: "Intake & Process → Kickoff" },
  { key: "kickoff", label: "Kickoff time", hint: "Kickoff → Get it working" },
  { key: "toWorking", label: "Time to working", hint: "Get it working → Make it yours" },
  { key: "makeItYours", label: "Make-it-yours time", hint: "Make it yours → Make it run" },
  { key: "launchLag", label: "Launch lag", hint: "Make it run → Go-Live" },
  { key: "proof", label: "Proof time", hint: "Go-Live → Graduate" },
  { key: "total", label: "Total duration", hint: "Close → Graduate" },
];
