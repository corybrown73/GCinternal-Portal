import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = () => supabaseAdmin as any;

/**
 * The event outbox and the never-throw alert wrapper.
 *
 * `emitEvent` follows `audit()`'s contract, not `createAlert()`'s: emitting an
 * event must never take down the write that produced it. A lost event is a gap
 * a consumer tolerates (deliveries are at-least-once and unordered by
 * contract); a 500 on a stage advance because a webhook table hiccuped is a
 * bug we would have shipped on purpose.
 *
 * Dedupe is done by a partial unique index on (org_id, dedupe_key) where the
 * row is still undispatched — a read-then-insert would race two Zapier retries
 * against each other. A 23505 here means "already queued", which is success.
 */

export const EVENT_TYPES = [
  "implementation.created",
  "stage.changed",
  "gate.blocked",
  "alert.raised",
  "handoff.returned",
  "salesforce.write_back",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type EmitEventInput = {
  event_type: EventType;
  entity_type: string;
  entity_id: string;
  implementation_id?: string | null;
  payload: Record<string, unknown>;
  /** Collapses duplicate emissions of the same fact while still undispatched. */
  dedupe_key?: string | null;
};

export async function emitEvent(input: EmitEventInput): Promise<{ emitted: boolean }> {
  try {
    const { error } = await db()
      .from("integration_events")
      .insert({
        event_type: input.event_type,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        implementation_id: input.implementation_id ?? null,
        payload: input.payload,
        dedupe_key: input.dedupe_key ?? null,
      });
    if (error) {
      // 23505 on the dedupe index: the same fact is already queued.
      if (error.code === "23505") return { emitted: false };
      console.error("[events] emit failed", input.event_type, error.message);
      return { emitted: false };
    }
    return { emitted: true };
  } catch (e) {
    console.error("[events] emit threw", input.event_type, e);
    return { emitted: false };
  }
}

/**
 * Record the creation of an implementation, from whichever path created it.
 *
 * Called by all three creators (hub manual create, startOnboarding, the
 * Salesforce endpoint) so a webhook consumer sees the whole world rather than
 * only Salesforce-sourced activity.
 */
export async function recordImplementationCreated(args: {
  implementationId: string;
  customerId: string;
  source: string;
  salesforceOpportunityId?: string | null;
}): Promise<void> {
  await emitEvent({
    event_type: "implementation.created",
    entity_type: "implementation",
    entity_id: args.implementationId,
    implementation_id: args.implementationId,
    payload: {
      implementation_id: args.implementationId,
      customer_id: args.customerId,
      source: args.source,
      salesforce_opportunity_id: args.salesforceOpportunityId ?? null,
    },
    dedupe_key: `impl.created:${args.implementationId}`,
  });
}

/** Record a stage transition. The history row remains the authority. */
export async function recordStageChange(args: {
  implementationId: string;
  fromStage: string | null;
  toStage: string;
  actor: string | null;
  note?: string | null;
  enteredAt: string;
}): Promise<void> {
  await emitEvent({
    event_type: "stage.changed",
    entity_type: "implementation",
    entity_id: args.implementationId,
    implementation_id: args.implementationId,
    payload: {
      implementation_id: args.implementationId,
      from_stage: args.fromStage,
      to_stage: args.toStage,
      actor: args.actor,
      note: args.note ?? null,
      entered_at: args.enteredAt,
    },
    dedupe_key: `stage.changed:${args.implementationId}:${args.toStage}:${args.enteredAt}`,
  });
}

/**
 * `createAlert()` throws on insert failure and has no dedupe. Neither is
 * acceptable on a path a Zapier retry storm can hit: a re-fired closed-won
 * opportunity would 500 the handler and email every manager again, every time.
 *
 * This wrapper follows the SLA sweep's open-alert-query idiom: an unacknowledged
 * alert of the same kind for the same subject means the humans already know.
 */
export async function safeCreateAlert(input: {
  kind: string;
  severity?: "info" | "warning" | "critical";
  title: string;
  detail?: string | null;
  customerId?: string | null;
  implementationId?: string | null;
  payload?: Record<string, unknown> | null;
  /** payload key + value that identifies "the same alert". */
  dedupeOn?: { key: string; value: string } | null;
  notify?: boolean;
}): Promise<{ created: boolean; deduped: boolean }> {
  try {
    if (input.dedupeOn) {
      const { data: open } = await db()
        .from("alerts")
        .select("id, payload")
        .eq("kind", input.kind)
        .is("acknowledged_at", null);
      const hit = (open ?? []).some(
        (a: any) => String(a?.payload?.[input.dedupeOn!.key] ?? "") === input.dedupeOn!.value,
      );
      if (hit) return { created: false, deduped: true };
    }

    // createAlert emits `alert.raised` itself, for every alert whatever raised
    // it — there is deliberately no second emission here.
    const { createAlert } = await import("@/lib/tickets.server");
    await createAlert({
      kind: input.kind,
      severity: input.severity ?? "warning",
      title: input.title,
      detail: input.detail ?? null,
      customerId: input.customerId ?? null,
      implementationId: input.implementationId ?? null,
      source: "salesforce",
      payload: input.payload ?? null,
      notify: input.notify ?? true,
      actor: { type: "system" },
    });

    return { created: true, deduped: false };
  } catch (e) {
    // Matching audit()'s contract: alerting must never take down the request.
    console.error("[events] safeCreateAlert failed", input.kind, e);
    return { created: false, deduped: false };
  }
}
