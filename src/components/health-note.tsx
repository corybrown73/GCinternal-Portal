import { humanize } from "@/lib/hub-format";
import type { ImplHealth } from "@/lib/customer360-derive";

/**
 * What a person said about health, next to what the signals say.
 *
 * The distinction is load-bearing. `health_recorded` is only ever written by a
 * human through the editor, so it can be attributed. `status` is also written
 * programmatically (the handoff path inserts 'on_track'; the DB default is
 * 'active') and no status edit is audited anywhere — so a status value is NOT
 * evidence that anyone said anything, and this component never presents it as
 * though someone did.
 */

/**
 * Legacy `status` values worth showing a person.
 *
 * NOT "on_track", which every creation path writes by default —
 * startOnboarding, both Salesforce RPCs and the seed all insert it, and no
 * edit to `status` is audited anywhere. So an `on_track` flag is the absence
 * of a statement, not a statement, and this note was rendering it on 100% of
 * rows: nine of nine implementations in production carried `on_track` with no
 * recorded health, and every single one of them printed "Legacy flag: On track
 * (unconfirmed)". A caveat that appears on everything says nothing about
 * anything, and trains people to stop reading the line it sits on.
 *
 * `at_risk` and `blocked` are different: nothing writes them automatically, so
 * one of them in the column means somebody set it, even though we cannot say
 * who. That is worth surfacing, with the caveat intact.
 */
const NOTEWORTHY_LEGACY_STATUS = ["at_risk", "blocked"];

/**
 * Whether the legacy flag is worth a line on screen. Exported so the rule can
 * be tested without a DOM — the whole point of the fix is which rows it stays
 * silent on, and that is a decision, not a rendering.
 */
export function showsLegacyFlag(
  legacyStatus: string | null | undefined,
  computed: ImplHealth,
  recorded?: string | null,
): boolean {
  if (recorded) return false;
  if (!legacyStatus) return false;
  if (!NOTEWORTHY_LEGACY_STATUS.includes(legacyStatus)) return false;
  // The flag agreeing with the signals adds nothing to what is already shown.
  return legacyStatus !== computed;
}

export function HealthNote({
  recorded,
  recordedReason,
  recordedAt,
  legacyStatus,
  computed,
  className,
}: {
  recorded?: string | null;
  recordedReason?: string | null;
  recordedAt?: string | null;
  /** implementations.status — the pre-v2 flag. */
  legacyStatus?: string | null;
  /** The level deriveHealth produced, for disagreement flagging. */
  computed: ImplHealth;
  className?: string;
}) {
  if (recorded) {
    const disagrees = recorded !== computed;
    return (
      <span className={className ?? "text-[11px] text-muted-foreground"}>
        Owner says: {humanize(recorded)}
        {recordedReason ? ` — ${recordedReason}` : ""}
        {disagrees ? (
          <span
            className="ml-1"
            title="The owner's call and the signals in the record disagree. Neither is overwritten."
          >
            · signals say {humanize(computed)}
          </span>
        ) : null}
        {recordedAt ? (
          <span className="ml-1 font-mono">{new Date(recordedAt).toISOString().slice(0, 10)}</span>
        ) : null}
      </span>
    );
  }

  // No human statement on file. Show the legacy flag only when it actually
  // says something — see NOTEWORTHY_LEGACY_STATUS — and label what it is and
  // is not.
  if (showsLegacyFlag(legacyStatus, computed, recorded)) {
    return (
      <span
        className={className ?? "text-[11px] text-muted-foreground"}
        title="Set by the app or an import, not recorded by an owner. Editing health replaces it."
      >
        Legacy flag: {humanize(legacyStatus)} (unconfirmed)
      </span>
    );
  }

  return null;
}
