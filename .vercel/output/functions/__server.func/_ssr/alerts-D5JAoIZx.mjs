import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as useServerFn } from "./useServerFn-CrZF2pjq.mjs";
import { o as humanize, r as fmtDateTime } from "./hub-format--ProSxvQ.mjs";
import { i as useQuery, o as useQueryClient, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { dn as cn } from "./router-BT3neubm.mjs";
import { n as PageBody, r as PageHeader } from "./page-wX17g2fe.mjs";
import { r as NoRows } from "./record-BXejhTdA.mjs";
import { i as getAlerts, t as ackAlert } from "./tickets.functions-BESDP6q2.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/alerts-D5JAoIZx.js
var import_jsx_runtime = require_jsx_runtime();
var SEVERITY_CLASS = {
	critical: "bg-status-blocked text-status-blocked-foreground",
	warning: "bg-status-risk text-status-risk-foreground",
	info: "bg-muted text-muted-foreground"
};
function AlertsPage() {
	const queryClient = useQueryClient();
	const query = useQuery({
		queryKey: ["alerts"],
		queryFn: () => getAlerts()
	});
	const ack = useServerFn(ackAlert);
	const mutation = useMutation({
		mutationFn: (alertId) => ack({ data: { alertId } }),
		onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["alerts"] })
	});
	const alerts = query.data ?? [];
	const open = alerts.filter((a) => !a.acknowledged_at);
	const acked = alerts.filter((a) => a.acknowledged_at);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		title: "Alerts",
		description: "What the system flagged: SLA breaches, stalled implementations, overdue milestones and anything reported from outside.",
		actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "font-mono text-[11px] text-muted-foreground",
			children: [open.length, " open"]
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PageBody, {
		className: "space-y-4",
		children: [query.isPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "font-mono text-[11px] uppercase tracking-wider text-muted-foreground",
			children: "Loading alerts…"
		}) : query.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			role: "alert",
			className: "text-[13px] text-destructive",
			children: ["Could not load alerts: ", query.error.message]
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertList, {
			title: "Unacknowledged",
			rows: open,
			emptyLabel: "Nothing needs acknowledging.",
			action: (id) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				disabled: mutation.isPending,
				onClick: () => mutation.mutate(id),
				className: "shrink-0 rounded-sm border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40",
				children: "Acknowledge"
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertList, {
			title: "Acknowledged",
			rows: acked,
			emptyLabel: "No acknowledged alerts yet."
		})] }), mutation.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			role: "alert",
			className: "text-[12px] text-destructive",
			children: mutation.error.message
		}) : null]
	})] });
}
function AlertList({ title, rows, emptyLabel, action }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "overflow-hidden rounded-md border border-border bg-card",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "flex items-center gap-2 border-b border-border bg-surface px-3 py-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-[12px] font-semibold uppercase tracking-[0.08em]",
				children: title
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "font-mono text-[11px] text-muted-foreground",
				children: rows.length
			})]
		}), rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: emptyLabel }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "divide-y divide-border",
			children: rows.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
				className: "flex items-start justify-between gap-3 px-3 py-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-center gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium", SEVERITY_CLASS[a.severity] ?? "bg-muted text-muted-foreground"),
									children: humanize(a.severity)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
									children: a.kind
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[13px] font-medium",
									children: a.title
								})
							]
						}),
						a.detail ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-0.5 text-[12px] text-muted-foreground",
							children: a.detail
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-0.5 text-[11px] text-muted-foreground/70",
							children: [
								fmtDateTime(a.created_at),
								a.customer_id ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [" · ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
									to: "/customers/$customerId",
									params: { customerId: a.customer_id },
									className: "hover:underline",
									children: a.customer_name ?? "Customer"
								})] }) : null,
								a.source !== "system" ? ` · via ${a.source}` : null,
								a.acknowledged_at ? ` · acknowledged ${fmtDateTime(a.acknowledged_at)}` : null
							]
						})
					]
				}), action ? action(a.id) : null]
			}, a.id))
		})]
	});
}
//#endregion
export { AlertsPage as component };
