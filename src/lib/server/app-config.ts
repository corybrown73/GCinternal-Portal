import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Reads the operational settings stored as `portal_app_config` rows — link TTL,
 * reassign rate limit, snapshot share TTL.
 *
 * Separate from `src/lib/app-config.server.ts`, which reads the single
 * `v2_flags` row: flags are rollout switches, these are tunable numbers an
 * operator may change without a deploy. Neither is ever an authorization
 * decision — the 60s cache means a change propagates unevenly across lambdas,
 * so anything security-relevant is decided from the grant row instead.
 *
 * Before 0019, nothing in src/ read this table at all (only SQL triggers did),
 * which is why this helper exists.
 */

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

async function readConfig(key: string): Promise<unknown> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  try {
    const { data } = await (supabaseAdmin as any)
      .from("portal_app_config")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const value = data?.value ?? null;
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    // A config read failure must never take a page down; the caller's default
    // is the documented seeded value.
    console.error(`[app-config] could not read ${key}`, e);
    return null;
  }
}

export async function getConfigNumber(key: string, fallback: number): Promise<number> {
  const value = await readConfig(key);
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Test seam — drops the per-instance cache. */
export function resetConfigCache(): void {
  cache.clear();
}

/** The seeded defaults, named once so a caller never invents its own. */
export const CONFIG_DEFAULTS = {
  external_plan_link_ttl_days: 60,
  external_plan_reassign_daily_limit: 10,
  snapshot_share_ttl_days: 30,
} as const;
