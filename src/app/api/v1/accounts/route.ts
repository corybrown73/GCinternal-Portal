import { requireApiKey, apiError } from "@/lib/api-auth";
import { upsertAccount } from "@/lib/accounts";
import { accountUpsertSchema } from "@/lib/schemas";
import { isStage } from "@/lib/stages";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

// POST /api/v1/accounts — upsert. This is the Zapier/Salesforce closed-won hook.
export async function POST(req: Request) {
  const auth = await requireApiKey(req, "accounts:write");
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(422, "invalid_json", "Body must be JSON");
  }

  const parsed = accountUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      422,
      "validation_failed",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    );
  }

  try {
    const result = await upsertAccount(parsed.data, {
      source: "api",
      actorApiKeyId: auth.apiKeyId,
    });
    return Response.json(
      { account: result.account, created: result.created, stage_changed: result.stage_changed },
      { status: result.created ? 201 : 200 }
    );
  } catch (e) {
    return apiError(500, "upsert_failed", e instanceof Error ? e.message : "Unknown error");
  }
}

// GET /api/v1/accounts?stage=&updated_since=
export async function GET(req: Request) {
  const auth = await requireApiKey(req, "accounts:read");
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const stage = url.searchParams.get("stage");
  const updatedSince = url.searchParams.get("updated_since");

  const admin = createAdminClient();
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
}
