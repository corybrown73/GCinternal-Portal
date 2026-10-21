import { supabaseAdmin } from "@/integrations/supabase/client.server";

import type { BrandMark } from "./brand-marks";

const db = () => supabaseAdmin as any;

/**
 * How a customer's earlier projects went, one tile each.
 *
 * A customer who bought a form in March and QuickBooks in June has two
 * implementations on one page. The one in flight is the page; the ones
 * that finished are tiles: when it went live, how long it took against
 * the plan, who ran it, and what was built. The next project starts with
 * that in view.
 */
export type PastImplementation = {
  id: string;
  name: string;
  owner_name: string | null;
  stage: string;
  /** ISO date the form (or the last phase) went live; null when it never did. */
  live_on: string | null;
  planned_days: number | null;
  actual_days: number | null;
  /** Positive when it ran over the plan. */
  over_by: number | null;
  marks: BrandMark[];
  /** True when every phase on the plan is done. */
  complete: boolean;
};

export async function loadPastImplementations(
  customerId: string,
  activeImplementationId: string | null,
): Promise<PastImplementation[]> {
  const { data: impls } = await db()
    .from("implementations")
    .select("id,name,deal_id,owner_id,current_stage,actual_launch_date,created_at")
    .eq("customer_id", customerId)
    .is("superseded_by_implementation_id", null)
    .order("created_at", { ascending: true });
  const rows = (
    (impls ?? []) as Array<{
      id: string;
      name: string;
      deal_id: string | null;
      owner_id: string | null;
      current_stage: string;
      actual_launch_date: string | null;
      created_at: string;
    }>
  ).filter((i) => i.id !== activeImplementationId);
  if (rows.length === 0) return [];

  const dealIds = rows.map((r) => r.deal_id).filter((x): x is string => Boolean(x));
  const ownerIds = rows.map((r) => r.owner_id).filter((x): x is string => Boolean(x));
  const [{ data: deals }, { data: transitions }, { data: owners }, stages] = await Promise.all([
    dealIds.length
      ? db().from("portal_accounts").select("id,name,intake").in("id", dealIds)
      : Promise.resolve({ data: [] }),
    dealIds.length
      ? db()
          .from("portal_stage_transitions")
          .select("account_id,to_stage,occurred_at")
          .in("account_id", dealIds)
      : Promise.resolve({ data: [] }),
    ownerIds.length
      ? db().from("team_members").select("id,name").in("id", ownerIds)
      : Promise.resolve({ data: [] }),
    (await import("./pipeline-stages.server")).loadPipelineStages(),
  ]);
  const dealById = new Map(
    ((deals ?? []) as Array<{ id: string; name: string; intake: unknown }>).map((d) => [d.id, d]),
  );
  const ownerName = new Map(
    ((owners ?? []) as Array<{ id: string; name: string }>).map((o) => [String(o.id), o.name]),
  );
  const history = new Map<string, Array<{ to_stage: string; occurred_at: string }>>();
  for (const t of (transitions ?? []) as Array<{
    account_id: string;
    to_stage: string;
    occurred_at: string;
  }>) {
    history.set(t.account_id, [...(history.get(t.account_id) ?? []), t]);
  }

  const { readIntake } = await import("./intake-answers");
  const { closeDateFor, timelineFor } = await import("./onboarding-plan");
  const { daysToValue, daysToValueActual } = await import("./onboarding-timeline");
  const { wonStage } = await import("./pipeline-stages");
  const { marksForIntake } = await import("./deliverables");
  const won = wonStage(stages).key;

  const out: PastImplementation[] = [];
  for (const r of rows) {
    const deal = r.deal_id ? dealById.get(r.deal_id) : undefined;
    let live_on: string | null = r.actual_launch_date;
    let planned: number | null = null;
    let actual: number | null = null;
    let marks: BrandMark[] = [];
    let complete = false;
    if (deal) {
      const intake = readIntake(deal.intake);
      const close = closeDateFor({
        intake,
        stageHistory: history.get(deal.id) ?? [],
        wonStageKey: won,
      }).date;
      const t = timelineFor(intake, close);
      planned = daysToValue(t);
      actual = daysToValueActual(t);
      live_on = t.liveDoneOn ?? live_on;
      marks = marksForIntake(intake);
      complete = t.allDone;
    }
    // Only projects that got somewhere are worth a tile: live, or handed to CS.
    if (!live_on && !["launch", "graduate-to-cs"].includes(String(r.current_stage))) continue;
    out.push({
      id: r.id,
      name: deal?.name ?? r.name,
      owner_name: r.owner_id ? (ownerName.get(String(r.owner_id)) ?? null) : null,
      stage: String(r.current_stage),
      live_on,
      planned_days: planned,
      actual_days: actual,
      over_by: planned !== null && actual !== null ? actual - planned : null,
      marks,
      complete,
    });
  }
  return out;
}
