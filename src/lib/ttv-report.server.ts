import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { localIso } from "./onboarding-timeline";
import { buildTtvReport, type TtvDeal, type TtvReport, type TtvTransition } from "./ttv-report";
import { rowsOrLog, rowsOrThrow } from "./server/db-read";

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
  const [historyRes, implsRes] = await Promise.all([
    db()
      .from("portal_stage_transitions")
      .select(
        "account_id,from_stage,to_stage,source,note,actor_profile_id,actor_api_key_id,occurred_at",
      )
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
  // Every timing comes from the stage history and the project dates: a failed
  // read fails the report rather than showing every deal as not yet timed.
  const history = rowsOrThrow<any>(historyRes, "the stage history");
  const impls = rowsOrThrow<any>(implsRes, "the deals' implementations");
  const customerIds = Array.from(
    new Set((impls as Array<{ customer_id: string | null }>).map((i) => i.customer_id)),
  ).filter(Boolean) as string[];
  // Coverage (named AM or Customer Success) only labels a row: logged, tolerant.
  const customers = customerIds.length
    ? rowsOrLog<{ id: string; account_manager_id: string | null }>(
        await db().from("customers").select("id,account_manager_id").in("id", customerIds),
        "ttv report: customers (coverage)",
      )
    : [];
  const amOf = new Map<string, string | null>(
    customers.map((c) => [c.id, c.account_manager_id ?? null]),
  );
  const hist = history as Array<{
    account_id: string;
    from_stage: string | null;
    to_stage: string;
    source: string | null;
    note: string | null;
    actor_profile_id: string | null;
    actor_api_key_id: string | null;
    occurred_at: string;
  }>;
  // The first entry into each stage, whoever made it: the report judges a
  // backfill (source system), a skip or a bulk tick from the history itself.
  const firstTo = (id: string, ...stages: string[]) =>
    hist.find((h) => h.account_id === id && stages.includes(h.to_stage))?.occurred_at ?? null;
  const historyOf = (id: string): TtvTransition[] =>
    hist
      .filter((h) => h.account_id === id)
      .map((h) => ({
        from: h.from_stage,
        to: h.to_stage,
        at: h.occurred_at,
        source: h.source,
        note: h.note,
        actor: h.actor_profile_id ?? h.actor_api_key_id ?? null,
      }));
  const implOf = new Map<string, any>();
  for (const i of impls) if (!implOf.has(i.deal_id)) implOf.set(i.deal_id, i);

  const rows: TtvDeal[] = deals.map((d) => {
    const impl = implOf.get(d.id);
    return {
      id: d.id,
      name: d.name,
      owner: d.owner_name,
      closedAt: firstTo(d.id, "closed_won"),
      preKickoffAt: firstTo(d.id, "onboarding_kickoff"),
      kickoffAt: firstTo(d.id, "kickoff"),
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
      transitions: historyOf(d.id),
    };
  });
  const since = opts.sinceDays
    ? new Date(Date.now() - opts.sinceDays * 86_400_000).toISOString()
    : null;
  return buildTtvReport(rows, localIso(), { since });
}
