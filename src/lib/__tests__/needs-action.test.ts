import { describe, expect, it } from "vitest";

import { healthByImplementation, triageRow } from "../home-triage";
import type { ImplementationRow, TriageBundle } from "../hub-types";
import { healthFloor, needsAction, type DealFacts } from "../needs-action";

const deal = (over: Partial<DealFacts> = {}): DealFacts => ({
  id: "d1",
  name: "QA TEST – Summit NL",
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
  // Two days ago, whatever today is: a fixed date here tripped the 14-day
  // stall rule the day the calendar caught up with it, and the whole suite
  // went red for everyone at once.
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

describe("what a deal needs, from its own facts", () => {
  it("is quiet when the deal is fine", () => {
    expect(needsAction(deal())).toEqual([]);
    expect(needsAction(null)).toEqual([]);
    expect(needsAction(deal({ stage: "prospect", has_sow: false }))).toEqual([]);
  });

  it("names a missed SOW date and a stakeholder out during a stage, as act now", () => {
    const r = needsAction(
      deal({
        watch_outs: [
          { title: "Missed SOW go-live Oct 30", detail: "The plan goes live Nov 6." },
          { title: "Priya out during Stage 3", detail: "Out Oct 12–16; Stage 3 is Oct 14." },
        ],
      }),
    );
    expect(r[0]!.bucket).toBe("act_now");
    expect(r[0]!.reason).toBe("Missed SOW go-live Oct 30 · Priya out during Stage 3");
    expect(healthFloor(r)).toBe("at_risk");
  });

  it("escalates an overdue plan call after three business days, flags it before", () => {
    const soon = needsAction(
      deal({ overdue_calls: [{ label: "Stage 2 call", date: "2026-09-22", businessDaysLate: 1 }] }),
    );
    expect(soon[0]).toMatchObject({ bucket: "needs_attention" });
    expect(soon[0]!.reason).toMatch(/Stage 2 call was due .*Sep 22 · 1 business day late/);
    const late = needsAction(
      deal({ overdue_calls: [{ label: "Stage 2 call", date: "2026-09-18", businessDaysLate: 4 }] }),
    );
    expect(late[0]).toMatchObject({ bucket: "act_now" });
  });

  it("wants an owner from the first business day after the close, and a SOW and brief", () => {
    const r = needsAction(
      deal({
        stage: "closed_won",
        owner_name: null,
        business_days_in_stage: 1,
        has_sow: false,
        has_notes: false,
      }),
    );
    expect(r.map((x) => x.reason)).toEqual([
      "Nobody owns it · closed 1 business day ago",
      "No Gong brief, SOW or contract on the deal",
    ]);
    expect(
      needsAction(deal({ stage: "closed_won", owner_name: null, business_days_in_stage: 0 })),
    ).toEqual([]);
  });

  it("asks for the SOW or contract from Closed Won through Kickoff, not once the project is being delivered", () => {
    const paperwork = (stage: DealFacts["stage"]) =>
      needsAction(deal({ stage, has_sow: false, business_days_in_stage: 1 })).find((x) =>
        x.reason.includes("SOW or contract"),
      );
    for (const stage of ["closed_won", "field_fusion_setup", "onboarding_kickoff", "kickoff"]) {
      const r = paperwork(stage as DealFacts["stage"]);
      expect(r, stage).toMatchObject({
        reason: "No SOW or contract on the deal",
        next: "Add the SOW or contract",
      });
    }
    for (const stage of ["negotiate", "get_it_working", "make_it_yours", "make_it_run"]) {
      expect(paperwork(stage as DealFacts["stage"]), stage).toBeUndefined();
    }
    // A missing Gong brief is still asked for later on; only the paperwork stops.
    const later = needsAction(deal({ stage: "make_it_run", has_sow: false, has_notes: false }));
    expect(later.map((x) => x.reason)).toContain("No Gong brief on the deal");
  });

  it("counts the meeting updates nobody has reviewed, linking to Current Implementation", () => {
    const r = needsAction(deal({ pending_proposals: 3 }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      bucket: "needs_attention",
      reason: "3 meeting updates to review",
      tab: "implementation",
      next: "Review the meeting updates",
    });
    expect(needsAction(deal({ pending_proposals: 1 }))[0]!.reason).toBe(
      "1 meeting update to review",
    );
    expect(needsAction(deal({ pending_proposals: 0 }))).toEqual([]);
    // Home's row carries the tab through, so the link lands on the panel.
    const row = triageRow(impl(), bundle(deal({ pending_proposals: 2 })));
    expect(row.tab).toBe("implementation");
    expect(row.reason).toBe("2 meeting updates to review");
  });

  it("says when the core meetings are still unbooked in Pre-kickoff, and when it is stuck", () => {
    const r = needsAction(
      deal({ stage: "onboarding_kickoff", core_booked: false, business_days_in_stage: 2 }),
    );
    expect(r.map((x) => x.reason)).toEqual(["Core meetings not booked"]);
    const stuck = needsAction(deal({ stage: "onboarding_kickoff", business_days_in_stage: 30 }));
    expect(stuck[0]!.reason).toMatch(/^Stuck 30 business days in Intake & Process/);
  });
});

describe("Home's triage with the deal's facts", () => {
  it("puts a missed date and a PTO overlap in act now, and the health chip at risk", () => {
    const facts = deal({
      watch_outs: [{ title: "Missed SOW go-live Oct 30", detail: "The plan goes live Nov 6." }],
    });
    const row = triageRow(impl(), bundle(facts));
    expect(row.bucket).toBe("act_now");
    expect(row.reason).toBe("Missed SOW go-live Oct 30");
    expect(row.impact).toContain("The plan goes live Nov 6.");
    const health = healthByImplementation([impl()], [bundle(facts)]).get("i1")!;
    expect(health.level).toBe("at_risk");
    expect(health.reason).toBe("Missed SOW go-live Oct 30");
  });

  it("never claims on track: a clean row says what comes next", () => {
    const row = triageRow(impl(), bundle(deal()));
    expect(row.bucket).toBe("moving");
    expect(row.reason).toBe("Nothing open · next: Stage 2 — Make it yours");
    expect(row.reason).not.toMatch(/on track|idle/i);
    expect(triageRow(impl({ status: "idle" }), bundle(null)).reason).toBe(
      "Nothing open against it in Make it yours",
    );
  });

  it("lets a logged severe escalation outrank the deal's reasons", () => {
    const b = bundle(deal({ owner_name: null, stage: "closed_won", business_days_in_stage: 2 }));
    b.escalations = [
      {
        id: "e1",
        severity: "critical",
        title: "Exec escalation",
        status: "open",
        raised_at: "2026-09-20",
      },
    ];
    expect(triageRow(impl(), b).reason).toMatch(/escalation/i);
  });
});

describe("one stall clock (QA 7.8)", () => {
  const longAgo = new Date(Date.now() - 40 * 86_400_000).toISOString();

  it("judges a project with a deal by the deal's business days, not its own calendar date", () => {
    const quiet = deal({ stage: "make_it_yours", business_days_in_stage: 2 });
    const row = triageRow(impl({ stage_entered_at: longAgo }), bundle(quiet));
    expect(row.reason).not.toMatch(/Stalled/);
    expect(row.impact).toMatch(/2 business days in stage/);
    const h = healthByImplementation([impl({ stage_entered_at: longAgo })], [bundle(quiet)]);
    expect(h.get("i1")!.evidence.rule).not.toBe("stalled_stage");
  });

  it("calls it stalled at the deal's escalate limit, in business days", () => {
    const stuck = deal({ stage: "make_it_yours", business_days_in_stage: 12 });
    const h = healthByImplementation([impl()], [bundle(stuck)]);
    expect(h.get("i1")!.level).toBe("at_risk");
    expect(h.get("i1")!.reason).toMatch(/12 business days in Make it yours|Stuck 12 business days/);
    expect(triageRow(impl(), bundle(stuck)).bucket).toBe("act_now");
  });

  it("leaves a partner deal's stall to its own milestones, and never stalls Graduate", () => {
    const partner = deal({ stage: "make_it_yours", business_days_in_stage: 30, partner: true });
    const h = healthByImplementation([impl()], [bundle({ ...partner, next_step: "x" })]);
    expect(h.get("i1")!.evidence.rule).not.toBe("stalled_stage");
    const grad = deal({ stage: "onboarding_complete", business_days_in_stage: 90 });
    const g = healthByImplementation(
      [impl({ deal_stage: "onboarding_complete", stage_entered_at: longAgo })],
      [bundle(grad)],
    );
    expect(g.get("i1")!.evidence.rule).not.toBe("stalled_stage");
  });

  it("keeps the calendar clock for a project without a deal", () => {
    const row = triageRow(impl({ deal_id: null, stage_entered_at: longAgo }), bundle(null));
    expect(row.reason).toMatch(/Stalled \d+ days/);
  });

  it("says what to do when a stuck deal's checklist is empty, after anything the record names", () => {
    const facts = deal({ stage: "closed_won", business_days_in_stage: 6, next_step: null });
    const stuck = needsAction(facts).find((r) => r.reason.startsWith("Stuck"))!;
    expect(stuck.next).toBeUndefined();
    expect(stuck.fallbackNext).toBe("Move it to Intake & Process, or note what is holding it");
    // Nothing else named: the move is the next step.
    const row = triageRow(impl({ deal_stage: "closed_won" }), bundle(facts));
    expect(row.next_action).toBe("Move it to Intake & Process, or note what is holding it");
    // A launch date that has passed is said first (Home's Due keys on it).
    const late = triageRow(
      impl({ deal_stage: "closed_won", target_launch_date: "2026-01-05" }),
      bundle(facts),
    );
    expect(late.next_action).toMatch(/^Launch date has passed/);
  });

  it("never calls a partner deal stuck by its stage's age: its milestones speak for it", () => {
    const partner = deal({ stage: "closed_won", business_days_in_stage: 9, partner: true });
    expect(needsAction(partner).some((r) => r.reason.startsWith("Stuck"))).toBe(false);
    const row = triageRow(impl({ deal_stage: "closed_won" }), bundle(partner));
    expect(row.bucket).not.toBe("act_now");
    // The same deal, not a partner one, is stuck.
    expect(
      needsAction({ ...partner, partner: false }).some((r) => r.reason.startsWith("Stuck")),
    ).toBe(true);
  });
});
