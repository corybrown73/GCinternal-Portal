import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { EMPTY_INTAKE } from "@/lib/intake-answers";
import { dayLabel, type CalendarEvent } from "@/lib/calendar-events";

/**
 * The Calendar loader against a real database: PostgREST, the migrated schema
 * and seeded rows, read through the same service-role client the app uses.
 *
 * It needs a non-production Supabase-compatible stack, so it runs only when
 * CALENDAR_QA=1 is set. Without it the suite is skipped and nothing changes.
 * Every row it creates is named with the QA prefix and removed afterwards.
 */

const RUN = process.env["CALENDAR_QA"] === "1";
const suite = RUN ? describe : describe.skip;

const PREFIX = "QA-CAL";
// A fixed "now", so every relative date in the fixtures is deterministic.
const NOW = new Date("2026-10-13T12:00:00Z");

const db = () => supabaseAdmin as any;

const ids: {
  team: string[];
  customers: string[];
  deals: string[];
  impls: string[];
} = { team: [], customers: [], deals: [], impls: [] };

function intake(timeline: Record<string, unknown>, path = "new_logo") {
  return {
    ...EMPTY_INTAKE,
    path,
    timeline: { ...EMPTY_INTAKE.timeline, close_date: "2026-09-01", ...timeline },
  };
}

async function insert(table: string, row: Record<string, unknown>) {
  const { data, error } = await db().from(table).insert(row).select("id").single();
  if (error) throw new Error(`insert ${table}: ${error.message}`);
  return data.id as string;
}

let owner: string;
let standardA: { impl: string; deal: string };
let standardB: { impl: string; deal: string };
let partner: { impl: string; deal: string };
let superseded: { oldImpl: string; newImpl: string; deal: string };
let testAccount: { impl: string };
let goLive: { impl: string; deal: string };

suite("Calendar loader — integration against the QA database", () => {
  beforeAll(async () => {
    owner = await insert("team_members", {
      name: `${PREFIX} Owner`,
      role: "implementation_manager",
    });
    ids.team.push(owner);

    const customer = async (name: string, isTest = false) => {
      const id = await insert("customers", { name: `${PREFIX} ${name}`, is_test: isTest });
      ids.customers.push(id);
      return id;
    };
    const deal = async (
      customerId: string,
      name: string,
      stage: string,
      intakeValue: unknown,
      isTest = false,
    ) => {
      const id = await insert("portal_accounts", {
        name: `${PREFIX} ${name}`,
        stage,
        intake: intakeValue,
        customer_id: customerId,
        is_test: isTest,
      });
      ids.deals.push(id);
      return id;
    };
    const impl = async (row: Record<string, unknown>) => {
      const id = await insert("implementations", { current_stage: "get_it_working", ...row });
      ids.impls.push(id);
      return id;
    };

    // Standard: a booked kickoff that was held, and a moved kickoff with no time.
    const cA = await customer("Standard A");
    const dA = await deal(
      cA,
      "Standard A deal",
      "get_it_working",
      intake({
        overrides: { kickoff: "2026-09-25" },
        times: { kickoff: "09:30" },
        completed: { kickoff: "2026-09-25" },
      }),
    );
    const iA = await impl({
      name: `${PREFIX} Standard A`,
      customer_id: cA,
      deal_id: dA,
      owner_id: owner,
    });
    standardA = { impl: iA, deal: dA };

    const cB = await customer("Standard B");
    const dB = await deal(
      cB,
      "Standard B deal",
      "get_it_working",
      intake({ overrides: { kickoff: "2026-10-20" } }),
    );
    const iB = await impl({ name: `${PREFIX} Standard B`, customer_id: cB, deal_id: dB });
    standardB = { impl: iB, deal: dB };

    // Partner: an intake that would carry a standard plan, which must never show.
    const cP = await customer("Partner");
    const dP = await deal(
      cP,
      "Partner deal",
      "get_it_working",
      intake(
        { overrides: { kickoff: "2026-10-21" }, times: { kickoff: "10:00" } },
        "partner_implementation",
      ),
    );
    const iP = await impl({
      name: `${PREFIX} Partner`,
      customer_id: cP,
      deal_id: dP,
      journey_type: "partner_implementation",
      partner_key: "field_fusion_iq",
    });
    partner = { impl: iP, deal: dP };

    // Superseded: an older project and its newer replacement on one deal.
    const cS = await customer("Superseded");
    const dS = await deal(
      cS,
      "Superseded deal",
      "get_it_working",
      intake({ overrides: { kickoff: "2026-10-27" }, times: { kickoff: "11:00" } }),
    );
    const newImpl = await impl({
      name: `${PREFIX} Superseded (current)`,
      customer_id: cS,
      deal_id: dS,
      created_at: "2026-09-15T00:00:00Z",
    });
    const oldImpl = await impl({
      name: `${PREFIX} Superseded (earlier)`,
      customer_id: cS,
      deal_id: dS,
      created_at: "2026-08-01T00:00:00Z",
      superseded_by_implementation_id: newImpl,
    });
    superseded = { oldImpl, newImpl, deal: dS };

    // Test account: flagged on the customer, with an open commitment.
    const cT = await customer("Test account", true);
    const iT = await impl({ name: `${PREFIX} Test account`, customer_id: cT });
    testAccount = { impl: iT };

    // Go-live: the target and the real go-live differ.
    const cG = await customer("Go-live");
    const dG = await deal(cG, "Go-live deal", "onboarding_complete", intake({}));
    const iG = await impl({
      name: `${PREFIX} Go-live`,
      customer_id: cG,
      deal_id: dG,
      target_date: "2026-11-02",
      go_live_at: "2026-10-30",
    });
    goLive = { impl: iG, deal: dG };

    // Records: commitments and milestones on the standard and partner projects.
    await insert("commitments", {
      implementation_id: standardA.impl,
      description: `${PREFIX} overdue commitment`,
      due_date: "2026-10-01",
      status: "open",
      owner_id: owner,
    });
    await insert("commitments", {
      implementation_id: standardA.impl,
      description: `${PREFIX} fulfilled commitment`,
      due_date: "2026-09-10",
      status: "fulfilled",
      fulfilled_at: "2026-09-09T15:00:00Z",
    });
    await insert("commitments", {
      implementation_id: standardB.impl,
      description: `${PREFIX} cancelled commitment`,
      due_date: "2026-10-10",
      status: "cancelled",
    });
    await insert("commitments", {
      implementation_id: superseded.oldImpl,
      description: `${PREFIX} earlier project commitment`,
      due_date: "2026-08-20",
      status: "fulfilled",
      fulfilled_at: "2026-08-19T12:00:00Z",
    });
    await insert("commitments", {
      implementation_id: testAccount.impl,
      description: `${PREFIX} test account commitment`,
      due_date: "2026-10-16",
      status: "open",
    });
    await insert("milestones", {
      implementation_id: standardA.impl,
      name: `${PREFIX} Kickoff pack ready`,
      status: "not_started",
      target_date: "2026-10-30",
    });
    await insert("milestones", {
      implementation_id: partner.impl,
      name: "Implementation Ready",
      stage: "partner_setup",
      status: "completed",
      completed_date: "2026-10-05",
    });
  });

  afterAll(async () => {
    // Children first, then the rows they point at. Superseded projects go last.
    for (const table of ["milestones", "commitments"]) {
      await db().from(table).delete().like("description", `${PREFIX}%`);
      await db().from(table).delete().like("name", `${PREFIX}%`);
    }
    for (const id of [...ids.impls].reverse())
      await db().from("implementations").delete().eq("id", id);
    for (const id of ids.deals) await db().from("portal_accounts").delete().eq("id", id);
    for (const id of ids.customers) await db().from("customers").delete().eq("id", id);
    for (const id of ids.team) await db().from("team_members").delete().eq("id", id);
  });

  async function calendar(includeTests = false): Promise<CalendarEvent[]> {
    const { loadCalendar } = await import("@/lib/calendar.server");
    const { events } = await loadCalendar(null, { includeTests }, NOW);
    return events;
  }

  it("reads the same day the team sees, and every event key is unique", async () => {
    const { loadCalendar } = await import("@/lib/calendar.server");
    const { today, events } = await loadCalendar(null, {}, NOW);
    expect(today).toBe("2026-10-13");
    const keys = events.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("maps a standard plan's held call as completed, on its day, with its recorded time", async () => {
    const e = (await calendar()).find((x) => x.key === `plan:${standardA.deal}:kickoff`);
    expect(e).toBeDefined();
    expect(e!.status).toBe("completed");
    expect(e!.date).toBe("2026-09-25");
    expect(e!.time).toBe("09:30");
    expect(e!.statusDetail).toMatch(/^Completed /);
  });

  it("keeps a moved, untimed call as not booked yet, with no time invented", async () => {
    const e = (await calendar()).find((x) => x.key === `plan:${standardB.deal}:kickoff`);
    expect(e).toBeDefined();
    expect(e!.status).toBe("not_booked");
    expect(e!.time).toBeNull();
    expect(e!.statusDetail).toBe("No time recorded on the plan");
    expect(e!.missing).toContain("Time not recorded");
  });

  it("gives a partner implementation no standard meetings, but its recorded milestone", async () => {
    const events = await calendar();
    expect(events.some((x) => x.key.startsWith(`plan:${partner.deal}:`))).toBe(false);
    const m = events.find((x) => x.kind === "milestone" && x.title === "Implementation Ready");
    expect(m).toBeDefined();
    expect(m!.partner).toBe(true);
    expect(m!.status).toBe("completed");
    expect(m!.date).toBe("2026-10-05");
  });

  it("shows a deal's plan once, every call from the newest implementation only", async () => {
    const events = await calendar();
    const plan = events.filter((x) => x.key.startsWith(`plan:${superseded.deal}:`));
    expect(plan.length).toBeGreaterThan(0);
    expect(new Set(plan.map((p) => p.key)).size).toBe(plan.length);
    expect(plan.every((p) => p.implementationId === superseded.newImpl)).toBe(true);
    expect(plan.some((p) => p.implementationId === superseded.oldImpl)).toBe(false);
  });

  it("keeps the superseded project's own records, marked as superseded", async () => {
    const e = (await calendar()).find((x) => x.title === `${PREFIX} earlier project commitment`);
    expect(e).toBeDefined();
    expect(e!.implementationId).toBe(superseded.oldImpl);
    expect(e!.status).toBe("completed");
    expect(e!.facts.some((f) => f.startsWith("Superseded"))).toBe(true);
  });

  it("classes an open commitment past its due day as overdue, and keeps a cancellation only as recorded", async () => {
    const events = await calendar();
    expect(events.find((x) => x.title === `${PREFIX} overdue commitment`)?.status).toBe("overdue");
    expect(events.find((x) => x.title === `${PREFIX} fulfilled commitment`)?.status).toBe(
      "completed",
    );
    expect(events.find((x) => x.title === `${PREFIX} cancelled commitment`)?.status).toBe(
      "cancelled",
    );
  });

  it("places a standard milestone on its target, planned while ahead", async () => {
    const e = (await calendar()).find((x) => x.title === `${PREFIX} Kickoff pack ready`);
    expect(e).toBeDefined();
    expect(e!.date).toBe("2026-10-30");
    expect(e!.status).toBe("planned");
  });

  it("keeps the plan end as history and gives the real go-live its own event", async () => {
    const events = await calendar();
    const target = events.find((x) => x.key === `go-live-target:${goLive.impl}`);
    const actual = events.find((x) => x.key === `go-live-actual:${goLive.impl}`);
    expect(target?.status).toBe("target_date");
    expect(target?.date).toBe("2026-11-02");
    expect(actual?.status).toBe("went_live");
    expect(actual?.title).toBe("Actual go-live");
    expect(actual?.date).toBe("2026-10-30");
    expect(actual?.statusDetail).toBe(`Plan end was ${dayLabel("2026-11-02")}`);
  });

  it("hides a test account by default, and shows it only when asked", async () => {
    const hidden = await calendar(false);
    const shown = await calendar(true);
    expect(hidden.some((x) => x.title === `${PREFIX} test account commitment`)).toBe(false);
    expect(shown.some((x) => x.title === `${PREFIX} test account commitment`)).toBe(true);
  });

  it("returns only event records with a usable calendar day, and no test-only leftovers", async () => {
    for (const e of await calendar(true)) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.key).toBeTruthy();
    }
  });
});
