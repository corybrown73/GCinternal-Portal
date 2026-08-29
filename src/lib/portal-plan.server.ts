import { linkedGrants, type CustomerGrant } from "./tickets.server";
import {
  loadSharedPlan,
  requireActionsEnabled,
  requireViewEnabled,
  workItemForRef,
  type ExternalViewer,
} from "./server/external-viewer";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { audit } from "./server/audit";
import { recordPlanEvent } from "./external-plan.server";
import type { SharedPlan } from "./shared-plan";

/**
 * The authenticated door onto the same plan: /portal/plan/$portalKey.
 *
 * The strict-IT fallback. A customer who has a login sees exactly what a link
 * holder sees, because both render through `loadSharedPlan` — that is the
 * single-projection claim, and it is what makes a visibility bug impossible to
 * have in only one of the two doors.
 *
 * Scope comes from `customer_users` (0011's implementation scope included),
 * resolved from the authenticated user id and never from the request.
 */

const db = () => supabaseAdmin as any;

async function viewerFor(userId: string): Promise<ExternalViewer> {
  const grants: CustomerGrant[] = await linkedGrants(userId);
  if (grants.length === 0) {
    throw new Error("No customer is linked to this login yet.");
  }
  const customerIds = [...new Set(grants.map((g) => g.customer_id))];
  // A single account-wide grant means "every implementation of that customer",
  // which is expressed as no implementation filter at all.
  const scoped = grants.every((g) => g.implementation_id !== null)
    ? grants.map((g) => g.implementation_id as string)
    : null;
  return { kind: "auth", profileId: userId, customerIds, implementationIds: scoped };
}

export async function loadPortalPlan(userId: string, portalKey: string): Promise<SharedPlan> {
  await requireViewEnabled();
  return loadSharedPlan(await viewerFor(userId), portalKey);
}

/**
 * Complete a task from the authenticated door. Same rules as the link door,
 * and recorded the same way — `completed_via` is the only thing that differs,
 * because which door someone came through is a fact worth keeping.
 */
export async function completePortalTask(
  userId: string,
  portalKey: string,
  ref: string,
): Promise<SharedPlan> {
  await requireActionsEnabled();
  const viewer = await viewerFor(userId);
  // Re-resolving through loadSharedPlan first is what proves this user may see
  // this implementation at all; the ref is only meaningful inside it.
  await loadSharedPlan(viewer, portalKey);
  const { data: impl } = await db()
    .from("implementations")
    .select("id")
    .eq("portal_key", portalKey)
    .maybeSingle();
  if (!impl) throw new Error("No such plan");

  const item = await workItemForRef(impl.id, ref);
  if (item.visibility !== "shared" || item.party !== "customer") {
    throw new Error("Forbidden: that task is not yours to complete");
  }
  if (item.status !== "done") {
    const { data: contactRow } = await db()
      .from("customer_users")
      .select("contact_id")
      .eq("profile_id", userId)
      .limit(1);
    const contactId = ((contactRow ?? []) as any[])[0]?.contact_id ?? null;

    await db()
      .from("work_items")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
        completed_by_contact_id: contactId,
        completed_via: "external_auth",
      })
      .eq("id", item.id);

    await recordPlanEvent({
      implementationId: impl.id,
      contactId,
      profileId: userId,
      event: "task_completed",
      metadata: { work_item_id: item.id, title: item.title, door: "auth" },
    });
    await audit({
      actor_type: "user",
      actor_id: userId,
      action: "external.task_completed",
      entity_type: "work_item",
      entity_id: item.id,
      payload: { door: "portal" },
    });
  }
  return loadSharedPlan(viewer, portalKey);
}
