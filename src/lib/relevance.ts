import type { WaitingOn } from "./customer360-derive";
import type { TriageBucket } from "./home-triage";
import { isOwnedBy, type OwnershipFacts, type Viewer } from "./ownership";

/**
 * Phase 2: "Needs me" vs "Needs attention" — a viewer-relevance layer that
 * reads `triageRow()`'s output and `ownership.ts`'s book facts, and changes
 * neither. The implementation has one truth (`triageRow()`/`QueueRow`); the
 * viewer only decides which of its own rows are personally theirs to act on.
 */

/** Whose book this implementation is in. Thin wrapper — book membership is
 * already `ownership.ts`'s job; this module never redefines it. */
export function isInMyBook(facts: OwnershipFacts, viewer: Viewer): boolean {
  return isOwnedBy(facts, viewer);
}

/**
 * `dependency.owner` sources that can truthfully name who owns the NEXT
 * MOVE, not just who is tracking the record. Risks, issues and escalations
 * carry only `owner_id` — the person managing the record — with no field
 * saying the next concrete action is theirs (a risk Nikki owns because
 * attendees aren't confirmed still means the customer owns confirming them).
 * Excluding them here is the one rule this module cannot be allowed to drift
 * on silently.
 */
const UNRELIABLE_NEXT_ACTION_SOURCES = new Set(["risks", "issues", "escalations"]);

/**
 * The next-action owner, only where the data actually supports naming one.
 * Never guesses: unknown stays unknown rather than falling back to the
 * record owner.
 */
export function nextActionOwner(
  dependency: WaitingOn,
): { name: string; role: string | null } | null {
  if (!dependency.owner) return null;
  if (dependency.source && UNRELIABLE_NEXT_ACTION_SOURCES.has(dependency.source)) return null;
  return dependency.owner;
}

/** Exact, case-insensitive name match — the only comparison the data supports. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Do I, the viewer, own the immediate next move on this row? True only when
 * a trustworthy source names me explicitly — never inferred from being the
 * implementation owner, the AM, or a risk/issue/escalation's record owner.
 */
export function doINeedToAct(dependency: WaitingOn, viewerName: string | null): boolean {
  if (!viewerName) return false;
  const owner = nextActionOwner(dependency);
  return Boolean(owner && sameName(owner.name, viewerName));
}

/**
 * Something on this row, in my book, needs intervention — `triageRow()`'s
 * own truth (bucket !== "moving"), scoped to my book. Says nothing about
 * who owns the next move; that's `doINeedToAct`.
 */
export function needsAttention(
  row: { bucket: TriageBucket },
  facts: OwnershipFacts,
  viewer: Viewer,
): boolean {
  return isInMyBook(facts, viewer) && row.bucket !== "moving";
}

/**
 * Needs attention, AND the next move is explicitly mine. A strict subset of
 * `needsAttention`: every "needs me" row also needs attention, but a row
 * needing attention has no obligation to also need me — an unknown or
 * someone-else's next-action owner leaves it in "needs attention" only.
 */
export function needsMe(
  row: { bucket: TriageBucket; dependency: WaitingOn },
  facts: OwnershipFacts,
  viewer: Viewer,
): boolean {
  return needsAttention(row, facts, viewer) && doINeedToAct(row.dependency, viewer.name);
}
