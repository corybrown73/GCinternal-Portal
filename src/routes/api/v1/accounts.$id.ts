import { createFileRoute } from "@tanstack/react-router";

// GET /api/v1/accounts/{id} — {id} is the portal UUID or sf_<salesforce_id>.
// Ported from the old Next.js app/api/v1/accounts/[id]/route.ts.
export const Route = createFileRoute("/api/v1/accounts/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: unknown }) => {
        const { requireApiKey, apiError } = await import("@/lib/server/api-auth");
        const { resolveAccountId } = await import("@/lib/server/accounts");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const auth = await requireApiKey(request, "accounts:read");
        if (auth instanceof Response) return auth;

        const { id } = params as { id: string };
        const accountId = await resolveAccountId(id);
        if (!accountId) return apiError(404, "not_found", "No account matches that id");

        const admin = supabaseAdmin as any;
        const [{ data: account }, { data: transitions }] = await Promise.all([
          admin.from("portal_accounts").select("*").eq("id", accountId).single(),
          admin
            .from("portal_stage_transitions")
            .select("from_stage, to_stage, source, note, occurred_at")
            .eq("account_id", accountId)
            .order("occurred_at", { ascending: false })
            .limit(50),
        ]);

        if (!account) return apiError(404, "not_found", "No account matches that id");
        return Response.json({ account, stage_history: transitions ?? [] });
      },
    },
  },
});
