import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { businessDaysBetween, localIso } from "./onboarding-timeline";
import { STAGE_LABELS, isStage } from "./presale-stages";
import { STAGE_LIMITS, stuckLevel } from "./stage-flow";
import { isPartnerDeal, isPartnerJourney } from "./partner-implementation";
import { readIntake } from "./intake-answers";
import { isTestAccount } from "./test-accounts";

const db = () => supabaseAdmin as any;

export const STALL_KIND = "stalled_implementation";

export type StallDeal = {
  id: string;
  name: string;
  stage: string;
  stage_entered_at: string | null;
  customer_id: string | null;
  /** A test account (0085): never raised. */
  is_test?: boolean | null;
  /**
   * A partner deal: its attention comes from its own milestones and work
   * items (partner-attention.ts), never from the deal stage's age.
   */
  partner?: boolean;
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
    if (isTestAccount(d) || d.partner) continue;
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
  // `*`: is_test (0085) reads as unset before the migration.
  const { data: deals, error } = await db()
    .from("portal_accounts")
    .select("*")
    .in("stage", Object.keys(STAGE_LIMITS));
  if (error) throw new Error(`Could not read the deals: ${error.message}`);
  const all = (deals ?? []) as StallDeal[];
  const customerIds = [...new Set(all.map((d) => d.customer_id).filter(Boolean))] as string[];
  const ids = all.map((d) => d.id);
  const [{ data: impls }, { data: customers }] = await Promise.all([
    ids.length
      ? db()
          .from("implementations")
          .select("id,deal_id,created_at,journey_type,partner_key")
          .is("superseded_by_implementation_id", null)
          .is("closed_at", null)
          .in("deal_id", ids)
          .order("created_at", { ascending: false })
      : { data: [] },
    customerIds.length ? db().from("customers").select("*").in("id", customerIds) : { data: [] },
  ]);
  const implByDeal = new Map<string, string>();
  const partnerByDeal = new Set<string>();
  for (const i of (impls ?? []) as Array<{
    id: string;
    deal_id: string;
    journey_type?: string | null;
    partner_key?: string | null;
  }>) {
    if (implByDeal.has(i.deal_id)) continue;
    implByDeal.set(i.deal_id, i.id);
    // The board's and deal-facts' rule: the intake's path, or the deal's
    // live (newest, not superseded) project.
    if (isPartnerJourney(i)) partnerByDeal.add(i.deal_id);
  }
  const customerName = new Map(
    ((customers ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
  );
  // A deal whose customer is a test account is one too.
  const testCustomers = new Set(
    ((customers ?? []) as Array<{ id: string; is_test?: boolean | null }>)
      .filter((c) => isTestAccount(c))
      .map((c) => c.id),
  );
  const rows = all.map((d) => ({
    ...d,
    is_test: isTestAccount(d) || Boolean(d.customer_id && testCustomers.has(d.customer_id)),
    partner:
      partnerByDeal.has(d.id) ||
      isPartnerDeal(readIntake((d as { intake?: unknown }).intake ?? {})),
  }));
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
