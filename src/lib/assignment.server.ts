import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { appUrl } from "@/lib/app-url";
import {
  DEFAULT_ASSIGNMENT_RULES,
  dealWeight,
  describeBreakdown,
  normalizeRules,
  rankPool,
  type AssignmentRules,
  type PoolMember,
  type WeightBreakdown,
} from "@/lib/assignment";
import { readIntake } from "@/lib/intake-answers";

import { audit } from "./server/audit";
import { sendEmail } from "./server/email";

const db = () => supabaseAdmin as any;
const RULES_KEY = "assignment_rules";

/* ------------------------------------------------------------- rules */

export async function loadRules(): Promise<AssignmentRules> {
  const { data } = await db()
    .from("portal_app_config")
    .select("value")
    .eq("key", RULES_KEY)
    .maybeSingle();
  return normalizeRules(data?.value ?? DEFAULT_ASSIGNMENT_RULES);
}

export async function saveRules(raw: unknown): Promise<AssignmentRules> {
  const rules = normalizeRules(raw);
  const { error } = await db()
    .from("portal_app_config")
    .upsert({ key: RULES_KEY, value: rules }, { onConflict: "key" });
  if (error) throw new Error(`Could not save the rules: ${error.message}`);
  return rules;
}

/* -------------------------------------------------------------- pool */

export type PoolRow = PoolMember & {
  email: string | null;
  role: string | null;
  active: boolean;
  inPool: boolean;
  effectiveLoad: number;
  /** Position in the rotation as it stands: 1 is next. Null when not active. */
  rank: number | null;
};

/** Every active team member, with whether they are in rotation and what they carry. */
export async function loadPool(rules?: AssignmentRules): Promise<PoolRow[]> {
  const r = rules ?? (await loadRules());
  const since = new Date(Date.now() - r.window_days * 86_400_000).toISOString();
  const [{ data: members }, { data: pool }, { data: ledger }] = await Promise.all([
    db().from("team_members").select("id,name,email,role").eq("active", true).order("name"),
    db().from("portal_assignment_pool").select("team_member_id,active,capacity"),
    db()
      .from("portal_assignments")
      .select("team_member_id,weight,created_at")
      .gte("created_at", since),
  ]);
  const poolBy = new Map<string, { active: boolean; capacity: number }>(
    ((pool ?? []) as any[]).map((p) => [
      String(p.team_member_id),
      { active: Boolean(p.active), capacity: Number(p.capacity) || 1 },
    ]),
  );
  const load = new Map<string, number>();
  const last = new Map<string, string>();
  for (const a of (ledger ?? []) as any[]) {
    const id = String(a.team_member_id);
    load.set(id, (load.get(id) ?? 0) + Number(a.weight));
    const at = String(a.created_at);
    if (!last.has(id) || at > last.get(id)!) last.set(id, at);
  }
  const rows: PoolRow[] = ((members ?? []) as any[]).map((m) => {
    const p = poolBy.get(String(m.id));
    const capacity = p?.capacity ?? 1;
    const l = load.get(String(m.id)) ?? 0;
    return {
      teamMemberId: String(m.id),
      name: String(m.name),
      email: (m.email as string | null) ?? null,
      role: (m.role as string | null) ?? null,
      capacity,
      load: l,
      lastAssignedAt: last.get(String(m.id)) ?? null,
      inPool: Boolean(p),
      active: Boolean(p?.active),
      effectiveLoad: l / capacity,
      rank: null,
    };
  });
  const ranked = rankPool(rows.filter((x) => x.inPool && x.active));
  ranked.forEach((m, i) => {
    const row = rows.find((x) => x.teamMemberId === m.teamMemberId);
    if (row) row.rank = i + 1;
  });
  return rows;
}

export async function setPoolMember(args: {
  teamMemberId: string;
  active: boolean;
  capacity?: number | undefined;
}): Promise<void> {
  const { error } = await db()
    .from("portal_assignment_pool")
    .upsert(
      {
        team_member_id: args.teamMemberId,
        active: args.active,
        ...(args.capacity !== undefined && { capacity: args.capacity }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_member_id" },
    );
  if (error) throw new Error(`Could not update the pool: ${error.message}`);
}

/* ------------------------------------------------------- the ledger */

export type AssignmentRow = {
  id: string;
  dealId: string;
  dealName: string | null;
  implementationId: string | null;
  customerId: string | null;
  teamMemberId: string;
  assigneeName: string | null;
  weight: number;
  breakdown: WeightBreakdown;
  source: "auto" | "manual";
  note: string | null;
  createdAt: string;
};

export async function recentAssignments(limit = 30): Promise<AssignmentRow[]> {
  const { data } = await db()
    .from("portal_assignments")
    .select(
      "id,deal_id,implementation_id,team_member_id,weight,breakdown,source,note,created_at,portal_accounts(name,customer_id),team_members(name)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as any[]).map((a) => ({
    id: String(a.id),
    dealId: String(a.deal_id),
    dealName: a.portal_accounts?.name ?? null,
    implementationId: a.implementation_id ?? null,
    customerId: a.portal_accounts?.customer_id ?? null,
    teamMemberId: String(a.team_member_id),
    assigneeName: a.team_members?.name ?? null,
    weight: Number(a.weight),
    breakdown: (a.breakdown ?? {}) as WeightBreakdown,
    source: a.source,
    note: a.note ?? null,
    createdAt: String(a.created_at),
  }));
}

/* ----------------------------------------------------------- assign */

async function dealFacts(dealId: string) {
  const { data: deal } = await db()
    .from("portal_accounts")
    .select("id,name,arr,intake,customer_id")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) throw new Error("Deal not found");
  const intake = readIntake(deal.intake);
  const { normalizeServices } = await import("@/lib/onboarding-services");
  const services = normalizeServices(intake.timeline.services as any, intake.timeline);
  const integrations = services.filter((x) => x.kind === "integration");
  const topTier = integrations.reduce((m, x) => Math.max(m, x.tier ?? 3), 0);
  return {
    deal,
    intake,
    forWeight: {
      arr: deal.arr === null || deal.arr === undefined ? null : Number(deal.arr),
      seats: intake.field_users,
      integrationTier: topTier || null,
      extraServices: Math.max(0, services.length - (integrations.length ? 1 : 0)),
    },
  };
}

async function implementationForDeal(dealId: string, customerId: string | null) {
  const byDeal = await db()
    .from("implementations")
    .select("id")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byDeal.data?.id) return String(byDeal.data.id);
  if (!customerId) return null;
  const byCustomer = await db()
    .from("implementations")
    .select("id")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return byCustomer.data?.id ? String(byCustomer.data.id) : null;
}

/**
 * Hand the account to a person.
 *
 * `teamMemberId` or `ownerEmail` makes it a manual pick (a manager, or the
 * closed-won row naming its owner). Otherwise the rule decides from the
 * pool. Writes the project's owner, the ledger row, the audit entry, and
 * sends the assignee the three things to do first.
 */
export async function assignDeal(args: {
  dealId: string;
  implementationId?: string | null;
  teamMemberId?: string | null;
  ownerEmail?: string | undefined;
  actorProfileId?: string | null;
  note?: string | null;
}): Promise<{
  assigneeName: string | null;
  teamMemberId: string;
  weight: number;
  breakdown: WeightBreakdown;
  source: "auto" | "manual";
  notified: boolean;
} | null> {
  const rules = await loadRules();
  const { deal, forWeight } = await dealFacts(args.dealId);
  const { weight, breakdown } = dealWeight(forWeight, rules);
  const pool = await loadPool(rules);

  let chosen: PoolRow | undefined;
  let source: "auto" | "manual" = "auto";
  if (args.teamMemberId) {
    chosen = pool.find((p) => p.teamMemberId === args.teamMemberId);
    source = "manual";
  } else if (args.ownerEmail) {
    const email = args.ownerEmail.toLowerCase();
    chosen = pool.find((p) => (p.email ?? "").toLowerCase() === email);
    source = "manual";
  }
  if (!chosen) {
    const ranked = pool
      .filter((p) => p.inPool && p.active)
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    chosen = ranked[0];
    source = "auto";
  }
  if (!chosen) return null;

  const implementationId =
    args.implementationId ?? (await implementationForDeal(args.dealId, deal.customer_id ?? null));
  if (implementationId) {
    const { error } = await db()
      .from("implementations")
      .update({ owner_id: chosen.teamMemberId })
      .eq("id", implementationId);
    if (error) throw new Error(`Could not set the project owner: ${error.message}`);
  }

  const { error: ledgerError } = await db()
    .from("portal_assignments")
    .insert({
      deal_id: args.dealId,
      implementation_id: implementationId,
      team_member_id: chosen.teamMemberId,
      weight,
      breakdown,
      source,
      actor_profile_id: args.actorProfileId ?? null,
      note:
        args.note ??
        (source === "auto"
          ? `Rule: lowest load in the last ${rules.window_days} days (${chosen.load} carried)`
          : args.ownerEmail
            ? "Named on the closed-won row"
            : "Chosen by hand"),
    });
  if (ledgerError) throw new Error(`Could not record the assignment: ${ledgerError.message}`);

  await audit({
    actor_type: args.actorProfileId ? "user" : "system",
    actor_id: args.actorProfileId ?? null,
    action: "implementation.assigned",
    entity_type: "account",
    entity_id: args.dealId,
    payload: { team_member_id: chosen.teamMemberId, weight, breakdown, source },
  });

  let notified = false;
  if (chosen.email) {
    try {
      await notifyAssignee({
        to: chosen.email,
        assigneeName: chosen.name,
        dealId: args.dealId,
        dealName: String(deal.name),
        customerId: deal.customer_id ?? null,
        weight,
        breakdown,
        integrationTier: forWeight.integrationTier,
        seats: forWeight.seats,
      });
      notified = true;
    } catch (e) {
      console.error("[assignment] could not email the assignee", e);
    }
  }

  return {
    assigneeName: chosen.name,
    teamMemberId: chosen.teamMemberId,
    weight,
    breakdown,
    source,
    notified,
  };
}

/* ------------------------------------------------------ the message */

function esc(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function notifyAssignee(a: {
  to: string;
  assigneeName: string;
  dealId: string;
  dealName: string;
  customerId: string | null;
  weight: number;
  breakdown: WeightBreakdown;
  integrationTier: number | null;
  seats: number | null;
}) {
  const base = appUrl();
  const deal = `${base}/deals/${a.dealId}`;
  const welcome = `${base}/onboarding-plan/${a.dealId}`;
  const facts = [
    a.seats ? `${a.seats} seats` : null,
    a.integrationTier ? `integration tier ${a.integrationTier}` : "no integration",
    `weight ${a.weight} (${describeBreakdown(a.breakdown)})`,
  ]
    .filter(Boolean)
    .join(" · ");
  const first = a.assigneeName.split(" ")[0] ?? a.assigneeName;
  await sendEmail({
    to: a.to,
    subject: `New account: ${a.dealName} — three things to do first`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;color:#0a1628">
        <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#039de7;margin:0 0 6px">You're up</p>
        <h2 style="margin:0 0 6px;color:#072b57">${esc(a.dealName)}</h2>
        <p style="margin:0 0 16px;color:#556477">${esc(facts)}</p>
        <p>Hi ${esc(first)} — this one is yours. The plan is already built with dates. Three things before the kickoff invite goes out:</p>
        <ol style="line-height:1.7">
          <li><b>Grab the Gong recording</b> from the closing call and paste the notes on the deal.<br/><a href="${deal}#reports" style="color:#039de7">Open the deal → Gong reports</a></li>
          <li><b>Upload the SOW</b> so the plan and the page read from what was sold.<br/><a href="${deal}#sow" style="color:#039de7">Open the deal → SOW</a></li>
          <li><b>Open the welcome page</b> — the brief. Check the readiness line, set the two call times, create the customer link.<br/><a href="${welcome}" style="color:#039de7">Open the welcome page</a></li>
        </ol>
        <p style="color:#556477;font-size:13px">Kickoff is the next business day. The form is live within seven.</p>
        <p style="font-size:12px;color:#888">GoCanvas Handoff Hub</p>
      </div>`,
  });
}

/* ------------------------------------------ what the deal page shows */

export type DealAssignment = {
  owner: { teamMemberId: string; name: string; email: string | null } | null;
  last: AssignmentRow | null;
  weight: number;
  breakdown: WeightBreakdown;
  nextUp: { teamMemberId: string; name: string } | null;
  pool: Array<{ teamMemberId: string; name: string; rank: number | null; load: number }>;
  steps: Array<{ key: "gong" | "sow" | "welcome"; label: string; done: boolean }>;
};

export async function dealAssignment(dealId: string): Promise<DealAssignment> {
  const rules = await loadRules();
  const { deal, forWeight } = await dealFacts(dealId);
  const { weight, breakdown } = dealWeight(forWeight, rules);
  const pool = await loadPool(rules);
  const implementationId = await implementationForDeal(dealId, deal.customer_id ?? null);

  let owner: DealAssignment["owner"] = null;
  if (implementationId) {
    const { data: impl } = await db()
      .from("implementations")
      .select("owner_id")
      .eq("id", implementationId)
      .maybeSingle();
    if (impl?.owner_id) {
      const m = pool.find((p) => p.teamMemberId === String(impl.owner_id));
      if (m) owner = { teamMemberId: m.teamMemberId, name: m.name, email: m.email };
      else {
        const { data: tm } = await db()
          .from("team_members")
          .select("id,name,email")
          .eq("id", impl.owner_id)
          .maybeSingle();
        if (tm)
          owner = { teamMemberId: String(tm.id), name: String(tm.name), email: tm.email ?? null };
      }
    }
  }

  const [{ data: ledger }, { count: reports }, { data: dealRow }] = await Promise.all([
    db()
      .from("portal_assignments")
      .select(
        "id,deal_id,implementation_id,team_member_id,weight,breakdown,source,note,created_at,team_members(name)",
      )
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1),
    db()
      .from("portal_gong_reports")
      .select("id", { count: "exact", head: true })
      .eq("account_id", dealId),
    db()
      .from("portal_accounts")
      .select("sow_document_path,sow_reference,welcome_issued_at")
      .eq("id", dealId)
      .maybeSingle(),
  ]);
  const l = (ledger ?? [])[0] as any;
  const next = pool.find((p) => p.rank === 1) ?? null;
  return {
    owner,
    last: l
      ? {
          id: String(l.id),
          dealId: String(l.deal_id),
          dealName: String(deal.name),
          implementationId: l.implementation_id ?? null,
          customerId: deal.customer_id ?? null,
          teamMemberId: String(l.team_member_id),
          assigneeName: l.team_members?.name ?? null,
          weight: Number(l.weight),
          breakdown: (l.breakdown ?? {}) as WeightBreakdown,
          source: l.source,
          note: l.note ?? null,
          createdAt: String(l.created_at),
        }
      : null,
    weight,
    breakdown,
    nextUp: next ? { teamMemberId: next.teamMemberId, name: next.name } : null,
    pool: pool
      .filter((p) => p.inPool && p.active)
      .map((p) => ({ teamMemberId: p.teamMemberId, name: p.name, rank: p.rank, load: p.load })),
    steps: [
      { key: "gong", label: "Gong recording on the deal", done: (reports ?? 0) > 0 },
      {
        key: "sow",
        label: "SOW uploaded",
        done: Boolean(dealRow?.sow_document_path || dealRow?.sow_reference),
      },
      {
        key: "welcome",
        label: "Welcome page ready and link created",
        done: Boolean(dealRow?.welcome_issued_at),
      },
    ],
  };
}
