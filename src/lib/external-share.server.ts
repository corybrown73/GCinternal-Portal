import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isFlagOn } from "./app-config.server";
import { audit } from "./server/audit";
import { sendEmail } from "./server/email";
import { CONFIG_DEFAULTS, getConfigNumber } from "./server/app-config";
import { generatePlanToken, hashPasscode } from "./server/plan-tokens";
import { loadSharedPlan, type ExternalViewer } from "./server/external-viewer";
import { recordPlanEvent } from "./external-plan.server";
import type { SharedPlan } from "./shared-plan";
import { appUrl } from "./app-url";

/**
 * The internal side of external access: issue, revoke, rotate, set a passcode,
 * see who opened what — and preview the customer's view.
 *
 * Authorization is app-side and role-based (`canManageExternalAccess`), never
 * flag-gated: issuing a credential to someone outside the company is not a
 * feature switch. Every write here is audited with the staff member who did it.
 *
 * Grants cannot be written from a browser session at all — 0019 grants no
 * insert/update/delete policy to any role — so this module, on the service
 * role, is the only path that exists.
 */

const db = () => supabaseAdmin as any;

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Same shape as canEditSequences: managers, admins and the delivery roles. */
export function canManageExternalAccess(role: string): boolean {
  return ["admin", "super_admin", "manager", "implementation", "onboarding"].includes(role);
}

export function requireManage(role: string): void {
  if (!canManageExternalAccess(role)) {
    throw new Error("Forbidden: your role cannot issue or revoke customer links");
  }
}

/* ------------------------------------------------------------------------- */
/* Panel                                                                      */
/* ------------------------------------------------------------------------- */

export type ShareGrantRow = {
  id: string;
  email: string;
  contact_name: string | null;
  token_prefix: string;
  can_complete: boolean;
  has_passcode: boolean;
  expires_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  created_via: string;
  created_by_name: string | null;
  created_at: string;
  last_opened_at: string | null;
  open_count: number;
  /** True when this grant replaced an earlier one, or was reassigned from one. */
  from_parent: boolean;
  live: boolean;
};

export type ShareEventRow = {
  id: string;
  event: string;
  at: string;
  who: string | null;
  detail: string | null;
};

export type SharePanel = {
  /**
   * False when `external_plan_view_enabled` is off. The panel then renders an
   * explanatory line instead of its controls, matching every other Phase 4
   * surface and the plan/handoff panels before it.
   *
   * This guard is not cosmetic. Everything below reads schema that only exists
   * once 0019-0022 are applied — `implementations.portal_key`,
   * `external_access_grants`, `external_plan_events`. Without it, a deploy that
   * lands before its migrations takes out the whole Customer 360, because this
   * panel renders on every implementation unconditionally.
   */
  enabled: boolean;
  implementation_id: string;
  portal_key: string;
  grants: ShareGrantRow[];
  events: ShareEventRow[];
  contacts: Array<{ id: string; name: string; email: string | null }>;
  /** Default TTL offered by the issue form, read from portal_app_config. */
  default_ttl_days: number;
};

const DISABLED_PANEL: SharePanel = {
  enabled: false,
  implementation_id: "",
  portal_key: "",
  grants: [],
  events: [],
  contacts: [],
  default_ttl_days: 0,
};

export async function loadSharePanel(implementationId: string): Promise<SharePanel> {
  // Checked BEFORE any query, so nothing here touches 0019-0022's schema while
  // the flag is off.
  if (!(await isFlagOn("external_plan_view_enabled"))) return DISABLED_PANEL;

  const { data: impl } = await db()
    .from("implementations")
    .select("id, customer_id, portal_key")
    .eq("id", implementationId)
    .maybeSingle();
  if (!impl) throw new Error("No such implementation");

  const [{ data: grants }, { data: events }, { data: contacts }, ttl] = await Promise.all([
    db()
      .from("external_access_grants")
      .select(
        "id, email, contact_id, token_prefix, can_complete, passcode_hash, expires_at, revoked_at, revoke_reason, created_via, created_by, created_at, last_opened_at, open_count, parent_grant_id, superseded_by",
      )
      .eq("implementation_id", implementationId)
      .order("created_at", { ascending: false }),
    db()
      .from("external_plan_events")
      .select("id, event, created_at, contact_id, grant_id, metadata")
      .eq("implementation_id", implementationId)
      .order("created_at", { ascending: false })
      .limit(50),
    db()
      .from("customer_contacts")
      .select("id, name, email")
      .eq("customer_id", impl.customer_id)
      .order("name"),
    getConfigNumber("external_plan_link_ttl_days", CONFIG_DEFAULTS.external_plan_link_ttl_days),
  ]);

  const contactName = new Map<string, string>(
    ((contacts ?? []) as any[]).map((c) => [c.id, c.name]),
  );
  const profileIds = [
    ...new Set(((grants ?? []) as any[]).map((g) => g.created_by).filter((x): x is string => !!x)),
  ];
  const { data: profiles } = profileIds.length
    ? await db().from("portal_profiles").select("id, full_name, email").in("id", profileIds)
    : { data: [] };
  const profileName = new Map<string, string>(
    ((profiles ?? []) as any[]).map((p) => [p.id, p.full_name || p.email]),
  );

  const now = Date.now();
  return {
    enabled: true,
    implementation_id: implementationId,
    portal_key: impl.portal_key,
    default_ttl_days: ttl,
    contacts: (contacts ?? []) as any[],
    grants: ((grants ?? []) as any[]).map((g) => ({
      id: g.id,
      email: g.email,
      contact_name: g.contact_id ? (contactName.get(g.contact_id) ?? null) : null,
      token_prefix: g.token_prefix,
      can_complete: g.can_complete,
      has_passcode: !!g.passcode_hash,
      expires_at: g.expires_at,
      revoked_at: g.revoked_at,
      revoke_reason: g.revoke_reason,
      created_via: g.created_via,
      created_by_name: g.created_by ? (profileName.get(g.created_by) ?? null) : null,
      created_at: g.created_at,
      last_opened_at: g.last_opened_at,
      open_count: g.open_count,
      from_parent: !!g.parent_grant_id,
      live: !g.revoked_at && new Date(g.expires_at).getTime() > now,
    })),
    events: ((events ?? []) as any[]).map((e) => ({
      id: e.id,
      event: e.event,
      at: e.created_at,
      who: e.contact_id ? (contactName.get(e.contact_id) ?? null) : null,
      detail:
        (e.metadata && (e.metadata.title || e.metadata.file_name || e.metadata.to_email)) ?? null,
    })),
  };
}

/* ------------------------------------------------------------------------- */
/* Issue / revoke / rotate / passcode                                         */
/* ------------------------------------------------------------------------- */

export type IssueInput = {
  implementationId: string;
  contactId?: string | null;
  email?: string | null;
  name?: string | null;
  canComplete: boolean;
  passcode?: string | null;
  ttlDays?: number | null;
  sendEmailToContact: boolean;
};

/**
 * Mint a link.
 *
 * The raw token is returned to the issuing staff member EXACTLY once and is
 * never stored, logged or audited — the same contract as an API key
 * (src/lib/server/api-auth.ts). What is stored is its sha256 and a 12-character
 * prefix so the panel can name the link without holding it.
 */
export async function issueGrant(
  input: IssueInput,
  actor: { id: string; role: string; name: string },
): Promise<{ id: string; url: string; prefix: string; expires_at: string }> {
  requireManage(actor.role);

  const { data: impl } = await db()
    .from("implementations")
    .select("id, customer_id, name")
    .eq("id", input.implementationId)
    .maybeSingle();
  if (!impl) throw new Error("No such implementation");

  let contactId = input.contactId ?? null;
  let email = (input.email ?? "").trim().toLowerCase();

  if (contactId) {
    const { data: contact } = await db()
      .from("customer_contacts")
      .select("id, customer_id, email, name")
      .eq("id", contactId)
      .maybeSingle();
    // A contact from another account is not a typo to tolerate — it is the one
    // mistake that would send a customer's plan to a different customer.
    if (!contact || contact.customer_id !== impl.customer_id) {
      throw new Error("That contact does not belong to this customer");
    }
    email = (contact.email ?? email).trim().toLowerCase();
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("A valid email address is required");
  }
  if (!contactId) {
    const { data: existing } = await db()
      .from("customer_contacts")
      .select("id")
      .eq("customer_id", impl.customer_id)
      .ilike("email", email)
      .maybeSingle();
    if (existing) {
      contactId = existing.id;
    } else {
      const { data: created, error } = await db()
        .from("customer_contacts")
        .insert({
          customer_id: impl.customer_id,
          name: (input.name ?? email).trim() || email,
          role: "Plan link recipient",
          email,
        })
        .select("id")
        .single();
      if (error || !created) throw new Error("Could not create the contact");
      contactId = created.id;
    }
  }

  const defaultTtl = await getConfigNumber(
    "external_plan_link_ttl_days",
    CONFIG_DEFAULTS.external_plan_link_ttl_days,
  );
  const ttlDays = Math.min(Math.max(input.ttlDays ?? defaultTtl, 1), 365);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  const minted = generatePlanToken();
  const { data: created, error } = await db()
    .from("external_access_grants")
    .insert({
      implementation_id: impl.id,
      customer_id: impl.customer_id,
      contact_id: contactId,
      email,
      token_hash: minted.hash,
      token_prefix: minted.prefix,
      can_complete: input.canComplete,
      passcode_hash: input.passcode ? hashPasscode(input.passcode) : null,
      expires_at: expiresAt,
      created_by: actor.id,
      created_via: "internal",
    })
    .select("id")
    .single();
  if (error || !created)
    throw new Error(`Could not issue the link: ${error?.message ?? "unknown"}`);

  await audit({
    actor_type: "user",
    actor_id: actor.id,
    action: "external.grant_issued",
    entity_type: "implementation",
    entity_id: impl.id,
    // Prefix only. The token itself exists in exactly two places: the response
    // to this call, and the recipient's inbox.
    payload: {
      email,
      prefix: minted.prefix,
      expires_at: expiresAt,
      can_complete: input.canComplete,
    },
  });

  const url = `${appUrl()}/plan/${minted.token}`;
  if (input.sendEmailToContact) {
    await sendEmail({
      to: email,
      subject: `Your onboarding plan — ${impl.name}`,
      html:
        `<p>Here is your onboarding plan with GoCanvas.</p>` +
        `<p><a href="${url}">Open your plan</a></p>` +
        (input.passcode
          ? `<p>You will need the passcode ${escapeHtml(actor.name)} gave you separately.</p>`
          : "") +
        `<p style="color:#666">This link is personal to you and expires ${escapeHtml(expiresAt.slice(0, 10))}.</p>`,
    });
  }

  return { id: created.id, url, prefix: minted.prefix, expires_at: expiresAt };
}

export async function revokeGrant(
  grantId: string,
  actor: { id: string; role: string },
  reason: "manual" | "rotated" = "manual",
): Promise<{ ok: true }> {
  requireManage(actor.role);
  const { data: grant } = await db()
    .from("external_access_grants")
    .select("id, implementation_id, contact_id, email, revoked_at")
    .eq("id", grantId)
    .maybeSingle();
  if (!grant) throw new Error("No such link");
  if (grant.revoked_at) return { ok: true };

  await db()
    .from("external_access_grants")
    .update({ revoked_at: new Date().toISOString(), revoked_by: actor.id, revoke_reason: reason })
    .eq("id", grantId);

  await recordPlanEvent({
    grantId,
    implementationId: grant.implementation_id,
    contactId: grant.contact_id,
    event: reason === "rotated" ? "grant_rotated" : "grant_revoked",
  });
  await audit({
    actor_type: "user",
    actor_id: actor.id,
    action: reason === "rotated" ? "external.grant_rotated" : "external.grant_revoked",
    entity_type: "implementation",
    entity_id: grant.implementation_id,
    payload: { email: grant.email },
  });
  return { ok: true };
}

/**
 * Rotate = issue a new link and revoke the old one, pointing each at the other.
 *
 * Renewal is always a rotation because `expires_at` is trigger-immutable: the
 * row has to stay evidence of what was actually issued, so extending access
 * means a new row, not an edited one.
 */
export async function rotateGrant(
  grantId: string,
  actor: { id: string; role: string; name: string },
  ttlDays?: number | null,
): Promise<{ id: string; url: string; prefix: string; expires_at: string }> {
  requireManage(actor.role);
  const { data: old } = await db()
    .from("external_access_grants")
    .select("id, implementation_id, contact_id, email, can_complete, passcode_hash")
    .eq("id", grantId)
    .maybeSingle();
  if (!old) throw new Error("No such link");

  const issued = await issueGrant(
    {
      implementationId: old.implementation_id,
      contactId: old.contact_id,
      email: old.email,
      canComplete: old.can_complete,
      passcode: null,
      ttlDays: ttlDays ?? null,
      sendEmailToContact: true,
    },
    actor,
  );

  // Carry the passcode forward without ever learning it: the hash moves, the
  // secret does not.
  if (old.passcode_hash) {
    await db()
      .from("external_access_grants")
      .update({ passcode_hash: old.passcode_hash })
      .eq("id", issued.id);
  }

  await revokeGrant(grantId, actor, "rotated");
  await db().from("external_access_grants").update({ superseded_by: issued.id }).eq("id", grantId);
  return issued;
}

export async function setGrantPasscode(
  grantId: string,
  passcode: string | null,
  actor: { id: string; role: string },
): Promise<{ ok: true }> {
  requireManage(actor.role);
  const { data: grant } = await db()
    .from("external_access_grants")
    .select("id, implementation_id, email")
    .eq("id", grantId)
    .maybeSingle();
  if (!grant) throw new Error("No such link");

  await db()
    .from("external_access_grants")
    .update({
      passcode_hash: passcode ? hashPasscode(passcode) : null,
      passcode_attempts: 0,
      locked_until: null,
    })
    .eq("id", grantId);

  await audit({
    actor_type: "user",
    actor_id: actor.id,
    action: passcode ? "external.passcode_set" : "external.passcode_cleared",
    entity_type: "implementation",
    entity_id: grant.implementation_id,
    payload: { email: grant.email },
  });
  return { ok: true };
}

/* ------------------------------------------------------------------------- */
/* Internal preview                                                           */
/* ------------------------------------------------------------------------- */

/**
 * What the customer sees, rendered for staff.
 *
 * Deliberately NOT an AuthGate exemption: the gate bounces internal users off
 * /portal/* and stays untouched. This renders the same component from the same
 * projection with a read-only viewer, so staff see byte-for-byte what the
 * customer sees without any exception to the auth model.
 */
export async function previewPlan(
  implementationId: string,
  profileId: string,
): Promise<SharedPlan> {
  const { data: impl } = await db()
    .from("implementations")
    .select("portal_key")
    .eq("id", implementationId)
    .maybeSingle();
  if (!impl) throw new Error("No such implementation");
  const viewer: ExternalViewer = { kind: "preview", profileId };
  return loadSharedPlan(viewer, impl.portal_key);
}
