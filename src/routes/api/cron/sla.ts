import { createFileRoute } from "@tanstack/react-router";

/**
 * GET/POST /api/cron/sla — hourly sweep (see vercel.json):
 *   1. Warn:   open/in_progress tickets past 50% of the first-response window,
 *              not yet warned → email the assignee (or role pool), stamp sla_warned_at.
 *   2. Breach: tickets past sla_due_at with no first response → set sla_breached,
 *              insert a critical sla_breach alert, email managers + super admins.
 *   3. Stall:  implementations sitting in a non-terminal stage for >14 days with no
 *              open stalled_implementation alert → warning alert + manager email.
 *   4. Slip:   milestones past target_date and not complete, deduped per milestone →
 *              overdue_milestone alert.
 * Every pass is guarded (sla_warned_at / sla_breached / existing unacknowledged
 * alert) so re-runs never double-email.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 */

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
  const { normalizeStage } = await import("@/lib/hub-format");
  const db = supabaseAdmin as any;

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const appUrl = process.env["APP_URL"] ?? "http://localhost:3000";
  const summary = { warned: 0, breached: 0, stalled: 0, overdue_milestones: 0 };

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
          <p style="font-size:14px"><a href="${appUrl}/tickets/${t.id}">Open the ticket</a></p>
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

    await createAlert({
      kind: "sla_breach",
      severity: "critical",
      title: `SLA breach: ${t.subject}`,
      detail: `Ticket from ${t.submitter_email ?? "unknown"} got no first response within 24 hours. ${appUrl}/tickets/${t.id}`,
      customerId: t.customer_id,
      implementationId: t.implementation_id,
      payload: { ticket_id: t.id },
      notify: true, // emails every manager + super admin, stamps notified_at
      actor: { type: "system" },
    });
    summary.breached += 1;
  }

  /* ---- Dedupe data for passes 3 + 4: open system alerts of these kinds ---- */
  const { data: openAlerts } = await db
    .from("alerts")
    .select("kind, implementation_id, payload")
    .in("kind", ["stalled_implementation", "overdue_milestone"])
    .is("acknowledged_at", null);
  const stalledFlagged = new Set(
    (openAlerts ?? [])
      .filter((a: any) => a.kind === "stalled_implementation")
      .map((a: any) => a.implementation_id as string),
  );
  const milestoneFlagged = new Set(
    (openAlerts ?? [])
      .filter((a: any) => a.kind === "overdue_milestone")
      .map((a: any) => a.payload?.milestone_id as string | undefined)
      .filter(Boolean),
  );

  /* ---- 3. Stalled implementations: >14 days in a non-terminal stage ---- */
  const cutoff = new Date(now - 14 * 86_400_000).toISOString();
  const { data: impls } = await db
    .from("implementations")
    .select("id, name, customer_id, current_stage, stage_entered_at, status")
    .lt("stage_entered_at", cutoff);
  const stalled = (impls ?? []).filter(
    (i: any) => normalizeStage(i.current_stage) !== "graduate-to-cs" && !stalledFlagged.has(i.id),
  );
  const customerIds = [...new Set(stalled.map((i: any) => i.customer_id).filter(Boolean))];
  const { data: customers } = customerIds.length
    ? await db.from("customers").select("id, name").in("id", customerIds)
    : { data: [] };
  const customerName = new Map<string, string>((customers ?? []).map((c: any) => [c.id, c.name]));
  for (const impl of stalled) {
    const days = Math.floor((now - new Date(impl.stage_entered_at).getTime()) / 86_400_000);
    await createAlert({
      kind: "stalled_implementation",
      severity: "warning",
      title: `Stalled: ${customerName.get(impl.customer_id) ?? impl.name} — ${days}d in ${impl.current_stage}`,
      detail: `Implementation "${impl.name}" has been in stage "${impl.current_stage}" for ${days} days with no advance.`,
      customerId: impl.customer_id,
      implementationId: impl.id,
      notify: true, // emails managers
      actor: { type: "system" },
    });
    summary.stalled += 1;
  }

  /* ---- 4. Overdue milestones: target_date past, not complete ---- */
  const today = new Date(now).toISOString().slice(0, 10);
  const { data: milestones } = await db
    .from("milestones")
    .select("id, name, implementation_id, target_date, completed_date, status")
    .lt("target_date", today)
    .is("completed_date", null);
  const overdue = (milestones ?? []).filter(
    (m: any) =>
      !["completed", "complete", "done"].includes((m.status ?? "").toLowerCase()) &&
      !milestoneFlagged.has(m.id),
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
    await createAlert({
      kind: "overdue_milestone",
      severity: "warning",
      title: `Overdue milestone: ${m.name}`,
      detail: `Milestone "${m.name}"${impl ? ` on "${impl.name}"` : ""} was due ${m.target_date} and is not complete.`,
      customerId: impl?.customer_id ?? null,
      implementationId: m.implementation_id,
      payload: { milestone_id: m.id },
      notify: false, // alert row only; managers see it on /alerts
      actor: { type: "system" },
    });
    summary.overdue_milestones += 1;
  }

  await audit({
    actor_type: "system",
    action: "cron.sla_sweep",
    payload: summary,
  });

  return Response.json({ ok: true, ...summary });
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
