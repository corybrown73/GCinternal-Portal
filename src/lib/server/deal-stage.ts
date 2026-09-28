import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { dealStageFor } from "../deal-stage";
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
): Promise<Map<string, AccountStage>> {
  const dealIds = Array.from(new Set(impls.map((i) => i.deal_id).filter(Boolean))) as string[];
  const byDeal = new Map<string, string>();
  if (dealIds.length) {
    const { data } = await (supabaseAdmin as any)
      .from("portal_accounts")
      .select("id, stage")
      .in("id", dealIds);
    for (const d of (data ?? []) as Array<{ id: string; stage: string }>) byDeal.set(d.id, d.stage);
  }
  const out = new Map<string, AccountStage>();
  for (const i of impls) {
    out.set(
      i.id,
      dealStageFor({
        deal_stage: i.deal_id ? (byDeal.get(i.deal_id) ?? null) : null,
        current_stage: i.current_stage ?? null,
      }),
    );
  }
  return out;
}
