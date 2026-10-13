import { describe, expect, it, vi } from "vitest";

import {
  claimNotice,
  drainNotices,
  handoffNotice,
  MAX_NOTICE_ATTEMPTS,
  nextNoticeState,
  type NoticeRow,
  type NoticeState,
} from "../partner-notifications";

const NOW = new Date("2026-10-13T10:00:00.000Z");

describe("nextNoticeState: a notice is sent only when delivery is confirmed", () => {
  it("a delivered notice is sent, and only then", () => {
    expect(nextNoticeState(0, { delivered: true }, NOW)).toEqual({
      status: "sent",
      attempts: 1,
      sentAt: NOW,
      lastError: null,
    });
  });

  it("a failed attempt is retried with backoff, never recorded as sent", () => {
    const first = nextNoticeState(0, { delivered: false, error: "no provider" }, NOW);
    expect(first).toMatchObject({ status: "queued", attempts: 1, lastError: "no provider" });
    expect((first as { nextAttemptAt: Date }).nextAttemptAt.getTime()).toBe(NOW.getTime() + 60_000);
    const third = nextNoticeState(2, { delivered: false, error: "still down" }, NOW);
    expect((third as { nextAttemptAt: Date }).nextAttemptAt.getTime()).toBe(
      NOW.getTime() + 4 * 60_000,
    );
  });

  it("after the last attempt it is exhausted, and stays visible as failed", () => {
    expect(
      nextNoticeState(MAX_NOTICE_ATTEMPTS - 1, { delivered: false, error: "gone" }, NOW),
    ).toEqual({ status: "exhausted", attempts: MAX_NOTICE_ATTEMPTS, lastError: "gone" });
  });
});

function memoryStore(rows: NoticeRow[]) {
  const saved = new Map<string, NoticeState>();
  const store = {
    due: vi.fn(async () => rows),
    save: vi.fn(async (id: string, state: NoticeState) => {
      saved.set(id, state);
    }),
  };
  return { store, saved };
}

const row = (id: string, attempts = 0): NoticeRow => ({
  id,
  recipient: `${id}@example.test`,
  subject: "s",
  html: "<p>h</p>",
  attempts,
});

describe("drainNotices: a failed email is never treated as delivered", () => {
  it("a held email (delivered: false) is retried, not sent", async () => {
    const { store, saved } = memoryStore([row("a")]);
    const send = vi.fn(async () => ({ delivered: false, reason: "log mode: no provider" }));
    const counts = await drainNotices({ store, send, now: NOW, limit: 25 });
    expect(counts).toEqual({ sent: 0, retrying: 1, exhausted: 0 });
    expect(saved.get("a")).toMatchObject({ status: "queued", lastError: "log mode: no provider" });
  });

  it("a thrown error is recorded as a failed attempt, and the other notices still go out", async () => {
    const { store, saved } = memoryStore([row("a"), row("b")]);
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("Email send failed: rate limited"))
      .mockResolvedValueOnce({ delivered: true, reason: null });
    const counts = await drainNotices({ store, send, now: NOW, limit: 25 });
    expect(counts).toEqual({ sent: 1, retrying: 1, exhausted: 0 });
    expect(saved.get("a")).toMatchObject({
      status: "queued",
      lastError: "Email send failed: rate limited",
    });
    expect(saved.get("b")).toMatchObject({ status: "sent" });
  });

  it("a notice that has used its attempts is exhausted, not retried forever", async () => {
    const { store, saved } = memoryStore([row("a", MAX_NOTICE_ATTEMPTS - 1)]);
    const send = vi.fn(async () => ({ delivered: false, reason: "down" }));
    const counts = await drainNotices({ store, send, now: NOW, limit: 25 });
    expect(counts.exhausted).toBe(1);
    expect(saved.get("a")).toMatchObject({ status: "exhausted" });
  });

  it("a delivered notice is recorded as sent", async () => {
    const { store, saved } = memoryStore([row("a")]);
    await drainNotices({
      store,
      send: async () => ({ delivered: true, reason: null }),
      now: NOW,
      limit: 25,
    });
    expect(saved.get("a")).toMatchObject({ status: "sent", attempts: 1 });
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
