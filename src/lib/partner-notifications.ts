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

export type NoticeRow = {
  id: string;
  recipient: string;
  subject: string;
  html: string;
  attempts: number;
};

export type NoticeState =
  | { status: "queued"; attempts: number; nextAttemptAt: Date; lastError: string | null }
  | { status: "sent"; attempts: number; sentAt: Date; lastError: null }
  | { status: "exhausted"; attempts: number; lastError: string };

export type SendResult = { delivered: boolean; reason: string | null };

/**
 * The next state after one attempt. A delivery ends the notice. A failure is
 * retried with exponential backoff (1, 2, 4, 8, 16 minutes), and after
 * MAX_NOTICE_ATTEMPTS it is exhausted and visible as such.
 */
export function nextNoticeState(
  attempts: number,
  outcome: { delivered: true } | { delivered: false; error: string },
  now: Date,
): NoticeState {
  const next = attempts + 1;
  if (outcome.delivered) {
    return { status: "sent", attempts: next, sentAt: now, lastError: null };
  }
  if (next >= MAX_NOTICE_ATTEMPTS) {
    return { status: "exhausted", attempts: next, lastError: outcome.error };
  }
  const waitMinutes = 2 ** (next - 1);
  return {
    status: "queued",
    attempts: next,
    nextAttemptAt: new Date(now.getTime() + waitMinutes * 60_000),
    lastError: outcome.error,
  };
}

/** Where the drain reads due notices and writes their outcome. */
export type NoticeStore = {
  due(now: Date, limit: number): Promise<NoticeRow[]>;
  save(id: string, state: NoticeState): Promise<void>;
};

/**
 * Send each due notice once and record the outcome. Never throws for one
 * notice's failure: that notice is retried later, and the rest still go out.
 */
export async function drainNotices(args: {
  store: NoticeStore;
  send: (notice: { to: string; subject: string; html: string }) => Promise<SendResult>;
  now: Date;
  limit: number;
}): Promise<{ sent: number; retrying: number; exhausted: number }> {
  const counts = { sent: 0, retrying: 0, exhausted: 0 };
  for (const row of await args.store.due(args.now, args.limit)) {
    let outcome: { delivered: true } | { delivered: false; error: string };
    try {
      const result = await args.send({ to: row.recipient, subject: row.subject, html: row.html });
      outcome = result.delivered
        ? { delivered: true }
        : { delivered: false, error: result.reason ?? "The email was not delivered." };
    } catch (e) {
      outcome = { delivered: false, error: e instanceof Error ? e.message : String(e) };
    }
    const state = nextNoticeState(row.attempts, outcome, args.now);
    await args.store.save(row.id, state);
    if (state.status === "sent") counts.sent += 1;
    else if (state.status === "queued") counts.retrying += 1;
    else counts.exhausted += 1;
  }
  return { sent: counts.sent, retrying: counts.retrying, exhausted: counts.exhausted };
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
