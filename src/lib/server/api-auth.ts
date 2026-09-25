import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { API_SCOPES, type ApiScope } from "@/lib/api-scopes";

const createAdminClient = () => supabaseAdmin as unknown as SupabaseClient;

// The catalogue lives in a browser-safe module so the admin page reads the
// same list; re-exported here for the server code that always imported it.
export { API_SCOPES, type ApiScope };

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
  scope: ApiScope,
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
    .select("id, scopes, revoked_at, expires_at, rate_limit_per_minute")
    .eq("key_hash", hashKey(raw))
    .maybeSingle<{
      id: string;
      scopes: string[];
      revoked_at: string | null;
      expires_at: string | null;
      rate_limit_per_minute: number | null;
    }>();

  if (!key || key.revoked_at) {
    return apiError(401, "invalid_api_key", "Unknown or revoked API key");
  }

  // A live key was presented: that is a use, whether or not this call is
  // allowed. Stamped here, before any refusal, because a key refused for a
  // scope it lacks used to read "never used" on the admin page — the one
  // clue that would have said "this is the key the connector holds".
  void admin
    .from("portal_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", key.id)
    .then(
      ({ error }) => {
        if (error) console.error(`API_KEY_STAMP_FAILED key=${key.id} error=${error.message}`);
      },
      (e: unknown) => console.error(`API_KEY_STAMP_FAILED key=${key.id} error=${String(e)}`),
    );

  // Phase 7: expiry and rate limits, both behind `api_key_limits`. The failure
  // mode of getting a rate limit wrong is a silently broken integration, so the
  // columns ship inert and an operator can see what WOULD happen (the admin
  // page shows both values) before enforcement is turned on.
  const { isFlagOn } = await import("@/lib/app-config.server");
  const limitsOn = await isFlagOn("api_key_limits");

  // Expiry is decided before authorisation: an expired key never gets as far
  // as scopes, so "your key ran out" is never reported as "your key lacks a
  // scope". Distinct from invalid_api_key on purpose, too.
  if (limitsOn && key.expires_at && new Date(key.expires_at).getTime() <= Date.now()) {
    return apiError(
      401,
      "expired_api_key",
      `This API key expired on ${key.expires_at}. Create a new one in /admin/api-keys.`,
    );
  }

  if (!key.scopes.includes(scope)) {
    return apiError(403, "missing_scope", `This key does not have the '${scope}' scope`);
  }

  if (limitsOn) {
    const limit = key.rate_limit_per_minute ?? 120;
    const { data: used, error } = await admin.rpc("portal_api_key_consume", {
      p_key_id: key.id,
    });
    // A counter that cannot be read must not lock a working integration out:
    // fail open, loudly. The alternative is that one unavailable table takes
    // every integration down.
    if (error) {
      console.error(`API_RATE_LIMIT_UNAVAILABLE key=${key.id} error=${error.message}`);
    } else if (typeof used === "number" && used > limit) {
      return new Response(
        JSON.stringify({
          error: {
            code: "rate_limited",
            message: `This key is limited to ${limit} requests per minute.`,
          },
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "60",
            "x-ratelimit-limit": String(limit),
            "x-ratelimit-remaining": "0",
          },
        },
      );
    }
  }

  return { apiKeyId: key.id };
}
