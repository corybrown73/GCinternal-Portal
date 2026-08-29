import { Resend } from "resend";

// EMAIL_MODE=log (default when no RESEND_API_KEY): full email is written to the
// server log so the whole approval flow is testable without an email provider.
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ delivered: boolean }> {
  const mode =
    process.env["EMAIL_MODE"] ?? (process.env["RESEND_API_KEY"] ? "send" : "log");

  if (mode !== "send") {
    console.log(
      `[email:log] to=${opts.to} subject=${JSON.stringify(opts.subject)}\n${opts.html}`
    );
    return { delivered: false };
  }

  const resend = new Resend(process.env["RESEND_API_KEY"]);
  const { error } = await resend.emails.send({
    from: process.env["EMAIL_FROM"] ?? "GoCanvas Handoff Portal <onboarding@resend.dev>",
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  if (error) throw new Error(`Email send failed: ${error.message}`);
  return { delivered: true };
}
