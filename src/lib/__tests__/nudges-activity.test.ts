import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Rows } from "./fake-supabase";

/**
 * Daily reminders (Teya, item 6): a deal someone is working is spared the
 * 'Waiting:' reminder but not 'Stuck:'; the link opens the deal's own live
 * project; partner status follows the live project or the intake's path;
 * overdue calls are keyed by call and date with a silent carry-over; and a
 * recipient counts as sent only when the mailer delivered.
 */
const h = vi.hoisted(() => {
  const state = {
    supabase: { client: null as any },
    forward: null as any,
    sent: [] as Array<{ to: string; subject: string; html: string }>,
    holdFor: new Set<string>(),
  };
  state.forward = new Proxy({}, { get: (_t, prop) => state.supabase.client?.[prop] });
  return state;
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: h.forward }));
vi.mock("../tickets.server", () => ({ MANAGER_ROLES: ["manager", "admin", "super_admin"] }));
vi.mock("../server/email", () => ({
  sendEmail: async (m: { to: string; subject: string; html: string }) => {
    if (h.holdFor.has(m.to)) return { delivered: false, reason: "held" };
    h.sent.push({ to: m.to, subject: m.subject, html: m.html });
    return { delivered: true, reason: null };
  },
}));
vi.mock("../server/audit", () => ({
  audit: async (e: any) => {
    await h.supabase.client.from("portal_audit_log").insert({
      action: e.action,
      actor_type: e.actor_type,
      entity_id: e.entity_id ?? null,
      payload: e.payload ?? null,
    });
  },
}));

import {
  NUDGE_BASELINE_KEY,
  overdueCarryOver,
  reminderLink,
  runDealNudges,
} from "../nudges.server";
import { businessDaysQuiet, newestActivity, workedRecently } from "../deal-activity";
import { loadPersonActivity } from "../deal-activity.server";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** A deal in Get it working, owned by Teya through its live project. */
function working(id: string, name: string, enteredDaysAgo: number, extra: object = {}) {
  return {
    id,
    name,
    stage: "get_it_working",
    stage_entered_at: daysAgo(enteredDaysAgo),
    intake: {},
    sow_document_path: "sow.pdf",
    welcome_share_url: null,
    customer_id: `cust-${id}`,
    ...extra,
  };
}

function baseRows(): Rows {
  return {
    portal_accounts: [],
    portal_app_config: [{ key: NUDGE_BASELINE_KEY, value: daysAgo(30) }],
    portal_audit_log: [],
    portal_gong_reports: [],
    portal_briefs: [],
    implementations: [],
    portal_stage_transitions: [],
    portal_assignments: [],
    customers: [],
    team_members: [{ id: "tm-teya", name: "Teya", email: "teya@gocanvas.com" }],
    portal_profiles: [{ id: "p1", email: "boss@gocanvas.com", role: "manager" }],
  };
}

function impl(id: string, dealId: string, extra: object = {}) {
  return {
    id,
    deal_id: dealId,
    owner_id: "tm-teya",
    superseded_by_implementation_id: null,
    created_at: daysAgo(20),
    journey_type: "new_logo",
    partner_key: null,
    ...extra,
  };
}

let fake: ReturnType<typeof createFakeSupabase>;
const noSleep = async () => {};
const subjects = () => h.sent.map((m) => m.subject);

beforeEach(() => {
  h.sent.length = 0;
  h.holdFor.clear();
});

function load(rows: Rows, maxRows?: number) {
  fake = createFakeSupabase(rows, maxRows ? { maxRows } : {});
  h.supabase.client = fake.client;
}

describe("a deal someone is working", () => {
  it("is spared 'Waiting:' when a person logged work in the last three business days", async () => {
    const rows = baseRows();
    // 9 calendar days in the stage: 5 to 7 business days, the warn band.
    rows["portal_accounts"] = [working("busy", "Busy Co", 9), working("quiet", "Quiet Co", 9)];
    rows["implementations"] = [impl("i-busy", "busy"), impl("i-quiet", "quiet")];
    rows["journal_entries"] = [
      { implementation_id: "i-busy", author_id: "tm-teya", created_at: daysAgo(0) },
    ];
    // A system write never counts as work.
    rows["portal_audit_log"] = [
      {
        action: "deal.intake_prefilled",
        actor_type: "system",
        entity_id: "quiet",
        created_at: daysAgo(0),
        payload: {},
      },
    ];
    load(rows);
    await runDealNudges({ sleep: noSleep });
    expect(subjects().some((s) => s.startsWith("Waiting: Quiet Co"))).toBe(true);
    expect(subjects().some((s) => s.startsWith("Waiting: Busy Co"))).toBe(false);
  });

  it("still gets 'Stuck:' at the escalate limit, however busy", async () => {
    const rows = baseRows();
    rows["portal_accounts"] = [working("busy", "Busy Co", 20)];
    rows["implementations"] = [impl("i-busy", "busy")];
    rows["portal_audit_log"] = [
      {
        action: "deal.intake_updated",
        actor_type: "user",
        entity_id: "busy",
        created_at: daysAgo(0),
        payload: {},
      },
    ];
    load(rows);
    await runDealNudges({ sleep: noSleep });
    expect(subjects().some((s) => s.startsWith("Stuck: Busy Co"))).toBe(true);
  });
});

describe("the reminder's link", () => {
  it("opens the deal's own live project on Current Implementation", async () => {
    const rows = baseRows();
    rows["portal_accounts"] = [working("d1", "Linked Co", 9)];
    rows["implementations"] = [
      impl("i-old", "d1", { superseded_by_implementation_id: "i-live", created_at: daysAgo(1) }),
      impl("i-live", "d1", { created_at: daysAgo(10) }),
    ];
    load(rows);
    await runDealNudges({ sleep: noSleep });
    const waiting = h.sent.find((m) => m.subject.startsWith("Waiting: Linked Co"));
    expect(waiting?.html).toContain("/customers/cust-d1?tab=implementation&impl=i-live");
  });

  it("falls back to the deal page with no customer or no project", () => {
    expect(reminderLink("https://x", { dealId: "d", customerId: "c", liveImplId: "i" })).toBe(
      "https://x/customers/c?tab=implementation&impl=i",
    );
    expect(reminderLink("https://x", { dealId: "d", customerId: "c", liveImplId: null })).toBe(
      "https://x/deals/d",
    );
    expect(reminderLink("https://x", { dealId: "d", customerId: null, liveImplId: "i" })).toBe(
      "https://x/deals/d",
    );
  });
});

describe("partner detection", () => {
  it("reads the live project, not a superseded partner one", async () => {
    const rows = baseRows();
    rows["portal_accounts"] = [working("std", "Was Partner", 9)];
    rows["implementations"] = [
      impl("i-new", "std", { created_at: daysAgo(2) }),
      impl("i-partner", "std", {
        journey_type: "partner_implementation",
        superseded_by_implementation_id: "i-new",
        created_at: daysAgo(15),
      }),
    ];
    load(rows);
    await runDealNudges({ sleep: noSleep });
    expect(subjects().some((s) => s.startsWith("Waiting: Was Partner"))).toBe(true);
  });

  it("treats a deal whose intake chose the partner path as partner, project or not", async () => {
    const rows = baseRows();
    rows["portal_accounts"] = [
      working("pp", "Partner Path", 20, { intake: { path: "partner_implementation" } }),
    ];
    rows["portal_assignments"] = [
      { deal_id: "pp", team_member_id: "tm-teya", created_at: daysAgo(20) },
    ];
    load(rows);
    await runDealNudges({ sleep: noSleep });
    expect(subjects().filter((s) => s.includes("Partner Path"))).toEqual([]);
  });
});

describe("overdue keys", () => {
  it("carries a reminder sent under the old per-visit key over, once", () => {
    const covers = overdueCarryOver([
      { entity_id: "d", payload: { key: "get_it_working@2026-10-01:overdue:working" } },
      { entity_id: "d", payload: { key: "partner:kickoff@2026-10-01:overdue:m:1" } },
      { entity_id: "e", payload: { key: "make_it_yours@2026-10-01:overdue:adjust" } },
      { entity_id: "e", payload: { key: "overdue:adjust@2026-10-05" } },
    ]);
    expect(covers("d", "overdue:working@2026-10-03")).toBe(
      "get_it_working@2026-10-01:overdue:working",
    );
    expect(covers("d", "overdue:m:1@2026-10-03")).toBe("partner:kickoff@2026-10-01:overdue:m:1");
    // Already on the new key: a moved date reminds again.
    expect(covers("e", "overdue:adjust@2026-10-09")).toBeNull();
    expect(covers("d", "overdue:other@2026-10-03")).toBeNull();
    expect(covers("d", "get_it_working@2026-10-01:warn")).toBeNull();
  });

  it("carries over only a reminder about the call's current date", () => {
    // Reminded on 3 Oct for a call due 1 Oct; the call then moved to 20 Oct
    // and was missed again after the switch.
    const covers = overdueCarryOver([
      {
        entity_id: "d",
        created_at: "2026-10-03T13:00:00Z",
        payload: { key: "get_it_working@2026-09-28:overdue:working" },
      },
    ]);
    expect(covers("d", "overdue:working@2026-10-20")).toBeNull();
    // Still about the date it was reminded for: silent.
    expect(covers("d", "overdue:working@2026-10-01")).toBe(
      "get_it_working@2026-09-28:overdue:working",
    );
  });

  it("records a call reminded under the old key silently, and mails only the others", async () => {
    // Closed 40 days ago: the plan's calls are all in the past and unticked.
    const closed = daysAgo(40).slice(0, 10);
    const deal = () =>
      working("d1", "Carried Co", 9, { intake: { timeline: { close_date: closed } } });
    const rows = baseRows();
    rows["portal_accounts"] = [deal()];
    rows["implementations"] = [impl("i1", "d1")];
    load(rows);
    await runDealNudges({ sleep: noSleep });
    const overdue = fake.store["portal_audit_log"]!.filter(
      (r) => r.action === "deal.nudged" && String(r.payload?.key).startsWith("overdue:"),
    );
    expect(overdue.length).toBeGreaterThan(0);
    const call = /^overdue:(.+)@/.exec(String(overdue[0]!.payload.key))![1];

    // The same state, with that call already reminded under the old key.
    const rows2 = baseRows();
    rows2["portal_accounts"] = [deal()];
    rows2["implementations"] = [impl("i1", "d1")];
    rows2["portal_audit_log"] = [
      {
        action: "deal.nudged",
        entity_id: "d1",
        payload: { key: `kickoff@2026-09-30:overdue:${call}`, to: ["teya@gocanvas.com"] },
      },
    ];
    load(rows2);
    h.sent.length = 0;
    await runDealNudges({ sleep: noSleep });
    const overdueSent = h.sent.filter((m) => m.subject.startsWith("Overdue:"));
    expect(overdueSent).toHaveLength(overdue.length - 1);
    const carried = fake.store["portal_audit_log"]!.filter((r) => r.payload?.carried_from);
    expect(carried).toHaveLength(1);
    expect(carried[0]!.payload).toMatchObject({ to: [], key: overdue[0]!.payload.key });

    // And it stays quiet next hour.
    h.sent.length = 0;
    await runDealNudges({ sleep: noSleep });
    expect(h.sent.filter((m) => m.subject.startsWith("Overdue:"))).toHaveLength(0);
  });
});

describe("sent means delivered", () => {
  it("records a held recipient without counting it as sent or retrying it", async () => {
    const rows = baseRows();
    rows["portal_accounts"] = [working("d1", "Held Co", 9)];
    rows["implementations"] = [impl("i1", "d1")];
    load(rows);
    h.holdFor.add("teya@gocanvas.com");
    const first = await runDealNudges({ sleep: noSleep });
    expect(first.sent).toBe(0);
    expect(first.held).toBeGreaterThan(0);
    const waiting = fake.store["portal_audit_log"]!.find(
      (r) => r.action === "deal.nudged" && String(r.payload?.key).endsWith(":warn"),
    );
    expect(waiting?.payload).toMatchObject({ to: [], held: ["teya@gocanvas.com"] });
    const again = await runDealNudges({ sleep: noSleep });
    expect(again.held).toBe(0);
  });
});

describe("deal-activity", () => {
  it("keeps the newest stamp per deal and judges the three-business-day window", () => {
    const m = newestActivity([
      { dealId: "a", at: "2026-10-12T10:00:00Z" },
      { dealId: "a", at: "2026-10-14T10:00:00Z" },
      { dealId: "", at: "2026-10-15T10:00:00Z" },
    ]);
    expect([...m]).toEqual([["a", "2026-10-14T10:00:00Z"]]);
    // Friday 16 Oct 2026.
    expect(businessDaysQuiet("2026-10-14T10:00:00Z", "2026-10-16")).toBe(2);
    expect(workedRecently("2026-10-14T10:00:00Z", "2026-10-16")).toBe(true);
    expect(workedRecently("2026-10-13T10:00:00Z", "2026-10-16")).toBe(false);
    expect(workedRecently(null, "2026-10-16")).toBe(false);
  });

  it("reads person work on the deal and its live project, never system writes", async () => {
    const since = "2026-10-01T00:00:00Z";
    load({
      portal_audit_log: [
        { actor_type: "user", entity_id: "d1", created_at: "2026-10-05T00:00:00Z" },
        { actor_type: "system", entity_id: "d2", created_at: "2026-10-14T00:00:00Z" },
        { actor_type: "user", entity_id: "i2", created_at: "2026-10-06T00:00:00Z" },
      ],
      portal_stage_transitions: [
        { account_id: "d1", actor_profile_id: null, occurred_at: "2026-10-15T00:00:00Z" },
      ],
      portal_milestone_date_changes: [
        { account_id: "d1", change_kind: "direct", created_at: "2026-10-07T00:00:00Z" },
        { account_id: "d2", change_kind: "cascade", created_at: "2026-10-15T00:00:00Z" },
      ],
      portal_onboarding_notes: [],
      portal_gong_reports: [
        { account_id: "d2", uploaded_by: null, created_at: "2026-10-15T00:00:00Z" },
      ],
      journal_entries: [],
      work_items: [
        { implementation_id: "i2", completed_by: "tm", completed_at: "2026-10-09T00:00:00Z" },
        { implementation_id: "i-old", completed_by: "tm", completed_at: "2026-10-15T00:00:00Z" },
      ],
      account_files: [
        { implementation_id: "i2", added_by: "p", created_at: "2026-09-01T00:00:00Z" },
      ],
      audit_log: [],
    });
    const out = await loadPersonActivity({
      dealIds: ["d1", "d2"],
      liveImplByDeal: new Map([["d2", "i2"]]),
      since,
    });
    expect(Object.fromEntries(out)).toEqual({
      d1: "2026-10-07T00:00:00Z",
      d2: "2026-10-09T00:00:00Z",
    });
  });

  it("reads past the server's row cap, newest first, so a busy window never hides today's work", async () => {
    // Three old rows on another deal fill the first page; the deal worked
    // today is beyond the cap of an unordered single read.
    const old = (n: number) => ({
      actor_type: "user",
      entity_id: "d-busy",
      created_at: `2026-10-0${n}T00:00:00Z`,
    });
    load(
      {
        portal_audit_log: [
          old(1),
          old(2),
          old(3),
          { actor_type: "user", entity_id: "d1", created_at: "2026-10-15T09:00:00Z" },
        ],
        portal_stage_transitions: [],
        portal_milestone_date_changes: [],
        portal_onboarding_notes: [],
        portal_gong_reports: [],
        journal_entries: [],
        work_items: [],
        account_files: [],
        audit_log: [],
      },
      2,
    );
    const out = await loadPersonActivity({
      dealIds: ["d1", "d-busy"],
      liveImplByDeal: new Map(),
      since: "2026-10-01T00:00:00Z",
      pageSize: 2,
    });
    expect(Object.fromEntries(out)).toEqual({
      d1: "2026-10-15T09:00:00Z",
      "d-busy": "2026-10-03T00:00:00Z",
    });
  });
});
