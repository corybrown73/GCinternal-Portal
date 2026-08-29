import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server functions for the tickets + alerts system.
 *
 * Authorization model (enforced here, on the server, per call):
 *  - internal roles see and manage all tickets;
 *  - customer-role callers only see/create tickets for customers they are
 *    linked to via customer_users, never internal comments;
 *  - routing table edits and alert management are internal-only
 *    (routing writes require manager+).
 */

const TICKET_CATEGORIES = [
  "technical",
  "training",
  "billing",
  "data",
  "integration",
  "other",
] as const;
const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const TICKET_STATUSES = [
  "open",
  "in_progress",
  "waiting_customer",
  "resolved",
  "closed",
] as const;

type CallerProfile = { id: string; email: string; full_name: string | null; role: string };

const MANAGE_ROLES = ["admin", "super_admin", "manager"];

/** Load the caller's portal profile; throws when the auth user has none. */
async function callerProfile(userId: string): Promise<CallerProfile> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("portal_profiles")
    .select("id, email, full_name, role")
    .eq("id", userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden: no portal profile for this account");
  return data as CallerProfile;
}

function assertInternal(profile: CallerProfile) {
  if (profile.role === "customer") throw new Error("Forbidden: internal users only");
}

function assertManager(profile: CallerProfile) {
  if (!MANAGE_ROLES.includes(profile.role)) throw new Error("Forbidden: managers only");
}

/* ---------- Reads ---------- */

export const getTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const profile = await callerProfile(context.userId);
    const { loadTickets, linkedCustomerIds } = await import("./tickets.server");
    if (profile.role === "customer") {
      return loadTickets({ customerIds: await linkedCustomerIds(profile.id) });
    }
    return loadTickets({ customerIds: null });
  });

export const getTicket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ ticketId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const profile = await callerProfile(context.userId);
    const { loadTicket, linkedCustomerIds } = await import("./tickets.server");
    const internal = profile.role !== "customer";
    const detail = await loadTicket(data.ticketId, { includeInternal: internal });
    if (!detail) throw new Error("Ticket not found");
    if (!internal) {
      const linked = await linkedCustomerIds(profile.id);
      if (!detail.ticket.customer_id || !linked.includes(detail.ticket.customer_id)) {
        throw new Error("Ticket not found");
      }
    }
    return detail;
  });

export const getTicketRouting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const profile = await callerProfile(context.userId);
    assertInternal(profile);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("ticket_routing")
      .select("id, category, route_role, fallback_profile_id")
      .order("category", { ascending: true });
    return (data ?? []) as Array<{
      id: string;
      category: string;
      route_role: string;
      fallback_profile_id: string | null;
    }>;
  });

/** Internal profiles for assignee/fallback pickers. */
export const getInternalProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const profile = await callerProfile(context.userId);
    assertInternal(profile);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("portal_profiles")
      .select("id, email, full_name, role")
      .neq("role", "customer")
      .order("full_name", { ascending: true });
    return (data ?? []) as CallerProfile[];
  });

/* ---------- Ticket writes ---------- */

export const addTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        customerId: z.string().uuid().nullable().optional(),
        implementationId: z.string().uuid().nullable().optional(),
        category: z.enum(TICKET_CATEGORIES),
        subject: z.string().min(1).max(300),
        body: z.string().min(1).max(20_000),
        priority: z.enum(TICKET_PRIORITIES).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const profile = await callerProfile(context.userId);
    const { createTicket, linkedCustomerIds } = await import("./tickets.server");

    let customerId = data.customerId ?? null;
    if (profile.role === "customer") {
      // Customers may only file tickets against a customer they belong to.
      const linked = await linkedCustomerIds(profile.id);
      if (customerId) {
        if (!linked.includes(customerId)) throw new Error("Forbidden: not your customer");
      } else {
        customerId = linked[0] ?? null;
        if (!customerId) throw new Error("Forbidden: no customer linked to this account");
      }
    }

    return createTicket({
      customerId,
      implementationId: data.implementationId ?? null,
      category: data.category,
      subject: data.subject,
      body: data.body,
      priority: data.priority,
      submittedBy: profile.id,
      submitterEmail: profile.email,
      actor: { type: "user", id: profile.id },
    });
  });

export const addTicketComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        ticketId: z.string().uuid(),
        body: z.string().min(1).max(20_000),
        internal: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const profile = await callerProfile(context.userId);
    const { addComment, loadTicket, linkedCustomerIds } = await import("./tickets.server");

    if (profile.role === "customer") {
      const detail = await loadTicket(data.ticketId, { includeInternal: false });
      const linked = await linkedCustomerIds(profile.id);
      if (
        !detail ||
        !detail.ticket.customer_id ||
        !linked.includes(detail.ticket.customer_id)
      ) {
        throw new Error("Ticket not found");
      }
    }

    // addComment forces internal=false for customer authors.
    return addComment(data.ticketId, {
      authorProfileId: profile.id,
      body: data.body,
      internal: data.internal,
    });
  });

export const setTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ ticketId: z.string().uuid(), status: z.enum(TICKET_STATUSES) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const profile = await callerProfile(context.userId);
    assertInternal(profile);
    const { updateTicketStatus } = await import("./tickets.server");
    return updateTicketStatus(data.ticketId, data.status, profile.id);
  });

export const setTicketAssignee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ ticketId: z.string().uuid(), assigneeId: z.string().uuid().nullable() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const profile = await callerProfile(context.userId);
    assertInternal(profile);
    const { assignTicket } = await import("./tickets.server");
    return assignTicket(data.ticketId, data.assigneeId, profile.id);
  });

export const setTicketRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        routeRole: z.string().min(1).max(50),
        fallbackProfileId: z.string().uuid().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const profile = await callerProfile(context.userId);
    assertManager(profile);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { audit } = await import("./server/audit");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("ticket_routing")
      .update({ route_role: data.routeRole, fallback_profile_id: data.fallbackProfileId })
      .eq("id", data.id)
      .select("id, category, route_role, fallback_profile_id")
      .single();
    if (error) throw new Error(`Could not update routing: ${error.message}`);
    await audit({
      actor_type: "user",
      actor_id: profile.id,
      action: "ticket_routing.update",
      entity_type: "ticket_routing",
      entity_id: data.id,
      payload: { route_role: data.routeRole, fallback_profile_id: data.fallbackProfileId },
    });
    return row;
  });

/* ---------- Alerts ---------- */

export const getAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const profile = await callerProfile(context.userId);
    assertInternal(profile);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: alerts } = await admin
      .from("alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = (alerts ?? []) as Array<Record<string, any>>;

    const customerIds = [...new Set(rows.map((a) => a.customer_id).filter(Boolean))];
    const { data: customers } = customerIds.length
      ? await admin.from("customers").select("id, name").in("id", customerIds)
      : { data: [] };
    const names = new Map((customers ?? []).map((c: any) => [c.id, c.name as string]));
    return rows.map((a) => ({
      ...a,
      customer_name: a.customer_id ? (names.get(a.customer_id) ?? null) : null,
    }));
  });

export const ackAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ alertId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const profile = await callerProfile(context.userId);
    assertInternal(profile);
    const { acknowledgeAlert } = await import("./tickets.server");
    return acknowledgeAlert(data.alertId, profile.id);
  });
