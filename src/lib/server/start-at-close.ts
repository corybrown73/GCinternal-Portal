import { supabaseAdmin } from "@/integrations/supabase/client.server";

import type { OnboardingActor } from "../presale.server";

const db = () => supabaseAdmin as any;

export type CloseStart =
  | { started: true; customerId: string; implementationId: string }
  | { started: false; reason: string };

/**
 * What a close does after the stage is written, for a deal that entered at
 * Closed Won or later without the deal page (the MCP create_deal tool, QA
 * 18.1): the customer and the project, the hand to the rotation and the
 * reading — the same steps transitionDeal runs for a close on the page, so
 * Pipeline and Customers stop disagreeing about the deal.
 *
 * The customer is matched the way the page's close matches it: a Salesforce
 * identity link if there is one, else a customer with the same name is a
 * person's call — nothing is created and the reason is audited
 * (`onboarding.autostart_deferred`); with no such name, a new customer.
 * No gate is added here. Never throws.
 */
export async function startOnboardingAtClose(
  actor: OnboardingActor,
  dealId: string,
  readingTrigger: string,
): Promise<CloseStart> {
  const actorType =
    actor.kind === "user" ? "user" : actor.kind === "api_key" ? "api_key" : "system";
  const actorId =
    actor.kind === "user" ? actor.profileId : actor.kind === "api_key" ? actor.apiKeyId : null;
  let result: CloseStart;
  try {
    const { startOnboardingAs } = await import("../presale.server");
    let started = await startOnboardingAs(actor, dealId, {});
    if (started.outcome === "needs_account_choice") {
      const clash = await sameNameCustomer(dealId);
      if (clash) {
        throw new Error(
          `A customer named “${clash.name}” already exists. Pick it, or create a new account.`,
        );
      }
      started = await startOnboardingAs(actor, dealId, { createNewCustomer: true });
    }
    result = {
      started: true,
      customerId: started.customerId,
      implementationId: started.implementationId,
    };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    const { audit } = await import("./audit");
    await audit({
      actor_type: actorType,
      actor_id: actorId,
      action: "onboarding.autostart_deferred",
      entity_type: "account",
      entity_id: dealId,
      payload: { reason },
    });
    return { started: false, reason };
  }

  // The rotation, as a close on the page hands it: by rule, or the pool is
  // asked to claim it. Not at Field Fusion setup: there, as on the page, the
  // person who does the setup owns the deal until "Hand to implementation".
  try {
    const { assignDeal, dealAssignment } = await import("../assignment.server");
    const { data: deal } = await db()
      .from("portal_accounts")
      .select("stage")
      .eq("id", dealId)
      .maybeSingle();
    const current = await dealAssignment(dealId);
    if (!current.owner && deal?.stage !== "field_fusion_setup") {
      await assignDeal({ dealId, implementationId: result.implementationId || null });
    }
  } catch (e) {
    console.error("[close] could not hand the deal to the rotation", e);
  }
  const { autoReadDeal } = await import("./ai/jobs");
  await autoReadDeal(dealId, readingTrigger);
  return result;
}

/** A customer already named like the deal, as the page's close checks it. */
export async function sameNameCustomer(
  dealId: string,
): Promise<{ id: string; name: string } | null> {
  const { data: acct } = await db()
    .from("portal_accounts")
    .select("name")
    .eq("id", dealId)
    .maybeSingle();
  const name = String(acct?.name ?? "").trim();
  if (!name) return null;
  const { data: sameName } = await db()
    .from("customers")
    .select("id,name")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  return sameName ? { id: String(sameName.id), name: String(sameName.name) } : null;
}
