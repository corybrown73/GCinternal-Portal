import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  auditFailureAlert,
  countFailure,
  emptyCounter,
  isCriticalAudit,
  type AuditHealthCounter,
  type AuditActorType,
} from "@/lib/audit-policy";

const createAdminClient = () => supabaseAdmin as any;

export type ActorType = AuditActorType;

/**
 * `portal_audit_log` — the SECURITY / API action log. One coarse row per
 * action, actor-typed, covering API keys and email tokens as well as people.
 * Its counterpart is `recordActivity()` in src/lib/activity.server.ts, which
 * fills `audit_log`, the field-level account activity feed. See
 * docs/design/hygiene.md §1 — they are not redundant and neither replaces the
 * other.
 *
 * WHAT CHANGED IN PHASE 7: this function used to wrap its insert in a
 * try/catch, log to the console and return. Two things were wrong with that.
 *
 *  1. PostgREST reports errors as a RETURNED `{ error }`, not as a throw — so
 *     the catch never fired and the console.error inside it was dead code for
 *     the commonest failure mode. Every failed audit write was silently
 *     discarded, and an empty history reads as "nothing happened" rather than
 *     as "we don't know".
 *  2. Even had it fired, a console line in a serverless log nobody tails is not
 *     a signal.
 *
 * So failure is now loud in three layers that can each survive the next one
 * failing: the error is inspected and retried once; a failure raises a critical
 * `audit_write_failed` alert; and a failure that cannot even raise an alert is
 * counted in-process and surfaced on /admin. A fourth layer lives in the
 * database — 0025's triggers on `portal_api_keys` and `portal_profiles` write
 * an `.observed` row transactionally, so the two changes with the worst
 * consequences if unrecorded cannot happen without a record, whatever this
 * code does.
 *
 * This function still does not throw by default: turning a swallowed error into
 * a thrown one changes which requests fail. That is gated on `audit_strict`,
 * and only for critical actions.
 */

let counter: AuditHealthCounter = emptyCounter();

/** Read by the /admin audit-health panel. Per-instance; resets on deploy. */
export function auditHealthCounter(): AuditHealthCounter {
  return counter;
}

/** Test seam. */
export function resetAuditHealthCounter(): void {
  counter = emptyCounter();
}

export type AuditEntry = {
  actor_type: AuditActorType;
  actor_id?: string | null;
  action: string;
  entity_type?: string;
  /** For uuid-keyed rows: a customer, an implementation, a ticket. */
  entity_id?: string;
  /**
   * For text-keyed entities: a feature flag, a lifecycle stage, a pipeline
   * stage. Mutually exclusive with entity_id — 0038 enforces that in the
   * database, because a row naming the changed thing twice gives two answers
   * to one question.
   */
  entity_key?: string;
  payload?: Record<string, unknown>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Put each identifier in the column that can hold it.
 *
 * WHY THIS COERCES RATHER THAN TRUSTING THE CALLER. Every feature-flag toggle
 * sent "demo_mode" into a uuid column, Postgres refused it, and the retry-then-
 * alert path turned each one into a Critical alert — while the Features page
 * told the user their change had been recorded against their name. The write
 * that fails loudest in the logs is the one nobody sees on screen.
 *
 * A caller passing a non-uuid entity_id is now redirected to entity_key instead
 * of being sent to the database to fail. That is deliberate belt-and-braces:
 * `entity_key` is the right API and callers should use it, but the audit trail
 * should not be the thing that breaks when somebody forgets.
 */
export function entityRef(entry: AuditEntry): {
  entity_id: string | null;
  entity_key: string | null;
} {
  const id = entry.entity_id ?? null;
  const key = entry.entity_key ?? null;

  if (id && !UUID_RE.test(id)) {
    // Not a uuid, so it can only be a key. Log it: the caller should be fixed,
    // and a silent correction would hide that forever.
    console.warn(
      `[audit] entity_id "${id}" for action "${entry.action}" is not a uuid; recorded as entity_key`,
    );
    return { entity_id: null, entity_key: key ?? id };
  }

  // Both set is the ambiguous case the database refuses. The uuid wins, because
  // it is the more specific of the two, and the loss is noted.
  if (id && key) {
    console.warn(
      `[audit] action "${entry.action}" passed both entity_id and entity_key; keeping the id`,
    );
    return { entity_id: id, entity_key: null };
  }

  return { entity_id: id, entity_key: key };
}

async function insertOnce(entry: AuditEntry): Promise<string | null> {
  const admin = createAdminClient();
  try {
    const ref = entityRef(entry);
    const { error } = await admin.from("portal_audit_log").insert({
      actor_type: entry.actor_type,
      actor_id: entry.actor_id ?? null,
      action: entry.action,
      entity_type: entry.entity_type ?? null,
      entity_id: ref.entity_id,
      entity_key: ref.entity_key,
      payload: entry.payload ?? null,
    });
    return error ? (error.message ?? String(error)) : null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function raiseFailureAlert(entry: AuditEntry, message: string, critical: boolean) {
  const alert = auditFailureAlert({
    action: entry.action,
    actorType: entry.actor_type,
    actorId: entry.actor_id ?? null,
    entityType: entry.entity_type ?? null,
    entityId: entry.entity_id ?? entry.entity_key ?? null,
    message,
    critical,
  });
  try {
    const { error } = await createAdminClient().from("alerts").insert({
      kind: alert.kind,
      severity: alert.severity,
      title: alert.title,
      detail: alert.detail,
      source: alert.source,
      payload: alert.payload,
    });
    return error ? (error.message ?? String(error)) : null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export async function audit(entry: AuditEntry): Promise<void> {
  const first = await insertOnce(entry);
  if (first === null) return;

  // One retry: the commonest real failure here is a transient connection reset,
  // and retrying once is cheaper than losing the record.
  const second = await insertOnce(entry);
  if (second === null) return;

  const critical = isCriticalAudit(entry.action, entry.actor_type);
  counter = countFailure(counter, entry.action, second);

  // A greppable tag, because this is the line that survives when both the audit
  // insert and the alert insert are failing for the same reason.
  console.error(
    `AUDIT_WRITE_FAILED action=${entry.action} actor=${entry.actor_type} critical=${critical} error=${second}`,
  );

  const alertError = await raiseFailureAlert(entry, second, critical);
  if (alertError) {
    console.error(
      `AUDIT_WRITE_FAILED_ALERT_ALSO_FAILED action=${entry.action} error=${alertError}`,
    );
  }

  if (critical) {
    const { isFlagOn } = await import("@/lib/app-config.server");
    if (await isFlagOn("audit_strict")) {
      throw new Error(
        `Refusing to complete "${entry.action}" unrecorded: the audit write failed (${second}).`,
      );
    }
  }
}
