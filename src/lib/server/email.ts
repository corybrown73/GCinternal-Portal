import { Resend } from "resend";

// EMAIL_MODE=log (default when no RESEND_API_KEY): full email is written to the
// server log so the whole approval flow is testable without an email provider.
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ delivered: boolean; reason: string | null }> {
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
