import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { audit } from "./server/audit";
import { sendEmail } from "./server/email";
import { CONFIG_DEFAULTS, getConfigNumber } from "./server/app-config";
import { isFlagOn } from "./app-config.server";
import {
  ExternalAccessError,
  grantForId,
  grantForToken,
  loadSharedPlan,
  requireActionsEnabled,
  requireViewEnabled,
  viewerForGrant,
  workItemForRef,
  type GrantRow,
} from "./server/external-viewer";
import {
  generatePlanToken,
  hashPasscode,
  signPlanSession,
  verifyPasscode,
  verifyPlanSession,
} from "./server/plan-tokens";
import type { SharedPlan } from "./shared-plan";
import { appUrl } from "./app-url";

/**
 * The signed-link door and the five things a customer can do behind it.
 *
 * Everything here runs on the service role, so this module and
 * `server/external-viewer.ts` are the entire authorization surface for
 * unauthenticated visitors. Two rules hold throughout:
 *
 *  - a request's authority comes from the GRANT ROW, re-read every time, never
 *    from anything the client sent (a cookie only says which grant to re-read);
 *  - every mutation is recorded in three places before it returns — the
 *    append-only `external_plan_events` row, `portal_audit_log`, and the
 *    account activity feed `audit_log` — because those rows, not the columns
 *    they update, are the evidence of what happened.
 */

const db = () => supabaseAdmin as any;

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export const PASSCODE_MAX_ATTEMPTS = 5;
export const PASSCODE_LOCK_MINUTES = 15;
export const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const UPLOAD_MIME_ALLOWLIST = [
  "application/pdf",
  "text/csv",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/zip",
] as const;

/* ------------------------------------------------------------------------- */
/* Telemetry + audit                                                          */
/* ------------------------------------------------------------------------- */

export type PlanEventName =
  | "opened"
  | "task_completed"
  | "task_reopened"
  | "comment_added"
  | "file_uploaded"
  | "task_reassigned"
  | "snapshot_viewed"
  | "passcode_failed"
  | "grant_revoked"
  | "grant_rotated";

/** Append-only. Never rendered to a customer; input for the Phase 6 signal. */
export async function recordPlanEvent(entry: {
  grantId?: string | null;
  implementationId: string;
  contactId?: string | null;
  profileId?: string | null;
  event: PlanEventName;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db()
      .from("external_plan_events")
      .insert({
        grant_id: entry.grantId ?? null,
        implementation_id: entry.implementationId,
        contact_id: entry.contactId ?? null,
        profile_id: entry.profileId ?? null,
        event: entry.event,
        metadata: entry.metadata ?? null,
      });
  } catch (e) {
    console.error("[external] plan event write failed", entry.event, e);
  }
}

/**
 * Both audit stores, per decision 3 in docs/PLAN.md: `portal_audit_log` is the
 * action-level security log, `audit_log` is the account activity feed the hub
 * actually renders. An external action has to appear in both, and neither may
 * carry the raw token — the grant id is the actor, and the grant id is not a
 * credential.
 */
async function auditExternal(entry: {
  grant: GrantRow;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  fieldName?: string;
  oldValue?: string | null;
  newValue?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await audit({
    actor_type: "external_contact",
    actor_id: entry.grant.id,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    payload: { email: entry.grant.email, ...(entry.payload ?? {}) },
  });
  try {
    await db()
      .from("audit_log")
      .insert({
        entity_id: entry.entityId,
        entity_type: entry.entityType,
        field_name: entry.fieldName ?? null,
        old_value: entry.oldValue ?? null,
        new_value: entry.newValue ?? null,
        change_reason: entry.action,
        actor_type: "external_contact",
        actor_label: entry.actorName,
        actor_contact_id: entry.grant.contact_id,
      });
  } catch (e) {
    console.error("[external] activity feed write failed", entry.action, e);
  }
}

async function contactNameFor(grant: GrantRow): Promise<string> {
  if (!grant.contact_id) return grant.email;
  const { data } = await db()
    .from("customer_contacts")
    .select("name")
    .eq("id", grant.contact_id)
    .maybeSingle();
  return data?.name || grant.email;
}

async function notifyOwner(implementationId: string, subject: string, body: string): Promise<void> {
  try {
    const { data: impl } = await db()
      .from("implementations")
      .select("name, owner_id")
      .eq("id", implementationId)
      .maybeSingle();
    if (!impl?.owner_id) return;
    const { data: owner } = await db()
      .from("team_members")
      .select("email")
      .eq("id", impl.owner_id)
      .maybeSingle();
    if (!owner?.email) return;
    await sendEmail({
      to: owner.email,
      subject,
      html: `<p>${escapeHtml(body)}</p><p style="color:#666">${escapeHtml(impl.name)}</p>`,
    });
  } catch (e) {
    console.error("[external] owner notification failed", e);
  }
}

/* ------------------------------------------------------------------------- */
/* The door                                                                   */
/* ------------------------------------------------------------------------- */

export type PlanDoorResult =
  | { state: "plan"; plan: SharedPlan; session: string | null }
  | { state: "passcode"; session: null; wrong: boolean }
  | { state: "locked"; session: null }
  | { state: "unavailable"; session: null };

/**
 * Open a link. Called from the SSR loader, so it deliberately records NO
 * event: security scanners follow links in email, and an 'opened' written here
 * would be indistinguishable from the customer reading their plan. The
 * post-hydration beacon (`recordOpen`) is what records a real open.
 */
export async function openPlanWithToken(
  rawToken: string,
  passcode?: string | null,
): Promise<PlanDoorResult> {
  try {
    await requireViewEnabled();
    const grant = await grantForToken(rawToken);
    const passcodeVerified = await checkPasscode(grant, passcode);
    const plan = await loadSharedPlan(viewerForGrant(grant));
    return {
      state: "plan",
      plan,
      session: await signPlanSession({ grantId: grant.id, passcodeVerified }),
    };
  } catch (e) {
    return doorFailure(e);
  }
}

/** Continue an established session. Re-reads the grant, so revocation bites. */
export async function planForSession(cookie: string | undefined): Promise<PlanDoorResult> {
  try {
    await requireViewEnabled();
    const grant = await requireSessionGrant(cookie);
    const plan = await loadSharedPlan(viewerForGrant(grant));
    return { state: "plan", plan, session: null };
  } catch (e) {
    return doorFailure(e);
  }
}

function doorFailure(e: unknown): PlanDoorResult {
  if (e instanceof ExternalAccessError) {
    if (e.code === "passcode_required" || e.code === "passcode_wrong") {
      return { state: "passcode", session: null, wrong: e.code === "passcode_wrong" };
    }
    if (e.code === "locked") return { state: "locked", session: null };
    return { state: "unavailable", session: null };
  }
  console.error("[external] door failure", e);
  return { state: "unavailable", session: null };
}

async function checkPasscode(grant: GrantRow, passcode?: string | null): Promise<boolean> {
  if (!grant.passcode_hash) return false;
  if (!passcode) throw new ExternalAccessError("passcode_required", "passcode not supplied");

  if (verifyPasscode(passcode, grant.passcode_hash)) {
    if (grant.passcode_attempts > 0) {
      await db()
        .from("external_access_grants")
        .update({ passcode_attempts: 0, locked_until: null })
        .eq("id", grant.id);
    }
    return true;
  }

  const attempts = grant.passcode_attempts + 1;
  const locked = attempts >= PASSCODE_MAX_ATTEMPTS;
  await db()
    .from("external_access_grants")
    .update({
      passcode_attempts: locked ? 0 : attempts,
      locked_until: locked
        ? new Date(Date.now() + PASSCODE_LOCK_MINUTES * 60_000).toISOString()
        : null,
    })
    .eq("id", grant.id);
  await recordPlanEvent({
    grantId: grant.id,
    implementationId: grant.implementation_id,
    contactId: grant.contact_id,
    event: "passcode_failed",
    metadata: { attempt: attempts },
  });
  throw new ExternalAccessError(
    locked ? "locked" : "passcode_wrong",
    locked ? "locked after failed passcodes" : "wrong passcode",
  );
}

/**
 * The gate every mutation goes through. A cookie names a grant; it never
 * carries authority of its own, and a grant that has since been revoked,
 * expired or had a passcode added stops working here.
 */
async function requireSessionGrant(cookie: string | undefined): Promise<GrantRow> {
  const session = await verifyPlanSession(cookie);
  if (!session) throw new ExternalAccessError("unavailable", "no session");
  const grant = await grantForId(session.grantId);
  if (grant.passcode_hash && !session.passcodeVerified) {
    throw new ExternalAccessError("passcode_required", "session predates the passcode");
  }
  return grant;
}

/* ------------------------------------------------------------------------- */
/* Telemetry beacon                                                           */
/* ------------------------------------------------------------------------- */

/**
 * Records that a human actually rendered the page. Deduped to one row per grant
 * per hour — a new rule, not a precedent: the sequences `recordView` dedupes
 * once ever, which is the wrong shape for a plan a customer revisits.
 */
export async function recordOpen(cookie: string | undefined): Promise<{ recorded: boolean }> {
  try {
    await requireViewEnabled();
    const grant = await requireSessionGrant(cookie);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent } = await db()
      .from("external_plan_events")
      .select("id")
      .eq("grant_id", grant.id)
      .eq("event", "opened")
      .gte("created_at", since)
      .limit(1);
    if ((recent ?? []).length > 0) return { recorded: false };

    await recordPlanEvent({
      grantId: grant.id,
      implementationId: grant.implementation_id,
      contactId: grant.contact_id,
      event: "opened",
    });
    await db()
      .from("external_access_grants")
      .update({ last_opened_at: new Date().toISOString(), open_count: grant.open_count + 1 })
      .eq("id", grant.id);
    return { recorded: true };
  } catch {
    // Telemetry never fails a page.
    return { recorded: false };
  }
}

/* ------------------------------------------------------------------------- */
/* Actions                                                                    */
/* ------------------------------------------------------------------------- */

export async function completeTask(
  cookie: string | undefined,
  ref: string,
): Promise<{ plan: SharedPlan }> {
  await requireActionsEnabled();
  const grant = await requireSessionGrant(cookie);
  if (!grant.can_complete) {
    throw new ExternalAccessError("forbidden", "grant is read-only");
  }
  const item = await workItemForRef(grant.implementation_id, ref);
  if (item.visibility !== "shared" || item.party !== "customer") {
    throw new ExternalAccessError("forbidden", "task is not the customer's shared work");
  }
  if (item.status === "done") return { plan: await loadSharedPlan(viewerForGrant(grant)) };

  // Dependency gating, computed from the predecessors — never read off a
  // status column (see src/lib/work-items.ts for why).
  if (item.depends_on.length) {
    const { data: deps } = await db()
      .from("work_items")
      .select("id, status")
      .in("id", item.depends_on);
    const open = ((deps ?? []) as any[]).filter(
      (d) => d.status !== "done" && d.status !== "skipped",
    );
    if (open.length) throw new ExternalAccessError("forbidden", "task is blocked");
  }

  const now = new Date().toISOString();
  await db()
    .from("work_items")
    .update({
      status: "done",
      completed_at: now,
      completed_by_contact_id: grant.contact_id,
      completed_via: "external_link",
    })
    .eq("id", item.id);

  const actorName = await contactNameFor(grant);
  await recordPlanEvent({
    grantId: grant.id,
    implementationId: grant.implementation_id,
    contactId: grant.contact_id,
    event: "task_completed",
    metadata: { work_item_id: item.id, title: item.title },
  });
  await auditExternal({
    grant,
    actorName,
    action: "external.task_completed",
    entityType: "work_item",
    entityId: item.id,
    fieldName: "status",
    oldValue: item.status,
    newValue: "done",
  });
  await notifyOwner(
    grant.implementation_id,
    `${actorName} completed "${item.title}"`,
    `${actorName} (${grant.email}) marked "${item.title}" complete from their plan link.`,
  );

  return { plan: await loadSharedPlan(viewerForGrant(grant)) };
}

/**
 * Reopen.
 *
 * `completed_by_contact_id` and `completed_at` are deliberately NOT cleared:
 * they are a pointer to the latest recorded completion, and the completion
 * itself is the `task_completed` event, which stays. Erasing the pointer would
 * erase the only rendering of who did it.
 */
export async function reopenTask(
  cookie: string | undefined,
  ref: string,
): Promise<{ plan: SharedPlan }> {
  await requireActionsEnabled();
  const grant = await requireSessionGrant(cookie);
  if (!grant.can_complete) throw new ExternalAccessError("forbidden", "grant is read-only");
  const item = await workItemForRef(grant.implementation_id, ref);
  if (item.visibility !== "shared" || item.party !== "customer") {
    throw new ExternalAccessError("forbidden", "task is not the customer's shared work");
  }

  await db().from("work_items").update({ status: "in_progress" }).eq("id", item.id);

  const actorName = await contactNameFor(grant);
  await recordPlanEvent({
    grantId: grant.id,
    implementationId: grant.implementation_id,
    contactId: grant.contact_id,
    event: "task_reopened",
    metadata: { work_item_id: item.id, title: item.title },
  });
  await auditExternal({
    grant,
    actorName,
    action: "external.task_reopened",
    entityType: "work_item",
    entityId: item.id,
    fieldName: "status",
    oldValue: item.status,
    newValue: "in_progress",
  });
  return { plan: await loadSharedPlan(viewerForGrant(grant)) };
}

export async function addComment(
  cookie: string | undefined,
  ref: string,
  body: string,
): Promise<{ plan: SharedPlan }> {
  await requireActionsEnabled();
  const grant = await requireSessionGrant(cookie);
  const item = await workItemForRef(grant.implementation_id, ref);
  if (item.visibility !== "shared") {
    throw new ExternalAccessError("forbidden", "task is not shared");
  }
  const text = body.trim();
  if (!text) throw new ExternalAccessError("forbidden", "empty comment");

  await db()
    .from("work_item_comments")
    .insert({
      work_item_id: item.id,
      author_contact_id: grant.contact_id,
      // Forced server-side. An external commenter can never write an internal
      // note, whatever the request says.
      internal: false,
      body: text.slice(0, 4000),
    });

  const actorName = await contactNameFor(grant);
  await recordPlanEvent({
    grantId: grant.id,
    implementationId: grant.implementation_id,
    contactId: grant.contact_id,
    event: "comment_added",
    metadata: { work_item_id: item.id },
  });
  await auditExternal({
    grant,
    actorName,
    action: "external.comment_added",
    entityType: "work_item",
    entityId: item.id,
  });
  await notifyOwner(
    grant.implementation_id,
    `${actorName} commented on "${item.title}"`,
    `${actorName} (${grant.email}) left a comment on "${item.title}".`,
  );
  return { plan: await loadSharedPlan(viewerForGrant(grant)) };
}

/**
 * A customer writes into the project conversation.
 *
 * This is the one action here that has no work item behind it — the point of
 * the thread is that "can we move the kickoff?" is not a comment on a task.
 *
 * Four things are forced server-side and none of them are the client's to say:
 *
 *  - `author_kind: "external"` and `visibility: "shared"`. 0029's trigger
 *    refuses an external author writing an internal message, so a bug here is a
 *    caught error rather than an internal thread a customer can post into.
 *  - `author_contact_id` comes from the GRANT, re-read this request, never from
 *    the body.
 *  - `author_name` is snapshotted from the contact record, not accepted as
 *    input; a name that arrived from outside would let a link bearer sign a
 *    message as somebody else.
 *  - mentions are NOT parsed from a customer's message. A customer can see the
 *    participant list but not the handles, and letting an outside body create
 *    mention rows would make an external write able to address the internal
 *    side directly. They reach us the same way either way: `notifyConversation`
 *    treats a customer message as crossing the line and mails the internal
 *    participants.
 */
export async function postConversationMessage(
  cookie: string | undefined,
  body: string,
): Promise<{ plan: SharedPlan }> {
  await requireActionsEnabled();
  if (!(await isFlagOn("conversations"))) {
    throw new ExternalAccessError("forbidden", "conversations flag is off");
  }
  const grant = await requireSessionGrant(cookie);
  const text = body.trim();
  if (!text) throw new ExternalAccessError("forbidden", "empty message");
  if (text.length > 20000) throw new ExternalAccessError("forbidden", "message too long");
  if (!grant.contact_id) {
    // A grant with no contact behind it can read the plan but cannot speak in
    // the thread: there would be no participant row to attribute the message
    // to, and an unattributed message in a shared thread is worse than none.
    throw new ExternalAccessError("forbidden", "grant has no contact to post as");
  }

  const { ensureConversation, loadParticipants, notifyConversation } =
    await import("./conversation.server");
  const conv = await ensureConversation(grant.implementation_id, null);
  const participants = (await loadParticipants(conv.id)) as any[];

  // The sender has to be in the room to post. They are seeded when the thread
  // is created and added when a link is issued; this covers the case where a
  // link was issued before the thread existed.
  let me = participants.find((p) => p.contact_id === grant.contact_id && p.removed_at === null);
  if (!me) {
    const { makeHandle } = await import("./mentions");
    const actorName = await contactNameFor(grant);
    const { data: revived } = await db()
      .from("conversation_participants")
      .select("id")
      .eq("conversation_id", conv.id)
      .eq("contact_id", grant.contact_id)
      .maybeSingle();
    if (revived) {
      await db()
        .from("conversation_participants")
        .update({ removed_at: null })
        .eq("id", revived.id);
      me = { id: revived.id };
    } else {
      const handle = makeHandle(
        actorName,
        grant.email,
        participants.map((p) => p.handle),
      );
      const { data: added, error } = await db()
        .from("conversation_participants")
        .insert({
          conversation_id: conv.id,
          party_kind: "external",
          contact_id: grant.contact_id,
          display_name: actorName,
          email: grant.email,
          handle,
        })
        .select("id")
        .single();
      if (error)
        throw new ExternalAccessError("forbidden", `could not join thread: ${error.message}`);
      me = added;
    }
  }

  const actorName = await contactNameFor(grant);
  const { data: inserted, error } = await db()
    .from("conversation_messages")
    .insert({
      conversation_id: conv.id,
      author_kind: "external",
      author_contact_id: grant.contact_id,
      author_grant_id: grant.id,
      author_name: actorName,
      visibility: "shared",
      body: text,
    })
    .select("id")
    .single();
  if (error) throw new ExternalAccessError("forbidden", `message rejected: ${error.message}`);

  await recordPlanEvent({
    grantId: grant.id,
    implementationId: grant.implementation_id,
    contactId: grant.contact_id,
    event: "comment_added",
    metadata: { conversation_id: conv.id, message_id: inserted.id, surface: "conversation" },
  });
  await auditExternal({
    grant,
    actorName,
    action: "external.conversation_message",
    entityType: "implementation",
    entityId: grant.implementation_id,
    payload: { conversation_id: conv.id, message_id: inserted.id },
  });

  await notifyConversation({
    conversationId: conv.id,
    implementationId: grant.implementation_id,
    visibility: "shared",
    authorKind: "external",
    authorName: actorName,
    authorParticipantId: me.id,
    mentionIds: [],
    body: text,
    participants: await loadParticipants(conv.id),
  });

  return { plan: await loadSharedPlan(viewerForGrant(grant)) };
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  return (cleaned || "file").slice(0, 120);
}

export async function uploadFile(
  cookie: string | undefined,
  input: { ref: string; fileName: string; mimeType: string; contentBase64: string },
): Promise<{ plan: SharedPlan }> {
  await requireActionsEnabled();
  const grant = await requireSessionGrant(cookie);
  const item = await workItemForRef(grant.implementation_id, input.ref);
  if (item.visibility !== "shared")
    throw new ExternalAccessError("forbidden", "task is not shared");

  if (!(UPLOAD_MIME_ALLOWLIST as readonly string[]).includes(input.mimeType)) {
    throw new ExternalAccessError("forbidden", `mime type not allowed: ${input.mimeType}`);
  }
  const bytes = Buffer.from(input.contentBase64, "base64");
  if (bytes.byteLength === 0) throw new ExternalAccessError("forbidden", "empty file");
  if (bytes.byteLength > UPLOAD_MAX_BYTES) {
    throw new ExternalAccessError("forbidden", "file is larger than 25 MB");
  }

  const safeName = sanitizeFileName(input.fileName);
  // The prefix is built from the GRANT's implementation, never from anything
  // the client sent, so an upload can only ever land under its own account.
  const path = `implementations/${grant.implementation_id}/external/${grant.id}/${crypto.randomUUID()}_${safeName}`;

  const { error } = await (supabaseAdmin as any).storage
    .from("attachments")
    .upload(path, bytes, { contentType: input.mimeType, upsert: false });
  if (error) throw new ExternalAccessError("forbidden", `upload failed: ${error.message}`);

  await db().from("work_item_files").insert({
    work_item_id: item.id,
    implementation_id: grant.implementation_id,
    storage_path: path,
    file_name: safeName,
    mime_type: input.mimeType,
    size_bytes: bytes.byteLength,
    uploaded_by_contact_id: grant.contact_id,
  });

  const actorName = await contactNameFor(grant);
  await recordPlanEvent({
    grantId: grant.id,
    implementationId: grant.implementation_id,
    contactId: grant.contact_id,
    event: "file_uploaded",
    metadata: { work_item_id: item.id, file_name: safeName, size_bytes: bytes.byteLength },
  });
  await auditExternal({
    grant,
    actorName,
    action: "external.file_uploaded",
    entityType: "work_item",
    entityId: item.id,
    newValue: safeName,
  });
  await notifyOwner(
    grant.implementation_id,
    `${actorName} uploaded ${safeName}`,
    `${actorName} (${grant.email}) uploaded "${safeName}" against "${item.title}".`,
  );
  return { plan: await loadSharedPlan(viewerForGrant(grant)) };
}

/**
 * Hand the link to a colleague.
 *
 * The new grant INHERITS the parent's `expires_at` and passcode, never a fresh
 * TTL. Without that, anyone holding a leaked link could reassign to a second
 * address of their own and renew access forever, which would make expiry
 * advisory. Only internal staff can extend access, and only by rotating.
 */
export async function reassign(
  cookie: string | undefined,
  input: { name: string; email: string },
): Promise<{ ok: true; prefix: string }> {
  await requireActionsEnabled();
  const grant = await requireSessionGrant(cookie);

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ExternalAccessError("forbidden", "invalid email");
  }
  if (!name) throw new ExternalAccessError("forbidden", "name required");

  const limit = await getConfigNumber(
    "external_plan_reassign_daily_limit",
    CONFIG_DEFAULTS.external_plan_reassign_daily_limit,
  );
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await db()
    .from("external_plan_events")
    .select("id")
    .eq("grant_id", grant.id)
    .eq("event", "task_reassigned")
    .gte("created_at", since);
  if ((recent ?? []).length >= limit) {
    throw new ExternalAccessError("forbidden", "reassign rate limit reached");
  }

  // Find-or-create the colleague under the SAME customer. A contact under any
  // other customer is not reachable from here at all.
  const { data: existing } = await db()
    .from("customer_contacts")
    .select("id, customer_id")
    .eq("customer_id", grant.customer_id)
    .ilike("email", email)
    .maybeSingle();

  let contactId: string;
  if (existing) {
    if (existing.customer_id !== grant.customer_id) {
      throw new ExternalAccessError("forbidden", "contact belongs to another customer");
    }
    contactId = existing.id;
  } else {
    const { data: created, error } = await db()
      .from("customer_contacts")
      .insert({
        customer_id: grant.customer_id,
        name,
        role: "Invited by a colleague",
        email,
      })
      .select("id")
      .single();
    if (error || !created) throw new ExternalAccessError("forbidden", "could not create contact");
    contactId = created.id;
  }

  const minted = generatePlanToken();
  const { error: grantError } = await db().from("external_access_grants").insert({
    implementation_id: grant.implementation_id,
    customer_id: grant.customer_id,
    contact_id: contactId,
    email,
    token_hash: minted.hash,
    token_prefix: minted.prefix,
    can_complete: grant.can_complete,
    passcode_hash: grant.passcode_hash,
    expires_at: grant.expires_at,
    parent_grant_id: grant.id,
    created_via: "reassign",
  });
  if (grantError) throw new ExternalAccessError("forbidden", "could not issue grant");

  const actorName = await contactNameFor(grant);
  await recordPlanEvent({
    grantId: grant.id,
    implementationId: grant.implementation_id,
    contactId: grant.contact_id,
    event: "task_reassigned",
    metadata: { to_email: email },
  });
  await auditExternal({
    grant,
    actorName,
    action: "external.reassigned",
    entityType: "customer_contact",
    entityId: contactId,
    newValue: email,
    payload: { to_email: email, inherited_expiry: grant.expires_at },
  });

  await sendEmail({
    to: email,
    subject: "Your GoCanvas onboarding plan",
    html:
      `<p>${escapeHtml(actorName)} shared your onboarding plan with you.</p>` +
      `<p><a href="${appUrl()}/plan/${minted.token}">Open the plan</a></p>` +
      (grant.passcode_hash
        ? `<p>You will need the passcode ${escapeHtml(actorName)} was given.</p>`
        : "") +
      `<p style="color:#666">This link expires ${escapeHtml(grant.expires_at.slice(0, 10))}.</p>`,
  });
  await notifyOwner(
    grant.implementation_id,
    `${actorName} shared the plan link with ${email}`,
    `${actorName} (${grant.email}) invited ${email}. The new link inherits the original expiry (${grant.expires_at.slice(0, 10)}).`,
  );

  // The caller gets the prefix, never the token: the link went to the
  // colleague's inbox and nowhere else.
  return { ok: true, prefix: minted.prefix };
}
