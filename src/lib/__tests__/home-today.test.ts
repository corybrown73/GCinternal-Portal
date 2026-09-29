import { describe, expect, it } from "vitest";

import type { QueueRow } from "../home-triage";
import { dueLabel, todayFor, type TodayInput } from "../home-today";
import type { ImplementationRow } from "../hub-types";
import type { DealInboxRow } from "../presale.server";

/**
 * Today's layout, from the queue: the four numbers, who needs me and why,
 * the next seven days by day, my book, where the accounts sit.
 */

const TODAY = "2026-09-29"; // a Tuesday

function impl(over: Partial<ImplementationRow> = {}): ImplementationRow {
  return {
    id: "i1",
    name: "FGP Manufacturing",
    customer_id: "c1",
    customer_name: "FGP Manufacturing",
    segment: null,
    industry: null,
    arr: 24000,
    current_stage: "build",
    deal_stage: "in_onboarding",
    deal_id: "d1",
    stage_entered_at: "2026-09-22T10:00:00Z",
    status: "at_risk",
    health_recorded: null,
    health_recorded_reason: null,
    owner_name: "Teya Rampaul",
    tier: "3",
    target_launch_date: "2026-10-09",
    actual_launch_date: null,
    overdue_commitments: 0,
    open_escalations: 0,
    ...over,
  };
}

function row(over: Partial<QueueRow> = {}): QueueRow {
  return {
    impl: impl(),
    bucket: "act_now",
    reason: "Validation is 4 days behind plan. Customer feedback was due Sep 25.",
    impact: "",
    next_action: "Follow up with customer",
    dependency: { party: "none", reason: "", since: null, source: null },
    tab: "overview",
    rank: 1.8,
    facts: {
      id: "d1",
      name: "FGP Manufacturing",
      stage: "in_onboarding",
      business_days_in_stage: 5,
      has_notes: true,
      has_sow: true,
      owner_name: "Teya Rampaul",
      core_booked: true,
      next_step: null,
      overdue_calls: [],
      watch_outs: [],
      upcoming_calls: [
        {
          key: "working",
          label: "Stage 2 — Make It Work for Them",
          date: "2026-10-01",
          time: "10:00",
          minutes: 60,
        },
      ],
      close_date: "2026-09-18",
      live_date: "2026-10-09",
    },
    ...over,
  };
}

function inbox(over: Partial<DealInboxRow> = {}): DealInboxRow {
  return {
    id: "d9",
    name: "Windows USA",
    stage: "closed_won",
    stage_label: "Closed Won",
    stage_entered_at: "2026-09-23T10:00:00Z",
    path: "new_logo",
    owner_name: null,
    mine: false,
    unclaimed: true,
    next_step: "Assign an owner",
    ...over,
  };
}

function input(over: Partial<TodayInput> = {}): TodayInput {
  return {
    queue: { act_now: [row()], needs_attention: [], moving: [] },
    health: new Map([["i1", { level: "at_risk" as const }]]),
    dealInbox: [inbox()],
    commitments: [],
    today: TODAY,
    ...over,
  };
}

describe("Today", () => {
  it("counts what needs attention, what is waiting, what is coming, what is on track", () => {
    const moving = row({
      impl: impl({ id: "i2", customer_id: "c2", customer_name: "Delta Mining" }),
      bucket: "moving",
      rank: 4,
      reason: "Nothing open",
    });
    const waiting = row({
      impl: impl({ id: "i3", customer_id: "c3", customer_name: "Corys Oil" }),
      bucket: "needs_attention",
      rank: 2.5,
      dependency: {
        party: "customer",
        reason: "Awaiting approval",
        since: null,
        source: "approvals",
      },
    });
    const t = todayFor(
      input({ queue: { act_now: [row()], needs_attention: [waiting], moving: [moving] } }),
    );
    expect(t.tiles.needAttention).toBe(2); // one act-now account + one unclaimed deal
    expect(t.tiles.waitingOn).toBe(1);
    expect(t.tiles.onTrack).toBe(1);
    expect(t.tiles.upcoming).toBeGreaterThanOrEqual(3); // three Stage 2 calls this week
    expect(t.book.total).toBe(3);
  });

  it("lists who needs me: the account with its chip, reason, next step and due date, and the unclaimed deal", () => {
    const t = todayFor(input());
    expect(t.needsMe.map((r) => r.name)).toEqual(["Windows USA", "FGP Manufacturing"]);
    const fgp = t.needsMe[1]!;
    expect(fgp.initials).toBe("FM");
    expect(fgp.chip.label).toBe("At risk");
    expect(fgp.reason).toBe("Validation is 4 days behind plan.");
    expect(fgp.detail).toBe("Customer feedback was due Sep 25.");
    expect(fgp.nextStep).toBe("Follow up with customer");
    expect(fgp.meta).toBe("Tier 3 · TTV 21 days");
    expect(fgp.due).toEqual({ label: "Oct 1", tone: "warning" });
    const win = t.needsMe[0]!;
    expect(win.chip.label).toBe("Unclaimed");
    expect(win.nextStep).toBe("Assign an owner");
    expect(win.due?.label).toBe("Today");
  });

  it("groups the next seven days by day, then folds next week", () => {
    const t = todayFor(
      input({
        commitments: [
          {
            id: "k1",
            description: "Send the customer list",
            due_date: "2026-09-30",
            status: "open",
            committed_to: "customer",
            owner_name: null,
            implementation_id: "i1",
            customer_id: "c1",
            customer_name: "FGP Manufacturing",
          },
        ],
      }),
    );
    expect(t.comingUp.map((g) => g.title)).toEqual([
      "Today",
      "Tomorrow",
      "Thu 1 Oct",
      "Fri 2 Oct",
      "Next week",
    ]);
    expect(t.comingUp[1]!.events.map((e) => e.label)).toEqual(["Send the customer list"]);
    expect(t.comingUp[2]!.events[0]).toMatchObject({
      kind: "meeting",
      time: "10:00",
      account: "FGP Manufacturing",
    });
    expect(t.comingUp[4]!.events.map((e) => e.kind)).toEqual(["launch"]);
  });

  it("says where the accounts sit, in rail order", () => {
    const t = todayFor(input());
    expect(t.stages.find((s) => s.key === "in_onboarding")).toMatchObject({ count: 1, pct: 100 });
    expect(t.stages.find((s) => s.key === "field_fusion_setup")).toBeUndefined();
  });

  it("labels a due date the way a person says it", () => {
    expect(dueLabel("2026-09-29", TODAY)).toEqual({ label: "Today", tone: "critical" });
    expect(dueLabel("2026-09-30", TODAY)).toEqual({ label: "Tomorrow", tone: "warning" });
    expect(dueLabel("2026-09-25", TODAY)).toEqual({ label: "Overdue", tone: "critical" });
    expect(dueLabel("2026-10-20", TODAY).tone).toBe("muted");
  });
});
