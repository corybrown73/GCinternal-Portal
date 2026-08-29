import { i as createServerFn } from "./server-c8UtrfAP.mjs";
import { t as requireSupabaseAuth } from "./auth-middleware-BpiY3ogQ.mjs";
import { a as objectType, c as stringType, n as booleanType, r as enumType } from "../_libs/zod.mjs";
import { t as createServerRpc } from "./createServerRpc-CXcvml6V.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/tickets.functions-BpshpJif.js
/**
* Server functions for the tickets + alerts system.
*
* Authorization model (enforced here, on the server, per call):
*  - internal roles see and manage all tickets;
*  - customer-role callers only see/create tickets for customers they are
*    linked to via customer_users, never internal comments;
*  - routing table edits and alert management are internal-only
*    (routing writes require manager+).
*/
var TICKET_CATEGORIES = [
	"technical",
	"training",
	"billing",
	"data",
	"integration",
	"other"
];
var TICKET_PRIORITIES = [
	"low",
	"normal",
	"high",
	"urgent"
];
var TICKET_STATUSES = [
	"open",
	"in_progress",
	"waiting_customer",
	"resolved",
	"closed"
];
var MANAGE_ROLES = [
	"admin",
	"super_admin",
	"manager"
];
/** Load the caller's portal profile; throws when the auth user has none. */
async function callerProfile(userId) {
	const { supabaseAdmin } = await import("./client.server-KzwUIAkW.mjs");
	const { data } = await supabaseAdmin.from("portal_profiles").select("id, email, full_name, role").eq("id", userId).maybeSingle();
	if (!data) throw new Error("Forbidden: no portal profile for this account");
	return data;
}
function assertInternal(profile) {
	if (profile.role === "customer") throw new Error("Forbidden: internal users only");
}
function assertManager(profile) {
	if (!MANAGE_ROLES.includes(profile.role)) throw new Error("Forbidden: managers only");
}
var getTickets_createServerFn_handler = createServerRpc({
	id: "d9758f7cb9b0fa6aaf13f85e616c8ba11b49a119743f3b11c9bde1e6d4f856c2",
	name: "getTickets",
	filename: "src/lib/tickets.functions.ts"
}, (opts) => getTickets.__executeServer(opts));
var getTickets = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(getTickets_createServerFn_handler, async ({ context }) => {
	const profile = await callerProfile(context.userId);
	const { loadTickets, linkedCustomerIds } = await import("./tickets.server-uG27zEr0.mjs");
	if (profile.role === "customer") return loadTickets({ customerIds: await linkedCustomerIds(profile.id) });
	return loadTickets({ customerIds: null });
});
var getTicket_createServerFn_handler = createServerRpc({
	id: "8e3e903a2c7b9dc8b4ebb470802f7497971688c5226db897ef3dcc22517c0996",
	name: "getTicket",
	filename: "src/lib/tickets.functions.ts"
}, (opts) => getTicket.__executeServer(opts));
var getTicket = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ ticketId: stringType().uuid() }).parse(data)).handler(getTicket_createServerFn_handler, async ({ data, context }) => {
	const profile = await callerProfile(context.userId);
	const { loadTicket, linkedCustomerIds } = await import("./tickets.server-uG27zEr0.mjs");
	const internal = profile.role !== "customer";
	const detail = await loadTicket(data.ticketId, { includeInternal: internal });
	if (!detail) throw new Error("Ticket not found");
	if (!internal) {
		const linked = await linkedCustomerIds(profile.id);
		if (!detail.ticket.customer_id || !linked.includes(detail.ticket.customer_id)) throw new Error("Ticket not found");
	}
	return detail;
});
var getTicketRouting_createServerFn_handler = createServerRpc({
	id: "033baddaf46fef599fd337281834c382aa46ca40f7bbb65e5e37d59bd52ef35b",
	name: "getTicketRouting",
	filename: "src/lib/tickets.functions.ts"
}, (opts) => getTicketRouting.__executeServer(opts));
var getTicketRouting = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(getTicketRouting_createServerFn_handler, async ({ context }) => {
	assertInternal(await callerProfile(context.userId));
	const { supabaseAdmin } = await import("./client.server-KzwUIAkW.mjs");
	const { data } = await supabaseAdmin.from("ticket_routing").select("id, category, route_role, fallback_profile_id").order("category", { ascending: true });
	return data ?? [];
});
var getInternalProfiles_createServerFn_handler = createServerRpc({
	id: "c8a58e2afdca8e3674ff72b47ecfacdccd89a14fc49a31aa3c2cc80cf1aa01d5",
	name: "getInternalProfiles",
	filename: "src/lib/tickets.functions.ts"
}, (opts) => getInternalProfiles.__executeServer(opts));
var getInternalProfiles = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(getInternalProfiles_createServerFn_handler, async ({ context }) => {
	assertInternal(await callerProfile(context.userId));
	const { supabaseAdmin } = await import("./client.server-KzwUIAkW.mjs");
	const { data } = await supabaseAdmin.from("portal_profiles").select("id, email, full_name, role").neq("role", "customer").order("full_name", { ascending: true });
	return data ?? [];
});
var addTicket_createServerFn_handler = createServerRpc({
	id: "903ac29bff7d4efe04676c9d59e70a6d99e7008f06eb023c064f92508a55a25b",
	name: "addTicket",
	filename: "src/lib/tickets.functions.ts"
}, (opts) => addTicket.__executeServer(opts));
var addTicket = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	customerId: stringType().uuid().nullable().optional(),
	implementationId: stringType().uuid().nullable().optional(),
	category: enumType(TICKET_CATEGORIES),
	subject: stringType().min(1).max(300),
	body: stringType().min(1).max(2e4),
	priority: enumType(TICKET_PRIORITIES).optional()
}).parse(data)).handler(addTicket_createServerFn_handler, async ({ data, context }) => {
	const profile = await callerProfile(context.userId);
	const { createTicket, linkedCustomerIds } = await import("./tickets.server-uG27zEr0.mjs");
	let customerId = data.customerId ?? null;
	if (profile.role === "customer") {
		const linked = await linkedCustomerIds(profile.id);
		if (customerId) {
			if (!linked.includes(customerId)) throw new Error("Forbidden: not your customer");
		} else {
			customerId = linked[0] ?? null;
			if (!customerId) throw new Error("Forbidden: no customer linked to this account");
		}
	}
	return createTicket({
		customerId,
		implementationId: data.implementationId ?? null,
		category: data.category,
		subject: data.subject,
		body: data.body,
		priority: data.priority,
		submittedBy: profile.id,
		submitterEmail: profile.email,
		actor: {
			type: "user",
			id: profile.id
		}
	});
});
var addTicketComment_createServerFn_handler = createServerRpc({
	id: "152b3ba4fa7d1e16f088f26de751db1c6e255a01ce4ceca19359cecb92c7f3b5",
	name: "addTicketComment",
	filename: "src/lib/tickets.functions.ts"
}, (opts) => addTicketComment.__executeServer(opts));
var addTicketComment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	ticketId: stringType().uuid(),
	body: stringType().min(1).max(2e4),
	internal: booleanType().optional()
}).parse(data)).handler(addTicketComment_createServerFn_handler, async ({ data, context }) => {
	const profile = await callerProfile(context.userId);
	const { addComment, loadTicket, linkedCustomerIds } = await import("./tickets.server-uG27zEr0.mjs");
	if (profile.role === "customer") {
		const detail = await loadTicket(data.ticketId, { includeInternal: false });
		const linked = await linkedCustomerIds(profile.id);
		if (!detail || !detail.ticket.customer_id || !linked.includes(detail.ticket.customer_id)) throw new Error("Ticket not found");
	}
	return addComment(data.ticketId, {
		authorProfileId: profile.id,
		body: data.body,
		internal: data.internal
	});
});
var setTicketStatus_createServerFn_handler = createServerRpc({
	id: "085d14105286f18f8db450fdfd9bfb4afa51fbacbf33bc11e1102803b5a3332c",
	name: "setTicketStatus",
	filename: "src/lib/tickets.functions.ts"
}, (opts) => setTicketStatus.__executeServer(opts));
var setTicketStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	ticketId: stringType().uuid(),
	status: enumType(TICKET_STATUSES)
}).parse(data)).handler(setTicketStatus_createServerFn_handler, async ({ data, context }) => {
	const profile = await callerProfile(context.userId);
	assertInternal(profile);
	const { updateTicketStatus } = await import("./tickets.server-uG27zEr0.mjs");
	return updateTicketStatus(data.ticketId, data.status, profile.id);
});
var setTicketAssignee_createServerFn_handler = createServerRpc({
	id: "ebc20ddbb7d49212487d5d4f581573c1afcf5e14042150d6dbb0ed727adabaa7",
	name: "setTicketAssignee",
	filename: "src/lib/tickets.functions.ts"
}, (opts) => setTicketAssignee.__executeServer(opts));
var setTicketAssignee = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	ticketId: stringType().uuid(),
	assigneeId: stringType().uuid().nullable()
}).parse(data)).handler(setTicketAssignee_createServerFn_handler, async ({ data, context }) => {
	const profile = await callerProfile(context.userId);
	assertInternal(profile);
	const { assignTicket } = await import("./tickets.server-uG27zEr0.mjs");
	return assignTicket(data.ticketId, data.assigneeId, profile.id);
});
var setTicketRouting_createServerFn_handler = createServerRpc({
	id: "7ce42938df04f36d36c82257559d5c6044b67050e8633db4255735ac3054e6b9",
	name: "setTicketRouting",
	filename: "src/lib/tickets.functions.ts"
}, (opts) => setTicketRouting.__executeServer(opts));
var setTicketRouting = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	id: stringType().uuid(),
	routeRole: stringType().min(1).max(50),
	fallbackProfileId: stringType().uuid().nullable()
}).parse(data)).handler(setTicketRouting_createServerFn_handler, async ({ data, context }) => {
	const profile = await callerProfile(context.userId);
	assertManager(profile);
	const { supabaseAdmin } = await import("./client.server-KzwUIAkW.mjs");
	const { audit } = await import("./audit-D9QQPMll.mjs").then((n) => n.n).then((n) => n.n);
	const { data: row, error } = await supabaseAdmin.from("ticket_routing").update({
		route_role: data.routeRole,
		fallback_profile_id: data.fallbackProfileId
	}).eq("id", data.id).select("id, category, route_role, fallback_profile_id").single();
	if (error) throw new Error(`Could not update routing: ${error.message}`);
	await audit({
		actor_type: "user",
		actor_id: profile.id,
		action: "ticket_routing.update",
		entity_type: "ticket_routing",
		entity_id: data.id,
		payload: {
			route_role: data.routeRole,
			fallback_profile_id: data.fallbackProfileId
		}
	});
	return row;
});
var getAlerts_createServerFn_handler = createServerRpc({
	id: "9c70aca4186fae7b3900fe07c46183ae65d637a56f84e46078c54518e7e9aeeb",
	name: "getAlerts",
	filename: "src/lib/tickets.functions.ts"
}, (opts) => getAlerts.__executeServer(opts));
var getAlerts = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(getAlerts_createServerFn_handler, async ({ context }) => {
	assertInternal(await callerProfile(context.userId));
	const { supabaseAdmin } = await import("./client.server-KzwUIAkW.mjs");
	const admin = supabaseAdmin;
	const { data: alerts } = await admin.from("alerts").select("id, kind, severity, title, detail, customer_id, implementation_id, source, acknowledged_at, acknowledged_by, notified_at, created_at").order("created_at", { ascending: false }).limit(200);
	const rows = alerts ?? [];
	const customerIds = [...new Set(rows.map((a) => a.customer_id).filter(Boolean))];
	const { data: customers } = customerIds.length ? await admin.from("customers").select("id, name").in("id", customerIds) : { data: [] };
	const names = new Map((customers ?? []).map((c) => [c.id, c.name]));
	return rows.map((a) => ({
		...a,
		customer_name: a.customer_id ? names.get(a.customer_id) ?? null : null
	}));
});
var ackAlert_createServerFn_handler = createServerRpc({
	id: "c95f8531b1742b3e7fb00701cf556dd41d8624b818a33144f66698ceedb27158",
	name: "ackAlert",
	filename: "src/lib/tickets.functions.ts"
}, (opts) => ackAlert.__executeServer(opts));
var ackAlert = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ alertId: stringType().uuid() }).parse(data)).handler(ackAlert_createServerFn_handler, async ({ data, context }) => {
	const profile = await callerProfile(context.userId);
	assertInternal(profile);
	const { acknowledgeAlert } = await import("./tickets.server-uG27zEr0.mjs");
	const alert = await acknowledgeAlert(data.alertId, profile.id);
	return {
		id: alert.id,
		acknowledged_at: alert.acknowledged_at
	};
});
//#endregion
export { ackAlert_createServerFn_handler, addTicketComment_createServerFn_handler, addTicket_createServerFn_handler, getAlerts_createServerFn_handler, getInternalProfiles_createServerFn_handler, getTicketRouting_createServerFn_handler, getTicket_createServerFn_handler, getTickets_createServerFn_handler, setTicketAssignee_createServerFn_handler, setTicketRouting_createServerFn_handler, setTicketStatus_createServerFn_handler };
