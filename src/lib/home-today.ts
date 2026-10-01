import type { ImplHealth } from "./customer360-derive";
import type { QueueRow } from "./home-triage";
import type { CommitmentRow } from "./hub-types";
import { initials } from "./initials";
import type { DealInboxRow } from "./presale.server";
import { isOnboardingStage } from "./presale-stages";
import { FLOW_STAGES } from "./stage-flow";
import { addBusinessDays, businessDaysBetween } from "./onboarding-timeline";

/**
 * Today, as the mockup lays it out: four numbers, the accounts that need me,
 * the next seven days, my book as a whole, and where the accounts sit. All of
 * it is read from the triage queue, the deal inbox and the commitments the
 * page already loads — nothing here is a new judgement, only a new layout.
 */

export type Tone = "critical" | "warning" | "info" | "good" | "muted";

export type NeedsMeRow = {
  id: string;
  kind: "implementation" | "deal";
  name: string;
  initials: string;
  /** "Implementation · Teya Rampaul", "Closed Won · Unassigned". */
  sub: string;
  /** "Tier 2 · TTV 45 days". */
  meta: string | null;
  chip: { label: string; tone: Tone };
  reason: string;
  detail: string | null;
  nextStep: string | null;
  due: { label: string; tone: Tone } | null;
  link: { customerId: string } | { dealId: string };
  rank: number;
};

export type UpcomingEvent = {
  key: string;
  date: string;
  time: string | null;
  label: string;
  account: string;
  kind: "meeting" | "commitment" | "launch";
  link: { customerId: string } | { dealId: string };
};

export type DayGroup = { key: string; title: string; sub: string; events: UpcomingEvent[] };

export type Today = {
  tiles: { needAttention: number; waitingOn: number; upcoming: number; onTrack: number };
  /** Act now, and the deals nobody owns: the rows the "Need attention" tile counts. */
  needsMe: NeedsMeRow[];
  /** Keep an eye on: not counted in the tile, listed under their own heading. */
  watch: NeedsMeRow[];
  comingUp: DayGroup[];
  book: {
    total: number;
    needAttention: number;
    waitingOn: number;
    moving: number;
    launching: number;
  };
  stages: Array<{ key: string; label: string; count: number; pct: number }>;
};

export type TodayInput = {
  queue: Record<"act_now" | "needs_attention" | "moving", QueueRow[]>;
  health: Map<string, { level: ImplHealth }>;
  dealInbox: DealInboxRow[];
  commitments: CommitmentRow[];
  /** ISO date. */
  today: string;
};

const MS_DAY = 86_400_000;

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(d.getTime() + n * MS_DAY).toISOString().slice(0, 10);
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function weekday(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/** "Today", "Tomorrow", "Sep 30", or "Overdue" with its tone. */
export function dueLabel(iso: string, today: string): { label: string; tone: Tone } {
  if (iso < today) return { label: "Overdue", tone: "critical" };
  if (iso === today) return { label: "Today", tone: "critical" };
  if (iso === addDays(today, 1)) return { label: "Tomorrow", tone: "warning" };
  const label = new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return { label, tone: businessDaysBetween(today, iso) <= 3 ? "warning" : "muted" };
}

function chipFor(row: QueueRow, level: ImplHealth | undefined): { label: string; tone: Tone } {
  const r = row.reason.toLowerCase();
  if (level === "blocked") return { label: "Blocked", tone: "critical" };
  if (/launch|overdue|past/.test(r) && row.bucket === "act_now")
    return { label: "Launch risk", tone: "warning" };
  if (level === "at_risk") return { label: "At risk", tone: "critical" };
  if (row.dependency.party === "customer") return { label: "Waiting on customer", tone: "warning" };
  if (row.bucket === "act_now") return { label: "Needs action", tone: "critical" };
  return { label: "Watch", tone: "warning" };
}

/** The first sentence, and the rest as the detail line. */
function splitReason(reason: string): { head: string; detail: string | null } {
  const m = reason.match(/^(.+?[.!?])\s+(.+)$/);
  return m ? { head: m[1]!, detail: m[2]! } : { head: reason, detail: null };
}

function rowFromQueue(row: QueueRow, level: ImplHealth | undefined, today: string): NeedsMeRow {
  const facts = row.facts;
  const { head, detail } = splitReason(row.reason);
  // The date this row turns on: an overdue call, else the next call, else
  // the target. Nothing invented — no date, no "due".
  const overdue = facts?.overdue_calls[0]?.date ?? null;
  const nextCall = facts?.upcoming_calls?.[0]?.date ?? null;
  const dueIso = overdue ?? nextCall ?? row.impl.target_launch_date ?? null;
  const ttv =
    facts?.close_date && facts.live_date
      ? Math.round(
          (new Date(`${facts.live_date}T00:00:00Z`).getTime() -
            new Date(`${facts.close_date}T00:00:00Z`).getTime()) /
            MS_DAY,
        )
      : null;
  const meta = [row.impl.tier ? `Tier ${row.impl.tier}` : null, ttv ? `TTV ${ttv} days` : null]
    .filter(Boolean)
    .join(" · ");
  const next = row.next_action;
  return {
    id: row.impl.id,
    kind: "implementation",
    name: row.impl.customer_name,
    initials: initials(row.impl.customer_name),
    sub: `Implementation · ${row.impl.owner_name ?? "Unassigned"}`,
    meta: meta || null,
    chip: chipFor(row, level),
    reason: head,
    detail,
    nextStep: next && !/hasn't been recorded/i.test(next) ? next : null,
    due: dueIso ? dueLabel(dueIso, today) : null,
    link: { customerId: row.impl.customer_id },
    rank: row.rank,
  };
}

function rowFromDeal(d: DealInboxRow, today: string): NeedsMeRow {
  const days = Math.max(0, businessDaysBetween(d.stage_entered_at.slice(0, 10), today));
  const unclaimed = d.unclaimed;
  return {
    id: d.id,
    kind: "deal",
    name: d.name,
    initials: initials(d.name),
    sub: `${d.stage_label} · ${unclaimed ? "Unassigned" : (d.owner_name ?? "Unassigned")}`,
    meta: d.path ? (PATH_LABEL[d.path] ?? null) : null,
    chip: unclaimed
      ? { label: "Unclaimed", tone: "warning" }
      : d.next_step?.startsWith("What type of deal")
        ? { label: "Needs info", tone: "critical" }
        : { label: "Before kickoff", tone: "info" },
    reason: unclaimed ? "No implementation owner assigned" : (d.next_step ?? "Before kickoff"),
    detail: `${d.stage_label} for ${days} business day${days === 1 ? "" : "s"}.`,
    nextStep: unclaimed ? "Assign an owner" : d.next_step,
    due: unclaimed && days >= 1 ? { label: "Today", tone: "critical" } : null,
    link: { dealId: d.id },
    rank: unclaimed ? 0.5 : 2.2,
  };
}

const PATH_LABEL: Record<string, string> = {
  new_logo: "New logo",
  existing: "Existing account",
  dm_conversion: "DM → GC",
  field_fusion: "Field Fusion",
};

export function todayFor(input: TodayInput): Today {
  const { queue, health, dealInbox, commitments, today } = input;
  const all = [...queue.act_now, ...queue.needs_attention, ...queue.moving];
  const byImpl = new Map(all.map((r) => [r.impl.id, r]));

  // WHAT NEEDS ME: act-now accounts and the deals nobody owns — exactly what
  // the "Need attention" tile counts. The watch list is its own, so the
  // number on the tile and the rows under the heading never disagree.
  const bySeverity = (a: NeedsMeRow, b: NeedsMeRow) =>
    a.rank - b.rank || a.name.localeCompare(b.name);
  const needsMe: NeedsMeRow[] = [
    ...queue.act_now.map((r) => rowFromQueue(r, health.get(r.impl.id)?.level, today)),
    ...dealInbox.filter((d) => d.unclaimed).map((d) => rowFromDeal(d, today)),
  ].sort(bySeverity);
  const watch: NeedsMeRow[] = [
    ...queue.needs_attention.map((r) => rowFromQueue(r, health.get(r.impl.id)?.level, today)),
    ...dealInbox.filter((d) => !d.unclaimed && d.mine).map((d) => rowFromDeal(d, today)),
  ].sort(bySeverity);

  // COMING UP: this week by day and next week folded — booked calls, planned
  // calls, commitments due, and target launches. The tile counts seven days.
  const horizon = endOfNextWeek(today);
  const sevenDays = addDays(today, 7);
  const events = collectEvents(all, commitments, today, horizon);
  const comingUp = groupByDay(events, today);

  // WAITING ON: somebody else's move, on any account.
  const waiting = all.filter((r) => r.dependency.party !== "none");
  const launching = all.filter((r) => {
    const live = dealFactsOf(r)?.live_date ?? r.impl.target_launch_date;
    return (
      isOnboardingStage(r.impl.deal_stage) &&
      live !== null &&
      live >= today &&
      live <= addBusinessDays(today, 10)
    );
  });
  const needAttention = queue.act_now.length + dealInbox.filter((d) => d.unclaimed).length;
  const waitingOn = waiting.filter((r) => r.bucket !== "act_now").length;
  const launchingIds = new Set(launching.map((r) => r.impl.id));
  const moving = all.filter(
    (r) => r.bucket !== "act_now" && r.dependency.party === "none" && !launchingIds.has(r.impl.id),
  ).length;

  // WHERE THEY SIT: by the deal's stage, in rail order.
  const counts = new Map<string, number>();
  for (const r of all) counts.set(r.impl.deal_stage, (counts.get(r.impl.deal_stage) ?? 0) + 1);
  const total = all.length;
  const stages = FLOW_STAGES.filter((s) => s.key !== "prospect" && s.key !== "negotiate")
    .map((s) => ({
      key: s.stage,
      label: s.label,
      count: counts.get(s.stage) ?? 0,
      pct: total ? Math.round(((counts.get(s.stage) ?? 0) / total) * 100) : 0,
    }))
    .filter((s) => s.count > 0 || s.key !== "field_fusion_setup");

  return {
    tiles: {
      needAttention,
      waitingOn,
      upcoming: events.filter((e) => e.date <= sevenDays).length,
      onTrack: queue.moving.length,
    },
    needsMe,
    watch,
    comingUp,
    book: {
      total,
      needAttention: queue.act_now.length,
      waitingOn,
      moving,
      launching: launching.filter((r) => r.bucket !== "act_now").length,
    },
    stages,
  };
}

/** The deal facts carried on a queue row, when the row has a deal. */
function dealFactsOf(r: QueueRow): QueueRow["facts"] {
  return r.facts;
}

/**
 * Every dated thing on these accounts between today and the horizon: the
 * plan's calls (booked or planned), commitments due, target launches.
 * Sorted by day, then time. The Home strip and the Calendar both read it.
 */
export function collectEvents(
  rows: QueueRow[],
  commitments: CommitmentRow[],
  today: string,
  horizon: string,
): UpcomingEvent[] {
  const byImpl = new Set(rows.map((r) => r.impl.id));
  const events: UpcomingEvent[] = [];
  for (const r of rows) {
    const facts = dealFactsOf(r);
    for (const c of facts?.upcoming_calls ?? []) {
      if (c.date > horizon || c.date < today) continue;
      events.push({
        key: `${r.impl.id}:${c.key}`,
        date: c.date,
        time: c.time,
        label: c.label,
        account: r.impl.customer_name,
        kind: "meeting",
        link: { customerId: r.impl.customer_id },
      });
    }
    const live = facts?.live_date ?? r.impl.target_launch_date;
    if (live && live >= today && live <= horizon) {
      events.push({
        key: `${r.impl.id}:live`,
        date: live,
        time: null,
        label: "Target launch",
        account: r.impl.customer_name,
        kind: "launch",
        link: { customerId: r.impl.customer_id },
      });
    }
  }
  for (const c of commitments) {
    if (!c.due_date || c.due_date < today || c.due_date > horizon) continue;
    if (!byImpl.has(c.implementation_id)) continue;
    events.push({
      key: `commitment:${c.id}`,
      date: c.due_date,
      time: null,
      label: c.description,
      account: c.customer_name,
      kind: "commitment",
      link: { customerId: c.customer_id },
    });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
  return events;
}

/** "Mon 5 Oct", in the reader's words, from an ISO day. */
export function dayTitle(iso: string): string {
  return dayLabel(iso);
}

export function addDaysIso(iso: string, n: number): string {
  return addDays(iso, n);
}

/** The Friday of this week (today, on a Friday; yesterday's week on a weekend). */
function endOfWeek(today: string): string {
  let d = today;
  while (weekday(d) !== 5 && weekday(d) !== 6 && weekday(d) !== 0) d = addDays(d, 1);
  return weekday(d) === 5 ? d : addDays(today, -1);
}

/** The Friday of next week. */
function endOfNextWeek(today: string): string {
  return addDays(endOfWeek(today), 7);
}

function groupByDay(events: UpcomingEvent[], today: string): DayGroup[] {
  const tomorrow = addDays(today, 1);
  // This week's remaining weekdays, one group each; then next week, folded.
  const groups: DayGroup[] = [];
  const eow = endOfWeek(today);
  const dayKeys: string[] = [];
  for (let d = today; d <= eow; d = addDays(d, 1)) {
    if (weekday(d) === 0 || weekday(d) === 6) continue;
    dayKeys.push(d);
  }
  for (const d of dayKeys) {
    groups.push({
      key: d,
      title: d === today ? "Today" : d === tomorrow ? "Tomorrow" : dayLabel(d),
      sub: d === today || d === tomorrow ? dayLabel(d) : "",
      events: events.filter((e) => e.date === d),
    });
  }
  const later = events.filter((e) => e.date > eow);
  const start = addDays(eow, 3);
  const end = addDays(start, 4);
  groups.push({
    key: "next-week",
    title: "Next week",
    sub: `${dayLabel(start).replace(/^\w+,?\s*/, "")} – ${dayLabel(end).replace(/^\w+,?\s*/, "")}`,
    events: later,
  });
  return groups;
}
