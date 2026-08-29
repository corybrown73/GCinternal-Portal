import { r as __exportAll } from "../_runtime.mjs";
import { n as __exportAll$1 } from "./server-c8UtrfAP2.mjs";
import { supabaseAdmin } from "./client.server-KzwUIAkW.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/audit-D9QQPMll.js
var audit_D9QQPMll_exports = /* @__PURE__ */ __exportAll({
	n: () => audit_exports,
	t: () => audit
});
var audit_exports = /* @__PURE__ */ __exportAll$1({ audit: () => audit });
var createAdminClient = () => supabaseAdmin;
async function audit(entry) {
	try {
		await createAdminClient().from("portal_audit_log").insert({
			actor_type: entry.actor_type,
			actor_id: entry.actor_id ?? null,
			action: entry.action,
			entity_type: entry.entity_type ?? null,
			entity_id: entry.entity_id ?? null,
			payload: entry.payload ?? null
		});
	} catch (e) {
		console.error("audit_log write failed", e);
	}
}
//#endregion
export { audit_D9QQPMll_exports as n, audit as t };
