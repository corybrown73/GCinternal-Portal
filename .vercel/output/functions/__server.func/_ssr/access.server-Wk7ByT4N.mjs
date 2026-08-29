import { supabaseAdmin } from "./client.server-KzwUIAkW.mjs";
import { n as sendEmail } from "./email-D82hv4FK.mjs";
import { t as audit } from "./audit-D9QQPMll.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/access.server-Wk7ByT4N.js
var db = () => supabaseAdmin;
function appUrl() {
	return process.env["APP_URL"] ?? "http://localhost:3000";
}
function escapeHtml(s) {
	return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}
async function loadAccessOverview() {
	const [{ data: customers }, { data: links }, { data: invites }, { data: contacts }, { data: profiles }] = await Promise.all([
		db().from("customers").select("id, name").order("name"),
		db().from("customer_users").select("id, profile_id, customer_id, contact_id, created_at"),
		db().from("customer_invites").select("id, email, customer_id, contact_id, invited_by, created_at, accepted_at").is("accepted_at", null),
		db().from("customer_contacts").select("id, customer_id, name, email"),
		db().from("portal_profiles").select("id, email, full_name")
	]);
	const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
	const contactById = new Map((contacts ?? []).map((c) => [c.id, c]));
	return (customers ?? []).map((c) => ({
		id: c.id,
		name: c.name,
		users: (links ?? []).filter((l) => l.customer_id === c.id).map((l) => {
			const profile = profileById.get(l.profile_id);
			const contact = l.contact_id ? contactById.get(l.contact_id) : null;
			return {
				link_id: l.id,
				profile_id: l.profile_id,
				email: profile?.email ?? "unknown",
				full_name: profile?.full_name ?? null,
				contact_name: contact?.name ?? null,
				created_at: l.created_at
			};
		}),
		invites: (invites ?? []).filter((i) => i.customer_id === c.id).map((i) => ({
			id: i.id,
			email: i.email,
			contact_name: i.contact_id ? contactById.get(i.contact_id)?.name ?? null : null,
			invited_by_name: i.invited_by ? profileById.get(i.invited_by)?.full_name ?? profileById.get(i.invited_by)?.email ?? null : null,
			created_at: i.created_at
		})),
		contacts: (contacts ?? []).filter((ct) => ct.customer_id === c.id).map((ct) => ({
			id: ct.id,
			name: ct.name,
			email: ct.email
		}))
	}));
}
async function inviteCustomerContact(inviter, input) {
	const email = input.email.trim().toLowerCase();
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
	const { data: customer } = await db().from("customers").select("id, name").eq("id", input.customerId).maybeSingle();
	if (!customer) throw new Error("Customer not found");
	const { error: inviteError } = await db().from("customer_invites").upsert({
		email,
		customer_id: input.customerId,
		contact_id: input.contactId ?? null,
		invited_by: inviter.id
	}, { onConflict: "email,customer_id" });
	if (inviteError) throw new Error(`Could not record invite: ${inviteError.message}`);
	const redirectTo = `${appUrl()}/auth/callback`;
	const admin = supabaseAdmin;
	let actionLink = null;
	const { data: magic, error: magicError } = await admin.auth.admin.generateLink({
		type: "magiclink",
		email,
		options: { redirectTo }
	});
	if (!magicError && magic?.properties?.action_link) actionLink = magic.properties.action_link;
	else {
		const { data: inviteLink, error: linkError } = await admin.auth.admin.generateLink({
			type: "invite",
			email,
			options: { redirectTo }
		});
		if (linkError || !inviteLink?.properties?.action_link) throw new Error(`Could not generate a sign-in link: ${linkError?.message ?? magicError?.message ?? "unknown error"}`);
		actionLink = inviteLink.properties.action_link;
	}
	const inviterName = inviter.full_name?.trim() || inviter.email;
	await sendEmail({
		to: email,
		subject: `${inviterName} invited you to track your GoCanvas onboarding`,
		html: `
      <div style="font-family:sans-serif;max-width:540px">
        <h2 style="color:#237A4B">Your GoCanvas onboarding portal</h2>
        <p style="font-size:14px;line-height:1.6">
          <b>${escapeHtml(inviterName)}</b> invited you to follow
          <b>${escapeHtml(customer.name)}</b>'s onboarding with GoCanvas —
          live progress, next steps and a direct line to your implementation team.
        </p>
        <div style="margin:24px 0">
          <a href="${actionLink}" style="background:#237A4B;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">Open your portal</a>
        </div>
        <p style="font-size:12px;color:#888">
          Future sign-ins use this same email address at
          <a href="${appUrl()}/login">${appUrl()}/login</a>.
        </p>
      </div>`
	});
	await audit({
		actor_type: "user",
		actor_id: inviter.id,
		action: "customer.invited",
		entity_type: "customer",
		entity_id: input.customerId,
		payload: {
			email,
			contact_id: input.contactId ?? null
		}
	});
	return { invited: true };
}
async function revokeInvite(inviteId, actorId) {
	const { error } = await db().from("customer_invites").delete().eq("id", inviteId);
	if (error) throw new Error(error.message);
	await audit({
		actor_type: "user",
		actor_id: actorId,
		action: "customer.invite_revoked",
		entity_type: "customer_invite",
		entity_id: inviteId
	});
}
async function removeCustomerUser(linkId, actorId) {
	const { error } = await db().from("customer_users").delete().eq("id", linkId);
	if (error) throw new Error(error.message);
	await audit({
		actor_type: "user",
		actor_id: actorId,
		action: "customer.user_removed",
		entity_type: "customer_user",
		entity_id: linkId
	});
}
//#endregion
export { inviteCustomerContact, loadAccessOverview, removeCustomerUser, revokeInvite };
