import { describe, expect, it, vi } from "vitest";

import {
  claimNotice,
  type ClaimedNotice,
  drainNotices,
  handoffNotice,
  MAX_NOTICE_ATTEMPTS,
  type NoticeState,
  type NoticeStore,
  nextNoticeState,
} from "../partner-notifications";

const NOW = new Date("2026-10-13T10:00:00.000Z");
const LEASE = 300;

/**
 * An in-memory outbox with the database's rules: a claim takes only notices that
 * are due and not leased, marks them leased and counts an attempt, and a finish
 * succeeds only for the holder of the current claim token.
 */
function outbox(rows: Array<{ id: string; recipient: string; nextAt?: Date }>) {
  type Row = {
    id: string;
    recipient: string;
    subject: string;
    html: string;
    status: "queued" | "sent" | "exhausted";
    attempts: number;
    nextAt: Date;
    leasedUntil: Date | null;
    token: string | null;
    lastError: string | null;
    created: number;
  };
  let seq = 0;
  let tokens = 0;
  const store = rows.map((r, i) => ({
    id: r.id,
    recipient: r.recipient,
    subject: "s",
    html: "h",
    status: "queued" as const,
    attempts: 0,
    nextAt: r.nextAt ?? NOW,
    leasedUntil: null,
    token: null,
    lastError: null,
    created: i,
  })) as Row[];

  const api: NoticeStore = {
    async claim(now, limit, leaseSeconds) {
      const due = store
        .filter(
          (r) =>
            r.status === "queued" && r.nextAt <= now && (!r.leasedUntil || r.leasedUntil < now),
        )
        .sort((a, b) => a.created - b.created)
        .slice(0, limit);
      return due.map((r) => {
        tokens += 1;
        r.leasedUntil = new Date(now.getTime() + leaseSeconds * 1000);
        r.token = `token-${tokens}`;
        r.attempts += 1;
        return {
          id: r.id,
          recipient: r.recipient,
          subject: r.subject,
          html: r.html,
          attempts: r.attempts,
          token: r.token,
        };
      });
    },
    async finish(notice: ClaimedNotice, state: NoticeState) {
      const r = store.find((x) => x.id === notice.id)!;
      if (r.token !== notice.token) return false;
      seq += 1;
      r.leasedUntil = null;
      r.token = null;
      if (state.status === "sent") {
        r.status = "sent";
      } else if (state.status === "exhausted") {
        r.status = "exhausted";
        r.lastError = state.lastError;
      } else {
        r.nextAt = state.nextAttemptAt;
        r.lastError = state.lastError;
      }
      return true;
    },
  };
  return { store: api, rows: store, now: () => NOW };
}

const okSend = () => vi.fn(async () => ({ delivered: true, reason: null }));

describe("nextNoticeState: a notice is sent only when delivery is confirmed", () => {
  it("a delivered notice is sent", () => {
    expect(nextNoticeState(1, { delivered: true }, NOW)).toEqual({
      status: "sent",
      attempts: 1,
      sentAt: NOW,
    });
  });

  it("a failed attempt is retried with backoff, never recorded as sent", () => {
    const first = nextNoticeState(1, { delivered: false, error: "no provider" }, NOW);
    expect(first).toMatchObject({ status: "queued", attempts: 1, lastError: "no provider" });
    expect((first as { nextAttemptAt: Date }).nextAttemptAt.getTime()).toBe(NOW.getTime() + 60_000);
    const third = nextNoticeState(3, { delivered: false, error: "still down" }, NOW);
    expect((third as { nextAttemptAt: Date }).nextAttemptAt.getTime()).toBe(
      NOW.getTime() + 4 * 60_000,
    );
  });

  it("after the last attempt it is exhausted, and stays visible as failed", () => {
    expect(nextNoticeState(MAX_NOTICE_ATTEMPTS, { delivered: false, error: "gone" }, NOW)).toEqual({
      status: "exhausted",
      attempts: MAX_NOTICE_ATTEMPTS,
      lastError: "gone",
    });
  });
});

describe("overlapping workers do not send the same notice twice", () => {
  it("two drains running at once send each notice exactly once", async () => {
    const box = outbox([
      { id: "a", recipient: "a@x.test" },
      { id: "b", recipient: "b@x.test" },
      { id: "c", recipient: "c@x.test" },
    ]);
    const sent: string[] = [];
    const send = async (n: { to: string }) => {
      // Yield, so the two workers interleave between claim and finish.
      await new Promise((r) => setTimeout(r, 0));
      sent.push(n.to);
      return { delivered: true, reason: null };
    };
    const [one, two] = await Promise.all([
      drainNotices({ store: box.store, send, now: NOW, limit: 2, leaseSeconds: LEASE }),
      drainNotices({ store: box.store, send, now: NOW, limit: 2, leaseSeconds: LEASE }),
    ]);
    expect(sent.sort()).toEqual(["a@x.test", "b@x.test", "c@x.test"]);
    expect(one.sent + two.sent).toBe(3);
    expect(box.rows.every((r) => r.status === "sent" && r.attempts === 1)).toBe(true);
  });

  it("a notice leased by one worker is not claimable by another until the lease lapses", async () => {
    const box = outbox([{ id: "a", recipient: "a@x.test" }]);
    const first = await box.store.claim(NOW, 10, LEASE);
    expect(first).toHaveLength(1);
    expect(await box.store.claim(NOW, 10, LEASE)).toEqual([]);
  });
});

describe("failed sends are retried, never recorded as delivered", () => {
  it("a held email (delivered: false) is retried with backoff and not counted as sent", async () => {
    const box = outbox([{ id: "a", recipient: "a@x.test" }]);
    const counts = await drainNotices({
      store: box.store,
      send: async () => ({ delivered: false, reason: "log mode: no provider" }),
      now: NOW,
      limit: 25,
      leaseSeconds: LEASE,
    });
    expect(counts).toEqual({ sent: 0, retrying: 1, exhausted: 0, lost: 0 });
    expect(box.rows[0]).toMatchObject({
      status: "queued",
      lastError: "log mode: no provider",
      token: null,
    });
    expect(box.rows[0]!.nextAt.getTime()).toBe(NOW.getTime() + 60_000);
  });

  it("a retry is sent on a later run, once its backoff has passed", async () => {
    const box = outbox([{ id: "a", recipient: "a@x.test" }]);
    await drainNotices({
      store: box.store,
      send: async () => ({ delivered: false, reason: "down" }),
      now: NOW,
      limit: 25,
      leaseSeconds: LEASE,
    });
    const later = new Date(NOW.getTime() + 2 * 60_000);
    const send = okSend();
    const counts = await drainNotices({
      store: box.store,
      send,
      now: later,
      limit: 25,
      leaseSeconds: LEASE,
    });
    expect(counts.sent).toBe(1);
    expect(box.rows[0]).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("a thrown error is a failed attempt, and the other notices still go out", async () => {
    const box = outbox([
      { id: "a", recipient: "a@x.test" },
      { id: "b", recipient: "b@x.test" },
    ]);
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("Email send failed: rate limited"))
      .mockResolvedValueOnce({ delivered: true, reason: null });
    const counts = await drainNotices({
      store: box.store,
      send,
      now: NOW,
      limit: 25,
      leaseSeconds: LEASE,
    });
    expect(counts).toEqual({ sent: 1, retrying: 1, exhausted: 0, lost: 0 });
    expect(box.rows[0]).toMatchObject({
      status: "queued",
      lastError: "Email send failed: rate limited",
    });
    expect(box.rows[1]).toMatchObject({ status: "sent" });
  });

  it("a notice that has used all its attempts is exhausted, not retried forever", async () => {
    const box = outbox([{ id: "a", recipient: "a@x.test" }]);
    box.rows[0]!.attempts = MAX_NOTICE_ATTEMPTS - 1;
    const counts = await drainNotices({
      store: box.store,
      send: async () => ({ delivered: false, reason: "down" }),
      now: NOW,
      limit: 25,
      leaseSeconds: LEASE,
    });
    expect(counts.exhausted).toBe(1);
    expect(box.rows[0]).toMatchObject({ status: "exhausted", attempts: MAX_NOTICE_ATTEMPTS });
  });
});

describe("abandoned and overtaken claims", () => {
  it("a worker that dies holding a claim leaves it leased, then another worker takes it over once the lease lapses", async () => {
    const box = outbox([{ id: "a", recipient: "a@x.test" }]);
    // Worker A claims, then dies before it sends or finishes.
    const abandoned = await box.store.claim(NOW, 10, LEASE);
    expect(abandoned).toHaveLength(1);
    // Within the lease, worker B finds nothing to do.
    const during = await drainNotices({
      store: box.store,
      send: okSend(),
      now: NOW,
      limit: 10,
      leaseSeconds: LEASE,
    });
    expect(during.sent).toBe(0);
    // After the lease lapses, worker B takes the notice over and sends it.
    const afterLease = new Date(NOW.getTime() + (LEASE + 1) * 1000);
    const send = okSend();
    const after = await drainNotices({
      store: box.store,
      send,
      now: afterLease,
      limit: 10,
      leaseSeconds: LEASE,
    });
    expect(after.sent).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    // The abandoned claim counted as an attempt.
    expect(box.rows[0]).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("a worker whose lease lapsed mid-send cannot overwrite the worker that took over", async () => {
    const box = outbox([{ id: "a", recipient: "a@x.test" }]);
    const afterLease = new Date(NOW.getTime() + (LEASE + 1) * 1000);
    // Worker A is slow: it sends after its lease has lapsed.
    const slowSend = async () => {
      // Worker B takes the notice over while A is still sending.
      await drainNotices({
        store: box.store,
        send: okSend(),
        now: afterLease,
        limit: 10,
        leaseSeconds: LEASE,
      });
      return { delivered: true, reason: null };
    };
    const counts = await drainNotices({
      store: box.store,
      send: slowSend,
      now: NOW,
      limit: 10,
      leaseSeconds: LEASE,
    });
    expect(counts.lost).toBe(1);
    expect(counts.sent).toBe(0);
    // The stored outcome is worker B's, recorded once.
    expect(box.rows[0]).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("a finish for a claim the worker no longer holds changes nothing", async () => {
    const box = outbox([{ id: "a", recipient: "a@x.test" }]);
    const [held] = await box.store.claim(NOW, 10, LEASE);
    const finished = await box.store.finish(
      { ...held!, token: "not-my-token" },
      { status: "sent", attempts: 1, sentAt: NOW },
    );
    expect(finished).toBe(false);
    expect(box.rows[0]).toMatchObject({ status: "queued", token: held!.token });
  });
});

describe("the notices name the right person and never repeat", () => {
  it("a handoff notice is keyed per implementation and recipient, and escapes the deal name", () => {
    const n = handoffNotice({
      implementationId: "imp-1",
      memberId: "member-7",
      recipient: "Lee@GoCanvas.test",
      recipientName: "Lee Park",
      dealName: "Acme <b>Pools</b>",
      appUrl: "https://hub.example",
      dealId: "deal-1",
    });
    expect(n.dedupe_key).toBe("assignment:handoff:imp-1:member-7");
    expect(n.to).toBe("Lee@GoCanvas.test");
    expect(n.subject).toBe("Handed to you: Acme <b>Pools</b>");
    expect(n.html).toContain("Acme &lt;b&gt;Pools&lt;/b&gt;");
    expect(n.html).toContain("https://hub.example/deals/deal-1");
  });

  it("members with no address get distinct keys, so they never collide", () => {
    const a = claimNotice({
      implementationId: "imp-1",
      memberId: "m1",
      recipient: "",
      dealName: "x",
      appUrl: "u",
      dealId: "d",
    });
    const b = claimNotice({
      implementationId: "imp-1",
      memberId: "m2",
      recipient: "",
      dealName: "x",
      appUrl: "u",
      dealId: "d",
    });
    expect(a.dedupe_key).not.toBe(b.dedupe_key);
  });

  it("a claim notice is keyed per pool member, so each member is told once", () => {
    const n = claimNotice({
      implementationId: "imp-1",
      memberId: "member-9",
      recipient: "pool@example.test",
      dealName: "Acme",
      appUrl: "https://hub.example",
      dealId: "deal-1",
    });
    expect(n.dedupe_key).toBe("assignment:claim:imp-1:member-9");
  });
});
