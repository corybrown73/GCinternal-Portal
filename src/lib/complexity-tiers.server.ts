import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  DEFAULT_COMPLEXITY_TIERS,
  parseComplexityTiers,
  type ComplexityTier,
} from "./complexity-tiers";

const db = () => supabaseAdmin as any;
const CONFIG_KEY = "complexity_tiers";

/** The configured tiers; the placeholders when nothing is stored or the read fails. */
export async function loadComplexityTiers(): Promise<ComplexityTier[]> {
  try {
    const { data } = await db()
      .from("portal_app_config")
      .select("value")
      .eq("key", CONFIG_KEY)
      .maybeSingle();
    return parseComplexityTiers(data?.value ?? null);
  } catch (e) {
    console.error("[tiers] could not read complexity_tiers", e);
    return [...DEFAULT_COMPLEXITY_TIERS];
  }
}

export async function saveComplexityTiers(next: ComplexityTier[]): Promise<ComplexityTier[]> {
  const tiers = parseComplexityTiers(next);
  const { error } = await db()
    .from("portal_app_config")
    .upsert({ key: CONFIG_KEY, value: { tiers } }, { onConflict: "key" });
  if (error) throw new Error(`Could not save the tiers: ${error.message}`);
  return loadComplexityTiers();
}
