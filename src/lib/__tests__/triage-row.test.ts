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
});
