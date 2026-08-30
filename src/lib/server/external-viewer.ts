import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isFlagOn } from "@/lib/app-config.server";
import { LIFECYCLE_STAGE_MAP, STAGE_ALIASES, type LifecycleStageId } from "@/lib/lifecycle";
import {
  buildSharedPlanDTO,
  taskRef,
  type SharedPlan,
  type SharedPlanInputs,
} from "@/lib/shared-plan";
import { hashToken } from "./plan-tokens";

/**
 * The single authorization + projection core for everything a customer can see
 * from outside the hub.
 *
 * The rule, and the review rule that goes with it: **nothing under /plan may
 * touch `supabaseAdmin` except this module and the action module that consumes
 * its `ExternalViewer`.** RLS cannot help here — a link bearer has no
 * `auth.uid()`, and every app query runs on the service role anyway — so the
 * choke point IS the security boundary. Widening it is not a refactor, it is a
 * change to the threat model.
 *
 * Every door produces an `ExternalViewer` and then reads through
 * `loadSharedPlan`, which projects through `buildSharedPlanDTO` and nothing
 * else.
 */

export type ExternalViewer =
  | {
      kind: "grant";
      grantId: string;
      implementationId: string;
      customerId: string;
      contactId: string | null;
      canComplete: boolean;
    }
  | { kind: "auth"; profileId: string; customerIds: string[]; implementationIds: string[] | null }
  // Internal staff (requireInternal-gated), and the snapshot generator, which
  // is the same thing: a read-only render of the customer's view.
  | { kind: "preview"; profileId: string | null };

const db = () => supabaseAdmin as any;

/* ------------------------------------------------------------------------- */
/* Neutral failures                                                           */
/* ------------------------------------------------------------------------- */

/**
 * Every credential failure renders the same page with the same words.
 *
 * A link that is expired, a link that was revoked, a link that never existed
 * and a link for someone else's implementation are indistinguishable from
 * outside — otherwise the error page is an oracle that tells an attacker which
 * of their guesses was a real token.
 */
export type ExternalAccessCode =
  "unavailable" | "passcode_required" | "passcode_wrong" | "locked" | "forbidden";

export class ExternalAccessError extends Error {
  constructor(
    readonly code: ExternalAccessCode,
    /** Never shown to the visitor; for server logs only. Never contains a token. */
    readonly reason: string,
  ) {
    super(code);
    this.name = "ExternalAccessError";
  }
}

export const NEUTRAL_MESSAGE =
  "This link isn't available. It may have expired, or been replaced by a newer one. " +
  "Ask your GoCanvas contact for a fresh link.";

/* ------------------------------------------------------------------------- */
/* Flag enforcement (server-side, not UI hiding)                              */
/* ------------------------------------------------------------------------- */

export async function requireViewEnabled(): Promise<void> {
  if (!(await isFlagOn("external_plan_view_enabled"))) {
    throw new ExternalAccessError("unavailable", "external_plan_view_enabled is off");
  }
}

export async function requireActionsEnabled(): Promise<void> {
  await requireViewEnabled();
  if (!(await isFlagOn("external_plan_actions_enabled"))) {
    throw new ExternalAccessError("forbidden", "external_plan_actions_enabled is off");
  }
}

/* ------------------------------------------------------------------------- */
/* Grants                                                                     */
/* ------------------------------------------------------------------------- */

export type GrantRow = {
  id: string;
  implementation_id: string;
  customer_id: string;
  contact_id: string | null;
  email: string;
  can_complete: boolean;
  passcode_hash: string | null;
  passcode_attempts: number;
  locked_until: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_via: string;
  parent_grant_id: string | null;
  open_count: number;
};

const GRANT_COLUMNS =
  "id, implementation_id, customer_id, contact_id, email, can_complete, passcode_hash, " +
  "passcode_attempts, locked_until, expires_at, revoked_at, created_via, parent_grant_id, open_count";

function assertUsable(grant: GrantRow | null, why: string): GrantRow {
  if (!grant) throw new ExternalAccessError("unavailable", `${why}: no such grant`);
  if (grant.revoked_at) throw new ExternalAccessError("unavailable", `${why}: revoked`);
  if (new Date(grant.expires_at).getTime() <= Date.now()) {
    throw new ExternalAccessError("unavailable", `${why}: expired`);
  }
  if (grant.locked_until && new Date(grant.locked_until).getTime() > Date.now()) {
    // Locked is deliberately reported as "locked" rather than folded into the
    // neutral message: the person on the other end entered a passcode and needs
    // to be told to wait, and an attacker learns nothing they did not just do.
    throw new ExternalAccessError("locked", `${why}: locked out`);
  }
  return grant;
}

/** Resolve a raw `gcpl_…` token. The raw value never leaves this function. */
export async function grantForToken(rawToken: string): Promise<GrantRow> {
  const { data } = await db()
    .from("external_access_grants")
    .select(GRANT_COLUMNS)
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle();
  return assertUsable((data ?? null) as GrantRow | null, "token");
}

/** Re-read the grant behind a session cookie. Called on EVERY request. */
export async function grantForId(grantId: string): Promise<GrantRow> {
  const { data } = await db()
    .from("external_access_grants")
    .select(GRANT_COLUMNS)
    .eq("id", grantId)
    .maybeSingle();
  return assertUsable((data ?? null) as GrantRow | null, "cookie");
}

export function viewerForGrant(grant: GrantRow): ExternalViewer {
  return {
    kind: "grant",
    grantId: grant.id,
    implementationId: grant.implementation_id,
    customerId: grant.customer_id,
    contactId: grant.contact_id,
    canComplete: grant.can_complete,
  };
}

/* ------------------------------------------------------------------------- */
/* Scope resolution                                                           */
/* ------------------------------------------------------------------------- */

type ImplementationRow = {
  id: string;
  customer_id: string;
  name: string;
  current_stage: string;
  target_launch_date: string | null;
  portal_key: string;
  owner_id: string | null;
};

const IMPL_COLUMNS =
  "id, customer_id, name, current_stage, target_launch_date, portal_key, owner_id";

/**
 * Turn a reference into an implementation the viewer is actually allowed to
 * read — the only place that decision is made.
 *
 * `ref` is a `portal_key` when it came from a URL, and is ignored entirely for
 * a grant viewer, whose scope is one implementation by construction. A grant
 * for implementation A asking for B's key does not get B; it gets Forbidden,
 * because the grant's own implementation is the only thing ever loaded.
 */
async function resolveImplementation(
  viewer: ExternalViewer,
  ref?: string | null,
): Promise<ImplementationRow> {
  if (viewer.kind === "grant") {
    if (ref) {
      const { data: asked } = await db()
        .from("implementations")
        .select("id")
        .eq("portal_key", ref)
        .maybeSingle();
      if (!asked || asked.id !== viewer.implementationId) {
        throw new ExternalAccessError("forbidden", "grant asked for another implementation");
      }
    }
    const { data } = await db()
      .from("implementations")
      .select(IMPL_COLUMNS)
      .eq("id", viewer.implementationId)
      .maybeSingle();
    if (!data) throw new ExternalAccessError("unavailable", "grant implementation missing");
    return data as ImplementationRow;
  }

  if (!ref) throw new ExternalAccessError("forbidden", "no implementation reference");
  const { data } = await db()
    .from("implementations")
    .select(IMPL_COLUMNS)
    .eq("portal_key", ref)
    .maybeSingle();
  if (!data) throw new ExternalAccessError("unavailable", "no implementation for key");
  const impl = data as ImplementationRow;

  if (viewer.kind === "auth") {
    if (!viewer.customerIds.includes(impl.customer_id)) {
      throw new ExternalAccessError("forbidden", "implementation belongs to another customer");
    }
    // 0011's implementation scope, honoured here too: a scoped login sees
    // exactly the implementation(s) it was granted, never a sibling.
    if (viewer.implementationIds && !viewer.implementationIds.includes(impl.id)) {
      throw new ExternalAccessError("forbidden", "implementation outside the login's scope");
    }
  }
  return impl;
}

function stageLabel(stage: string): { label: string; intent: string | null } {
  const id = (STAGE_ALIASES[stage] ?? stage) as LifecycleStageId;
  const found = LIFECYCLE_STAGE_MAP[id];
  return found ? { label: found.label, intent: found.intent } : { label: stage, intent: null };
}

/* ------------------------------------------------------------------------- */
/* The projection                                                             */
/* ------------------------------------------------------------------------- */

export async function loadSharedPlan(
  viewer: ExternalViewer,
  implementationRef?: string | null,
): Promise<SharedPlan> {
  const impl = await resolveImplementation(viewer, implementationRef);

  const [{ data: customer }, { data: items }, { data: milestones }, { data: commitments }] =
    await Promise.all([
      db().from("customers").select("id, name, logo_path").eq("id", impl.customer_id).maybeSingle(),
      db()
        .from("work_items")
        .select(
          "id, title, description, party, visibility, status, due_at, depends_on, completed_at, completed_by_contact_id, position",
        )
        .eq("implementation_id", impl.id),
      db()
        .from("milestones")
        .select("name, status, target_date, completed_date")
        .eq("implementation_id", impl.id),
      db()
        .from("commitments")
        .select("description, due_date, committed_to, fulfilled_at")
        .eq("implementation_id", impl.id),
    ]);

  const allItems = (items ?? []) as any[];
  const sharedIds = allItems.filter((w) => w.visibility === "shared").map((w) => w.id);

  const [{ data: comments }, { data: files }, { data: owner }, { data: conv }] = await Promise.all([
    sharedIds.length
      ? db()
          .from("work_item_comments")
          .select("work_item_id, body, created_at, author_profile_id, author_contact_id, internal")
          .in("work_item_id", sharedIds)
          .eq("internal", false)
      : Promise.resolve({ data: [] }),
    sharedIds.length
      ? db()
          .from("work_item_files")
          .select("id, work_item_id, file_name, size_bytes, created_at")
          .in("work_item_id", sharedIds)
      : Promise.resolve({ data: [] }),
    impl.owner_id
      ? db().from("team_members").select("name, email").eq("id", impl.owner_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db().from("project_conversations").select("id").eq("implementation_id", impl.id).maybeSingle(),
  ]);

  // The conversation. `visibility = 'shared'` is applied in the QUERY as well
  // as in the DTO: an internal note must not travel from the database to this
  // process at all when the reader is a customer, because a projection bug is
  // then a bug about something that is not in memory.
  //
  // Withdrawn messages are fetched rather than filtered out here so the DTO can
  // render "withdrawn" in place — a message that vanishes silently reads as the
  // customer having imagined it.
  const conversationsOn = await isFlagOn("conversations");
  const [{ data: convMessages }, { data: convParticipants }] =
    conv?.id && conversationsOn
      ? await Promise.all([
          db()
            .from("conversation_messages")
            .select("id, author_kind, author_name, visibility, body, created_at, deleted_at")
            .eq("conversation_id", conv.id)
            .eq("visibility", "shared")
            .order("created_at"),
          db()
            .from("conversation_participants")
            .select("display_name, party_kind, removed_at")
            .eq("conversation_id", conv.id),
        ])
      : [{ data: [] }, { data: [] }];

  // Posting needs the actions flag AND a link that is allowed to act. Checked
  // here rather than in the DTO so the button is absent, not merely disabled,
  // when the flag is off.
  const canPost =
    viewer.kind !== "preview" &&
    conversationsOn &&
    (await isFlagOn("external_plan_actions_enabled"));

  // Names for the people who appear in the projection — resolved here so the
  // DTO never carries an id it would have to be trusted not to render.
  const contactIds = new Set<string>();
  for (const w of allItems)
    if (w.completed_by_contact_id) contactIds.add(w.completed_by_contact_id);
  for (const c of (comments ?? []) as any[]) {
    if (c.author_contact_id) contactIds.add(c.author_contact_id);
  }
  const { data: contactRows } = contactIds.size
    ? await db()
        .from("customer_contacts")
        .select("id, name")
        .in("id", [...contactIds])
    : { data: [] };
  const contactName = new Map<string, string>(
    ((contactRows ?? []) as any[]).map((c) => [c.id, c.name]),
  );

  const profileIds = [
    ...new Set(
      ((comments ?? []) as any[]).map((c) => c.author_profile_id).filter((x): x is string => !!x),
    ),
  ];
  const { data: profileRows } = profileIds.length
    ? await db().from("portal_profiles").select("id, full_name").in("id", profileIds)
    : { data: [] };
  const profileName = new Map<string, string>(
    ((profileRows ?? []) as any[]).map((p) => [p.id, p.full_name || "GoCanvas"]),
  );

  const inputs: SharedPlanInputs = {
    customer: { name: customer?.name ?? "", logo_path: customer?.logo_path ?? null },
    implementation: {
      name: impl.name,
      current_stage: impl.current_stage,
      target_launch_date: impl.target_launch_date,
    },
    stage: stageLabel(impl.current_stage),
    workItems: allItems.map((w) => ({
      id: w.id,
      title: w.title,
      description: w.description ?? null,
      party: w.party,
      visibility: w.visibility,
      status: w.status,
      due_at: w.due_at ?? null,
      depends_on: w.depends_on ?? [],
      completed_at: w.completed_at ?? null,
      completed_by_name: w.completed_by_contact_id
        ? (contactName.get(w.completed_by_contact_id) ?? null)
        : null,
      position: w.position ?? 0,
    })),
    titlesById: Object.fromEntries(
      allItems.map((w) => [w.id, { title: w.title, status: w.status, visibility: w.visibility }]),
    ),
    milestones: (milestones ?? []) as any[],
    commitments: (commitments ?? []) as any[],
    comments: ((comments ?? []) as any[])
      // Belt and braces: the query already filters internal notes out, and so
      // does this. An internal comment reaching a customer is unrecoverable.
      .filter((c) => c.internal !== true)
      .map((c) => ({
        work_item_id: c.work_item_id,
        author: c.author_contact_id
          ? (contactName.get(c.author_contact_id) ?? "Your team")
          : (profileName.get(c.author_profile_id) ?? "GoCanvas"),
        body: c.body,
        created_at: c.created_at,
      })),
    files: (files ?? []) as any[],
    conversation: {
      messages: ((convMessages ?? []) as any[])
        // Belt and braces, exactly as with comments above: the query already
        // filtered, and so does this.
        .filter((m) => m.visibility === "shared")
        .map((m) => ({
          id: m.id,
          author_kind: m.author_kind,
          author_name: m.author_name,
          visibility: m.visibility,
          body: m.body,
          created_at: m.created_at,
          // Boolean(), not `!== null`: a row read from a source that omits
          // the column entirely would otherwise read as withdrawn, and a
          // message that silently blanks itself is the worst kind of bug here.
          withdrawn: Boolean(m.deleted_at),
        })),
      participants: ((convParticipants ?? []) as any[]).map((p) => ({
        display_name: p.display_name,
        party_kind: p.party_kind,
        removed_at: p.removed_at ?? null,
      })),
      can_post: canPost,
    },
    contact: owner ? { name: owner.name, email: owner.email ?? null } : null,
    viewer: {
      kind: viewer.kind,
      can_complete: viewer.kind === "grant" ? viewer.canComplete : viewer.kind === "auth",
      read_only: viewer.kind === "preview",
    },
  };

  return buildSharedPlanDTO(inputs);
}

/* ------------------------------------------------------------------------- */
/* Ref resolution for actions                                                 */
/* ------------------------------------------------------------------------- */

export type ScopedWorkItem = {
  id: string;
  title: string;
  party: string;
  visibility: string;
  status: string;
  depends_on: string[];
  implementation_id: string;
};

/**
 * Turn an opaque task ref back into a row — only ever within the viewer's own
 * implementation.
 *
 * The lookup recomputes refs for that implementation's items and matches; it
 * never parses or trusts what the client sent. A ref for another customer's
 * task therefore matches nothing at all, which is the same answer as a ref that
 * was never real.
 */
export async function workItemForRef(
  implementationId: string,
  ref: string,
): Promise<ScopedWorkItem> {
  const { data } = await db()
    .from("work_items")
    .select("id, title, party, visibility, status, depends_on, implementation_id")
    .eq("implementation_id", implementationId);
  const match = ((data ?? []) as ScopedWorkItem[]).find((w) => taskRef(w.id) === ref);
  if (!match) throw new ExternalAccessError("forbidden", "no such task in this implementation");
  return { ...match, depends_on: match.depends_on ?? [] };
}

export { buildSharedPlanDTO };
export type { SharedPlan };
