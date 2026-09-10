/**
 * Who gets the account: the weight of a deal, and the pick.
 *
 * THE RULE. Every closed-won deal carries a weight. A small self-serve
 * account is a 1; seats, ARR and an integration tier add to it, by bands a
 * manager can tune. Each person in the pool carries the weight of what they
 * were handed in the last N days, divided by their capacity. The next
 * account goes to whoever carries the least; ties go to whoever has waited
 * longest. So the person who just took the tier-4 integration is skipped
 * on the next small deal until the others catch up — not by a special
 * case, by arithmetic.
 *
 * Pure. The server loads the rules, the pool and the ledger; this decides.
 */

export type Band = { min: number; points: number };

export type AssignmentRules = {
  /** Days of history that count as "carrying". */
  window_days: number;
  /** Every deal is at least this much. */
  base_points: number;
  /** Highest band whose `min` the ARR reaches wins. */
  arr_bands: Band[];
  /** Same, for seats (field users). */
  seat_bands: Band[];
  /** Points by integration tier 0–5. */
  integration_points: Record<string, number>;
};

export const DEFAULT_ASSIGNMENT_RULES: AssignmentRules = {
  window_days: 30,
  base_points: 1,
  arr_bands: [
    { min: 25_000, points: 1 },
    { min: 75_000, points: 2 },
    { min: 150_000, points: 4 },
  ],
  seat_bands: [
    { min: 25, points: 1 },
    { min: 100, points: 2 },
    { min: 250, points: 3 },
  ],
  integration_points: { "0": 0, "1": 0, "2": 1, "3": 2, "4": 4, "5": 6 },
};

/** Fill anything missing or malformed from the defaults. Never throws. */
export function normalizeRules(raw: unknown): AssignmentRules {
  const r = (raw ?? {}) as Partial<AssignmentRules>;
  const bands = (b: unknown, fallback: Band[]): Band[] =>
    Array.isArray(b)
      ? b
          .filter(
            (x): x is Band =>
              typeof x === "object" &&
              x !== null &&
              Number.isFinite((x as Band).min) &&
              Number.isFinite((x as Band).points),
          )
          .map((x) => ({ min: Number(x.min), points: Math.max(0, Math.round(Number(x.points))) }))
          .sort((a, b) => a.min - b.min)
      : fallback;
  const ip: Record<string, number> = { ...DEFAULT_ASSIGNMENT_RULES.integration_points };
  if (r.integration_points && typeof r.integration_points === "object") {
    for (const [k, v] of Object.entries(r.integration_points)) {
      if (/^[0-5]$/.test(k) && Number.isFinite(Number(v)))
        ip[k] = Math.max(0, Math.round(Number(v)));
    }
  }
  return {
    window_days:
      Number.isFinite(r.window_days) && Number(r.window_days) >= 1
        ? Math.round(Number(r.window_days))
        : DEFAULT_ASSIGNMENT_RULES.window_days,
    base_points:
      Number.isFinite(r.base_points) && Number(r.base_points) >= 0
        ? Math.round(Number(r.base_points))
        : DEFAULT_ASSIGNMENT_RULES.base_points,
    arr_bands: bands(r.arr_bands, DEFAULT_ASSIGNMENT_RULES.arr_bands),
    seat_bands: bands(r.seat_bands, DEFAULT_ASSIGNMENT_RULES.seat_bands),
    integration_points: ip,
  };
}

function bandPoints(bands: Band[], value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  let pts = 0;
  for (const b of bands) if (value >= b.min) pts = b.points;
  return pts;
}

export type DealForWeight = {
  arr: number | null;
  seats: number | null;
  integrationTier: number | null;
};

export type WeightBreakdown = {
  base: number;
  arr: number;
  seats: number;
  integration: number;
};

export function dealWeight(
  deal: DealForWeight,
  rules: AssignmentRules,
): { weight: number; breakdown: WeightBreakdown } {
  const breakdown: WeightBreakdown = {
    base: rules.base_points,
    arr: bandPoints(rules.arr_bands, deal.arr),
    seats: bandPoints(rules.seat_bands, deal.seats),
    integration: rules.integration_points[String(deal.integrationTier ?? 0)] ?? 0,
  };
  return {
    weight: breakdown.base + breakdown.arr + breakdown.seats + breakdown.integration,
    breakdown,
  };
}

/** One line a person can read: "1 base · 2 ARR · 1 seats · 2 integration". */
export function describeBreakdown(b: WeightBreakdown): string {
  const parts = [`${b.base} base`];
  if (b.arr) parts.push(`${b.arr} ARR`);
  if (b.seats) parts.push(`${b.seats} seats`);
  if (b.integration) parts.push(`${b.integration} integration`);
  return parts.join(" · ");
}

export type PoolMember = {
  teamMemberId: string;
  name: string;
  capacity: number;
  /** Sum of weights handed to them inside the window. */
  load: number;
  /** ISO timestamp of their most recent assignment, or null. */
  lastAssignedAt: string | null;
};

export type Ranked = PoolMember & { effectiveLoad: number };

/** Least effective load first; then longest since last pick; then name. */
export function rankPool(pool: readonly PoolMember[]): Ranked[] {
  return pool
    .map((m) => ({ ...m, effectiveLoad: m.load / (m.capacity > 0 ? m.capacity : 1) }))
    .sort((a, b) => {
      if (a.effectiveLoad !== b.effectiveLoad) return a.effectiveLoad - b.effectiveLoad;
      const at = a.lastAssignedAt ?? "";
      const bt = b.lastAssignedAt ?? "";
      if (at !== bt) return at < bt ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function pickAssignee(pool: readonly PoolMember[]): Ranked | null {
  return rankPool(pool)[0] ?? null;
}

/**
 * Integration tier from whatever a sheet or a rep typed: a number 0–5, or the
 * tier's name. Null when it is not recognisable.
 */
export function integrationTierFrom(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (Number.isInteger(n) && n >= 0 && n <= 5) return n;
  const s = String(value).trim().toLowerCase();
  const names: Record<string, number> = {
    none: 0,
    no: 0,
    standard: 1,
    intermediate: 2,
    advanced: 3,
    complex: 4,
    "complex or time consuming": 4,
    unknown: 5,
    chaotic: 5,
  };
  if (s in names) return names[s]!;
  if (s.startsWith("complex")) return 4;
  if (s.startsWith("chaotic")) return 5;
  return null;
}
