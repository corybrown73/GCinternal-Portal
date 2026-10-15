import { describe, expect, it } from "vitest";

import { dashboardHeaderFor } from "../customer-dashboard";
import { functionalByDate, planEndDate } from "../date-labels";
import { triageRow } from "../home-triage";
import { fmtDate } from "../hub-format";
import { todayFor, type TodayInput } from "../home-today";
import type { ImplementationRow, TriageBundle } from "../hub-types";
import { needsAction, type DealFacts } from "../needs-action";
import { shortDay } from "../onboarding-timeline";
import { buildProjectTimeline } from "../project-timeline";
import { PLAN_END_SLIP_NEXT, planEndSlip, planEndSlipText } from "../plan-end-slip";
import type { WelcomeView } from "../welcome";

/**
 * Nikki's QA follow-up answers 1, 2, 4 and 5: four dates with one label
 * each, the plan end slipping past the agreed graduation date said to the
 * owner, stage limits labelled as such, and the customer's pages and the
 * kickoff deck naming the same Functional by date.
 */

const deal = (over: Partial<DealFacts> = {}): DealFacts => ({
  id: "d1",
  name: "Summit NL",
  stage: "make_it_yours",
  business_days_in_stage: 3,
  has_notes: true,
  has_sow: true,
  owner_name: "Dana",
  core_booked: true,
  next_step: "Stage 2 — Make it yours",
  overdue_calls: [],
  watch_outs: [],
  ...over,
});

const impl = (over: Partial<ImplementationRow> = {}): ImplementationRow => ({
  id: "i1",
  name: "Summit Ridge",
  customer_id: "c1",
  customer_name: "Summit Ridge",
  segment: null,
  industry: null,
  arr: 24000,
  current_stage: "build",
  deal_stage: "make_it_yours",
  deal_id: "d1",
  stage_entered_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  status: "on_track",
  health_recorded: null,
  health_recorded_reason: null,
  owner_name: "Dana",
  tier: null,
  target_launch_date: null,
  actual_launch_date: null,
  overdue_commitments: 0,
  open_escalations: 0,
  ...over,
});

const bundle = (d: DealFacts | null): TriageBundle => ({
  implementation_id: "i1",
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
  deal: d,
});

describe("one source under the label Plan end (answer 1)", () => {
  // A hand edit on a project a deal's plan keeps moves target_launch_date
  // alone; every "Plan end" still reads target_date first.
  const edited = { target_date: "2026-11-18", target_launch_date: "2026-12-01" };

  it("reads target_date before target_launch_date", () => {
    expect(planEndDate(edited)).toBe("2026-11-18");
    expect(planEndDate({ target_date: null, target_launch_date: "2026-12-01" })).toBe("2026-12-01");
    expect(planEndDate({})).toBeNull();
  });

  it("puts the same plan end on the project rail and At a glance", () => {
    const t = buildProjectTimeline(
      { id: "i1", name: "Summit", current_stage: "kickoff", ...edited },
      new Date("2026-10-15T12:00:00Z"),
    );
    expect(t.targetLaunchDate).toBe("2026-11-18");
  });

  it("puts the same plan end on a Home row's impact line", () => {
    const row = triageRow(
      impl({ target_launch_date: "2026-12-01", plan_end: "2026-11-18" }),
      bundle(null),
    );
    expect(row.impact).toContain(`plan end ${fmtDate("2026-11-18")}`);
    expect(row.impact).not.toContain(fmtDate("2026-12-01"));
  });
});

describe("plan end after the graduation date agreed with the customer (answer 2)", () => {
  it("is a slip only when the plan end is later than the agreed date", () => {
    expect(planEndSlip({ planEnd: "2026-12-10", agreed: "2026-12-04" })).toEqual({
      planEnd: "2026-12-10",
      agreed: "2026-12-04",
    });
    expect(planEndSlip({ planEnd: "2026-12-04", agreed: "2026-12-04" })).toBeNull();
    expect(planEndSlip({ planEnd: "2026-11-18", agreed: "2026-12-04" })).toBeNull();
  });

  it("says nothing without both dates, and never for a partner", () => {
    expect(planEndSlip({ planEnd: "2026-12-10", agreed: null })).toBeNull();
    expect(planEndSlip({ planEnd: null, agreed: "2026-12-04" })).toBeNull();
    expect(planEndSlip({ planEnd: "2026-12-10", agreed: "2026-12-04", partner: true })).toBeNull();
  });

  it("names both dates in Nikki's words", () => {
    expect(planEndSlipText({ planEnd: "2026-12-10", agreed: "2026-12-04" })).toBe(
      `Plan end ${shortDay("2026-12-10")} is after the graduation date agreed with the customer (${shortDay("2026-12-04")})`,
    );
  });

  it("puts the owner's Home row in Keep an eye on with the next step, and changes neither date", () => {
    const facts = deal({ plan_end: "2026-12-10", agreed_graduation: "2026-12-04" });
    const before = JSON.stringify(facts);
    const r = needsAction(facts);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      bucket: "needs_attention",
      reason: planEndSlipText({ planEnd: "2026-12-10", agreed: "2026-12-04" }),
      next: PLAN_END_SLIP_NEXT,
      tab: "implementation",
    });
    expect(r[0]!.threshold).toBeUndefined();
    // Read only: the facts it was given are untouched.
    expect(JSON.stringify(facts)).toBe(before);
    const row = triageRow(impl(), bundle(facts));
    expect(row.bucket).toBe("needs_attention");
    expect(row.next_action).toBe(PLAN_END_SLIP_NEXT);
  });

  it("is silent when the plan is inside the agreed date, nothing is agreed, or the deal is a partner's", () => {
    expect(needsAction(deal({ plan_end: "2026-11-18", agreed_graduation: "2026-12-04" }))).toEqual(
      [],
    );
    expect(needsAction(deal({ plan_end: "2026-12-10", agreed_graduation: null }))).toEqual([]);
    expect(
      needsAction(deal({ plan_end: "2026-12-10", agreed_graduation: "2026-12-04", partner: true })),
    ).toEqual([]);
  });
});

describe("stage limit dates on Home attention (answer 4)", () => {
  // Thursday 1 October 2026.
  const entered = "2026-10-01";

  it("dates a stuck deal from its stage entry plus the stage's warn limit", () => {
    // Closed Won warns at 3 business days: Thu 1 → Tue 6.
    const r = needsAction(
      deal({ stage: "closed_won", business_days_in_stage: 4, stage_entered_on: entered }),
    );
    const stuck = r.find((x) => x.reason.startsWith("Stuck"))!;
    expect(stuck.threshold).toBe("2026-10-06");
  });

  it("dates 'nobody owns it' and 'needs a TIS' one business day after the stage entry", () => {
    const owner = needsAction(
      deal({
        stage: "closed_won",
        owner_name: null,
        business_days_in_stage: 1,
        stage_entered_on: entered,
      }),
    ).find((x) => x.reason.startsWith("Nobody owns it"))!;
    expect(owner.threshold).toBe("2026-10-02");
    const tis = needsAction(
      deal({
        stage: "negotiate",
        owner_name: null,
        business_days_in_stage: 2,
        stage_entered_on: entered,
      }),
    ).find((x) => x.reason.startsWith("Needs a TIS"))!;
    expect(tis.threshold).toBe("2026-10-02");
  });

  it("dates a missing SOW or brief, and an unbooked kickoff, from the stage's warn limit", () => {
    const missing = needsAction(
      deal({ stage: "closed_won", has_sow: false, stage_entered_on: entered }),
    ).find((x) => x.reason.startsWith("No "))!;
    expect(missing.threshold).toBe("2026-10-06");
    // Intake & Process warns at 5 business days: Thu 1 → Thu 8.
    const kickoff = needsAction(
      deal({ stage: "onboarding_kickoff", core_booked: false, stage_entered_on: entered }),
    ).find((x) => x.reason === "Core meetings not booked")!;
    expect(kickoff.threshold).toBe("2026-10-08");
  });

  it("gives a partner deal's missing SOW no stage-age limit (answer 6)", () => {
    const missing = needsAction(
      deal({ stage: "closed_won", has_sow: false, partner: true, stage_entered_on: entered }),
    ).find((x) => x.reason.startsWith("No "))!;
    expect(missing).toBeDefined();
    expect(missing.threshold).toBeUndefined();
  });

  it("gives no stage limit to a scheduled call, a watch-out or a meeting update, or without an entry day", () => {
    const r = needsAction(
      deal({
        stage_entered_on: entered,
        overdue_calls: [{ label: "Stage 2 call", date: "2026-09-22", businessDaysLate: 1 }],
        watch_outs: [{ title: "Missed SOW go-live Oct 30", detail: "The plan goes live Nov 6." }],
        pending_proposals: 2,
      }),
    );
    expect(r.every((x) => x.threshold === undefined)).toBe(true);
    const noEntry = needsAction(deal({ stage: "closed_won", business_days_in_stage: 4 }));
    expect(noEntry.find((x) => x.reason.startsWith("Stuck"))!.threshold).toBeUndefined();
  });

  it("orders by severity, unchanged by the dates", () => {
    const r = needsAction(
      deal({
        stage: "closed_won",
        owner_name: null,
        business_days_in_stage: 6,
        has_sow: false,
        stage_entered_on: entered,
      }),
    );
    expect(r.map((x) => x.rank)).toEqual([...r.map((x) => x.rank)].sort((a, b) => a - b));
  });

  it("carries the limit to the Home card as 'Stage limit', never as Due; a scheduled call keeps its Due", () => {
    const TODAY = "2026-10-09";
    const stuckFacts = deal({
      stage: "closed_won",
      business_days_in_stage: 6,
      next_step: null,
      stage_entered_on: entered,
    });
    const stuckRow = triageRow(impl({ deal_stage: "closed_won" }), bundle(stuckFacts));
    expect(stuckRow.threshold).toBe("2026-10-06");

    const callFacts = deal({
      overdue_calls: [{ label: "Stage 2 call", date: "2026-10-07", businessDaysLate: 2 }],
      stage_entered_on: entered,
    });
    const callRow = triageRow(
      impl({ id: "i2", customer_id: "c2", customer_name: "Delta Mining" }),
      bundle(callFacts),
    );

    const input: TodayInput = {
      queue: {
        act_now: [stuckRow, callRow].filter((r) => r.bucket === "act_now"),
        needs_attention: [stuckRow, callRow].filter((r) => r.bucket === "needs_attention"),
        moving: [],
      },
      health: new Map(),
      dealInbox: [],
      commitments: [],
      today: TODAY,
    };
    const t = todayFor(input);
    const rows = [...t.needsMe, ...t.watch];
    const stuck = rows.find((r) => r.id === "i1")!;
    expect(stuck.due).toBeNull();
    expect(stuck.stageLimit).toEqual({ date: "2026-10-06", label: "Oct 6", tone: "warning" });
    const call = rows.find((r) => r.id === "i2")!;
    expect(call.nextStep).toBe("Tick Stage 2 call if it happened, or rebook it");
    expect(call.due).not.toBeNull();
    expect(call.stageLimit).toBeNull();
  });
});

describe("Functional by: one date on the deck and the customer's page (answer 5)", () => {
  const view = (over: Record<string, unknown> = {}) =>
    ({
      journey: null,
      timeline: { liveDate: "2026-10-26", liveDoneOn: null, milestones: [] },
      partner: null,
      partnerUnavailable: false,
      partnerDeal: false,
      ...over,
    }) as unknown as WelcomeView;

  it("is the plan's live date, or the day it was ticked", () => {
    expect(functionalByDate({ liveDate: "2026-10-26", liveDoneOn: null })).toBe("2026-10-26");
    expect(functionalByDate({ liveDate: "2026-10-26", liveDoneOn: "2026-10-22" })).toBe(
      "2026-10-22",
    );
  });

  it("is on the customer's dashboard header, and not on a partner's", () => {
    expect(dashboardHeaderFor(view()).functionalBy).toBe("2026-10-26");
    expect(dashboardHeaderFor(view({ partnerDeal: true })).functionalBy).toBeNull();
  });
});
