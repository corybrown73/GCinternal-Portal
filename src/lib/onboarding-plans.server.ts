import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { readPlanOverrides } from "./onboarding-plans";
import { applyPlanOverrides, type PlanOverrides } from "./onboarding-timeline";

/**
 * Persistence for the admin's plan changes: one row in `portal_app_config`,
 * keyed `onboarding_plans`, next to the flags, the branding and the nav.
 * No migration — the table is key/value JSON and exists for exactly this.
 *
 * Cached fifteen seconds, like the lifecycle stages: the request middleware
 * asks on every request, and an admin's save should show on the next page.
 */

const KEY = "onboarding_plans";
const CACHE_MS = 15_000;
const db = () => supabaseAdmin as any;

let cache: { at: number; value: PlanOverrides } | null = null;

export function resetPlanOverridesCache(): void {
  cache = null;
}

export async function loadPlanOverrides(): Promise<PlanOverrides> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const { data, error } = await db()
      .from("portal_app_config")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const value = readPlanOverrides(data?.value);
    cache = { at: Date.now(), value };
    return value;
  } catch (e) {
    // The plans in code are the fallback; a config read must never be the
    // reason a page or a customer's link fails.
    console.error("[plans] could not read the configured plans; using the defaults", e);
    return {};
  }
}

/** Load and install, for the server: every planFor() on this request reads them. */
export async function ensurePlanOverrides(): Promise<PlanOverrides> {
  const value = await loadPlanOverrides();
  applyPlanOverrides(value);
  return value;
}

export async function savePlanOverrides(next: PlanOverrides): Promise<PlanOverrides> {
  const value = readPlanOverrides(next);
  const { data: existing } = await db()
    .from("portal_app_config")
    .select("key")
    .eq("key", KEY)
    .maybeSingle();
  const { error } = existing
    ? await db()
        .from("portal_app_config")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("key", KEY)
    : await db().from("portal_app_config").insert({ key: KEY, value });
  if (error) throw new Error(`Could not save the plans: ${error.message}`);
  cache = { at: Date.now(), value };
  applyPlanOverrides(value);
  return value;
}
