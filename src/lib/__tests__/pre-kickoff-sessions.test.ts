import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * Before Kickoff, an unbooked plan session is the playbook's guess from the
 * close date, not a meeting (QA 13.2): Home's "Coming up" and the Calendar
 * leave it out until the kickoff is booked, and a date the plan gave it
 * before the deal reached Kickoff is never overdue. A booked one shows,
 * and counts.
 */
const h = vi.hoisted(() => {
  const state = { supabase: { client: null as any }, forward: null as any };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));

import { localIso } from "../onboarding-timeline";
import {
  isBeforeKickoff,
  isGuessBeforeKickoff,
  isUnbookedBeforeKickoff,
  kickoffEntryDate,
  plannedBeforeKickoff,
} from "../presale-stages";
import { dealFactsFor } from "../server/deal-facts";

const today = localIso();

function deal(
  id: string,
  stage: string,
  times: Record<string, string> = {},
  overrides: Record<string, string> = {},
) {
  return {
    id,
    name: id,
    stage,
    stage_entered_at: `${today}T09:00:00Z`,
    intake: { timeline: { times, overrides } },
    sow_document_path: null,
    sow_reference: null,
    welcome_share_url: null,
  };
}

const rows: Rows = {
  portal_accounts: [],
  portal_gong_reports: [],
  portal_briefs: [],
  implementations: [],
  team_members: [],
  portal_stage_transitions: [],
};
let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  fake = createFakeSupabase(rows);
  h.supabase.client = fake.client;
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

function moved(id: string, toStage: string, day: string) {
  fake.store["portal_stage_transitions"]!.push({
    account_id: id,
    to_stage: toStage,
    occurred_at: `${day}T09:00:00Z`,
  });
}

function closedToday(id: string) {
  moved(id, "closed_won", today);
}

describe("isUnbookedBeforeKickoff", () => {
  it("is a call with no time on a deal before Kickoff, in the agreed stage order", () => {
    for (const s of [
      "prospect",
      "negotiate",
      "closed_won",
      "field_fusion_setup",
      "onboarding_kickoff",
    ])
      expect(isBeforeKickoff(s)).toBe(true);
    for (const s of [
      "kickoff",
      "get_it_working",
      "make_it_run",
      "onboarding_complete",
      "in_onboarding",
    ])
      expect(isBeforeKickoff(s)).toBe(false);
    expect(isUnbookedBeforeKickoff("onboarding_kickoff", { kind: "call", time: null })).toBe(true);
    expect(isUnbookedBeforeKickoff("onboarding_kickoff", { kind: "call", time: "10:00" })).toBe(
      false,
    );
    expect(isUnbookedBeforeKickoff("onboarding_kickoff", { kind: "homework", time: null })).toBe(
      false,
    );
    expect(isUnbookedBeforeKickoff("kickoff", { kind: "call", time: null })).toBe(false);
    // Once the kickoff is booked the dates follow it and show again.
    expect(isUnbookedBeforeKickoff("onboarding_kickoff", { kind: "call", time: null }, true)).toBe(
      false,
    );
  });

  it("isGuessBeforeKickoff covers homework and build days too", () => {
    expect(isGuessBeforeKickoff("closed_won", { time: null })).toBe(true);
    expect(isGuessBeforeKickoff("closed_won", { time: null }, true)).toBe(false);
    expect(isGuessBeforeKickoff("get_it_working", { time: null })).toBe(false);
  });
});

describe("kickoffEntryDate and plannedBeforeKickoff", () => {
  const hist = [
    { to_stage: "closed_won", occurred_at: "2026-09-01T10:00:00Z" },
    { to_stage: "kickoff", occurred_at: "2026-09-10T10:00:00Z" },
    { to_stage: "get_it_working", occurred_at: "2026-09-20T10:00:00Z" },
  ];
  it("reads the stage entry in Kickoff, the history after it, and nothing before it", () => {
    expect(kickoffEntryDate("kickoff", "2026-09-12T08:00:00Z", hist)).toBe("2026-09-12");
    expect(kickoffEntryDate("get_it_working", "2026-09-20T10:00:00Z", hist)).toBe("2026-09-10");
    expect(kickoffEntryDate("onboarding_kickoff", null, hist)).toBeNull();
    // Moved past Kickoff with no stop in it: the first move past it.
    expect(
      kickoffEntryDate("make_it_run", null, [
        { to_stage: "make_it_yours", occurred_at: "2026-09-15T00:00:00Z" },
        { to_stage: "get_it_working", occurred_at: "2026-09-05T00:00:00Z" },
      ]),
    ).toBe("2026-09-05");
  });
  it("lets only a booked session dated before Kickoff count", () => {
    expect(plannedBeforeKickoff({ date: "2026-09-05", time: null }, "2026-09-10")).toBe(true);
    expect(plannedBeforeKickoff({ date: "2026-09-05", time: "10:00" }, "2026-09-10")).toBe(false);
    expect(plannedBeforeKickoff({ date: "2026-09-12", time: null }, "2026-09-10")).toBe(false);
    expect(plannedBeforeKickoff({ date: "2026-09-05", time: null }, null)).toBe(false);
  });
});

describe("dealFactsFor — overdue calls (QA 13.2)", () => {
  it("a deal that reached Kickoff today owes nothing the close's plan dated before it", async () => {
    fake.store["portal_accounts"]!.push(deal("ko", "kickoff"));
    moved("ko", "closed_won", daysAgo(30));
    const facts = (await dealFactsFor(["ko"], today)).get("ko")!;
    expect(facts.overdue_calls).toEqual([]);
  });

  it("a booked kickoff dated before the move still counts until it is ticked", async () => {
    fake.store["portal_accounts"]!.push(
      deal("ko", "kickoff", { kickoff: "10:00" }, { kickoff: daysAgo(20) }),
    );
    moved("ko", "closed_won", daysAgo(30));
    const facts = (await dealFactsFor(["ko"], today)).get("ko")!;
    expect(facts.overdue_calls).toHaveLength(1);
  });

  it("after Kickoff, a session dated after the move is overdue as before", async () => {
    const d = deal("gw", "get_it_working");
    d.stage_entered_at = `${daysAgo(1)}T09:00:00Z`;
    fake.store["portal_accounts"]!.push(d);
    moved("gw", "closed_won", daysAgo(60));
    moved("gw", "kickoff", daysAgo(50));
    const facts = (await dealFactsFor(["gw"], today)).get("gw")!;
    expect(facts.overdue_calls?.length).toBeGreaterThan(0);
  });
});

describe("dealFactsFor — upcoming calls", () => {
  it("in Intake & Process, only the booked session is an event", async () => {
    fake.store["portal_accounts"]!.push(deal("ip", "onboarding_kickoff", { kickoff: "10:00" }));
    closedToday("ip");
    const facts = (await dealFactsFor(["ip"], today)).get("ip")!;
    expect(facts.upcoming_calls?.map((c) => c.key)).toEqual(["kickoff"]);
    expect(facts.upcoming_calls?.[0]?.time).toBe("10:00");
    expect(facts.overdue_calls).toEqual([]);
  });

  it("in Intake & Process with nothing booked, nothing is coming up", async () => {
    fake.store["portal_accounts"]!.push(deal("ip", "onboarding_kickoff"));
    closedToday("ip");
    const facts = (await dealFactsFor(["ip"], today)).get("ip")!;
    expect(facts.upcoming_calls).toEqual([]);
  });

  it("once the kickoff is booked, the later sessions show again, unbooked", async () => {
    const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    fake.store["portal_accounts"]!.push(
      deal("ip", "onboarding_kickoff", { kickoff: "10:00" }, { kickoff: day }),
    );
    closedToday("ip");
    const facts = (await dealFactsFor(["ip"], today)).get("ip")!;
    expect(facts.upcoming_calls?.[0]).toMatchObject({ key: "kickoff", time: "10:00" });
    expect(facts.upcoming_calls?.slice(1).some((c) => c.time === null)).toBe(true);
  });

  it("from Kickoff on, unbooked sessions still show as planned", async () => {
    fake.store["portal_accounts"]!.push(deal("ko", "kickoff"));
    closedToday("ko");
    const facts = (await dealFactsFor(["ko"], today)).get("ko")!;
    expect(facts.upcoming_calls?.length).toBeGreaterThanOrEqual(2);
    expect(facts.upcoming_calls?.every((c) => c.time === null)).toBe(true);
  });
});
