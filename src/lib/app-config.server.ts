import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Feature flags, stored as one `portal_app_config` row (key `v2_flags`) so they
 * can be flipped without a deploy.
 *
 * Cached per serverless instance for a short window, which means a flip
 * propagates unevenly for up to CACHE_MS across concurrent lambdas. That is
 * fine for gating UX and workflow changes; it is NOT safe for authorization
 * decisions, which must never be flag-gated (see 0011's header).
 */

export type V2Flags = {
  /** Phase 1: account-model workflow + UX changes. Schema is live regardless. */
  account_model: boolean;
  /** Phase 2: the journey template builder and template-driven plans. */
  journey_templates: boolean;
  /** Phase 2: work items as the plan's unit of work. */
  work_items: boolean;
  /** Phase 3: the handoff packet and its accept/return gate. */
  handoff_gate: boolean;
};

const DEFAULT_FLAGS: V2Flags = {
  account_model: false,
  journey_templates: false,
  work_items: false,
  handoff_gate: false,
};
const CACHE_MS = 60_000;

let cache: { at: number; flags: V2Flags } | null = null;

export async function getV2Flags(): Promise<V2Flags> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.flags;

  try {
    const { data } = await (supabaseAdmin as any)
      .from("portal_app_config")
      .select("value")
      .eq("key", "v2_flags")
      .maybeSingle();
    const flags: V2Flags = { ...DEFAULT_FLAGS, ...((data?.value ?? {}) as Partial<V2Flags>) };
    cache = { at: Date.now(), flags };
    return flags;
  } catch (e) {
    // A config read failure must never take a page down: fall back to "off",
    // which is always the pre-v2 behavior.
    console.error("[flags] could not read v2_flags; defaulting to off", e);
    return DEFAULT_FLAGS;
  }
}

export async function isFlagOn(flag: keyof V2Flags): Promise<boolean> {
  return (await getV2Flags())[flag];
}

/** Test seam — drops the per-instance cache. */
export function resetFlagCache(): void {
  cache = null;
}
