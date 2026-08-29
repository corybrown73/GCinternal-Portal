import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as useServerFn } from "./useServerFn-CrZF2pjq.mjs";
import { o as humanize } from "./hub-format--ProSxvQ.mjs";
import { i as useQuery, o as useQueryClient, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { B as useProfile, L as canManage, Q as selectClass, dn as cn } from "./router-BT3neubm.mjs";
import { n as PageBody } from "./page-wX17g2fe.mjs";
import { a as getInternalProfiles, s as getTicketRouting, u as setTicketRouting } from "./tickets.functions-BESDP6q2.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/tickets.routing-BQa2I_87.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/** Roles a category can route to. Aliases resolve to the same pool server-side. */
var ROUTE_ROLES = [
	"tam_se",
	"implementation",
	"manager",
	"sales"
];
function RoutingPage() {
	const { profile, loading } = useProfile();
	const routingQuery = useQuery({
		queryKey: ["ticket-routing"],
		queryFn: () => getTicketRouting()
	});
	const teamQuery = useQuery({
		queryKey: ["internal-profiles"],
		queryFn: () => getInternalProfiles()
	});
	if (!loading && !canManage(profile?.role)) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageBody, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-[13px] text-muted-foreground",
		children: "Routing rules are managed by managers and super admins."
	}) });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PageBody, {
		className: "space-y-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "max-w-2xl text-[13px] text-muted-foreground",
			children: "Each category routes to a role. New tickets go to the person in that role with the fewest open tickets; the fallback person catches categories whose role has no members."
		}), routingQuery.isPending || teamQuery.isPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "font-mono text-[11px] uppercase tracking-wider text-muted-foreground",
			children: "Loading routing…"
		}) : routingQuery.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			role: "alert",
			className: "text-[13px] text-destructive",
			children: ["Could not load routing: ", routingQuery.error.message]
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "overflow-hidden rounded-md border border-border bg-card",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
				className: "w-full text-left",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
					className: "border-b border-border bg-surface text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
							className: "px-3 py-1.5 font-medium",
							children: "Category"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
							className: "px-3 py-1.5 font-medium",
							children: "Routes to role"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
							className: "px-3 py-1.5 font-medium",
							children: "Fallback person"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-3 py-1.5 font-medium" })
					] })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", {
					className: "divide-y divide-border",
					children: (routingQuery.data ?? []).map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoutingRow, {
						row,
						team: teamQuery.data ?? []
					}, row.id))
				})]
			})
		})]
	});
}
function RoutingRow({ row, team }) {
	const [role, setRole] = (0, import_react.useState)(row.route_role);
	const [fallback, setFallback] = (0, import_react.useState)(row.fallback_profile_id ?? "");
	const queryClient = useQueryClient();
	const save = useServerFn(setTicketRouting);
	const mutation = useMutation({
		mutationFn: () => save({ data: {
			id: row.id,
			routeRole: role,
			fallbackProfileId: fallback === "" ? null : fallback
		} }),
		onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["ticket-routing"] })
	});
	const dirty = role !== row.route_role || (fallback || null) !== row.fallback_profile_id;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
		className: "hover:bg-muted/60",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 py-1.5 font-mono text-[11px]",
				children: row.category
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 py-1.5",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
					className: selectClass,
					"aria-label": `Role for ${row.category}`,
					value: role,
					onChange: (e) => setRole(e.target.value),
					children: [.../* @__PURE__ */ new Set([...ROUTE_ROLES, row.route_role])].map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
						value: r,
						children: humanize(r)
					}, r))
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				className: "px-3 py-1.5",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
					className: cn(selectClass, "min-w-40"),
					"aria-label": `Fallback person for ${row.category}`,
					value: fallback,
					onChange: (e) => setFallback(e.target.value),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
						value: "",
						children: "No fallback"
					}), team.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
						value: p.id,
						children: [
							p.full_name ?? p.email,
							" · ",
							humanize(p.role)
						]
					}, p.id))]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
				className: "px-3 py-1.5 text-right",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					disabled: !dirty || mutation.isPending,
					onClick: () => mutation.mutate(),
					className: "rounded-sm border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40",
					children: mutation.isPending ? "Saving…" : "Save"
				}), mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					role: "alert",
					className: "mt-1 text-[11px] text-destructive",
					children: mutation.error.message
				}) : null]
			})
		]
	});
}
//#endregion
export { RoutingPage as component };
