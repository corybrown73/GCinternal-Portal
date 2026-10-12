import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows, type UniqueIndexes } from "./fake-supabase";

/**
 * The morning report goes out once a day (QA 12.7): the day's stamp is a
 * text key (entity_key), read back by key and action, and a read that
 * fails stops the send rather than risking a second report.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    sent: [] as string[],
    failSends: false,
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../presale.server", () => ({ loadPipeline: async () => ({ deals: [] }) }));
vi.mock("../tickets.server", () => ({
  managerProfiles: async () => [{ email: "boss@gocanvas.com" }],
}));
vi.mock("../server/email", () => ({
  sendEmail: async (m: { to: string }) => {
    if (h.failSends) throw new Error("Email send failed: 503");
    h.sent.push(m.to);
    return { delivered: true, reason: null };
  },
}));
vi.mock("../server/audit", () => ({
  audit: async (e: any) => {
    await h.supabase.client.from("portal_audit_log").insert({
      action: e.action,
      entity_id: e.entity_id ?? null,
      entity_key: e.entity_key ?? null,
      payload: e.payload ?? null,
    });
  },
}));

import { runDailyReport } from "../pipeline-report.server";

const rows: Rows = { portal_audit_log: [] };
let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T13:00:00Z")); // a Thursday
  fake = createFakeSupabase(rows);
  h.supabase.client = fake.client;
  h.sent.length = 0;
  h.failSends = false;
});

/** 0081's one-stamp-a-day index, as the database enforces it. */
const DAY_INDEX: UniqueIndexes = {
  portal_audit_log: [{ cols: ["entity_key"], where: (r) => r.action === "report.daily_sent" }],
};

afterEach(() => {
  vi.useRealTimers();
});

describe("runDailyReport", () => {
  it("stamps the day as entity_key and finds it on a second run", async () => {
    expect(await runDailyReport()).toEqual({ sent: 1, skipped: null });
    const stamp = fake.store["portal_audit_log"]!.find((r) => r.action === "report.daily_sent");
    expect(stamp).toMatchObject({ entity_key: "2026-10-08", entity_id: null });

    expect(await runDailyReport()).toEqual({ sent: 0, skipped: "already sent today" });
    expect(h.sent).toEqual(["boss@gocanvas.com"]);
  });

  it("refuses to send when it cannot read today's stamp", async () => {
    const from = fake.client.from;
    fake.client.from = (table: string) => {
      const b = from(table);
      if (table !== "portal_audit_log") return b;
      b.then = (ok: any) =>
        Promise.resolve({ data: null, error: { code: "22P02", message: "bad" } }).then(ok);
      return b;
    };
    const out = await runDailyReport();
    expect(out.sent).toBe(0);
    expect(out.skipped).toMatch(/could not check/);
    expect(h.sent).toHaveLength(0);
  });

  it("two overlapping runs send one report: the day is claimed before the sends", async () => {
    fake = createFakeSupabase(rows, { unique: DAY_INDEX });
    h.supabase.client = fake.client;
    const [one, two] = await Promise.all([runDailyReport(), runDailyReport()]);
    expect(one.sent + two.sent).toBe(1);
    expect(h.sent).toEqual(["boss@gocanvas.com"]);
    const stamps = fake.store["portal_audit_log"]!.filter((r) => r.action === "report.daily_sent");
    expect(stamps).toHaveLength(1);
    expect(stamps[0]!.payload).toMatchObject({ sent: 1 });
  });

  it("takes the claim back when no send went through, so a later run can try", async () => {
    h.failSends = true;
    expect(await runDailyReport()).toEqual({ sent: 0, skipped: "no send went through" });
    expect(fake.store["portal_audit_log"]!.filter((r) => r.action === "report.daily_sent")).toEqual(
      [],
    );
    h.failSends = false;
    expect(await runDailyReport()).toEqual({ sent: 1, skipped: null });
  });
});
