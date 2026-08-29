import { i as createServerFn } from "./server-c8UtrfAP.mjs";
import { t as requireSupabaseAuth } from "./auth-middleware-BpiY3ogQ.mjs";
import { a as objectType, c as stringType, r as enumType } from "../_libs/zod.mjs";
import { t as createServerRpc } from "./createServerRpc-CXcvml6V.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/portal.functions-Cr8fn3zk.js
var getPortalHome_createServerFn_handler = createServerRpc({
	id: "0253184b9f13ff5ce6b502a3c98b39a5a7b1bef16a18aad8823a8a37d649a9b9",
	name: "getPortalHome",
	filename: "src/lib/portal.functions.ts"
}, (opts) => getPortalHome.__executeServer(opts));
var getPortalHome = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(getPortalHome_createServerFn_handler, async ({ context }) => {
	const { loadPortalHome } = await import("./portal.server-DR8PqxFt.mjs");
	return loadPortalHome(context.userId);
});
var getPortalTickets_createServerFn_handler = createServerRpc({
	id: "36253ad40f40add008af5c78f92e7c4c71b4c63cd02ad976e718e72dec6eae61",
	name: "getPortalTickets",
	filename: "src/lib/portal.functions.ts"
}, (opts) => getPortalTickets.__executeServer(opts));
var getPortalTickets = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(getPortalTickets_createServerFn_handler, async ({ context }) => {
	const { loadPortalTickets } = await import("./portal.server-DR8PqxFt.mjs");
	return loadPortalTickets(context.userId);
});
var submitTicketInput = objectType({
	customerId: stringType().uuid(),
	category: enumType([
		"technical",
		"training",
		"billing",
		"data",
		"integration",
		"other"
	]),
	subject: stringType().trim().min(3).max(200),
	body: stringType().trim().min(5).max(8e3),
	priority: enumType([
		"low",
		"normal",
		"high",
		"urgent"
	]).optional()
});
var submitTicket_createServerFn_handler = createServerRpc({
	id: "f0a5f75c3eb380f3951453454690dd010f714f66f6b35a770f943ef423dae899",
	name: "submitTicket",
	filename: "src/lib/portal.functions.ts"
}, (opts) => submitTicket.__executeServer(opts));
var submitTicket = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => submitTicketInput.parse(data)).handler(submitTicket_createServerFn_handler, async ({ data, context }) => {
	const { submitPortalTicket } = await import("./portal.server-DR8PqxFt.mjs");
	return { id: (await submitPortalTicket(context.userId, {
		customerId: data.customerId,
		category: data.category,
		subject: data.subject,
		body: data.body,
		priority: data.priority ?? "normal"
	})).id };
});
var replyTicketInput = objectType({
	ticketId: stringType().uuid(),
	body: stringType().trim().min(1).max(8e3)
});
var replyTicket_createServerFn_handler = createServerRpc({
	id: "0b0abf92a4b03ccac8f3b7b253ce9aa4d71a19e66cd0b4883dcd9bf97576066c",
	name: "replyTicket",
	filename: "src/lib/portal.functions.ts"
}, (opts) => replyTicket.__executeServer(opts));
var replyTicket = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => replyTicketInput.parse(data)).handler(replyTicket_createServerFn_handler, async ({ data, context }) => {
	const { replyPortalTicket } = await import("./portal.server-DR8PqxFt.mjs");
	return { id: (await replyPortalTicket(context.userId, data.ticketId, data.body)).id };
});
//#endregion
export { getPortalHome_createServerFn_handler, getPortalTickets_createServerFn_handler, replyTicket_createServerFn_handler, submitTicket_createServerFn_handler };
