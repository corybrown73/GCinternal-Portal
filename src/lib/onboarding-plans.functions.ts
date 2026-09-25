import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

import { planOverridesSchema, planProblems, readPlanOverrides } from "./onboarding-plans";

/**
 * Reading is open to any internal user: every page that draws a plan needs
 * the same days the server used. Writing is for managers — it changes the
 * dates every deal of that type promises a customer — and every change is
 * audited with the before and after.
 */

const MANAGERS = new Set(["manager", "admin", "super_admin"]);

export const getOnboardingPlans = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadPlanOverrides } = await import("./onboarding-plans.server");
    return loadPlanOverrides();
  });

export const setOnboardingPlans = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ plans: planOverridesSchema }).parse(data))
  .handler(async ({ data, context }) => {
    const { requireInternal } = await import("./presale.server");
    const actor = await requireInternal(context.userId);
    if (!MANAGERS.has(String(actor.role))) {
      throw new Error("Only a manager can change the onboarding plans.");
    }
    const next = readPlanOverrides(data.plans);
    const problems = planProblems(next);
    if (problems.length) throw new Error(problems.join(" "));

    const { loadPlanOverrides, savePlanOverrides } = await import("./onboarding-plans.server");
    const { audit } = await import("./server/audit");
    const before = await loadPlanOverrides();
    const after = await savePlanOverrides(next);
    await audit({
      actor_type: "user",
      actor_id: actor.id,
      action: "onboarding_plans.changed",
      entity_type: "app_config",
      entity_key: "onboarding_plans",
      payload: { before, after },
    });
    return after;
  });
