import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { localIso } from "./onboarding-timeline";
import { buildTtvReport, type TtvDeal, type TtvReport } from "./ttv-report";

const db = () => supabaseAdmin as any;

/**
 * Today's time-to-value report: the stage history gives when each deal
 * entered each stage, the project row gives Go-Live and the three reference
 * dates, the customer row says who covers it.
 */
export async function loadTtvReport(opts: { sinceDays?: number } = {}): Promise<TtvReport> {
  const { loadPipeline } = await import("./presale.server");
  const { deals } = await loadPipeline(null);
  const ids = deals.map((d) => d.id);
  const [{ data: history }, { data: impls }] = await Promise.all([
    db()
      .from("portal_stage_transitions")
      .select("account_id,to_stage,occurred_at")
      .in("account_id", ids)
      .order("occurred_at", { ascending: true }),
    db()
      .from("implementations")
      .select(
        "deal_id,customer_id,go_live_at,tier_expected_date,baseline_date,target_date,target_launch_date,complete_outcome,created_at",
      )
      .in("deal_id", ids)
      .order("created_at", { ascending: false }),
  ]);
  const customerIds = Array.from(
    new Set(((impls ?? []) as Array<{ customer_id: string | null }>).map((i) => i.customer_id)),
  ).filter(Boolean) as string[];
  const { data: customers } = customerIds.length
    ? await db().from("customers").select("id,account_manager_id").in("id", customerIds)
    : { data: [] };
  const amOf = new Map<string, string | null>(
    ((customers ?? []) as Array<{ id: string; account_manager_id: string | null }>).map((c) => [
      c.id,
      c.account_manager_id ?? null,
    ]),
  );
  const hist = (history ?? []) as Array<{
    account_id: string;
    to_stage: string;
    occurred_at: string;
  }>;
  const firstTo = (id: string, ...stages: string[]) =>
    hist.find((h) => h.account_id === id && stages.includes(h.to_stage))?.occurred_at ?? null;
  const implOf = new Map<string, any>();
  for (const i of (impls ?? []) as any[]) if (!implOf.has(i.deal_id)) implOf.set(i.deal_id, i);

  const rows: TtvDeal[] = deals.map((d) => {
    const impl = implOf.get(d.id);
    return {
      id: d.id,
      name: d.name,
      owner: d.owner_name,
      closedAt: firstTo(d.id, "closed_won"),
      preKickoffAt: firstTo(d.id, "onboarding_kickoff"),
      workingAt: firstTo(d.id, "get_it_working", "in_onboarding"),
      yoursAt: firstTo(d.id, "make_it_yours"),
      runAt: firstTo(d.id, "make_it_run"),
      completeAt: firstTo(d.id, "onboarding_complete"),
      goLiveOn: impl?.go_live_at ?? null,
      tierExpectedOn: impl?.tier_expected_date ?? null,
      baselineOn: impl?.baseline_date ?? null,
      targetOn: impl?.target_date ?? impl?.target_launch_date ?? null,
      outcome: impl?.complete_outcome ?? null,
      coverage: impl?.customer_id && amOf.get(impl.customer_id) ? "named_am" : "customer_success",
    };
  });
  const since = opts.sinceDays
    ? new Date(Date.now() - opts.sinceDays * 86_400_000).toISOString()
    : null;
  return buildTtvReport(rows, localIso(), { since });
}
