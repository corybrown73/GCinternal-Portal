import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as useServerFn } from "./useServerFn-CrZF2pjq.mjs";
import { n as fmtDate } from "./hub-format--ProSxvQ.mjs";
import { o as useQueryClient, r as useSuspenseQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { F as ROLE_LABELS, T as usersQuery, yt as setUserRole } from "./router-BT3neubm.mjs";
import { n as PageBody, r as PageHeader } from "./page-wX17g2fe.mjs";
import { C as ChevronLeft } from "../_libs/lucide-react.mjs";
import { i as Panel, r as NoRows } from "./record-BXejhTdA.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/admin.users-B_NOzH1F.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/** Roles that can be assigned. Legacy roles (admin/am/se/onboarding) are shown
*  on existing rows but no longer offered. */
var OFFERED_ROLES = [
	"super_admin",
	"manager",
	"sales",
	"implementation",
	"tam_se",
	"customer"
];
var LEGACY_ROLES = [
	"admin",
	"am",
	"se",
	"onboarding"
];
var selectClass = "h-6 rounded-sm border border-border bg-background px-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var buttonClass = "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
function UsersPage() {
	const { data: users } = useSuspenseQuery(usersQuery);
	const queryClient = useQueryClient();
	const changeRole = useServerFn(setUserRole);
	const [error, setError] = (0, import_react.useState)(null);
	const mutation = useMutation({
		mutationFn: (vars) => changeRole({ data: vars }),
		onSuccess: () => {
			setError(null);
			queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
			queryClient.invalidateQueries({ queryKey: ["profile"] });
		},
		onError: (e) => setError(e.message)
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		title: "Users",
		description: "Every portal profile and its role. Roles decide who can edit presale records, manage the team, or reach this admin area.",
		actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
			to: "/admin",
			className: buttonClass,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronLeft, { className: "h-3 w-3" }), " Admin"]
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PageBody, {
		className: "max-w-3xl space-y-3",
		children: [
			error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "alert",
				className: "rounded-md border border-border bg-status-blocked px-3 py-2 text-[12px] text-status-blocked-foreground",
				children: error
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Profiles",
				count: users.length,
				children: users.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No profiles yet." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "overflow-x-auto",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
						className: "w-full text-left",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
							className: "border-b border-border bg-surface text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "User"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "Role"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-1.5 font-medium",
									children: "Created"
								})
							] })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", {
							className: "divide-y divide-border",
							children: users.map((u) => {
								const isLegacy = LEGACY_ROLES.includes(u.role);
								return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
									className: "hover:bg-muted/60",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
											className: "px-3 py-1.5",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "text-[13px] font-medium",
												children: u.full_name || u.email
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "text-[11px] text-muted-foreground",
												children: u.email
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-3 py-1.5",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "flex items-center gap-2",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
													className: selectClass,
													value: OFFERED_ROLES.includes(u.role) ? u.role : "",
													disabled: mutation.isPending,
													onChange: (e) => {
														const role = e.target.value;
														if (!role) return;
														mutation.mutate({
															profileId: u.id,
															role
														});
													},
													children: [isLegacy ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
														value: "",
														disabled: true,
														children: [
															ROLE_LABELS[u.role] ?? u.role,
															" (legacy: ",
															u.role,
															")"
														]
													}) : null, OFFERED_ROLES.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
														value: r,
														children: ROLE_LABELS[r]
													}, r))]
												}), isLegacy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
													children: "legacy"
												}) : null]
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-3 py-1.5 font-mono text-[11px] text-muted-foreground",
											children: fmtDate(u.created_at)
										})
									]
								}, u.id);
							})
						})]
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] text-muted-foreground",
				children: "Legacy roles (admin, am, se, onboarding) keep working but are not offered for new assignments — pick a current role to migrate a profile."
			})
		]
	})] });
}
//#endregion
export { UsersPage as component };
