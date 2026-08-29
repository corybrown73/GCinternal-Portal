import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { i as PRE_HANDOFF_CONTEXT, n as LIFECYCLE_STAGES, t as LIFECYCLE_BOUNDARY_LABEL } from "./lifecycle-Cl8aBFg1.mjs";
import { n as PageBody, r as PageHeader, t as EmptyState } from "./page-wX17g2fe.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/settings-Ctsnz7W7.js
var import_jsx_runtime = require_jsx_runtime();
function SettingsPage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		title: "Settings",
		description: "This app owns the implementation journey only: it begins once the opportunity is Closed/Won and the work is handed over. Roles shown are descriptive context only — they drive no assignment or permissions."
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PageBody, {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "overflow-hidden rounded-md border border-border bg-card",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "border-b border-border px-4 py-2.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-[13px] font-semibold",
						children: "Implementation lifecycle"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-0.5 text-[11.5px] text-muted-foreground",
						children: "Eight owned stages, starting at Handoff."
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "divide-y divide-border",
					children: LIFECYCLE_STAGES.map((stage, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex gap-3 px-4 py-2.5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "w-6 shrink-0 pt-px font-mono text-[11px] text-muted-foreground",
								children: String(i + 1).padStart(2, "0")
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "w-28 shrink-0 text-[13px] font-medium",
								children: stage.label
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0 space-y-1",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-[13px] text-muted-foreground",
										children: stage.intent
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground/80",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Leads: ", stage.leads.join(" + ")] }),
											stage.supports ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Supports: ", stage.supports.join(" + ")] }) : null,
											stage.boundary ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "rounded-sm border border-border px-1.5 py-px normal-case tracking-normal text-foreground",
												children: LIFECYCLE_BOUNDARY_LABEL[stage.boundary]
											}) : null
										]
									}),
									stage.overlay ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "text-[11.5px] text-muted-foreground",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
												className: "font-medium text-foreground",
												children: [stage.overlay.role, " overlay (conditional):"]
											}),
											" ",
											stage.overlay.condition
										]
									}) : null
								]
							})
						]
					}, stage.id))
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "overflow-hidden rounded-md border border-dashed border-border bg-muted/20",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "border-b border-border px-4 py-2.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-[13px] font-semibold",
						children: "Upstream — not owned by this app"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-0.5 text-[11.5px] text-muted-foreground",
						children: "Context from the broader company journey. No stages, ownership or workflow are modelled here; the pre-handoff operating model is not yet agreed."
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "divide-y divide-border",
					children: PRE_HANDOFF_CONTEXT.map((step) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex gap-3 px-4 py-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "w-28 shrink-0 text-[13px] font-medium text-muted-foreground",
							children: step.label
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[12px] text-muted-foreground",
							children: step.note
						})]
					}, step.label))
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {
				title: "Team & roles",
				description: "Owners, workload limits and permissions will be set up here.",
				hint: "Not available yet"
			})
		]
	})] });
}
//#endregion
export { SettingsPage as component };
