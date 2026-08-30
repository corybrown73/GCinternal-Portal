import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isFlagOn } from "./app-config.server";
import type { WorkItemLike } from "./work-items";

const db = () => supabaseAdmin as any;

/**
 * The templated plan for one implementation: its stage instances and the work
 * items hanging off them.
 *
 * Reads only. Every implementation now has stage instances (0015 backfilled
 * them), but only implementations created from a template have work items, so
 * the panel is empty rather than absent on legacy records.
 */

export type PlanStage = {
  id: string;
  stage_key: string;
  name: string;
  phase: string;
  position: number;
  status: "pending" | "active" | "done" | "skipped";
  gate_mode: string;
  /** How this row's state came to be — see 0014. Rendered, not hidden. */
  provenance: "live" | "backfill_observed" | "backfill_inferred";
  entered_at: string | null;
  exited_at: string | null;
  target_duration_days: number | null;
};

export type PlanWorkItem = WorkItemLike & {
  stage_instance_id: string | null;
  visibility: "internal" | "shared";
  description: string | null;
  position: number;
  owner_name: string | null;
  task_key: string | null;
  /** One of the (at most three) core criteria gating this stage's exit. */
  is_gate: boolean;
};

export type ImplementationPlan = {
  /** False when the work_items feature flag is off — the UI says so plainly. */
  enabled: boolean;
  implementation_id: string;
  template: { key: string; name: string; version: number } | null;
  stages: PlanStage[];
  items: PlanWorkItem[];
};

export async function loadPlan(implementationId: string): Promise<ImplementationPlan> {
  const empty: ImplementationPlan = {
    enabled: false,
    implementation_id: implementationId,
    template: null,
    stages: [],
    items: [],
  };
  if (!(await isFlagOn("work_items"))) return empty;

  const [{ data: impl }, { data: stages }, { data: items }, { data: team }] = await Promise.all([
    db()
      .from("implementations")
      .select("id, journey_template_id, journey_type, template_version")
      .eq("id", implementationId)
      .maybeSingle(),
    db()
      .from("stage_instances")
      .select(
        "id, stage_key, name, phase, position, status, gate_mode, provenance, entered_at, exited_at, target_duration_days",
      )
      .eq("implementation_id", implementationId)
      .order("position"),
    db()
      .from("work_items")
      .select(
        "id, stage_instance_id, task_key, title, description, position, role_key, owner_id, party, visibility, status, waiting_on_party, waiting_since, due_at, due_at_edited, depends_on, is_gate",
      )
      .eq("implementation_id", implementationId)
      .order("position"),
    db().from("team_members").select("id, name"),
  ]);
  if (!impl) return { ...empty, enabled: true };

  let template: ImplementationPlan["template"] = null;
  if (impl.journey_template_id) {
    const { data: tpl } = await db()
      .from("journey_templates")
      .select("key, name, version")
      .eq("id", impl.journey_template_id)
      .maybeSingle();
    if (tpl) template = { key: tpl.key, name: tpl.name, version: tpl.version };
  }

  const nameById = new Map<string, string>((team ?? []).map((t: any) => [t.id, t.name]));

  return {
    enabled: true,
    implementation_id: implementationId,
    template,
    stages: (stages ?? []) as PlanStage[],
    items: (items ?? []).map((w: any) => ({
      ...w,
      depends_on: w.depends_on ?? [],
      is_gate: Boolean(w.is_gate),
      owner_name: w.owner_id ? (nameById.get(w.owner_id) ?? null) : null,
    })) as PlanWorkItem[],
  };
}

/* ---------- Writes ---------- */

/**
 * Mark one work item done, or move it back.
 *
 * WHY THIS DID NOT EXIST. The plan has been readable since 0014 and was never
 * writable — every surface rendered the tasks and none of them let anybody tick
 * one. That is most of why the process "gets a little confusing": the plan
 * looked like a checklist and behaved like a poster.
 *
 * `completed_at` and `completed_by` are stamped and cleared together with the
 * status, never independently. A row reading `not_started` with a completion
 * timestamp still on it is a small lie that outlives everyone who could explain
 * it.
 */
export async function setWorkItemStatus(args: {
  workItemId: string;
  status: string;
  actorProfileId: string | null;
}): Promise<{ ok: true; status: string; stage_instance_id: string | null }> {
  const allowed = ["not_started", "in_progress", "waiting", "blocked", "done", "skipped"];
  if (!allowed.includes(args.status)) throw new Error(`${args.status} is not a work item status`);

  const { data: before } = await db()
    .from("work_items")
    .select("id, implementation_id, stage_instance_id, status")
    .eq("id", args.workItemId)
    .maybeSingle();
  if (!before) throw new Error("That task no longer exists");

  // completed_by is a team_members id; the caller has a profile id. The 0010
  // bridge maps one to the other, and an unbridged profile records null rather
  // than a wrong id.
  let completedBy: string | null = null;
  if (args.actorProfileId) {
    const { data: profile } = await db()
      .from("portal_profiles")
      .select("team_member_id")
      .eq("id", args.actorProfileId)
      .maybeSingle();
    completedBy = (profile?.team_member_id as string | null) ?? null;
  }

  const finished = args.status === "done" || args.status === "skipped";
  const { error } = await db()
    .from("work_items")
    .update({
      status: args.status,
      completed_at: finished ? new Date().toISOString() : null,
      completed_by: finished ? completedBy : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.workItemId);
  if (error) throw new Error(error.message);

  const { recordActivity } = await import("./activity.server");
  await recordActivity(
    [
      {
        entity_type: "work_item",
        entity_id: args.workItemId,
        field_name: "status",
        old_value: String(before.status ?? ""),
        new_value: args.status,
      },
    ],
    { actorProfileId: args.actorProfileId },
  );

  return {
    ok: true,
    status: args.status,
    stage_instance_id: (before.stage_instance_id as string | null) ?? null,
  };
}
