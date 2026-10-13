import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { type ClaimedNotice, drainNotices, type NoticeState } from "./partner-notifications";
import { sendEmail } from "./server/email";

const db = () => supabaseAdmin as any;

/**
 * How long a worker holds a notice before another may take it over. It must be
 * longer than one send, so a slow send is not re-sent by a second worker.
 */
export const NOTICE_LEASE_SECONDS = 300;

/**
 * Send the queued assignment notices that are due. Called by the dispatch cron.
 * Claims are atomic (claim_notices locks with SKIP LOCKED and leases in the
 * same statement), so overlapping cron runs cannot send the same notice.
 */
export async function drainNotificationOutbox(limit: number) {
  return drainNotices({
    now: new Date(),
    limit,
    leaseSeconds: NOTICE_LEASE_SECONDS,
    store: {
      async claim(_now, n, leaseSeconds) {
        const { data, error } = await db().rpc("claim_notices", {
          p_limit: n,
          p_lease_seconds: leaseSeconds,
        });
        if (error) throw new Error(`Could not claim notices: ${error.message}`);
        return (
          (data ?? []) as Array<{
            id: string;
            recipient: string;
            subject: string;
            html: string;
            attempts: number;
            claim_token: string;
          }>
        ).map((r): ClaimedNotice => ({
          id: r.id,
          recipient: r.recipient,
          subject: r.subject,
          html: r.html,
          attempts: r.attempts,
          token: r.claim_token,
        }));
      },
      async finish(notice: ClaimedNotice, state: NoticeState) {
        const { data, error } = await db().rpc("finish_notice", {
          p_id: notice.id,
          p_token: notice.token,
          p_status: state.status,
          p_error: state.status === "sent" ? null : state.lastError,
          p_next: state.status === "queued" ? state.nextAttemptAt.toISOString() : null,
        });
        if (error) throw new Error(`Could not record a notice outcome: ${error.message}`);
        return data === true;
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
