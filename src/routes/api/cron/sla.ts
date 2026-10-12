import { createFileRoute } from "@tanstack/react-router";
import { appUrl } from "@/lib/app-url";

/**
 * GET/POST /api/cron/sla — hourly sweep (see vercel-crons.json):
 *   1. Warn:   open/in_progress tickets past 50% of the first-response window,
 *              not yet warned → email the assignee (or role pool), stamp sla_warned_at.
 *   2. Breach: tickets past sla_due_at with no first response → set sla_breached,
 *              insert a critical sla_breach alert, email managers + super admins
 *              (not for a breach already a week old when first seen).
 *   3. Stall:  deals past their stage's escalate limit (STAGE_LIMITS, business
 *              days, the clock Home uses) → stalled_implementation alert, once per
 *              stage visit, no email (the escalate nudge emails).
 *   4. Slip:   legacy milestones past target_date and not complete, once per
 *              milestone and date → overdue_milestone alert, no email.
 *   6. Signals: champion_gone_quiet + launch_date_at_risk (Phase 6), behind the
 *              `signals_alerts` flag; deduped per implementation, no email.
 *   7. Nudges: the checklist's own limits; the first sweep ever records the
 *              current state without emailing (nudges.server.ts).
 * Every pass is guarded (sla_warned_at / sla_breached / an alert already raised
 * for the visit, 0080 / a nudge claimed for the hour, 0081) so re-runs, even
 * overlapping ones, never double-email.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 */

/** A breach older than this when first seen is recorded without an email. */
const STALE_BREACH_MS = 7 * 86_400_000;

async function authorizeCron(request: Request): Promise<Response | null> {
  const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
  return authenticateCronRequest(request);
}

async function runSlaSweep(): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendEmail } = await import("@/lib/server/email");
  const { audit } = await import("@/lib/server/audit");
  const ticketsServer = await import("@/lib/tickets.server");
  const { createAlert, managerProfiles, rolePool, escapeHtml } = ticketsServer;
  const db = supabaseAdmin as any;

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const base = appUrl();
  const summary = {
    warned: 0,
    breached: 0,
    stalled: 0,
    overdue_milestones: 0,
    health_recomputed: 0,
    health_failed: 0,
    // Phase 6 (flag `signals_alerts`; zeros while it is off).
    signal_alerts_created: 0,
    signal_alerts_deduped: 0,
  };

  const safeSend = async (to: string, subject: string, html: string) => {
    try {
      await sendEmail({ to, subject, html });
    } catch (e) {
      console.error(`cron email to ${to} failed`, e);
    }
  };

  /* ---- 1. Warning pass: past 50% of the SLA window, not yet warned ---- */
  const { data: warnCandidates } = await db
    .from("tickets")
    .select("*")
    .in("status", ["open", "in_progress"])
    .is("sla_warned_at", null)
    .is("first_response_at", null)
    .eq("sla_breached", false);
  for (const t of warnCandidates ?? []) {
    const start = new Date(t.created_at).getTime();
    const due = new Date(t.sla_due_at).getTime();
    const midpoint = start + (due - start) / 2;
    if (now < midpoint || now >= due) continue; // past-due tickets go to the breach pass

    // Stamp first, guarded, so a concurrent run cannot double-email.
    const { data: stamped } = await db
      .from("tickets")
      .update({ sla_warned_at: nowIso })
      .eq("id", t.id)
      .is("sla_warned_at", null)
      .select("id");
    if (!stamped || stamped.length === 0) continue;

    let recipients: Array<{ email: string }> = [];
    if (t.assigned_to) {
      const { data: p } = await db
        .from("portal_profiles")
        .select("email")
        .eq("id", t.assigned_to)
        .maybeSingle();
      if (p) recipients = [p];
    }
    if (recipients.length === 0 && t.assigned_role) {
      const { data: pool } = await db
        .from("portal_profiles")
        .select("email")
        .in("role", rolePool(t.assigned_role));
      recipients = pool ?? [];
    }
    if (recipients.length === 0) recipients = await managerProfiles();

    const hoursLeft = Math.max(0, Math.round((due - now) / 3600_000));
    for (const r of recipients) {
      await safeSend(
        r.email,
        `SLA warning: ${t.subject}`,
        `<div style="font-family:sans-serif;max-width:540px">
          <h2 style="color:#B45309;font-size:17px">First response due in ~${hoursLeft}h</h2>
          <p style="font-size:14px"><b>${escapeHtml(t.subject)}</b> has had no first response and is past half its SLA window.</p>
          <p style="font-size:14px"><a href="${base}/tickets/${t.id}">Open the ticket</a></p>
        </div>`,
      );
    }
    summary.warned += 1;
  }

  /* ---- 2. Breach pass: past due, no first response, not yet flagged ---- */
  const { data: breachCandidates } = await db
    .from("tickets")
    .select("*")
    .lt("sla_due_at", nowIso)
    .is("first_response_at", null)
    .eq("sla_breached", false)
    .in("status", ["open", "in_progress", "waiting_customer"]);
  for (const t of breachCandidates ?? []) {
    const { data: flagged } = await db
      .from("tickets")
      .update({ sla_breached: true })
      .eq("id", t.id)
      .eq("sla_breached", false)
      .select("id");
    if (!flagged || flagged.length === 0) continue;

    // A breach found a week late (the first sweep, or one after an outage)
    // is history, not news: flagged and on /alerts, but not emailed.
    const stale = Date.parse(t.sla_due_at) < now - STALE_BREACH_MS;
    await createAlert({
      kind: "sla_breach",
      severity: "critical",
      title: `SLA breach: ${t.subject}`,
      detail: `Ticket from ${t.submitter_email ?? "unknown"} got no first response within 24 hours. ${base}/tickets/${t.id}`,
      customerId: t.customer_id,
      implementationId: t.implementation_id,
      payload: { ticket_id: t.id, ...(stale ? { stale: true } : {}) },
      notify: !stale, // emails every manager + super admin, stamps notified_at
      actor: { type: "system" },
    });
    summary.breached += 1;
  }

  /* ---- 3. Stuck deals: past their stage's escalate limit ----
   * The same clock and limits as Home (business days in the deal's stage,
   * STAGE_LIMITS), raised once per stage visit and never emailed: the
   * escalate nudge below already told the owner and the managers.
   */
  try {
    const { runStallAlerts } = await import("@/lib/stall-alerts.server");
    summary.stalled = (await runStallAlerts()).raised;
  } catch (e) {
    console.error("[cron] stall pass failed", e);
  }

  /* ---- 4. Overdue milestones (legacy milestones table): alert row only ----
   * Keyed by the milestone and its date, so an acknowledged one is not
   * raised again every hour. notify:false — this pass never emails.
   */
  try {
    summary.overdue_milestones = await overdueMilestonePass(db, now, ticketsServer);
  } catch (e) {
    console.error("[cron] overdue-milestone pass failed", e);
  }

  /* ---- 5. Computed-health backstop ----
   * Write paths recompute on mutation; this sweep repairs anything they
   * missed (a failed background recompute, a direct SQL edit, or time simply
   * passing — dwell and launch dates go stale on their own).
   */
  const { recomputeAllHealth } = await import("@/lib/health.server");
  const health = await recomputeAllHealth();
  summary.health_recomputed = health.updated;
  summary.health_failed = health.failed;

  /* ---- 7. Deal nudges: the checklist's own limits (stage-flow.ts) ----
     The owner hears when a deal sits past its stage's limit or a training
     call is two business days overdue; managers too once it is stuck, or
     when nobody has claimed a closed deal. One email per step, ever. */
  try {
    const { runDealNudges } = await import("@/lib/nudges.server");
    const n = await runDealNudges();
    (summary as Record<string, number>)["deal_nudges_sent"] = n.sent;
    (summary as Record<string, number>)["deal_nudges_baselined"] = n.baselined;
    (summary as Record<string, number>)["deal_nudges_failed"] = n.failed;
    // A read failed: nothing was sent or baselined this hour (the log says why).
    (summary as Record<string, number>)["deal_nudges_halted"] = n.halted ? 1 : 0;
  } catch (e) {
    console.error("[cron] deal nudges failed", e);
  }

  /* ---- 6. Phase 6 signal alerts: champion gone quiet, launch date at risk ----
   * Off unless the `signals_alerts` flag is on. Both kinds require a named,
   * dated blocker rather than an absence, and neither emails — they land on
   * /alerts. A failure here must not fail the sweep that ran before it.
   */
  try {
    const { runSignalAlerts } = await import("@/lib/signals.server");
    const signals = await runSignalAlerts();
    summary.signal_alerts_created = signals.created;
    summary.signal_alerts_deduped = signals.deduped;
  } catch (e) {
    console.error("cron signal-alert pass failed", e);
  }

  await audit({
    actor_type: "system",
    action: "cron.sla_sweep",
    payload: summary,
  });

  return Response.json({ ok: true, ...summary });
}

/** Pass 4: legacy milestones past their date, one alert per milestone and date. */
async function overdueMilestonePass(
  db: any,
  now: number,
  ticketsServer: typeof import("@/lib/tickets.server"),
): Promise<number> {
  const { createAlert, raisedVisits, visitKey } = ticketsServer;
  const raised = await raisedVisits(["overdue_milestone"]);
  let raisedCount = 0;
  const today = new Date(now).toISOString().slice(0, 10);
  const { data: milestones } = await db
    .from("milestones")
    .select("id, name, implementation_id, target_date, completed_date, status")
    .lt("target_date", today)
    .is("completed_date", null);
  const overdue = (milestones ?? []).filter(
    (m: any) =>
      !["completed", "complete", "done"].includes((m.status ?? "").toLowerCase()) &&
      !raised.has(
        visitKey("overdue_milestone", m.implementation_id ?? "", `${m.id}@${m.target_date}`),
      ),
  );
  const implIds = [...new Set(overdue.map((m: any) => m.implementation_id).filter(Boolean))];
  const { data: milestoneImpls } = implIds.length
    ? await db.from("implementations").select("id, customer_id, name").in("id", implIds)
    : { data: [] };
  const implById = new Map<string, { id: string; customer_id: string | null; name: string }>(
    (milestoneImpls ?? []).map((i: any) => [i.id, i]),
  );
  for (const m of overdue) {
    const impl = implById.get(m.implementation_id);
    const row = await createAlert({
      kind: "overdue_milestone",
      severity: "warning",
      title: `Overdue milestone: ${m.name}`,
      detail: `Milestone "${m.name}"${impl ? ` on "${impl.name}"` : ""} was due ${m.target_date} and is not complete.`,
      customerId: impl?.customer_id ?? null,
      implementationId: m.implementation_id,
      payload: { milestone_id: m.id, visit: `${m.id}@${m.target_date}` },
      notify: false, // never emails; managers see it on /alerts
      actor: { type: "system" },
    });
    if (!row.already_raised) raisedCount += 1;
  }
  return raisedCount;
}

async function handle(request: Request): Promise<Response> {
  const denied = await authorizeCron(request);
  if (denied) return denied;
  try {
    return await runSlaSweep();
  } catch (e) {
    console.error("cron /api/cron/sla failed", e);
    return Response.json({ ok: false, error: "sweep_failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/cron/sla")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
