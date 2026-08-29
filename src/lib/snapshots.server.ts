import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { audit } from "./server/audit";
import { CONFIG_DEFAULTS, getConfigNumber } from "./server/app-config";
import { ExternalAccessError, loadSharedPlan, requireViewEnabled } from "./server/external-viewer";
import { generateSnapshotToken, hashToken } from "./server/plan-tokens";
import { buildSnapshotDTO, type SharedPlan, type SharedPlanSnapshot } from "./shared-plan";
import { recordPlanEvent } from "./external-plan.server";

/**
 * Weekly plan snapshots.
 *
 * A snapshot is a frozen record of what we told a customer in a given week —
 * evidence, not a cache. It is generated through the SAME projection as every
 * live door (`loadSharedPlan` → `buildSharedPlanDTO`), which is the whole point:
 * a field that is internal on the plan page cannot be visible in the weekly
 * email, because there is only one serializer.
 *
 * Corrections insert a superseding row and leave the original untouched.
 */

const db = () => supabaseAdmin as any;

/** ISO Monday of the week containing `date`. */
export function weekStartOf(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export type SnapshotRow = {
  id: string;
  week_start: string;
  generated_at: string;
  generated_by_name: string | null;
  superseded: boolean;
  share_prefix_live: boolean;
  share_expires_at: string | null;
  share_revoked_at: string | null;
};

export async function listSnapshots(implementationId: string): Promise<SnapshotRow[]> {
  const { data } = await db()
    .from("plan_snapshots")
    .select(
      "id, week_start, generated_at, generated_by, supersedes_id, share_token_hash, share_expires_at, share_revoked_at",
    )
    .eq("implementation_id", implementationId)
    .order("week_start", { ascending: false })
    .order("generated_at", { ascending: false });

  const rows = (data ?? []) as any[];
  const superseded = new Set(rows.map((r) => r.supersedes_id).filter(Boolean));
  const profileIds = [...new Set(rows.map((r) => r.generated_by).filter((x): x is string => !!x))];
  const { data: profiles } = profileIds.length
    ? await db().from("portal_profiles").select("id, full_name, email").in("id", profileIds)
    : { data: [] };
  const name = new Map<string, string>(
    ((profiles ?? []) as any[]).map((p) => [p.id, p.full_name || p.email]),
  );

  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    week_start: r.week_start,
    generated_at: r.generated_at,
    generated_by_name: r.generated_by ? (name.get(r.generated_by) ?? null) : null,
    superseded: superseded.has(r.id),
    share_prefix_live:
      !!r.share_token_hash &&
      !r.share_revoked_at &&
      !!r.share_expires_at &&
      new Date(r.share_expires_at).getTime() > now,
    share_expires_at: r.share_expires_at,
    share_revoked_at: r.share_revoked_at,
  }));
}

async function latestContent(implementationId: string): Promise<SharedPlanSnapshot | null> {
  const { data } = await db()
    .from("plan_snapshots")
    .select("content")
    .eq("implementation_id", implementationId)
    .order("generated_at", { ascending: false })
    .limit(1);
  const row = ((data ?? []) as any[])[0];
  return row ? (row.content as SharedPlanSnapshot) : null;
}

/**
 * Generate one snapshot. `generatedBy` is null for the cron, which is a fact
 * about the row rather than a missing value.
 */
export async function generateSnapshot(
  implementationId: string,
  generatedBy: string | null,
  opts: { supersedes?: string | null; now?: Date } = {},
): Promise<{ id: string; week_start: string }> {
  const now = opts.now ?? new Date();
  const plan: SharedPlan = await loadSharedPlan(
    { kind: "preview", profileId: generatedBy },
    (
      await db()
        .from("implementations")
        .select("portal_key")
        .eq("id", implementationId)
        .maybeSingle()
    ).data?.portal_key,
  );

  const previous = await latestContent(implementationId);
  const weekStart = weekStartOf(now);
  const content = buildSnapshotDTO(plan, weekStart, previous?.plan ?? null, now);

  const { data, error } = await db()
    .from("plan_snapshots")
    .insert({
      implementation_id: implementationId,
      week_start: weekStart,
      generated_by: generatedBy,
      supersedes_id: opts.supersedes ?? null,
      content,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Could not write the snapshot: ${error?.message}`);
  return { id: data.id, week_start: weekStart };
}

/* ------------------------------------------------------------------------- */
/* Share links                                                                */
/* ------------------------------------------------------------------------- */

export async function mintSnapshotShare(
  snapshotId: string,
  actor: { id: string },
): Promise<{ url: string; expires_at: string }> {
  const { data: snap } = await db()
    .from("plan_snapshots")
    .select("id, implementation_id")
    .eq("id", snapshotId)
    .maybeSingle();
  if (!snap) throw new Error("No such snapshot");

  const ttl = await getConfigNumber(
    "snapshot_share_ttl_days",
    CONFIG_DEFAULTS.snapshot_share_ttl_days,
  );
  const expiresAt = new Date(Date.now() + ttl * 24 * 60 * 60 * 1000).toISOString();
  const minted = generateSnapshotToken();

  // share_expires_at is written in the same statement as the hash because the
  // DB refuses the row otherwise (0022's check constraint) — a share link
  // without an expiry cannot exist even if this code forgets.
  const { error } = await db()
    .from("plan_snapshots")
    .update({
      share_token_hash: minted.hash,
      share_expires_at: expiresAt,
      share_revoked_at: null,
    })
    .eq("id", snapshotId);
  if (error) throw new Error(`Could not create the share link: ${error.message}`);

  await audit({
    actor_type: "user",
    actor_id: actor.id,
    action: "external.snapshot_shared",
    entity_type: "implementation",
    entity_id: snap.implementation_id,
    payload: { snapshot_id: snapshotId, expires_at: expiresAt },
  });

  const base = process.env["APP_URL"] ?? "http://localhost:3000";
  return { url: `${base}/plan/s/${minted.token}`, expires_at: expiresAt };
}

export async function revokeSnapshotShare(
  snapshotId: string,
  actor: { id: string },
): Promise<{ ok: true }> {
  const { data: snap } = await db()
    .from("plan_snapshots")
    .select("id, implementation_id")
    .eq("id", snapshotId)
    .maybeSingle();
  if (!snap) throw new Error("No such snapshot");
  await db()
    .from("plan_snapshots")
    .update({ share_revoked_at: new Date().toISOString() })
    .eq("id", snapshotId);
  await audit({
    actor_type: "user",
    actor_id: actor.id,
    action: "external.snapshot_share_revoked",
    entity_type: "implementation",
    entity_id: snap.implementation_id,
    payload: { snapshot_id: snapshotId },
  });
  return { ok: true };
}

export type SnapshotDoorResult =
  { state: "snapshot"; content: SharedPlanSnapshot } | { state: "unavailable" };

/**
 * Resolve a `gcps_…` snapshot link. Same neutral failure as the plan door: a
 * revoked, expired and never-existed token are indistinguishable from outside.
 */
export async function snapshotForToken(rawToken: string): Promise<SnapshotDoorResult> {
  try {
    await requireViewEnabled();
    const { data } = await db()
      .from("plan_snapshots")
      .select("id, implementation_id, content, share_expires_at, share_revoked_at")
      .eq("share_token_hash", hashToken(rawToken))
      .maybeSingle();
    if (!data) throw new ExternalAccessError("unavailable", "no snapshot for token");
    if (data.share_revoked_at) throw new ExternalAccessError("unavailable", "share revoked");
    if (!data.share_expires_at || new Date(data.share_expires_at).getTime() <= Date.now()) {
      throw new ExternalAccessError("unavailable", "share expired");
    }
    await recordPlanEvent({
      implementationId: data.implementation_id,
      event: "snapshot_viewed",
      metadata: { snapshot_id: data.id },
    });
    return { state: "snapshot", content: data.content as SharedPlanSnapshot };
  } catch (e) {
    if (!(e instanceof ExternalAccessError)) console.error("[snapshot] door failure", e);
    return { state: "unavailable" };
  }
}

/* ------------------------------------------------------------------------- */
/* Cron                                                                       */
/* ------------------------------------------------------------------------- */

/**
 * Weekly generation. Guarded exactly like the sequences and SLA crons.
 *
 * Skips implementations that already have a snapshot for this week (so a retry
 * is safe) and terminal ones (a graduated account has nothing left to report).
 */
export async function runPlanSnapshotCron(request: Request): Promise<Response> {
  const unauthorized = await authenticateCronRequest(request);
  if (unauthorized) return unauthorized;

  try {
    await requireViewEnabled();
  } catch {
    return Response.json({ ok: true, skipped: "external_plan_view_enabled is off" });
  }

  const week = weekStartOf();
  const { data: impls } = await db()
    .from("implementations")
    .select("id, current_stage")
    .not("current_stage", "in", '("graduate-to-cs","graduate","cs")');

  const { data: existing } = await db()
    .from("plan_snapshots")
    .select("implementation_id")
    .eq("week_start", week);
  const done = new Set(((existing ?? []) as any[]).map((r) => r.implementation_id));

  let generated = 0;
  const failed: string[] = [];
  for (const impl of ((impls ?? []) as any[]).filter((i) => !done.has(i.id))) {
    try {
      await generateSnapshot(impl.id, null);
      generated += 1;
    } catch (e) {
      console.error("[snapshot cron] failed for", impl.id, e);
      failed.push(impl.id);
    }
  }
  return Response.json({ ok: true, week_start: week, generated, failed: failed.length });
}
