import { describe, expect, it } from "vitest";

import { healthByImplementation, triageRow } from "../home-triage";
import type { ImplementationRow, TriageBundle } from "../hub-types";
import { healthFloor, needsAction, type DealFacts } from "../needs-action";

const deal = (over: Partial<DealFacts> = {}): DealFacts => ({
  id: "d1",
  name: "QA TEST – Summit NL",
  stage: "in_onboarding",
  business_days_in_stage: 3,
  has_notes: true,
  has_sow: true,
  owner_name: "Dana",
  core_booked: true,
  next_step: "Stage 2 — Make It Work for Them",
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
  deal_stage: "in_onboarding",
  deal_id: "d1",
  stage_entered_at: "2026-09-21T15:00:00Z",
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
      "No Gong brief or SOW on the deal",
    ]);
    expect(
      needsAction(deal({ stage: "closed_won", owner_name: null, business_days_in_stage: 0 })),
    ).toEqual([]);
  });

  it("says when the core meetings are still unbooked in Pre-kickoff, and when it is stuck", () => {
    const r = needsAction(
      deal({ stage: "onboarding_kickoff", core_booked: false, business_days_in_stage: 2 }),
    );
    expect(r.map((x) => x.reason)).toEqual(["Core meetings not booked"]);
    const stuck = needsAction(deal({ stage: "onboarding_kickoff", business_days_in_stage: 30 }));
    expect(stuck[0]!.reason).toMatch(/^Stuck 30 business days in Pre-kickoff/);
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
    expect(row.reason).toBe("Nothing open · next: Stage 2 — Make It Work for Them");
    expect(row.reason).not.toMatch(/on track|idle/i);
    expect(triageRow(impl({ status: "idle" }), bundle(null)).reason).toBe(
      "Nothing open against it in Onboarding",
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
