import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { drainNotices, type NoticeState } from "./partner-notifications";
import { sendEmail } from "./server/email";

const db = () => supabaseAdmin as any;

/**
 * Send the queued assignment notices that are due. Called by the dispatch cron.
 * Each notice is marked sent only when the email is confirmed delivered.
 */
export async function drainNotificationOutbox(limit: number) {
  return drainNotices({
    now: new Date(),
    limit,
    store: {
      async due(at, n) {
        const { data, error } = await db()
          .from("notification_outbox")
          .select("id,recipient,subject,html,attempts")
          .eq("status", "queued")
          .lte("next_attempt_at", at.toISOString())
          .order("created_at", { ascending: true })
          .limit(n);
        if (error) throw new Error(`Could not read the notice outbox: ${error.message}`);
        return (
          (data ?? []) as Array<{
            id: string;
            recipient: string;
            subject: string;
            html: string;
            attempts: number;
          }>
        ).map((r) => ({
          id: r.id,
          recipient: r.recipient,
          subject: r.subject,
          html: r.html,
          attempts: r.attempts,
        }));
      },
      async save(id, state: NoticeState) {
        const patch =
          state.status === "sent"
            ? {
                status: "sent",
                attempts: state.attempts,
                sent_at: state.sentAt.toISOString(),
                last_error: null,
              }
            : state.status === "exhausted"
              ? { status: "exhausted", attempts: state.attempts, last_error: state.lastError }
              : {
                  status: "queued",
                  attempts: state.attempts,
                  next_attempt_at: state.nextAttemptAt.toISOString(),
                  last_error: state.lastError,
                };
        const { error } = await db().from("notification_outbox").update(patch).eq("id", id);
        if (error) throw new Error(`Could not record a notice outcome: ${error.message}`);
      },
    },
    async send({ to, subject, html }) {
      // No address on file: a failed attempt, retried and then visible, never a silent drop.
      if (!to) return { delivered: false, reason: "No email address is on file for this person." };
      const result = await sendEmail({ kind: "assignment", to, subject, html });
      return { delivered: result.delivered, reason: result.reason };
    },
  });
}
