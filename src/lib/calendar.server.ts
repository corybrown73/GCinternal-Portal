import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { readIntake } from "./intake-answers";
import { closeDateFor } from "./onboarding-plan";
import { isPartnerJourney } from "./partner-implementation";
import { kickoffEntryDate } from "./presale-stages";
import { loadImplementations, type BookOptions } from "./hub.server";
import type { ResolvedScope } from "./ownership.server";
import {
  buildCalendarEvents,
  planMeetingsFor,
  primaryImplementationByDeal,
  teamToday,
  type CalendarCommitment,
  type CalendarEvent,
  type CalendarImplementation,
  type CalendarMilestone,
} from "./calendar-events";

const db = () => supabaseAdmin as any;

/**
 * The Calendar's records, read once and turned into events by the pure
 * builder in calendar-events.ts. Read-only.
 *
 * Scope and test accounts come from `loadImplementations`, the same reader
 * Home uses: the same owner rule, the same "left out unless asked for" for
 * test accounts (0085), the same masking in demo mode. So the Calendar can
 * never show an account Home would not.
 *
 * Nothing is limited by date. Every retained record is read, so past months
 * show what happened and future months show what is recorded to come.
 */
export async function loadCalendar(
  scope: ResolvedScope | null,
  opts: BookOptions = {},
  now: Date = new Date(),
): Promise<{ today: string; events: CalendarEvent[] }> {
  const today = teamToday(now);
  const rows = await loadImplementations(scope, { ...opts, includeSuperseded: true });
  if (!rows.length) return { today, events: [] };

  const ids = new Set(rows.map((r) => r.id));
  const dealIds = [...new Set(rows.map((r) => r.deal_id).filter(Boolean))] as string[];

  const [implRes, dealRes, histRes, commitRes, milestoneRes, teamRes] = await Promise.all([
    db()
      .from("implementations")
      .select(
        "id,created_at,journey_type,partner_key,target_date,target_launch_date,baseline_date,go_live_at,actual_launch_date",
      ),
    dealIds.length
      ? db().from("portal_accounts").select("id,intake,stage,stage_entered_at").in("id", dealIds)
      : Promise.resolve({ data: [], error: null }),
    dealIds.length
      ? db()
          .from("portal_stage_transitions")
          .select("account_id,to_stage,occurred_at")
          .in("account_id", dealIds)
      : Promise.resolve({ data: [], error: null }),
    db()
      .from("commitments")
      .select("id,implementation_id,description,due_date,status,fulfilled_at,owner_id"),
    db()
      .from("milestones")
      .select("id,implementation_id,name,stage,status,target_date,completed_date,owner_id"),
    db().from("team_members").select("id,name"),
  ]);
  for (const r of [implRes, dealRes, histRes, commitRes, milestoneRes, teamRes]) {
    if (r.error) throw new Error(`Could not read the calendar: ${r.error.message}`);
  }

  const teamName = new Map<string, string>(
    ((teamRes.data ?? []) as Array<{ id: string; name: string }>).map((t) => [t.id, t.name]),
  );
  const extra = new Map<string, any>(
    ((implRes.data ?? []) as any[]).filter((i) => ids.has(i.id)).map((i) => [i.id, i]),
  );

  const implementations: CalendarImplementation[] = rows.map((r) => {
    const x = extra.get(r.id) ?? {};
    return {
      id: r.id,
      name: r.name,
      customerId: r.customer_id ?? null,
      customerName: r.customer_name,
      dealId: r.deal_id ?? null,
      createdAt: String(x.created_at ?? ""),
      superseded: r.superseded === true,
      partner: isPartnerJourney(x),
      targetDate: x.target_date ?? null,
      targetLaunchDate: x.target_launch_date ?? r.target_launch_date ?? null,
      baselineDate: x.baseline_date ?? null,
      goLiveAt: x.go_live_at ?? null,
      actualLaunchDate: x.actual_launch_date ?? r.actual_launch_date ?? null,
    };
  });
  const implById = new Map(implementations.map((i) => [i.id, i]));

  // One plan per deal, from its newest implementation (see calendar-events).
  const primary = primaryImplementationByDeal(
    implementations.map((i) => ({ id: i.id, dealId: i.dealId, createdAt: i.createdAt })),
  );
  const deals = new Map<
    string,
    { intake: unknown; stage: string | null; stage_entered_at: string | null }
  >(((dealRes.data ?? []) as any[]).map((d) => [d.id, d]));
  const history = (histRes.data ?? []) as Array<{
    account_id: string;
    to_stage: string;
    occurred_at: string;
  }>;

  const planMeetings: Array<{
    implementationId: string;
    meetings: ReturnType<typeof planMeetingsFor>;
  }> = [];
  for (const [dealId, implementationId] of primary) {
    const impl = implById.get(implementationId);
    const deal = deals.get(dealId);
    if (!impl || !deal) continue;
    const intake = readIntake(deal.intake);
    const stageHistory = history.filter((h) => h.account_id === dealId);
    const closeDate = closeDateFor({
      intake,
      stageHistory,
      wonStageKey: "closed_won",
      today,
    }).date;
    planMeetings.push({
      implementationId,
      meetings: planMeetingsFor({
        intake,
        closeDate,
        dealStage: deal.stage,
        partner: impl.partner,
        kickoffOn: kickoffEntryDate(deal.stage, deal.stage_entered_at, stageHistory),
      }),
    });
  }

  const commitments: CalendarCommitment[] = ((commitRes.data ?? []) as any[])
    .filter((c) => ids.has(c.implementation_id))
    .map((c) => ({
      id: c.id,
      implementationId: c.implementation_id,
      description: c.description,
      dueDate: c.due_date ?? null,
      status: c.status,
      fulfilledAt: c.fulfilled_at ?? null,
      ownerName: c.owner_id ? (teamName.get(c.owner_id) ?? null) : null,
    }));

  const milestones: CalendarMilestone[] = ((milestoneRes.data ?? []) as any[])
    .filter((m) => ids.has(m.implementation_id))
    .map((m) => ({
      id: m.id,
      implementationId: m.implementation_id,
      name: m.name,
      stage: m.stage ?? null,
      status: m.status,
      targetDate: m.target_date ?? null,
      completedDate: m.completed_date ?? null,
      ownerName: m.owner_id ? (teamName.get(m.owner_id) ?? null) : null,
    }));

  const events = buildCalendarEvents({
    today,
    implementations,
    planMeetings,
    commitments,
    milestones,
  });
  return { today, events };
}
