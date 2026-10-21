import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isPartnerJourney } from "./partner-implementation";
import { partnerProgress, type PartnerProgress, type PartnerWorkItemRow } from "./partner-journey";
import { partnerRailFrom, type PartnerRail } from "./project-timeline";

const db = () => supabaseAdmin as any;

type WorkItemRow = Omit<PartnerWorkItemRow, "stage_key"> & { stage_instance_id: string };

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
    db()
      .from("stage_instances")
      .select("id,stage_key,status,gate_mode")
      .eq("implementation_id", impl.id),
    db()
      .from("implementation_stage_history")
      .select("stage,exited_at")
      .eq("implementation_id", impl.id),
    db()
      .from("milestones")
      .select("name,stage,status,target_date,completed_date")
      .eq("implementation_id", impl.id),
    db()
      .from("work_items")
      .select("id,stage_instance_id,title,party,visibility,status,is_gate,due_at")
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

  const stageRows = (stages.data ?? []) as Array<{
    id: string;
    stage_key: string;
    status: string;
    gate_mode: string | null;
  }>;
  const keyById = new Map(stageRows.map((s) => [s.id, s.stage_key]));

  return partnerProgress({
    currentStage: impl.current_stage ?? null,
    dealStage: (deal.data as { stage: string } | null)?.stage ?? null,
    dealTransitions: transitions.data ?? [],
    stageInstances: stageRows.map((s) => ({
      stage_key: s.stage_key,
      status: s.status,
      gate_mode: s.gate_mode,
    })),
    stageHistory: history.data ?? [],
    milestones: milestones.data ?? [],
    workItems: ((items.data ?? []) as WorkItemRow[]).map((w) => ({
      id: w.id,
      stage_key: keyById.get(w.stage_instance_id) ?? null,
      title: w.title,
      party: w.party,
      visibility: w.visibility,
      status: w.status,
      is_gate: w.is_gate,
      due_at: w.due_at,
    })),
  });
}

/**
 * What a deal's partner journey is, for the customer's views. It never throws:
 *   - standard: the deal has no partner implementation (or only a standard one);
 *   - partner: the deal is a Partner Implementation and its progress loaded;
 *   - partner_unavailable: the deal IS a Partner Implementation but its progress
 *     could not be read. The views must say so, never show another journey;
 *   - unknown: the lookup that identifies the deal failed. The optional partner
 *     lookup is not allowed to disturb the standard experience, so the caller
 *     keeps the standard path, as it always has.
 * Every failure is logged with its deal and implementation, for investigation.
 */
export type PartnerDealState =
  | { kind: "standard" }
  | { kind: "partner"; progress: PartnerProgress }
  | { kind: "partner_unavailable"; implementationId: string }
  | { kind: "unknown" };

export async function partnerStateForDeal(dealId: string): Promise<PartnerDealState> {
  let identified: { id: string; journey_type: string | null; partner_key: string | null } | null;
  try {
    const { data, error } = await db()
      .from("implementations")
      .select("id,journey_type,partner_key")
      .eq("deal_id", dealId)
      .is("superseded_by_implementation_id", null)
      .is("closed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    identified = data as typeof identified;
  } catch (error) {
    console.error("[partner] could not identify the implementation for a deal", { dealId, error });
    return { kind: "unknown" };
  }
  if (!identified || !isPartnerJourney(identified)) return { kind: "standard" };

  try {
    const progress = await loadPartnerProgress(identified.id);
    if (!progress) throw new Error("the partner journey returned no progress");
    return { kind: "partner", progress };
  } catch (error) {
    console.error("[partner] could not load partner progress", {
      dealId,
      implementationId: identified.id,
      error,
    });
    return { kind: "partner_unavailable", implementationId: identified.id };
  }
}

/**
 * A partner project's progress, read once: the full progress for the page that
 * shows it, and the rail for the Projects section. A project with no progress,
 * or a read that fails, is `unavailable` in the rail; the rail never falls back
 * to the standard plan. The loader is a parameter so that behaviour can be
 * tested without a database.
 */
export type PartnerJourneyRead = { progress: PartnerProgress | null; rail: PartnerRail };

export async function partnerJourneyFor(
  implementationId: string,
  load: (id: string) => Promise<PartnerProgress | null> = loadPartnerProgress,
): Promise<PartnerJourneyRead> {
  try {
    const progress = await load(implementationId);
    if (!progress) return { progress: null, rail: { status: "unavailable" } };
    return { progress, rail: partnerRailFrom(progress) };
  } catch (error) {
    console.error("[partner] could not read the partner journey for the project rail", {
      implementationId,
      error,
    });
    return { progress: null, rail: { status: "unavailable" } };
  }
}
