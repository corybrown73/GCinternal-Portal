import { o as __toESM } from "../_runtime.mjs";
import { n as LIFECYCLE_STAGES } from "./lifecycle-Cl8aBFg1.mjs";
import { r as isStage, t as STAGES } from "./presale-stages-BXcdOdDO.mjs";
import { supabaseAdmin } from "./client.server-CyixJlZr.mjs";
import { t as audit } from "./audit-CSFBOZ4O.mjs";
import { transitionStage, upsertAccount } from "./accounts-Ce7cfqsK.mjs";
import { API_SCOPES, generateApiKey } from "./api-auth-Dmgnt1_7.mjs";
import { accountUpsertSchema } from "./schemas-DUHo3qXr.mjs";
import { createTamRequest } from "./tam-BhpTuU8a.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/presale.server-BBMA41jI.js
var db = () => supabaseAdmin;
var SUPER_ROLES = ["admin", "super_admin"];
var SALES_EDIT_ROLES = [
	...[...SUPER_ROLES, "manager"],
	"sales",
	"am"
];
async function profileOf(userId) {
	const { data, error } = await db().from("portal_profiles").select("id, email, full_name, role, created_at").eq("id", userId).maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) throw new Error("No portal profile exists for this user");
	return data;
}
/** Any signed-in non-customer user. */
async function requireInternal(userId) {
	const profile = await profileOf(userId);
	if (profile.role === "customer") throw new Error("Not available to customer accounts");
	return profile;
}
async function requireSalesEditor(userId) {
	const profile = await profileOf(userId);
	if (!SALES_EDIT_ROLES.includes(profile.role)) throw new Error("Your role cannot edit presale records");
	return profile;
}
async function requireSuperAdmin(userId) {
	const profile = await profileOf(userId);
	if (!SUPER_ROLES.includes(profile.role)) throw new Error("Super admin only");
	return profile;
}
async function profileNames() {
	const { data } = await db().from("portal_profiles").select("id, email, full_name");
	const map = /* @__PURE__ */ new Map();
	for (const p of data ?? []) map.set(p.id, p.full_name || p.email);
	return map;
}
async function loadPipeline() {
	const [{ data: accounts, error }, names] = await Promise.all([db().from("portal_accounts").select("*").order("name"), profileNames()]);
	if (error) throw new Error(error.message);
	return { deals: (accounts ?? []).map((a) => ({
		...a,
		am_owner_name: a.am_owner_id ? names.get(a.am_owner_id) ?? null : null,
		se_owner_name: a.se_owner_id ? names.get(a.se_owner_id) ?? null : null
	})) };
}
async function createDeal(userId, input) {
	await requireSalesEditor(userId);
	const parsed = accountUpsertSchema.parse({
		name: input.name,
		...input.domain ? { domain: input.domain } : {},
		...input.salesforce_id ? { salesforce_id: input.salesforce_id } : {},
		...input.arr != null ? { arr: input.arr } : {},
		...input.summary ? { summary: input.summary } : {}
	});
	const result = await upsertAccount(parsed, {
		source: "ui",
		actorProfileId: userId
	});
	return {
		account: result.account,
		created: result.created
	};
}
async function transitionDeal(userId, dealId, toStage, note) {
	await requireInternal(userId);
	return transitionStage(dealId, toStage, {
		source: "ui",
		actorProfileId: userId
	}, note);
}
var COLUMN_ALIASES = {
	name: "name",
	account: "name",
	accountname: "name",
	salesforceid: "salesforce_id",
	sfid: "salesforce_id",
	domain: "domain",
	website: "domain",
	stage: "stage",
	arr: "arr",
	amowneremail: "am_owner_email",
	owneremail: "am_owner_email",
	summary: "summary"
};
function normalizeHeader(h) {
	return COLUMN_ALIASES[h.toLowerCase().replace(/[\s_-]/g, "")] ?? null;
}
function normalizeStageValue(raw) {
	return raw.toLowerCase().trim().replace(/[\s-]+/g, "_");
}
async function importDealsCsv(userId, csvText) {
	await requireSalesEditor(userId);
	if (csvText.length > 2097152) throw new Error("CSV must be under 2 MB");
	const { default: Papa } = await import("../_libs/papaparse.mjs").then((n) => /* @__PURE__ */ __toESM(n.t()));
	const parsed = Papa.parse(csvText, {
		header: true,
		skipEmptyLines: true
	});
	let created = 0;
	let updated = 0;
	let stageChanges = 0;
	const errors = [];
	for (let i = 0; i < parsed.data.length; i++) {
		const raw = parsed.data[i];
		if (!raw) continue;
		const mapped = {};
		for (const [key, value] of Object.entries(raw)) {
			const col = normalizeHeader(key);
			if (!col || value == null || String(value).trim() === "") continue;
			mapped[col] = String(value).trim();
		}
		if (mapped["arr"] !== void 0) {
			const n = Number(String(mapped["arr"]).replace(/[$,]/g, ""));
			if (Number.isNaN(n)) delete mapped["arr"];
			else mapped["arr"] = n;
		}
		if (mapped["stage"] !== void 0) {
			const s = normalizeStageValue(String(mapped["stage"]));
			if (isStage(s)) mapped["stage"] = s;
			else {
				errors.push({
					row: i + 2,
					message: `Unknown stage "${mapped["stage"]}"`
				});
				continue;
			}
		}
		const check = accountUpsertSchema.safeParse(mapped);
		if (!check.success) {
			errors.push({
				row: i + 2,
				message: check.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; ")
			});
			continue;
		}
		try {
			const result = await upsertAccount(check.data, {
				source: "csv_import",
				actorProfileId: userId
			});
			if (result.created) created++;
			else updated++;
			if (result.stage_changed) stageChanges++;
		} catch (e) {
			errors.push({
				row: i + 2,
				message: e instanceof Error ? e.message : "Unknown error"
			});
		}
	}
	return {
		created,
		updated,
		stage_changes: stageChanges,
		errors
	};
}
async function loadDeal(dealId) {
	const { data: account } = await db().from("portal_accounts").select("*").eq("id", dealId).maybeSingle();
	if (!account) return null;
	const [names, gong, briefs, tam, notes, history] = await Promise.all([
		profileNames(),
		db().from("portal_gong_reports").select("*").eq("account_id", dealId).order("created_at", { ascending: false }),
		db().from("portal_briefs").select("*").eq("account_id", dealId).order("created_at", { ascending: false }),
		db().from("portal_tam_requests").select("*").eq("account_id", dealId).order("created_at", { ascending: false }),
		db().from("portal_onboarding_notes").select("*").eq("account_id", dealId).order("created_at", { ascending: false }),
		db().from("portal_stage_transitions").select("*").eq("account_id", dealId).order("occurred_at", { ascending: false })
	]);
	const named = (id) => id ? names.get(id) ?? null : null;
	return {
		account,
		am_owner_name: named(account.am_owner_id),
		se_owner_name: named(account.se_owner_id),
		gong_reports: (gong.data ?? []).map((r) => ({
			...r,
			uploaded_by_name: named(r.uploaded_by)
		})),
		briefs: (briefs.data ?? []).map((b) => ({
			...b,
			created_by_name: named(b.created_by)
		})),
		tam_requests: (tam.data ?? []).map((t) => ({
			...t,
			requested_by_name: named(t.requested_by),
			decided_by_name: named(t.decided_by)
		})),
		notes: (notes.data ?? []).map((n) => ({
			...n,
			author_name: named(n.author_id),
			reviewed_by_name: named(n.reviewed_by)
		})),
		stage_history: (history.data ?? []).map((t) => ({
			...t,
			actor_name: named(t.actor_profile_id)
		}))
	};
}
async function addGongReport(userId, input) {
	await requireInternal(userId);
	const { error } = await db().from("portal_gong_reports").insert({
		account_id: input.dealId,
		report_type: input.reportType,
		title: input.title,
		content_md: input.contentMd,
		uploaded_by: userId
	});
	if (error) throw new Error(`Could not save the report: ${error.message}`);
	return { ok: true };
}
async function deleteGongReport(userId, reportId) {
	const profile = await requireInternal(userId);
	const { data: report } = await db().from("portal_gong_reports").select("id, uploaded_by").eq("id", reportId).maybeSingle();
	if (!report) throw new Error("Report not found");
	if (report.uploaded_by !== userId && !SUPER_ROLES.includes(profile.role)) throw new Error("You can only delete reports you uploaded");
	const { error } = await db().from("portal_gong_reports").delete().eq("id", reportId);
	if (error) throw new Error(error.message);
	return { ok: true };
}
async function generateDealBrief(userId, dealId) {
	await requireInternal(userId);
	const { generateBrief } = await import("./generate-rKnaF3fY.mjs");
	const brief = await generateBrief(dealId, userId);
	return {
		id: brief.id,
		status: brief.status,
		error: brief.error
	};
}
async function briefDownloadUrl(userId, briefId) {
	await requireInternal(userId);
	const { data: brief } = await db().from("portal_briefs").select("pptx_storage_path").eq("id", briefId).maybeSingle();
	if (!brief?.pptx_storage_path) throw new Error("No file exists for this brief");
	const { data: signed, error } = await db().storage.from("portal-briefs").createSignedUrl(brief.pptx_storage_path, 3600, { download: true });
	if (error || !signed?.signedUrl) throw new Error(`Could not sign the download link: ${error?.message ?? "no link returned"}`);
	return { url: signed.signedUrl };
}
async function requestTam(userId, input) {
	const profile = await requireInternal(userId);
	const request = await createTamRequest({
		accountId: input.dealId,
		requesterEmail: profile.email,
		requesterProfileId: userId,
		justification: input.justification,
		urgency: input.urgency
	});
	return {
		id: request.id,
		status: request.status
	};
}
async function addDealNote(userId, input) {
	await requireInternal(userId);
	const { error } = await db().from("portal_onboarding_notes").insert({
		account_id: input.dealId,
		author_id: userId,
		body_md: input.bodyMd
	});
	if (error) throw new Error(`Could not save the note: ${error.message}`);
	return { ok: true };
}
async function setNoteReviewStatus(userId, noteId, reviewed) {
	await requireInternal(userId);
	const { error } = await db().from("portal_onboarding_notes").update(reviewed ? {
		review_status: "reviewed",
		reviewed_by: userId,
		reviewed_at: (/* @__PURE__ */ new Date()).toISOString()
	} : {
		review_status: "needs_review",
		reviewed_by: null,
		reviewed_at: null
	}).eq("id", noteId);
	if (error) throw new Error(error.message);
	return { ok: true };
}
async function deleteDealNote(userId, noteId) {
	const profile = await requireInternal(userId);
	const { data: note } = await db().from("portal_onboarding_notes").select("id, author_id").eq("id", noteId).maybeSingle();
	if (!note) throw new Error("Note not found");
	if (note.author_id !== userId && !SUPER_ROLES.includes(profile.role)) throw new Error("You can only delete notes you wrote");
	const { error } = await db().from("portal_onboarding_notes").delete().eq("id", noteId);
	if (error) throw new Error(error.message);
	return { ok: true };
}
async function startOnboarding(userId, dealId) {
	await requireSalesEditor(userId);
	const { data: account } = await db().from("portal_accounts").select("*").eq("id", dealId).maybeSingle();
	if (!account) throw new Error("Deal not found");
	if (account.customer_id) return {
		customerId: account.customer_id,
		implementationId: "",
		alreadyLinked: true
	};
	if (STAGES.indexOf(account.stage) < STAGES.indexOf("closed_won")) throw new Error("Only a closed-won deal can start onboarding");
	const { data: customer, error: customerError } = await db().from("customers").insert({
		name: account.name,
		arr: account.arr ?? null,
		industry: null
	}).select("id").single();
	if (customerError || !customer) throw new Error(customerError?.message ?? "Could not create the customer record");
	const firstStage = LIFECYCLE_STAGES[0].id;
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const { data: impl, error: implError } = await db().from("implementations").insert({
		customer_id: customer.id,
		name: account.name,
		current_stage: firstStage,
		stage_entered_at: now,
		status: "on_track"
	}).select("id").single();
	if (implError || !impl) throw new Error(implError?.message ?? "Could not create the implementation record");
	const { error: historyError } = await db().from("implementation_stage_history").insert({
		implementation_id: impl.id,
		stage: firstStage,
		entered_at: now,
		entered_by: null,
		exited_at: null
	});
	if (historyError) throw new Error(`Implementation created, but its stage history row failed: ${historyError.message}`);
	const { error: linkError } = await db().from("portal_accounts").update({ customer_id: customer.id }).eq("id", dealId);
	if (linkError) throw new Error(`Could not link the deal: ${linkError.message}`);
	if (account.stage === "closed_won") await transitionStage(dealId, "onboarding_kickoff", {
		source: "ui",
		actorProfileId: userId
	}, "Onboarding started from the deal record");
	await audit({
		actor_type: "user",
		actor_id: userId,
		action: "account.start_onboarding",
		entity_type: "account",
		entity_id: dealId,
		payload: {
			customer_id: customer.id,
			implementation_id: impl.id
		}
	});
	return {
		customerId: customer.id,
		implementationId: impl.id,
		alreadyLinked: false
	};
}
async function listApiKeys(userId) {
	await requireSuperAdmin(userId);
	const { data, error } = await db().from("portal_api_keys").select("*").order("created_at", { ascending: false });
	if (error) throw new Error(error.message);
	return data ?? [];
}
async function createApiKeyRecord(userId, input) {
	await requireSuperAdmin(userId);
	const scopes = input.scopes.filter((s) => API_SCOPES.includes(s));
	if (scopes.length === 0) throw new Error("Pick at least one scope");
	const { key, hash, prefix } = generateApiKey();
	const { data, error } = await db().from("portal_api_keys").insert({
		name: input.name,
		key_prefix: prefix,
		key_hash: hash,
		scopes,
		created_by: userId
	}).select("*").single();
	if (error || !data) throw new Error(error?.message ?? "Could not create the key");
	await audit({
		actor_type: "user",
		actor_id: userId,
		action: "api_key.create",
		entity_type: "api_key",
		entity_id: data.id,
		payload: {
			name: input.name,
			scopes
		}
	});
	return {
		key,
		record: data
	};
}
async function revokeApiKeyRecord(userId, keyId) {
	await requireSuperAdmin(userId);
	const { error } = await db().from("portal_api_keys").update({ revoked_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", keyId).is("revoked_at", null);
	if (error) throw new Error(error.message);
	await audit({
		actor_type: "user",
		actor_id: userId,
		action: "api_key.revoke",
		entity_type: "api_key",
		entity_id: keyId
	});
	return { ok: true };
}
async function listProfiles(userId) {
	await requireSuperAdmin(userId);
	const { data, error } = await db().from("portal_profiles").select("id, email, full_name, role, created_at").order("created_at", { ascending: true });
	if (error) throw new Error(error.message);
	return data ?? [];
}
var ASSIGNABLE_ROLES = [
	"super_admin",
	"manager",
	"sales",
	"implementation",
	"tam_se",
	"customer"
];
/**
* Role changes must run through the CALLER's RLS-bound client, not the service
* role: the portal_guard_role_change trigger checks portal_is_admin(), which
* reads auth.uid() — a service-role update has no auth.uid() and is always
* rejected by the database.
*/
async function setProfileRole(callerUserId, callerSupabase, targetProfileId, role) {
	await requireSuperAdmin(callerUserId);
	if (!ASSIGNABLE_ROLES.includes(role)) throw new Error("Unknown role");
	const { error } = await callerSupabase.from("portal_profiles").update({ role }).eq("id", targetProfileId);
	if (error) {
		if (/only admins can change roles/i.test(error.message)) throw new Error("The database's role guard rejected this change — it currently only recognizes the legacy 'admin' role as an admin.");
		throw new Error(error.message);
	}
	const { data: after } = await db().from("portal_profiles").select("role").eq("id", targetProfileId).maybeSingle();
	if (!after) throw new Error("Profile not found");
	if (after.role !== role) throw new Error("The role was not changed — the database only lets profiles with the legacy 'admin' role change roles.");
	await audit({
		actor_type: "user",
		actor_id: callerUserId,
		action: "profile.role_change",
		entity_type: "profile",
		entity_id: targetProfileId,
		payload: { role }
	});
	return { ok: true };
}
//#endregion
export { addDealNote, addGongReport, briefDownloadUrl, createApiKeyRecord, createDeal, deleteDealNote, deleteGongReport, generateDealBrief, importDealsCsv, listApiKeys, listProfiles, loadDeal, loadPipeline, requestTam, revokeApiKeyRecord, setNoteReviewStatus, setProfileRole, startOnboarding, transitionDeal };
