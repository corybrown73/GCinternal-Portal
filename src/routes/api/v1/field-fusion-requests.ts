import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/v1/field-fusion-requests — the "New FF Client Request" form in
 * GoCanvas becomes a Field Fusion proof-of-concept deal.
 *
 * The Zap: GoCanvas "New Submission" on that form → Webhooks by Zapier
 * "POST", JSON, the form's fields as the body, `Authorization: Bearer
 * gcp_live_…` with the `accounts:write` scope. Field names are forgiving —
 * see the aliases in server/field-fusion-request.ts.
 *
 * Transport only: auth, JSON, the /api/v1 error envelope. The decision lives
 * in server/field-fusion-request.ts with its writes injected.
 */
export const Route = createFileRoute("/api/v1/field-fusion-requests")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { requireApiKey, apiError } = await import("@/lib/server/api-auth");
        const { fieldFusionRequestRowSchema, ingestFieldFusionRequest } =
          await import("@/lib/server/field-fusion-request");

        const auth = await requireApiKey(request, "accounts:write");
        if (auth instanceof Response) return auth;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return apiError(422, "invalid_json", "Body must be JSON");
        }

        const parsed = fieldFusionRequestRowSchema.safeParse(body);
        if (!parsed.success) {
          return apiError(
            422,
            "validation_failed",
            parsed.error.issues.map((i) => i.message).join("; "),
          );
        }

        const { upsertAccount } = await import("@/lib/server/accounts");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { audit } = await import("@/lib/server/audit");
        const db = supabaseAdmin as any;
        const ctx = { source: "api" as const, actorApiKeyId: auth.apiKeyId };

        try {
          const outcome = await ingestFieldFusionRequest(parsed.data, {
            upsertAccount: async (input) => {
              const r = await upsertAccount(input, ctx);
              return { account: r.account as any, created: r.created };
            },
            recordContact: async (dealId, c) => {
              const patch: Record<string, string> = {};
              if (c.name) patch["primary_contact_name"] = c.name;
              if (c.email) patch["primary_contact_email"] = c.email;
              if (c.role) patch["primary_contact_role"] = c.role;
              if (!Object.keys(patch).length) return;
              const { error } = await db.from("portal_accounts").update(patch).eq("id", dealId);
              if (error) throw new Error(`Could not record the contact: ${error.message}`);
            },
            writeIntake: async (dealId, next) => {
              const { error } = await db
                .from("portal_accounts")
                .update({ intake: next })
                .eq("id", dealId);
              if (error) throw new Error(`Could not save the request: ${error.message}`);
            },
          });
          await audit({
            actor_type: "api_key",
            actor_id: auth.apiKeyId,
            action: "field_fusion.request_received",
            entity_type: "account",
            entity_id: outcome.deal_id,
            payload: {
              created: outcome.deal_created,
              submission_id: parsed.data.submission_id,
              fields_kept: outcome.fields_kept,
            },
          });
          const origin = new URL(request.url).origin;
          return Response.json(
            { ...outcome, deal_url: `${origin}/deals/${outcome.deal_id}` },
            { status: outcome.deal_created ? 201 : 200 },
          );
        } catch (e) {
          return apiError(
            500,
            "field_fusion_request_failed",
            e instanceof Error ? e.message : "Unknown error",
          );
        }
      },
      GET: () =>
        Response.json(
          {
            error: {
              code: "method_not_allowed",
              message:
                "POST a New FF Client Request submission here. Fields: company_name (required), admin_first_name, admin_last_name, admin_gcid, admin_email, admin_phone, salesforce_url, industry, features, analytics_needs, output_destinations, first_use_case, process_description, forms_in_progress, pdf_designer, data_sets, customers_are, customers_have, sites_are, notes, requester_name, requester_email, submission_id, submission_no, submitted_at.",
            },
          },
          { status: 405, headers: { allow: "POST" } },
        ),
    },
  },
});
