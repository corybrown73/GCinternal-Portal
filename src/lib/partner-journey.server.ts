import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isPartnerJourney } from "./partner-implementation";
import { partnerProgress, type PartnerProgress } from "./partner-journey";

const db = () => supabaseAdmin as any;

type WorkItemRow = {
  stage_instance_id: string;
  title: string;
  party: string;
  visibility: string;
  status: string;
};

/**
 * The partner progress for an implementation, read from its records. Null for
 * anything that does not run the partner journey (standard and legacy Field
 * Fusion), which keep their existing reads. Throws rather than guessing when a
 * read fails: a stage is never shown done or skipped on missing data.
 */
export async function loadPartnerProgress(
  implementationId: string,
): Promise<PartnerProgress | null> {
  const { data: impl, error: implError } = await db()
    .from("implementations")
    .select("id,current_stage,journey_type,partner_key,deal_id")
    .eq("id", implementationId)
    .maybeSingle();
  if (implError) throw new Error(`Could not read the implementation: ${implError.message}`);
  if (!impl || !isPartnerJourney(impl)) return null;

  const [deal, stages, history, milestones, items, transitions] = await Promise.all([
    impl.deal_id
      ? db().from("portal_accounts").select("stage").eq("id", impl.deal_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db().from("stage_instances").select("id,stage_key,status").eq("implementation_id", impl.id),
    db()
      .from("implementation_stage_history")
      .select("stage,exited_at")
      .eq("implementation_id", impl.id),
    db()
      .from("milestones")
      .select("stage,status,target_date,completed_date")
      .eq("implementation_id", impl.id),
    db()
      .from("work_items")
      .select("stage_instance_id,title,party,visibility,status")
      .eq("implementation_id", impl.id),
    impl.deal_id
      ? db()
          .from("portal_stage_transitions")
          .select("to_stage,occurred_at")
          .eq("account_id", impl.deal_id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [deal, stages, history, milestones, items, transitions]) {
    if (r.error) throw new Error(`Could not read the partner progress: ${r.error.message}`);
  }

  const keyById = new Map<string, string>(
    ((stages.data ?? []) as Array<{ id: string; stage_key: string }>).map((s) => [
      s.id,
      s.stage_key,
    ]),
  );

  return partnerProgress({
    currentStage: impl.current_stage ?? null,
    dealStage: (deal.data as { stage: string } | null)?.stage ?? null,
    dealTransitions: transitions.data ?? [],
    stageInstances: ((stages.data ?? []) as Array<{ stage_key: string; status: string }>).map(
      (s) => ({
        stage_key: s.stage_key,
        status: s.status,
      }),
    ),
    stageHistory: history.data ?? [],
    milestones: milestones.data ?? [],
    workItems: ((items.data ?? []) as WorkItemRow[]).map((w) => ({
      stage_key: keyById.get(w.stage_instance_id) ?? null,
      title: w.title,
      party: w.party,
      visibility: w.visibility,
      status: w.status,
    })),
  });
}
