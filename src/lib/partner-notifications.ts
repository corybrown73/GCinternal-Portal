/**
 * Durable, retryable assignment notices for partner handoffs. Pure: the
 * database writes a notice in the same transaction as the handoff, and the
 * dispatch cron drains it through the store and sender given here.
 *
 * A notice is "sent" only when the sender reports delivery. A held email
 * (delivered: false) and a thrown error both count as a failed attempt, so
 * nothing is recorded as delivered when it was not.
 */

export const MAX_NOTICE_ATTEMPTS = 6;

/** A notice a worker holds under a lease. `attempts` already counts this claim. */
export type ClaimedNotice = {
  id: string;
  recipient: string;
  subject: string;
  html: string;
  attempts: number;
  token: string;
};

export type NoticeState =
  | { status: "queued"; attempts: number; nextAttemptAt: Date; lastError: string }
  | { status: "sent"; attempts: number; sentAt: Date }
  | { status: "exhausted"; attempts: number; lastError: string };

export type SendResult = { delivered: boolean; reason: string | null };

/**
 * The state after one claimed attempt. Only a confirmed delivery ends a notice
 * as sent. A failure is retried with exponential backoff (1, 2, 4, 8, 16
 * minutes); after MAX_NOTICE_ATTEMPTS it is exhausted and stays visible.
 */
export function nextNoticeState(
  attempts: number,
  outcome: { delivered: true } | { delivered: false; error: string },
  now: Date,
): NoticeState {
  if (outcome.delivered) {
    return { status: "sent", attempts, sentAt: now };
  }
  if (attempts >= MAX_NOTICE_ATTEMPTS) {
    return { status: "exhausted", attempts, lastError: outcome.error };
  }
  const waitMinutes = 2 ** (attempts - 1);
  return {
    status: "queued",
    attempts,
    nextAttemptAt: new Date(now.getTime() + waitMinutes * 60_000),
    lastError: outcome.error,
  };
}

/**
 * Where the drain claims notices and records their outcome. The store is
 * responsible for the claim being atomic and for `finish` being fenced: it
 * succeeds only for the worker that still holds the lease.
 */
export type NoticeStore = {
  claim(now: Date, limit: number, leaseSeconds: number): Promise<ClaimedNotice[]>;
  finish(notice: ClaimedNotice, state: NoticeState): Promise<boolean>;
};

/**
 * Claim due notices, send each, and record the outcome against the claim.
 * A notice is counted as sent only when the sender confirms delivery AND the
 * outcome is recorded against this worker's own claim. If the lease lapsed and
 * another worker took the notice, the finish is refused, counted as `lost`, and
 * the other worker's outcome stands. One notice's failure never stops the rest.
 */
export async function drainNotices(args: {
  store: NoticeStore;
  send: (notice: { to: string; subject: string; html: string }) => Promise<SendResult>;
  now: Date;
  limit: number;
  leaseSeconds: number;
}): Promise<{ sent: number; retrying: number; exhausted: number; lost: number }> {
  const counts = { sent: 0, retrying: 0, exhausted: 0, lost: 0 };
  for (const notice of await args.store.claim(args.now, args.limit, args.leaseSeconds)) {
    let outcome: { delivered: true } | { delivered: false; error: string };
    try {
      const result = await args.send({
        to: notice.recipient,
        subject: notice.subject,
        html: notice.html,
      });
      outcome = result.delivered
        ? { delivered: true }
        : { delivered: false, error: result.reason ?? "The email was not delivered." };
    } catch (e) {
      outcome = { delivered: false, error: e instanceof Error ? e.message : String(e) };
    }
    const state = nextNoticeState(notice.attempts, outcome, args.now);
    if (!(await args.store.finish(notice, state))) {
      counts.lost += 1;
      continue;
    }
    if (state.status === "sent") counts.sent += 1;
    else if (state.status === "queued") counts.retrying += 1;
    else counts.exhausted += 1;
  }
  return counts;
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The notice to the person who now owns a handed-over implementation. Its key
 * is unique per implementation and team member, so a retried write cannot queue
 * the same notice twice, and two members with no address never collide.
 */
export function handoffNotice(args: {
  implementationId: string;
  memberId: string;
  recipient: string;
  recipientName: string;
  dealName: string;
  appUrl: string;
  dealId: string;
}): { dedupe_key: string; to: string; subject: string; html: string } {
  const first = args.recipientName.split(" ")[0] ?? args.recipientName;
  const link = `${args.appUrl}/deals/${args.dealId}`;
  return {
    dedupe_key: `assignment:handoff:${args.implementationId}:${args.memberId}`,
    to: args.recipient,
    subject: `Handed to you: ${args.dealName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;color:#0a1628">
        <h2 style="color:#072b57;margin:0 0 8px">${escape(args.dealName)}</h2>
        <p style="font-size:14px;line-height:1.6">Hi ${escape(first)}: this implementation has been handed to you.
        Partner setup is done and the form, data and rollout work is yours from here.</p>
        <p style="margin:20px 0"><a href="${escape(link)}" style="background:#039de7;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open the deal</a></p>
      </div>`,
  };
}

/** The notice to a pool member when nobody is picked and the account is open to claim. */
export function claimNotice(args: {
  implementationId: string;
  memberId: string;
  recipient: string;
  dealName: string;
  appUrl: string;
  dealId: string;
}): { dedupe_key: string; to: string; subject: string; html: string } {
  const link = `${args.appUrl}/deals/${args.dealId}`;
  return {
    dedupe_key: `assignment:claim:${args.implementationId}:${args.memberId}`,
    to: args.recipient,
    subject: `New account to claim: ${args.dealName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;color:#0a1628">
        <h2 style="color:#072b57;margin:0 0 8px">${escape(args.dealName)} is ready to claim</h2>
        <p style="font-size:14px;line-height:1.6">Nobody owns it yet. Open it and press <b>Claim this account</b> if it is yours.</p>
        <p style="margin:20px 0"><a href="${escape(link)}" style="background:#039de7;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open the deal</a></p>
      </div>`,
  };
}
