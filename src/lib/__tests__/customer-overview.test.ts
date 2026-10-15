import { describe, expect, it } from "vitest";

import {
  actualGoLive,
  functionalByApplies,
  initials,
  internalOwners,
  isoDay,
  nextLineFor,
  partnerSnapshot,
  splitContacts,
  standardSnapshot,
  type Impl,
} from "@/lib/customer-overview";
import { taskFocusFor } from "@/lib/current-implementation-focus";
import type { FlowTask } from "@/lib/stage-flow";
import type { PartnerProgress } from "@/lib/partner-journey";

/**
 * The Overview's rules, tested without a page. The values come from the same
 * sources Current Implementation reads; these tests pin how they are chosen.
 */

function impl(over: Partial<Record<string, unknown>> = {}): Impl {
  return {
    id: "impl-1",
    name: "Field Ops rollout",
    deal_id: null,
    deal_name: null,
    owner_name: "Priya Lead",
    sales_owner: "Jordan Seller",
    journey_type: null,
    partner_key: null,
    sow_reference: null,
    sow_document_url: null,
    sow_document_name: null,
    sow_signed_date: null,
    sow_value: null,
    actual_launch_date: null,
    dates: {
      tier_expected: null,
      baseline: null,
      baseline_locked_at: null,
      target: null,
      go_live: null,
    },
    ...over,
  } as unknown as Impl;
}

function task(key: string, over: Partial<FlowTask> = {}): FlowTask {
  return {
    key,
    label: `Task ${key}`,
    hint: "",
    done: false,
    summary: null,
    action: "tick",
    locked: null,
    ...over,
  };
}

const NO_BALL_NO_WORK = { homeworkDone: {}, link: null, parkingLot: [] };

describe("functionalByApplies", () => {
  const newLogo = { path: "new_logo" } as never;

  it("applies to a new logo at pre-kickoff", () => {
    expect(functionalByApplies(newLogo, "pre_kickoff")).toBe(true);
  });

  it("applies to a new logo at a working stage", () => {
    expect(functionalByApplies(newLogo, "get_it_working")).toBe(true);
  });

  it("never applies to another path, whatever the stage", () => {
    expect(functionalByApplies({ path: "existing_account" } as never, "get_it_working")).toBe(
      false,
    );
  });

  it("does not apply before the journey or after it moves on", () => {
    expect(functionalByApplies(newLogo, null)).toBe(false);
    expect(functionalByApplies(newLogo, "closed_won")).toBe(false);
  });

  it("does not apply without an intake", () => {
    expect(functionalByApplies(null, "get_it_working")).toBe(false);
  });
});

describe("actualGoLive", () => {
  it("uses the recorded go-live (go_live_at) first", () => {
    const value = actualGoLive(
      impl({ dates: { go_live: "2026-10-05T09:00:00+00:00" }, actual_launch_date: "2026-09-30" }),
    );
    expect(value).toBe("2026-10-05");
  });

  it("falls back to the typed actual launch date when no go-live is recorded", () => {
    expect(actualGoLive(impl({ actual_launch_date: "2026-09-30" }))).toBe("2026-09-30");
  });

  it("is null when nothing is recorded, and never invents a date", () => {
    expect(actualGoLive(impl())).toBeNull();
  });

  it("ignores a value that is not a date", () => {
    expect(actualGoLive(impl({ dates: { go_live: "soon" }, actual_launch_date: null }))).toBeNull();
  });
});

describe("isoDay", () => {
  it("keeps the day of a stored timestamp", () => {
    expect(isoDay("2026-10-05T23:59:00Z")).toBe("2026-10-05");
  });

  it("returns null for anything that is not a date", () => {
    expect(isoDay("not a date")).toBeNull();
    expect(isoDay(null)).toBeNull();
  });
});

describe("standardSnapshot without a deal", () => {
  it("shows no stage, progress or next action when there is no stage flow", () => {
    const model = standardSnapshot({
      impl: impl(),
      deal: null,
      today: "2026-10-14",
      hasGraduationBrief: false,
      ...NO_BALL_NO_WORK,
    });
    expect(model.position).toBeNull();
    expect(model.stageLabel).toBeNull();
    expect(model.next).toBeNull();
    expect(model.fallback).toBe("Before the journey starts");
    expect(model.ball).toBeNull();
    expect(model.waiting).toEqual([]);
  });

  it("shows Plan end only from the implementation's recorded target", () => {
    const set = standardSnapshot({
      impl: impl({ dates: { target: "2026-12-04" } }),
      deal: null,
      today: "2026-10-14",
      hasGraduationBrief: false,
      ...NO_BALL_NO_WORK,
    });
    const unset = standardSnapshot({
      impl: impl(),
      deal: null,
      today: "2026-10-14",
      hasGraduationBrief: false,
      ...NO_BALL_NO_WORK,
    });
    expect(set.dates.find((d) => d.key === "plan-end")).toMatchObject({ tint: "info" });
    expect(unset.dates.find((d) => d.key === "plan-end")).toMatchObject({
      value: "Not set",
      tint: "unset",
    });
  });

  it("omits Functional by when the flow cannot say it", () => {
    const model = standardSnapshot({
      impl: impl(),
      deal: null,
      today: "2026-10-14",
      hasGraduationBrief: false,
      ...NO_BALL_NO_WORK,
    });
    expect(model.dates.map((d) => d.key)).not.toContain("functional-by");
  });

  it("marks Target graduation as not set, never as agreed, without a deal", () => {
    const model = standardSnapshot({
      impl: impl(),
      deal: null,
      today: "2026-10-14",
      hasGraduationBrief: false,
      ...NO_BALL_NO_WORK,
    });
    expect(model.dates.find((d) => d.key === "graduation")).toMatchObject({
      value: "Not set",
      tint: "unset",
      featured: true,
    });
  });

  it("shows Actual go-live as not recorded until something records it", () => {
    const model = standardSnapshot({
      impl: impl(),
      deal: null,
      today: "2026-10-14",
      hasGraduationBrief: false,
      ...NO_BALL_NO_WORK,
    });
    expect(model.dates.find((d) => d.key === "actual-go-live")).toMatchObject({
      value: "Not recorded",
      tint: "unset",
    });
  });
});

describe("partnerSnapshot", () => {
  const progress = {
    current: "pre_sale_poc",
    currentLabel: "Pre-Sale & POC",
    stages: [
      { key: "pre_sale_poc", label: "Pre-Sale & POC", visibility: "customer", items: [] },
      { key: "roll_out", label: "Roll Out", visibility: "customer", items: [] },
    ],
    milestones: [
      { stage: "roll_out", targetDate: "2026-12-01", completedDate: null, status: "open" },
    ],
  } as unknown as PartnerProgress;

  it("never shows Functional by or Plan end for a partner", () => {
    const model = partnerSnapshot(impl({ dates: { target: "2026-11-01" } }), progress, {
      loading: false,
      failed: false,
    });
    const labels = model.dates.map((d) => d.label);
    expect(labels).not.toContain("Functional by");
    expect(labels).not.toContain("Plan end");
  });

  it("reads the graduation target from the partner's own Roll Out milestone", () => {
    const model = partnerSnapshot(impl(), progress, { loading: false, failed: false });
    expect(model.dates.find((d) => d.key === "graduation")).toMatchObject({ tint: "good" });
    expect(model.dates[0]!.value).toMatch(/Dec/);
  });

  it("says the graduation target is to be confirmed when the partner has none", () => {
    const bare = { ...progress, milestones: [] } as unknown as PartnerProgress;
    const model = partnerSnapshot(impl(), bare, { loading: false, failed: false });
    expect(model.dates[0]).toMatchObject({ value: "To be confirmed", tint: "unset" });
  });

  it("shows the stage as loading, and no standard value, while the progress loads", () => {
    const model = partnerSnapshot(impl(), null, { loading: true, failed: false });
    expect(model.fallback).toBe("Loading…");
    expect(model.position).toBeNull();
    expect(model.waitingText).toBe("Loading…");
    expect(model.dates[0]).toMatchObject({ value: "Loading…" });
  });

  it("says the stage is unavailable when the progress read fails", () => {
    const model = partnerSnapshot(impl(), null, { loading: false, failed: true });
    expect(model.fallback).toBe("Stage unavailable");
    expect(model.waitingText).toBe("Unavailable");
    expect(model.dates[0]).toMatchObject({ value: "Unavailable" });
  });

  it("leaves out the next action when the partner stage has nothing open", () => {
    const model = partnerSnapshot(impl(), progress, { loading: false, failed: false });
    expect(model.next).toBeNull();
  });

  it("never shows the implementation's target as a partner date, even when it is set", () => {
    const model = partnerSnapshot(impl({ dates: { target: "2026-11-01" } }), progress, {
      loading: false,
      failed: false,
    });
    expect(model.dates.map((d) => d.label)).not.toContain("Recorded go-live target");
    expect(model.dates.map((d) => d.value).join(" ")).not.toMatch(/Nov/);
  });

  it("shows the partner's Roll Out target and actual go-live, and nothing else", () => {
    const model = partnerSnapshot(impl({ actual_launch_date: "2026-10-20" }), progress, {
      loading: false,
      failed: false,
    });
    expect(model.dates.map((d) => d.key)).toEqual(["graduation", "actual-go-live"]);
    expect(model.dates[1]).toMatchObject({ value: expect.stringMatching(/Oct/), tint: "good" });
  });
});

describe("nextLineFor", () => {
  it("reads an open task as its action, the wording Focus Mode uses", () => {
    const line = nextLineFor(taskFocusFor([task("a", { next: "Get the intake in" })]));
    expect(line).toEqual({ label: "Up next", text: "Get the intake in", tone: "info" });
  });

  it("reads a locked stage as waiting, with the reason", () => {
    const line = nextLineFor(taskFocusFor([task("a", { locked: "Needs the SOW" })]));
    expect(line).toEqual({ label: "Waiting", text: "Needs the SOW", tone: "warning" });
  });

  it("reads a finished stage as complete", () => {
    expect(nextLineFor(taskFocusFor([task("a", { done: true })]))?.label).toBe("Stage complete");
  });

  it("has no line when there is no focus", () => {
    expect(nextLineFor(null)).toBeNull();
  });
});

describe("splitContacts", () => {
  const people = [
    { id: "1", name: "Zed Working", role: "technical_contact", email: null },
    { id: "2", name: "Ana Decider", role: "decision_maker", email: null },
    { id: "3", name: "Ben Sponsor", role: "exec_sponsor", email: null },
    { id: "4", name: "Cal Approver", role: "approver", email: null },
  ];

  it("puts decision-makers first, sponsors before deciders", () => {
    const { decision } = splitContacts(people);
    expect(decision.map((p) => p.id)).toEqual(["3", "2"]);
  });

  it("puts every other customer role in working contacts, by name", () => {
    const { working } = splitContacts(people);
    expect(working.map((p) => p.name)).toEqual(["Cal Approver", "Zed Working"]);
  });
});

describe("internalOwners", () => {
  it("lists the implementation owner, the sales owner and each solution owner once", () => {
    const owners = internalOwners({ owner_name: "Priya Lead", sales_owner: "Jordan Seller" }, [
      { owner_name: "Chris Build" },
      { owner_name: "Chris Build" },
      { owner_name: null },
    ]);
    expect(owners.map((o) => o.sub)).toEqual([
      "Implementation owner",
      "Sales owner",
      "Technical solution owner",
    ]);
  });

  it("does not repeat the implementation owner as a solution owner, or the sales owner", () => {
    const owners = internalOwners({ owner_name: "Priya Lead", sales_owner: "Priya Lead" }, [
      { owner_name: "Priya Lead" },
    ]);
    expect(owners.map((o) => o.name)).toEqual(["Priya Lead"]);
  });

  it("is empty when nothing is recorded", () => {
    expect(internalOwners({ owner_name: null, sales_owner: null }, [])).toEqual([]);
  });
});

describe("initials", () => {
  it("takes the first and last word", () => {
    expect(initials("Dana Sample Ross")).toBe("DR");
  });

  it("takes one letter for a single name", () => {
    expect(initials("Cher")).toBe("C");
  });

  it("shows a placeholder when there is no name", () => {
    expect(initials("   ")).toBe("?");
  });
});
