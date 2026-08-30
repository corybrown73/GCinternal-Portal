import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { audit } from "./server/audit";
import { sendEmail } from "./server/email";
import { isFlagOn } from "./app-config.server";
import {
  audienceFor,
  recipientsFor,
  unreadCount,
  visibleTo,
  type ConversationView,
  type Message,
  type MessageVisibility,
  type Participant,
} from "./conversation";
import { EVERYONE_HANDLE, makeHandle, parseMentions } from "./mentions";

/**
 * The project conversation, internal side.
 *
 * Everything runs on the service role, so — exactly as in
 * `server/external-viewer.ts` — this module IS the authorization boundary for
 * the internal door, and 0029's triggers are the boundary underneath it. The
 * division of labour is deliberate: the triggers make an internal note reaching
 * a customer impossible; this module makes the failure legible before it gets
 * there, so somebody gets an error they can act on rather than a constraint
 * violation.
 *
 * The external door does NOT go through here. It goes through
 * `external-plan.server.ts`, which projects the thread through
 * `buildSharedPlanDTO` like everything else a customer sees.
 */

const db = () => supabaseAdmin as any;

function appUrl(): string {
  return process.env["APP_URL"] ?? "http://localhost:3000";
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export class ConversationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversationError";
  }
}

async function requireEnabled(): Promise<void> {
  if (!(await isFlagOn("conversations"))) {
    throw new ConversationError("Conversations are not enabled for this deployment.");
  }
}

/* ------------------------------------------------------------------------- */
/* The thread                                                                 */
/* ------------------------------------------------------------------------- */

type ConversationRow = {
  id: string;
  implementation_id: string;
  customer_id: string;
  last_message_at: string | null;
  last_shared_message_at: string | null;
};

/**
 * Get the thread for a project, creating and seeding it on first use.
 *
 * Lazy creation rather than a trigger on `implementations`: a thread with no
 * participants and no messages is noise on every screen that lists threads, and
 * backfilling one for every historical implementation would produce hundreds of
 * them. The first person to open the conversation is also the first person who
 * should be in it.
 */
export async function ensureConversation(
  implementationId: string,
  actingProfileId: string | null,
): Promise<ConversationRow> {
  const { data: existing } = await db()
    .from("project_conversations")
    .select("id, implementation_id, customer_id, last_message_at, last_shared_message_at")
    .eq("implementation_id", implementationId)
    .maybeSingle();
  if (existing) return existing as ConversationRow;

  const { data: impl } = await db()
    .from("implementations")
    .select("id, customer_id, name")
    .eq("id", implementationId)
    .maybeSingle();
  if (!impl) throw new ConversationError("That project does not exist.");

  const { data: created, error } = await db()
    .from("project_conversations")
    .insert({ implementation_id: implementationId, customer_id: impl.customer_id })
    .select("id, implementation_id, customer_id, last_message_at, last_shared_message_at")
    .single();
  if (error) {
    // Two people opening the project at the same moment both miss the read
    // above and both insert; the unique constraint on implementation_id means
    // exactly one wins. Re-reading is the right answer, not an error page.
    const { data: raced } = await db()
      .from("project_conversations")
      .select("id, implementation_id, customer_id, last_message_at, last_shared_message_at")
      .eq("implementation_id", implementationId)
      .maybeSingle();
    if (raced) return raced as ConversationRow;
    throw new ConversationError(`Could not open the conversation: ${error.message}`);
  }

  await seedParticipants(created.id, implementationId, impl.customer_id, actingProfileId);
  return created as ConversationRow;
}

/**
 * Put the obvious people in the room.
 *
 * "Obvious" is: whoever is opening it, the project's owner, and every customer
 * contact who currently holds a live external link. Anyone else is added by
 * hand — seeding the whole team would make every mention list unusable and
 * every notification a broadcast.
 *
 * A caveat worth stating rather than hiding: an internal participant needs a
 * `portal_profiles` row, and `implementations.owner_id` points at
 * `team_members`. An owner who has never signed in has no profile and is
 * therefore not seeded. They can be added the moment they do.
 */
async function seedParticipants(
  conversationId: string,
  implementationId: string,
  customerId: string,
  actingProfileId: string | null,
): Promise<void> {
  const taken: string[] = [];
  const rows: Record<string, unknown>[] = [];

  const addInternal = (profileId: string, name: string, email: string | null) => {
    if (rows.some((r) => r["profile_id"] === profileId)) return;
    const handle = makeHandle(name, email, taken);
    taken.push(handle);
    rows.push({
      conversation_id: conversationId,
      party_kind: "internal",
      profile_id: profileId,
      display_name: name,
      email,
      handle,
      added_by: actingProfileId,
    });
  };

  if (actingProfileId) {
    const { data: me } = await db()
      .from("portal_profiles")
      .select("id, full_name, email")
      .eq("id", actingProfileId)
      .maybeSingle();
    if (me) addInternal(me.id, me.full_name || me.email || "Teammate", me.email);
  }

  const { data: impl } = await db()
    .from("implementations")
    .select("owner_id")
    .eq("id", implementationId)
    .maybeSingle();
  if (impl?.owner_id) {
    const { data: ownerProfile } = await db()
      .from("portal_profiles")
      .select("id, full_name, email")
      .eq("team_member_id", impl.owner_id)
      .maybeSingle();
    if (ownerProfile) {
      addInternal(
        ownerProfile.id,
        ownerProfile.full_name || ownerProfile.email || "Project owner",
        ownerProfile.email,
      );
    }
  }

  // Contacts with a live link. Not every contact: somebody who was never given
  // access has no way to read the thread, and putting them in it would make the
  // participant list a promise the product does not keep.
  const { data: grants } = await db()
    .from("external_access_grants")
    .select("contact_id")
    .eq("implementation_id", implementationId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .not("contact_id", "is", null);

  const contactIds = [
    ...new Set(((grants ?? []) as { contact_id: string }[]).map((g) => g.contact_id)),
  ];
  if (contactIds.length > 0) {
    const { data: contacts } = await db()
      .from("customer_contacts")
      .select("id, name, email, customer_id")
      .in("id", contactIds)
      .eq("customer_id", customerId);
    for (const c of (contacts ?? []) as { id: string; name: string; email: string | null }[]) {
      const handle = makeHandle(c.name, c.email, taken);
      taken.push(handle);
      rows.push({
        conversation_id: conversationId,
        party_kind: "external",
        contact_id: c.id,
        display_name: c.name,
        email: c.email,
        handle,
        added_by: actingProfileId,
      });
    }
  }

  if (rows.length === 0) return;
  const { error } = await db().from("conversation_participants").insert(rows);
  if (error) console.error("[conversation] seeding participants failed", error.message);
}

/* ------------------------------------------------------------------------- */
/* Reading                                                                    */
/* ------------------------------------------------------------------------- */

type MessageRow = {
  id: string;
  author_kind: Message["author_kind"];
  author_name: string;
  author_profile_id: string | null;
  author_contact_id: string | null;
  visibility: MessageVisibility;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export async function loadParticipants(conversationId: string): Promise<Participant[]> {
  const { data } = await db()
    .from("conversation_participants")
    .select(
      "id, party_kind, display_name, handle, email, notify, removed_at, profile_id, contact_id",
    )
    .eq("conversation_id", conversationId)
    .order("party_kind")
    .order("display_name");
  return (data ?? []) as Participant[];
}

export async function loadConversation(
  implementationId: string,
  viewerProfileId: string | null,
): Promise<ConversationView> {
  await requireEnabled();
  const conv = await ensureConversation(implementationId, viewerProfileId);

  const [{ data: impl }, participantsRaw, { data: msgRows }] = await Promise.all([
    db().from("implementations").select("name").eq("id", implementationId).maybeSingle(),
    loadParticipants(conv.id),
    db()
      .from("conversation_messages")
      .select(
        "id, author_kind, author_name, author_profile_id, author_contact_id, visibility, body, created_at, edited_at, deleted_at",
      )
      .eq("conversation_id", conv.id)
      .order("created_at"),
  ]);

  const participants = participantsRaw as (Participant & {
    profile_id: string | null;
    contact_id: string | null;
  })[];

  const byProfile = new Map(
    participants.filter((p) => p.profile_id).map((p) => [p.profile_id!, p.id]),
  );
  const byContact = new Map(
    participants.filter((p) => p.contact_id).map((p) => [p.contact_id!, p.id]),
  );

  const messageIds = ((msgRows ?? []) as MessageRow[]).map((m) => m.id);
  const mentionsByMessage = new Map<string, string[]>();
  if (messageIds.length > 0) {
    const { data: mentionRows } = await db()
      .from("conversation_mentions")
      .select("message_id, participant_id")
      .in("message_id", messageIds);
    for (const m of (mentionRows ?? []) as { message_id: string; participant_id: string }[]) {
      const list = mentionsByMessage.get(m.message_id) ?? [];
      list.push(m.participant_id);
      mentionsByMessage.set(m.message_id, list);
    }
  }

  const messages: Message[] = ((msgRows ?? []) as MessageRow[]).map((m) => ({
    id: m.id,
    author_kind: m.author_kind,
    author_name: m.author_name,
    author_participant_id:
      (m.author_profile_id ? byProfile.get(m.author_profile_id) : null) ??
      (m.author_contact_id ? byContact.get(m.author_contact_id) : null) ??
      null,
    visibility: m.visibility,
    // A withdrawn message keeps its row (evidence) but not its text. The body
    // is dropped HERE, on the way out, rather than being deleted in the
    // database — the record of what was said stays intact for an audit that has
    // a reason to look.
    body: m.deleted_at ? "" : m.body,
    created_at: m.created_at,
    edited_at: m.edited_at,
    withdrawn: Boolean(m.deleted_at),
    mention_ids: mentionsByMessage.get(m.id) ?? [],
  }));

  const viewerParticipantId = viewerProfileId ? (byProfile.get(viewerProfileId) ?? null) : null;
  let lastReadAt: string | null = null;
  if (viewerParticipantId) {
    const { data: read } = await db()
      .from("conversation_reads")
      .select("last_read_at")
      .eq("conversation_id", conv.id)
      .eq("participant_id", viewerParticipantId)
      .maybeSingle();
    lastReadAt = read?.last_read_at ?? null;
  }

  return {
    conversation_id: conv.id,
    implementation_id: implementationId,
    implementation_name: impl?.name ?? "Project",
    customer_id: conv.customer_id,
    participants,
    messages: visibleTo(messages, "internal"),
    last_read_at: lastReadAt,
    unread: unreadCount(messages, lastReadAt, viewerParticipantId),
  };
}

/* ------------------------------------------------------------------------- */
/* Writing                                                                    */
/* ------------------------------------------------------------------------- */

export async function postMessage(args: {
  implementationId: string;
  profileId: string;
  body: string;
  visibility: MessageVisibility;
}): Promise<ConversationView> {
  await requireEnabled();
  const body = args.body.trim();
  if (body.length === 0) throw new ConversationError("A message needs something in it.");
  if (body.length > 20000)
    throw new ConversationError("That message is too long (20,000 characters max).");

  const conv = await ensureConversation(args.implementationId, args.profileId);
  const participants = (await loadParticipants(conv.id)) as (Participant & {
    profile_id: string | null;
  })[];

  const author = participants.find((p) => p.profile_id === args.profileId && p.removed_at === null);
  const { data: profile } = await db()
    .from("portal_profiles")
    .select("id, full_name, email")
    .eq("id", args.profileId)
    .maybeSingle();
  if (!profile) throw new ConversationError("Your profile could not be read.");
  const authorName = profile.full_name || profile.email || "Teammate";

  // Somebody who is not in the room can still write into it — an escalation
  // should not require a membership dance first — and writing puts them in it.
  let authorParticipantId = author?.id ?? null;
  if (!authorParticipantId) {
    authorParticipantId = await addParticipantInternal({
      conversationId: conv.id,
      profileId: args.profileId,
      displayName: authorName,
      email: profile.email,
      addedBy: args.profileId,
      existing: participants,
    });
  }

  // Who the mentions may reach. `@everyone` on an internal note is the internal
  // half of the room — see audienceFor.
  const audience = audienceFor(args.visibility, participants);
  const parsed = parseMentions(
    body,
    audience.map((p) => ({ id: p.id, handle: p.handle, display_name: p.display_name })),
  );

  // A mention that names somebody the message cannot reach is refused rather
  // than dropped. Naming a customer contact in an internal note is a mistake
  // with one obvious fix (say it in the shared thread), and silently not
  // notifying them is the worse half of the two possible failures.
  const outOfAudience = parseMentions(
    body,
    participants
      .filter((p) => p.removed_at === null)
      .map((p) => ({ id: p.id, handle: p.handle, display_name: p.display_name })),
  ).ids.filter((id) => !audience.some((p) => p.id === id));
  if (outOfAudience.length > 0) {
    const names = participants
      .filter((p) => outOfAudience.includes(p.id))
      .map((p) => `@${p.handle}`);
    throw new ConversationError(
      `An internal note cannot mention ${names.join(", ")} — they are on the customer side and would be notified about a message they cannot read. Post it as a shared message, or drop the mention.`,
    );
  }

  const mentionIds = parsed.everyone
    ? [...new Set([...parsed.ids, ...audience.map((p) => p.id)])].filter(
        (id) => id !== authorParticipantId,
      )
    : parsed.ids.filter((id) => id !== authorParticipantId);

  const { data: inserted, error } = await db()
    .from("conversation_messages")
    .insert({
      conversation_id: conv.id,
      author_kind: "internal",
      author_profile_id: args.profileId,
      author_name: authorName,
      visibility: args.visibility,
      body,
    })
    .select("id, created_at")
    .single();
  if (error) throw new ConversationError(`The message did not send: ${error.message}`);

  if (mentionIds.length > 0) {
    const { error: mErr } = await db()
      .from("conversation_mentions")
      .insert(mentionIds.map((id) => ({ message_id: inserted.id, participant_id: id })));
    if (mErr) {
      // The message is already in the thread; failing the whole request now
      // would leave the sender retyping something that was in fact sent. The
      // mentions are what is lost, and that is worth a loud log.
      console.error("[conversation] mentions failed for message", inserted.id, mErr.message);
    }
  }

  await audit({
    actor_type: "user",
    actor_id: args.profileId,
    action:
      args.visibility === "shared"
        ? "conversation_message_shared"
        : "conversation_message_internal",
    entity_type: "implementation",
    entity_id: args.implementationId,
    payload: { conversation_id: conv.id, message_id: inserted.id, mentions: mentionIds.length },
  });

  await notify({
    conversationId: conv.id,
    implementationId: args.implementationId,
    visibility: args.visibility,
    authorKind: "internal",
    authorName,
    authorParticipantId,
    mentionIds,
    body,
    participants,
  });

  if (parsed.unknown.length > 0) {
    // Not an error — the message is sent and useful. The caller surfaces it so
    // the sender learns that "@daan" reached nobody, instead of assuming it did.
    console.warn("[conversation] unresolved handles", parsed.unknown.join(", "));
  }

  return loadConversation(args.implementationId, args.profileId);
}

async function addParticipantInternal(args: {
  conversationId: string;
  profileId: string;
  displayName: string;
  email: string | null;
  addedBy: string | null;
  existing: Participant[];
}): Promise<string> {
  // Re-adding somebody who was removed revives their row: it keeps their handle
  // (which past messages address) and their read cursor.
  const { data: prior } = await db()
    .from("conversation_participants")
    .select("id")
    .eq("conversation_id", args.conversationId)
    .eq("profile_id", args.profileId)
    .maybeSingle();
  if (prior) {
    await db().from("conversation_participants").update({ removed_at: null }).eq("id", prior.id);
    return prior.id;
  }

  const handle = makeHandle(
    args.displayName,
    args.email,
    args.existing.map((p) => p.handle),
  );
  const { data, error } = await db()
    .from("conversation_participants")
    .insert({
      conversation_id: args.conversationId,
      party_kind: "internal",
      profile_id: args.profileId,
      display_name: args.displayName,
      email: args.email,
      handle,
      added_by: args.addedBy,
    })
    .select("id")
    .single();
  if (error) throw new ConversationError(`Could not join the conversation: ${error.message}`);
  return data.id as string;
}

/** Add a colleague or a customer contact to the room. */
export async function addParticipant(args: {
  implementationId: string;
  actingProfileId: string;
  profileId?: string | undefined;
  contactId?: string | undefined;
}): Promise<ConversationView> {
  await requireEnabled();
  if (!args.profileId === !args.contactId) {
    throw new ConversationError("Add either a teammate or a customer contact, not both.");
  }
  const conv = await ensureConversation(args.implementationId, args.actingProfileId);
  const existing = await loadParticipants(conv.id);

  if (args.profileId) {
    const { data: p } = await db()
      .from("portal_profiles")
      .select("id, full_name, email")
      .eq("id", args.profileId)
      .maybeSingle();
    if (!p) throw new ConversationError("That teammate could not be found.");
    await addParticipantInternal({
      conversationId: conv.id,
      profileId: p.id,
      displayName: p.full_name || p.email || "Teammate",
      email: p.email,
      addedBy: args.actingProfileId,
      existing,
    });
  } else {
    const { data: c } = await db()
      .from("customer_contacts")
      .select("id, name, email, customer_id")
      .eq("id", args.contactId)
      .maybeSingle();
    if (!c) throw new ConversationError("That contact could not be found.");
    // The trigger in 0029 refuses a contact from another customer. Checking
    // here too is what turns a constraint violation into a sentence.
    if (c.customer_id !== conv.customer_id) {
      throw new ConversationError("That contact belongs to a different customer.");
    }
    const { data: prior } = await db()
      .from("conversation_participants")
      .select("id")
      .eq("conversation_id", conv.id)
      .eq("contact_id", c.id)
      .maybeSingle();
    if (prior) {
      await db().from("conversation_participants").update({ removed_at: null }).eq("id", prior.id);
    } else {
      const handle = makeHandle(
        c.name,
        c.email,
        existing.map((p) => p.handle),
      );
      const { error } = await db().from("conversation_participants").insert({
        conversation_id: conv.id,
        party_kind: "external",
        contact_id: c.id,
        display_name: c.name,
        email: c.email,
        handle,
        added_by: args.actingProfileId,
      });
      if (error) throw new ConversationError(`Could not add them: ${error.message}`);
    }
  }

  await audit({
    actor_type: "user",
    actor_id: args.actingProfileId,
    action: "conversation_participant_added",
    entity_type: "implementation",
    entity_id: args.implementationId,
    payload: { conversation_id: conv.id, profile_id: args.profileId, contact_id: args.contactId },
  });
  return loadConversation(args.implementationId, args.actingProfileId);
}

/** Remove somebody. Their handle stays reserved and their messages stay. */
export async function removeParticipant(args: {
  implementationId: string;
  actingProfileId: string;
  participantId: string;
}): Promise<ConversationView> {
  await requireEnabled();
  const conv = await ensureConversation(args.implementationId, args.actingProfileId);
  const { error } = await db()
    .from("conversation_participants")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", args.participantId)
    .eq("conversation_id", conv.id);
  if (error) throw new ConversationError(`Could not remove them: ${error.message}`);

  await audit({
    actor_type: "user",
    actor_id: args.actingProfileId,
    action: "conversation_participant_removed",
    entity_type: "implementation",
    entity_id: args.implementationId,
    payload: { conversation_id: conv.id, participant_id: args.participantId },
  });
  return loadConversation(args.implementationId, args.actingProfileId);
}

export async function markRead(implementationId: string, profileId: string): Promise<void> {
  const conv = await ensureConversation(implementationId, profileId);
  const { data: me } = await db()
    .from("conversation_participants")
    .select("id")
    .eq("conversation_id", conv.id)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!me) return;
  await db()
    .from("conversation_reads")
    .upsert(
      { conversation_id: conv.id, participant_id: me.id, last_read_at: new Date().toISOString() },
      { onConflict: "conversation_id,participant_id" },
    );
}

/* ------------------------------------------------------------------------- */
/* Notification                                                               */
/* ------------------------------------------------------------------------- */

/**
 * One email per recipient, never more. The audience rules live in
 * `conversation.ts` so the external door applies exactly the same ones.
 *
 * A failure here does not fail the message. The message is already in the
 * thread and is the durable record; an email that did not send is a missed
 * nudge, not lost content, and turning it into an error would make somebody
 * retype something that was in fact posted.
 */
async function notify(args: {
  conversationId: string;
  implementationId: string;
  visibility: MessageVisibility;
  authorKind: Message["author_kind"];
  authorName: string;
  authorParticipantId: string | null;
  mentionIds: string[];
  body: string;
  participants: Participant[];
}): Promise<void> {
  const recipients = recipientsFor({
    visibility: args.visibility,
    authorKind: args.authorKind,
    authorParticipantId: args.authorParticipantId,
    mentionIds: args.mentionIds,
    participants: args.participants,
  });
  if (recipients.length === 0) return;

  const { data: impl } = await db()
    .from("implementations")
    .select("name")
    .eq("id", args.implementationId)
    .maybeSingle();
  const project = impl?.name ?? "your project";
  const excerpt = args.body.length > 400 ? `${args.body.slice(0, 400)}…` : args.body;

  for (const { participant, reason } of recipients) {
    // Two different links, because they are two different products. An internal
    // participant gets the hub; a customer contact gets the portal, and never a
    // hub URL they cannot open.
    const link =
      participant.party_kind === "internal"
        ? `${appUrl()}/customers?impl=${args.implementationId}`
        : `${appUrl()}/portal`;
    const subject =
      reason === "mentioned"
        ? `${args.authorName} mentioned you — ${project}`
        : `${args.authorName} posted in ${project}`;
    try {
      await sendEmail({
        to: participant.email!,
        subject,
        html:
          `<p><strong>${escapeHtml(args.authorName)}</strong> in <em>${escapeHtml(project)}</em>:</p>` +
          `<blockquote style="border-left:3px solid #ddd;padding-left:12px;color:#333">${escapeHtml(excerpt)}</blockquote>` +
          `<p><a href="${link}">Open the conversation</a></p>`,
      });
      if (reason === "mentioned") {
        await db()
          .from("conversation_mentions")
          .update({ notified_at: new Date().toISOString() })
          .eq("participant_id", participant.id)
          .is("notified_at", null);
      }
    } catch (e) {
      console.error("[conversation] notification failed for", participant.id, e);
    }
  }
}

/** Used by the external door, which has its own authorization in front of it. */
export { notify as notifyConversation };
export { EVERYONE_HANDLE };
