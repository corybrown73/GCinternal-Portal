import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { o as humanize, r as fmtDateTime } from "./hub-format--ProSxvQ.mjs";
import { r as useSuspenseQuery } from "../_libs/tanstack__react-query.mjs";
import { N as homeQuery, dn as cn } from "./router-DuzTz6dO.mjs";
import { n as PageBody, r as PageHeader } from "./page-wX17g2fe.mjs";
import { O as ArrowRight, _ as Info, x as Clock } from "../_libs/lucide-react.mjs";
import { c as StatusChip, i as Panel, l as StatusDot, r as NoRows, s as StageBadge } from "./record-BXejhTdA.mjs";
import { d as launchStateConflict } from "./customer360-derive-DgUfIdHQ.mjs";
import { n as healthByImplementation, t as buildQueue } from "./home-triage-Cy00RQO2.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-DiL3YMMx.js
var import_jsx_runtime = require_jsx_runtime();
function CustomerLink({ customerId, children, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
		to: "/customers/$customerId",
		params: { customerId },
		search: { tab: "overview" },
		className: cn("hover:underline", className),
		children
	});
}
var SECTIONS = [
	{
		bucket: "act_now",
		title: "Act now",
		meta: "Blocked, escalated, a critical risk, an overdue promise to the customer, or a launch date already gone by",
		accent: "bg-status-blocked-foreground",
		empty: "Nothing needs immediate action. Everything else is in the lists below."
	},
	{
		bucket: "needs_attention",
		title: "Needs attention",
		meta: "Open risk or issue, other overdue commitments, no movement for more than 14 days, something due in the next 7 days, or flagged at risk",
		accent: "bg-status-risk-foreground",
		empty: "Nothing to keep an eye on right now."
	},
	{
		bucket: "moving",
		title: "Moving",
		meta: "On track, with nothing open against them",
		accent: "bg-status-on-track-foreground",
		empty: "No implementations are moving cleanly — check the lists above."
	}
];
function QueueRowItem({ row, health }) {
	const { impl } = row;
	const conflict = launchStateConflict(impl);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
		className: "group relative hover:bg-muted/60",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
			to: "/customers/$customerId",
			params: { customerId: impl.customer_id },
			search: { tab: row.tab },
			className: "block px-3 py-2.5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-x-3 gap-y-1",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[13px] font-medium group-hover:underline",
							children: impl.customer_name
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StageBadge, { stage: impl.current_stage }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: health.level }),
						impl.status !== "on_track" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-[11px] text-muted-foreground",
							children: ["Marked as: ", humanize(impl.status)]
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "ml-auto flex items-center gap-1 font-mono text-[11px] text-muted-foreground",
							children: [row.tab, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, {
								className: "h-3 w-3",
								strokeWidth: 2
							})]
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-[13px]",
					children: row.reason
				}),
				conflict ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-1 inline-flex items-center gap-1.5 rounded-sm border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Info, {
						className: "h-3 w-3",
						strokeWidth: 1.75
					}), "This is past the launch stage, but no actual launch date has been recorded."]
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-1 grid gap-x-6 gap-y-0.5 text-[11px] text-muted-foreground md:grid-cols-[1fr_1fr_10rem]",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "uppercase tracking-[0.08em]",
								children: "Impact"
							}),
							" · ",
							row.impact
						] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "uppercase tracking-[0.08em]",
								children: "Next"
							}),
							" · ",
							row.next_action
						] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "uppercase tracking-[0.08em]",
								children: "Owner"
							}),
							" ·",
							" ",
							impl.owner_name ?? "Unassigned"
						] })
					]
				})
			]
		})
	});
}
function HomePage() {
	const { data } = useSuspenseQuery(homeQuery);
	const queue = buildQueue(data.implementations, data.triage);
	const healthByImpl = healthByImplementation(data.implementations, data.triage);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		title: "Today",
		description: "What needs my attention — every implementation sorted by what's driving it, not by task due dates.",
		actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "font-mono text-[11px] text-muted-foreground",
			children: [
				queue.act_now.length,
				" act now · ",
				queue.needs_attention.length,
				" needs attention ·",
				" ",
				queue.moving.length,
				" moving"
			]
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PageBody, {
		className: "space-y-4",
		children: [
			SECTIONS.map((section) => {
				const rows = queue[section.bucket];
				return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
					title: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("h-2 w-2 rounded-full", section.accent) }), section.title]
					}),
					count: rows.length,
					meta: section.meta,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
						className: "divide-y divide-border",
						children: [rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(QueueRowItem, {
							row,
							health: healthByImpl.get(row.impl.id)
						}, row.impl.id)), rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: section.empty }) : null]
					})
				}, section.bucket);
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
				title: "Recent activity",
				count: data.signal.length,
				meta: "Newest first · the context behind the lists above",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
					className: "divide-y divide-border",
					children: [data.signal.slice(0, 12).map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex gap-3 px-3 py-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock, {
								className: "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground",
								strokeWidth: 1.75
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0 flex-1",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-[13px]",
									children: [s.title, s.customer_id && s.customer_name ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [" — ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CustomerLink, {
										customerId: s.customer_id,
										className: "font-medium",
										children: s.customer_name
									})] }) : null]
								}), s.detail ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-0.5 text-[12px] text-muted-foreground",
									children: s.detail
								}) : null]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "shrink-0 font-mono text-[11px] text-muted-foreground",
								children: [fmtDateTime(s.at), s.actor ? ` · ${s.actor}` : ""]
							})
						]
					}, s.key)), data.signal.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No activity recorded yet." }) : null]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-[11px] text-muted-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusDot, {
					status: "idle",
					className: "mr-1 align-middle"
				}), " Sign-in isn't set up yet, so this shows every implementation regardless of who owns it."]
			})
		]
	})] });
}
//#endregion
export { HomePage as component };
