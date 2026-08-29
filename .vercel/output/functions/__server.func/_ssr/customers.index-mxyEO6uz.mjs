import { _ as useNavigate, g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { n as LIFECYCLE_STAGES } from "./lifecycle-Cl8aBFg1.mjs";
import { l as normalizeStage, n as fmtDate, o as humanize, t as daysSince, u as stageIndex } from "./hub-format--ProSxvQ.mjs";
import { r as useSuspenseQuery } from "../_libs/tanstack__react-query.mjs";
import { C as Route$22, dn as cn, w as implementationsQuery } from "./router-BT3neubm.mjs";
import { n as PageBody, r as PageHeader } from "./page-wX17g2fe.mjs";
import { A as ArrowDown, D as ArrowUp } from "../_libs/lucide-react.mjs";
import { l as StatusDot, r as NoRows, s as StageBadge } from "./record-BXejhTdA.mjs";
import { n as NewImplementation } from "./implementation-write-sNIqBwzs.mjs";
import { n as healthByImplementation } from "./home-triage-Cy00RQO2.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/customers.index-mxyEO6uz.js
var import_jsx_runtime = require_jsx_runtime();
/** Derived health levels, matching deriveHealth output. */
var STATUSES = [
	"blocked",
	"at_risk",
	"on_track",
	"no_signal"
];
function CustomersPage() {
	const { data } = useSuspenseQuery(implementationsQuery);
	const { stage, status, sort, dir } = Route$22.useSearch();
	const navigate = useNavigate({ from: Route$22.fullPath });
	const setSearch = (patch) => navigate({ search: (prev) => ({
		...prev,
		...patch
	}) });
	const toggleSort = (key) => setSearch({
		sort: key,
		dir: sort === key && dir === "desc" ? "asc" : "desc"
	});
	const health = healthByImplementation(data.implementations, data.triage);
	const levelOf = (id) => health.get(id)?.level ?? "no_signal";
	const customerOptions = Array.from(new Map(data.implementations.map((r) => [r.customer_id, {
		id: r.customer_id,
		name: r.customer_name,
		hasImplementation: true
	}])).values()).sort((a, b) => a.name.localeCompare(b.name));
	const rows = data.implementations.filter((r) => stage ? normalizeStage(r.current_stage) === stage : true).filter((r) => status ? levelOf(r.id) === status : true).sort((a, b) => {
		const factor = dir === "asc" ? 1 : -1;
		switch (sort) {
			case "customer": return factor * a.customer_name.localeCompare(b.customer_name);
			case "stage": return factor * (stageIndex(a.current_stage) - stageIndex(b.current_stage));
			case "status": return factor * levelOf(a.id).localeCompare(levelOf(b.id));
			case "owner": return factor * (a.owner_name ?? "").localeCompare(b.owner_name ?? "");
			case "tier": return factor * (a.tier ?? "").localeCompare(b.tier ?? "");
			case "launch": return factor * (a.target_launch_date ?? "9999").localeCompare(b.target_launch_date ?? "9999");
			default: return factor * ((daysSince(a.stage_entered_at) ?? 0) - (daysSince(b.stage_entered_at) ?? 0));
		}
	});
	const Th = ({ label, sortKey }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
		className: "px-3 py-1.5 font-medium",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			type: "button",
			onClick: () => toggleSort(sortKey),
			className: "inline-flex items-center gap-1 uppercase tracking-[0.1em] hover:text-foreground",
			children: [label, sort === sortKey ? dir === "asc" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowUp, { className: "h-3 w-3" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowDown, { className: "h-3 w-3" }) : null]
		})
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		title: "Customers",
		description: "One row per customer implementation, grouped by the stage it is in.",
		actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "font-mono text-[11px] text-muted-foreground",
				children: [
					rows.length,
					" / ",
					data.implementations.length
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NewImplementation, { customers: customerOptions })]
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PageBody, {
		className: "space-y-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-center gap-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilterGroup, {
				label: "Stage",
				value: stage,
				options: LIFECYCLE_STAGES.map((s) => ({
					value: s.id,
					label: s.label
				})),
				onChange: (v) => setSearch({ stage: v })
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilterGroup, {
				label: "Status",
				value: status,
				options: STATUSES.map((s) => ({
					value: s,
					label: humanize(s)
				})),
				onChange: (v) => setSearch({ status: v })
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "overflow-hidden rounded-md border border-border bg-card",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
				className: "w-full text-left",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
					className: "border-b border-border bg-surface text-[10px] text-muted-foreground",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Th, {
							label: "Customer",
							sortKey: "customer"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Th, {
							label: "Stage",
							sortKey: "stage"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Th, {
							label: "Health",
							sortKey: "status"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Th, {
							label: "Owner",
							sortKey: "owner"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Th, {
							label: "Tier",
							sortKey: "tier"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Th, {
							label: "Target launch",
							sortKey: "launch"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Th, {
							label: "Days in stage",
							sortKey: "days"
						})
					] })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", {
					className: "divide-y divide-border",
					children: [rows.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
						className: "group hover:bg-muted/60",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-3 py-1.5",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
									to: "/customers/$customerId",
									params: { customerId: r.customer_id },
									className: "block text-[13px] font-medium hover:underline",
									children: [r.customer_name, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "ml-2 text-[11px] font-normal text-muted-foreground",
										children: [
											r.industry ?? "—",
											" · ",
											r.segment ?? "—"
										]
									})]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-3 py-1.5",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StageBadge, { stage: r.current_stage })
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
								className: "px-3 py-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusDot, { status: levelOf(r.id) }), r.status !== levelOf(r.id) ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "mt-0.5 block text-[10px] text-muted-foreground",
									title: "The status someone set by hand differs from what the record actually shows",
									children: ["Manual flag: ", humanize(r.status)]
								}) : null]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-3 py-1.5 text-[12px]",
								children: r.owner_name ?? "Unassigned"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-3 py-1.5 text-[12px]",
								children: r.tier ?? "—"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-3 py-1.5 font-mono text-[12px]",
								children: fmtDate(r.target_launch_date)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
								className: cn("px-3 py-1.5 font-mono text-[12px]", (daysSince(r.stage_entered_at) ?? 0) > 14 ? "text-status-risk-foreground" : "text-muted-foreground"),
								children: [daysSince(r.stage_entered_at), "d"]
							})
						]
					}, r.id)), rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
						colSpan: 7,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No implementations match these filters. Try clearing a filter." })
					}) }) : null]
				})]
			})
		})]
	})] });
}
function FilterGroup({ label, value, options, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-wrap items-center gap-1.5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
				children: label
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => onChange(void 0),
				className: cn("rounded-sm border border-border px-1.5 py-0.5 text-[11px]", value === void 0 ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground hover:text-foreground"),
				children: "All"
			}),
			options.map((o) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => onChange(value === o.value ? void 0 : o.value),
				className: cn("rounded-sm border border-border px-1.5 py-0.5 text-[11px]", value === o.value ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground hover:text-foreground"),
				children: o.label
			}, o.value))
		]
	});
}
//#endregion
export { CustomersPage as component };
