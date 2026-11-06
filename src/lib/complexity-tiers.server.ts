import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { reportFailure } from "./errors";
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

/**
 * The tiers Settings holds, for a deck calculation. Strict on purpose: a failed read
 * is an error (the deck is held), and a stored configuration with no valid tier is
 * null. The placeholder defaults are never used in its place, so the deck and
 * Settings cannot disagree.
 */
export async function loadConfiguredTiersStrict(): Promise<ComplexityTier[] | null> {
  const { data, error } = await db()
    .from("portal_app_config")
    .select("value")
    .eq("key", CONFIG_KEY)
    .maybeSingle();
  if (error) throw new Error(reportFailure("complexity-tiers", "read the complexity tiers", error));
  const raw = data?.value ?? null;
  const rows: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { tiers?: unknown }).tiers)
      ? (raw as { tiers: unknown[] }).tiers
      : [];
  const valid = rows.filter((r) => {
    if (!r || typeof r !== "object") return false;
    const o = r as Record<string, unknown>;
    return Number.isInteger(Number(o["tier"])) && Number.isFinite(Number(o["business_days"]));
  });
  if (valid.length === 0) return null;
  return parseComplexityTiers(raw);
}
