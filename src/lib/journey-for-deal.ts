import { LIFECYCLE_STAGE_MAP } from "./lifecycle";
import type { AccountStage } from "./presale-stages";

/**
 * The deal's stage is the source of truth; the implementation's journey
 * follows it.
 *
 * Two rails described the same account and never met: the deal moved
 * Closed Won → Pre-kickoff → Onboarding → Complete while the journey sat
 * at "handoff" forever, so the header said "Onboarding 4/5" and Details
 * said "Stage 1 of 6: Pre-kickoff". Each deal stage now names the band of
 * journey stages it allows — a floor the journey is pulled up to, and a
 * ceiling it is held under — and every deal-stage change clamps the
 * journey into that band. Inside the band the journey still advances on
 * its own signals (kickoff held → build, and so on).
 */

/** The least the journey can be at this deal stage. */
const FLOOR: Record<AccountStage, string | null> = {
  prospect: null,
  negotiate: null,
  closed_won: "handoff",
  field_fusion_setup: "handoff",
  onboarding_kickoff: "handoff",
  get_it_working: "plan-internal",
  make_it_yours: "build",
  make_it_run: "validate-iterate",
  onboarding_complete: "graduate-to-cs",
};

/** The most the journey can be at this deal stage. */
const CEILING: Record<AccountStage, string | null> = {
  prospect: null,
  negotiate: null,
  closed_won: "handoff",
  field_fusion_setup: "handoff",
  onboarding_kickoff: "handoff",
  get_it_working: "build",
  make_it_yours: "validate-iterate",
  make_it_run: "adopt",
  onboarding_complete: "graduate-to-cs",
};

const FULL_ORDER = Object.keys(LIFECYCLE_STAGE_MAP);

/** The first stage in the live order at or after `id` in the full order. */
function atOrAfter(id: string, order: readonly string[]): string | null {
  const idx = FULL_ORDER.indexOf(id);
  if (idx < 0) return null;
  return order.find((s) => FULL_ORDER.indexOf(s) >= idx) ?? null;
}

/** The last stage in the live order at or before `id` in the full order. */
function atOrBefore(id: string, order: readonly string[]): string | null {
  const idx = FULL_ORDER.indexOf(id);
  if (idx < 0) return null;
  return [...order].reverse().find((s) => FULL_ORDER.indexOf(s) <= idx) ?? null;
}

/**
 * Where the journey has to be for this deal stage, given where it is now.
 * `order` is the live lifecycle (configured order, hidden stages removed).
 * Null when nothing has to change — inside the band, or a prospect.
 */
export function journeyTargetForDeal(
  dealStage: AccountStage,
  current: string,
  order: readonly string[],
): string | null {
  const floorId = FLOOR[dealStage];
  const ceilId = CEILING[dealStage];
  if (!floorId || !ceilId) return null;
  const floor = atOrAfter(floorId, order);
  const ceiling = atOrBefore(ceilId, order);
  if (!floor || !ceiling) return null;
  const pos = (s: string) => order.indexOf(s);
  const cur = pos(current);
  // A stage the live rail does not know (hidden, renamed): pull it to the floor.
  if (cur < 0) return floor;
  if (cur < pos(floor)) return floor;
  if (cur > pos(ceiling)) return ceiling;
  return null;
}

/** The band, for a message: "Pre-kickoff keeps the journey at Pre-kickoff". */
export function journeyBandForDeal(
  dealStage: AccountStage,
  order: readonly string[],
): { floor: string; ceiling: string } | null {
  const floorId = FLOOR[dealStage];
  const ceilId = CEILING[dealStage];
  if (!floorId || !ceilId) return null;
  const floor = atOrAfter(floorId, order);
  const ceiling = atOrBefore(ceilId, order);
  return floor && ceiling ? { floor, ceiling } : null;
}
