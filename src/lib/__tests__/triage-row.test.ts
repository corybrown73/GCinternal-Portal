import { describe, expect, it } from "vitest";
import { triageRow, triageRowForCustomer360, buildQueue } from "../home-triage";
import { needsAction } from "../needs-action";
import { waitingOn } from "../customer360-derive";
import type { ImplementationRow, TriageBundle, Customer360 } from "../hub-types";

const impl = (over: Partial<ImplementationRow> = {}): ImplementationRow => ({
  id: "impl-1",
  name: "Rollout",
  customer_id: "cust-1",
  customer_name: "Northwind",
  segment: null,
  industry: null,
  arr: 50_000,
  current_stage: "build",
  deal_stage: "make_it_yours" as any,
  deal_id: null,
  stage_entered_at: "2026-01-01T00:00:00Z",
  status: "at_risk" as any,
  health_recorded: null,
  health_recorded_reason: null,
  owner_name: "Priya",
  tier: "2",
  target_launch_date: null,
  actual_launch_date: null,
  overdue_commitments: 0,
  open_escalations: 1,
  ...over,
});

const bundle = (over: Partial<TriageBundle> = {}): TriageBundle => ({
  implementation_id: "impl-1",
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
  deal: null,
  ...over,
});

describe("architecture contract — Layer 1 is viewer-agnostic", () => {
  it("triageRow, needsAction, waitingOn and buildQueue take no viewer/login/role parameter", () => {
    // Pinned arity: a third ("viewer") argument added to any of these later
    // fails this test rather than silently drifting the contract.
    expect(triageRow.length).toBe(2);
    expect(needsAction.length).toBe(1);
    expect(waitingOn.length).toBe(1);
    expect(buildQueue.length).toBe(2);
  });

  it("the same implementation data produces the same result on every call, with no hidden viewer state", () => {
    const escalation = {
      id: "e1",
      status: "open",
      severity: "critical",
      title: "Exec escalation",
      owner_name: "Marcus",
      owner_role: "tis",
      raised_at: "2026-01-01",
    };
    const i = impl();
    const b = bundle({ escalations: [escalation] });

    const first = triageRow(i, b);
    const second = triageRow(i, b);
    expect(second).toEqual(first);

    // Attaching viewer-shaped properties to the inputs changes nothing: Layer 1
    // never reads them. `impl`/`facts` are echoed straight through from the
    // input (identity, not computed), so the noise appears there and only
    // there — the computed signal itself (reason/next_action/dependency/
    // bucket/rank) is compared on its own.
    const withViewerNoise = triageRow(
      { ...i, __viewer: "anyone" } as any,
      { ...b, __currentUser: { id: "x", role: "AM" } } as any,
    );
    const computed = ({ reason, next_action, dependency, bucket, rank, tab }: typeof first) => ({
      reason,
      next_action,
      dependency,
      bucket,
      rank,
      tab,
    });
    expect(computed(withViewerNoise)).toEqual(computed(first));
  });
});

describe("a critical escalation is never shadowed by 'Next action not recorded'", () => {
  it("surfaces the escalation as the headline even with no commitments or decisions logged", () => {
    const row = triageRow(
      impl(),
      bundle({
        escalations: [
          {
            id: "e1",
            status: "open",
            severity: "critical",
            title: "Customer threatening churn",
            raised_at: "2026-01-01",
          },
        ],
      }),
    );
    expect(row.bucket).toBe("act_now");
    expect(row.reason).toContain("Customer threatening churn");
    expect(row.next_action).not.toBe("Next action not recorded");
  });
});

describe("cross-surface consistency — Home and Customer 360 agree", () => {
  it("triageRowForCustomer360 matches triageRow given the same underlying data", () => {
    const escalation = {
      id: "e1",
      status: "open",
      severity: "critical",
      title: "Exec escalation",
      owner_name: "Marcus",
      owner_role: "tis",
      raised_at: "2026-01-01",
    };

    const direct = triageRow(impl(), bundle({ escalations: [escalation] }));

    const record: Customer360 = {
      customer: {
        id: "cust-1",
        name: "Northwind",
        industry: null,
        segment: null,
        arr: 50_000,
        region: null,
        domain: null,
        salesforce_account_id: null,
        logo_url: null,
      },
      implementation: {
        id: "impl-1",
        name: "Rollout",
        current_stage: "build",
        deal_stage: "make_it_yours" as any,
        stage_entered_at: "2026-01-01T00:00:00Z",
        status: "at_risk",
        health_recorded: null,
        health_recorded_reason: null,
        health_recorded_at: null,
        owner_id: null,
        owner_name: "Priya",
        deal_id: null,
        deal_name: null,
        deal_arr: null,
        sales_owner: null,
        tier: "2",
        sow_reference: null,
        sow_document_url: null,
        sow_document_name: null,
        sow_value: null,
        sow_signed_date: null,
        contract_start_date: null,
        target_launch_date: null,
        actual_launch_date: null,
        stage_target_days: null,
        customer_goals: null,
        discovery_board_url: null,
        discovery_board_image_url: null,
        discovery_board_image_name: null,
        discovery_board_notes: null,
        dates: {
          tier_expected: null,
          baseline: null,
          baseline_locked_at: null,
          target: null,
          go_live: null,
        },
        complete_outcome: null,
        complete_reason: null,
        target_changes: [],
      },
      requirements: [],
      success_criteria: [],
      adoption: [],
      graduation: null,
      cs_handoff: null,
      team: [],
      implementations: [],
      journal: [],
      contacts: [],
      deal_transitions: [],
      milestones: [],
      commitments: [],
      decisions: [],
      risks: [],
      issues: [],
      escalations: [escalation],
      technical_solutions: [],
      evidence: [],
    } as unknown as Customer360;

    const viaCustomer360 = triageRowForCustomer360(record);

    expect(viaCustomer360).not.toBeNull();
    expect(viaCustomer360!.reason).toBe(direct.reason);
    expect(viaCustomer360!.next_action).toBe(direct.next_action);
    expect(viaCustomer360!.dependency).toEqual(direct.dependency);
    expect(viaCustomer360!.bucket).toBe(direct.bucket);
  });

  it("returns null without throwing when the Customer 360 record has no implementation", () => {
    const record = { implementation: null } as unknown as Customer360;
    expect(triageRowForCustomer360(record)).toBeNull();
  });

  /**
   * The FGP Manufacturing bug: an implementation with nothing wrong in
   * risks/issues/escalations/commitments, but a watch-out (a plan vs.
   * call-notes contradiction) that `needsAction()` ranks at 1.2 — above
   * every signal branch except a severe escalation, a blocked status or a
   * critical risk. Before `deal_facts` was wired through, this was the one
   * class of reason `triageRowForCustomer360` could not see at all: Home
   * showed "At risk", Customer 360 showed nothing.
   */
  it("surfaces a watch-out-only reason identically on both surfaces", () => {
    const dealFacts = {
      id: "deal-1",
      name: "Northwind",
      stage: "make_it_yours" as any,
      business_days_in_stage: 5,
      has_notes: true,
      has_sow: true,
      owner_name: "Priya",
      core_booked: true,
      next_step: null,
      overdue_calls: [],
      watch_outs: [
        { title: "Plan says weekly; call said twice weekly", detail: "Contradicts the brief." },
      ],
    };

    const direct = triageRow(impl(), bundle({ deal: dealFacts as any }));
    expect(direct.bucket).toBe("act_now");
    expect(direct.reason).toContain("Plan says weekly; call said twice weekly");

    const record = {
      customer: {
        id: "cust-1",
        name: "Northwind",
        industry: null,
        segment: null,
        arr: 50_000,
        region: null,
        domain: null,
        salesforce_account_id: null,
        logo_url: null,
      },
      implementation: {
        id: "impl-1",
        name: "Rollout",
        current_stage: "build",
        deal_stage: "make_it_yours",
        stage_entered_at: "2026-01-01T00:00:00Z",
        status: "at_risk",
        owner_name: "Priya",
        deal_id: "deal-1",
        tier: "2",
        target_launch_date: null,
        actual_launch_date: null,
      },
      deal_facts: dealFacts,
      team: [],
      implementations: [],
      journal: [],
      contacts: [],
      deal_transitions: [],
      milestones: [],
      commitments: [],
      decisions: [],
      risks: [],
      issues: [],
      escalations: [],
      technical_solutions: [],
      evidence: [],
    } as unknown as Customer360;

    const viaCustomer360 = triageRowForCustomer360(record);

    expect(viaCustomer360).not.toBeNull();
    expect(viaCustomer360!.bucket).toBe("act_now");
    expect(viaCustomer360!.reason).toBe(direct.reason);
    expect(viaCustomer360!.next_action).toBe(direct.next_action);
  });

  /**
   * Without `deal_facts`, this is exactly what regressed: a watch-out is
   * invisible, `signalRow()` finds nothing else either, and the row falls
   * all the way through to the "nothing open" bucket — silently, not an
   * error, which is what made it easy to ship.
   */
  it("without deal_facts, the same watch-out is invisible and the row reads as nothing open", () => {
    // Deliberately recent, and deliberately not "at_risk"/"blocked": this
    // isolates the deal-facts gap from signalRow()'s own stalled-stage and
    // generic at-risk branches, either of which would otherwise fire on its
    // own and mask what this test is checking.
    const recentEntry = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const record = {
      customer: { id: "cust-1", name: "Northwind", arr: 50_000 },
      implementation: {
        id: "impl-1",
        name: "Rollout",
        current_stage: "build",
        deal_stage: "make_it_yours",
        stage_entered_at: recentEntry,
        status: "on_track",
        owner_name: "Priya",
        deal_id: "deal-1",
        tier: "2",
      },
      deal_facts: null,
      milestones: [],
      commitments: [],
      decisions: [],
      risks: [],
      issues: [],
      escalations: [],
      technical_solutions: [],
      approvals: [],
      adoption: [],
      success_criteria: [],
    } as unknown as Customer360;

    const row = triageRowForCustomer360(record);
    expect(row).not.toBeNull();
    expect(row!.bucket).toBe("moving");
  });
});
