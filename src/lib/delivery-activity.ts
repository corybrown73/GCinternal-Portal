/**
 * What a delivery-record write puts in the account activity feed.
 *
 * Pure and separate from hub.server so the shape of a feed row can be tested
 * without standing up the service-role client.
 */

/**
 * The singular noun for a delivery table, used as the activity feed's
 * entity_type. The feed is read by people, so "risk" beats "risks".
 */
const DELIVERY_ENTITY: Record<string, string> = {
  requirements: "requirement",
  risks: "risk",
  issues: "issue",
  escalations: "escalation",
  decisions: "decision",
  commitments: "commitment",
};

/**
 * Record a delivery write in the account activity feed.
 *
 * WHAT WAS MISSING. Editing an implementation's own fields wrote to `audit_log`
 * through recordActivity, and every screen showing "who changed what on this
 * account" read that. Creating or editing the records people actually argue
 * about — a risk's severity, an issue's resolution, a commitment's date —
 * wrote nothing at all. The feed was not incomplete in a way you could see:
 * it looked like a full history in which nobody had ever touched a risk.
 *
 * One row per changed field, so the feed can answer "who moved this to
 * critical" and not only "somebody saved this record". `old_value` is left
 * unset: reading the row back first would double the round trips on every
 * save, and the feed's own screens show the current value beside the change.
 *
 * Never throws. An unrecorded edit is bad; an edit refused because recording it
 * failed is worse, and recordActivity already logs and counts its own
 * failures.
 */
export function deliveryActivityChanges(
  table: string,
  rowId: string | null,
  patch: Record<string, unknown>,
  reason: string,
): Array<{
  entity_type: string;
  entity_id: string;
  field_name: string;
  new_value: string | null;
  change_reason: string;
}> {
  const entity = DELIVERY_ENTITY[table];
  if (!entity || !rowId) return [];
  return Object.entries(patch).map(([field, value]) => ({
    entity_type: entity,
    entity_id: rowId,
    field_name: field,
    new_value: value == null ? null : String(value),
    change_reason: reason,
  }));
}
