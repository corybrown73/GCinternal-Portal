import { _ as useNavigate, g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { o as humanize } from "./hub-format--ProSxvQ.mjs";
import { r as useSuspenseQuery } from "../_libs/tanstack__react-query.mjs";
import { c as solutionsQuery, dn as cn, s as Route$14 } from "./router-BT3neubm.mjs";
import { n as PageBody, r as PageHeader } from "./page-wX17g2fe.mjs";
import { A as ArrowDown, D as ArrowUp } from "../_libs/lucide-react.mjs";
import { c as StatusChip, r as NoRows } from "./record-BXejhTdA.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/technical-solutions.index-DKVCFQqI.js
var import_jsx_runtime = require_jsx_runtime();
function SolutionsQueue() {
	const { data } = useSuspenseQuery(solutionsQuery);
	const { owner, status, sort, dir } = Route$14.useSearch();
	const navigate = useNavigate({ from: Route$14.fullPath });
	const setSearch = (patch) => navigate({ search: (prev) => ({
		...prev,
		...patch
	}) });
	const toggleSort = (key) => setSearch({
		sort: key,
		dir: sort === key && dir === "asc" ? "desc" : "asc"
	});
	const owners = [...new Set(data.map((r) => r.owner_name).filter(Boolean))];
	const statuses = [...new Set(data.map((r) => r.status).filter(Boolean))];
	const rows = data.filter((r) => owner ? r.owner_name === owner : true).filter((r) => status ? r.status === status : true).sort((a, b) => {
		const factor = dir === "asc" ? 1 : -1;
		switch (sort) {
			case "solution": return factor * a.title.localeCompare(b.title);
			case "requirement": return factor * (a.requirement_title ?? "").localeCompare(b.requirement_title ?? "");
			case "owner": return factor * (a.owner_name ?? "").localeCompare(b.owner_name ?? "");
			case "status": return factor * a.status.localeCompare(b.status);
			default: return factor * a.customer_name.localeCompare(b.customer_name);
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
		title: "Technical Solutions",
		description: "Every technical solution across customers, with the requirement it implements and what it needs next.",
		actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "font-mono text-[11px] text-muted-foreground",
			children: [
				rows.length,
				" / ",
				data.length
			]
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PageBody, {
		className: "space-y-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-center gap-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilterGroup, {
				label: "Owner",
				value: owner,
				options: owners.map((o) => ({
					value: o,
					label: o
				})),
				onChange: (v) => setSearch({ owner: v })
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilterGroup, {
				label: "Status",
				value: status,
				options: statuses.map((s) => ({
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
							label: "Customer / implementation",
							sortKey: "customer"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Th, {
							label: "Solution",
							sortKey: "solution"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Th, {
							label: "Requirement",
							sortKey: "requirement"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Th, {
							label: "Owner",
							sortKey: "owner"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Th, {
							label: "Status",
							sortKey: "status"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
							className: "px-3 py-1.5 font-medium uppercase tracking-[0.1em]",
							children: "What's needed next"
						})
					] })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", {
					className: "divide-y divide-border",
					children: [rows.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
						className: "group align-top hover:bg-muted/60",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
								className: "px-3 py-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-[13px] font-medium",
									children: r.customer_name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-[11px] text-muted-foreground",
									children: r.implementation_name
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-3 py-1.5",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
									to: "/technical-solutions/$id",
									params: { id: r.id },
									className: "text-[13px] font-medium hover:underline",
									children: r.title
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "max-w-[220px] px-3 py-1.5 text-[12px] text-muted-foreground",
								children: r.requirement_title ?? "—"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-3 py-1.5 text-[12px]",
								children: r.owner_name ?? "Unassigned"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-3 py-1.5",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: r.status })
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "max-w-[280px] px-3 py-1.5 text-[12px] text-muted-foreground",
								children: r.next_needed
							})
						]
					}, r.id)), rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
						colSpan: 6,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "No technical solutions match these filters." })
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
				className: cn("rounded-sm border border-border px-1.5 py-0.5 text-[11px]", value === void 0 ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"),
				children: "All"
			}),
			options.map((o) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => onChange(value === o.value ? void 0 : o.value),
				className: cn("rounded-sm border border-border px-1.5 py-0.5 text-[11px]", value === o.value ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"),
				children: o.label
			}, o.value))
		]
	});
}
//#endregion
export { SolutionsQueue as component };
