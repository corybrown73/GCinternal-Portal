import { i as createServerFn } from "./server-c8UtrfAP.mjs";
import { t as requireSupabaseAuth } from "./auth-middleware-BpiY3ogQ.mjs";
import { a as objectType, c as stringType } from "../_libs/zod.mjs";
import { t as createServerRpc } from "./createServerRpc-CXcvml6V.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/access.functions-CkmreJsn.js
var getAccessOverview_createServerFn_handler = createServerRpc({
	id: "5f549ee541544819553c17e8f71e14a349e74384a83e8ed25a3081dc696a8e04",
	name: "getAccessOverview",
	filename: "src/lib/access.functions.ts"
}, (opts) => getAccessOverview.__executeServer(opts));
var getAccessOverview = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(getAccessOverview_createServerFn_handler, async ({ context }) => {
	const { requireInternal } = await import("./portal.server-DR8PqxFt.mjs");
	await requireInternal(context.userId);
	const { loadAccessOverview } = await import("./access.server-Wk7ByT4N.mjs");
	return loadAccessOverview();
});
var inviteContact_createServerFn_handler = createServerRpc({
	id: "93dc4808ed4403d44292164f9911900ce34f1ce88d3515273171700c23c60623",
	name: "inviteContact",
	filename: "src/lib/access.functions.ts"
}, (opts) => inviteContact.__executeServer(opts));
var inviteContact = createServerFn({ method: "POST" }).inputValidator((data) => objectType({
	customerId: stringType().uuid(),
	email: stringType().trim().email(),
	contactId: stringType().uuid().nullable().optional()
}).parse(data)).middleware([requireSupabaseAuth]).handler(inviteContact_createServerFn_handler, async ({ data, context }) => {
	const { requireInternal } = await import("./portal.server-DR8PqxFt.mjs");
	const inviter = await requireInternal(context.userId);
	const { inviteCustomerContact } = await import("./access.server-Wk7ByT4N.mjs");
	return inviteCustomerContact(inviter, {
		customerId: data.customerId,
		email: data.email,
		contactId: data.contactId ?? null
	});
});
var revokeCustomerInvite_createServerFn_handler = createServerRpc({
	id: "c9b005c384ad3eb4a9f58f9d036e66bfbe44bd1f15fc91b5ea0b2d886a4a0097",
	name: "revokeCustomerInvite",
	filename: "src/lib/access.functions.ts"
}, (opts) => revokeCustomerInvite.__executeServer(opts));
var revokeCustomerInvite = createServerFn({ method: "POST" }).inputValidator((data) => objectType({ inviteId: stringType().uuid() }).parse(data)).middleware([requireSupabaseAuth]).handler(revokeCustomerInvite_createServerFn_handler, async ({ data, context }) => {
	const { requireInternal } = await import("./portal.server-DR8PqxFt.mjs");
	const actor = await requireInternal(context.userId);
	const { revokeInvite } = await import("./access.server-Wk7ByT4N.mjs");
	await revokeInvite(data.inviteId, actor.id);
	return { ok: true };
});
var removeCustomerAccess_createServerFn_handler = createServerRpc({
	id: "b53cb872ba3b4b5af5056d1d9ab89bc17f4bcb833512f08ad0b87a9a59bf6e4a",
	name: "removeCustomerAccess",
	filename: "src/lib/access.functions.ts"
}, (opts) => removeCustomerAccess.__executeServer(opts));
var removeCustomerAccess = createServerFn({ method: "POST" }).inputValidator((data) => objectType({ linkId: stringType().uuid() }).parse(data)).middleware([requireSupabaseAuth]).handler(removeCustomerAccess_createServerFn_handler, async ({ data, context }) => {
	const { requireInternal } = await import("./portal.server-DR8PqxFt.mjs");
	const actor = await requireInternal(context.userId);
	const { removeCustomerUser } = await import("./access.server-Wk7ByT4N.mjs");
	await removeCustomerUser(data.linkId, actor.id);
	return { ok: true };
});
//#endregion
export { getAccessOverview_createServerFn_handler, inviteContact_createServerFn_handler, removeCustomerAccess_createServerFn_handler, revokeCustomerInvite_createServerFn_handler };
