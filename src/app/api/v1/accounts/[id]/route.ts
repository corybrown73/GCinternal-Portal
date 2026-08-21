import { requireApiKey, apiError } from "@/lib/api-auth";
import { resolveAccountId } from "@/lib/accounts";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// GET /api/v1/accounts/{id} — {id} is the portal UUID or sf_<salesforce_id>.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKey(req, "accounts:read");
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const accountId = await resolveAccountId(id);
  if (!accountId) return apiError(404, "not_found", "No account matches that id");

  const admin = createAdminClient();
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
}
