import { createFileRoute } from "@tanstack/react-router";

/**
 * GET/POST /api/cron/dispatch — the outbound webhook pump (every 5 minutes,
 * see vercel.json). Auth: `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Four passes, each idempotent and each safe to run with nothing to do:
 *   1. Fan undispatched `integration_events` into `webhook_deliveries`, one row
 *      per active endpoint that subscribes to the type, then stamp
 *      `dispatched_at` (the stamped-guard idiom the SLA sweep uses).
 *   2. Send what is due: at most 25 per run, 10 seconds each, exponential
 *      backoff, `exhausted` after six attempts with a deduped alert, and an
 *      endpoint that exhausts 20 deliveries in a row is disabled.
 *   3. Self-heal: the outbox is NOT transactional over REST, so a crash between
 *      the implementation insert and the event insert loses the event. Any
 *      Salesforce-created implementation with no `implementation.created` event
 *      gets one. Non-Salesforce creators have no such sweep — consumers are
 *      told, in the OpenAPI webhook docs, that delivery is at-least-once and
 *      that gaps are possible.
 *   4. Prune sync-log and delivery rows past `integration.log_retention_days`.
 *
 * There is no feature flag on dispatch: with zero endpoints configured it does
 * nothing at all, and creating an endpoint is itself the deliberate act.
 */

const BATCH = 25;
const REQUEST_TIMEOUT_MS = 10_000;
const AUTO_DISABLE_AFTER_EXHAUSTED = 20;

async function runDispatch(): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { audit } = await import("@/lib/server/audit");
  const { safeCreateAlert } = await import("@/lib/server/events");
  const {
    canonicalBody,
    signPayload,
    decryptSecret,
    nextAttemptAt,
    endpointWantsEvent,
    MAX_DELIVERY_ATTEMPTS,
    SIGNATURE_HEADER,
    EVENT_ID_HEADER,
    EVENT_TYPE_HEADER,
    TIMESTAMP_HEADER,
  } = await import("@/lib/server/webhook-signing");

  const db = supabaseAdmin as any;
  const summary = {
    fanned: 0,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    exhausted: 0,
    healed: 0,
    pruned: 0,
  };

  /* ---- 1. Fan out ------------------------------------------------------ */
  const { data: endpoints } = await db
    .from("webhook_endpoints")
    .select("id, url, event_types, active")
    .eq("active", true);
  const activeEndpoints = (endpoints ?? []) as Array<{
    id: string;
    url: string;
    event_types: string[];
  }>;

  const { data: pending } = await db
    .from("integration_events")
    .select("id, event_type, entity_type, entity_id, payload, created_at")
    .is("dispatched_at", null)
    .order("created_at", { ascending: true })
    .limit(200);

  for (const event of pending ?? []) {
    for (const endpoint of activeEndpoints) {
      if (!endpointWantsEvent(endpoint.event_types ?? [], event.event_type)) continue;
      const body = canonicalBody({
        id: event.id,
        type: event.event_type,
        created_at: event.created_at,
        data: event.payload,
      });
      // unique (endpoint_id, event_id) makes a re-run of this pass a no-op.
      const { error } = await db.from("webhook_deliveries").insert({
        endpoint_id: endpoint.id,
        event_id: event.id,
        request_body: JSON.parse(body),
        status: "pending",
      });
      if (!error) summary.fanned += 1;
    }
    await db
      .from("integration_events")
      .update({ dispatched_at: new Date().toISOString() })
      .eq("id", event.id)
      .is("dispatched_at", null);
  }

  /* ---- 2. Send what is due -------------------------------------------- */
  const nowIso = new Date().toISOString();
  const { data: due } = await db
    .from("webhook_deliveries")
    .select("id, endpoint_id, event_id, attempt, request_body")
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH);

  const secretCache = new Map<string, string | null>();
  async function secretFor(endpointId: string): Promise<string | null> {
    if (secretCache.has(endpointId)) return secretCache.get(endpointId) ?? null;
    const { data } = await db
      .from("webhook_endpoint_secrets")
      .select("secret_ciphertext")
      .eq("endpoint_id", endpointId)
      .maybeSingle();
    let plain: string | null = null;
    try {
      plain = data ? decryptSecret(data.secret_ciphertext) : null;
    } catch (e) {
      console.error("[dispatch] could not decrypt endpoint secret", endpointId, e);
    }
    secretCache.set(endpointId, plain);
    return plain;
  }

  for (const delivery of due ?? []) {
    const endpoint = activeEndpoints.find((e) => e.id === delivery.endpoint_id);
    if (!endpoint) {
      await db
        .from("webhook_deliveries")
        .update({ status: "skipped", last_error: "endpoint is inactive" })
        .eq("id", delivery.id);
      continue;
    }
    const secret = await secretFor(endpoint.id);
    if (!secret) {
      await db
        .from("webhook_deliveries")
        .update({ status: "skipped", last_error: "no readable signing secret" })
        .eq("id", delivery.id);
      continue;
    }

    const event = delivery.request_body as {
      id: string;
      type: string;
      created_at: string;
      data: unknown;
    };
    const body = canonicalBody(event);
    const ts = Math.floor(Date.now() / 1000);
    const attempt = (delivery.attempt ?? 0) + 1;
    summary.attempted += 1;

    let status: number | null = null;
    let responseBody = "";
    let error: string | null = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [EVENT_ID_HEADER]: event.id,
          [EVENT_TYPE_HEADER]: event.type,
          [TIMESTAMP_HEADER]: String(ts),
          [SIGNATURE_HEADER]: signPayload(secret, ts, body),
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      status = res.status;
      responseBody = (await res.text()).slice(0, 4096);
    } catch (e) {
      error = e instanceof Error ? e.message : "request failed";
    }

    const ok = status !== null && status >= 200 && status < 300;
    if (ok) {
      summary.succeeded += 1;
      await db
        .from("webhook_deliveries")
        .update({
          status: "succeeded",
          attempt,
          response_status: status,
          response_body: responseBody,
          last_error: null,
          delivered_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);
      continue;
    }

    const next = nextAttemptAt(attempt);
    const exhausted = next === null || attempt >= MAX_DELIVERY_ATTEMPTS;
    await db
      .from("webhook_deliveries")
      .update({
        status: exhausted ? "exhausted" : "failed",
        attempt,
        response_status: status,
        response_body: responseBody,
        last_error: error ?? `HTTP ${status}`,
        next_attempt_at: (next ?? new Date()).toISOString(),
      })
      .eq("id", delivery.id);

    if (exhausted) {
      summary.exhausted += 1;
      await safeCreateAlert({
        kind: "webhook_exhausted",
        severity: "warning",
        title: `Webhook delivery gave up after ${attempt} attempts`,
        detail: `Endpoint ${endpoint.url} · event ${event.type} · last error: ${error ?? `HTTP ${status}`}`,
        payload: { endpoint_id: endpoint.id, event_id: event.id },
        dedupeOn: { key: "endpoint_id", value: endpoint.id },
      });

      const { count } = await db
        .from("webhook_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("endpoint_id", endpoint.id)
        .eq("status", "exhausted");
      if ((count ?? 0) >= AUTO_DISABLE_AFTER_EXHAUSTED) {
        await db
          .from("webhook_endpoints")
          .update({
            active: false,
            disabled_at: new Date().toISOString(),
            disabled_reason: `${count} deliveries exhausted`,
          })
          .eq("id", endpoint.id);
        await safeCreateAlert({
          kind: "webhook_endpoint_disabled",
          severity: "critical",
          title: `Webhook endpoint disabled after ${count} exhausted deliveries`,
          detail: endpoint.url,
          payload: { endpoint_id: endpoint.id },
          dedupeOn: { key: "endpoint_id", value: endpoint.id },
        });
      }
    } else {
      summary.failed += 1;
    }
  }

  /* ---- 3. Self-heal the outbox ---------------------------------------- */
  const { data: sfImpls } = await db
    .from("implementations")
    .select("id, customer_id")
    .eq("source", "salesforce")
    .order("created_at", { ascending: false })
    .limit(200);
  if ((sfImpls ?? []).length > 0) {
    const ids = (sfImpls ?? []).map((i: any) => i.id);
    const { data: existing } = await db
      .from("integration_events")
      .select("entity_id")
      .eq("event_type", "implementation.created")
      .in("entity_id", ids);
    const have = new Set((existing ?? []).map((e: any) => e.entity_id));
    const { recordImplementationCreated } = await import("@/lib/server/events");
    for (const impl of sfImpls ?? []) {
      if (have.has(impl.id)) continue;
      await recordImplementationCreated({
        implementationId: impl.id,
        customerId: impl.customer_id,
        source: "salesforce",
      });
      summary.healed += 1;
    }
  }

  /* ---- 4. Retention ---------------------------------------------------- */
  const { data: retentionRow } = await db
    .from("portal_app_config")
    .select("value")
    .eq("key", "integration.log_retention_days")
    .maybeSingle();
  const days = Number(retentionRow?.value ?? 90);
  if (Number.isFinite(days) && days > 0) {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const { count: prunedLogs } = await db
      .from("integration_sync_log")
      .delete({ count: "exact" })
      .lt("created_at", cutoff);
    const { count: prunedDeliveries } = await db
      .from("webhook_deliveries")
      .delete({ count: "exact" })
      .lt("created_at", cutoff)
      .in("status", ["succeeded", "skipped", "exhausted"]);
    summary.pruned = (prunedLogs ?? 0) + (prunedDeliveries ?? 0);
  }

  await audit({ actor_type: "system", action: "cron.webhook_dispatch", payload: summary });
  return Response.json({ ok: true, ...summary });
}

async function authorizeCron(request: Request): Promise<Response | null> {
  const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
  return authenticateCronRequest(request);
}

export const Route = createFileRoute("/api/cron/dispatch")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const denied = await authorizeCron(request);
        return denied ?? (await runDispatch());
      },
      POST: async ({ request }: { request: Request }) => {
        const denied = await authorizeCron(request);
        return denied ?? (await runDispatch());
      },
    },
  },
});
