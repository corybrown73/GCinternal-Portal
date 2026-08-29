import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail } from "./server/email";
import { audit } from "./server/audit";

const db = () => supabaseAdmin as any;

/* ------------------------------------------------------------------------- */
/* Types                                                                     */
/* ------------------------------------------------------------------------- */

export const TICKET_CATEGORIES = [
  "technical",
  "training",
  "billing",
  "data",
  "integration",
  "other",
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUSES = [
  "open",
  "in_progress",
  "waiting_customer",
  "resolved",
  "closed",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface TicketRow {
  id: string;
  org_id: string;
  customer_id: string | null;
  implementation_id: string | null;
  submitted_by: string | null;
  submitter_email: string | null;
  category: TicketCategory;
  subject: string;
  body: string;
  priority: TicketPriority;
  status: TicketStatus;
  assigned_role: string | null;
  assigned_to: string | null;
  sla_due_at: string;
  sla_warned_at: string | null;
  first_response_at: string | null;
  sla_breached: boolean;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketCommentRow {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_email: string | null;
  body: string;
  internal: boolean;
  created_at: string;
}

export interface ProfileLite {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
}

/** First-response SLA window for every new ticket. */
export const SLA_HOURS = 24;

/* ------------------------------------------------------------------------- */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------- */

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Profile roles carry legacy aliases (se ≈ tam_se, onboarding ≈ implementation).
 * A routing role must reach the whole pool, not just the canonical spelling.
 */
export function rolePool(role: string): string[] {
  switch (role) {
    case "tam_se":
    case "se":
      return ["tam_se", "se"];
    case "implementation":
    case "onboarding":
      return ["implementation", "onboarding"];
    default:
      return [role];
  }
}

/** Roles that receive escalation email (managers and super admins). */
export const MANAGER_ROLES = ["manager", "admin", "super_admin"];

async function profilesByRoles(roles: string[]): Promise<ProfileLite[]> {
  const { data } = await db()
    .from("portal_profiles")
    .select("id, email, full_name, role")
    .in("role", roles);
  return (data ?? []) as ProfileLite[];
}

export async function managerProfiles(): Promise<ProfileLite[]> {
  return profilesByRoles(MANAGER_ROLES);
}

async function profileById(id: string | null | undefined): Promise<ProfileLite | null> {
  if (!id) return null;
  const { data } = await db()
    .from("portal_profiles")
    .select("id, email, full_name, role")
    .eq("id", id)
    .maybeSingle();
  return (data ?? null) as ProfileLite | null;
}

async function sendEmailSafe(opts: { to: string; subject: string; html: string }) {
  try {
    await sendEmail(opts);
  } catch (e) {
    // Notification failure must never fail the write it decorates.
    console.error(`ticket email to ${opts.to} failed`, e);
  }
}

function ticketLink(ticketId: string): string {
  return `${appUrl()}/tickets/${ticketId}`;
}

function emailShell(title: string, lines: string[]): string {
  return `
    <div style="font-family:sans-serif;max-width:540px">
      <h2 style="color:#237A4B;font-size:17px">${escapeHtml(title)}</h2>
      ${lines.join("\n")}
    </div>`;
}

/** Recipients for "the people responsible for this ticket": assignee, else the routed role pool. */
async function responsibleRecipients(ticket: TicketRow): Promise<ProfileLite[]> {
  if (ticket.assigned_to) {
    const p = await profileById(ticket.assigned_to);
    if (p) return [p];
  }
  if (ticket.assigned_role) {
    const pool = await profilesByRoles(rolePool(ticket.assigned_role));
    if (pool.length > 0) return pool;
  }
  return managerProfiles();
}

/* ------------------------------------------------------------------------- */
/* createTicket — the canonical entry point (UI, customer portal, API)       */
/* ------------------------------------------------------------------------- */

export interface CreateTicketInput {
  customerId?: string | null;
  implementationId?: string | null;
  category: TicketCategory;
  subject: string;
  body: string;
  priority?: TicketPriority;
  /** portal_profiles.id of the submitter, when the caller is a signed-in user. */
  submittedBy?: string | null;
  submitterEmail: string;
  /** Who performed the write, for the audit log. Defaults to the submitter. */
  actor?: { type: "user" | "api_key" | "system"; id?: string | null };
}

export async function createTicket(input: CreateTicketInput): Promise<TicketRow> {
  // 1. Route by category.
  const { data: routing } = await db()
    .from("ticket_routing")
    .select("route_role, fallback_profile_id")
    .eq("category", input.category)
    .maybeSingle();

  const routeRole: string | null = routing?.route_role ?? null;

  // 2. Pick the assignee: internal profile in the routed role pool with the
  //    fewest open assigned tickets; else the routing fallback; else unassigned
  //    (the ticket stays role-assigned).
  let assignedTo: string | null = null;
  let candidates: ProfileLite[] = [];
  if (routeRole) {
    candidates = await profilesByRoles(rolePool(routeRole));
    if (candidates.length > 0) {
      const { data: openRows } = await db()
        .from("tickets")
        .select("assigned_to")
        .in("status", ["open", "in_progress", "waiting_customer"])
        .in(
          "assigned_to",
          candidates.map((c) => c.id),
        );
      const load = new Map<string, number>(candidates.map((c) => [c.id, 0]));
      for (const row of openRows ?? []) {
        if (row.assigned_to && load.has(row.assigned_to)) {
          load.set(row.assigned_to, (load.get(row.assigned_to) ?? 0) + 1);
        }
      }
      candidates.sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0));
      assignedTo = candidates[0]?.id ?? null;
    }
  }
  if (!assignedTo && routing?.fallback_profile_id) {
    assignedTo = routing.fallback_profile_id;
  }

  // 3. Insert with a 24h first-response SLA.
  const slaDueAt = new Date(Date.now() + SLA_HOURS * 3600_000).toISOString();
  const { data: ticket, error } = await db()
    .from("tickets")
    .insert({
      customer_id: input.customerId ?? null,
      implementation_id: input.implementationId ?? null,
      submitted_by: input.submittedBy ?? null,
      submitter_email: input.submitterEmail.toLowerCase(),
      category: input.category,
      subject: input.subject,
      body: input.body,
      priority: input.priority ?? "normal",
      status: "open",
      assigned_role: routeRole,
      assigned_to: assignedTo,
      sla_due_at: slaDueAt,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Could not create ticket: ${error.message}`);
  const created = ticket as TicketRow;

  // 4. Auto-acknowledge to the submitter.
  const assignee = assignedTo ? await profileById(assignedTo) : null;
  const owner = assignee?.full_name ?? assignee?.email ?? `our ${routeRole ?? "support"} team`;
  await sendEmailSafe({
    to: created.submitter_email!,
    subject: `We received your request: ${created.subject}`,
    html: emailShell(`We're on it`, [
      `<p style="font-size:14px">Thanks for reaching out. Your request <b>${escapeHtml(created.subject)}</b> has been logged and is owned by <b>${escapeHtml(owner)}</b>.</p>`,
      `<p style="font-size:14px">We respond within 24 hours.</p>`,
      `<p style="font-size:12px;color:#666">Reference: ${created.id}</p>`,
    ]),
  });

  // 5. Notify the assignee — or everyone in the routed role when unassigned.
  const notifyTargets = assignee
    ? [assignee]
    : candidates.length > 0
      ? candidates
      : await managerProfiles();
  const detailRows = [
    `<p style="font-size:14px"><b>${escapeHtml(created.subject)}</b></p>`,
    `<p style="font-size:13px;white-space:pre-wrap">${escapeHtml(created.body)}</p>`,
    `<p style="font-size:13px;color:#666">Category: ${created.category} · Priority: ${created.priority} · From: ${escapeHtml(created.submitter_email ?? "unknown")}</p>`,
    `<p style="font-size:14px"><a href="${ticketLink(created.id)}">Open the ticket</a> — first response is due within 24 hours.</p>`,
  ];
  for (const target of notifyTargets) {
    await sendEmailSafe({
      to: target.email,
      subject: `${assignee ? "New ticket assigned to you" : `New ${routeRole ?? ""} ticket`.trim()}: ${created.subject}`,
      html: emailShell("New support ticket", detailRows),
    });
  }

  await audit({
    actor_type: input.actor?.type ?? "user",
    actor_id: input.actor?.id ?? input.submittedBy ?? null,
    action: "ticket.create",
    entity_type: "ticket",
    entity_id: created.id,
    payload: {
      category: created.category,
      priority: created.priority,
      assigned_role: routeRole,
      assigned_to: assignedTo,
      customer_id: created.customer_id,
    },
  });

  return created;
}

/* ------------------------------------------------------------------------- */
/* addComment                                                                */
/* ------------------------------------------------------------------------- */

export async function addComment(
  ticketId: string,
  input: { authorProfileId: string; body: string; internal?: boolean },
): Promise<TicketCommentRow> {
  const { data: ticketRow } = await db()
    .from("tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticketRow) throw new Error("Ticket not found");
  const ticket = ticketRow as TicketRow;

  const author = await profileById(input.authorProfileId);
  if (!author) throw new Error("Author profile not found");
  const authorIsInternal = author.role !== "customer";
  const internal = authorIsInternal ? Boolean(input.internal) : false;

  const { data: comment, error } = await db()
    .from("ticket_comments")
    .insert({
      ticket_id: ticketId,
      author_id: author.id,
      author_email: author.email,
      body: input.body,
      internal,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Could not add comment: ${error.message}`);

  // A public reply from the team is the first response, once.
  if (authorIsInternal && !internal && !ticket.first_response_at) {
    await db()
      .from("tickets")
      .update({ first_response_at: new Date().toISOString() })
      .eq("id", ticketId)
      .is("first_response_at", null);
  }

  if (authorIsInternal && !internal && ticket.submitter_email) {
    // Public team reply → tell the submitter.
    await sendEmailSafe({
      to: ticket.submitter_email,
      subject: `Update on your request: ${ticket.subject}`,
      html: emailShell("New reply on your ticket", [
        `<p style="font-size:13px;color:#666">${escapeHtml(author.full_name ?? author.email)} wrote:</p>`,
        `<p style="font-size:14px;white-space:pre-wrap">${escapeHtml(input.body)}</p>`,
        `<p style="font-size:12px;color:#666">Reference: ${ticket.id}</p>`,
      ]),
    });
  } else if (!authorIsInternal) {
    // Customer comment → tell the people responsible for the ticket.
    const recipients = await responsibleRecipients(ticket);
    for (const r of recipients) {
      await sendEmailSafe({
        to: r.email,
        subject: `Customer replied: ${ticket.subject}`,
        html: emailShell("Customer reply", [
          `<p style="font-size:13px;color:#666">${escapeHtml(author.full_name ?? author.email)} wrote:</p>`,
          `<p style="font-size:14px;white-space:pre-wrap">${escapeHtml(input.body)}</p>`,
          `<p style="font-size:14px"><a href="${ticketLink(ticket.id)}">Open the ticket</a></p>`,
        ]),
      });
    }
  }

  await audit({
    actor_type: "user",
    actor_id: author.id,
    action: "ticket.comment",
    entity_type: "ticket",
    entity_id: ticketId,
    payload: { internal, comment_id: (comment as TicketCommentRow).id },
  });

  return comment as TicketCommentRow;
}

/* ------------------------------------------------------------------------- */
/* Status / assignment mutators                                              */
/* ------------------------------------------------------------------------- */

export async function updateTicketStatus(
  ticketId: string,
  status: TicketStatus,
  actorProfileId: string,
): Promise<TicketRow> {
  const patch: Record<string, unknown> = { status };
  if (status === "resolved" || status === "closed") {
    patch.resolved_at = new Date().toISOString();
  } else {
    patch.resolved_at = null;
  }
  const { data, error } = await db()
    .from("tickets")
    .update(patch)
    .eq("id", ticketId)
    .select("*")
    .single();
  if (error) throw new Error(`Could not update status: ${error.message}`);

  await audit({
    actor_type: "user",
    actor_id: actorProfileId,
    action: "ticket.status",
    entity_type: "ticket",
    entity_id: ticketId,
    payload: { status },
  });
  return data as TicketRow;
}

export async function assignTicket(
  ticketId: string,
  assigneeProfileId: string | null,
  actorProfileId: string,
): Promise<TicketRow> {
  const patch: Record<string, unknown> = { assigned_to: assigneeProfileId };
  if (assigneeProfileId) {
    const assignee = await profileById(assigneeProfileId);
    if (!assignee || assignee.role === "customer") {
      throw new Error("Tickets can only be assigned to internal profiles");
    }
    patch.assigned_role = assignee.role;
  }
  const { data, error } = await db()
    .from("tickets")
    .update(patch)
    .eq("id", ticketId)
    .select("*")
    .single();
  if (error) throw new Error(`Could not assign ticket: ${error.message}`);

  await audit({
    actor_type: "user",
    actor_id: actorProfileId,
    action: "ticket.assign",
    entity_type: "ticket",
    entity_id: ticketId,
    payload: { assigned_to: assigneeProfileId },
  });
  return data as TicketRow;
}

/* ------------------------------------------------------------------------- */
/* Reads (used by tickets.functions.ts; RLS-free, authorization at the fn)   */
/* ------------------------------------------------------------------------- */

export interface TicketListRow extends TicketRow {
  customer_name: string | null;
  assignee_name: string | null;
}

export async function loadTickets(opts: {
  /** Restrict to these customer ids (customer callers). Null = no restriction. */
  customerIds?: string[] | null;
}): Promise<TicketListRow[]> {
  let query = db().from("tickets").select("*").order("created_at", { ascending: false });
  if (opts.customerIds) {
    if (opts.customerIds.length === 0) return [];
    query = query.in("customer_id", opts.customerIds);
  }
  const { data: tickets } = await query;
  const rows = (tickets ?? []) as TicketRow[];
  if (rows.length === 0) return [];

  const customerIds = [...new Set(rows.map((t) => t.customer_id).filter(Boolean))];
  const profileIds = [...new Set(rows.map((t) => t.assigned_to).filter(Boolean))];
  const [{ data: customers }, { data: profiles }] = await Promise.all([
    customerIds.length
      ? db().from("customers").select("id, name").in("id", customerIds)
      : Promise.resolve({ data: [] }),
    profileIds.length
      ? db().from("portal_profiles").select("id, full_name, email").in("id", profileIds)
      : Promise.resolve({ data: [] }),
  ]);
  const customerName = new Map((customers ?? []).map((c: any) => [c.id, c.name]));
  const profileName = new Map(
    (profiles ?? []).map((p: any) => [p.id, p.full_name ?? p.email]),
  );

  return rows.map((t) => ({
    ...t,
    customer_name: t.customer_id ? (customerName.get(t.customer_id) ?? null) : null,
    assignee_name: t.assigned_to ? (profileName.get(t.assigned_to) ?? null) : null,
  }));
}

export interface TicketDetail {
  ticket: TicketListRow;
  comments: Array<TicketCommentRow & { author_name: string | null }>;
}

export async function loadTicket(
  ticketId: string,
  opts: { includeInternal: boolean },
): Promise<TicketDetail | null> {
  const { data: ticketRow } = await db()
    .from("tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticketRow) return null;
  const ticket = ticketRow as TicketRow;

  let commentsQuery = db()
    .from("ticket_comments")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (!opts.includeInternal) commentsQuery = commentsQuery.eq("internal", false);
  const { data: comments } = await commentsQuery;
  const commentRows = (comments ?? []) as TicketCommentRow[];

  const profileIds = [
    ...new Set(
      [ticket.assigned_to, ...commentRows.map((c) => c.author_id)].filter(Boolean) as string[],
    ),
  ];
  const [{ data: profiles }, customerRes] = await Promise.all([
    profileIds.length
      ? db().from("portal_profiles").select("id, full_name, email").in("id", profileIds)
      : Promise.resolve({ data: [] }),
    ticket.customer_id
      ? db().from("customers").select("id, name").eq("id", ticket.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const profileName = new Map(
    (profiles ?? []).map((p: any) => [p.id, p.full_name ?? p.email]),
  );

  return {
    ticket: {
      ...ticket,
      customer_name: (customerRes as any)?.data?.name ?? null,
      assignee_name: ticket.assigned_to
        ? (profileName.get(ticket.assigned_to) ?? null)
        : null,
    },
    comments: commentRows.map((c) => ({
      ...c,
      author_name: c.author_id
        ? (profileName.get(c.author_id) ?? c.author_email)
        : c.author_email,
    })),
  };
}

/** Customer ids linked to a customer-role profile via customer_users. */
export async function linkedCustomerIds(profileId: string): Promise<string[]> {
  const { data } = await db()
    .from("customer_users")
    .select("customer_id")
    .eq("profile_id", profileId);
  return (data ?? []).map((r: any) => r.customer_id as string);
}

/* ------------------------------------------------------------------------- */
/* Alerts                                                                    */
/* ------------------------------------------------------------------------- */

export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertRow {
  id: string;
  kind: string;
  severity: AlertSeverity;
  title: string;
  detail: string | null;
  customer_id: string | null;
  implementation_id: string | null;
  source: string;
  payload: Record<string, unknown> | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  notified_at: string | null;
  created_at: string;
}

export async function createAlert(input: {
  kind: string;
  severity?: AlertSeverity;
  title: string;
  detail?: string | null;
  customerId?: string | null;
  implementationId?: string | null;
  source?: string;
  payload?: Record<string, unknown> | null;
  /** Email these managers/super admins (severity != info). Empty = no email. */
  notify?: boolean;
  actor?: { type: "user" | "api_key" | "system"; id?: string | null };
}): Promise<AlertRow> {
  const severity = input.severity ?? "warning";
  const { data: alert, error } = await db()
    .from("alerts")
    .insert({
      kind: input.kind,
      severity,
      title: input.title,
      detail: input.detail ?? null,
      customer_id: input.customerId ?? null,
      implementation_id: input.implementationId ?? null,
      source: input.source ?? "system",
      payload: input.payload ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Could not create alert: ${error.message}`);
  let created = alert as AlertRow;

  if (input.notify && severity !== "info") {
    const managers = await managerProfiles();
    for (const m of managers) {
      await sendEmailSafe({
        to: m.email,
        subject: `[Alert] ${created.title}`,
        html: emailShell(`[${severity.toUpperCase()}] ${created.title}`, [
          created.detail
            ? `<p style="font-size:14px;white-space:pre-wrap">${escapeHtml(created.detail)}</p>`
            : "",
          `<p style="font-size:13px;color:#666">Kind: ${escapeHtml(created.kind)} · Source: ${escapeHtml(created.source)}</p>`,
          `<p style="font-size:14px"><a href="${appUrl()}/alerts">Review alerts</a></p>`,
        ]),
      });
    }
    if (managers.length > 0) {
      const { data: stamped } = await db()
        .from("alerts")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", created.id)
        .select("*")
        .single();
      if (stamped) created = stamped as AlertRow;
    }
  }

  await audit({
    actor_type: input.actor?.type ?? "system",
    actor_id: input.actor?.id ?? null,
    action: "alert.create",
    entity_type: "alert",
    entity_id: created.id,
    payload: { kind: created.kind, severity, title: created.title },
  });

  return created;
}

export async function acknowledgeAlert(alertId: string, profileId: string): Promise<AlertRow> {
  const { data, error } = await db()
    .from("alerts")
    .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: profileId })
    .eq("id", alertId)
    .select("*")
    .single();
  if (error) throw new Error(`Could not acknowledge alert: ${error.message}`);

  await audit({
    actor_type: "user",
    actor_id: profileId,
    action: "alert.acknowledge",
    entity_type: "alert",
    entity_id: alertId,
  });
  return data as AlertRow;
}
