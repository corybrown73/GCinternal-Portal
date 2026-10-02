import { describe, expect, it } from "vitest";
import { triageRow } from "../home-triage";
import { doINeedToAct, isInMyBook, needsAttention, needsMe, nextActionOwner } from "../relevance";
import type { WaitingOn } from "../customer360-derive";
import type { ImplementationRow, TriageBundle } from "../hub-types";
import type { OwnershipFacts, Viewer } from "../ownership";

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
  stage_entered_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  status: "on_track" as any,
  health_recorded: null,
  health_recorded_reason: null,
  owner_name: "Priya",
  tier: "2",
  target_launch_date: null,
  actual_launch_date: null,
  overdue_commitments: 0,
  open_escalations: 0,
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

const dependency = (over: Partial<WaitingOn> = {}): WaitingOn => ({
  party: "none",
  reason: "No current dependency.",
  since: null,
  source: null,
  owner: null,
  task: "",
  ...over,
});

const facts = (over: Partial<OwnershipFacts> = {}): OwnershipFacts => ({
  implementationOwnerId: null,
  csmOwnerId: null,
  amOwnerProfileId: null,
  seOwnerProfileId: null,
  ...over,
});

const viewer = (over: Partial<Viewer> = {}): Viewer => ({
  profileId: "profile-nikki",
  teamMemberId: "tm-nikki",
  name: "Nikki",
  ...over,
});

describe("viewer relevance never changes triage truth", () => {
  it("the same triageRow result is read identically regardless of which viewer asks", () => {
    const escalation = {
      id: "e1",
      status: "open",
      severity: "critical",
      title: "Exec escalation",
      owner_name: "Nikki",
      owner_role: "tis",
      raised_at: "2026-01-01",
    };
    const row = triageRow(impl(), bundle({ escalations: [escalation] }));
    const before = JSON.parse(JSON.stringify(row));

    // Nothing about any viewer enters triageRow's arguments — this is the
    // architecture contract from Phase 1, re-asserted here because Phase 2
    // adds a layer that reads the row, not one that could feed it a viewer.
    expect(triageRow.length).toBe(2);

    const sharedFacts = facts({ implementationOwnerId: "tm-nikki" });
    const inBook = viewer({ teamMemberId: "tm-nikki" });
    const outOfBook = viewer({
      name: "Someone Else",
      profileId: "profile-other",
      teamMemberId: "tm-other",
    });

    // Relevance differs per viewer...
    expect(needsAttention(row, sharedFacts, inBook)).toBe(true);
    expect(needsAttention(row, sharedFacts, outOfBook)).toBe(false);

    // ...but the row itself — triageRow's one truth — never moved.
    expect(JSON.parse(JSON.stringify(row))).toEqual(before);
    expect(row.bucket).toBe("act_now");
    expect(row.reason).toContain("Exec escalation");
  });
});

describe("doINeedToAct — explicit, trustworthy next-action owner", () => {
  it("names me when a reliable source (approvals) names me", () => {
    const dep = dependency({
      party: "customer",
      source: "approvals",
      owner: { name: "Nikki", role: null },
    });
    expect(doINeedToAct(dep, "Nikki")).toBe(true);
    expect(nextActionOwner(dep)).toEqual({ name: "Nikki", role: null });
  });

  it("does not name me when the owner is someone else", () => {
    const dep = dependency({
      party: "technical_solutions",
      source: "technical_solutions",
      owner: { name: "Sarah", role: "SE" },
    });
    expect(doINeedToAct(dep, "Nikki")).toBe(false);
  });

  it("stays unknown, never guessed, when no owner is recorded", () => {
    const dep = dependency({ party: "tis", source: "decisions", owner: null });
    expect(nextActionOwner(dep)).toBeNull();
    expect(doINeedToAct(dep, "Nikki")).toBe(false);
  });
});

describe("a risk/issue/escalation owner does not automatically produce Needs Me", () => {
  it("the Nikki/training-attendees case: Nikki owns the risk, the customer owns the next move", () => {
    // Nikki is the risk's owner_id — but the data has no field saying she
    // owns the next action, only that she is tracking the risk.
    const dep = dependency({
      party: "tis",
      source: "risks",
      owner: { name: "Nikki", role: "TIS" },
      task: "act on the open risk: training attendees aren't confirmed",
    });

    expect(nextActionOwner(dep)).toBeNull();
    expect(doINeedToAct(dep, "Nikki")).toBe(false);

    const row = { bucket: "act_now" as const, dependency: dep };
    // Still needs attention (it's open, it's in her book)...
    expect(needsAttention(row, facts({ implementationOwnerId: "tm-nikki" }), viewer())).toBe(true);
    // ...but it is not "Needs me" just because she owns the risk record.
    expect(needsMe(row, facts({ implementationOwnerId: "tm-nikki" }), viewer())).toBe(false);
  });

  it("same risk owner name, but source is escalations — still excluded", () => {
    const dep = dependency({
      party: "tis",
      source: "escalations",
      owner: { name: "Nikki", role: null },
    });
    expect(doINeedToAct(dep, "Nikki")).toBe(false);
  });
});

describe("an implementation can be Needs Attention without being Needs Me", () => {
  it("in my book, bucket !== moving, but the next-action owner is unknown or someone else", () => {
    const f = facts({ implementationOwnerId: "tm-nikki" });
    const v = viewer();

    const unknown = { bucket: "needs_attention" as const, dependency: dependency() };
    expect(needsAttention(unknown, f, v)).toBe(true);
    expect(needsMe(unknown, f, v)).toBe(false);

    const someoneElse = {
      bucket: "act_now" as const,
      dependency: dependency({ source: "approvals", owner: { name: "Dana", role: null } }),
    };
    expect(needsAttention(someoneElse, f, v)).toBe(true);
    expect(needsMe(someoneElse, f, v)).toBe(false);
  });

  it("not in my book at all: neither needs attention nor needs me", () => {
    const f = facts({ implementationOwnerId: "tm-other" });
    const v = viewer();
    const row = {
      bucket: "act_now" as const,
      dependency: dependency({ source: "approvals", owner: { name: "Nikki", role: null } }),
    };
    expect(isInMyBook(f, v)).toBe(false);
    expect(needsAttention(row, f, v)).toBe(false);
    expect(needsMe(row, f, v)).toBe(false);
  });
});
