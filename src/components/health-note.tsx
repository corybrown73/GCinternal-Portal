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

const HEALTH_STATUS_VALUES = ["on_track", "at_risk", "blocked"];

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
  // says something, and label what it is — and is not.
  if (legacyStatus && HEALTH_STATUS_VALUES.includes(legacyStatus) && legacyStatus !== computed) {
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
