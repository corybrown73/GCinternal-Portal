/**
 * Types and pure rules shared by the conversation's two doors.
 *
 * The audience rules live here rather than in either server module because they
 * are the same rules on both sides, and a rule that exists twice is a rule that
 * will one day disagree with itself.
 */

export type MessageVisibility = "shared" | "internal";
export type PartyKind = "internal" | "external";
export type AuthorKind = "internal" | "external" | "system";

export type Participant = {
  id: string;
  party_kind: PartyKind;
  display_name: string;
  handle: string;
  email: string | null;
  notify: boolean;
  removed_at: string | null;
};

export type Message = {
  id: string;
  author_kind: AuthorKind;
  author_name: string;
  /**
   * The author's participant row, when they are still in the thread. Resolved
   * server-side from the profile/contact id, because unread counts and
   * "don't email me my own message" both need identity, and comparing display
   * names would break the moment two people share one.
   */
  author_participant_id: string | null;
  visibility: MessageVisibility;
  body: string;
  created_at: string;
  edited_at: string | null;
  withdrawn: boolean;
  /** Participant ids this message named. */
  mention_ids: string[];
};

export type ConversationView = {
  conversation_id: string;
  implementation_id: string;
  implementation_name: string;
  customer_id: string;
  participants: Participant[];
  messages: Message[];
  /** Null when this viewer has never opened the thread. */
  last_read_at: string | null;
  unread: number;
};

/**
 * Who a message can reach.
 *
 * This is the fifth way an internal note could reach a customer — "@everyone"
 * on an internal message — and the reason `parseMentions` reports `everyone`
 * rather than expanding it. An internal message's everyone is the internal
 * half of the room. The database refuses the mention row either way (0029), so
 * getting this wrong is a caught error rather than a leak; getting it right is
 * what stops the composer promising a notification that will not be sent.
 */
export function audienceFor(
  visibility: MessageVisibility,
  participants: Participant[],
): Participant[] {
  const live = participants.filter((p) => p.removed_at === null);
  return visibility === "internal" ? live.filter((p) => p.party_kind === "internal") : live;
}

/**
 * Who gets an email about a message.
 *
 * Two rules, and they are deliberately different:
 *
 *  - a MENTION always notifies, because being named is a request;
 *  - otherwise only the OTHER side is notified, because "one place for
 *    communication" fails if a colleague's every note pages the whole team, and
 *    fails differently if the customer writes and nobody hears it.
 *
 * The author is never notified about their own message. Participants who have
 * turned notifications off still get mentions — they asked for less noise, not
 * to be unreachable.
 */
export function recipientsFor(args: {
  visibility: MessageVisibility;
  authorKind: AuthorKind;
  authorParticipantId: string | null;
  mentionIds: string[];
  participants: Participant[];
}): { participant: Participant; reason: "mentioned" | "other_side" }[] {
  const audience = audienceFor(args.visibility, args.participants);
  const mentioned = new Set(args.mentionIds);
  const out: { participant: Participant; reason: "mentioned" | "other_side" }[] = [];

  for (const p of audience) {
    if (p.id === args.authorParticipantId) continue;
    if (!p.email) continue;
    if (mentioned.has(p.id)) {
      out.push({ participant: p, reason: "mentioned" });
      continue;
    }
    if (!p.notify) continue;
    // "The other side": a customer's message reaches the internal team, and an
    // internal person's shared message reaches the customer. An internal note
    // reaches nobody by default — it is a note, not a message.
    const crossesTheLine =
      (args.authorKind === "external" && p.party_kind === "internal") ||
      (args.authorKind !== "external" &&
        p.party_kind === "external" &&
        args.visibility === "shared");
    if (crossesTheLine) out.push({ participant: p, reason: "other_side" });
  }
  return out;
}

/** Messages this viewer may see. The external door never calls this with `internal`. */
export function visibleTo(messages: Message[], kind: PartyKind): Message[] {
  return kind === "internal" ? messages : messages.filter((m) => m.visibility === "shared");
}

/** Unread = messages after this viewer's cursor that they did not write. */
export function unreadCount(
  messages: Message[],
  lastReadAt: string | null,
  viewerParticipantId: string | null,
): number {
  // No cursor means the thread has never been opened, and every message in it
  // is unread. That is different from "read nothing" and is the correct badge
  // for somebody who was just added.
  const cursor = lastReadAt ? new Date(lastReadAt).getTime() : 0;
  return messages.filter(
    (m) =>
      new Date(m.created_at).getTime() > cursor &&
      (viewerParticipantId === null || m.author_participant_id !== viewerParticipantId),
  ).length;
}
