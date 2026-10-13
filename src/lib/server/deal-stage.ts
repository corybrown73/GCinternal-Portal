import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { dealStageFor } from "../deal-stage";
import { dealValue } from "../deal-value";
import type { AccountStage } from "../presale-stages";

export type DealStageFacts = {
  stage: AccountStage;
  value: number | null;
  stage_entered_at: string | null;
  /** The deal is a test account (0085). */
  is_test: boolean;
};

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
): Promise<Map<string, DealStageFacts>> {
  const dealIds = Array.from(new Set(impls.map((i) => i.deal_id).filter(Boolean))) as string[];
  const byDeal = new Map<
    string,
    { stage: string; value: number | null; stage_entered_at: string | null; is_test: boolean }
  >();
  if (dealIds.length) {
    // `*` rather than a column list: is_test (0085) reads as false before
    // the migration instead of failing the whole page.
    const { data } = await (supabaseAdmin as any)
      .from("portal_accounts")
      .select("*")
      .in("id", dealIds);
    for (const d of (data ?? []) as Array<{
      id: string;
      stage: string;
      arr: number | null;
      sow_value: number | null;
      stage_entered_at: string | null;
      is_test?: boolean | null;
    }>)
      byDeal.set(d.id, {
        stage: d.stage,
        value: dealValue(d),
        stage_entered_at: d.stage_entered_at ?? null,
        is_test: d.is_test === true,
      });
  }
  const out = new Map<string, DealStageFacts>();
  for (const i of impls) {
    const deal = i.deal_id ? byDeal.get(i.deal_id) : undefined;
    out.set(i.id, {
      stage: dealStageFor({
        deal_stage: deal?.stage ?? null,
        current_stage: i.current_stage ?? null,
      }),
      value: deal?.value ?? null,
      stage_entered_at: deal?.stage_entered_at ?? null,
      is_test: deal?.is_test ?? false,
    });
  }
  return out;
}
