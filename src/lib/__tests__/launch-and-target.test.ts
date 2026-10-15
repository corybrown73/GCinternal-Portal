import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * QA-U3 fixes:
 * 1. The Calendar keeps a superseded project's own records; every count does not.
 * 2. "Launched" is the typed actual launch, the Go-Live tick or the plan's
 *    live tick, through one helper (launch-state.ts) on every launch reader.
 * 3. Every writer of the stored target sets target_launch_date and
 *    target_date together, the same value.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    flags: { isFlagOn: async () => false, getV2Flags: async () => ({}), resetFlagCache: () => {} },
    audit: { audit: vi.fn(async () => {}) },
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("@/lib/app-config.server", () => h.flags);
vi.mock("../app-config.server", () => h.flags);
vi.mock("../server/audit", () => h.audit);

import { loadCalendar } from "../calendar.server";
import { deriveHealth, nextAction } from "../customer360-derive";
import {
  loadImplementations,
  loadLeadership,
  updateImplementation,
  updateRecordField,
} from "../hub.server";
import type { ImplementationRow, LeadershipData } from "../hub-types";
import { triageRow } from "../home-triage";
import {
  toImplementationPatch,
  toImplementationUpdatePatch,
  withTargetPair,
} from "../implementation-input";
import { launchOverdue, launchedOn, liveTickOf } from "../launch-state";
import { interventions, launchBoard, portfolioRollup } from "../leadership";
import { syncTargetLaunch } from "../presale.server";
import { launchDateAtRisk } from "../signals/alert-rules";
import { slipAttribution } from "../signals/slip";
import { createIngestPort } from "../sf-integration.server";

const DAY = 86_400_000;
const isoDaysFromNow = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
const PAST = isoDaysFromNow(-14);
const TICK = isoDaysFromNow(-20);
const SOON = isoDaysFromNow(10);

/* --------------------------------------------------------- launch-state */

describe("launched: any record of a launch", () => {
  it("reads the typed actual launch, the Go-Live tick, then the plan's live tick", () => {
    expect(launchedOn({})).toBeNull();
    expect(launchedOn({ actual_launch_date: "2026-09-01" })).toBe("2026-09-01");
    expect(launchedOn({ go_live_at: "2026-09-02T00:00:00+00:00" })).toBe("2026-09-02");
    expect(launchedOn({ live_done_on: "2026-09-03" })).toBe("2026-09-03");
    expect(launchedOn({}, { live_done_on: "2026-09-04" })).toBe("2026-09-04");
    expect(launchedOn({ actual_launch_date: "2026-09-01", go_live_at: "2026-09-02" }, null)).toBe(
      "2026-09-01",
    );
    // Not a date is not a launch.
    expect(launchedOn({ go_live_at: "", live_done_on: "soon" })).toBeNull();
  });

  it("is overdue only when the target passed and nothing records a launch", () => {
    expect(launchOverdue({ target_launch_date: PAST })).toBe(true);
    expect(launchOverdue({ target_launch_date: SOON })).toBe(false);
    expect(launchOverdue({ target_launch_date: PAST, actual_launch_date: TICK })).toBe(false);
    expect(launchOverdue({ target_launch_date: PAST, go_live_at: TICK })).toBe(false);
    expect(launchOverdue({ target_launch_date: PAST, live_done_on: TICK })).toBe(false);
    expect(launchOverdue({ target_launch_date: PAST }, { live_done_on: TICK })).toBe(false);
  });

  it("reads the plan's live tick off an intake", () => {
    expect(liveTickOf({ timeline: { completed: { live: "2026-09-22" } } })).toBe("2026-09-22");
    expect(liveTickOf({ timeline: { completed: { kickoff: "2026-09-01" } } })).toBeNull();
    expect(liveTickOf(null)).toBeNull();
  });
});

const empty = {
  risks: [],
  issues: [],
  escalations: [],
  commitments: [],
  milestones: [{ id: "m", name: "Kickoff", status: "completed", completed_date: TICK }],
  decisions: [],
};

describe("health and next action read the one launch rule", () => {
  it("keeps launch_overdue for a passed target with no launch, and drops it once launched", () => {
    const base = { current_stage: "build", target_launch_date: PAST };
    expect(deriveHealth(empty as never, base).evidence.rule).toBe("launch_overdue");
    expect(deriveHealth(empty as never, { ...base, go_live_at: TICK }).evidence.rule).not.toBe(
      "launch_overdue",
    );
    expect(deriveHealth(empty as never, { ...base, live_done_on: TICK }).evidence.rule).not.toBe(
      "launch_overdue",
    );
    // The deal facts carry the live tick on the 360 and on Home.
    const withTick = {
      ...empty,
      deal_facts: { stage: "make_it_run", business_days_in_stage: 1, live_done_on: TICK },
    };
    expect(deriveHealth(withTick as never, base).evidence.rule).not.toBe("launch_overdue");
  });

  it("says 'Launch date has passed' only while nothing records a launch", () => {
    const record = { ...empty, milestones: [] } as never;
    expect(nextAction(record, { target_launch_date: PAST })).toMatch(/^Launch date has passed \(/);
    expect(nextAction(record, { target_launch_date: PAST, go_live_at: TICK })).not.toMatch(
      /^Launch date has passed/,
    );
    const ticked = { ...empty, milestones: [], deal_facts: { live_done_on: TICK } } as never;
    expect(nextAction(ticked, { target_launch_date: PAST })).not.toMatch(/^Launch date has passed/);
  });
});

const row = (over: Partial<ImplementationRow> = {}): ImplementationRow => ({
  id: "i-bsi",
  name: "BSI-VZC WORK onboarding",
  customer_id: "c-bsi",
  customer_name: "BSI-VZC WORK",
  segment: null,
  industry: null,
  arr: 10_000,
  current_stage: "build",
  deal_stage: "make_it_run",
  deal_id: "bsi",
  stage_entered_at: new Date().toISOString(),
  status: "on_track",
  health_recorded: null,
  health_recorded_reason: null,
  owner_name: "Teya Rampaul",
  tier: null,
  target_launch_date: PAST,
  actual_launch_date: null,
  overdue_commitments: 0,
  open_escalations: 0,
  ...over,
});

describe("Home triage: a ticked launch is not 'Plan end passed'", () => {
  it("acts now on a passed target with no launch, with Home's 'Launch date has passed' text", () => {
    const r = triageRow(row(), undefined);
    expect(r.bucket).toBe("act_now");
    expect(r.reason).toMatch(/^Plan end passed .* — not launched/);
    expect(r.next_action).toMatch(/^Launch date has passed \(/);
  });

  it("leaves it once the plan's live milestone is ticked, on the row or in the deal facts", () => {
    expect(triageRow(row({ live_done_on: TICK }), undefined).reason).not.toMatch(/Plan end passed/);
    expect(triageRow(row({ go_live_at: TICK }), undefined).reason).not.toMatch(/Plan end passed/);
    const bundle = { implementation_id: "i-bsi", deal: { live_done_on: TICK } } as never;
    const r = triageRow(row(), bundle);
    expect(r.reason).not.toMatch(/Plan end passed/);
    expect(r.next_action).not.toMatch(/^Launch date has passed/);
  });
});

describe("Portfolio's launch board", () => {
  it("puts only an unlaunched passed target in Slipped, and a launched one in no column", () => {
    const data = {
      implementations: [
        row({ id: "slipped" }),
        row({ id: "ticked", live_done_on: TICK }),
        row({ id: "golive", target_launch_date: SOON, go_live_at: TICK }),
        row({ id: "landing", target_launch_date: SOON }),
      ],
    } as unknown as LeadershipData;
    const board = launchBoard(data);
    expect(board.slipped.map((r) => r.impl.id)).toEqual(["slipped"]);
    expect(board.landing_30d.map((r) => r.impl.id)).toEqual(["landing"]);
  });
});

describe("signals: launch at risk and slip", () => {
  const input = (impl: Record<string, unknown>) => ({
    impl: { id: "i", name: "x", current_stage: "build", target_launch_date: SOON, ...impl },
    solutions: [],
    approvals: [],
    escalations: [{ id: "e", title: "Blocked", severity: "critical", status: "open" }],
    stageTargets: new Map(),
  });

  it("does not warn about a launch that already happened", () => {
    expect(launchDateAtRisk(input({})).findings).toHaveLength(1);
    expect(launchDateAtRisk(input({ go_live_at: TICK })).findings).toHaveLength(0);
    expect(launchDateAtRisk(input({ live_done_on: TICK })).findings).toHaveLength(0);
  });

  it("ends the slip at the recorded launch, whichever record says it", () => {
    const target = isoDaysFromNow(-30);
    const ticked = slipAttribution(
      { id: "i", target_launch_date: target, live_done_on: isoDaysFromNow(-35) },
      [],
      null,
      new Map() as never,
    );
    expect(ticked.slipped).toBe(false);
    expect(ticked.reason).toMatch(/^Launched /);
    const open = slipAttribution(
      { id: "i", target_launch_date: target },
      [],
      null,
      new Map() as never,
    );
    expect(open.slipped).toBe(true);
  });
});

/* ---------------------------------------------------------- target pair */

const update = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "x",
  ownerId: null,
  salesOwner: null,
  tier: null,
  status: "on_track" as const,
  sowReference: null,
  sowDocumentUrl: null,
  sowDocumentName: null,
  sowValue: null,
  sowSignedDate: null,
  contractStartDate: null,
  targetLaunchDate: "2026-11-20",
  actualLaunchDate: null,
  customerGoals: null,
};

describe("the stored target is written to both columns", () => {
  it("by the Edit implementation form (setImplementation), the same value", () => {
    const patch = toImplementationUpdatePatch(update);
    expect(patch["target_launch_date"]).toBe("2026-11-20");
    expect(patch["target_date"]).toBe("2026-11-20");
    const cleared = toImplementationUpdatePatch({ ...update, targetLaunchDate: null });
    expect(cleared["target_date"]).toBeNull();
  });

  it("by the new implementation form (addImplementation)", () => {
    const patch = toImplementationPatch({
      targetLaunchDate: "2026-12-01",
    } as never);
    expect(patch.target_launch_date).toBe("2026-12-01");
    expect(patch.target_date).toBe("2026-12-01");
  });

  it("pairs only a patch that sets target_launch_date", () => {
    expect(withTargetPair({ name: "x" })).toEqual({ name: "x" });
    expect(withTargetPair({ target_launch_date: null })).toEqual({
      target_launch_date: null,
      target_date: null,
    });
  });
});

/* --------------------------------------------------- fake-database paths */

const recent = new Date(Date.now() - 2 * DAY).toISOString();
const deal = (id: string, stage: string, intake: unknown = {}) => ({
  id,
  name: id,
  stage,
  stage_entered_at: recent,
  intake,
  customer_id: `c-${id}`,
});
const impl = (id: string, dealId: string, over: Record<string, unknown> = {}) => ({
  id,
  deal_id: dealId,
  customer_id: `c-${dealId}`,
  name: `${id} onboarding`,
  owner_id: "teya",
  current_stage: "build",
  stage_entered_at: recent,
  status: "on_track",
  superseded_by_implementation_id: null,
  target_launch_date: PAST,
  target_date: PAST,
  actual_launch_date: null,
  go_live_at: null,
  created_at: recent,
  ...over,
});

const fixture = (): Rows => ({
  portal_accounts: [
    deal("bsi", "make_it_run", { timeline: { completed: { live: TICK } } }),
    deal("southern", "get_it_working"),
    deal("grinder", "make_it_run"),
  ],
  customers: [
    { id: "c-bsi", name: "BSI" },
    { id: "c-southern", name: "Southern" },
    { id: "c-grinder", name: "Grinder" },
  ],
  implementations: [
    impl("i-bsi", "bsi"),
    impl("i-southern", "southern"),
    impl("i-grinder", "grinder", { target_launch_date: SOON, target_date: SOON }),
    impl("i-grinder-old", "grinder", {
      superseded_by_implementation_id: "i-grinder",
      created_at: "2026-01-01T00:00:00Z",
      go_live_at: "2026-03-01",
    }),
  ],
  commitments: [
    {
      id: "k-old",
      implementation_id: "i-grinder-old",
      description: "earlier project commitment",
      due_date: "2026-02-01",
      status: "met",
      fulfilled_at: "2026-02-01T10:00:00Z",
      owner_id: null,
    },
  ],
  escalations: [],
  milestones: [],
  team_members: [{ id: "teya", name: "Teya Rampaul", role: "implementation_manager" }],
  portal_profiles: [],
  portal_stage_transitions: [],
  portal_assignments: [],
  portal_gong_reports: [],
  portal_briefs: [],
  risks: [],
  issues: [],
  decisions: [],
  approvals: [],
  technical_solutions: [],
  success_criteria: [],
  adoption_metrics: [],
  implementation_stage_history: [],
});

let fake: ReturnType<typeof createFakeSupabase>;
beforeEach(() => {
  fake = createFakeSupabase(fixture());
  h.supabase.client = fake.client;
});

describe("loadImplementations and the Calendar (regression from dc4bd12)", () => {
  it("leaves a superseded project out of the book by default", async () => {
    const book = await loadImplementations(null);
    expect(book.map((i) => i.id).sort()).toEqual(["i-bsi", "i-grinder", "i-southern"]);
    expect(portfolioRollup(await loadLeadership(null)).total).toBe(3);
  });

  it("keeps it, marked superseded, only when the Calendar asks", async () => {
    const all = await loadImplementations(null, { includeSuperseded: true });
    expect(all.find((i) => i.id === "i-grinder-old")?.superseded).toBe(true);
    expect(all.find((i) => i.id === "i-grinder")?.superseded).toBe(false);
  });

  it("the Calendar shows the superseded project's own records, marked as superseded", async () => {
    const { events } = await loadCalendar(null, {}, new Date());
    const c = events.find((e) => e.title === "earlier project commitment");
    expect(c).toBeDefined();
    expect(c!.implementationId).toBe("i-grinder-old");
    expect(c!.facts.some((f) => f.startsWith("Superseded"))).toBe(true);
    const goLive = events.find(
      (e) => e.implementationId === "i-grinder-old" && e.title === "Actual go-live",
    );
    expect(goLive?.date).toBe("2026-03-01");
  });

  it("carries the Go-Live tick and the plan's live tick on every row", async () => {
    const book = await loadImplementations(null);
    expect(book.find((i) => i.id === "i-bsi")).toMatchObject({ live_done_on: TICK });
    expect(book.find((i) => i.id === "i-southern")).toMatchObject({
      live_done_on: null,
      go_live_at: null,
    });
  });

  it("Home's act now drops a ticked launch and keeps the unlaunched one (BSI vs Southern)", async () => {
    const book = await loadImplementations(null);
    const reason = (id: string) =>
      triageRow(
        book.find((i) => i.id === id)!,
        undefined,
      ).reason;
    expect(reason("i-bsi")).not.toMatch(/Plan end passed/);
    expect(reason("i-southern")).toMatch(/^Plan end passed/);
  });
});

describe("updateRecordField (transcript proposal, via record)", () => {
  it("writes the target launch to target_date too, on a project no plan keeps", async () => {
    fake.store["implementations"]!.push(
      impl("i-solo", "", { deal_id: null, customer_id: "c-solo", target_date: "2026-11-01" }),
    );
    await updateRecordField({
      implementationId: "i-solo",
      field: "target_launch_date",
      value: "2026-12-15",
      actorProfileId: null,
    });
    const r = fake.store["implementations"]!.find((i) => i["id"] === "i-solo")!;
    expect(r["target_launch_date"]).toBe("2026-12-15");
    expect(r["target_date"]).toBe("2026-12-15");
  });

  it("leaves target_date to the plan on a deal's project", async () => {
    await updateRecordField({
      implementationId: "i-southern",
      field: "target_launch_date",
      value: "2026-12-15",
      actorProfileId: null,
    });
    const r = fake.store["implementations"]!.find((i) => i["id"] === "i-southern")!;
    expect(r["target_launch_date"]).toBe("2026-12-15");
    expect(r["target_date"]).toBe(PAST);
  });
});

describe("a hand edit of the target on a deal's project (review finding)", () => {
  it("survives the next plan save while the plan's own target is unchanged", async () => {
    const stored = () => fake.store["implementations"]!.find((i) => i["id"] === "i-southern")!;
    fake.store["portal_accounts"]!.find((d) => d["id"] === "southern")!["intake"] = {
      timeline: { close_date: "2026-09-01" },
    };
    // The plan sets its target first, in both columns.
    expect(await syncTargetLaunch("southern")).toBeNull();
    const planTarget = stored()["target_date"];
    expect(planTarget).toBeTruthy();
    expect(stored()["target_launch_date"]).toBe(planTarget);

    // Edit implementation: Target launch date, by hand.
    await updateImplementation(
      "i-southern",
      toImplementationUpdatePatch({ ...update, id: "i-southern", targetLaunchDate: "2026-12-01" }),
    );
    expect(stored()["target_launch_date"]).toBe("2026-12-01");
    expect(stored()["target_date"]).toBe(planTarget);

    // Any tick saves the timeline and syncs: the hand edit holds, no row asks for a reason.
    stored()["baseline_locked_at"] = recent;
    expect(await syncTargetLaunch("southern")).toBeNull();
    expect(stored()["target_launch_date"]).toBe("2026-12-01");
    expect(fake.store["target_date_changes"] ?? []).toEqual([]);
  });
});

describe("leadership interventions read the one launch rule (review finding)", () => {
  it("does not ask a lead to rebaseline a launch the Go-Live or live tick records", async () => {
    const rows = fake.store["implementations"]!;
    rows.find((i) => i["id"] === "i-bsi")!["current_stage"] = "adopt";
    Object.assign(
      rows.find((i) => i["id"] === "i-southern")!,
      {
        current_stage: "adopt",
        target_launch_date: SOON,
        target_date: SOON,
      },
    );
    Object.assign(
      rows.find((i) => i["id"] === "i-grinder")!,
      {
        current_stage: "adopt",
        go_live_at: TICK,
      },
    );
    const rebaseline = interventions(await loadLeadership(null))
      .filter((r) => r.action === "rebaseline_launch")
      .map((r) => r.row.impl.id)
      .sort();
    // BSI: live ticked. Grinder: Go-Live ticked. Southern: nothing recorded.
    expect(rebaseline).toEqual(["i-southern"]);
  });
});

describe("the Salesforce create path", () => {
  it("sets target_date with the mapped target launch, into an empty target_date only", async () => {
    fake.store["implementations"]!.push({
      id: "i-sf",
      target_launch_date: "2026-12-31",
      target_date: null,
    });
    h.supabase.client = { ...fake.client, rpc: async () => ({ data: "i-sf", error: null }) };
    const port = createIngestPort({ apiKeyId: null });
    const out = await port.createImplementation({
      customerId: "c-sf",
      name: "SF",
      salesforceOpportunityId: "006",
      salesforceAccountId: "001",
      sfClosedWonAt: null,
      ownerId: null,
      salesOwner: null,
      templateId: null,
      mapped: { target_launch_date: "2026-12-31" },
    });
    expect(out).toEqual({ id: "i-sf" });
    const r = fake.store["implementations"]!.find((i) => i["id"] === "i-sf")!;
    expect(r["target_date"]).toBe("2026-12-31");
  });

  it("a replay fill of the target launch fills target_date with it", async () => {
    fake.store["implementations"]!.push({
      id: "i-sf2",
      target_launch_date: null,
      target_date: null,
    });
    const port = createIngestPort({ apiKeyId: null });
    await port.applyReplayFills("i-sf2", { target_launch_date: "2027-01-05" }, null as never);
    const r = fake.store["implementations"]!.find((i) => i["id"] === "i-sf2")!;
    expect(r["target_date"]).toBe("2027-01-05");
  });
});
