import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows, type UniqueIndexes } from "./fake-supabase";

/**
 * The hourly nudge's first run and its sends (QA 12.5): the first sweep
 * ever records the state it finds without emailing, later sweeps email
 * only what is new, sends are spaced out, and a recipient whose send
 * failed is tried again next hour — nobody else is mailed twice.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    sent: [] as Array<{ to: string; subject: string }>,
    failFor: new Set<string>(),
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../tickets.server", () => ({ MANAGER_ROLES: ["manager", "admin", "super_admin"] }));
vi.mock("../server/email", () => ({
  sendEmail: async (m: { to: string; subject: string }) => {
    if (h.failFor.has(m.to)) throw new Error("Email send failed: 429 rate limited");
    h.sent.push({ to: m.to, subject: m.subject });
    return { delivered: true, reason: null };
  },
}));
vi.mock("../server/audit", () => ({
  audit: async (e: any) => {
    await h.supabase.client.from("portal_audit_log").insert({
      action: e.action,
      entity_id: e.entity_id ?? null,
      payload: e.payload ?? null,
    });
  },
}));

import {
  NUDGE_BASELINE_KEY,
  NUDGE_SEND_GAP_MS,
  nudgeRecord,
  runDealNudges,
} from "../nudges.server";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** A closed deal nobody owns: one "Unclaimed" nudge, to the managers. */
function unclaimed(id: string, name: string) {
  return {
    id,
    name,
    stage: "closed_won",
    stage_entered_at: daysAgo(7),
    intake: {},
    sow_document_path: null,
    welcome_share_url: null,
    customer_id: null,
  };
}

const rows: Rows = {
  portal_accounts: [unclaimed("deal-a", "Acme")],
  portal_app_config: [],
  portal_audit_log: [],
  portal_gong_reports: [],
  portal_briefs: [],
  implementations: [],
  portal_stage_transitions: [],
  team_members: [],
  portal_profiles: [
    { id: "p1", email: "boss@gocanvas.com", role: "manager" },
    { id: "p2", email: "lead@gocanvas.com", role: "super_admin" },
    { id: "p3", email: "rep@gocanvas.com", role: "sales" },
  ],
};

/** 0081's claim index, as the database enforces it. */
const CLAIM_INDEX: UniqueIndexes = {
  portal_audit_log: [
    { cols: ["entity_id", "payload->>claim"], where: (r) => r.action === "deal.nudge_claim" },
  ],
};

/** Every read of one table answers with an error. */
function failReads(table: string) {
  const from = fake.client.from;
  fake.client.from = (t: string) => {
    const b = from(t);
    if (t !== table) return b;
    b.then = (ok: any) =>
      Promise.resolve({ data: null, error: { code: "57014", message: "timeout" } }).then(ok);
    return b;
  };
}

let fake: ReturnType<typeof createFakeSupabase>;
const nudged = () => fake.store["portal_audit_log"]!.filter((r) => r.action === "deal.nudged");
const noSleep = vi.fn(async (_ms: number) => {});

beforeEach(() => {
  fake = createFakeSupabase(rows);
  h.supabase.client = fake.client;
  h.sent.length = 0;
  h.failFor.clear();
  noSleep.mockClear();
});

describe("runDealNudges — the first sweep", () => {
  it("records what would fire now, emails nobody, and stamps the baseline", async () => {
    const run = await runDealNudges({ sleep: noSleep });
    expect(run).toMatchObject({ sent: 0, baselined: 1, failed: 0 });
    expect(h.sent).toHaveLength(0);
    expect(nudged()).toHaveLength(1);
    expect(nudged()[0]).toMatchObject({
      entity_id: "deal-a",
      payload: { key: expect.stringMatching(/:unclaimed$/), baseline: true, to: [] },
    });
    expect(fake.store["portal_app_config"]!.find((r) => r.key === NUDGE_BASELINE_KEY)).toBeTruthy();

    // The next hour: the same state is already said.
    const again = await runDealNudges({ sleep: noSleep });
    expect(again).toMatchObject({ sent: 0, baselined: 0, skipped: 1 });
    expect(h.sent).toHaveLength(0);
  });

  it("then emails only what is new, spaced out", async () => {
    await runDealNudges({ sleep: noSleep });
    fake.store["portal_accounts"]!.push(unclaimed("deal-b", "Bolt"));
    const run = await runDealNudges({ sleep: noSleep });
    expect(run).toMatchObject({ sent: 1, baselined: 0 });
    expect(h.sent.map((m) => m.to).sort()).toEqual(["boss@gocanvas.com", "lead@gocanvas.com"]);
    expect(h.sent.every((m) => m.subject === "Unclaimed: Bolt")).toBe(true);
    // A pause between two sends, none before the first.
    expect(noSleep).toHaveBeenCalledTimes(1);
    expect(noSleep).toHaveBeenCalledWith(NUDGE_SEND_GAP_MS);
  });

  it("records a manager-only nudge even when no manager can be found yet", async () => {
    fake.store["portal_profiles"] = [];
    const run = await runDealNudges({ sleep: noSleep });
    expect(run).toMatchObject({ baselined: 1, halted: null });
    expect(nudged()).toHaveLength(1);
  });

  for (const table of [
    "portal_accounts",
    "implementations",
    "portal_audit_log",
    "portal_profiles",
    "portal_stage_transitions",
  ]) {
    it(`stops without recording or stamping when ${table} cannot be read`, async () => {
      failReads(table);
      const run = await runDealNudges({ sleep: noSleep });
      expect(run.halted).toMatch(/could not read/);
      expect(run).toMatchObject({ sent: 0, baselined: 0 });
      expect(h.sent).toHaveLength(0);
      expect(fake.store["portal_app_config"]!.find((r) => r.key === NUDGE_BASELINE_KEY)).toBe(
        undefined,
      );
    });
  }

  it("does not stamp the baseline when its rows could not be saved", async () => {
    const from = fake.client.from;
    fake.client.from = (t: string) => {
      const b = from(t);
      if (t !== "portal_audit_log") return b;
      const insert = b.insert.bind(b);
      b.insert = (v: any) => {
        insert(v);
        b.then = (ok: any) =>
          Promise.resolve({ data: null, error: { message: "disk full" } }).then(ok);
        return b;
      };
      return b;
    };
    const run = await runDealNudges({ sleep: noSleep });
    expect(run.halted).toMatch(/baseline/);
    expect(fake.store["portal_app_config"]!.find((r) => r.key === NUDGE_BASELINE_KEY)).toBe(
      undefined,
    );
    expect(h.sent).toHaveLength(0);
  });

  it("does nothing when it cannot tell whether the baseline ran", async () => {
    const from = fake.client.from;
    fake.client.from = (table: string) => {
      const b = from(table);
      if (table !== "portal_app_config") return b;
      b.maybeSingle = async () => ({ data: null, error: { message: "boom" } });
      return b;
    };
    const run = await runDealNudges({ sleep: noSleep });
    expect(run).toMatchObject({ sent: 0, baselined: 0 });
    expect(nudged()).toHaveLength(0);
  });
});

describe("runDealNudges — after the baseline", () => {
  beforeEach(() => {
    fake.store["portal_app_config"]!.push({ key: NUDGE_BASELINE_KEY, value: daysAgo(1) });
  });

  it("records only the recipients whose send went through; the rest are tried next hour", async () => {
    h.failFor.add("lead@gocanvas.com");
    const first = await runDealNudges({ sleep: noSleep });
    expect(first).toMatchObject({ sent: 1, failed: 1 });
    expect(nudged()[0]!.payload).toMatchObject({
      to: ["boss@gocanvas.com"],
      failed: ["lead@gocanvas.com"],
    });

    // Next hour the provider takes it: only the one who missed it hears.
    h.failFor.clear();
    h.sent.length = 0;
    const second = await runDealNudges({ sleep: noSleep });
    expect(second).toMatchObject({ sent: 1, failed: 0 });
    expect(h.sent.map((m) => m.to)).toEqual(["lead@gocanvas.com"]);

    // And then it is finished.
    h.sent.length = 0;
    const third = await runDealNudges({ sleep: noSleep });
    expect(third).toMatchObject({ sent: 0, skipped: 1 });
    expect(h.sent).toHaveLength(0);
  });

  it("two overlapping sweeps send a nudge once: the second finds it claimed", async () => {
    fake = createFakeSupabase(
      { ...rows, portal_app_config: [{ key: NUDGE_BASELINE_KEY, value: daysAgo(1) }] },
      { unique: CLAIM_INDEX },
    );
    h.supabase.client = fake.client;
    const at = () => new Date("2026-10-09T14:00:05Z");
    const [one, two] = await Promise.all([
      runDealNudges({ sleep: noSleep, now: at }),
      runDealNudges({ sleep: noSleep, now: at }),
    ]);
    expect(one.sent + two.sent).toBe(1);
    expect(h.sent).toHaveLength(2); // the two managers, once each
  });

  it("a claim lasts the hour: a failed send is tried again the next", async () => {
    fake = createFakeSupabase(
      { ...rows, portal_app_config: [{ key: NUDGE_BASELINE_KEY, value: daysAgo(1) }] },
      { unique: CLAIM_INDEX },
    );
    h.supabase.client = fake.client;
    h.failFor.add("lead@gocanvas.com");
    await runDealNudges({ sleep: noSleep, now: () => new Date("2026-10-09T14:00:05Z") });
    h.failFor.clear();
    h.sent.length = 0;
    const same = await runDealNudges({
      sleep: noSleep,
      now: () => new Date("2026-10-09T14:20:00Z"),
    });
    expect(same.sent).toBe(0);
    const next = await runDealNudges({
      sleep: noSleep,
      now: () => new Date("2026-10-09T15:00:05Z"),
    });
    expect(next.sent).toBe(1);
    expect(h.sent.map((m) => m.to)).toEqual(["lead@gocanvas.com"]);
  });

  it("writes no row when every send failed, so the whole nudge is retried", async () => {
    h.failFor.add("boss@gocanvas.com");
    h.failFor.add("lead@gocanvas.com");
    const first = await runDealNudges({ sleep: noSleep });
    expect(first).toMatchObject({ sent: 0, failed: 2 });
    expect(nudged()).toHaveLength(0);
    h.failFor.clear();
    const second = await runDealNudges({ sleep: noSleep });
    expect(second).toMatchObject({ sent: 1, failed: 0 });
    expect(h.sent).toHaveLength(2);
  });
});

describe("nudgeRecord", () => {
  it("reads a legacy row (no lists) as finished, and a row with failures as open", () => {
    const r = nudgeRecord([
      { entity_id: "d", payload: { key: "k1", to: ["a@x.com"] } },
      { entity_id: "d", payload: { key: "k2", to: ["A@x.com"], failed: ["b@x.com"] } },
      { entity_id: "d", payload: { key: "k3", to: [], baseline: true } },
    ]);
    expect(r.get("d|k1")).toMatchObject({ done: true });
    expect(r.get("d|k2")?.done).toBe(false);
    expect([...r.get("d|k2")!.to]).toEqual(["a@x.com"]);
    expect(r.get("d|k3")?.done).toBe(true);
  });
});
