import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/v1/closed-won — a closed deal becomes a deal at Closed Won and a
 * kicked-off implementation, assigned to the TIS the sender named.
 *
 * The sender is Zapier (a Sheets row, a Salesforce trigger) or Salesforce
 * itself (a Flow's HTTP callout posting the Opportunity). Field names are
 * resolved two ways, map first: the `inbound_deal` rows an admin keeps in
 * Admin → Integrations → Field maps turn any sender field — a dotted path
 * into the raw record included — into one of the deal's fields, and the
 * alias table in server/closed-won.ts covers the common names for whatever
 * the map does not. `Authorization: Bearer gcp_live_…` with `accounts:write`.
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

        // The admin's map first, then the aliases for everything else.
        const { loadFieldMaps } = await import("@/lib/sf-integration.server");
        const { applyDealMaps, dealMapRoots } = await import("@/lib/server/sf-field-maps");
        const { resolveClosedWonRow } = await import("@/lib/server/closed-won");
        const maps = await loadFieldMaps();
        const mapped = applyDealMaps(body, maps);
        const resolved = resolveClosedWonRow(body, mapped.values, dealMapRoots(maps));
        if (mapped.missingRequired.length > 0) {
          return apiError(
            422,
            "validation_failed",
            `Required mapped field(s) missing from the payload: ${mapped.missingRequired.join(", ")}`,
          );
        }

        const parsed = closedWonSchema.safeParse(resolved.row);
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
            recordFacts: async (dealId, facts) => {
              const { saveDealIntakeFacts } = await import("@/lib/presale.server");
              await saveDealIntakeFacts(dealId, facts);
            },
            assign: async (dealId, implementationId, owner) => {
              const { assignDeal } = await import("@/lib/assignment.server");
              const { resolveTeamMember } = await import("@/lib/server/team-lookup");
              // An email or a name from the Salesforce TIS field. A name that
              // matches nobody falls through to the assignment rule, which
              // the response says in `note`.
              const member = owner ? await resolveTeamMember(owner) : null;
              return assignDeal({
                dealId,
                implementationId,
                ...(member ? { teamMemberId: member.id } : {}),
                actorProfileId: null,
                note: owner && !member ? `Row named "${owner}", who is not on the team` : null,
              });
            },
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
            storeNotes: async (dealId, notes) => {
              const { storeOpportunityNotes } = await import("@/lib/server/opportunity-notes");
              await storeOpportunityNotes(dealId, notes);
            },
            startReading: async (dealId) => {
              const { autoReadDeal } = await import("@/lib/server/ai/jobs");
              await autoReadDeal(dealId, "closed_won_api");
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
              // What landed where, so the sender can see what is left to map.
              fields: {
                set: Object.fromEntries(
                  Object.entries(resolved.sources).map(([k, how]) => [
                    k,
                    how === "map" ? `map:${mapped.sources[k]}` : "alias",
                  ]),
                ),
                unmapped_keys: resolved.unmappedKeys,
              },
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
                "POST a closed-won row here. Fields: company (required), opportunity, amount, products, close_date, domain, notes, salesforce_id, salesforce_url, contact_name, contact_email, contact_role, rep_email, se_email, implementation_owner (the TIS: email or name), seats, integration_tier, industry, company_size, current_process, path, and the handoff answers desired_launch_date, business_outcome, success_measure, commitments, system_requirements, open_questions, contact_decision_maker, contact_admin_builder, contact_day_to_day. Any other field name is matched by the deal map in Admin → Integrations. Reference: /api/v1/docs.",
            },
          },
          { status: 405, headers: { allow: "POST" } },
        ),
    },
  },
});
