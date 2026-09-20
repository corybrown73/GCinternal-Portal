import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { appUrl } from "@/lib/app-url";
import { canManage, type PortalRole } from "@/lib/auth";

import {
  daysBetween,
  digestIsEmpty,
  digestSubject,
  renderDigestHtml,
  weekOf,
  type Digest,
  type DigestDeal,
  type DigestImpl,
  type DigestMilestone,
  type TeamRollupRow,
} from "./digest";
import { sendEmail } from "./server/email";
import { audit } from "./server/audit";

// Same shape as presale.server: the typed client does not know portal_* tables.
const db = () => supabaseAdmin as any;

export type DigestRecipient = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
};

/** ISO date, UTC. The digest reasons in dates, not instants. */
function isoToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Everything one person owes this week, from the same loaders Home uses.
 *
 * The plan-step section walks every non-finished deal the person owns
 * (claim ledger) and asks the plan what is late. That is the 7-day promise
 * the customer can see, so a slipped step here is a slipped promise.
 */
export async function composeDigestFor(
  recipient: DigestRecipient,
  now: Date = new Date(),
): Promise<Digest> {
  const { resolveScope } = await import("./ownership.server");
  const { loadHome } = await import("./hub.server");
  const { buildQueue } = await import("./home-triage");
  const { loadDealInbox, loadPipeline, dealOwners } = await import("./presale.server");
  const { readIntake } = await import("./intake-answers");
  const { closeDateFor, timelineFor } = await import("./onboarding-plan");
  const { terminalStage, wonStage } = await import("./pipeline-stages");

  const today = isoToday(now);
  const mine = await resolveScope(recipient.id, null);
  const me = mine.viewer.teamMemberId;

  const [home, inbox, pipeline] = await Promise.all([
    loadHome(mine),
    loadDealInbox(mine),
    loadPipeline(null),
  ]);
  const queue = buildQueue(home.implementations, home.triage);
  const toImpl = (r: (typeof queue.act_now)[number]): DigestImpl => ({
    id: r.impl.id,
    customer_id: r.impl.customer_id,
    customer_name: r.impl.customer_name,
    reason: r.reason,
    next_action: r.next_action,
    owner_name: r.impl.owner_name,
  });
  const toDeal = (d: (typeof inbox)[number]): DigestDeal => ({
    id: d.id,
    name: d.name,
    stage_label: d.stage_label,
    days_in_stage: Math.max(0, daysBetween(d.stage_entered_at.slice(0, 10), today)),
    next_step: d.next_step,
    unclaimed: d.unclaimed,
    owner_name: d.owner_name,
  });

  // Plan steps on the deals this person owns.
  const done = terminalStage(pipeline.stages).key;
  const won = wonStage(pipeline.stages).key;
  const open = pipeline.deals.filter((d) => d.stage !== done);
  const owners = await dealOwners(open.map((d) => d.id));
  const ownedIds = new Set(open.filter((d) => me && owners.get(d.id)?.id === me).map((d) => d.id));
  const overdue: DigestMilestone[] = [];
  const thisWeek: DigestMilestone[] = [];
  if (ownedIds.size) {
    const { data: transitions } = await db()
      .from("portal_stage_transitions")
      .select("account_id, to_stage, occurred_at")
      .in("account_id", [...ownedIds]);
    const history = new Map<string, Array<{ to_stage: string; occurred_at: string }>>();
    for (const t of (transitions ?? []) as Array<{
      account_id: string;
      to_stage: string;
      occurred_at: string;
    }>) {
      const list = history.get(t.account_id) ?? [];
      list.push({ to_stage: t.to_stage, occurred_at: t.occurred_at });
      history.set(t.account_id, list);
    }
    for (const d of open) {
      if (!ownedIds.has(d.id)) continue;
      const intake = readIntake(d.intake);
      const close = closeDateFor({
        intake,
        stageHistory: history.get(d.id) ?? [],
        wonStageKey: won,
        today,
      }).date;
      const t = timelineFor(intake, close);
      if (t.allDone) continue;
      const steps = [...t.milestones, ...t.alongside.flatMap((s) => s.milestones)];
      for (const m of steps) {
        if (m.doneOn || m.key === "close") continue;
        const late = daysBetween(m.date, today);
        const row: DigestMilestone = {
          deal_id: d.id,
          deal_name: d.name,
          label: m.label,
          date: m.date,
          days_late: late,
          owner: m.owner,
        };
        if (late > 0) overdue.push(row);
        else if (late >= -7) thisWeek.push(row);
      }
    }
    overdue.sort((a, b) => b.days_late - a.days_late);
    thisWeek.sort((a, b) => a.date.localeCompare(b.date));
  }

  // Managers see the whole team, one row per owner.
  let team: TeamRollupRow[] | null = null;
  if (canManage(recipient.role as PortalRole)) {
    const all = await resolveScope(recipient.id, "all");
    const [allHome, allInbox] = await Promise.all([loadHome(all), loadDealInbox(all)]);
    const q = buildQueue(allHome.implementations, allHome.triage);
    const rows = new Map<string, TeamRollupRow>();
    const row = (name: string | null) => {
      const key = name ?? "Unassigned";
      const r = rows.get(key) ?? {
        owner_name: key,
        needs_action: 0,
        keep_an_eye: 0,
        deals: 0,
        overdue_milestones: 0,
      };
      rows.set(key, r);
      return r;
    };
    for (const r of q.act_now) row(r.impl.owner_name).needs_action += 1;
    for (const r of q.needs_attention) row(r.impl.owner_name).keep_an_eye += 1;
    for (const d of allInbox) row(d.owner_name).deals += 1;
    // Overdue plan steps across every owned deal, not only the manager's.
    const { data: transitions } = await db()
      .from("portal_stage_transitions")
      .select("account_id, to_stage, occurred_at")
      .in(
        "account_id",
        open.map((d) => d.id),
      );
    const history = new Map<string, Array<{ to_stage: string; occurred_at: string }>>();
    for (const t of (transitions ?? []) as Array<{
      account_id: string;
      to_stage: string;
      occurred_at: string;
    }>) {
      const list = history.get(t.account_id) ?? [];
      list.push({ to_stage: t.to_stage, occurred_at: t.occurred_at });
      history.set(t.account_id, list);
    }
    for (const d of open) {
      const owner = owners.get(d.id);
      if (!owner?.id) continue;
      const intake = readIntake(d.intake);
      const close = closeDateFor({
        intake,
        stageHistory: history.get(d.id) ?? [],
        wonStageKey: won,
        today,
      }).date;
      const t = timelineFor(intake, close);
      if (t.allDone) continue;
      const late = [...t.milestones, ...t.alongside.flatMap((s) => s.milestones)].filter(
        (m) => !m.doneOn && m.key !== "close" && daysBetween(m.date, today) > 0,
      ).length;
      if (late) row(owner.name).overdue_milestones += late;
    }
    team = [...rows.values()].sort(
      (a, b) =>
        b.overdue_milestones + b.needs_action - (a.overdue_milestones + a.needs_action) ||
        a.owner_name.localeCompare(b.owner_name),
    );
  }

  return {
    recipient_name: recipient.full_name?.trim() || recipient.email,
    week_of: weekOf(now),
    unclaimed_deals: inbox.filter((d) => d.unclaimed).map(toDeal),
    my_deals: inbox.filter((d) => !d.unclaimed && d.mine).map(toDeal),
    needs_action: queue.act_now.map(toImpl),
    keep_an_eye: queue.needs_attention.map(toImpl),
    overdue_milestones: overdue,
    this_week_milestones: thisWeek,
    team,
  };
}

async function alreadySentToday(profileId: string, now: Date): Promise<boolean> {
  const start = `${isoToday(now)}T00:00:00Z`;
  const { data } = await db()
    .from("portal_audit_log")
    .select("id")
    .eq("action", "digest.weekly_sent")
    .eq("entity_id", profileId)
    .gte("created_at", start)
    .limit(1);
  return (data ?? []).length > 0;
}

export type DigestSendResult = {
  emailed: boolean;
  /** True when there was nothing to say and no email went out. */
  empty: boolean;
  reason: string | null;
  subject: string;
  counts: {
    overdue: number;
    needs_action: number;
    this_week: number;
    unclaimed: number;
    my_deals: number;
  };
};

/**
 * Compose and send one person's digest. `force` sends even when it was
 * already sent today or has nothing in it — that is the "email me now"
 * button, where the person wants to see the email whatever it says.
 */
export async function sendDigestTo(
  recipient: DigestRecipient,
  opts: { force?: boolean; now?: Date } = {},
): Promise<DigestSendResult> {
  const now = opts.now ?? new Date();
  const digest = await composeDigestFor(recipient, now);
  const subject = digestSubject(digest);
  const counts = {
    overdue: digest.overdue_milestones.length,
    needs_action: digest.needs_action.length,
    this_week: digest.this_week_milestones.length,
    unclaimed: digest.unclaimed_deals.length,
    my_deals: digest.my_deals.length,
  };
  const empty = digestIsEmpty(digest);
  if (!opts.force && (empty || (await alreadySentToday(recipient.id, now)))) {
    return {
      emailed: false,
      empty,
      reason: empty ? "nothing to send" : "already sent today",
      subject,
      counts,
    };
  }

  let emailed = false;
  let reason: string | null = null;
  try {
    const r = await sendEmail({
      to: recipient.email,
      subject,
      html: renderDigestHtml(digest, appUrl()),
    });
    emailed = r.delivered;
    reason = r.reason;
  } catch (e) {
    reason = e instanceof Error ? e.message : "the email did not send";
  }
  await audit({
    actor_type: "system",
    action: "digest.weekly_sent",
    entity_type: "profile",
    entity_id: recipient.id,
    payload: { emailed, forced: Boolean(opts.force), ...counts, ...(reason && { reason }) },
  });
  return { emailed, empty, reason, subject, counts };
}

/** Every internal person with an email. Customer logins never get this. */
export async function digestRecipients(): Promise<DigestRecipient[]> {
  const { data } = await db().from("portal_profiles").select("id, email, full_name, role");
  return ((data ?? []) as DigestRecipient[]).filter((p) => p.role !== "customer" && p.email);
}

/** The Monday run. One pass, one line per person in the summary. */
export async function runWeeklyDigest(now: Date = new Date()): Promise<{
  sent: number;
  skipped: number;
  failed: number;
  people: Array<{ email: string; emailed: boolean; reason: string | null }>;
}> {
  const people: Array<{ email: string; emailed: boolean; reason: string | null }> = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const r of await digestRecipients()) {
    try {
      const res = await sendDigestTo(r, { now });
      people.push({ email: r.email, emailed: res.emailed, reason: res.reason });
      if (res.emailed) sent += 1;
      else if (res.reason === "nothing to send" || res.reason === "already sent today")
        skipped += 1;
      else failed += 1;
    } catch (e) {
      failed += 1;
      people.push({
        email: r.email,
        emailed: false,
        reason: e instanceof Error ? e.message : "failed",
      });
      console.error("[digest] failed for", r.email, e);
    }
  }
  await audit({
    actor_type: "system",
    action: "cron.weekly_digest",
    payload: { sent, skipped, failed },
  });
  return { sent, skipped, failed, people };
}
