import { describe, expect, it } from "vitest";
import { CHAMPION_QUIET_DAYS, championGoneQuiet, launchDateAtRisk } from "../signals/alert-rules";
import {
  classifyEvent,
  engagementSignal,
  refutesSilence,
  TELEMETRY_UNAVAILABLE,
} from "../signals/engagement";
import type { WaitingOn } from "../customer360-derive";
import type { LifecycleStageId } from "../lifecycle";

/**
 * An alert that cries wolf is worse than no alert. Every test here pins a case
 * where the alert must NOT fire, or the named evidence it must carry when it
 * does.
 */

const NOW = new Date("2026-06-01T00:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const onCustomer: WaitingOn = {
  party: "customer",
  reason: "Waiting on the customer to approve the SOW (Dana Reed)",
  since: daysAgo(40),
  source: "approvals",
};

const staleApproval = {
  id: "app-1",
  title: "SOW sign-off",
  status: "pending",
  requested_at: daysAgo(40),
  decided_at: null,
  approver_name: "Dana Reed",
};

const impl = {
  id: "impl-1",
  name: "Rollout",
  customer_id: "cust-1",
  customer_name: "Northwind",
  current_stage: "build",
  target_launch_date: null,
  actual_launch_date: null,
};

describe("championGoneQuiet", () => {
  it("fires on an unanswered, dated, named ask and names it as evidence", () => {
    const out = championGoneQuiet(
      { impl, dependency: onCustomer, approvals: [staleApproval], commitments: [] },
      NOW,
    );
    expect(out.findings).toHaveLength(1);
    const f = out.findings[0];
    expect(f?.title).toContain("Dana Reed");
    expect(f?.evidence.some((e) => e.source === "approvals")).toBe(true);
    expect(f?.payload["quiet_days"]).toBe(40);
    // A level alone would be a black box; the payload can re-derive the finding.
    expect(f?.payload["approval_id"]).toBe("app-1");
  });

  it("does not fire when the dependency is on our side", () => {
    const out = championGoneQuiet(
      {
        impl,
        dependency: { party: "tis", reason: "Waiting on TIS", since: null, source: "issues" },
        approvals: [staleApproval],
        commitments: [],
      },
      NOW,
    );
    expect(out.findings).toEqual([]);
  });

  it("does not fire before the quiet window has elapsed", () => {
    const out = championGoneQuiet(
      {
        impl,
        dependency: onCustomer,
        approvals: [{ ...staleApproval, requested_at: daysAgo(CHAMPION_QUIET_DAYS - 1) }],
        commitments: [],
      },
      NOW,
    );
    expect(out.findings).toEqual([]);
  });

  it("withholds, with a reason, when nobody is named on the ask", () => {
    // Unnamed is a data-quality gap, not a champion who went quiet.
    const out = championGoneQuiet(
      {
        impl,
        dependency: onCustomer,
        approvals: [{ ...staleApproval, approver_name: null }],
        commitments: [],
      },
      NOW,
    );
    expect(out.findings).toEqual([]);
    expect(out.withheld[0]?.reason).toContain("nobody is named");
  });

  it("does not fire on a graduated implementation", () => {
    const out = championGoneQuiet(
      {
        impl: { ...impl, current_stage: "graduate-to-cs" },
        dependency: onCustomer,
        approvals: [staleApproval],
        commitments: [],
      },
      NOW,
    );
    expect(out.findings).toEqual([]);
  });

  it("is withheld when telemetry shows an interactive event after the ask", () => {
    const engagement = engagementSignal(
      "impl-1",
      [
        {
          implementation_id: "impl-1",
          contact_id: "c-1",
          event: "comment_added",
          created_at: daysAgo(2),
        },
      ],
      90,
    );
    const out = championGoneQuiet(
      { impl, dependency: onCustomer, approvals: [staleApproval], commitments: [], engagement },
      NOW,
    );
    expect(out.findings).toEqual([]);
    expect(out.withheld[0]?.reason).toContain("comment_added");
  });

  it("still fires when telemetry shows only opens — looking is not answering", () => {
    const engagement = engagementSignal(
      "impl-1",
      [{ implementation_id: "impl-1", contact_id: "c-1", event: "opened", created_at: daysAgo(1) }],
      90,
    );
    const out = championGoneQuiet(
      { impl, dependency: onCustomer, approvals: [staleApproval], commitments: [], engagement },
      NOW,
    );
    expect(out.findings).toHaveLength(1);
  });

  it("fires unchanged when the telemetry table is absent", () => {
    // An absent source is no signal — it neither fires nor suppresses.
    const out = championGoneQuiet(
      {
        impl,
        dependency: onCustomer,
        approvals: [staleApproval],
        commitments: [],
        engagement: TELEMETRY_UNAVAILABLE("the table does not exist yet"),
      },
      NOW,
    );
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]?.payload["engagement_available"]).toBe(false);
  });
});

const noTargets = new Map<LifecycleStageId, number>();

describe("launchDateAtRisk", () => {
  const soon = { ...impl, target_launch_date: daysAgo(-14).slice(0, 10) };

  it("does not fire on proximity alone", () => {
    const out = launchDateAtRisk(
      {
        impl: { ...soon, current_stage: "validate-iterate" },
        solutions: [{ id: "s1", title: "Design" }],
        approvals: [
          {
            status: "approved",
            approved_entity_type: "technical_solution",
            approved_entity_id: "s1",
          },
        ],
        escalations: [],
        stageTargets: noTargets,
      },
      NOW,
    );
    expect(out.findings).toEqual([]);
    expect(out.withheld[0]?.reason).toContain("nothing names a blocker");
  });

  it("fires when the server-enforced Launch gate is blocked, and says so", () => {
    const out = launchDateAtRisk(
      {
        impl: { ...soon, current_stage: "validate-iterate" },
        solutions: [{ id: "s1", title: "Design" }],
        approvals: [],
        escalations: [],
        stageTargets: noTargets,
      },
      NOW,
    );
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]?.evidence[0]?.source).toBe("launch_gate");
  });

  it("fires on an open critical escalation", () => {
    const out = launchDateAtRisk(
      {
        impl: { ...soon, current_stage: "validate-iterate" },
        solutions: [{ id: "s1" }],
        approvals: [
          {
            status: "approved",
            approved_entity_type: "technical_solution",
            approved_entity_id: "s1",
          },
        ],
        escalations: [
          {
            id: "e1",
            title: "Data load failing",
            severity: "critical",
            status: "open",
            raised_at: daysAgo(3),
          },
        ],
        stageTargets: noTargets,
      },
      NOW,
    );
    expect(out.findings[0]?.evidence.some((e) => e.source === "escalations")).toBe(true);
  });

  it("uses the remaining-stage targets only when every remaining stage has one", () => {
    const partial = new Map<LifecycleStageId, number>([["build", 60]]);
    const out = launchDateAtRisk(
      {
        impl: { ...soon, current_stage: "align-external" },
        solutions: [{ id: "s1" }],
        approvals: [
          {
            status: "approved",
            approved_entity_type: "technical_solution",
            approved_entity_id: "s1",
          },
        ],
        escalations: [],
        stageTargets: partial,
      },
      NOW,
    );
    // A sum over a partial set understates; it must not be used at all.
    expect(out.findings).toEqual([]);

    const full = new Map<LifecycleStageId, number>([
      ["build", 60],
      ["validate-iterate", 10],
      ["launch", 5],
    ]);
    const fired = launchDateAtRisk(
      {
        impl: { ...soon, current_stage: "align-external" },
        solutions: [{ id: "s1" }],
        approvals: [
          {
            status: "approved",
            approved_entity_type: "technical_solution",
            approved_entity_id: "s1",
          },
        ],
        escalations: [],
        stageTargets: full,
      },
      NOW,
    );
    expect(fired.findings[0]?.evidence.some((e) => e.source === "stage_targets")).toBe(true);
  });

  it("leaves a date that has already passed to launch_overdue", () => {
    const out = launchDateAtRisk(
      {
        impl: { ...impl, target_launch_date: daysAgo(5).slice(0, 10), current_stage: "build" },
        solutions: [],
        approvals: [],
        escalations: [],
        stageTargets: noTargets,
      },
      NOW,
    );
    expect(out.findings).toEqual([]);
  });
});

describe("engagement classification", () => {
  it("treats an unknown event as operational so it can never refute by accident", () => {
    expect(classifyEvent("task_completed")).toBe("interactive");
    expect(classifyEvent("opened")).toBe("passive");
    expect(classifyEvent("grant_revoked")).toBe("operational");
    expect(classifyEvent("something_new_in_phase_9")).toBe("operational");
  });

  it("never reports an absent table as inactivity", () => {
    const signal = TELEMETRY_UNAVAILABLE("the table does not exist yet");
    expect(signal.available).toBe(false);
    expect(signal.reason).toContain("absence of a source");
    expect(refutesSilence(signal, daysAgo(30)).refuted).toBe(false);
  });
});
