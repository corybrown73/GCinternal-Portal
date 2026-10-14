import { describe, expect, it } from "vitest";

import { isUnclaimed } from "../claimed-owner";
import { todayFor } from "../home-today";
import { buildQueue, healthByImplementation } from "../home-triage";
import type { ImplementationRow, LeadershipData, TriageBundle } from "../hub-types";
import { portfolioRollup } from "../leadership";
import type { DealFacts } from "../needs-action";
import { buildPipelineReport, type ReportDeal } from "../pipeline-report";
import type { DealInboxRow } from "../presale.server";
import type { AccountStage } from "../presale-stages";
import { stuckLevel } from "../stage-flow";
import { excludeTests, isTestAccount } from "../test-accounts";

/**
 * One count (QA 7, 10.1): one fixture book read by the pure functions behind
 * Home (todayFor), Reports (portfolioRollup), the Customers list (health per
 * project), the Pipeline board (isUnclaimed per card) and the MCP
 * pipeline_report (buildPipelineReport), and every surface agrees on Need
 * attention, Unclaimed and On track.
 *
 * The inbox rows and Reports' unclaimed deals are built here as the loaders
 * build them; one-book.test.ts runs the loaders themselves (loadDealInbox,
 * loadLeadership, loadImplementations) on a fake database.
 */

const TODAY = "2026-10-13";
const LONG_AGO = "2026-08-01T12:00:00Z";

type Deal = {
  id: string;
  name: string;
  stage: AccountStage;
  owner: string | null;
  is_test?: boolean;
  /** The deal's own clock and facts; absent before a project. */
  facts?: Partial<DealFacts>;
  /** The project, once there is one. */
  project?: { id: string; owner: string | null };
};

const DEALS: Deal[] = [
  // Claimed and quiet. Its project entered its stage long ago (calendar
  // clock), but the deal moved a day ago: one clock says on track.
  {
    id: "dA",
    name: "Atlas",
    stage: "get_it_working",
    owner: "Teya",
    project: { id: "iA", owner: "Teya" },
  },
  // Unclaimed, before a project.
  { id: "dB", name: "Birch", stage: "closed_won", owner: null },
  // Unclaimed, with a project: one row on Home, not two.
  {
    id: "dC",
    name: "Cedar",
    stage: "closed_won",
    owner: null,
    facts: { business_days_in_stage: 2 },
    project: { id: "iC", owner: null },
  },
  // Graduated with nobody on it: not unclaimed, not stalled.
  {
    id: "dD",
    name: "Dune",
    stage: "onboarding_complete",
    owner: null,
    project: { id: "iD", owner: null },
  },
  // A test account: in no count.
  {
    id: "dE",
    name: "Echo (test)",
    stage: "closed_won",
    owner: null,
    is_test: true,
    facts: { business_days_in_stage: 4 },
    project: { id: "iE", owner: null },
  },
  // Act now: a plan call four business days late.
  {
    id: "dF",
    name: "Fjord",
    stage: "make_it_yours",
    owner: "Saadiya",
    facts: {
      overdue_calls: [
        { label: "Stage 2 — Make it yours", date: "2026-10-07", businessDaysLate: 4 },
      ],
    },
    project: { id: "iF", owner: "Saadiya" },
  },
  // Keep an eye on: no SOW on the deal.
  {
    id: "dG",
    name: "Gale",
    stage: "get_it_working",
    owner: "Cory",
    facts: { has_sow: false },
    project: { id: "iG", owner: "Cory" },
  },
  // Closed today with nobody on it: "Nobody owns it" waits a business day,
  // so the deal's own Unclaimed row speaks for it until then.
  {
    id: "dH",
    name: "Hollow",
    stage: "closed_won",
    owner: null,
    facts: { business_days_in_stage: 0 },
    project: { id: "iH", owner: null },
  },
  // A partner deal past Closed Won's limit: its milestones speak, not the
  // stage's age, so it is not stuck.
  {
    id: "dI",
    name: "Ivy",
    stage: "closed_won",
    owner: "Teya",
    facts: { business_days_in_stage: 9, partner: true },
    project: { id: "iI", owner: "Teya" },
  },
  // On track and going live next week: My book shows it under Going live.
  {
    id: "dJ",
    name: "Jade",
    stage: "get_it_working",
    owner: "Cory",
    facts: { live_date: "2026-10-20" },
    project: { id: "iJ", owner: "Cory" },
  },
];

function factsOf(d: Deal): DealFacts {
  return {
    id: d.id,
    name: d.name,
    stage: d.stage,
    business_days_in_stage: 1,
    has_notes: true,
    has_sow: true,
    owner_name: d.owner,
    core_booked: true,
    next_step: null,
    overdue_calls: [],
    watch_outs: [],
    upcoming_calls: [],
    close_date: null,
    live_date: null,
    pending_proposals: 0,
    ...d.facts,
  };
}

function projectOf(d: Deal): ImplementationRow {
  return {
    id: d.project!.id,
    name: d.name,
    customer_id: `c-${d.id}`,
    customer_name: d.name,
    segment: null,
    industry: null,
    arr: null,
    current_stage: "build",
    deal_stage: d.stage,
    deal_id: d.id,
    stage_entered_at: LONG_AGO,
    status: "on_track",
    health_recorded: null,
    health_recorded_reason: null,
    owner_name: d.project!.owner,
    tier: null,
    target_launch_date: null,
    actual_launch_date: null,
    overdue_commitments: 0,
    open_escalations: 0,
    is_test: d.is_test ?? false,
  };
}

const bundleOf = (d: Deal): TriageBundle => ({
  implementation_id: d.project!.id,
  commitments: [],
  risks: [],
  issues: [],
  escalations: [],
  milestones: [],
  decisions: [],
  success_criteria: [],
  technical_solutions: [],
  approvals: [],
  adoption: [],
  deal: factsOf(d),
});

// Every loader leaves test accounts out before any surface counts.
const book = excludeTests(DEALS, (d) => isTestAccount(d));
const withProject = book.filter((d) => d.project);
const implementations = withProject.map(projectOf);
const triage = withProject.map(bundleOf);

// Home's deal inbox: the deals before kickoff, as loadDealInbox lists them ("all").
const inbox: DealInboxRow[] = book
  .filter((d) => ["negotiate", "closed_won", "onboarding_kickoff"].includes(d.stage))
  .map((d) => ({
    id: d.id,
    name: d.name,
    stage: d.stage,
    stage_label: d.stage,
    stage_entered_at: "2026-10-09T12:00:00Z",
    path: "new_logo",
    owner_name: d.owner,
    mine: false,
    unclaimed: isUnclaimed(d.stage, d.owner),
    next_step: null,
  }));

const leadership = {
  implementations,
  triage,
  commitments: [],
  signal: [],
  stage_history: [],
  graduation_candidates: [],
  unclaimed_deals: book
    .filter((d) => !d.project && isUnclaimed(d.stage, d.owner))
    .map((d) => ({ deal_id: d.id, name: d.name, stage: d.stage })),
} as LeadershipData;

const reportDeals: ReportDeal[] = book.map((d) => {
  const f = factsOf(d);
  return {
    id: d.id,
    name: d.name,
    stage: d.stage,
    owner: d.owner,
    nextStep: null,
    stuck: stuckLevel(d.stage, f.business_days_in_stage),
    businessDaysInStage: f.business_days_in_stage,
    hasGongBrief: true,
    hasSow: f.has_sow,
    hasAiBrief: true,
    closedAt: null,
    onboardingAt: null,
    liveOn: null,
    lastActivityAt: `${TODAY}T09:00:00Z`,
  };
});

const queue = buildQueue(implementations, triage);
const health = healthByImplementation(implementations, triage);
const home = todayFor({ queue, health, dealInbox: inbox, commitments: [], today: TODAY });
const reports = portfolioRollup(leadership);
const report = buildPipelineReport(reportDeals, TODAY);

describe("one fixture, one count on every screen", () => {
  it("sorts the book the same way everywhere", () => {
    expect(queue.act_now.map((r) => r.impl.customer_name).sort()).toEqual(["Cedar", "Fjord"]);
    expect(queue.needs_attention.map((r) => r.impl.customer_name)).toEqual(["Gale"]);
    expect(queue.moving.map((r) => r.impl.customer_name).sort()).toEqual([
      "Atlas",
      "Dune",
      "Hollow",
      "Ivy",
      "Jade",
    ]);
  });

  it("agrees on Need attention: Home and Reports count act now plus each unclaimed deal not already act now, once", () => {
    expect(home.tiles.needAttention).toBe(4);
    expect(home.needsMe.map((r) => r.name).sort()).toEqual(["Birch", "Cedar", "Fjord", "Hollow"]);
    expect(reports.act_now).toBe(2);
    expect(reports.need_attention).toBe(home.tiles.needAttention);
    // Hollow closed today: its own Unclaimed row, not dropped for its project.
    expect(home.needsMe.find((r) => r.name === "Hollow")!.chip.label).toBe("Unclaimed");
    // Cedar: the project's row, which says nobody owns it.
    const cedar = home.needsMe.filter((r) => r.name === "Cedar");
    expect(cedar).toHaveLength(1);
    expect(cedar[0]!.kind).toBe("implementation");
    expect(cedar[0]!.nextStep).toMatch(/^Assign an owner/);
    // My book's red segment is act now plus Hollow's project, which Need
    // attention says by its deal's row.
    expect(home.book.needAttention).toBe(reports.act_now + 1);
  });

  it("says each account once: an unclaimed deal kept in Need attention takes its project off the other lists", () => {
    const listed = [...home.needsMe, ...home.watch, ...home.onTrackRows, ...home.waitingOnRows].map(
      (r) => r.name,
    );
    expect(listed.filter((n) => n === "Hollow")).toHaveLength(1);
    expect(home.onTrackRows.map((r) => r.name)).not.toContain("Hollow");
    // Home: the tiles add up to the book plus the deals with no project yet.
    const noProject = inbox.filter(
      (d) => d.unclaimed && !book.find((b) => b.id === d.id)?.project,
    ).length;
    expect(home.tiles.needAttention + home.watch.length + home.tiles.onTrack).toBe(
      home.book.total + noProject,
    );
    // Reports: the same identity.
    expect(reports.need_attention + reports.keep_an_eye_on + reports.on_track).toBe(
      reports.total + reports.unassigned_deals,
    );
  });

  it("a partner deal past its stage's limit is not stuck on Home, Reports or the Customers list", () => {
    const ivy = [...queue.act_now, ...queue.needs_attention, ...queue.moving].find(
      (r) => r.impl.customer_name === "Ivy",
    )!;
    expect(ivy.bucket).toBe("moving");
    expect(health.get("iI")!.level).not.toBe("at_risk");
  });

  it("in 'mine', an unowned deal outside my queue keeps its own row", () => {
    const mineImpls = implementations.filter((i) => i.owner_name === "Cory");
    const mineTriage = triage.filter((t) => mineImpls.some((i) => i.id === t.implementation_id));
    const mineQueue = buildQueue(mineImpls, mineTriage);
    const mine = todayFor({
      queue: mineQueue,
      health: healthByImplementation(mineImpls, mineTriage),
      dealInbox: inbox.filter((d) => d.unclaimed),
      commitments: [],
      today: TODAY,
    });
    expect(mine.needsMe.map((r) => r.name).sort()).toEqual(["Birch", "Cedar", "Hollow"]);
    expect(mine.tiles.needAttention).toBe(3);
    // My book's "Act now" is my act-now rows only: none here.
    expect(mine.book.needAttention).toBe(0);
  });

  it("agrees on Unclaimed: Home, Reports, the board and pipeline_report name the same deals", () => {
    const board = book.filter((d) => isUnclaimed(d.stage, d.owner)).map((d) => d.name);
    const mcp = report.unclaimed.map((u) => u.name);
    const onHome = home.needsMe
      .filter((r) => r.chip.label === "Unclaimed" || r.reason.startsWith("Nobody owns it"))
      .map((r) => r.name);
    expect(board.sort()).toEqual(["Birch", "Cedar", "Hollow"]);
    expect(mcp.sort()).toEqual(board);
    expect(onHome.sort()).toEqual(board);
    expect(reports.unassigned).toBe(board.length);
  });

  it("agrees on On track: the tile and Reports are the moving bucket; My book's part leaves out what is going live", () => {
    // Hollow's project is said by its deal's Unclaimed row, not here.
    expect(home.tiles.onTrack).toBe(4);
    expect(reports.on_track).toBe(home.tiles.onTrack);
    expect(reports.moving).toBe(queue.moving.length);
    // Jade goes live next week: My book counts it once, under Going live.
    expect(home.book.launching).toBe(1);
    expect(home.book.moving).toBe(home.tiles.onTrack - home.book.launching);
    expect(home.book.watch).toBe(reports.keep_an_eye_on);
    const b = home.book;
    expect(b.needAttention + b.waitingOn + b.watch + b.moving + b.launching).toBe(b.total);
  });

  it("the Customers list reads the same health as Reports, and act now is never calmer than at risk", () => {
    const levels = implementations.map((i) => health.get(i.id)!.level);
    const count = (l: string) => levels.filter((x) => x === l).length;
    expect(reports.health).toEqual({
      blocked: count("blocked"),
      at_risk: count("at_risk"),
      on_track: count("on_track"),
      no_signal: count("no_signal"),
    });
    for (const r of queue.act_now)
      expect(["at_risk", "blocked"]).toContain(health.get(r.impl.id)!.level);
    // One stall clock: Atlas's project row is weeks old, the deal moved a day ago.
    expect(health.get("iA")!.level).not.toBe("at_risk");
  });

  it("leaves the test account out of every count", () => {
    const names = [
      ...home.needsMe.map((r) => r.name),
      ...report.unclaimed.map((u) => u.name),
      ...implementations.map((i) => i.customer_name),
    ];
    expect(names.some((n) => n.includes("Echo"))).toBe(false);
    expect(reports.total).toBe(8);
  });
});
