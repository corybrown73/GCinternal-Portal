import { describe, expect, it, vi } from "vitest";

import { nudgesFor, type StageFlow } from "../stage-flow";
import { needsAction, type DealFacts } from "../needs-action";
import { partnerNudges, partnerOverdueByImplementation } from "../partner-attention";
import { isPartnerJourney } from "../partner-implementation";

/**
 * Two fixes for generic partner implementations, with the standard and legacy
 * Field Fusion paths held to their existing behaviour:
 *  - a partner's kickoff warning does not apply, while its other signals do;
 *  - a partner's nudges come from its own overdue items, never the standard
 *    stage-age, unclaimed or checklist rules.
 */

const deal = (over: Partial<DealFacts> = {}): DealFacts => ({
  id: "d1",
  name: "Acme Pools",
  stage: "onboarding_kickoff",
  business_days_in_stage: 12,
  has_notes: true,
  has_sow: true,
  owner_name: "Dana",
  core_booked: false,
  next_step: null,
  overdue_calls: [],
  watch_outs: [],
  ...over,
});

const kickoffWarning = (d: DealFacts) =>
  needsAction(d).some((r) => r.reason === "Core meetings not booked");

describe("needs-action: the kickoff warning is standard-only", () => {
  it("a new partner implementation at onboarding_kickoff is not told the core meetings are unbooked", () => {
    expect(kickoffWarning(deal({ partner: true }))).toBe(false);
  });

  it("a standard deal at onboarding_kickoff keeps its warning", () => {
    expect(kickoffWarning(deal({ partner: false }))).toBe(true);
    expect(kickoffWarning(deal())).toBe(true);
  });

  it("a legacy Field Fusion deal (not a partner journey) keeps its warning", () => {
    // Field Fusion implementations are read through their intake path, with a
    // standard journey type and no partner: they are not partner journeys.
    expect(isPartnerJourney({ journey_type: "new_logo", partner_key: null })).toBe(false);
    expect(
      kickoffWarning(
        deal({ partner: isPartnerJourney({ journey_type: "new_logo", partner_key: null }) }),
      ),
    ).toBe(true);
  });

  it("a partner keeps its other needs-action signals, such as proposals awaiting review", () => {
    const reasons = needsAction(
      deal({ partner: true, pending_proposals: 2 } as Partial<DealFacts>),
    ).map((r) => r.reason);
    expect(reasons.some((r) => r.includes("to review"))).toBe(true);
    expect(reasons).not.toContain("Core meetings not booked");
  });
});

describe("nudges: a partner's nudges come from its own overdue items", () => {
  const today = "2026-10-13";
  const longAgo = "2026-08-01T10:00:00.000Z";

  it("a partner deal in onboarding_kickoff for months gets no stage-age 'Stuck' nudge", () => {
    expect(
      partnerNudges({ name: "Acme", stage: "onboarding_kickoff", enteredAt: longAgo, overdue: [] }),
    ).toEqual([]);
  });

  it("an overdue partner milestone two business days or more late is warned to its owner", () => {
    const nudges = partnerNudges({
      name: "Acme",
      stage: "onboarding_kickoff",
      enteredAt: longAgo,
      overdue: [{ key: "m:1", label: "Pilot review", date: "2026-10-05", businessDaysLate: 6 }],
    });
    expect(nudges).toHaveLength(1);
    expect(nudges[0]).toMatchObject({
      level: "warn",
      to: "owner",
      subject: "Overdue: Acme — Pilot review",
    });
  });

  it("an item one business day late is not nudged, as before", () => {
    expect(
      partnerNudges({
        name: "Acme",
        stage: "onboarding_kickoff",
        enteredAt: longAgo,
        overdue: [{ key: "m:1", label: "Pilot review", date: "2026-10-12", businessDaysLate: 1 }],
      }),
    ).toEqual([]);
  });

  it("a standard deal in the same stage keeps its stage-age 'Stuck' nudge", () => {
    const flow: StageFlow = { current: "kickoff", stages: [], advanceTo: null };
    const nudges = nudgesFor({
      name: "Acme",
      stage: "onboarding_kickoff",
      businessDaysInStage: 9,
      enteredAt: longAgo,
      flow,
    });
    expect(nudges.some((n) => n.subject.startsWith("Stuck"))).toBe(true);
  });

  it("overdue partner milestones and work items are found from recorded dates only", () => {
    const map = partnerOverdueByImplementation({
      today,
      milestones: [
        {
          id: "m1",
          implementation_id: "i1",
          name: "Implementation Ready",
          target_date: "2026-10-01",
          completed_date: null,
          status: "not_started",
        },
        {
          id: "m2",
          implementation_id: "i1",
          name: "Done early",
          target_date: "2026-10-01",
          completed_date: "2026-09-30",
          status: "completed",
        },
        {
          id: "m3",
          implementation_id: "i1",
          name: "Future",
          target_date: "2026-10-30",
          completed_date: null,
          status: "not_started",
        },
        {
          id: "m4",
          implementation_id: "i1",
          name: "No date",
          target_date: null,
          completed_date: null,
          status: "not_started",
        },
      ],
      workItems: [
        {
          id: "w1",
          implementation_id: "i1",
          title: "Forms ready",
          due_at: "2026-10-03T09:00:00.000Z",
          status: "not_started",
        },
        {
          id: "w2",
          implementation_id: "i1",
          title: "Skipped task",
          due_at: "2026-10-03T09:00:00.000Z",
          status: "skipped",
        },
        {
          id: "w3",
          implementation_id: "i1",
          title: "Finished",
          due_at: "2026-10-03T09:00:00.000Z",
          status: "done",
        },
        {
          id: "w4",
          implementation_id: "i1",
          title: "Unscheduled",
          due_at: null,
          status: "not_started",
        },
      ],
    });
    const labels = (map.get("i1") ?? []).map((x) => x.label).sort();
    expect(labels).toEqual(["Forms ready", "Implementation Ready"]);
  });
});
