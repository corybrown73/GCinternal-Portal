import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  byKind,
  byPath,
  byTool,
  outcomesFor,
  rollup,
  stepSlips,
  type Outcome,
  type Rollup,
} from "./delivery-analytics";
import { readIntake } from "./intake-answers";
import { closeDateFor, timelineFor } from "./onboarding-plan";
import type { ServiceSpec } from "./onboarding-services";
import { loadPipelineStages } from "./pipeline-stages.server";
import { isAtOrPast, wonStage } from "./pipeline-stages";

const db = () => supabaseAdmin as any;

export type DeliveryAnalytics = {
  asOf: string;
  accounts: number;
  outcomes: Outcome[];
  byTool: Rollup[];
  byKind: Rollup[];
  byPath: Rollup[];
  steps: ReturnType<typeof stepSlips>;
};

/**
 * Every closed-won deal's plan, read into outcomes. Nothing is stored:
 * the plan is the record, so the numbers are always as current as the
 * last tick box.
 */
export async function loadDeliveryAnalytics(today?: string): Promise<DeliveryAnalytics> {
  const asOf = today ?? new Date().toISOString().slice(0, 10);
  const [stages, { data: accounts }, { data: history }] = await Promise.all([
    loadPipelineStages(),
    db().from("portal_accounts").select("id,name,stage,intake"),
    db().from("portal_stage_transitions").select("account_id,to_stage,occurred_at"),
  ]);
  const won = wonStage(stages).key;
  const byAccount = new Map<string, Array<{ to_stage: string; occurred_at: string }>>();
  for (const h of (history ?? []) as Array<{
    account_id: string;
    to_stage: string;
    occurred_at: string;
  }>) {
    byAccount.set(h.account_id, [...(byAccount.get(h.account_id) ?? []), h]);
  }

  const outcomes: Outcome[] = [];
  let counted = 0;
  for (const a of (accounts ?? []) as Array<{
    id: string;
    name: string;
    stage: string | null;
    intake: unknown;
  }>) {
    if (!isAtOrPast(stages, a.stage, won)) continue;
    const intake = readIntake(a.intake);
    const close = closeDateFor({
      intake,
      stageHistory: byAccount.get(a.id) ?? [],
      wonStageKey: won,
      today: asOf,
    });
    const timeline = timelineFor(intake, close.date);
    counted += 1;
    outcomes.push(
      ...outcomesFor(
        {
          dealId: a.id,
          account: a.name,
          timeline,
          services: (intake.timeline.services ?? []) as ServiceSpec[],
        },
        asOf,
      ),
    );
  }
  return {
    asOf,
    accounts: counted,
    outcomes,
    byTool: rollup(outcomes, byTool),
    byKind: rollup(outcomes, byKind),
    byPath: rollup(
      outcomes.filter((o) => o.kind === "phase1"),
      byPath,
    ),
    steps: stepSlips(outcomes),
  };
}
