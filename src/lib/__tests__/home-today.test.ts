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
    deal_stage: "make_it_yours",
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
    dependency: { party: "none", reason: "", since: null, source: null, owner: null, task: "" },
    tab: "overview",
    rank: 1.8,
    facts: {
      id: "d1",
      name: "FGP Manufacturing",
      stage: "make_it_yours",
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
          label: "Stage 2 — Make it yours",
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
        owner: null,
        task: "approve",
      },
    });
    const t = todayFor(
      input({ queue: { act_now: [row()], needs_attention: [waiting], moving: [moving] } }),
    );
    expect(t.tiles.needAttention).toBe(2); // one act-now account + one unclaimed deal
    expect(t.needsMe.length).toBe(t.tiles.needAttention);
    expect(t.watch.map((r) => r.name)).toEqual(["Corys Oil"]);
    expect(t.tiles.waitingOn).toBe(1);
    expect(t.tiles.onTrack).toBe(1);
    expect(t.tiles.upcoming).toBeGreaterThanOrEqual(3); // three Stage 2 calls this week
    expect(t.book.total).toBe(3);
    // Each tile's row population matches its own count exactly.
    expect(t.waitingOnRows.map((r) => r.name)).toEqual(["Corys Oil"]);
    expect(t.onTrackRows.map((r) => r.name)).toEqual(["Delta Mining"]);
  });

  it("counts Upcoming as unique accounts, not events — one account with two calls and a commitment still counts once", () => {
    const twoCallsAndACommitment = row({
      facts: {
        ...row().facts!,
        upcoming_calls: [
          {
            key: "working",
            label: "Stage 2 — Make it yours",
            date: "2026-10-01",
            time: "10:00",
            minutes: 60,
          },
          {
            key: "second",
            label: "Stage 2 follow-up",
            date: "2026-10-03",
            time: "11:00",
            minutes: 30,
          },
        ],
      },
    });
    const t = todayFor(
      input({
        queue: { act_now: [twoCallsAndACommitment], needs_attention: [], moving: [] },
        commitments: [
          {
            id: "k2",
            description: "Confirm attendees",
            due_date: "2026-09-30",
            status: "open",
            committed_to: "customer",
            owner_name: null,
            owner_role: null,
            implementation_id: "i1",
            customer_id: "c1",
            customer_name: "FGP Manufacturing",
          },
        ],
      }),
    );
    // Three events in the window (two calls + one commitment), all on the same account.
    expect(t.comingUp.flatMap((g) => g.events).filter((e) => e.date <= "2026-10-06")).toHaveLength(
      3,
    );
    expect(t.tiles.upcoming).toBe(1);
    expect(t.upcomingRows.map((r) => r.name)).toEqual(["FGP Manufacturing"]);
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
    // The fixture's next step ("Follow up with customer") is not the overdue
    // call, the upcoming call, or the launch — none of those dates is a
    // deadline for it, so Due is "—", not the unrelated Oct 1 call date.
    expect(fgp.due).toBeNull();
    const win = t.needsMe[0]!;
    expect(win.chip.label).toBe("Unclaimed");
    expect(win.nextStep).toBe("Assign an owner");
    expect(win.due?.label).toBe("Today");
  });

  describe("the Due column only shows a date that is the displayed next step's own deadline", () => {
    it("shows an overdue call's date when the next step is to tick or rebook that same call", () => {
      const r = row({
        next_action: "Tick Stage 1 — Get it working if it happened, or rebook it",
        facts: {
          ...row().facts!,
          overdue_calls: [
            { label: "Stage 1 — Get it working", date: "2026-09-20", businessDaysLate: 5 },
          ],
        },
      });
      const t = todayFor(
        input({ dealInbox: [], queue: { act_now: [r], needs_attention: [], moving: [] } }),
      );
      expect(t.needsMe[0]!.due).toEqual(dueLabel("2026-09-20", TODAY));
    });

    it("does not show an overdue call's date when the next step is unrelated to it", () => {
      // Same overdue call as above, but the next step (from the default
      // fixture) is "Follow up with customer" — about something else.
      const r = row({
        facts: {
          ...row().facts!,
          overdue_calls: [
            { label: "Stage 1 — Get it working", date: "2026-09-20", businessDaysLate: 5 },
          ],
        },
      });
      const t = todayFor(
        input({ dealInbox: [], queue: { act_now: [r], needs_attention: [], moving: [] } }),
      );
      expect(t.needsMe[0]!.due).toBeNull();
    });

    it("shows the target launch date when the next step is the launch-review fallback", () => {
      const r = row({
        next_action: "Launch date has passed (Oct 9) — needs a launch review and replan",
        impl: impl({ target_launch_date: "2026-10-09" }),
      });
      const t = todayFor(
        input({ dealInbox: [], queue: { act_now: [r], needs_attention: [], moving: [] } }),
      );
      expect(t.needsMe[0]!.due).toEqual(dueLabel("2026-10-09", TODAY));
    });

    it("does not show the target launch date when only the reason, not the next step, is about it", () => {
      // This is the real shape of a launch-slipped row whose next step
      // resolved to something else (e.g. an overdue commitment) ahead of
      // the launch-review fallback — the reason mentions the launch, the
      // displayed next step does not.
      const r = row({
        reason: "Target launch passed Oct 9 — not launched (3d over).",
        next_action: "Close out the overdue commitment — Send the W9 (due Sep 20, Teya Rampaul)",
        impl: impl({ target_launch_date: "2026-10-09" }),
      });
      const t = todayFor(
        input({ dealInbox: [], queue: { act_now: [r], needs_attention: [], moving: [] } }),
      );
      expect(t.needsMe[0]!.due).toBeNull();
    });
  });

  it("links an implementation row to the implementation it is about, not just the customer", () => {
    // A customer with more than one implementation must not send a click
    // from here to the customer's newest project instead of this one.
    const t = todayFor(input());
    const fgp = t.needsMe.find((r) => r.name === "FGP Manufacturing")!;
    expect(fgp.link).toEqual({ customerId: "c1", implementationId: "i1" });
    // The unclaimed deal row has no implementation yet — it still links by deal.
    const win = t.needsMe.find((r) => r.name === "Windows USA")!;
    expect(win.link).toEqual({ dealId: "d9" });
  });

  it("links upcoming calls, launches and commitments to their own implementation", () => {
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
            owner_role: null,
            implementation_id: "i1",
            customer_id: "c1",
            customer_name: "FGP Manufacturing",
          },
        ],
      }),
    );
    const events = t.comingUp.flatMap((g) => g.events);
    expect(events.find((e) => e.kind === "meeting")?.link).toEqual({
      customerId: "c1",
      implementationId: "i1",
    });
    expect(events.find((e) => e.kind === "launch")?.link).toEqual({
      customerId: "c1",
      implementationId: "i1",
    });
    expect(events.find((e) => e.kind === "commitment")?.link).toEqual({
      customerId: "c1",
      implementationId: "i1",
    });
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
            owner_role: null,
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
    expect(t.stages.find((s) => s.key === "make_it_yours")).toMatchObject({ count: 1, pct: 100 });
    expect(t.stages.find((s) => s.key === "field_fusion_setup")).toBeUndefined();
  });

  it("labels a due date the way a person says it", () => {
    expect(dueLabel("2026-09-29", TODAY)).toEqual({ label: "Today", tone: "critical" });
    expect(dueLabel("2026-09-30", TODAY)).toEqual({ label: "Tomorrow", tone: "warning" });
    expect(dueLabel("2026-09-25", TODAY)).toEqual({ label: "Overdue", tone: "critical" });
    expect(dueLabel("2026-10-20", TODAY).tone).toBe("muted");
  });
});
