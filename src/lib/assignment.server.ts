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
import type { HandoffNote } from "@/lib/field-fusion";
import { isTrainingOnly, readIntake } from "@/lib/intake-answers";
import { isPreClose } from "@/lib/presale-stages";
import { paperworkOnFile } from "@/lib/won-gate";

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

/**
 * Whether the saved rules let a person take an account for themselves, read
 * strictly from the stored value. Only the exact mode "claim" allows it. A
 * missing setting, an unreadable one, and the "auto" mode each refuse, and each
 * refusal says which it is. This is the one rule the claim server call and the
 * Claim buttons both use.
 */
export type ClaimRulesState = "claim" | "auto" | "missing" | "invalid";

export async function readClaimRulesState(): Promise<ClaimRulesState> {
  const { data, error } = await db()
    .from("portal_app_config")
    .select("value")
    .eq("key", RULES_KEY)
    .maybeSingle();
  if (error)
    throw new Error("Could not read the assignment rules, so nothing was claimed. Try again.");
  if (!data) return "missing";
  const value = data.value as { mode?: unknown } | null;
  if (!value || typeof value !== "object") return "invalid";
  if (value.mode === "claim") return "claim";
  if (value.mode === "auto") return "auto";
  return "invalid";
}

/* -------------------------------------------------------------- pool */

export type PoolRow = PoolMember & {
  email: string | null;
  role: string | null;
  active: boolean;
  inPool: boolean;
  effectiveLoad: number;
  /** Accounts handed to them inside the window — a count, where load is a weight. */
  assignments: number;
  /**
   * What they own today: the active book by claimed owner
   * (src/lib/claimed-owner.ts) — the same count as Reports' "Who carries
   * what". The window's `load` still ranks the rotation.
   */
  owned: number;
  /** Position in the rotation as it stands: 1 is next. Null when not active. */
  rank: number | null;
};

/** Every active team member, with whether they are in rotation and what they carry. */
export async function loadPool(rules?: AssignmentRules): Promise<PoolRow[]> {
  const r = rules ?? (await loadRules());
  const since = new Date(Date.now() - r.window_days * 86_400_000).toISOString();
  const { loadActiveWorkload } = await import("./claimed-owner.server");
  const [{ data: members }, { data: pool }, { data: ledger }, owned] = await Promise.all([
    db().from("team_members").select("id,name,email,role").eq("active", true).order("name"),
    db().from("portal_assignment_pool").select("team_member_id,active,capacity"),
    db()
      .from("portal_assignments")
      .select("team_member_id,weight,created_at")
      .gte("created_at", since),
    loadActiveWorkload().catch((e: unknown) => {
      console.error("[assignment] could not count what each person owns", e);
      return new Map<string, number>();
    }),
  ]);
  const poolBy = new Map<string, { active: boolean; capacity: number }>(
    ((pool ?? []) as any[]).map((p) => [
      String(p.team_member_id),
      { active: Boolean(p.active), capacity: Number(p.capacity) || 1 },
    ]),
  );
  const load = new Map<string, number>();
  const count = new Map<string, number>();
  const last = new Map<string, string>();
  for (const a of (ledger ?? []) as any[]) {
    const id = String(a.team_member_id);
    load.set(id, (load.get(id) ?? 0) + Number(a.weight));
    count.set(id, (count.get(id) ?? 0) + 1);
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
      assignments: count.get(String(m.id)) ?? 0,
      owned: owned.get(String(m.id)) ?? 0,
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
    .select("id,name,arr,intake,customer_id,am_owner_id,stage")
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
    training: isTrainingOnly(intake),
    forWeight: {
      arr: deal.arr === null || deal.arr === undefined ? null : Number(deal.arr),
      seats: intake.field_users,
      integrationTier: topTier || null,
      extraServices: Math.max(0, services.length - (integrations.length ? 1 : 0)),
    },
  };
}

export async function implementationForDeal(dealId: string, customerId: string | null) {
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
 * sends the assignee a short email: the account, the first move, the link.
 */
/** The assignee the rules pick, without writing anything or notifying anyone. */
export type AssigneeChoice =
  | {
      kind: "chosen";
      chosen: PoolRow;
      source: "auto" | "manual";
      weight: number;
      breakdown: WeightBreakdown;
      rules: Awaited<ReturnType<typeof loadRules>>;
      deal: Awaited<ReturnType<typeof dealFacts>>["deal"];
      forWeight: Awaited<ReturnType<typeof dealFacts>>["forWeight"];
      training: Awaited<ReturnType<typeof dealFacts>>["training"];
    }
  | {
      kind: "claim";
      pool: PoolRow[];
      dealName: string;
      weight: number;
      breakdown: WeightBreakdown;
    }
  | { kind: "none" };

/**
 * Who the rules pick for a deal. Reads only: the caller writes the assignment
 * and sends any notice. Shared by assignDeal and the partner handoff, so the
 * two can never pick differently.
 */
export async function chooseAssignee(args: {
  dealId: string;
  teamMemberId?: string | null;
  ownerEmail?: string | undefined;
}): Promise<AssigneeChoice> {
  const rules = await loadRules();
  const { deal, forWeight, training } = await dealFacts(args.dealId);
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
  if (!chosen && rules.mode === "claim") {
    return { kind: "claim", pool, dealName: String(deal.name), weight, breakdown };
  }
  if (!chosen) {
    const ranked = pool
      .filter((p) => p.inPool && p.active)
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    chosen = ranked[0];
    source = "auto";
  }
  if (!chosen) return { kind: "none" };
  return { kind: "chosen", chosen, source, weight, breakdown, rules, deal, forWeight, training };
}

export async function assignDeal(args: {
  dealId: string;
  implementationId?: string | null;
  teamMemberId?: string | null;
  ownerEmail?: string | undefined;
  actorProfileId?: string | null;
  note?: string | null;
  /**
   * Which email the assignee gets. "standard" is the three things to do
   * first; "field_fusion_setup" is the setup checklist before the handoff;
   * "handoff" is the standard message carrying what the setup found.
   */
  message?: "standard" | "field_fusion_setup" | "handoff";
  /** What the Field Fusion setup hands over, for the "handoff" message. */
  handoff?: HandoffNote | null;
  /**
   * Set only by claimDeal, which has already written the project's owner under
   * the condition that it was empty. The owner is not written a second time, so
   * a manager's change made in between is not overwritten.
   */
  ownerAlreadySet?: boolean;
}): Promise<{
  assigneeName: string | null;
  teamMemberId: string;
  weight: number;
  breakdown: WeightBreakdown;
  source: "auto" | "manual";
  notified: boolean;
} | null> {
  const picked = await chooseAssignee({
    dealId: args.dealId,
    teamMemberId: args.teamMemberId ?? null,
    ownerEmail: args.ownerEmail,
  });
  if (picked.kind === "claim") {
    // Nobody is picked for them. The pool is told there is an account to
    // claim, and the deal page offers the claim to whoever opens it.
    await notifyPoolToClaim(picked.pool, {
      dealId: args.dealId,
      dealName: picked.dealName,
      weight: picked.weight,
      breakdown: picked.breakdown,
      handoff: args.handoff ?? null,
    });
    return null;
  }
  if (picked.kind === "none") return null;
  const { chosen, source, weight, breakdown, rules, deal, forWeight, training } = picked;

  const implementationId =
    args.implementationId ?? (await implementationForDeal(args.dealId, deal.customer_id ?? null));
  if (implementationId && !args.ownerAlreadySet) {
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

  // The customer's link exists from the first minute, so the assignee never
  // has to remember to mint it and the email can carry it.
  let shareUrl: string | null = null;
  try {
    const { data: row } = await db()
      .from("portal_accounts")
      .select("welcome_share_url")
      .eq("id", args.dealId)
      .maybeSingle();
    shareUrl = (row?.welcome_share_url as string | null) ?? null;
    if (!shareUrl) {
      const { issueWelcomeLinkUnlessOff } = await import("./welcome.server");
      shareUrl =
        (await issueWelcomeLinkUnlessOff(args.actorProfileId ?? null, args.dealId))?.url ?? null;
    }
  } catch (e) {
    console.error("[assignment] could not issue the customer link", e);
  }

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
        shareUrl,
        training,
        message: args.message ?? "standard",
        handoff: args.handoff ?? null,
      });
      notified = true;
    } catch (e) {
      console.error("[assignment] could not email the assignee", e);
    }
  }

  // The seller hears who their TIS is, so the pairing is one email, not a
  // hunt through the Hub: Sales brings the TIS onto the closing call and
  // books the first meeting for them.
  if (deal.am_owner_id) {
    try {
      await notifyAe({
        aeProfileId: String(deal.am_owner_id),
        assigneeName: chosen.name,
        dealId: args.dealId,
        dealName: String(deal.name),
        preClose: isPreClose(deal.stage as string | null),
      });
    } catch (e) {
      console.error("[assignment] could not email the AE", e);
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
  shareUrl: string | null;
  training: boolean;
  message: "standard" | "field_fusion_setup" | "handoff";
  handoff: HandoffNote | null;
}) {
  const base = appUrl();
  const deal = `${base}/deals/${a.dealId}`;
  const first = a.assigneeName.split(" ")[0] ?? a.assigneeName;

  if (a.message === "field_fusion_setup") {
    await sendEmail({
      kind: "assignment",
      to: a.to,
      subject: `Field Fusion setup: ${a.dealName} — confirm it, then hand it over`,
      html: `
      <div style="font-family:sans-serif;max-width:560px;color:#0a1628">
        <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#039de7;margin:0 0 6px">Field Fusion — before the handoff</p>
        <h2 style="margin:0 0 6px;color:#072b57">${esc(a.dealName)}</h2>
        <p style="margin:0 0 16px;color:#556477">${esc(a.seats ? `${a.seats} seats` : "Field Fusion account")}</p>
        <p>Hi ${esc(first)} — this one just closed and it is a Field Fusion account, so it is yours first. On the deal:</p>
        <ol style="line-height:1.7">
          <li><b>Tick "FFIQ is set up and working"</b> once it is.</li>
          <li><b>Tick "The account is set up"</b> once the customer can log in.</li>
          <li><b>Write what implementation should know</b> — anything the calls did not say — then press <b>Hand to implementation</b>. The use case and goals from the calls go with it.</li>
        </ol>
        <p><a href="${deal}" style="background:#12509b;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">Open the deal</a></p>
        <p style="color:#556477;font-size:13px">The forms are already built, so implementation runs GoCanvas training — three thirty-minute calls over two weeks — not a kickoff. Nothing goes to them until you press the button.</p>
        <p style="font-size:12px;color:#888">GoCanvas Handoff Hub</p>
      </div>`,
    });
    return;
  }

  // Short on purpose: you have a new implementation, here is your first
  // move, go. The Hub takes it from there — the workspace answers the rest.
  // A handoff is never forced into the fixed training-session copy below —
  // its own next action is whatever the deal's checklist says, Kickoff
  // included, not a promised number of calls.
  const training = a.training && a.message !== "handoff";
  const firstMove =
    a.message === "handoff"
      ? "Book the kickoff call — it's the one open step waiting on the deal."
      : "Add the Gong brief and the SOW; the AI reads both and fills in the rest.";
  await sendEmail({
    kind: "assignment",
    to: a.to,
    subject:
      a.message === "handoff"
        ? `Handed to you: ${a.dealName}`
        : `New implementation: ${a.dealName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;color:#0a1628">
        <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#039de7;margin:0 0 6px">${a.message === "handoff" ? "Handed to you" : "New implementation"}</p>
        <h2 style="margin:0 0 14px;color:#072b57">${esc(a.dealName)}</h2>
        <p>Hi ${esc(first)} — this one is yours.</p>
        ${handoffBlock(a.handoff)}
        <p><b>First move:</b> ${esc(firstMove)}</p>
        <p style="margin:18px 0"><a href="${deal}" style="background:#12509b;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">Open it in the Hub</a></p>
        <p style="color:#556477;font-size:13px">${
          training
            ? "Three thirty-minute sessions over two weeks. The Hub shows what to do next at each step."
            : "The Hub shows what to do next at each step — where you are, what is on you, what is on them."
        }</p>
        <p style="font-size:12px;color:#888">GoCanvas Handoff Hub</p>
      </div>`,
  });
}

/**
 * Tell the seller who their TIS is. Before the close: bring them onto the
 * closing call and book the first meeting. After: the TIS takes it from here.
 */
async function notifyAe(a: {
  aeProfileId: string;
  assigneeName: string;
  dealId: string;
  dealName: string;
  preClose: boolean;
}) {
  const { data: ae } = await db()
    .from("portal_profiles")
    .select("email,full_name")
    .eq("id", a.aeProfileId)
    .maybeSingle();
  const to = (ae?.email as string | null) ?? null;
  if (!to) return;
  const first = ((ae?.full_name as string | null) ?? "").split(" ")[0] || "there";
  const deal = `${appUrl()}/deals/${a.dealId}`;
  await sendEmail({
    kind: "assignment",
    to,
    subject: `Your TIS for ${a.dealName}: ${a.assigneeName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;color:#0a1628">
        <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#039de7;margin:0 0 6px">Implementation</p>
        <h2 style="margin:0 0 14px;color:#072b57">${esc(a.dealName)}</h2>
        <p>Hi ${esc(first)} — <b>${esc(a.assigneeName)}</b> is the TIS for this one.</p>
        ${
          a.preClose
            ? `<p>Two things from you before the close:</p>
        <ol style="line-height:1.7">
          <li>Bring ${esc(a.assigneeName)} onto the closing call.</li>
          <li>Book the customer's first implementation meeting for them — ideally on that call — and note the launch date the customer wants.</li>
        </ol>
        <p>Then fill in the handoff on the deal: what was bought, what was promised, who the contacts are, and anything still open.</p>`
            : `<p>They take it from here. The handoff on the deal is where what was bought, promised and left open should live — check it is complete.</p>`
        }
        <p style="margin:18px 0"><a href="${deal}" style="background:#12509b;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">Open the deal</a></p>
        <p style="font-size:12px;color:#888">GoCanvas Handoff Hub</p>
      </div>`,
  });
}

/** The setup's handoff, as a boxed note in the assignee's email. Empty when there is none. */
function handoffBlock(h: HandoffNote | null): string {
  if (!h) return "";
  const goals = h.goals.length
    ? `<p style="margin:8px 0 2px"><b>Goals, from the calls</b></p><ul style="margin:0 0 0 18px;padding:0;line-height:1.6">${h.goals
        .slice(0, 6)
        .map((g) => `<li>${esc(g)}</li>`)
        .join("")}</ul>`
    : "";
  const useCase = h.useCase
    ? `<p style="margin:8px 0 2px"><b>Use case</b><br/>${esc(h.useCase)}</p>`
    : "";
  const notes = h.notes
    ? `<p style="margin:8px 0 2px"><b>From ${esc(h.from)}, on the setup</b><br/>${esc(h.notes).replaceAll("\n", "<br/>")}</p>`
    : "";
  if (!goals && !useCase && !notes)
    return `<p style="margin:12px 0;padding:10px 12px;border-radius:8px;background:#fff7e6;color:#072b57;font-size:13px">Field Fusion is set up and working — ${esc(h.from)} confirmed it. The calls did not give a use case or goals; ask on the training call.</p>`;
  return `<div style="margin:12px 0;padding:10px 12px;border-radius:8px;background:#fff7e6;color:#072b57;font-size:13px"><p style="margin:0"><b>Field Fusion is set up and working</b> — ${esc(h.from)} confirmed it and handed this over.</p>${useCase}${goals}${notes}</div>`;
}

/* ------------------------------------------ what the deal page shows */

export type DealAssignment = {
  mode: "auto" | "claim";
  /**
   * Whether someone in the pool may take this account now: the saved rules are
   * in claim mode, the deal has a project, and that project has no owner. The
   * Claim buttons show from this, and claimDeal enforces the same rules.
   */
  claimable: boolean;
  owner: { teamMemberId: string; name: string; email: string | null } | null;
  last: AssignmentRow | null;
  weight: number;
  breakdown: WeightBreakdown;
  nextUp: { teamMemberId: string; name: string } | null;
  pool: Array<{
    teamMemberId: string;
    name: string;
    email: string | null;
    rank: number | null;
    load: number;
  }>;
  /**
   * Who the owner picker offers (QA 20.1): the rotation, team members whose
   * role owns implementations (OWNER_ROLES), anyone carrying active-book
   * work, and whoever owns this deal now — so the picker never hides the
   * name the header shows.
   */
  members: Array<{
    teamMemberId: string;
    name: string;
    email: string | null;
    inPool: boolean;
    rank: number | null;
    load: number;
    /** Accounts handed to them in the window. */
    assignments: number;
    /** What they own today, the active book (src/lib/claimed-owner.ts). */
    owned: number;
  }>;
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

  const [{ data: ledger }, { count: reports }, { data: dealRow }, { data: liveProjects }] =
    await Promise.all([
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
        .select("sow_document_path,sow_document_url,sow_reference,intake,welcome_issued_at")
        .eq("id", dealId)
        .maybeSingle(),
      db()
        .from("implementations")
        .select("id")
        .eq("deal_id", dealId)
        .is("superseded_by_implementation_id", null)
        .limit(1),
    ]);
  const l = (ledger ?? [])[0] as any;
  // Before Start onboarding there is no project to carry the owner, so a
  // claim or a hand-pick lives only in the ledger. Read it from there, or
  // the person who just claimed sees "Unassigned" and clicks again. Once the
  // deal has its own project, that project's owner decides, empty included
  // (the one owner rule, src/lib/claimed-owner.ts): an owner cleared on the
  // customer page stays cleared.
  if (!owner && l?.team_member_id && (liveProjects ?? []).length === 0) {
    const id = String(l.team_member_id);
    const m = pool.find((p) => p.teamMemberId === id);
    owner = {
      teamMemberId: id,
      name: m?.name ?? (l.team_members?.name as string | undefined) ?? "Assigned",
      email: m?.email ?? null,
    };
  }
  const next = rules.mode === "claim" ? null : (pool.find((p) => p.rank === 1) ?? null);
  const claimable =
    (await readClaimRulesState()) === "claim" && Boolean(implementationId) && !owner;
  return {
    mode: rules.mode,
    claimable,
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
      .map((p) => ({
        teamMemberId: p.teamMemberId,
        name: p.name,
        email: p.email,
        rank: p.rank,
        load: p.load,
      })),
    members: pickerMembers(pool, owner?.teamMemberId ?? null).map((p) => ({
      teamMemberId: p.teamMemberId,
      name: p.name,
      email: p.email,
      inPool: p.inPool && p.active,
      rank: p.rank,
      load: p.load,
      assignments: p.assignments,
      owned: p.owned,
    })),
    steps: [
      { key: "gong", label: "Gong recording on the deal", done: (reports ?? 0) > 0 },
      {
        key: "sow",
        label: "SOW or contract on file",
        done: dealRow ? paperworkOnFile(dealRow) !== null : false,
      },
      {
        key: "welcome",
        label: "Welcome page ready — the customer's link is in your email",
        done: Boolean(dealRow?.welcome_issued_at),
      },
    ],
  };
}

/** Team roles that own implementations, besides whoever is in the rotation. */
export const OWNER_ROLES: ReadonlyArray<string> = [
  "tis",
  "implementation",
  "onboarding",
  "manager",
];

/**
 * The owner picker's people: the rotation, the implementation roles, anyone
 * who owns active-book work today (`owned`, by the one owner rule: an admin
 * who carries projects is an owner whatever their team role says), and the
 * current owner wherever they sit (a Field Fusion setup owner who is an SE).
 * Sales, TAMs and admins outside the rotation who own nothing are not offered.
 */
export function pickerMembers<
  T extends {
    teamMemberId: string;
    role: string | null;
    inPool: boolean;
    active: boolean;
    owned?: number;
  },
>(pool: ReadonlyArray<T>, currentOwnerId: string | null): T[] {
  return pool.filter(
    (p) =>
      (p.inPool && p.active) ||
      OWNER_ROLES.includes((p.role ?? "").trim().toLowerCase()) ||
      (p.owned ?? 0) > 0 ||
      p.teamMemberId === currentOwnerId,
  );
}

/* ------------------------------------------------------------- claim */

/**
 * The caller takes the account for themselves. Allowed only when the saved rules
 * are in claim mode. The caller must also be in the pool, matched by the email on
 * their profile, and the account must have a project with no owner yet.
 *
 * The owner is written with a condition that the project has none, so of two
 * people claiming at once only one succeeds. Nothing is written unless every
 * check passes. A manager's assignment is a separate path (assignDeal) and is
 * not affected by these rules.
 */
export async function claimDeal(profileId: string, dealId: string) {
  const { data: profile } = await db()
    .from("portal_profiles")
    .select("email")
    .eq("id", profileId)
    .maybeSingle();
  const email = String(profile?.email ?? "").toLowerCase();
  if (!email) throw new Error("No profile for this sign-in");

  const state = await readClaimRulesState();
  if (state === "missing") {
    throw new Error(
      "No assignment rules are saved, so accounts cannot be claimed. A manager assigns this account.",
    );
  }
  if (state === "invalid") {
    throw new Error(
      "The assignment rules are not valid, so accounts cannot be claimed until a manager saves them again.",
    );
  }
  if (state === "auto") {
    throw new Error(
      "Accounts are assigned by a manager in this workspace, so you cannot claim this one. Ask a manager to assign it.",
    );
  }

  const pool = await loadPool();
  const me = pool.find((p) => p.inPool && p.active && (p.email ?? "").toLowerCase() === email);
  if (!me) {
    throw new Error(
      "You are not in the assignment pool. A manager adds people under Admin → Assignment.",
    );
  }

  const { data: deal } = await db()
    .from("portal_accounts")
    .select("customer_id")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) throw new Error("Deal not found");
  const implementationId = await implementationForDeal(
    dealId,
    (deal.customer_id as string | null) ?? null,
  );
  if (!implementationId) {
    throw new Error("This deal has no project yet, so it cannot be claimed. A manager assigns it.");
  }

  // The condition is part of the write: the owner is set only if the project
  // still has none. A second claim, or a manager's change, that lands first
  // leaves this write with nothing to update.
  const { data: taken, error: takeError } = await db()
    .from("implementations")
    .update({ owner_id: me.teamMemberId })
    .eq("id", implementationId)
    .is("owner_id", null)
    .select("id");
  if (takeError) throw new Error(`Could not take the account: ${takeError.message}`);
  if (!taken || taken.length === 0) {
    const current = await dealAssignment(dealId);
    throw new Error(
      current.owner
        ? `${current.owner.name} already owns this account.`
        : "This account was just taken, so it cannot be claimed. Reload to see who owns it.",
    );
  }

  return assignDeal({
    dealId,
    implementationId,
    teamMemberId: me.teamMemberId,
    actorProfileId: profileId,
    note: `Claimed by ${me.name}`,
    ownerAlreadySet: true,
  });
}

/**
 * In claim mode nobody is picked, so the pool has to hear that an account
 * is waiting. One email to everyone in rotation, with the deal and its
 * weight; the first to open it and press Claim takes it.
 */
async function notifyPoolToClaim(
  pool: PoolRow[],
  deal: {
    dealId: string;
    dealName: string;
    weight: number;
    breakdown: WeightBreakdown;
    handoff?: HandoffNote | null;
  },
): Promise<void> {
  const to = pool.filter((p) => p.inPool && p.active && p.email).map((p) => p.email as string);
  if (to.length === 0) return;
  const url = `${appUrl()}/deals/${deal.dealId}`;
  for (const email of to) {
    try {
      await sendEmail({
        // An assignment message, not a notification: the rule that holds
        // notifications back from non-managers would have kept every pool
        // member who is not a manager from ever seeing it.
        kind: "assignment",
        to: email,
        subject: `New account to claim: ${deal.dealName}`,
        html: `
        <div style="font-family:sans-serif;max-width:560px;color:#0a1628">
          <h2 style="color:#072b57;margin:0 0 8px">${escapeHtml(deal.dealName)} just closed</h2>
          <p style="font-size:14px;line-height:1.6">
            Nobody owns it yet. Weight ${deal.weight} · ${escapeHtml(describeBreakdown(deal.breakdown))}.
            Open it and press <b>Claim this account</b> if it is yours.
          </p>
          ${handoffBlock(deal.handoff ?? null)}
          <div style="margin:20px 0">
            <a href="${url}" style="background:#12509b;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">Open the deal</a>
          </div>
          <p style="font-size:12px;color:#556477">GoCanvas Handoff Hub</p>
        </div>`,
      });
    } catch (e) {
      console.error("[assignment] could not notify the pool", e);
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** See assignment.functions.ts removeTeamMember. */
export async function removeTeamMember(
  teamMemberId: string,
): Promise<{ removed: true; name: string }> {
  const { data: member } = await db()
    .from("team_members")
    .select("id,name")
    .eq("id", teamMemberId)
    .maybeSingle();
  if (!member) throw new Error("That person is not on the team.");
  const name = String(member.name);

  const [{ count: owned }, { data: login }] = await Promise.all([
    db()
      .from("implementations")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", teamMemberId)
      .neq("current_stage", "graduate-to-cs"),
    db().from("portal_profiles").select("id").eq("team_member_id", teamMemberId).maybeSingle(),
  ]);
  // A deal claimed before its project exists is owned only through the
  // ledger (the one owner rule, src/lib/claimed-owner.ts). Count those too,
  // or the removed person stays the deal's TIS on every page.
  const claimedOnly = await ledgerOnlyDealsOwnedBy(teamMemberId);
  const total = (owned ?? 0) + claimedOnly;
  if (total > 0) {
    throw new Error(
      `${name} still owns ${total} account${total === 1 ? "" : "s"}. Reassign them first, then remove.`,
    );
  }
  if (login) {
    throw new Error(`${name} has a login. Remove the user under Admin → Users first.`);
  }

  const { error } = await db()
    .from("team_members")
    .update({ active: false })
    .eq("id", teamMemberId);
  if (error) throw new Error(`Could not remove ${name}: ${error.message}`);
  // Out of the rotation too, so the rule never picks a name that is gone.
  await db().from("portal_assignment_pool").delete().eq("team_member_id", teamMemberId);
  await audit({
    actor_type: "user",
    actor_id: null,
    action: "team.member_removed",
    entity_type: "team_member",
    entity_id: teamMemberId,
    payload: { name },
  });
  return { removed: true, name };
}

/**
 * Deals not yet graduated whose claimed owner is this person through the
 * ledger alone (no project yet). Projects are counted by owner_id already.
 */
async function ledgerOnlyDealsOwnedBy(teamMemberId: string): Promise<number> {
  const { data: ledger, error } = await db()
    .from("portal_assignments")
    .select("deal_id")
    .eq("team_member_id", teamMemberId);
  if (error) throw new Error(`Could not read the claim ledger: ${error.message}`);
  const dealIds = [
    ...new Set(((ledger ?? []) as Array<{ deal_id: string | null }>).map((r) => r.deal_id)),
  ].filter((id): id is string => Boolean(id));
  if (dealIds.length === 0) return 0;
  const [{ loadClaimedOwners }, { GRADUATED_STAGE }, { data: deals, error: dealError }] =
    await Promise.all([
      import("./claimed-owner.server"),
      import("./claimed-owner"),
      db().from("portal_accounts").select("id,stage").in("id", dealIds),
    ]);
  if (dealError) throw new Error(`Could not read the deals: ${dealError.message}`);
  const owners = await loadClaimedOwners(dealIds);
  return ((deals ?? []) as Array<{ id: string; stage: string | null }>).filter((d) => {
    const o = owners.get(String(d.id));
    return o?.source === "ledger" && o.id === teamMemberId && d.stage !== GRADUATED_STAGE;
  }).length;
}
