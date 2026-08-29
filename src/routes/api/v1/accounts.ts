import { createFileRoute } from "@tanstack/react-router";

// POST /api/v1/accounts — upsert (the Zapier/Salesforce closed-won hook).
// GET  /api/v1/accounts?stage=&updated_since= — list.
// Ported from the old Next.js app/api/v1/accounts/route.ts; auth + error shapes unchanged.
export const Route = createFileRoute("/api/v1/accounts")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { requireApiKey, apiError } = await import("@/lib/server/api-auth");
        const { upsertAccount } = await import("@/lib/server/accounts");
        const { accountUpsertSchema } = await import("@/lib/server/schemas");

        const auth = await requireApiKey(request, "accounts:write");
        if (auth instanceof Response) return auth;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return apiError(422, "invalid_json", "Body must be JSON");
        }

        const parsed = accountUpsertSchema.safeParse(body);
        if (!parsed.success) {
          return apiError(
            422,
            "validation_failed",
            parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          );
        }

        try {
          const result = await upsertAccount(parsed.data, {
            source: "api",
            actorApiKeyId: auth.apiKeyId,
          });
          return Response.json(
            {
              account: result.account,
              created: result.created,
              stage_changed: result.stage_changed,
            },
            { status: result.created ? 201 : 200 },
          );
        } catch (e) {
          return apiError(500, "upsert_failed", e instanceof Error ? e.message : "Unknown error");
        }
      },

      GET: async ({ request }: { request: Request }) => {
        const { requireApiKey, apiError } = await import("@/lib/server/api-auth");
        const { isStage } = await import("@/lib/presale-stages");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { audit } = await import("@/lib/server/audit");

        const auth = await requireApiKey(request, "accounts:read");
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const stage = url.searchParams.get("stage");
        const updatedSince = url.searchParams.get("updated_since");

        const admin = supabaseAdmin as any;
        let query = admin
          .from("portal_accounts")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(500);
        if (stage) {
          if (!isStage(stage)) return apiError(422, "invalid_stage", `Unknown stage '${stage}'`);
          query = query.eq("stage", stage);
        }
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
          action: "accounts.list",
          payload: { stage, updated_since: updatedSince },
        });
        return Response.json({ accounts: data });
      },
    },
  },
});
