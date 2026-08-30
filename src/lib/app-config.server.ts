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
  /** Phase 4: the external plan is readable through a signed link or /portal. */
  external_plan_view_enabled: boolean;
  /** Phase 4: external viewers may complete, comment, upload and reassign. */
  external_plan_actions_enabled: boolean;
  /** Phase 5: Salesforce auto-create — the ingest, customer adoption and the deal link. */
  sf_auto_create: boolean;
  /** Phase 5: the presale stage seam — the deal's stage moves, forward only. */
  sf_presale_bridge: boolean;
  /**
   * Phase 6: emission of the champion-gone-quiet and launch-date-at-risk
   * alerts from the hourly cron. The `/signals` surface is read-only and is
   * deliberately NOT flagged — this gates who gets notified, never who can see.
   */
  signals_alerts: boolean;
  /** Phase 7: hub mutations write the account activity feed (`audit_log`). */
  audit_activity_feed: boolean;
  /** Phase 7: a failed audit write on a critical action aborts the mutation. */
  audit_strict: boolean;
  /** Phase 7: the Record-handover form on the Customer 360. */
  handover_record: boolean;
  /** Phase 7: the manual decision ↔ solution trace linker. */
  trace_links_editing: boolean;
  /** Phase 7: `/search` across customers, deals, tickets, solutions and people. */
  global_search: boolean;
  /** Phase 7: named, shareable saved search parameters per surface. */
  saved_views: boolean;
  /** Phase 7: pseudonymised customer identities at the server projection. */
  demo_mode: boolean;
  /** Phase 7: API-key expiry and per-minute rate limits are enforced. */
  api_key_limits: boolean;
  /**
   * The pre-sale pipeline's stages come from `portal_pipeline_stages` (0028)
   * rather than from the compiled-in enum mirror.
   *
   * This is a DEPLOY gate, not a behaviour switch. 0028 seeds the table with
   * the enum, in enum order, with the labels the UI already renders, so both
   * paths produce identical output until somebody edits the configuration.
   * What the flag buys is that this code is safe to ship ahead of its
   * migration: with it off nothing here touches the new table at all.
   */
  presale_stage_config: boolean;
  /**
   * The per-project conversation (0029): a shared thread with @mentions,
   * reaching internal staff and customer contacts in one place.
   *
   * Gating this separately from the external portal flags is deliberate. The
   * thread is useful internally on its own — it is where the internal notes
   * live — and turning it on does not by itself put anything in front of a
   * customer. What a customer can see is still governed by
   * `external_plan_view_enabled`, and what they can write by
   * `external_plan_actions_enabled`.
   */
  conversations: boolean;
};

const DEFAULT_FLAGS: V2Flags = {
  account_model: false,
  journey_templates: false,
  work_items: false,
  handoff_gate: false,
  /** Phase 4: both off; the external surfaces refuse server-side until flipped. */
  external_plan_view_enabled: false,
  external_plan_actions_enabled: false,
  /* Phase 5 */
  sf_auto_create: false,
  sf_presale_bridge: false,
  /** Phase 6: see the type above. */
  signals_alerts: false,
  /* Phase 7 — platform hygiene completion. All off. */
  audit_activity_feed: false,
  audit_strict: false,
  handover_record: false,
  trace_links_editing: false,
  global_search: false,
  saved_views: false,
  demo_mode: false,
  api_key_limits: false,
  /* Configurable pre-sale pipeline — see docs/design/presale-stages.md. */
  presale_stage_config: false,
  /* Per-project conversations — see docs/design/conversations.md. */
  conversations: false,
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
