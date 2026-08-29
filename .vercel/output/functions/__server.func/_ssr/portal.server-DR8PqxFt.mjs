import { n as LIFECYCLE_STAGES } from "./lifecycle-Cl8aBFg1.mjs";
import { l as normalizeStage } from "./hub-format--ProSxvQ.mjs";
import { supabaseAdmin } from "./client.server-KzwUIAkW.mjs";
import { addComment, createTicket, linkedCustomerIds } from "./tickets.server-uG27zEr0.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/portal.server-DR8PqxFt.js
var db = () => supabaseAdmin;
async function callerProfile(userId) {
	const { data } = await db().from("portal_profiles").select("id, email, full_name, role").eq("id", userId).maybeSingle();
	if (!data) throw new Error("Unauthorized: no profile for this user");
	return data;
}
/** Throws unless the caller's portal_profiles.role is internal (not 'customer'). */
async function requireInternal(userId) {
	const profile = await callerProfile(userId);
	if (profile.role === "customer") throw new Error("Forbidden: internal users only");
	return profile;
}
/** Roles allowed to edit journeys: managers/admins plus implementation. */
function canEditJourneys(role) {
	return [
		"admin",
		"super_admin",
		"manager",
		"implementation",
		"onboarding"
	].includes(role);
}
/** Customer ids the caller may see. Throws when none are linked. */
async function requireCustomerIds(userId) {
	const ids = await linkedCustomerIds(userId);
	if (ids.length === 0) throw new Error("No customer is linked to this login yet. Ask your GoCanvas contact for an invite.");
	return ids;
}
function milestoneDone(m) {
	if (m.completed_date) return true;
	return [
		"complete",
		"completed",
		"done"
	].includes((m.status ?? "").toLowerCase());
}
function pastDue(date) {
	if (!date) return false;
	return new Date(date).getTime() < Date.now();
}
async function loadPortalHome(userId) {
	const customerIds = await requireCustomerIds(userId);
	const [{ data: customers }, { data: impls }] = await Promise.all([db().from("customers").select("id, name").in("id", customerIds), db().from("implementations").select("*").in("customer_id", customerIds)]);
	const customerName = (customers ?? []).map((c) => c.name).join(" · ") || "Customer";
	const implIds = (impls ?? []).map((i) => i.id);
	const [{ data: milestones }, { data: commitments }, { data: history }] = implIds.length ? await Promise.all([
		db().from("milestones").select("id, implementation_id, name, status, target_date, completed_date, stage").in("implementation_id", implIds),
		db().from("commitments").select("id, implementation_id, description, due_date, status, committed_to").in("implementation_id", implIds).eq("status", "open"),
		db().from("implementation_stage_history").select("id, implementation_id, stage, entered_at").in("implementation_id", implIds).order("entered_at", { ascending: false }).limit(6)
	]) : [
		{ data: [] },
		{ data: [] },
		{ data: [] }
	];
	const customerById = new Map((customers ?? []).map((c) => [c.id, c.name]));
	const totalStages = LIFECYCLE_STAGES.length;
	const implementations = (impls ?? []).map((i) => {
		const own = (milestones ?? []).filter((m) => m.implementation_id === i.id);
		let pct;
		if (own.length > 0) pct = Math.round(own.filter(milestoneDone).length / own.length * 100);
		else {
			const normalized = normalizeStage(i.current_stage);
			const idx = normalized ? LIFECYCLE_STAGES.findIndex((s) => s.id === normalized) : -1;
			pct = idx >= 0 ? Math.round((idx + 1) / totalStages * 100) : 0;
		}
		return {
			id: i.id,
			customer_id: i.customer_id,
			customer_name: customerById.get(i.customer_id) ?? "Customer",
			name: i.name,
			current_stage: i.current_stage,
			stage_entered_at: i.stage_entered_at,
			status: i.status,
			target_launch_date: i.target_launch_date,
			actual_launch_date: i.actual_launch_date,
			progress_pct: pct,
			milestones: own.map((m) => ({
				id: m.id,
				name: m.name,
				status: m.status,
				target_date: m.target_date,
				completed_date: m.completed_date,
				stage: m.stage
			})).sort((a, b) => (a.target_date ?? "9999").localeCompare(b.target_date ?? "9999"))
		};
	});
	const implName = new Map(implementations.map((i) => [i.id, i.name]));
	const nextSteps = [...(commitments ?? []).map((c) => ({
		id: c.id,
		kind: "commitment",
		title: c.description,
		due_date: c.due_date,
		overdue: pastDue(c.due_date),
		who: c.committed_to ?? null,
		implementation_name: implName.get(c.implementation_id) ?? ""
	})), ...(milestones ?? []).filter((m) => !milestoneDone(m) && m.target_date).map((m) => ({
		id: m.id,
		kind: "milestone",
		title: m.name,
		due_date: m.target_date,
		overdue: pastDue(m.target_date),
		who: null,
		implementation_name: implName.get(m.implementation_id) ?? ""
	}))].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
	const activity = [...(history ?? []).map((h) => ({
		id: `stage-${h.id}`,
		at: h.entered_at,
		label: `Entered ${stageDisplay(h.stage)}`,
		detail: implName.get(h.implementation_id) ?? null
	})), ...(milestones ?? []).filter((m) => m.completed_date).map((m) => ({
		id: `ms-${m.id}`,
		at: m.completed_date,
		label: `Milestone completed: ${m.name}`,
		detail: implName.get(m.implementation_id) ?? null
	}))].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
	return {
		customers: (customers ?? []).map((c) => ({
			id: c.id,
			name: c.name
		})),
		customer_name: customerName,
		implementations,
		next_steps: nextSteps.slice(0, 12),
		activity
	};
}
function stageDisplay(raw) {
	const normalized = normalizeStage(raw);
	return (normalized ? LIFECYCLE_STAGES.find((s) => s.id === normalized) : void 0)?.label ?? raw;
}
async function loadPortalTickets(userId) {
	const customerIds = await requireCustomerIds(userId);
	const [{ data: customers }, { data: tickets }] = await Promise.all([db().from("customers").select("id, name").in("id", customerIds), db().from("tickets").select("id, customer_id, subject, body, category, status, priority, created_at").in("customer_id", customerIds).order("created_at", { ascending: false })]);
	const ticketIds = (tickets ?? []).map((t) => t.id);
	const { data: comments } = ticketIds.length ? await db().from("ticket_comments").select("id, ticket_id, author_id, author_email, body, internal, created_at").in("ticket_id", ticketIds).eq("internal", false).order("created_at", { ascending: true }) : { data: [] };
	const authorIds = Array.from(new Set((comments ?? []).map((c) => c.author_id).filter(Boolean)));
	const { data: authors } = authorIds.length ? await db().from("portal_profiles").select("id, full_name, email, role").in("id", authorIds) : { data: [] };
	const authorById = new Map((authors ?? []).map((a) => [a.id, a]));
	return {
		customers: (customers ?? []).map((c) => ({
			id: c.id,
			name: c.name
		})),
		tickets: (tickets ?? []).map((t) => ({
			...t,
			comments: (comments ?? []).filter((c) => c.ticket_id === t.id).map((c) => {
				const author = c.author_id ? authorById.get(c.author_id) : null;
				const isTeam = author ? author.role !== "customer" : false;
				return {
					id: c.id,
					body: c.body,
					author_name: isTeam ? "GoCanvas team" : author?.full_name || author?.email || c.author_email || "You",
					author_is_team: isTeam,
					created_at: c.created_at
				};
			})
		}))
	};
}
async function submitPortalTicket(userId, input) {
	if (!(await requireCustomerIds(userId)).includes(input.customerId)) throw new Error("Forbidden: you are not linked to this customer");
	const profile = await callerProfile(userId);
	const { data: impls } = await db().from("implementations").select("id").eq("customer_id", input.customerId);
	const implementationId = (impls ?? []).length === 1 ? impls[0].id : null;
	return createTicket({
		customerId: input.customerId,
		implementationId,
		category: input.category,
		subject: input.subject,
		body: input.body,
		priority: input.priority,
		submittedBy: profile.id,
		submitterEmail: profile.email,
		actor: {
			type: "user",
			id: profile.id
		}
	});
}
async function replyPortalTicket(userId, ticketId, body) {
	const customerIds = await requireCustomerIds(userId);
	const { data: ticket } = await db().from("tickets").select("id, customer_id").eq("id", ticketId).maybeSingle();
	if (!ticket || !customerIds.includes(ticket.customer_id)) throw new Error("Forbidden: not your ticket");
	return addComment(ticketId, {
		authorProfileId: userId,
		body
	});
}
//#endregion
export { canEditJourneys, loadPortalHome, loadPortalTickets, replyPortalTicket, requireInternal, submitPortalTicket };
