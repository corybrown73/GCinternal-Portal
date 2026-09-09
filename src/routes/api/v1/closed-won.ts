import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/v1/closed-won — a Sheets row becomes a deal and a kicked-off
 * implementation.
 *
 * The Zap: Google Sheets "New Spreadsheet Row" → Webhooks by Zapier "POST",
 * JSON, the row's columns as the body, `Authorization: Bearer gcp_live_…`
 * with the `accounts:write` scope. Field names are forgiving — see the
 * aliases in server/closed-won.ts — because a Sheet has whatever columns
 * somebody gave it.
 *
 * Transport only: auth, JSON, the /api/v1 error envelope. The decision lives
 * in server/closed-won.ts, with its dependencies injected so it is tested
 * without a database.
 */
export const Route = createFileRoute("/api/v1/closed-won")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { requireApiKey, apiError } = await import("@/lib/server/api-auth");
        const { closedWonSchema, ingestClosedWon } = await import("@/lib/server/closed-won");

        const auth = await requireApiKey(request, "accounts:write");
        if (auth instanceof Response) return auth;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return apiError(422, "invalid_json", "Body must be JSON");
        }

        const parsed = closedWonSchema.safeParse(body);
        if (!parsed.success) {
          return apiError(
            422,
            "validation_failed",
            parsed.error.issues.map((i) => i.message).join("; "),
          );
        }

        const { upsertAccount } = await import("@/lib/server/accounts");
        const { startOnboardingAs } = await import("@/lib/presale.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const ctx = { source: "api" as const, actorApiKeyId: auth.apiKeyId };

        try {
          const outcome = await ingestClosedWon(parsed.data, {
            upsertAccount: async (input) => {
              const r = await upsertAccount(input, ctx);
              return { account: r.account as any, created: r.created };
            },
            recordContact: async (dealId, c) => {
              const patch: Record<string, string> = {};
              if (c.name) patch["primary_contact_name"] = c.name;
              if (c.email) patch["primary_contact_email"] = c.email;
              if (c.role) patch["primary_contact_role"] = c.role;
              if (Object.keys(patch).length === 0) return;
              const { error } = await db.from("portal_accounts").update(patch).eq("id", dealId);
              if (error) throw new Error(`Could not record the contact: ${error.message}`);
            },
            startOnboarding: (dealId) =>
              startOnboardingAs({ kind: "api_key", apiKeyId: auth.apiKeyId }, dealId, {
                // An integration cannot answer "which existing account is this".
                // A brand-new customer is the honest default for a closed-won
                // row; a person can merge later if it turns out to exist.
                createNewCustomer: true,
              }),
            existingImplementation: async (customerId) => {
              const { data } = await db
                .from("implementations")
                .select("id")
                .eq("customer_id", customerId)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              return (data?.id as string | undefined) ?? null;
            },
          });

          const origin = new URL(request.url).origin;
          return Response.json(
            {
              ...outcome,
              deal_url: `${origin}/deals/${outcome.deal_id}`,
              project_url: outcome.customer_id
                ? `${origin}/customers/${outcome.customer_id}`
                : null,
            },
            { status: outcome.deal_created ? 201 : 200 },
          );
        } catch (e) {
          return apiError(
            500,
            "closed_won_failed",
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
                "POST a closed-won row here. Fields: company (required), opportunity, amount, products, rep_email, close_date, contact_name, contact_email, contact_role, domain, notes, salesforce_url.",
            },
          },
          { status: 405, headers: { allow: "POST" } },
        ),
    },
  },
});
