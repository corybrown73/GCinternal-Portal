import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { audit } from "./server/audit";
import { sendEmail } from "./server/email";

const db = () => supabaseAdmin as any;

function appUrl(): string {
  return process.env["APP_URL"] ?? "http://localhost:3000";
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Adding a teammate.
 *
 * Deliberately built as the SAME shape as the customer invite in
 * `access.server.ts`: record the row first, then mint a link, then send a
 * branded email. The order matters — the `portal_user_invites` row is what the
 * signup trigger reads to assign the role and to admit an address the domain
 * allowlist would refuse, so it has to exist before the person can possibly
 * click anything.
 *
 * The failure this ordering prevents: an invite email arriving for somebody
 * whose row was never written, so they sign up, get refused for being on the
 * wrong domain, and have no idea why.
 *
 * What this module does NOT do is change anybody's role after the fact. Roles
 * move through `setProfileRole`, which writes as the caller so
 * `portal_guard_role_change` can see an admin. Letting the service role assign
 * roles here would mean a leaked service key could make itself an admin.
 */

/** Roles somebody can be invited AS. `customer` is absent — see 0030. */
export const INVITABLE_ROLES = [
  "manager",
  "sales",
  "implementation",
  "tam_se",
  "super_admin",
] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const INVITE_TTL_DAYS = 14;

export type PendingInvite = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  expires_at: string;
  expired: boolean;
  invited_by_name: string | null;
};

export class InviteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteError";
  }
}

export async function listPendingInvites(): Promise<PendingInvite[]> {
  const { data } = await db()
    .from("portal_user_invites")
    .select("id, email, full_name, role, created_at, expires_at, invited_by")
    .is("accepted_at", null)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as any[];
  const inviterIds = [...new Set(rows.map((r) => r.invited_by).filter(Boolean))];
  const names = new Map<string, string>();
  if (inviterIds.length > 0) {
    const { data: profiles } = await db()
      .from("portal_profiles")
      .select("id, full_name, email")
      .in("id", inviterIds);
    for (const p of (profiles ?? []) as any[]) names.set(p.id, p.full_name || p.email);
  }

  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    full_name: r.full_name ?? null,
    role: r.role,
    created_at: r.created_at,
    expires_at: r.expires_at,
    // Computed, not stored. An expired invite still has a row — it is evidence
    // that somebody was invited — and the list has to show it as dead rather
    // than hide it, or an admin re-invites into silence.
    expired: new Date(r.expires_at).getTime() <= now,
    invited_by_name: r.invited_by ? (names.get(r.invited_by) ?? null) : null,
  }));
}

/**
 * The result says what actually happened, because the two outcomes need
 * different things from the admin.
 *
 * `emailed: true` — done, tell them to check their inbox.
 * `emailed: false` — the row is written and the invite WILL work when they sign
 * up; the mail did not go out. That is a real, common state (no RESEND_API_KEY
 * in this deployment) and reporting it as success would leave an admin waiting
 * for an email nobody sent.
 */
export type InviteResult = {
  emailed: boolean;
  email: string;
  /** Present when the mail failed, so the admin can pass the link on by hand. */
  link: string | null;
  reason: string | null;
};

export async function inviteUser(
  inviter: { id: string; full_name: string | null; email: string },
  input: { email: string; fullName: string | null; role: InvitableRole },
): Promise<InviteResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new InviteError("Enter a valid email address.");
  }
  if (!INVITABLE_ROLES.includes(input.role)) {
    throw new InviteError("Unknown role.");
  }

  // Already staff? Re-inviting them would do nothing useful — the signup
  // trigger only fires for a NEW auth user — so say so instead of writing a row
  // that will never be read.
  const { data: existingProfile } = await db()
    .from("portal_profiles")
    .select("id, role")
    .eq("email", email)
    .maybeSingle();
  if (existingProfile) {
    throw new InviteError(
      `${email} already has an account here. Change their role in the table below instead.`,
    );
  }

  const fullName = input.fullName?.trim() || null;
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString();

  // Select-then-insert-or-update rather than upsert: the uniqueness that
  // matters is a PARTIAL index (pending invites only), and a column-list
  // ON CONFLICT cannot use a partial index as its arbiter.
  const { data: pending } = await db()
    .from("portal_user_invites")
    .select("id")
    .eq("email", email)
    .is("accepted_at", null)
    .maybeSingle();

  const patch = {
    full_name: fullName,
    role: input.role,
    invited_by: inviter.id,
    // Re-inviting restarts the clock. The alternative — a re-invite that is
    // already expired — is the most confusing possible outcome of pressing a
    // button called "Resend".
    expires_at: expiresAt,
  };

  const { error: writeError } = pending
    ? await db().from("portal_user_invites").update(patch).eq("id", pending.id)
    : await db()
        .from("portal_user_invites")
        .insert({ email, ...patch, created_at: new Date().toISOString() });
  if (writeError) throw new InviteError(`Could not record the invite: ${writeError.message}`);

  const { emailed, link, reason } = await deliver(email, fullName, inviter);

  await audit({
    actor_type: "user",
    actor_id: inviter.id,
    action: "profile.invited",
    entity_type: "user_invite",
    entity_id: email,
    payload: { role: input.role, emailed, reason },
  });

  return { emailed, email, link, reason };
}

/**
 * Mint the link and send it.
 *
 * Never throws. The invite row is already written and is the thing that makes
 * the account work; failing the whole request because an email provider is
 * unconfigured would leave the admin thinking nothing happened, when in fact
 * the person can sign up right now and will get the right role.
 */
async function deliver(
  email: string,
  fullName: string | null,
  inviter: { full_name: string | null; email: string },
): Promise<{ emailed: boolean; link: string | null; reason: string | null }> {
  const redirectTo = `${appUrl()}/auth/callback`;
  const admin = supabaseAdmin as any;
  let actionLink: string | null = null;

  try {
    // 'invite' creates the auth user. Correct here: the invite row above
    // exempts this address from the domain allowlist, so the signup trigger
    // will accept it. Falls back to 'magiclink' for an address that already has
    // an auth user but no profile — a half-finished signup, which does happen.
    const { data: invited, error: inviteError } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo, data: fullName ? { full_name: fullName } : {} },
    });
    if (!inviteError && invited?.properties?.action_link) {
      actionLink = invited.properties.action_link;
    } else {
      const { data: magic, error: magicError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
      if (magicError || !magic?.properties?.action_link) {
        return {
          emailed: false,
          link: null,
          reason:
            magicError?.message ??
            inviteError?.message ??
            "the authentication service would not issue a sign-in link",
        };
      }
      actionLink = magic.properties.action_link;
    }
  } catch (e) {
    return {
      emailed: false,
      link: null,
      reason: e instanceof Error ? e.message : "could not reach the authentication service",
    };
  }

  const inviterName = inviter.full_name?.trim() || inviter.email;
  try {
    const { delivered } = await sendEmail({
      to: email,
      subject: `${inviterName} added you to the GoCanvas Handoff Hub`,
      html: `
      <div style="font-family:sans-serif;max-width:540px">
        <h2 style="color:#237A4B">You've been added to the Handoff Hub</h2>
        <p style="font-size:14px;line-height:1.6">
          <b>${escapeHtml(inviterName)}</b> added you to the GoCanvas Handoff Hub —
          where a deal's pre-sale history and its onboarding live in one place.
        </p>
        <div style="margin:24px 0">
          <a href="${actionLink}" style="background:#237A4B;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">Set up your account</a>
        </div>
        <p style="font-size:12px;color:#888">
          This link is good for ${INVITE_TTL_DAYS} days. After that ask
          ${escapeHtml(inviterName)} for a new one. Future sign-ins use this email
          address at <a href="${appUrl()}/login">${appUrl()}/login</a>.
        </p>
      </div>`,
    });
    // `delivered: false` means EMAIL_MODE=log — the mail was written to the
    // server log, not sent. Reported honestly rather than as a success.
    return delivered
      ? { emailed: true, link: null, reason: null }
      : {
          emailed: false,
          link: actionLink,
          reason: "this deployment has no email provider configured (EMAIL_MODE=log)",
        };
  } catch (e) {
    return {
      emailed: false,
      link: actionLink,
      reason: e instanceof Error ? e.message : "the email did not send",
    };
  }
}

export async function revokeInvite(inviteId: string, actorId: string): Promise<void> {
  const { data: invite } = await db()
    .from("portal_user_invites")
    .select("email, accepted_at")
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite) throw new InviteError("That invite no longer exists.");
  if (invite.accepted_at) {
    // Deleting it would not remove their account, and pretending otherwise is
    // worse than refusing.
    throw new InviteError(
      "That invite has already been accepted — revoking it would not remove their account. Change their role, or remove the profile.",
    );
  }

  const { error } = await db().from("portal_user_invites").delete().eq("id", inviteId);
  if (error) throw new InviteError(error.message);

  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: "profile.invite_revoked",
    entity_type: "user_invite",
    entity_id: invite.email,
  });
}
