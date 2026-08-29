import { i as createServerFn } from "./server-c8UtrfAP.mjs";
import { t as requireSupabaseAuth } from "./auth-middleware-BpiY3ogQ.mjs";
import { a as objectType, c as stringType, n as booleanType, r as enumType } from "../_libs/zod.mjs";
import { un as createSsrRpc } from "./router-DuzTz6dO.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/tickets.functions-bkjSIB31.js
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
/** Load the caller's portal profile; throws when the auth user has none. */
var getTickets = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(createSsrRpc("d9758f7cb9b0fa6aaf13f85e616c8ba11b49a119743f3b11c9bde1e6d4f856c2"));
var getTicket = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ ticketId: stringType().uuid() }).parse(data)).handler(createSsrRpc("8e3e903a2c7b9dc8b4ebb470802f7497971688c5226db897ef3dcc22517c0996"));
var getTicketRouting = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(createSsrRpc("033baddaf46fef599fd337281834c382aa46ca40f7bbb65e5e37d59bd52ef35b"));
/** Internal profiles for assignee/fallback pickers. */
var getInternalProfiles = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(createSsrRpc("c8a58e2afdca8e3674ff72b47ecfacdccd89a14fc49a31aa3c2cc80cf1aa01d5"));
var addTicket = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	customerId: stringType().uuid().nullable().optional(),
	implementationId: stringType().uuid().nullable().optional(),
	category: enumType(TICKET_CATEGORIES),
	subject: stringType().min(1).max(300),
	body: stringType().min(1).max(2e4),
	priority: enumType(TICKET_PRIORITIES).optional()
}).parse(data)).handler(createSsrRpc("903ac29bff7d4efe04676c9d59e70a6d99e7008f06eb023c064f92508a55a25b"));
var addTicketComment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	ticketId: stringType().uuid(),
	body: stringType().min(1).max(2e4),
	internal: booleanType().optional()
}).parse(data)).handler(createSsrRpc("152b3ba4fa7d1e16f088f26de751db1c6e255a01ce4ceca19359cecb92c7f3b5"));
var setTicketStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	ticketId: stringType().uuid(),
	status: enumType(TICKET_STATUSES)
}).parse(data)).handler(createSsrRpc("085d14105286f18f8db450fdfd9bfb4afa51fbacbf33bc11e1102803b5a3332c"));
var setTicketAssignee = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	ticketId: stringType().uuid(),
	assigneeId: stringType().uuid().nullable()
}).parse(data)).handler(createSsrRpc("ebc20ddbb7d49212487d5d4f581573c1afcf5e14042150d6dbb0ed727adabaa7"));
var setTicketRouting = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	id: stringType().uuid(),
	routeRole: stringType().min(1).max(50),
	fallbackProfileId: stringType().uuid().nullable()
}).parse(data)).handler(createSsrRpc("7ce42938df04f36d36c82257559d5c6044b67050e8633db4255735ac3054e6b9"));
var getAlerts = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(createSsrRpc("9c70aca4186fae7b3900fe07c46183ae65d637a56f84e46078c54518e7e9aeeb"));
var ackAlert = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ alertId: stringType().uuid() }).parse(data)).handler(createSsrRpc("c95f8531b1742b3e7fb00701cf556dd41d8624b818a33144f66698ceedb27158"));
//#endregion
export { getInternalProfiles as a, getTickets as c, setTicketStatus as d, getAlerts as i, setTicketAssignee as l, addTicket as n, getTicket as o, addTicketComment as r, getTicketRouting as s, ackAlert as t, setTicketRouting as u };
