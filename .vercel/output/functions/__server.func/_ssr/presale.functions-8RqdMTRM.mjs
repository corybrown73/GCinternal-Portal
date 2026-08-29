import { i as createServerFn } from "./server-c8UtrfAP.mjs";
import { t as requireSupabaseAuth } from "./auth-middleware-BpiY3ogQ.mjs";
import { a as objectType, c as stringType, i as numberType, n as booleanType, r as enumType, t as arrayType } from "../_libs/zod.mjs";
import { t as STAGES } from "./presale-stages-BXcdOdDO.mjs";
import { t as createServerRpc } from "./createServerRpc-CXcvml6V.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/presale.functions-8RqdMTRM.js
var getPipeline_createServerFn_handler = createServerRpc({
	id: "d0c25d6e1184a7d22b6f6f82906a3805f6522e81cd67a9273bbf389849ae3e41",
	name: "getPipeline",
	filename: "src/lib/presale.functions.ts"
}, (opts) => getPipeline.__executeServer(opts));
var getPipeline = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(getPipeline_createServerFn_handler, async () => {
	const { loadPipeline } = await import("./presale.server-DsrEabCr.mjs");
	return loadPipeline();
});
var addDeal_createServerFn_handler = createServerRpc({
	id: "f1bda210b7f88725eaa3329e05abb11ab05ad8d5c06e9415eaaf2c933211c02c",
	name: "addDeal",
	filename: "src/lib/presale.functions.ts"
}, (opts) => addDeal.__executeServer(opts));
var addDeal = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	name: stringType().trim().min(1, "Name is required"),
	domain: stringType().trim().nullable(),
	salesforceId: stringType().trim().nullable(),
	arr: numberType().nonnegative().nullable(),
	summary: stringType().max(1e4).nullable()
}).parse(data)).handler(addDeal_createServerFn_handler, async ({ data, context }) => {
	const { createDeal } = await import("./presale.server-DsrEabCr.mjs");
	return createDeal(context.userId, {
		name: data.name,
		domain: data.domain,
		salesforce_id: data.salesforceId,
		arr: data.arr,
		summary: data.summary
	});
});
var moveDealStage_createServerFn_handler = createServerRpc({
	id: "68739b5f2f36c37d418264b239e45e8d941f9e750067a7de352687bd93f81e5f",
	name: "moveDealStage",
	filename: "src/lib/presale.functions.ts"
}, (opts) => moveDealStage.__executeServer(opts));
var moveDealStage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	dealId: stringType().uuid(),
	toStage: enumType(STAGES),
	note: stringType().max(2e3).optional()
}).parse(data)).handler(moveDealStage_createServerFn_handler, async ({ data, context }) => {
	const { transitionDeal } = await import("./presale.server-DsrEabCr.mjs");
	return transitionDeal(context.userId, data.dealId, data.toStage, data.note);
});
var importDeals_createServerFn_handler = createServerRpc({
	id: "3f9c8266ffc02b524c75bcd7d850197f1917d8dda5bfa1761f213f218a457aef",
	name: "importDeals",
	filename: "src/lib/presale.functions.ts"
}, (opts) => importDeals.__executeServer(opts));
var importDeals = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ csv: stringType().min(1, "The CSV file is empty").max(2097152) }).parse(data)).handler(importDeals_createServerFn_handler, async ({ data, context }) => {
	const { importDealsCsv } = await import("./presale.server-DsrEabCr.mjs");
	return importDealsCsv(context.userId, data.csv);
});
var getDeal_createServerFn_handler = createServerRpc({
	id: "90c860a0ac9b91a481bca73330335eb7b980da35389ecefed0b2b9f1e682c7c7",
	name: "getDeal",
	filename: "src/lib/presale.functions.ts"
}, (opts) => getDeal.__executeServer(opts));
var getDeal = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ dealId: stringType().uuid() }).parse(data)).handler(getDeal_createServerFn_handler, async ({ data }) => {
	const { loadDeal } = await import("./presale.server-DsrEabCr.mjs");
	return loadDeal(data.dealId);
});
var addReport_createServerFn_handler = createServerRpc({
	id: "416c6bdfecd3543652edc8ca169a6e15ad8c0f44bca60572437f4eab30d1ee0e",
	name: "addReport",
	filename: "src/lib/presale.functions.ts"
}, (opts) => addReport.__executeServer(opts));
var addReport = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	dealId: stringType().uuid(),
	title: stringType().trim().min(1, "Title is required"),
	reportType: enumType(["call_notes", "account_map"]),
	contentMd: stringType().trim().min(1, "Paste or upload some content first")
}).parse(data)).handler(addReport_createServerFn_handler, async ({ data, context }) => {
	const { addGongReport } = await import("./presale.server-DsrEabCr.mjs");
	return addGongReport(context.userId, data);
});
var removeReport_createServerFn_handler = createServerRpc({
	id: "92bc4d4bd0b6a90017b54ef095377ac84fc6988095cba0c213bcd4ad5023783a",
	name: "removeReport",
	filename: "src/lib/presale.functions.ts"
}, (opts) => removeReport.__executeServer(opts));
var removeReport = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ reportId: stringType().uuid() }).parse(data)).handler(removeReport_createServerFn_handler, async ({ data, context }) => {
	const { deleteGongReport } = await import("./presale.server-DsrEabCr.mjs");
	return deleteGongReport(context.userId, data.reportId);
});
var generateBriefForDeal_createServerFn_handler = createServerRpc({
	id: "9270b2efa09bda8039db5c9d2e22a8e617827d479b76d4899d342673e84fc967",
	name: "generateBriefForDeal",
	filename: "src/lib/presale.functions.ts"
}, (opts) => generateBriefForDeal.__executeServer(opts));
var generateBriefForDeal = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ dealId: stringType().uuid() }).parse(data)).handler(generateBriefForDeal_createServerFn_handler, async ({ data, context }) => {
	const { generateDealBrief } = await import("./presale.server-DsrEabCr.mjs");
	return generateDealBrief(context.userId, data.dealId);
});
var getBriefDownloadUrl_createServerFn_handler = createServerRpc({
	id: "e6851a833b18b5e285ee72c016410e50543e5afb8fb77b39d8e81fbad3c2cf0c",
	name: "getBriefDownloadUrl",
	filename: "src/lib/presale.functions.ts"
}, (opts) => getBriefDownloadUrl.__executeServer(opts));
var getBriefDownloadUrl = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ briefId: stringType().uuid() }).parse(data)).handler(getBriefDownloadUrl_createServerFn_handler, async ({ data, context }) => {
	const { briefDownloadUrl } = await import("./presale.server-DsrEabCr.mjs");
	return briefDownloadUrl(context.userId, data.briefId);
});
var createTamRequestForDeal_createServerFn_handler = createServerRpc({
	id: "04d8d312fd96d422f837e68299453c70dff7b7beaba5236e792559ae7e88b096",
	name: "createTamRequestForDeal",
	filename: "src/lib/presale.functions.ts"
}, (opts) => createTamRequestForDeal.__executeServer(opts));
var createTamRequestForDeal = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	dealId: stringType().uuid(),
	justification: stringType().trim().min(10, "Justification must be at least 10 characters"),
	urgency: enumType([
		"low",
		"medium",
		"high"
	])
}).parse(data)).handler(createTamRequestForDeal_createServerFn_handler, async ({ data, context }) => {
	const { requestTam } = await import("./presale.server-DsrEabCr.mjs");
	return requestTam(context.userId, data);
});
var addNote_createServerFn_handler = createServerRpc({
	id: "d2db611cceb79978daaa9867e11ecd2fa00f50af580e595a9435711e924d8f70",
	name: "addNote",
	filename: "src/lib/presale.functions.ts"
}, (opts) => addNote.__executeServer(opts));
var addNote = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	dealId: stringType().uuid(),
	bodyMd: stringType().trim().min(1, "Write something first")
}).parse(data)).handler(addNote_createServerFn_handler, async ({ data, context }) => {
	const { addDealNote } = await import("./presale.server-DsrEabCr.mjs");
	return addDealNote(context.userId, data);
});
var setNoteReviewed_createServerFn_handler = createServerRpc({
	id: "e9521b0e5516449c9d80433ba3ec886a7c6abf826afb6a89f6ae3fd2b33789bd",
	name: "setNoteReviewed",
	filename: "src/lib/presale.functions.ts"
}, (opts) => setNoteReviewed.__executeServer(opts));
var setNoteReviewed = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	noteId: stringType().uuid(),
	reviewed: booleanType()
}).parse(data)).handler(setNoteReviewed_createServerFn_handler, async ({ data, context }) => {
	const { setNoteReviewStatus } = await import("./presale.server-DsrEabCr.mjs");
	return setNoteReviewStatus(context.userId, data.noteId, data.reviewed);
});
var removeNote_createServerFn_handler = createServerRpc({
	id: "7e86340e87a5540dc46e752a31543a4388a5b1e11ca6981ef434b235234672fb",
	name: "removeNote",
	filename: "src/lib/presale.functions.ts"
}, (opts) => removeNote.__executeServer(opts));
var removeNote = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ noteId: stringType().uuid() }).parse(data)).handler(removeNote_createServerFn_handler, async ({ data, context }) => {
	const { deleteDealNote } = await import("./presale.server-DsrEabCr.mjs");
	return deleteDealNote(context.userId, data.noteId);
});
var startOnboardingForDeal_createServerFn_handler = createServerRpc({
	id: "e096c0b37026a1d5fc2221b2440f53440128ceb790b7a85010adcd5773f014c2",
	name: "startOnboardingForDeal",
	filename: "src/lib/presale.functions.ts"
}, (opts) => startOnboardingForDeal.__executeServer(opts));
var startOnboardingForDeal = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ dealId: stringType().uuid() }).parse(data)).handler(startOnboardingForDeal_createServerFn_handler, async ({ data, context }) => {
	const { startOnboarding } = await import("./presale.server-DsrEabCr.mjs");
	return startOnboarding(context.userId, data.dealId);
});
var getApiKeys_createServerFn_handler = createServerRpc({
	id: "5cc789e9ba44cb02f6d2268a8872e7d0be76d398adf9b3892f21126172ac0eac",
	name: "getApiKeys",
	filename: "src/lib/presale.functions.ts"
}, (opts) => getApiKeys.__executeServer(opts));
var getApiKeys = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(getApiKeys_createServerFn_handler, async ({ context }) => {
	const { listApiKeys } = await import("./presale.server-DsrEabCr.mjs");
	return listApiKeys(context.userId);
});
var createApiKey_createServerFn_handler = createServerRpc({
	id: "c65783f3f42fd7f34c03e851331d6051234fea36acd6c16ec98ba56ac8814b77",
	name: "createApiKey",
	filename: "src/lib/presale.functions.ts"
}, (opts) => createApiKey.__executeServer(opts));
var createApiKey = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	name: stringType().trim().min(1, "Name is required"),
	scopes: arrayType(stringType()).min(1, "Pick at least one scope")
}).parse(data)).handler(createApiKey_createServerFn_handler, async ({ data, context }) => {
	const { createApiKeyRecord } = await import("./presale.server-DsrEabCr.mjs");
	return createApiKeyRecord(context.userId, data);
});
var revokeApiKey_createServerFn_handler = createServerRpc({
	id: "a1eadc39af54dc98b24aae239ad42d56b7b06c4a0bb6c54cd033091744b22afd",
	name: "revokeApiKey",
	filename: "src/lib/presale.functions.ts"
}, (opts) => revokeApiKey.__executeServer(opts));
var revokeApiKey = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ keyId: stringType().uuid() }).parse(data)).handler(revokeApiKey_createServerFn_handler, async ({ data, context }) => {
	const { revokeApiKeyRecord } = await import("./presale.server-DsrEabCr.mjs");
	return revokeApiKeyRecord(context.userId, data.keyId);
});
var getUsers_createServerFn_handler = createServerRpc({
	id: "4d4c2f26853eb017feb152b6f4512fbe987385e94a5e68fe33e2576d48cb8368",
	name: "getUsers",
	filename: "src/lib/presale.functions.ts"
}, (opts) => getUsers.__executeServer(opts));
var getUsers = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(getUsers_createServerFn_handler, async ({ context }) => {
	const { listProfiles } = await import("./presale.server-DsrEabCr.mjs");
	return listProfiles(context.userId);
});
var setUserRole_createServerFn_handler = createServerRpc({
	id: "f3cc722a09e8be0aa24a98c1b5da57dfbedabd7bbce73608e802df868ac4237a",
	name: "setUserRole",
	filename: "src/lib/presale.functions.ts"
}, (opts) => setUserRole.__executeServer(opts));
var setUserRole = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	profileId: stringType().uuid(),
	role: enumType([
		"super_admin",
		"manager",
		"sales",
		"implementation",
		"tam_se",
		"customer"
	])
}).parse(data)).handler(setUserRole_createServerFn_handler, async ({ data, context }) => {
	const { setProfileRole } = await import("./presale.server-DsrEabCr.mjs");
	return setProfileRole(context.userId, context.supabase, data.profileId, data.role);
});
//#endregion
export { addDeal_createServerFn_handler, addNote_createServerFn_handler, addReport_createServerFn_handler, createApiKey_createServerFn_handler, createTamRequestForDeal_createServerFn_handler, generateBriefForDeal_createServerFn_handler, getApiKeys_createServerFn_handler, getBriefDownloadUrl_createServerFn_handler, getDeal_createServerFn_handler, getPipeline_createServerFn_handler, getUsers_createServerFn_handler, importDeals_createServerFn_handler, moveDealStage_createServerFn_handler, removeNote_createServerFn_handler, removeReport_createServerFn_handler, revokeApiKey_createServerFn_handler, setNoteReviewed_createServerFn_handler, setUserRole_createServerFn_handler, startOnboardingForDeal_createServerFn_handler };
