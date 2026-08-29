import { supabaseAdmin } from "./client.server-CyixJlZr.mjs";
import { createHash, randomBytes } from "crypto";
//#region node_modules/.nitro/vite/services/ssr/assets/api-auth-Dmgnt1_7.js
var createAdminClient = () => supabaseAdmin;
var API_SCOPES = [
	"accounts:read",
	"accounts:write",
	"transitions:write",
	"tam:write",
	"tickets:write",
	"alerts:write",
	"reports:write"
];
function hashKey(key) {
	return createHash("sha256").update(key).digest("hex");
}
function generateApiKey() {
	const key = `gcp_live_${randomBytes(32).toString("base64url")}`;
	return {
		key,
		hash: hashKey(key),
		prefix: key.slice(0, 12)
	};
}
function apiError(status, code, message) {
	return Response.json({ error: {
		code,
		message
	} }, { status });
}
async function requireApiKey(req, scope) {
	const authHeader = req.headers.get("authorization");
	const raw = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : req.headers.get("x-api-key")?.trim();
	if (!raw) return apiError(401, "missing_api_key", "Pass your key as 'Authorization: Bearer <key>'");
	const admin = createAdminClient();
	const { data: key } = await admin.from("portal_api_keys").select("id, scopes, revoked_at").eq("key_hash", hashKey(raw)).maybeSingle();
	if (!key || key.revoked_at) return apiError(401, "invalid_api_key", "Unknown or revoked API key");
	if (!key.scopes.includes(scope)) return apiError(403, "missing_scope", `This key does not have the '${scope}' scope`);
	admin.from("portal_api_keys").update({ last_used_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", key.id).then(() => {});
	return { apiKeyId: key.id };
}
//#endregion
export { API_SCOPES, apiError, generateApiKey, requireApiKey };
