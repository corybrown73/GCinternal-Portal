import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isFlagOn } from "./app-config.server";

const db = () => supabaseAdmin as any;

/**
 * `audit_log` — the ACCOUNT ACTIVITY FEED.
 *
 * The hub UI has read this table since 0003 (the Customer 360 history tab and
 * Home's recent activity) and nothing has ever written it, so those panels can
 * only show legacy rows. This is the writer.
 *
 * It is not a replacement for `audit()`/`portal_audit_log` and does not share
 * its shape: this store answers "the target launch date moved from 3 March to
 * 17 April, and here is why", which the action log cannot express without
 * stuffing a diff into an untyped payload no view could render.
 *
 * ATTRIBUTION goes through the people bridge rather than a new column.
 * `audit_log.changed_by` is a `team_members` FK; a signed-in person is a
 * `portal_profiles` row; 0010 introduced `portal_profiles.team_member_id` and
 * 0025 made it complete, unique and self-maintaining. So the actor is resolved
 * profile → team member and written to the column that already exists. No actor
 * columns are added to `audit_log` here — the migration ledger gives those to
 * Phase 4's 0020.
 *
 * Behind `audit_activity_feed`, because rows appearing in a panel that has been
 * empty since 0003 is a visible change.
 */

export type ActivityChange = {
  entity_type: string;
  entity_id: string;
  field_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  change_reason?: string | null;
};

/** Resolve a signed-in profile to its directory row. Null is a valid answer. */
export async function teamMemberIdForProfile(profileId: string | null): Promise<string | null> {
  if (!profileId) return null;
  const { data } = await db()
    .from("portal_profiles")
    .select("team_member_id")
    .eq("id", profileId)
    .maybeSingle();
  return (data?.team_member_id as string | null) ?? null;
}

function asText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return String(value);
}

/**
 * Diff a patch against the row it is about to replace, so the feed records what
 * actually changed rather than what was submitted. Fields whose value is
 * unchanged produce no row — a feed full of "status: on_track → on_track" is a
 * feed nobody reads.
 */
export function diffFields(
  before: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
  fields: readonly string[],
): Array<{ field_name: string; old_value: string | null; new_value: string | null }> {
  const out: Array<{ field_name: string; old_value: string | null; new_value: string | null }> = [];
  for (const field of fields) {
    if (!(field in patch)) continue;
    const oldValue = asText(before?.[field]);
    const newValue = asText(patch[field]);
    if (oldValue === newValue) continue;
    out.push({ field_name: field, old_value: oldValue, new_value: newValue });
  }
  return out;
}

/**
 * Write activity rows. Errors are inspected and surfaced, never swallowed — but
 * this helper does not throw: an activity feed is a record of a change that has
 * already been committed, and failing the user's save after the fact would be
 * worse than a gap the audit-health panel can name. `audit()` is the one that
 * can be made strict, because it covers the actions where the record matters
 * more than the request.
 */
export async function recordActivity(
  changes: ActivityChange[],
  opts: { actorProfileId?: string | null; orgId?: string | null } = {},
): Promise<{ written: number; error: string | null }> {
  if (!changes.length) return { written: 0, error: null };
  if (!(await isFlagOn("audit_activity_feed"))) return { written: 0, error: null };

  const changedBy = await teamMemberIdForProfile(opts.actorProfileId ?? null);
  const rows = changes.map((c) => ({
    entity_type: c.entity_type,
    entity_id: c.entity_id,
    field_name: c.field_name ?? null,
    old_value: c.old_value ?? null,
    new_value: c.new_value ?? null,
    change_reason: c.change_reason ?? null,
    changed_by: changedBy,
  }));

  const { error } = await db().from("audit_log").insert(rows);
  if (error) {
    const message = error.message ?? String(error);
    console.error(`ACTIVITY_WRITE_FAILED entity=${changes[0]?.entity_type} error=${message}`);
    return { written: 0, error: message };
  }
  return { written: rows.length, error: null };
}

/**
 * The implementation columns worth a feed row. Deliberately not "every column":
 * `updated_at` changes on every save and would bury the changes a reader came
 * for, and the health-evidence cache is computed, not stated.
 */
export const TRACKED_IMPLEMENTATION_FIELDS = [
  "name",
  "status",
  "owner_id",
  "sales_owner",
  "tier",
  "target_launch_date",
  "actual_launch_date",
  "health_recorded",
  "health_recorded_reason",
  "customer_goals",
  "sow_document_url",
  "sow_reference",
  "discovery_board_url",
] as const;

/**
 * Snapshot the row a save is about to change, so the feed can carry old→new
 * rather than only the submitted value. Returns null when the flag is off, so
 * a flag-off deploy does not pay for a read it will not use.
 */
export async function captureImplementation(id: string): Promise<Record<string, unknown> | null> {
  if (!(await isFlagOn("audit_activity_feed"))) return null;
  const { data } = await db().from("implementations").select("*").eq("id", id).maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

/**
 * Record what an implementation save actually changed. Called AFTER the write
 * succeeds: a feed row for a save that then failed is a lie about history, and
 * this feed's whole purpose is that its rows happened.
 */
export async function recordImplementationChange(
  id: string,
  before: Record<string, unknown> | null,
  patch: Record<string, unknown>,
  actorProfileId: string | null,
): Promise<void> {
  const changes = diffFields(before, patch, TRACKED_IMPLEMENTATION_FIELDS).map((c) => ({
    entity_type: "implementation",
    entity_id: id,
    ...c,
  }));
  await recordActivity(changes, { actorProfileId });
}
