import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as useServerFn } from "./useServerFn-CrZF2pjq.mjs";
import { n as fmtDate } from "./hub-format--ProSxvQ.mjs";
import { o as useQueryClient, r as useSuspenseQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { A as inviteContact, M as revokeCustomerInvite, dn as cn, j as removeCustomerAccess, k as accessQuery } from "./router-BT3neubm.mjs";
import { n as PageBody, r as PageHeader } from "./page-wX17g2fe.mjs";
import { o as Trash2, p as MailPlus, r as UserX } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/access-C7JCCgXl.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var inputClass = "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var buttonClass = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
var primaryClass = "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50";
var labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
function AccessPage() {
	const { data } = useSuspenseQuery(accessQuery);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		title: "Customer access",
		description: "Portal logins per customer: active users, pending invites, and inviting new contacts."
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PageBody, {
		className: "space-y-3",
		children: [data.map((customer) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CustomerCard, { customer }, customer.id)), data.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "rounded-md border border-dashed border-border bg-card px-6 py-8 text-center text-[12px] text-muted-foreground",
			children: "No customers yet."
		}) : null]
	})] });
}
function CustomerCard({ customer }) {
	const [inviting, setInviting] = (0, import_react.useState)(false);
	const queryClient = useQueryClient();
	const invalidate = () => queryClient.invalidateQueries({ queryKey: ["access"] });
	const revoke = useServerFn(revokeCustomerInvite);
	const revokeMutation = useMutation({
		mutationFn: (inviteId) => revoke({ data: { inviteId } }),
		onSuccess: invalidate
	});
	const removeLink = useServerFn(removeCustomerAccess);
	const removeMutation = useMutation({
		mutationFn: (linkId) => removeLink({ data: { linkId } }),
		onSuccess: invalidate
	});
	const empty = customer.users.length === 0 && customer.invites.length === 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-md border border-border bg-card",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "flex items-center justify-between border-b border-border px-4 py-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-[13px] font-semibold",
					children: customer.name
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
						children: [
							customer.users.length,
							" user",
							customer.users.length === 1 ? "" : "s",
							" ·",
							" ",
							customer.invites.length,
							" pending"
						]
					}), !inviting ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						className: buttonClass,
						onClick: () => setInviting(true),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MailPlus, { className: "h-3 w-3" }), " Invite contact"]
					}) : null]
				})]
			}),
			inviting ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "border-b border-border px-4 py-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(InviteForm, {
					customer,
					onDone: () => setInviting(false)
				})
			}) : null,
			empty ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "px-4 py-4 text-[12px] text-muted-foreground",
				children: "No portal access yet — invite a contact to give them a live view of their onboarding."
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
				className: "divide-y divide-border",
				children: [customer.users.map((u) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "flex items-center gap-3 px-4 py-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-1.5 w-1.5 shrink-0 rounded-full bg-status-ontrack-foreground" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "truncate text-[12px] font-medium",
								children: u.full_name || u.email
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-[10px] text-muted-foreground",
								children: [
									u.email,
									u.contact_name ? ` · linked to ${u.contact_name}` : "",
									" · joined",
									" ",
									fmtDate(u.created_at)
								]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: cn(buttonClass, "hover:text-destructive"),
							disabled: removeMutation.isPending,
							onClick: () => {
								if (window.confirm(`Remove ${u.email}'s access to ${customer.name}?`)) removeMutation.mutate(u.link_id);
							},
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(UserX, { className: "h-3 w-3" }), " Remove"]
						})
					]
				}, u.link_id)), customer.invites.map((i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "flex items-center gap-3 bg-surface/60 px-4 py-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-1.5 w-1.5 shrink-0 rounded-full bg-status-idle-foreground" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "truncate text-[12px]",
								children: i.email
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-[10px] text-muted-foreground",
								children: [
									"Invited ",
									fmtDate(i.created_at),
									i.invited_by_name ? ` by ${i.invited_by_name}` : "",
									i.contact_name ? ` · for ${i.contact_name}` : "",
									" · pending"
								]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: cn(buttonClass, "hover:text-destructive"),
							disabled: revokeMutation.isPending,
							onClick: () => revokeMutation.mutate(i.id),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-3 w-3" }), " Revoke"]
						})
					]
				}, i.id))]
			})
		]
	});
}
function InviteForm({ customer, onDone }) {
	const [email, setEmail] = (0, import_react.useState)("");
	const [contactId, setContactId] = (0, import_react.useState)("");
	const queryClient = useQueryClient();
	const invite = useServerFn(inviteContact);
	const mutation = useMutation({
		mutationFn: () => invite({ data: {
			customerId: customer.id,
			email: email.trim(),
			contactId: contactId || null
		} }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["access"] });
			onDone();
		}
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-2 rounded-sm border border-border bg-surface p-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-2 sm:grid-cols-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass,
						children: "Email"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						className: inputClass,
						placeholder: "name@customer.com",
						value: email,
						onChange: (e) => {
							setEmail(e.target.value);
						}
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "block space-y-0.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: labelClass,
						children: "Link to contact (optional)"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						className: inputClass,
						value: contactId,
						onChange: (e) => {
							setContactId(e.target.value);
							const contact = customer.contacts.find((c) => c.id === e.target.value);
							if (contact?.email) setEmail(contact.email);
						},
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "",
							children: "No linked contact"
						}), customer.contacts.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
							value: c.id,
							children: [c.name, c.email ? ` (${c.email})` : ""]
						}, c.id))]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[10px] leading-relaxed text-muted-foreground",
				children: "They'll get a sign-in link by email; future sign-ins use the same email address at /login. Their login only sees this customer's onboarding."
			}),
			mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] text-destructive",
				children: mutation.error instanceof Error ? mutation.error.message : "Could not send invite"
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: primaryClass,
					disabled: mutation.isPending || !email.includes("@"),
					onClick: () => mutation.mutate(),
					children: mutation.isPending ? "Sending…" : "Send invite"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: buttonClass,
					disabled: mutation.isPending,
					onClick: onDone,
					children: "Cancel"
				})]
			})
		]
	});
}
//#endregion
export { AccessPage as component };
