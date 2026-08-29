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
        "id, stage_instance_id, task_key, title, description, position, role_key, owner_id, party, visibility, status, waiting_on_party, waiting_since, due_at, due_at_edited, depends_on",
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
      owner_name: w.owner_id ? (nameById.get(w.owner_id) ?? null) : null,
    })) as PlanWorkItem[],
  };
}
