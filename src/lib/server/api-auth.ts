import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
const createAdminClient = () => supabaseAdmin as unknown as SupabaseClient;

export const API_SCOPES = [
  "accounts:read",
  "accounts:write",
  "transitions:write",
  "tam:write",
  "tickets:write",
  "alerts:write",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// 32 random bytes; the gcp_live_ prefix makes leaked keys greppable.
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `gcp_live_${randomBytes(32).toString("base64url")}`;
  return { key, hash: hashKey(key), prefix: key.slice(0, 12) };
}

export function apiError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function requireApiKey(
  req: Request,
  scope: ApiScope
): Promise<{ apiKeyId: string } | Response> {
  const authHeader = req.headers.get("authorization");
  const raw = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : req.headers.get("x-api-key")?.trim();

  if (!raw) {
    return apiError(401, "missing_api_key", "Pass your key as 'Authorization: Bearer <key>'");
  }

  const admin = createAdminClient();
  const { data: key } = await admin
    .from("portal_api_keys")
    .select("id, scopes, revoked_at")
    .eq("key_hash", hashKey(raw))
    .maybeSingle<{ id: string; scopes: string[]; revoked_at: string | null }>();

  if (!key || key.revoked_at) {
    return apiError(401, "invalid_api_key", "Unknown or revoked API key");
  }
  if (!key.scopes.includes(scope)) {
    return apiError(403, "missing_scope", `This key does not have the '${scope}' scope`);
  }

  // Fire-and-forget usage stamp.
  void admin
    .from("portal_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", key.id)
    .then(() => {});

  return { apiKeyId: key.id };
}
