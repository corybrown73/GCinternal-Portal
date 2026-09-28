import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { guideSteps, type GuideStep } from "./deal-guide";
import { deliverablePhases, type DeliverablePhase } from "./deliverables";
import { readIntake } from "./intake-answers";
import { closeDateFor, timelineFor } from "./onboarding-plan";
import { dayCounter, todayIn, type DayCounter } from "./onboarding-timeline";
import { loadPipelineStages } from "./pipeline-stages.server";
import { terminalStage, wonStage } from "./pipeline-stages";
import { loadWelcome } from "./welcome.server";

const db = () => supabaseAdmin as any;

/**
 * One line about a deal's onboarding, for any page that is not the deal
 * page: where it is on its clock, and the next thing to do. The customer
 * record shows this so the work and the plan meet on one screen.
 */
export type DealPulse = {
  dealId: string;
  path: "new_logo" | "existing" | "dm_conversion" | "field_fusion";
  counter: DayCounter;
  next: GuideStep | null;
  done: number;
  total: number;
  shareUrl: string | null;
  /** The build as phases, for the tile strip. */
  deliverables: DeliverablePhase[];
};

export async function loadDealPulse(dealId: string, today?: string): Promise<DealPulse | null> {
  const asOf = today ?? todayIn(null);
  const [
    { data: deal },
    { data: history },
    stages,
    { count: reports },
    { count: briefs },
    welcome,
  ] = await Promise.all([
    db()
      .from("portal_accounts")
      .select("id,intake,sow_document_path,welcome_share_url,welcome_opened_at")
      .eq("id", dealId)
      .maybeSingle(),
    db().from("portal_stage_transitions").select("to_stage,occurred_at").eq("account_id", dealId),
    loadPipelineStages(),
    db()
      .from("portal_gong_reports")
      .select("id", { count: "exact", head: true })
      .eq("account_id", dealId),
    db()
      .from("portal_briefs")
      .select("id", { count: "exact", head: true })
      .eq("account_id", dealId)
      .eq("status", "complete")
      .eq("generator", "llm"),
    // The same readiness list the deal page's checklist reads. Without it
    // the last step ("send the link") ticked here and not there, and the
    // two counters on one screen disagreed.
    loadWelcome(dealId).catch(() => null),
  ]);
  if (!deal) return null;
  const won = wonStage(stages).key;
  const intake = readIntake(deal.intake);
  const stageHistory = (history ?? []) as Array<{ to_stage: string; occurred_at: string }>;
  const close = closeDateFor({ intake, stageHistory, wonStageKey: won, today: asOf });
  const timeline = timelineFor(intake, close.date);
  const steps = guideSteps({
    intake: deal.intake,
    gongReports: reports ?? 0,
    aiBriefs: briefs ?? 0,
    hasSow: Boolean(deal.sow_document_path),
    shareUrl: (deal.welcome_share_url as string | null) ?? null,
    stageHistory,
    wonStageKey: won,
    readiness: welcome?.readiness ?? [],
    customerOpened: Boolean(deal.welcome_opened_at),
    today: asOf,
  });
  return {
    dealId,
    path: timeline.path,
    counter: dayCounter(timeline, asOf),
    next: steps.find((s) => !s.done) ?? null,
    done: steps.filter((s) => s.done).length,
    total: steps.length,
    shareUrl: (deal.welcome_share_url as string | null) ?? null,
    deliverables: deliverablePhases(intake, timeline),
  };
}

export async function startServicesDeal(
  userId: string,
  customerId: string,
): Promise<{ dealId: string; created: boolean; implementationId: string | null }> {
  const { requireSalesEditor } = await import("./presale.server");
  await requireSalesEditor(userId);
  const { data: customer } = await db()
    .from("customers")
    .select("id,name,industry")
    .eq("id", customerId)
    .maybeSingle();
  if (!customer) throw new Error("No such customer");

  // One open services deal per customer at a time: reuse it rather than
  // stacking a second plan on the same account.
  const stages = await loadPipelineStages();
  const won = wonStage(stages).key;
  const terminal = terminalStage(stages).key;
  const { data: open } = await db()
    .from("portal_accounts")
    .select("id,intake,stage")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open && open.stage !== terminal && readIntake(open.intake).path === "existing") {
    const { data: impl } = await db()
      .from("implementations")
      .select("id")
      .eq("deal_id", open.id)
      .is("superseded_by_implementation_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { dealId: String(open.id), created: false, implementationId: impl?.id ?? null };
  }

  // What the customer already told us: their champion and the forms they
  // run come from the record and the deal before this one, marked as a
  // person's answers so the review never asks for them again.
  const inherited = await inheritance(customerId);
  const name = `${String(customer.name)} — services`;
  const { data: created, error } = await db()
    .from("portal_accounts")
    .insert({
      name,
      customer_id: customerId,
      stage: won,
      created_by: userId,
      ...(inherited.contact
        ? {
            primary_contact_name: inherited.contact.name,
            primary_contact_role: inherited.contact.role,
            primary_contact_email: inherited.contact.email,
          }
        : {}),
      intake: {
        path: "existing",
        industry: customer.industry ?? null,
        ...(inherited.forms.length ? { wanted_forms: inherited.forms, forms_built: true } : {}),
        person_set: [
          ...(customer.industry ? ["industry"] : []),
          ...(inherited.forms.length ? ["wanted_forms", "forms_built"] : []),
        ],
      },
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Could not start the services deal");
  const dealId = String(created.id);

  // The creation history row, the same shape upsertAccount writes, so the
  // analytics and the day counter see this deal's close date like any other.
  await db().from("portal_stage_transitions").insert({
    account_id: dealId,
    from_stage: null,
    to_stage: won,
    source: "ui",
    actor_profile_id: userId,
    note: "Services deal started from the customer record",
  });

  // Closing is the start: the services deal gets its implementation on this
  // customer's page now, the way a closed deal does, so it never sits in
  // Closed Won as a phantom nobody claims.
  let implementationId: string | null = null;
  try {
    const { startOnboardingAs } = await import("./presale.server");
    const started = await startOnboardingAs({ kind: "user", profileId: userId }, dealId, {
      customerId,
    });
    implementationId = started.implementationId || null;
  } catch (e) {
    console.error("[services] could not start the implementation for the services deal", e);
  }

  const { audit } = await import("./server/audit");
  await audit({
    actor_type: "user",
    actor_id: userId,
    action: "deal.services_started",
    entity_type: "account",
    entity_id: dealId,
    payload: { customer_id: customerId },
  });

  try {
    const { assignDeal } = await import("./assignment.server");
    await assignDeal({ dealId, actorProfileId: userId });
  } catch (e) {
    console.error("[services deal] could not assign", e);
  }
  return { dealId, created: true, implementationId };
}

/**
 * What a customer's earlier record already says: the champion (the first
 * contact whose role reads as one, else the first contact) and the forms
 * their last deal named. Never throws; an empty answer just means the
 * review asks.
 */
async function inheritance(customerId: string): Promise<{
  contact: { name: string; role: string; email: string | null } | null;
  forms: Array<{ id: string; name: string; template_id: null }>;
}> {
  try {
    const [{ data: contacts }, { data: deals }] = await Promise.all([
      db()
        .from("customer_contacts")
        .select("name,role,email,created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: true })
        .limit(10),
      db()
        .from("portal_accounts")
        .select("intake,created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);
    const rows = (contacts ?? []) as Array<{ name: string; role: string; email: string | null }>;
    const champion =
      rows.find((c) => /champion|primary|owner|sponsor|manager|director/i.test(c.role ?? "")) ??
      rows[0] ??
      null;
    const forms: Array<{ id: string; name: string; template_id: null }> = [];
    const seen = new Set<string>();
    for (const d of (deals ?? []) as Array<{ intake: unknown }>) {
      for (const f of readIntake(d.intake).wanted_forms) {
        const key = f.name.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        forms.push({ id: `inherited-${forms.length + 1}`, name: f.name, template_id: null });
      }
    }
    return {
      contact: champion
        ? { name: champion.name, role: champion.role || "Champion", email: champion.email ?? null }
        : null,
      forms: forms.slice(0, 8),
    };
  } catch (e) {
    console.error("[services deal] could not read the customer's earlier record", e);
    return { contact: null, forms: [] };
  }
}
