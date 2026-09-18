import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { appUrl } from "./app-url";
import { requireSuperAdmin } from "./presale.server";
import { audit } from "./server/audit";
import { sendEmail } from "./server/email";

/**
 * Passwords for the people on the account, set by an admin.
 *
 * WHY THIS EXISTS. The invite flow signs a person up by email link. On a
 * pilot week, half the team will be sitting next to the admin saying "just
 * give me a password", and the other half will have lost the link. Two
 * tools: set a password on the spot, or send a reset link. Both are
 * super-admin only — the same gate as changing a role, because a password
 * is the account.
 *
 * The password itself is never logged or stored here: it goes to the auth
 * service and the audit row records only who did it, to whom.
 */

const MIN_LENGTH = 12;
const db = () => supabaseAdmin as any;

async function profileEmail(profileId: string): Promise<{ email: string; name: string | null }> {
  const { data } = await db()
    .from("portal_profiles")
    .select("email,full_name")
    .eq("id", profileId)
    .maybeSingle();
  if (!data) throw new Error("No such user");
  return { email: String(data.email), name: (data.full_name as string | null) ?? null };
}

export async function setUserPassword(
  actorId: string,
  profileId: string,
  password: string,
): Promise<{ ok: true }> {
  const actor = await requireSuperAdmin(actorId);
  if (password.length < MIN_LENGTH) {
    throw new Error(`Use at least ${MIN_LENGTH} characters`);
  }
  await profileEmail(profileId);
  // Setting a password by hand IS the activation: the person was invited
  // while email was off, never got the link, and cannot confirm the address
  // themselves. The admin vouching for them stands in for the click.
  const { error } = await db().auth.admin.updateUserById(profileId, {
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`Could not set the password: ${error.message}`);
  await audit({
    actor_type: "user",
    actor_id: actor.id,
    action: "user.password_set",
    entity_type: "profile",
    entity_id: profileId,
    payload: { by: actor.email, activated: true },
  });
  return { ok: true };
}

/**
 * A reset link for a person. Emailed when email is live; otherwise the link
 * comes back so the admin can hand it over (the same fallback invites use).
 */
export async function issuePasswordReset(
  actorId: string,
  profileId: string,
): Promise<{ emailed: boolean; link: string | null }> {
  const actor = await requireSuperAdmin(actorId);
  const { email, name } = await profileEmail(profileId);
  const redirectTo = `${appUrl()}/auth/callback?next=/forgot-password`;
  const { data, error } = await db().auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });
  const link: string | null = data?.properties?.action_link ?? null;
  if (error || !link) {
    throw new Error(`Could not issue a reset link: ${error?.message ?? "no link returned"}`);
  }

  let emailed = false;
  try {
    const { delivered } = await sendEmail({
      to: email,
      subject: "Set a new password for the GoCanvas Handoff Hub",
      html: `
      <div style="font-family:sans-serif;max-width:540px">
        <h2 style="color:#072b57">Set a new password</h2>
        <p style="font-size:14px;line-height:1.6">
          ${name ? `Hi ${escapeHtml(name)}, ` : ""}${escapeHtml(actor.full_name ?? actor.email)} asked us to send you a link to choose a new password for the Handoff Hub.
        </p>
        <div style="margin:24px 0">
          <a href="${link}" style="background:#12509b;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">Choose a new password</a>
        </div>
        <p style="font-size:12px;color:#556477">The link works once and expires. If you did not expect this, ignore it.</p>
      </div>`,
    });
    emailed = delivered;
  } catch (e) {
    console.error("[passwords] could not email the reset link", e);
  }

  await audit({
    actor_type: "user",
    actor_id: actor.id,
    action: "user.password_reset_issued",
    entity_type: "profile",
    entity_id: profileId,
    payload: { emailed },
  });
  return { emailed, link: emailed ? null : link };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
