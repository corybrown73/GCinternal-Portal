import type { IntakeAnswers } from "./intake-answers";
import { INTEGRATION_TIERS, addBusinessDays } from "./onboarding-timeline";

/**
 * The complexity tiers: how long an implementation of a given shape is
 * expected to take from the close to Operational Go-Live, in business days.
 * Deployment-wide and editable in Settings; the operating model keeps the
 * tier-expected date apart from the baseline and the current target, so the
 * report can say "slower than the tier said" without a date being rewritten.
 *
 * Seeded from the integration tiers as placeholders until the real matrix
 * is pasted in: 15 business days (the standard implementation) plus five
 * per week of integration build.
 */
export type ComplexityTier = {
  tier: number;
  name: string;
  /** Business days from the close to the expected Go-Live. */
  business_days: number;
  /** When a deal is this tier — the matrix's row, in words. */
  qualifies: string;
};

export const DEFAULT_COMPLEXITY_TIERS: readonly ComplexityTier[] = INTEGRATION_TIERS.map((t) => ({
  tier: t.tier,
  name: t.name,
  business_days: 15 + t.weeks * 5,
  qualifies: t.summary,
}));

const MAX_TIERS = 12;

/** The stored config, read defensively: a bad row is dropped, an empty list falls back to the defaults. */
export function parseComplexityTiers(value: unknown): ComplexityTier[] {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { tiers?: unknown }).tiers)
      ? (value as { tiers: unknown[] }).tiers
      : [];
  const out: ComplexityTier[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const tier = Number(o["tier"]);
    const days = Number(o["business_days"]);
    if (!Number.isInteger(tier) || tier < 0 || !Number.isFinite(days) || days < 0) continue;
    if (out.some((x) => x.tier === tier)) continue;
    out.push({
      tier,
      name: typeof o["name"] === "string" && o["name"].trim() ? o["name"].trim() : `Tier ${tier}`,
      business_days: Math.round(days),
      qualifies: typeof o["qualifies"] === "string" ? o["qualifies"].trim() : "",
    });
    if (out.length >= MAX_TIERS) break;
  }
  out.sort((a, b) => a.tier - b.tier);
  return out.length ? out : [...DEFAULT_COMPLEXITY_TIERS];
}

/**
 * Which tier a deal is, from what the intake knows: the highest integration
 * tier on the plan (the plan's own field, or any integration bought). The
 * tier the matrix names is the one the config holds; an unknown number
 * falls to the nearest lower tier so a deal is never without one.
 */
export function tierForIntake(
  intake: Pick<IntakeAnswers, "timeline">,
  tiers: readonly ComplexityTier[] = DEFAULT_COMPLEXITY_TIERS,
): ComplexityTier | null {
  if (!tiers.length) return null;
  const n = Math.max(
    intake.timeline.integration_tier ?? 0,
    ...intake.timeline.services
      .filter((s) => s.kind === "integration")
      .map((s) => (s as { tier?: number | null }).tier ?? 0),
  );
  const sorted = [...tiers].sort((a, b) => a.tier - b.tier);
  let pick = sorted[0]!;
  for (const t of sorted) if (t.tier <= n) pick = t;
  return pick;
}

/** The Go-Live the tier expects, counted in business days from the close. */
export function expectedGoLive(close: string, tier: ComplexityTier): string {
  return addBusinessDays(close, tier.business_days);
}

export const TIER_REASON_CODES = [
  { code: "tier_mismatch", label: "Tier mismatch — it was more complex than tiered" },
  { code: "mis_scope", label: "Mis-scope — the SOW missed something" },
  { code: "expansion", label: "Expansion — the customer asked for more" },
  { code: "internal_delivery", label: "Internal delivery — our side slipped" },
  { code: "customer", label: "Customer — their side slipped" },
  { code: "feasibility_outcome", label: "Feasibility outcome — it could not be built as sold" },
] as const;

export type TargetReasonCode = (typeof TIER_REASON_CODES)[number]["code"];

export function reasonLabel(code: string | null): string {
  return TIER_REASON_CODES.find((r) => r.code === code)?.label ?? "Reason not given yet";
}
