import { Resend } from "resend";

// EMAIL_MODE=log (default when no RESEND_API_KEY): full email is written to the
// server log so the whole approval flow is testable without an email provider.
/**
 * What kind of email this is, for the one rule about who gets what.
 *
 * - assignment — "this account is yours": the deal, the Gong recording to
 *   grab, the SOW to upload. Always sent.
 * - account — an invite or a password reset the person asked for. Always sent.
 * - requested — something the person asked for themselves (their own digest,
 *   the decision on their own TAM request). Always sent.
 * - notification — everything else internal: the pool broadcast, the Monday
 *   digest, a customer's move on a shared plan, a thread reply. Sent to
 *   managers and admins; NOT to the people doing the work, who asked for
 *   their inbox to hold only what is theirs to act on.
 *
 * Customers are outside the rule: an address in neither directory is sent
 * whatever it was given.
 */
export type EmailKind = "assignment" | "account" | "requested" | "notification";

const MANAGER_ROLES = new Set(["admin", "super_admin", "manager"]);

/** The rule, on its own so it can be tested without a mail provider. */
export function emailAllowed(
  kind: EmailKind,
  recipient: { internal: boolean; manager: boolean },
): boolean {
  if (!recipient.internal) return true;
  if (kind !== "notification") return true;
  return recipient.manager;
}

let directoryCache: { at: number; byEmail: Map<string, { manager: boolean }> } | null = null;

/** Both directories, by email, cached five minutes. Null when they cannot be read. */
async function internalDirectory(): Promise<Map<string, { manager: boolean }> | null> {
  if (directoryCache && Date.now() - directoryCache.at < 5 * 60_000) return directoryCache.byEmail;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [{ data: members }, { data: profiles }] = await Promise.all([
      db.from("team_members").select("email, role"),
      db.from("portal_profiles").select("email, role"),
    ]);
    const byEmail = new Map<string, { manager: boolean }>();
    const add = (email: unknown, role: unknown) => {
      if (typeof email !== "string" || !email) return;
      const key = email.trim().toLowerCase();
      const manager = MANAGER_ROLES.has(String(role ?? "").toLowerCase());
      const prev = byEmail.get(key);
      byEmail.set(key, { manager: (prev?.manager ?? false) || manager });
    };
    for (const p of profiles ?? []) {
      if (p.role === "customer") continue;
      add(p.email, p.role);
    }
    for (const m of members ?? []) add(m.email, m.role);
    directoryCache = { at: Date.now(), byEmail };
    return byEmail;
  } catch (e) {
    console.error("[email] could not read the directory; sending as asked", e);
    return null;
  }
}

/** Test seam. */
export function resetEmailDirectoryCache(): void {
  directoryCache = null;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  /** Defaults to "notification": the kind the rule holds back from the people doing the work. */
  kind?: EmailKind;
}): Promise<{ delivered: boolean; reason: string | null }> {
  const kind: EmailKind = opts.kind ?? "notification";
  if (kind === "notification") {
    const directory = await internalDirectory();
    const who = directory?.get(opts.to.trim().toLowerCase());
    if (who && !emailAllowed(kind, { internal: true, manager: who.manager })) {
      console.log(
        `[email:held] to=${opts.to} subject=${JSON.stringify(opts.subject)} — notifications go to managers; this role gets assignments only`,
      );
      return {
        delivered: false,
        reason: "Not sent: this person gets emailed only when an account is assigned to them.",
      };
    }
  }
  const mode = process.env["EMAIL_MODE"] ?? (process.env["RESEND_API_KEY"] ? "send" : "log");

  if (mode !== "send") {
    console.log(`[email:log] to=${opts.to} subject=${JSON.stringify(opts.subject)}\n${opts.html}`);
    return { delivered: false, reason: logModeReason() };
  }

  const resend = new Resend(process.env["RESEND_API_KEY"]);
  const { error } = await resend.emails.send({
    from: process.env["EMAIL_FROM"] ?? "GoCanvas Handoff Portal <onboarding@resend.dev>",
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  if (error) throw new Error(`Email send failed: ${error.message}`);
  return { delivered: true, reason: null };
}

/**
 * Why nothing went out, in words that name the fix. The two states look the
 * same from the outside and need opposite actions: one deployment has no
 * provider; the other has a key that an old EMAIL_MODE=log is overriding,
 * which is exactly the trap the env template used to set.
 */
export function logModeReason(): string {
  if (process.env["RESEND_API_KEY"] && process.env["EMAIL_MODE"]) {
    return `EMAIL_MODE=${process.env["EMAIL_MODE"]} is set on this deployment and overrides RESEND_API_KEY — delete EMAIL_MODE or set it to "send", then redeploy`;
  }
  return "this deployment has no email provider configured (no RESEND_API_KEY)";
}
