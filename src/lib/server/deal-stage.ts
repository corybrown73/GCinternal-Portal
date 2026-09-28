import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { dealStageFor } from "../deal-stage";
import { dealValue } from "../deal-value";
import type { AccountStage } from "../presale-stages";

/**
 * The stage to show for each project, in one query: its deal's stage where
 * it has a deal, else the stage its lifecycle implies. Keyed by
 * implementation id so a loader that already has its rows in memory adds
 * the stage without a join.
 */
export async function dealStagesFor(
  impls: ReadonlyArray<{
    id: string;
    deal_id?: string | null;
    current_stage?: string | null;
  }>,
): Promise<Map<string, { stage: AccountStage; value: number | null }>> {
  const dealIds = Array.from(new Set(impls.map((i) => i.deal_id).filter(Boolean))) as string[];
  const byDeal = new Map<string, { stage: string; value: number | null }>();
  if (dealIds.length) {
    const { data } = await (supabaseAdmin as any)
      .from("portal_accounts")
      .select("id, stage, arr, sow_value")
      .in("id", dealIds);
    for (const d of (data ?? []) as Array<{
      id: string;
      stage: string;
      arr: number | null;
      sow_value: number | null;
    }>)
      byDeal.set(d.id, { stage: d.stage, value: dealValue(d) });
  }
  const out = new Map<string, { stage: AccountStage; value: number | null }>();
  for (const i of impls) {
    const deal = i.deal_id ? byDeal.get(i.deal_id) : undefined;
    out.set(i.id, {
      stage: dealStageFor({
        deal_stage: deal?.stage ?? null,
        current_stage: i.current_stage ?? null,
      }),
      value: deal?.value ?? null,
    });
  }
  return out;
}
