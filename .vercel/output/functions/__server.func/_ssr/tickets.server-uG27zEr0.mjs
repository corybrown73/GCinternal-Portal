import { supabaseAdmin } from "./client.server-KzwUIAkW.mjs";
import { n as sendEmail } from "./email-D82hv4FK.mjs";
import { t as audit } from "./audit-D9QQPMll.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/tickets.server-uG27zEr0.js
var db = () => supabaseAdmin;
function appUrl() {
	return process.env["APP_URL"] ?? "http://localhost:3000";
}
function escapeHtml(s) {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/**
* Profile roles carry legacy aliases (se ≈ tam_se, onboarding ≈ implementation).
* A routing role must reach the whole pool, not just the canonical spelling.
*/
function rolePool(role) {
	switch (role) {
		case "tam_se":
		case "se": return ["tam_se", "se"];
		case "implementation":
		case "onboarding": return ["implementation", "onboarding"];
		default: return [role];
	}
}
/** Roles that receive escalation email (managers and super admins). */
var MANAGER_ROLES = [
	"manager",
	"admin",
	"super_admin"
];
async function profilesByRoles(roles) {
	const { data } = await db().from("portal_profiles").select("id, email, full_name, role").in("role", roles);
	return data ?? [];
}
async function managerProfiles() {
	return profilesByRoles(MANAGER_ROLES);
}
async function profileById(id) {
	if (!id) return null;
	const { data } = await db().from("portal_profiles").select("id, email, full_name, role").eq("id", id).maybeSingle();
	return data ?? null;
}
async function sendEmailSafe(opts) {
	try {
		await sendEmail(opts);
	} catch (e) {
		console.error(`ticket email to ${opts.to} failed`, e);
	}
}
function ticketLink(ticketId) {
	return `${appUrl()}/tickets/${ticketId}`;
}
function emailShell(title, lines) {
	return `
    <div style="font-family:sans-serif;max-width:540px">
      <h2 style="color:#237A4B;font-size:17px">${escapeHtml(title)}</h2>
      ${lines.join("\n")}
    </div>`;
}
/** Recipients for "the people responsible for this ticket": assignee, else the routed role pool. */
async function responsibleRecipients(ticket) {
	if (ticket.assigned_to) {
		const p = await profileById(ticket.assigned_to);
		if (p) return [p];
	}
	if (ticket.assigned_role) {
		const pool = await profilesByRoles(rolePool(ticket.assigned_role));
		if (pool.length > 0) return pool;
	}
	return managerProfiles();
}
async function createTicket(input) {
	const { data: routing } = await db().from("ticket_routing").select("route_role, fallback_profile_id").eq("category", input.category).maybeSingle();
	const routeRole = routing?.route_role ?? null;
	let assignedTo = null;
	let candidates = [];
	if (routeRole) {
		candidates = await profilesByRoles(rolePool(routeRole));
		if (candidates.length > 0) {
			const { data: openRows } = await db().from("tickets").select("assigned_to").in("status", [
				"open",
				"in_progress",
				"waiting_customer"
			]).in("assigned_to", candidates.map((c) => c.id));
			const load = new Map(candidates.map((c) => [c.id, 0]));
			for (const row of openRows ?? []) if (row.assigned_to && load.has(row.assigned_to)) load.set(row.assigned_to, (load.get(row.assigned_to) ?? 0) + 1);
			candidates.sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0));
			assignedTo = candidates[0]?.id ?? null;
		}
	}
	if (!assignedTo && routing?.fallback_profile_id) assignedTo = routing.fallback_profile_id;
	const slaDueAt = new Date(Date.now() + 864e5).toISOString();
	const { data: ticket, error } = await db().from("tickets").insert({
		customer_id: input.customerId ?? null,
		implementation_id: input.implementationId ?? null,
		submitted_by: input.submittedBy ?? null,
		submitter_email: input.submitterEmail.toLowerCase(),
		category: input.category,
		subject: input.subject,
		body: input.body,
		priority: input.priority ?? "normal",
		status: "open",
		assigned_role: routeRole,
		assigned_to: assignedTo,
		sla_due_at: slaDueAt
	}).select("*").single();
	if (error) throw new Error(`Could not create ticket: ${error.message}`);
	const created = ticket;
	const assignee = assignedTo ? await profileById(assignedTo) : null;
	const owner = assignee?.full_name ?? assignee?.email ?? `our ${routeRole ?? "support"} team`;
	await sendEmailSafe({
		to: created.submitter_email,
		subject: `We received your request: ${created.subject}`,
		html: emailShell(`We're on it`, [
			`<p style="font-size:14px">Thanks for reaching out. Your request <b>${escapeHtml(created.subject)}</b> has been logged and is owned by <b>${escapeHtml(owner)}</b>.</p>`,
			`<p style="font-size:14px">We respond within 24 hours.</p>`,
			`<p style="font-size:12px;color:#666">Reference: ${created.id}</p>`
		])
	});
	const notifyTargets = assignee ? [assignee] : candidates.length > 0 ? candidates : await managerProfiles();
	const detailRows = [
		`<p style="font-size:14px"><b>${escapeHtml(created.subject)}</b></p>`,
		`<p style="font-size:13px;white-space:pre-wrap">${escapeHtml(created.body)}</p>`,
		`<p style="font-size:13px;color:#666">Category: ${created.category} · Priority: ${created.priority} · From: ${escapeHtml(created.submitter_email ?? "unknown")}</p>`,
		`<p style="font-size:14px"><a href="${ticketLink(created.id)}">Open the ticket</a> — first response is due within 24 hours.</p>`
	];
	for (const target of notifyTargets) await sendEmailSafe({
		to: target.email,
		subject: `${assignee ? "New ticket assigned to you" : `New ${routeRole ?? ""} ticket`.trim()}: ${created.subject}`,
		html: emailShell("New support ticket", detailRows)
	});
	await audit({
		actor_type: input.actor?.type ?? "user",
		actor_id: input.actor?.id ?? input.submittedBy ?? null,
		action: "ticket.create",
		entity_type: "ticket",
		entity_id: created.id,
		payload: {
			category: created.category,
			priority: created.priority,
			assigned_role: routeRole,
			assigned_to: assignedTo,
			customer_id: created.customer_id
		}
	});
	return created;
}
async function addComment(ticketId, input) {
	const { data: ticketRow } = await db().from("tickets").select("*").eq("id", ticketId).maybeSingle();
	if (!ticketRow) throw new Error("Ticket not found");
	const ticket = ticketRow;
	const author = await profileById(input.authorProfileId);
	if (!author) throw new Error("Author profile not found");
	const authorIsInternal = author.role !== "customer";
	const internal = authorIsInternal ? Boolean(input.internal) : false;
	const { data: comment, error } = await db().from("ticket_comments").insert({
		ticket_id: ticketId,
		author_id: author.id,
		author_email: author.email,
		body: input.body,
		internal
	}).select("*").single();
	if (error) throw new Error(`Could not add comment: ${error.message}`);
	if (authorIsInternal && !internal && !ticket.first_response_at) await db().from("tickets").update({ first_response_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", ticketId).is("first_response_at", null);
	if (authorIsInternal && !internal && ticket.submitter_email) await sendEmailSafe({
		to: ticket.submitter_email,
		subject: `Update on your request: ${ticket.subject}`,
		html: emailShell("New reply on your ticket", [
			`<p style="font-size:13px;color:#666">${escapeHtml(author.full_name ?? author.email)} wrote:</p>`,
			`<p style="font-size:14px;white-space:pre-wrap">${escapeHtml(input.body)}</p>`,
			`<p style="font-size:12px;color:#666">Reference: ${ticket.id}</p>`
		])
	});
	else if (!authorIsInternal) {
		const recipients = await responsibleRecipients(ticket);
		for (const r of recipients) await sendEmailSafe({
			to: r.email,
			subject: `Customer replied: ${ticket.subject}`,
			html: emailShell("Customer reply", [
				`<p style="font-size:13px;color:#666">${escapeHtml(author.full_name ?? author.email)} wrote:</p>`,
				`<p style="font-size:14px;white-space:pre-wrap">${escapeHtml(input.body)}</p>`,
				`<p style="font-size:14px"><a href="${ticketLink(ticket.id)}">Open the ticket</a></p>`
			])
		});
	}
	await audit({
		actor_type: "user",
		actor_id: author.id,
		action: "ticket.comment",
		entity_type: "ticket",
		entity_id: ticketId,
		payload: {
			internal,
			comment_id: comment.id
		}
	});
	return comment;
}
async function updateTicketStatus(ticketId, status, actorProfileId) {
	const patch = {
		status,
		resolved_at: status === "resolved" || status === "closed" ? (/* @__PURE__ */ new Date()).toISOString() : null
	};
	const { data, error } = await db().from("tickets").update(patch).eq("id", ticketId).select("*").single();
	if (error) throw new Error(`Could not update status: ${error.message}`);
	await audit({
		actor_type: "user",
		actor_id: actorProfileId,
		action: "ticket.status",
		entity_type: "ticket",
		entity_id: ticketId,
		payload: { status }
	});
	return data;
}
async function assignTicket(ticketId, assigneeProfileId, actorProfileId) {
	const patch = { assigned_to: assigneeProfileId };
	if (assigneeProfileId) {
		const assignee = await profileById(assigneeProfileId);
		if (!assignee || assignee.role === "customer") throw new Error("Tickets can only be assigned to internal profiles");
		patch.assigned_role = assignee.role;
	}
	const { data, error } = await db().from("tickets").update(patch).eq("id", ticketId).select("*").single();
	if (error) throw new Error(`Could not assign ticket: ${error.message}`);
	await audit({
		actor_type: "user",
		actor_id: actorProfileId,
		action: "ticket.assign",
		entity_type: "ticket",
		entity_id: ticketId,
		payload: { assigned_to: assigneeProfileId }
	});
	return data;
}
async function loadTickets(opts) {
	let query = db().from("tickets").select("*").order("created_at", { ascending: false });
	if (opts.customerIds) {
		if (opts.customerIds.length === 0) return [];
		query = query.in("customer_id", opts.customerIds);
	}
	const { data: tickets } = await query;
	const rows = tickets ?? [];
	if (rows.length === 0) return [];
	const customerIds = [...new Set(rows.map((t) => t.customer_id).filter(Boolean))];
	const profileIds = [...new Set(rows.map((t) => t.assigned_to).filter(Boolean))];
	const [{ data: customers }, { data: profiles }] = await Promise.all([customerIds.length ? db().from("customers").select("id, name").in("id", customerIds) : Promise.resolve({ data: [] }), profileIds.length ? db().from("portal_profiles").select("id, full_name, email").in("id", profileIds) : Promise.resolve({ data: [] })]);
	const customerName = new Map((customers ?? []).map((c) => [c.id, c.name]));
	const profileName = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? p.email]));
	return rows.map((t) => ({
		...t,
		customer_name: t.customer_id ? customerName.get(t.customer_id) ?? null : null,
		assignee_name: t.assigned_to ? profileName.get(t.assigned_to) ?? null : null
	}));
}
async function loadTicket(ticketId, opts) {
	const { data: ticketRow } = await db().from("tickets").select("*").eq("id", ticketId).maybeSingle();
	if (!ticketRow) return null;
	const ticket = ticketRow;
	let commentsQuery = db().from("ticket_comments").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true });
	if (!opts.includeInternal) commentsQuery = commentsQuery.eq("internal", false);
	const { data: comments } = await commentsQuery;
	const commentRows = comments ?? [];
	const profileIds = [...new Set([ticket.assigned_to, ...commentRows.map((c) => c.author_id)].filter(Boolean))];
	const [{ data: profiles }, customerRes] = await Promise.all([profileIds.length ? db().from("portal_profiles").select("id, full_name, email").in("id", profileIds) : Promise.resolve({ data: [] }), ticket.customer_id ? db().from("customers").select("id, name").eq("id", ticket.customer_id).maybeSingle() : Promise.resolve({ data: null })]);
	const profileName = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? p.email]));
	return {
		ticket: {
			...ticket,
			customer_name: customerRes?.data?.name ?? null,
			assignee_name: ticket.assigned_to ? profileName.get(ticket.assigned_to) ?? null : null
		},
		comments: commentRows.map((c) => ({
			...c,
			author_name: c.author_id ? profileName.get(c.author_id) ?? c.author_email : c.author_email
		}))
	};
}
/** Customer ids linked to a customer-role profile via customer_users. */
async function linkedCustomerIds(profileId) {
	const { data } = await db().from("customer_users").select("customer_id").eq("profile_id", profileId);
	return (data ?? []).map((r) => r.customer_id);
}
async function createAlert(input) {
	const severity = input.severity ?? "warning";
	const { data: alert, error } = await db().from("alerts").insert({
		kind: input.kind,
		severity,
		title: input.title,
		detail: input.detail ?? null,
		customer_id: input.customerId ?? null,
		implementation_id: input.implementationId ?? null,
		source: input.source ?? "system",
		payload: input.payload ?? null
	}).select("*").single();
	if (error) throw new Error(`Could not create alert: ${error.message}`);
	let created = alert;
	if (input.notify && severity !== "info") {
		const managers = await managerProfiles();
		for (const m of managers) await sendEmailSafe({
			to: m.email,
			subject: `[Alert] ${created.title}`,
			html: emailShell(`[${severity.toUpperCase()}] ${created.title}`, [
				created.detail ? `<p style="font-size:14px;white-space:pre-wrap">${escapeHtml(created.detail)}</p>` : "",
				`<p style="font-size:13px;color:#666">Kind: ${escapeHtml(created.kind)} · Source: ${escapeHtml(created.source)}</p>`,
				`<p style="font-size:14px"><a href="${appUrl()}/alerts">Review alerts</a></p>`
			])
		});
		if (managers.length > 0) {
			const { data: stamped } = await db().from("alerts").update({ notified_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", created.id).select("*").single();
			if (stamped) created = stamped;
		}
	}
	await audit({
		actor_type: input.actor?.type ?? "system",
		actor_id: input.actor?.id ?? null,
		action: "alert.create",
		entity_type: "alert",
		entity_id: created.id,
		payload: {
			kind: created.kind,
			severity,
			title: created.title
		}
	});
	return created;
}
async function acknowledgeAlert(alertId, profileId) {
	const { data, error } = await db().from("alerts").update({
		acknowledged_at: (/* @__PURE__ */ new Date()).toISOString(),
		acknowledged_by: profileId
	}).eq("id", alertId).select("*").single();
	if (error) throw new Error(`Could not acknowledge alert: ${error.message}`);
	await audit({
		actor_type: "user",
		actor_id: profileId,
		action: "alert.acknowledge",
		entity_type: "alert",
		entity_id: alertId
	});
	return data;
}
//#endregion
export { acknowledgeAlert, addComment, assignTicket, createAlert, createTicket, escapeHtml, linkedCustomerIds, loadTicket, loadTickets, managerProfiles, rolePool, updateTicketStatus };
