import { supabaseAdmin } from "./client.server-CyixJlZr.mjs";
import { t as audit } from "./audit-CSFBOZ4O.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/accounts-Ce7cfqsK.js
var createAdminClient = () => supabaseAdmin;
async function resolveAccountId(idOrSf) {
	const admin = createAdminClient();
	if (idOrSf.startsWith("sf_")) {
		const { data } = await admin.from("portal_accounts").select("id").eq("salesforce_id", idOrSf.slice(3)).maybeSingle();
		return data?.id ?? null;
	}
	const { data } = await admin.from("portal_accounts").select("id").eq("id", idOrSf).maybeSingle();
	return data?.id ?? null;
}
async function profileIdByEmail(email) {
	if (!email) return null;
	const { data } = await createAdminClient().from("portal_profiles").select("id").eq("email", email.toLowerCase()).maybeSingle();
	return data?.id ?? null;
}
async function transitionStage(accountId, toStage, ctx, note, occurredAt) {
	const { data, error } = await createAdminClient().rpc("portal_transition_stage", {
		p_account_id: accountId,
		p_to_stage: toStage,
		p_source: ctx.source,
		p_actor_profile: ctx.actorProfileId ?? null,
		p_actor_api_key: ctx.actorApiKeyId ?? null,
		p_note: note ?? null,
		p_occurred_at: occurredAt ?? null
	});
	if (error) throw new Error(error.message);
	const changed = data !== null;
	if (changed) await audit({
		actor_type: ctx.actorApiKeyId ? "api_key" : ctx.actorProfileId ? "user" : "system",
		actor_id: ctx.actorApiKeyId ?? ctx.actorProfileId ?? null,
		action: "stage.transition",
		entity_type: "account",
		entity_id: accountId,
		payload: {
			to_stage: toStage,
			source: ctx.source
		}
	});
	return { changed };
}
async function upsertAccount(input, ctx) {
	const admin = createAdminClient();
	let existing = null;
	if (input.salesforce_id) {
		const { data } = await admin.from("portal_accounts").select("*").eq("salesforce_id", input.salesforce_id).maybeSingle();
		existing = data;
	}
	if (!existing) {
		const { data } = await admin.from("portal_accounts").select("*").ilike("name", input.name).maybeSingle();
		existing = data;
	}
	const amOwnerId = await profileIdByEmail(input.am_owner_email);
	const seOwnerId = await profileIdByEmail(input.se_owner_email);
	const fields = {
		name: input.name,
		...input.domain !== void 0 && { domain: input.domain },
		...input.salesforce_id !== void 0 && { salesforce_id: input.salesforce_id },
		...input.arr !== void 0 && { arr: input.arr },
		...input.products !== void 0 && { products: input.products },
		...input.summary !== void 0 && { summary: input.summary },
		...amOwnerId && { am_owner_id: amOwnerId },
		...seOwnerId && { se_owner_id: seOwnerId }
	};
	let account;
	let created = false;
	let stageChanged = false;
	if (existing) {
		const { data, error } = await admin.from("portal_accounts").update(fields).eq("id", existing.id).select("*").single();
		if (error) throw new Error(error.message);
		account = data;
		if (input.stage && input.stage !== existing.stage) {
			const { changed } = await transitionStage(existing.id, input.stage, ctx);
			stageChanged = changed;
			account = {
				...account,
				stage: input.stage
			};
		}
	} else {
		const initialStage = input.stage ?? "prospect";
		const { data, error } = await admin.from("portal_accounts").insert({
			...fields,
			stage: initialStage
		}).select("*").single();
		if (error) throw new Error(error.message);
		account = data;
		created = true;
		stageChanged = Boolean(input.stage);
		await admin.from("portal_stage_transitions").insert({
			account_id: account.id,
			from_stage: null,
			to_stage: initialStage,
			source: ctx.source,
			actor_profile_id: ctx.actorProfileId ?? null,
			actor_api_key_id: ctx.actorApiKeyId ?? null,
			note: "Account created"
		});
	}
	await audit({
		actor_type: ctx.actorApiKeyId ? "api_key" : ctx.actorProfileId ? "user" : "system",
		actor_id: ctx.actorApiKeyId ?? ctx.actorProfileId ?? null,
		action: "account.upsert",
		entity_type: "account",
		entity_id: account.id,
		payload: {
			created,
			stage_changed: stageChanged,
			source: ctx.source
		}
	});
	return {
		account,
		created,
		stage_changed: stageChanged
	};
}
//#endregion
export { resolveAccountId, transitionStage, upsertAccount };
