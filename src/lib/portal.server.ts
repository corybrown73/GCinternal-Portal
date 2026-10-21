import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  commitmentHistory,
  customerCommitments,
  owedToCustomer,
  type CustomerCommitment,
} from "./customer-commitments";
import { customerTaskSteps, type CustomerTaskStep } from "./customer-next-steps";
import { customerFacingNameFor } from "./server/customer-facing-name";
import { LIFECYCLE_STAGES } from "./lifecycle";
import { planEndDate } from "./date-labels";
import { normalizeStage } from "./hub-format";
import {
  addComment,
  allowedImplIds,
  createTicket,
  grantAllows,
  linkedCustomerIds,
  linkedGrants,
  type CustomerGrant,
  type TicketCategory,
  type TicketPriority,
} from "./tickets.server";

const db = () => supabaseAdmin as any;

/* ------------------------------------------------------------------------- */
/* Shared authorization helpers (used by portal, access and journey fns)     */
/* ------------------------------------------------------------------------- */

export interface CallerProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  /** Bridge to the hub's ownership anchor (0010); null when no email match. */
  team_member_id: string | null;
}

export async function callerProfile(userId: string): Promise<CallerProfile> {
  const { data } = await db()
    .from("portal_profiles")
    .select("id, email, full_name, role, team_member_id")
    .eq("id", userId)
    .maybeSingle();
  if (!data) throw new Error("Unauthorized: no profile for this user");
  return data as CallerProfile;
}

/** Throws unless the caller's portal_profiles.role is internal (not 'customer'). */
export async function requireInternal(userId: string): Promise<CallerProfile> {
  const profile = await callerProfile(userId);
  if (profile.role === "customer") throw new Error("Forbidden: internal users only");
  return profile;
}

/** Roles allowed to edit journeys: managers/admins plus implementation. */
export function canEditSequences(role: string): boolean {
  return ["admin", "super_admin", "manager", "implementation", "onboarding"].includes(role);
}

/** Customer ids the caller may see. Throws when none are linked. */
export async function requireCustomerIds(userId: string): Promise<string[]> {
  const ids = await linkedCustomerIds(userId);
  if (ids.length === 0) {
    throw new Error(
      "No customer is linked to this login yet. Ask your GoCanvas contact for an invite.",
    );
  }
  return ids;
}

/**
 * The caller's grants, which carry the implementation scope. Every portal read
 * and write goes through the service-role client, so this — not RLS — is what
 * keeps a scoped contact out of a sibling implementation's data. It is
 * deliberately NOT feature-flagged: an issued scope is honoured permanently.
 */
export async function requireGrants(userId: string): Promise<CustomerGrant[]> {
  const grants = await linkedGrants(userId);
  if (grants.length === 0) {
    throw new Error(
      "No customer is linked to this login yet. Ask your GoCanvas contact for an invite.",
    );
  }
  return grants;
}

/** Keeps only the implementations the grants allow. */
function scopeImplementations<T extends { id: string; customer_id: string }>(
  rows: T[],
  grants: CustomerGrant[],
): T[] {
  return rows.filter((row) => {
    const allowed = allowedImplIds(grants, row.customer_id);
    return allowed === null || allowed.has(row.id);
  });
}

/* ------------------------------------------------------------------------- */
/* Portal home                                                               */
/* ------------------------------------------------------------------------- */

export interface PortalMilestone {
  id: string;
  name: string;
  status: string;
  target_date: string | null;
  completed_date: string | null;
  stage: string | null;
}

export interface PortalImplementation {
  id: string;
  customer_id: string;
  customer_name: string;
  name: string;
  current_stage: string;
  stage_entered_at: string;
  status: string;
  /** The plan end (target_date ?? target_launch_date), read as "Everything in your plan live by". */
  target_launch_date: string | null;
  actual_launch_date: string | null;
  /** 0..100 — completed milestones / total, else stage index / total stages. */
  progress_pct: number;
  milestones: PortalMilestone[];
}

/** A task the customer owns, from work_items with party = customer and visibility = shared. */
export type PortalNextStep = CustomerTaskStep;

/** A GoCanvas promise to the customer, in the words the customer sees. */
export type PortalCommitment = CustomerCommitment;

export interface PortalActivityItem {
  id: string;
  at: string;
  label: string;
  detail: string | null;
}

export interface PortalHome {
  customers: Array<{ id: string; name: string }>;
  customer_name: string;
  implementations: PortalImplementation[];
  /** The customer's own shared tasks. "Your next steps". */
  next_steps: PortalNextStep[];
  /** GoCanvas promises still owed, renegotiated and missed included. "What we owe you". */
  we_owe: PortalCommitment[];
  /** GoCanvas promises done or withdrawn. "History". */
  commitment_history: PortalCommitment[];
  activity: PortalActivityItem[];
}

function milestoneDone(m: { status: string | null; completed_date: string | null }): boolean {
  if (m.completed_date) return true;
  return ["complete", "completed", "done"].includes((m.status ?? "").toLowerCase());
}

export async function loadPortalHome(userId: string): Promise<PortalHome> {
  const grants = await requireGrants(userId);
  const customerIds = [...new Set(grants.map((g) => g.customer_id))];

  const [{ data: customers }, { data: allImpls }] = await Promise.all([
    db().from("customers").select("id, name").in("id", customerIds),
    db().from("implementations").select("*").in("customer_id", customerIds).is("closed_at", null),
  ]);

  // A scoped grant must never surface a sibling implementation.
  const impls = scopeImplementations((allImpls ?? []) as any[], grants);

  const customerName = (customers ?? []).map((c: any) => c.name).join(" · ") || "Customer";
  const implIds = (impls ?? []).map((i: any) => i.id);

  // Only the customer's own shared tasks are read here. The filter is repeated
  // in customerTaskSteps, so a change to this query cannot widen the view.
  const [{ data: milestones }, { data: commitments }, { data: history }, { data: tasks }] =
    implIds.length
      ? await Promise.all([
          db()
            .from("milestones")
            .select("id, implementation_id, name, status, target_date, completed_date, stage")
            .in("implementation_id", implIds),
          db()
            .from("commitments")
            .select("id, implementation_id, description, due_date, status, committed_to")
            .in("implementation_id", implIds),
          db()
            .from("implementation_stage_history")
            .select("id, implementation_id, stage, entered_at")
            .in("implementation_id", implIds)
            .order("entered_at", { ascending: false })
            .limit(6),
          db()
            .from("work_items")
            .select("id, implementation_id, title, status, party, visibility, due_at")
            .in("implementation_id", implIds)
            .eq("party", "customer")
            .eq("visibility", "shared"),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const customerById = new Map<string, string>(
    (customers ?? []).map((c: any) => [c.id as string, c.name as string]),
  );
  // The customer reads their own name here: the deal's customer-facing name.
  const facingName = new Map<string, string>();
  for (const i of (impls ?? []) as any[]) {
    facingName.set(
      String(i.id),
      await customerFacingNameFor({ implementationId: String(i.id), fallback: String(i.name) }),
    );
  }
  const totalStages = LIFECYCLE_STAGES.length;

  const implementations: PortalImplementation[] = (impls ?? []).map((i: any) => {
    const own = (milestones ?? []).filter((m: any) => m.implementation_id === i.id);
    let pct: number;
    if (own.length > 0) {
      pct = Math.round((own.filter(milestoneDone).length / own.length) * 100);
    } else {
      const normalized = normalizeStage(i.current_stage);
      const idx = normalized ? LIFECYCLE_STAGES.findIndex((s) => s.id === normalized) : -1;
      pct = idx >= 0 ? Math.round(((idx + 1) / totalStages) * 100) : 0;
    }
    return {
      id: i.id,
      customer_id: i.customer_id,
      customer_name: customerById.get(i.customer_id) ?? "Customer",
      name: facingName.get(String(i.id)) ?? i.name,
      current_stage: i.current_stage,
      stage_entered_at: i.stage_entered_at,
      status: i.status,
      target_launch_date: planEndDate(i),
      actual_launch_date: i.actual_launch_date,
      progress_pct: pct,
      milestones: own
        .map((m: any) => ({
          id: m.id,
          name: m.name,
          status: m.status,
          target_date: m.target_date,
          completed_date: m.completed_date,
          stage: m.stage,
        }))
        .sort((a: PortalMilestone, b: PortalMilestone) =>
          (a.target_date ?? "9999").localeCompare(b.target_date ?? "9999"),
        ),
    };
  });

  const implName = new Map(implementations.map((i) => [i.id, i.name]));

  // The same UTC day the shared plan uses, so the two views agree on what is overdue.
  const today = new Date().toISOString().slice(0, 10);
  // "Your next steps": the customer's own shared tasks only. GoCanvas promises
  // are shown under "What we owe you", never here.
  const nextSteps: PortalNextStep[] = customerTaskSteps(tasks ?? [], implName, today);
  // "What we owe you" and "History": the GoCanvas promises, split by state.
  const promises = customerCommitments(commitments ?? [], implName, today);

  const activity: PortalActivityItem[] = [
    ...(history ?? []).map((h: any) => ({
      id: `stage-${h.id}`,
      at: h.entered_at,
      label: `Entered ${stageDisplay(h.stage)}`,
      detail: implName.get(h.implementation_id) ?? null,
    })),
    ...(milestones ?? [])
      .filter((m: any) => m.completed_date)
      .map((m: any) => ({
        id: `ms-${m.id}`,
        at: m.completed_date,
        label: `Milestone completed: ${m.name}`,
        detail: implName.get(m.implementation_id) ?? null,
      })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  return {
    customers: (customers ?? []).map((c: any) => ({ id: c.id, name: c.name })),
    customer_name: customerName,
    implementations,
    next_steps: nextSteps.slice(0, 12),
    we_owe: owedToCustomer(promises),
    commitment_history: commitmentHistory(promises),
    activity,
  };
}

function stageDisplay(raw: string): string {
  const normalized = normalizeStage(raw);
  const stage = normalized ? LIFECYCLE_STAGES.find((s) => s.id === normalized) : undefined;
  return stage?.label ?? raw;
}

/* ------------------------------------------------------------------------- */
/* Portal tickets                                                            */
/* ------------------------------------------------------------------------- */

export interface PortalTicketComment {
  id: string;
  body: string;
  author_name: string;
  author_is_team: boolean;
  created_at: string;
}

export interface PortalTicket {
  id: string;
  customer_id: string;
  subject: string;
  body: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  comments: PortalTicketComment[];
}

export async function loadPortalTickets(userId: string): Promise<{
  customers: Array<{ id: string; name: string }>;
  tickets: PortalTicket[];
}> {
  const grants = await requireGrants(userId);
  const customerIds = [...new Set(grants.map((g) => g.customer_id))];

  const [{ data: customers }, { data: allTickets }] = await Promise.all([
    db().from("customers").select("id, name").in("id", customerIds),
    db()
      .from("tickets")
      .select(
        "id, customer_id, implementation_id, subject, body, category, status, priority, created_at",
      )
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false }),
  ]);

  // Account-level tickets (no implementation) stay visible to scoped users;
  // tickets belonging to a sibling implementation do not.
  const tickets = (allTickets ?? []).filter((t: any) =>
    grantAllows(grants, t.customer_id, t.implementation_id ?? null),
  );

  const ticketIds = (tickets ?? []).map((t: any) => t.id);
  // Customers must NEVER see internal comments — filtered here, server-side.
  const { data: comments } = ticketIds.length
    ? await db()
        .from("ticket_comments")
        .select("id, ticket_id, author_id, author_email, body, internal, created_at")
        .in("ticket_id", ticketIds)
        .eq("internal", false)
        .order("created_at", { ascending: true })
    : { data: [] };

  const authorIds = Array.from(
    new Set((comments ?? []).map((c: any) => c.author_id).filter(Boolean)),
  );
  const { data: authors } = authorIds.length
    ? await db().from("portal_profiles").select("id, full_name, email, role").in("id", authorIds)
    : { data: [] };
  const authorById = new Map<string, any>((authors ?? []).map((a: any) => [a.id, a]));

  return {
    customers: (customers ?? []).map((c: any) => ({ id: c.id, name: c.name })),
    tickets: (tickets ?? []).map((t: any) => ({
      ...t,
      comments: (comments ?? [])
        .filter((c: any) => c.ticket_id === t.id)
        .map((c: any) => {
          const author = c.author_id ? authorById.get(c.author_id) : null;
          const isTeam = author ? author.role !== "customer" : false;
          return {
            id: c.id,
            body: c.body,
            author_name: isTeam
              ? "GoCanvas team"
              : author?.full_name || author?.email || c.author_email || "You",
            author_is_team: isTeam,
            created_at: c.created_at,
          };
        }),
    })),
  };
}

export async function submitPortalTicket(
  userId: string,
  input: {
    customerId: string;
    category: TicketCategory;
    subject: string;
    body: string;
    priority: TicketPriority;
  },
) {
  const grants = await requireGrants(userId);
  if (!grants.some((g) => g.customer_id === input.customerId)) {
    throw new Error("Forbidden: you are not linked to this customer");
  }
  const profile = await callerProfile(userId);

  // Which implementation the ticket belongs to. A scoped grant answers this
  // outright; an account-wide grant files against the single implementation
  // when there is exactly one, and at account level otherwise.
  const allowed = allowedImplIds(grants, input.customerId);
  let implementationId: string | null = null;
  if (allowed !== null && allowed.size === 1) {
    implementationId = [...allowed][0] ?? null;
  } else {
    const { data: impls } = await db()
      .from("implementations")
      .select("id")
      .eq("customer_id", input.customerId);
    const visible = (impls ?? []).filter((i: any) => allowed === null || allowed.has(i.id));
    implementationId = visible.length === 1 ? visible[0].id : null;
  }

  return createTicket({
    customerId: input.customerId,
    implementationId,
    category: input.category,
    subject: input.subject,
    body: input.body,
    priority: input.priority,
    submittedBy: profile.id,
    submitterEmail: profile.email,
    actor: { type: "user", id: profile.id },
  });
}

export async function replyPortalTicket(userId: string, ticketId: string, body: string) {
  const grants = await requireGrants(userId);
  const { data: ticket } = await db()
    .from("tickets")
    .select("id, customer_id, implementation_id")
    .eq("id", ticketId)
    .maybeSingle();
  // Scope matters on reply as much as on read: without this check a scoped
  // contact could comment on a sibling implementation's ticket by id.
  if (!ticket || !grantAllows(grants, ticket.customer_id, ticket.implementation_id ?? null)) {
    throw new Error("Forbidden: not your ticket");
  }
  // Sibling-owned addComment: forces internal=false for customer authors and
  // notifies the responsible team members by email.
  return addComment(ticketId, { authorProfileId: userId, body });
}
