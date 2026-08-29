/**
 * What "loud" means when an audit write fails.
 *
 * An audit write that can fail quietly is worse than no audit, because an empty
 * history reads as "nothing happened" rather than as "we don't know". This
 * module holds the two decisions that logic turns on, kept pure so they are
 * testable without a database:
 *
 *  1. which actions are CRITICAL — the ones where losing the record is worse
 *     than failing the request;
 *  2. what the alert raised on failure says.
 *
 * See docs/design/hygiene.md §1.
 */

// `external_contact` comes from Phase 4: a customer acting through a signed
// plan link is a real actor with no auth.users row. Phase 7 centralised this
// type here; dropping the value on the way would have made every external
// action fail its own audit write, since 0020 widened the CHECK to accept it.
export type AuditActorType = "user" | "api_key" | "email_token" | "system" | "external_contact";

/**
 * Prefix match, not equality: `api_key.create`, `api_key.revoke` and anything
 * added later under that prefix are all critical, and a new sibling action
 * should not have to remember to add itself here.
 */
const CRITICAL_ACTION_PREFIXES = [
  "api_key.",
  "profile.role_change",
  "customer.invited",
  "customer.invite_revoked",
  "customer.user_removed",
] as const;

/**
 * Every API-key-actor action is critical regardless of what it is: those are
 * the calls a human never sees happen, so the log is the only witness.
 */
export function isCriticalAudit(action: string, actorType: AuditActorType): boolean {
  if (actorType === "api_key") return true;
  return CRITICAL_ACTION_PREFIXES.some((p) => action.startsWith(p));
}

export type AuditFailureAlert = {
  kind: "audit_write_failed";
  severity: "critical";
  title: string;
  detail: string;
  source: "system";
  payload: Record<string, unknown>;
};

/**
 * The alert body. It names the action and the actor rather than saying "an
 * audit write failed", because the person reading the alert needs to know what
 * is now unrecorded, not that something is.
 */
export function auditFailureAlert(args: {
  action: string;
  actorType: AuditActorType;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  message: string;
  critical: boolean;
}): AuditFailureAlert {
  const target = args.entityType
    ? `${args.entityType}${args.entityId ? ` ${args.entityId}` : ""}`
    : "an unnamed entity";
  return {
    kind: "audit_write_failed",
    severity: "critical",
    title: `Audit write failed for ${args.action}`,
    detail:
      `The action "${args.action}" by ${args.actorType}` +
      `${args.actorId ? ` ${args.actorId}` : ""} on ${target} happened, but could not be ` +
      `recorded in portal_audit_log: ${args.message}. ` +
      (args.critical
        ? "This is a critical action; the change is now unattributed."
        : "The change is now unattributed."),
    source: "system",
    payload: {
      action: args.action,
      actor_type: args.actorType,
      actor_id: args.actorId ?? null,
      entity_type: args.entityType ?? null,
      entity_id: args.entityId ?? null,
      error: args.message,
      critical: args.critical,
    },
  };
}

/** In-process failure counter. Per serverless instance, resets on deploy — a
 * smoke alarm, not a ledger. Read by the /admin audit-health panel. */
export type AuditHealthCounter = {
  failures: number;
  lastAction: string | null;
  lastError: string | null;
  lastAt: string | null;
};

export function emptyCounter(): AuditHealthCounter {
  return { failures: 0, lastAction: null, lastError: null, lastAt: null };
}

export function countFailure(
  counter: AuditHealthCounter,
  action: string,
  message: string,
  at = new Date().toISOString(),
): AuditHealthCounter {
  return { failures: counter.failures + 1, lastAction: action, lastError: message, lastAt: at };
}
