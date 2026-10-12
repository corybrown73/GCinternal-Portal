import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * Alerts as escalations (QA 12.3, 12.4, 12.6): a stall is a deal past its
 * stage's escalate limit on Home's own clock, raised once per stage visit —
 * acknowledged or not — never emailed, titled in words; a second insert for
 * the same visit (two sweeps at once) is "already raised", not an error;
 * safeCreateAlert says "system" unless Salesforce raised it.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    emails: [] as Array<{ to: string; subject: string }>,
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../server/email", () => ({
  sendEmail: async (m: { to: string; subject: string }) => {
    h.emails.push(m);
    return { delivered: true, reason: null };
  },
}));
vi.mock("../server/audit", () => ({ audit: async () => {} }));

import { safeCreateAlert } from "../server/events";
import { runStallAlerts, stallFindings, STALL_KIND, type StallDeal } from "../stall-alerts.server";
import { createAlert } from "../tickets.server";

const TODAY = "2026-10-09"; // a Friday
const deal = (over: Partial<StallDeal>): StallDeal => ({
  id: "deal-1",
  name: "QA Test - Summit Plumbing",
  stage: "closed_won",
  stage_entered_at: "2026-10-01T15:00:00+00:00",
  customer_id: "cust-1",
  ...over,
});

const rows: Rows = {
  portal_accounts: [],
  implementations: [],
  customers: [{ id: "cust-1", name: "Summit Plumbing" }],
  alerts: [],
  portal_profiles: [{ id: "p1", email: "boss@gocanvas.com", role: "manager" }],
};
let fake: ReturnType<typeof createFakeSupabase>;
const alerts = () => fake.store["alerts"]!;

beforeEach(() => {
  fake = createFakeSupabase(rows);
  h.supabase.client = fake.client;
  h.emails.length = 0;
});

describe("stallFindings", () => {
  it("raises only at the escalate level, on business days, with the stage's label", () => {
    const links = new Map([
      ["deal-1", { implementationId: "impl-1", customerName: "Summit Plumbing" }],
    ]);
    // Thu Oct 1 → Fri Oct 9: 6 business days; Closed Won escalates at 4.
    const [f] = stallFindings([deal({})], links, TODAY);
    expect(f).toMatchObject({
      dealId: "deal-1",
      implementationId: "impl-1",
      customerId: "cust-1",
      visit: "closed_won@2026-10-01T15:00:00+00:00",
      title: "Stuck: Summit Plumbing — 6 business days in Closed Won",
    });
    expect(f!.title).not.toMatch(/closed_won|onboarding_kickoff/);
    // Warn level (3 business days in Intake & Process) is Home's, not an alert.
    expect(
      stallFindings(
        [deal({ stage: "onboarding_kickoff", stage_entered_at: "2026-10-06T09:00:00Z" })],
        links,
        TODAY,
      ),
    ).toEqual([]);
    // Graduate and pre-close stages have no limit; no entered date, no visit.
    expect(stallFindings([deal({ stage: "onboarding_complete" })], links, TODAY)).toEqual([]);
    expect(stallFindings([deal({ stage_entered_at: null })], links, TODAY)).toEqual([]);
  });

  it("names Intake & Process, never the enum", () => {
    const [f] = stallFindings(
      [deal({ stage: "onboarding_kickoff", stage_entered_at: "2026-09-28T09:00:00Z" })],
      new Map(),
      TODAY,
    );
    expect(f!.title).toBe("Stuck: QA Test - Summit Plumbing — 9 business days in Intake & Process");
  });
});

describe("runStallAlerts", () => {
  beforeEach(() => {
    fake.store["portal_accounts"]!.push(deal({}));
    fake.store["implementations"]!.push({
      id: "impl-1",
      deal_id: "deal-1",
      created_at: "2026-10-01",
    });
  });

  it("raises once per visit, linked, and emails nobody", async () => {
    expect(await runStallAlerts(TODAY)).toEqual({ raised: 1, already: 0 });
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]).toMatchObject({
      kind: STALL_KIND,
      customer_id: "cust-1",
      implementation_id: "impl-1",
      source: "system",
      payload: { deal_id: "deal-1", visit: "closed_won@2026-10-01T15:00:00+00:00" },
    });
    expect(h.emails).toHaveLength(0);

    // Acknowledged: still the same visit, so not raised again.
    alerts()[0]!.acknowledged_at = "2026-10-09T10:00:00Z";
    expect(await runStallAlerts(TODAY)).toEqual({ raised: 0, already: 1 });
    expect(alerts()).toHaveLength(1);
  });

  it("a new visit of the stage is a new alert", async () => {
    await runStallAlerts(TODAY);
    fake.store["portal_accounts"]![0]!.stage_entered_at = "2026-09-30T12:00:00Z";
    expect(await runStallAlerts(TODAY)).toEqual({ raised: 1, already: 0 });
    expect(alerts()).toHaveLength(2);
  });

  it("matches a deal's earlier alert by the deal, before it had an implementation", async () => {
    alerts().push({
      id: "old",
      kind: STALL_KIND,
      implementation_id: null,
      payload: { deal_id: "deal-1", visit: "closed_won@2026-10-01T15:00:00+00:00" },
    });
    expect(await runStallAlerts(TODAY)).toEqual({ raised: 0, already: 1 });
  });
});

describe("createAlert under 0080's unique index", () => {
  it("reads a unique_violation as already raised: no throw, no email", async () => {
    const existing = {
      id: "first",
      kind: STALL_KIND,
      implementation_id: "impl-1",
      payload: { visit: "kickoff@x" },
      title: "Stuck",
    };
    alerts().push(existing);
    const from = fake.client.from;
    fake.client.from = (table: string) => {
      const b = from(table);
      if (table !== "alerts") return b;
      const insert = b.insert.bind(b);
      b.insert = (v: any) => {
        insert(v);
        b.single = async () => ({ data: null, error: { code: "23505", message: "duplicate key" } });
        return b;
      };
      return b;
    };
    const row = await createAlert({
      kind: STALL_KIND,
      title: "Stuck again",
      implementationId: "impl-1",
      payload: { visit: "kickoff@x" },
      notify: true,
    });
    expect(row).toMatchObject({ id: "first", already_raised: true });
    expect(h.emails).toHaveLength(0);
  });
});

describe("safeCreateAlert", () => {
  it("says system by default; a visit is raised once, acknowledged or not", async () => {
    const first = await safeCreateAlert({
      kind: "ai_job_failed",
      title: "The AI reading gave up",
      payload: { deal_id: "deal-1" },
      visit: "job:1",
      notify: false,
    });
    expect(first).toEqual({ created: true, deduped: false });
    expect(alerts()[0]).toMatchObject({ source: "system", payload: { visit: "job:1" } });
    alerts()[0]!.acknowledged_at = "2026-10-09T10:00:00Z";
    const again = await safeCreateAlert({
      kind: "ai_job_failed",
      title: "The AI reading gave up",
      payload: { deal_id: "deal-1" },
      visit: "job:1",
      notify: false,
    });
    expect(again).toEqual({ created: false, deduped: true });
    expect(h.emails).toHaveLength(0);
  });

  it("keeps salesforce for the integration that asks for it", async () => {
    await safeCreateAlert({
      kind: "sf_rewon_after_completion",
      title: "x",
      source: "salesforce",
      notify: false,
    });
    expect(alerts()[0]!.source).toBe("salesforce");
  });
});

describe("signalVisit", () => {
  it("keys a quiet champion by the unanswered ask and a launch risk by its target date", async () => {
    const { signalVisit } = await import("../signals.server");
    expect(
      signalVisit({ kind: "champion_gone_quiet", payload: { asked_at: "2026-10-01T00:00:00Z" } }),
    ).toBe("asked@2026-10-01T00:00:00Z");
    expect(
      signalVisit({ kind: "launch_date_at_risk", payload: { target_launch_date: "2026-11-02" } }),
    ).toBe("target@2026-11-02");
  });
});
