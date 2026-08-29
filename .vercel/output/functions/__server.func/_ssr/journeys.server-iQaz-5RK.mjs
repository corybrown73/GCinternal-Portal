import { supabaseAdmin } from "./client.server-CyixJlZr.mjs";
import { n as sendEmail } from "./email-D82hv4FK.mjs";
import { t as audit } from "./audit-CSFBOZ4O.mjs";
import { n as jwtVerify, t as SignJWT } from "../_libs/jose.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/journeys.server-iQaz-5RK.js
var db = () => supabaseAdmin;
function appUrl() {
	return process.env["APP_URL"] ?? "http://localhost:3000";
}
function secret() {
	const s = process.env["TAM_TOKEN_SECRET"];
	if (!s) throw new Error("TAM_TOKEN_SECRET is not set");
	return new TextEncoder().encode(s);
}
function escapeHtml(s) {
	return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}
async function signJourneyToken(enrollmentId, stepId) {
	return await new SignJWT({
		k: "journey",
		e: enrollmentId,
		s: stepId
	}).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret());
}
async function verifyJourneyToken(token) {
	try {
		const { payload } = await jwtVerify(token, secret());
		const k = payload["k"];
		const e = payload["e"];
		const s = payload["s"];
		if (k !== "journey" || typeof e !== "string" || typeof s !== "string") return null;
		return {
			enrollmentId: e,
			stepId: s
		};
	} catch {
		return null;
	}
}
/** Best-effort first name: explicit > linked contact's name > email local part. */
async function resolveFirstName(enrollment, explicit) {
	const explicitFirst = explicit?.trim().split(/\s+/)[0];
	if (explicitFirst) return explicitFirst;
	if (enrollment.contact_id) {
		const { data } = await db().from("customer_contacts").select("name").eq("id", enrollment.contact_id).maybeSingle();
		const name = data?.name?.trim();
		if (name) return name.split(/\s+/)[0];
	}
	const local = enrollment.contact_email.split("@")[0]?.split(/[._+-]/)[0] ?? "";
	return local ? local.charAt(0).toUpperCase() + local.slice(1) : "there";
}
function renderTemplate(raw, firstName, contentUrl) {
	return raw.replaceAll("{{first_name}}", firstName).replaceAll("{{content_url}}", contentUrl);
}
function renderBodyHtml(rawBody, firstName, contentUrl, cta) {
	let html = escapeHtml(rawBody.replaceAll("{{first_name}}", firstName)).replaceAll("{{content_url}}", `<a href="${contentUrl}" style="color:#237A4B">${contentUrl}</a>`);
	html = html.replaceAll("\n", "<br/>");
	return `
    <div style="font-family:sans-serif;max-width:540px">
      <p style="font-size:14px;line-height:1.6">${html}</p>
      <div style="margin:24px 0">
        <a href="${contentUrl}" style="background:#237A4B;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(cta)}</a>
      </div>
      <p style="font-size:12px;color:#888">GoCanvas Onboarding</p>
    </div>`;
}
/**
* Send the NEXT step (step_order = current_step + 1) of an enrollment.
* If there is no next step, the enrollment is marked completed.
*/
async function sendStep(enrollment, opts) {
	const nextOrder = enrollment.current_step + 1;
	const { data: step } = await db().from("journey_steps").select("*").eq("journey_id", enrollment.journey_id).eq("step_order", nextOrder).maybeSingle();
	if (!step) {
		await db().from("journey_enrollments").update({ status: "completed" }).eq("id", enrollment.id);
		return {
			sent: false,
			completed: true
		};
	}
	const token = await signJourneyToken(enrollment.id, step.id);
	const contentUrl = `${appUrl()}/view/${token}`;
	const firstName = await resolveFirstName(enrollment, opts?.firstName);
	const subject = renderTemplate(step.email_subject, firstName, contentUrl);
	const html = renderBodyHtml(step.email_body, firstName, contentUrl, `Open: ${step.title}`);
	await sendEmail({
		to: enrollment.contact_email,
		subject,
		html
	});
	await db().from("journey_enrollments").update({
		current_step: step.step_order,
		last_sent_at: (/* @__PURE__ */ new Date()).toISOString()
	}).eq("id", enrollment.id);
	await db().from("engagement_events").insert({
		enrollment_id: enrollment.id,
		step_id: step.id,
		contact_email: enrollment.contact_email,
		event: "sent",
		payload: {
			step_order: step.step_order,
			subject
		}
	});
	await audit({
		actor_type: "system",
		action: "journey.step_sent",
		entity_type: "journey_enrollment",
		entity_id: enrollment.id,
		payload: {
			journey_id: enrollment.journey_id,
			step_id: step.id,
			step_order: step.step_order
		}
	});
	return {
		sent: true,
		completed: false
	};
}
async function enrollContact(journeyId, input) {
	const email = input.contactEmail.trim().toLowerCase();
	if (!email) throw new Error("Contact email is required");
	const { data: created, error } = await db().from("journey_enrollments").insert({
		journey_id: journeyId,
		customer_id: input.customerId,
		contact_id: input.contactId ?? null,
		contact_email: email,
		current_step: 0,
		status: "active"
	}).select("*").single();
	if (error) {
		if (error.code === "23505") {
			const { data: existing } = await db().from("journey_enrollments").select("*").eq("journey_id", journeyId).eq("customer_id", input.customerId).eq("contact_email", email).maybeSingle();
			if (existing) return existing;
		}
		throw new Error(`Could not enroll contact: ${error.message}`);
	}
	const enrollment = created;
	await audit({
		actor_type: "system",
		action: "journey.enrolled",
		entity_type: "journey_enrollment",
		entity_id: enrollment.id,
		payload: {
			journey_id: journeyId,
			customer_id: input.customerId,
			contact_email: email
		}
	});
	await sendStep(enrollment, { firstName: input.firstName ?? null });
	return enrollment;
}
/**
* Verify a tracked-link token, record the view (deduped), advance the journey
* when the step advances on 'viewed', and return the real content URL.
* NEVER throws — falls back to APP_URL so the visitor always lands somewhere.
*/
async function recordView(token) {
	const fallback = { url: appUrl() };
	try {
		const claims = await verifyJourneyToken(token);
		if (!claims) return fallback;
		const [{ data: enrollment }, { data: step }] = await Promise.all([db().from("journey_enrollments").select("*").eq("id", claims.enrollmentId).maybeSingle(), db().from("journey_steps").select("*").eq("id", claims.stepId).maybeSingle()]);
		if (!enrollment || !step) return fallback;
		const contentUrl = await contentUrlOf(step);
		const { data: prior } = await db().from("engagement_events").select("id").eq("enrollment_id", enrollment.id).eq("step_id", step.id).eq("event", "viewed").limit(1);
		if ((prior ?? []).length === 0) {
			await db().from("engagement_events").insert({
				enrollment_id: enrollment.id,
				step_id: step.id,
				contact_email: enrollment.contact_email,
				event: "viewed",
				payload: { step_order: step.step_order }
			});
			await audit({
				actor_type: "email_token",
				action: "journey.viewed",
				entity_type: "journey_enrollment",
				entity_id: enrollment.id,
				payload: {
					step_id: step.id,
					step_order: step.step_order
				}
			});
			if (step.advance_on === "viewed" && enrollment.status === "active" && enrollment.current_step === step.step_order) await sendStep(enrollment);
		}
		return { url: contentUrl ?? appUrl() };
	} catch (e) {
		console.error("recordView failed", e);
		return fallback;
	}
}
async function contentUrlOf(step) {
	if (!step.content_item_id) return null;
	const { data } = await db().from("content_items").select("url").eq("id", step.content_item_id).maybeSingle();
	return data?.url ?? null;
}
async function advanceDelayedSteps() {
	const [{ data: enrollments }, { data: steps }, { data: journeys }] = await Promise.all([
		db().from("journey_enrollments").select("*").eq("status", "active"),
		db().from("journey_steps").select("*"),
		db().from("journeys").select("id, active")
	]);
	const activeJourneys = new Set((journeys ?? []).filter((j) => j.active).map((j) => j.id));
	const stepByJourneyOrder = /* @__PURE__ */ new Map();
	for (const s of steps ?? []) stepByJourneyOrder.set(`${s.journey_id}:${s.step_order}`, s);
	let advanced = 0;
	let completed = 0;
	const now = Date.now();
	for (const e of enrollments ?? []) {
		if (!activeJourneys.has(e.journey_id)) continue;
		const next = stepByJourneyOrder.get(`${e.journey_id}:${e.current_step + 1}`);
		if (!next || next.advance_on !== "delay") continue;
		const delayMs = (next.delay_hours ?? 0) * 36e5;
		const since = e.last_sent_at ?? e.created_at;
		if (!since || now - new Date(since).getTime() < delayMs) continue;
		const result = await sendStep(e);
		if (result.sent) advanced += 1;
		if (result.completed) completed += 1;
	}
	return {
		advanced,
		completed
	};
}
async function autoEnrollNewCustomers() {
	const { data: journeys } = await db().from("journeys").select("id").eq("trigger_event", "customer_created").eq("active", true);
	if (!journeys || journeys.length === 0) return { enrolled: 0 };
	const dayAgo = (/* @__PURE__ */ new Date(Date.now() - 864e5)).toISOString();
	const { data: customers } = await db().from("customers").select("id, name, created_at").gte("created_at", dayAgo);
	if (!customers || customers.length === 0) return { enrolled: 0 };
	const customerIds = customers.map((c) => c.id);
	const [{ data: contacts }, { data: existing }] = await Promise.all([db().from("customer_contacts").select("id, customer_id, name, email, role").in("customer_id", customerIds), db().from("journey_enrollments").select("journey_id, customer_id, contact_email").in("customer_id", customerIds)]);
	const already = new Set((existing ?? []).map((e) => `${e.journey_id}:${e.customer_id}:${e.contact_email}`));
	let enrolled = 0;
	for (const customer of customers) {
		const own = (contacts ?? []).filter((c) => c.customer_id === customer.id && c.email);
		if (own.length === 0) continue;
		const primary = own.find((c) => /primary|champion|main/i.test(c.role ?? "")) ?? own[0];
		for (const journey of journeys) {
			const key = `${journey.id}:${customer.id}:${primary.email.trim().toLowerCase()}`;
			if (already.has(key)) continue;
			try {
				await enrollContact(journey.id, {
					customerId: customer.id,
					contactEmail: primary.email,
					contactId: primary.id,
					firstName: primary.name
				});
				enrolled += 1;
			} catch (e) {
				console.error(`auto-enroll failed for customer ${customer.id}`, e);
			}
		}
	}
	return { enrolled };
}
async function loadJourneys() {
	const [{ data: journeys }, { data: steps }, { data: enrollments }] = await Promise.all([
		db().from("journeys").select("*").order("created_at", { ascending: true }),
		db().from("journey_steps").select("id, journey_id"),
		db().from("journey_enrollments").select("id, journey_id")
	]);
	return (journeys ?? []).map((j) => ({
		...j,
		step_count: (steps ?? []).filter((s) => s.journey_id === j.id).length,
		enrolled_count: (enrollments ?? []).filter((e) => e.journey_id === j.id).length
	}));
}
async function loadJourneyDetail(journeyId) {
	const { data: journey } = await db().from("journeys").select("*").eq("id", journeyId).maybeSingle();
	if (!journey) throw new Error("Journey not found");
	const [{ data: steps }, { data: enrollments }, { data: contentItems }, { data: customers }, { data: contacts }] = await Promise.all([
		db().from("journey_steps").select("*").eq("journey_id", journeyId).order("step_order"),
		db().from("journey_enrollments").select("*").eq("journey_id", journeyId).order("created_at", { ascending: false }),
		db().from("content_items").select("id, title, kind, url, description").order("title"),
		db().from("customers").select("id, name").order("name"),
		db().from("customer_contacts").select("id, customer_id, name, email")
	]);
	const enrollmentIds = (enrollments ?? []).map((e) => e.id);
	const { data: events } = enrollmentIds.length ? await db().from("engagement_events").select("id, enrollment_id, step_id, event, created_at").in("enrollment_id", enrollmentIds).order("created_at", { ascending: true }) : { data: [] };
	const contentById = new Map((contentItems ?? []).map((c) => [c.id, c]));
	const customerById = new Map((customers ?? []).map((c) => [c.id, c.name]));
	const contactById = new Map((contacts ?? []).map((c) => [c.id, c.name]));
	return {
		journey,
		steps: (steps ?? []).map((s) => ({
			...s,
			content_item: s.content_item_id ? contentById.get(s.content_item_id) ?? null : null
		})),
		enrollments: (enrollments ?? []).map((e) => ({
			...e,
			customer_name: customerById.get(e.customer_id) ?? "Unknown customer",
			contact_name: e.contact_id ? contactById.get(e.contact_id) ?? null : null,
			events: (events ?? []).filter((ev) => ev.enrollment_id === e.id).map((ev) => ({
				id: ev.id,
				step_id: ev.step_id,
				event: ev.event,
				created_at: ev.created_at
			}))
		})),
		content_items: contentItems ?? [],
		customers: (customers ?? []).map((c) => ({
			id: c.id,
			name: c.name,
			contacts: (contacts ?? []).filter((ct) => ct.customer_id === c.id).map((ct) => ({
				id: ct.id,
				name: ct.name,
				email: ct.email
			}))
		}))
	};
}
async function createJourney(input) {
	const { data, error } = await db().from("journeys").insert({
		name: input.name,
		description: input.description ?? null,
		trigger_event: input.trigger_event,
		active: true
	}).select("*").single();
	if (error) throw new Error(`Could not create journey: ${error.message}`);
	await audit({
		actor_type: "user",
		actor_id: input.createdBy,
		action: "journey.created",
		entity_type: "journey",
		entity_id: data.id,
		payload: { name: input.name }
	});
	return data;
}
async function setJourneyActive(journeyId, active, actorId) {
	const { error } = await db().from("journeys").update({ active }).eq("id", journeyId);
	if (error) throw new Error(error.message);
	await audit({
		actor_type: "user",
		actor_id: actorId,
		action: active ? "journey.activated" : "journey.paused",
		entity_type: "journey",
		entity_id: journeyId
	});
}
async function saveJourneyStep(journeyId, stepId, patch, actorId) {
	if (patch.advance_on === "delay" && (!patch.delay_hours || patch.delay_hours <= 0)) throw new Error("A delay step needs delay_hours greater than zero");
	if (stepId) {
		const { data, error } = await db().from("journey_steps").update({ ...patch }).eq("id", stepId).eq("journey_id", journeyId).select("*").single();
		if (error) throw new Error(`Could not update step: ${error.message}`);
		await audit({
			actor_type: "user",
			actor_id: actorId,
			action: "journey.step_updated",
			entity_type: "journey_step",
			entity_id: stepId
		});
		return data;
	}
	const { data: last } = await db().from("journey_steps").select("step_order").eq("journey_id", journeyId).order("step_order", { ascending: false }).limit(1);
	const nextOrder = ((last ?? [])[0]?.step_order ?? 0) + 1;
	const { data, error } = await db().from("journey_steps").insert({
		journey_id: journeyId,
		step_order: nextOrder,
		...patch
	}).select("*").single();
	if (error) throw new Error(`Could not add step: ${error.message}`);
	await audit({
		actor_type: "user",
		actor_id: actorId,
		action: "journey.step_added",
		entity_type: "journey_step",
		entity_id: data.id,
		payload: {
			journey_id: journeyId,
			step_order: nextOrder
		}
	});
	return data;
}
async function deleteJourneyStep(journeyId, stepId, actorId) {
	const { error } = await db().from("journey_steps").delete().eq("id", stepId).eq("journey_id", journeyId);
	if (error) throw new Error(error.message);
	const { data: rest } = await db().from("journey_steps").select("id, step_order").eq("journey_id", journeyId).order("step_order");
	let order = 1;
	for (const s of rest ?? []) {
		if (s.step_order !== order) await db().from("journey_steps").update({ step_order: order }).eq("id", s.id);
		order += 1;
	}
	await audit({
		actor_type: "user",
		actor_id: actorId,
		action: "journey.step_deleted",
		entity_type: "journey_step",
		entity_id: stepId,
		payload: { journey_id: journeyId }
	});
}
async function createContentItem(input) {
	const { data, error } = await db().from("content_items").insert({
		title: input.title,
		kind: input.kind,
		url: input.url,
		description: input.description ?? null,
		created_by: input.createdBy
	}).select("id, title, kind, url, description").single();
	if (error) throw new Error(`Could not create content item: ${error.message}`);
	return data;
}
/** Idempotent: only seeds when ZERO journeys exist. */
async function ensureDefaultJourney() {
	const { count } = await db().from("journeys").select("id", {
		count: "exact",
		head: true
	});
	if ((count ?? 0) > 0) return;
	const { data: content, error: contentError } = await db().from("content_items").insert({
		title: "Welcome to GoCanvas",
		kind: "video",
		url: "https://www.gocanvas.com/welcome",
		description: "Placeholder welcome video for new customers."
	}).select("id").single();
	if (contentError) throw new Error(`Seed failed: ${contentError.message}`);
	const { data: journey, error: journeyError } = await db().from("journeys").insert({
		name: "New Logo Welcome",
		description: "Automated welcome + training sequence for newly signed customers.",
		trigger_event: "customer_created",
		active: true
	}).select("id").single();
	if (journeyError) throw new Error(`Seed failed: ${journeyError.message}`);
	const { error: stepsError } = await db().from("journey_steps").insert([
		{
			journey_id: journey.id,
			step_order: 1,
			title: "Welcome to GoCanvas",
			content_item_id: content.id,
			email_subject: "Welcome to GoCanvas, {{first_name}}!",
			email_body: "Hi {{first_name}},\n\nWelcome aboard! We put together a short welcome video that shows what your first weeks with GoCanvas will look like.\n\nWatch it here: {{content_url}}\n\nYour onboarding team",
			advance_on: "viewed",
			delay_hours: null
		},
		{
			journey_id: journey.id,
			step_order: 2,
			title: "Level 1 training",
			content_item_id: content.id,
			email_subject: "Thanks for watching — here's Level 1 training",
			email_body: "Hi {{first_name}},\n\nGreat — you watched the welcome video. The next step is Level 1 training: the basics of building and dispatching your first form.\n\nStart here: {{content_url}}\n\nYour onboarding team",
			advance_on: "viewed",
			delay_hours: null
		},
		{
			journey_id: journey.id,
			step_order: 3,
			title: "Level 2 training",
			content_item_id: content.id,
			email_subject: "Ready for Level 2, {{first_name}}?",
			email_body: "Hi {{first_name}},\n\nYou're making great progress. Level 2 training covers workflows, integrations and reporting.\n\nContinue here: {{content_url}}\n\nYour onboarding team",
			advance_on: "delay",
			delay_hours: 48
		}
	]);
	if (stepsError) throw new Error(`Seed failed: ${stepsError.message}`);
}
//#endregion
export { advanceDelayedSteps, autoEnrollNewCustomers, createContentItem, createJourney, deleteJourneyStep, enrollContact, ensureDefaultJourney, loadJourneyDetail, loadJourneys, recordView, saveJourneyStep, setJourneyActive };
