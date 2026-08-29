import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/v1/implementations — the closed-won Opportunity hook.
 * GET  /api/v1/implementations?salesforce_opportunity_id=&updated_since= — read back.
 *
 * The whole decision procedure lives in src/lib/server/sf-ingest.ts; this file
 * is transport only (auth, JSON, the error envelope the other /api/v1 routes
 * use). The durable idempotency key is the Salesforce opportunity id, not the
 * `Idempotency-Key` header: the header only collapses a torn retry of the same
 * body, while the opportunity id is what makes five deliveries of the same
 * closed-won payload produce one implementation and five sync-log rows.
 */
export const Route = createFileRoute("/api/v1/implementations")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { requireApiKey, apiError } = await import("@/lib/server/api-auth");
        const { opportunityIngestSchema } = await import("@/lib/server/sf-schemas");
        const { ingestOpportunity } = await import("@/lib/server/sf-ingest");
        const { createIngestPort, bodyHash, writeSyncLog } =
          await import("@/lib/sf-integration.server");

        const auth = await requireApiKey(request, "implementations:write");
        if (auth instanceof Response) return auth;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return apiError(422, "invalid_json", "Body must be JSON");
        }

        const parsed = opportunityIngestSchema.safeParse(body);
        if (!parsed.success) {
          return apiError(
            422,
            "validation_failed",
            parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          );
        }

        const idempotencyKey = request.headers.get("idempotency-key");
        try {
          const outcome = await ingestOpportunity(
            parsed.data,
            createIngestPort({ apiKeyId: auth.apiKeyId }),
            {
              apiKeyId: auth.apiKeyId,
              idempotencyKey: idempotencyKey?.trim() || null,
              bodyHash: bodyHash(parsed.data),
            },
          );
          return Response.json(outcome.body, { status: outcome.status });
        } catch (e) {
          // A failure still leaves a record of the exchange: an ingest that
          // vanished without a trace is the one outcome nobody can debug.
          const message = e instanceof Error ? e.message : "Unknown error";
          await writeSyncLog({
            direction: "inbound",
            kind: "opportunity.ingest",
            external_id: parsed.data.salesforce_opportunity_id,
            implementation_id: null,
            customer_id: null,
            api_key_id: auth.apiKeyId,
            idempotency_key: idempotencyKey?.trim() || null,
            request_hash: bodyHash(parsed.data),
            request_payload: parsed.data,
            decision: { branch: "exception" },
            response_status: 500,
            response_payload: null,
            status: "failed",
            error: message,
          });
          return apiError(500, "ingest_failed", message);
        }
      },

      GET: async ({ request }: { request: Request }) => {
        const { requireApiKey, apiError } = await import("@/lib/server/api-auth");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { audit } = await import("@/lib/server/audit");
        const { sfId18 } = await import("@/lib/server/sf-id");

        const auth = await requireApiKey(request, "implementations:read");
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const oppId = url.searchParams.get("salesforce_opportunity_id");
        const updatedSince = url.searchParams.get("updated_since");

        const admin = supabaseAdmin as any;
        let query = admin
          .from("implementations")
          .select(
            "id, customer_id, name, current_stage, status, source, salesforce_opportunity_id, " +
              "salesforce_account_id, sf_closed_won_at, superseded_by_implementation_id, " +
              "target_launch_date, actual_launch_date, created_at, updated_at",
          )
          .not("salesforce_opportunity_id", "is", null)
          .order("updated_at", { ascending: false })
          .limit(200);

        if (oppId) query = query.eq("salesforce_opportunity_id", sfId18(oppId));
        if (updatedSince) {
          if (Number.isNaN(Date.parse(updatedSince))) {
            return apiError(422, "invalid_timestamp", "updated_since must be ISO-8601");
          }
          query = query.gte("updated_at", updatedSince);
        }

        const { data, error } = await query;
        if (error) return apiError(500, "query_failed", error.message);

        await audit({
          actor_type: "api_key",
          actor_id: auth.apiKeyId,
          action: "implementations.list",
          payload: { salesforce_opportunity_id: oppId, updated_since: updatedSince },
        });
        return Response.json({ implementations: data });
      },
    },
  },
});
