import { i as createServerFn } from "./server-C995c9rK.mjs";
import { t as requireSupabaseAuth } from "./auth-middleware-BgKLhIgU.mjs";
import { a as objectType, c as stringType, i as numberType, n as booleanType, r as enumType } from "../_libs/zod.mjs";
import { t as createServerRpc } from "./createServerRpc-q5FmR-el.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/journeys.functions-hUGpUtQG.js
async function internalOnly(userId) {
	const { requireInternal } = await import("./portal.server-COcA9pxJ.mjs");
	return requireInternal(userId);
}
async function editorOnly(userId) {
	const { requireInternal, canEditJourneys } = await import("./portal.server-COcA9pxJ.mjs");
	const profile = await requireInternal(userId);
	if (!canEditJourneys(profile.role)) throw new Error("Forbidden: managers or implementation only");
	return profile;
}
var getJourneys_createServerFn_handler = createServerRpc({
	id: "fa898a0394b89dba72723153e4d2ca6cd8aef0b2236d6f05e3d1840b19be2ed0",
	name: "getJourneys",
	filename: "src/lib/journeys.functions.ts"
}, (opts) => getJourneys.__executeServer(opts));
var getJourneys = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(getJourneys_createServerFn_handler, async ({ context }) => {
	await internalOnly(context.userId);
	const { ensureDefaultJourney, loadJourneys } = await import("./journeys.server-iQaz-5RK.mjs");
	await ensureDefaultJourney();
	return loadJourneys();
});
var getJourneyDetail_createServerFn_handler = createServerRpc({
	id: "5c26e7664f17a27d74644755a6bacc9d1cb8f4a5815b8768c238294cb61cce2b",
	name: "getJourneyDetail",
	filename: "src/lib/journeys.functions.ts"
}, (opts) => getJourneyDetail.__executeServer(opts));
var getJourneyDetail = createServerFn({ method: "GET" }).inputValidator((data) => objectType({ journeyId: stringType().uuid() }).parse(data)).middleware([requireSupabaseAuth]).handler(getJourneyDetail_createServerFn_handler, async ({ data, context }) => {
	await internalOnly(context.userId);
	const { loadJourneyDetail } = await import("./journeys.server-iQaz-5RK.mjs");
	return loadJourneyDetail(data.journeyId);
});
var addJourney_createServerFn_handler = createServerRpc({
	id: "b48db3e3012cc6fa0004a89cf18b43d15bc95b3b38409b8fbffb00aab0a20cef",
	name: "addJourney",
	filename: "src/lib/journeys.functions.ts"
}, (opts) => addJourney.__executeServer(opts));
var addJourney = createServerFn({ method: "POST" }).inputValidator((data) => objectType({
	name: stringType().trim().min(2).max(120),
	description: stringType().trim().max(500).nullable().optional(),
	trigger_event: enumType([
		"manual",
		"customer_created",
		"stage_entered"
	])
}).parse(data)).middleware([requireSupabaseAuth]).handler(addJourney_createServerFn_handler, async ({ data, context }) => {
	const profile = await editorOnly(context.userId);
	const { createJourney } = await import("./journeys.server-iQaz-5RK.mjs");
	return createJourney({
		name: data.name,
		description: data.description ?? null,
		trigger_event: data.trigger_event,
		createdBy: profile.id
	});
});
var toggleJourneyActive_createServerFn_handler = createServerRpc({
	id: "f9b496ddcf1eb017afaf9d90d929975137632b6a6865978bef512cb212306657",
	name: "toggleJourneyActive",
	filename: "src/lib/journeys.functions.ts"
}, (opts) => toggleJourneyActive.__executeServer(opts));
var toggleJourneyActive = createServerFn({ method: "POST" }).inputValidator((data) => objectType({
	journeyId: stringType().uuid(),
	active: booleanType()
}).parse(data)).middleware([requireSupabaseAuth]).handler(toggleJourneyActive_createServerFn_handler, async ({ data, context }) => {
	const profile = await editorOnly(context.userId);
	const { setJourneyActive } = await import("./journeys.server-iQaz-5RK.mjs");
	await setJourneyActive(data.journeyId, data.active, profile.id);
	return { ok: true };
});
var stepInput = objectType({
	journeyId: stringType().uuid(),
	stepId: stringType().uuid().nullable().optional(),
	title: stringType().trim().min(2).max(200),
	content_item_id: stringType().uuid().nullable().optional(),
	email_subject: stringType().trim().min(2).max(300),
	email_body: stringType().trim().min(2).max(8e3),
	advance_on: enumType(["viewed", "delay"]),
	delay_hours: numberType().int().positive().nullable().optional()
});
var saveStep_createServerFn_handler = createServerRpc({
	id: "b9ab53fa92483cfd9c53719f4ea83495837c13efe6466ed47605eff8798c40f6",
	name: "saveStep",
	filename: "src/lib/journeys.functions.ts"
}, (opts) => saveStep.__executeServer(opts));
var saveStep = createServerFn({ method: "POST" }).inputValidator((data) => stepInput.parse(data)).middleware([requireSupabaseAuth]).handler(saveStep_createServerFn_handler, async ({ data, context }) => {
	const profile = await editorOnly(context.userId);
	const { saveJourneyStep } = await import("./journeys.server-iQaz-5RK.mjs");
	return saveJourneyStep(data.journeyId, data.stepId ?? null, {
		title: data.title,
		content_item_id: data.content_item_id ?? null,
		email_subject: data.email_subject,
		email_body: data.email_body,
		advance_on: data.advance_on,
		delay_hours: data.advance_on === "delay" ? data.delay_hours ?? null : null
	}, profile.id);
});
var removeStep_createServerFn_handler = createServerRpc({
	id: "5da415abfe5beb111c8a3b41827cf5f7994179d75f351a06caab85f97bd18263",
	name: "removeStep",
	filename: "src/lib/journeys.functions.ts"
}, (opts) => removeStep.__executeServer(opts));
var removeStep = createServerFn({ method: "POST" }).inputValidator((data) => objectType({
	journeyId: stringType().uuid(),
	stepId: stringType().uuid()
}).parse(data)).middleware([requireSupabaseAuth]).handler(removeStep_createServerFn_handler, async ({ data, context }) => {
	const profile = await editorOnly(context.userId);
	const { deleteJourneyStep } = await import("./journeys.server-iQaz-5RK.mjs");
	await deleteJourneyStep(data.journeyId, data.stepId, profile.id);
	return { ok: true };
});
var addContentItem_createServerFn_handler = createServerRpc({
	id: "c6b7a512b6067bcc4ea1010dab38c42677c69288d07a4bd229ff803c3b4563d7",
	name: "addContentItem",
	filename: "src/lib/journeys.functions.ts"
}, (opts) => addContentItem.__executeServer(opts));
var addContentItem = createServerFn({ method: "POST" }).inputValidator((data) => objectType({
	title: stringType().trim().min(2).max(200),
	kind: enumType([
		"video",
		"doc",
		"link"
	]),
	url: stringType().trim().url(),
	description: stringType().trim().max(500).nullable().optional()
}).parse(data)).middleware([requireSupabaseAuth]).handler(addContentItem_createServerFn_handler, async ({ data, context }) => {
	const profile = await editorOnly(context.userId);
	const { createContentItem } = await import("./journeys.server-iQaz-5RK.mjs");
	return createContentItem({
		title: data.title,
		kind: data.kind,
		url: data.url,
		description: data.description ?? null,
		createdBy: profile.id
	});
});
var enrollJourneyContact_createServerFn_handler = createServerRpc({
	id: "9a65757fd9c0dd78d5a6ed2f14db0294e7dcfc94dc193e403efe8a6c9f4be5f1",
	name: "enrollJourneyContact",
	filename: "src/lib/journeys.functions.ts"
}, (opts) => enrollJourneyContact.__executeServer(opts));
var enrollJourneyContact = createServerFn({ method: "POST" }).inputValidator((data) => objectType({
	journeyId: stringType().uuid(),
	customerId: stringType().uuid(),
	contactId: stringType().uuid().nullable().optional(),
	contactEmail: stringType().trim().email(),
	firstName: stringType().trim().max(80).nullable().optional()
}).parse(data)).middleware([requireSupabaseAuth]).handler(enrollJourneyContact_createServerFn_handler, async ({ data, context }) => {
	await editorOnly(context.userId);
	const { enrollContact } = await import("./journeys.server-iQaz-5RK.mjs");
	return { id: (await enrollContact(data.journeyId, {
		customerId: data.customerId,
		contactEmail: data.contactEmail,
		contactId: data.contactId ?? null,
		firstName: data.firstName ?? null
	})).id };
});
var recordJourneyView_createServerFn_handler = createServerRpc({
	id: "3d01a0c121bfc82cf98501be0d7d0f6646bc015a07d8f1c88b2aa23b04cde85d",
	name: "recordJourneyView",
	filename: "src/lib/journeys.functions.ts"
}, (opts) => recordJourneyView.__executeServer(opts));
var recordJourneyView = createServerFn({ method: "POST" }).inputValidator((data) => objectType({ token: stringType().min(10) }).parse(data)).handler(recordJourneyView_createServerFn_handler, async ({ data }) => {
	const { recordView } = await import("./journeys.server-iQaz-5RK.mjs");
	return recordView(data.token);
});
//#endregion
export { addContentItem_createServerFn_handler, addJourney_createServerFn_handler, enrollJourneyContact_createServerFn_handler, getJourneyDetail_createServerFn_handler, getJourneys_createServerFn_handler, recordJourneyView_createServerFn_handler, removeStep_createServerFn_handler, saveStep_createServerFn_handler, toggleJourneyActive_createServerFn_handler };
