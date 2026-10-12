import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { businessDaysBetween, localIso } from "./onboarding-timeline";
import { STAGE_LABELS, isStage } from "./presale-stages";
import { STAGE_LIMITS, stuckLevel } from "./stage-flow";

const db = () => supabaseAdmin as any;

export const STALL_KIND = "stalled_implementation";

export type StallDeal = {
  id: string;
  name: string;
  stage: string;
  stage_entered_at: string | null;
  customer_id: string | null;
};

export type StallFinding = {
  dealId: string;
  customerId: string | null;
  implementationId: string | null;
  visit: string;
  title: string;
  detail: string;
  businessDays: number;
};

/**
 * The deals stuck past their stage's escalate limit — the same clock and
 * table Home reads (business days since the deal entered the stage,
 * STAGE_LIMITS / stuckLevel), so an alert names what Home already shows as
 * stuck. One finding per stage visit ("<stage>@<stage_entered_at>").
 * Pure: the sweep gathers, this decides.
 */
export function stallFindings(
  deals: ReadonlyArray<StallDeal>,
  links: ReadonlyMap<string, { implementationId: string | null; customerName: string | null }>,
  today: string,
): StallFinding[] {
  const out: StallFinding[] = [];
  for (const d of deals) {
    if (!d.stage_entered_at || !STAGE_LIMITS[d.stage]) continue;
    const days = Math.max(0, businessDaysBetween(d.stage_entered_at.slice(0, 10), today));
    if (stuckLevel(d.stage, days) !== "escalate") continue;
    const label = isStage(d.stage) ? STAGE_LABELS[d.stage] : "its stage";
    const link = links.get(d.id);
    const who = link?.customerName?.trim() || d.name;
    out.push({
      dealId: d.id,
      customerId: d.customer_id,
      implementationId: link?.implementationId ?? null,
      visit: `${d.stage}@${d.stage_entered_at}`,
      title: `Stuck: ${who} — ${days} business days in ${label}`,
      detail: `${d.name} entered ${label} on ${d.stage_entered_at.slice(0, 10)} and has been there ${days} business days; the limit is ${STAGE_LIMITS[d.stage]!.escalate}.`,
      businessDays: days,
    });
  }
  return out;
}

/**
 * The SLA sweep's stall pass: raise each finding once per stage visit,
 * acknowledged or not (0080's unique index backs the check against two
 * overlapping sweeps). No email: the escalate nudge has already told the
 * owner and the managers about the same visit; this is the record on
 * /alerts.
 */
export async function runStallAlerts(today = localIso()): Promise<{
  raised: number;
  already: number;
}> {
  const { data: deals, error } = await db()
    .from("portal_accounts")
    .select("id,name,stage,stage_entered_at,customer_id")
    .in("stage", Object.keys(STAGE_LIMITS));
  if (error) throw new Error(`Could not read the deals: ${error.message}`);
  const rows = (deals ?? []) as StallDeal[];
  const ids = rows.map((d) => d.id);
  const customerIds = [...new Set(rows.map((d) => d.customer_id).filter(Boolean))] as string[];
  const [{ data: impls }, { data: customers }] = await Promise.all([
    ids.length
      ? db()
          .from("implementations")
          .select("id,deal_id,created_at")
          .in("deal_id", ids)
          .order("created_at", { ascending: false })
      : { data: [] },
    customerIds.length
      ? db().from("customers").select("id,name").in("id", customerIds)
      : { data: [] },
  ]);
  const implByDeal = new Map<string, string>();
  for (const i of (impls ?? []) as Array<{ id: string; deal_id: string }>)
    if (!implByDeal.has(i.deal_id)) implByDeal.set(i.deal_id, i.id);
  const customerName = new Map(
    ((customers ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
  );
  const links = new Map(
    rows.map((d) => [
      d.id,
      {
        implementationId: implByDeal.get(d.id) ?? null,
        customerName: d.customer_id ? (customerName.get(d.customer_id) ?? null) : null,
      },
    ]),
  );

  const findings = stallFindings(rows, links, today);
  const { createAlert, raisedVisits, visitKey } = await import("./tickets.server");
  const raised = await raisedVisits([STALL_KIND]);
  let count = 0;
  let already = 0;
  for (const f of findings) {
    if (
      raised.has(visitKey(STALL_KIND, f.dealId, f.visit)) ||
      (f.implementationId && raised.has(visitKey(STALL_KIND, f.implementationId, f.visit)))
    ) {
      already += 1;
      continue;
    }
    const row = await createAlert({
      kind: STALL_KIND,
      severity: "warning",
      title: f.title,
      detail: f.detail,
      customerId: f.customerId,
      implementationId: f.implementationId,
      payload: { deal_id: f.dealId, visit: f.visit, business_days: f.businessDays },
      notify: false,
      actor: { type: "system" },
    });
    if (row.already_raised) already += 1;
    else count += 1;
  }
  return { raised: count, already };
}
