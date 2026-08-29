import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { d as stageLabel, o as humanize } from "./hub-format--ProSxvQ.mjs";
import { dn as cn } from "./router-DuzTz6dO.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/record-BXejhTdA.js
var import_jsx_runtime = require_jsx_runtime();
var STATUS_CLASS = {
	on_track: "bg-status-ontrack text-status-ontrack-foreground",
	at_risk: "bg-status-risk text-status-risk-foreground",
	blocked: "bg-status-blocked text-status-blocked-foreground",
	idle: "bg-status-idle text-status-idle-foreground",
	no_signal: "border border-dashed border-border bg-transparent text-muted-foreground"
};
var DOT_CLASS = {
	on_track: "bg-status-ontrack-foreground",
	at_risk: "bg-status-risk-foreground",
	blocked: "bg-status-blocked-foreground",
	idle: "bg-status-idle-foreground",
	no_signal: "bg-muted-foreground/40"
};
function StatusDot({ status, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: cn("inline-flex items-center gap-1.5 whitespace-nowrap", className),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("h-1.5 w-1.5 rounded-full", DOT_CLASS[status] ?? "bg-muted-foreground") }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-[12px]",
			children: humanize(status)
		})]
	});
}
function StatusChip({ status }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium", STATUS_CLASS[status] ?? "bg-muted text-muted-foreground"),
		children: humanize(status)
	});
}
function StageBadge({ stage }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "inline-flex items-center rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] tracking-tight text-foreground",
		children: stageLabel(stage)
	});
}
function SeverityChip({ value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium", {
			critical: "bg-status-blocked text-status-blocked-foreground",
			high: "bg-status-blocked text-status-blocked-foreground",
			medium: "bg-status-risk text-status-risk-foreground",
			low: "bg-muted text-muted-foreground"
		}[value?.toLowerCase()] ?? "bg-muted text-muted-foreground"),
		children: humanize(value)
	});
}
/**
* Attention band: the strongest treatment on a page. The value carries the
* weight, the label stays a quiet micro-label.
*/
function AttentionBand({ children, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("rounded-md bg-muted px-4 py-4", className),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "space-y-3",
			children
		})
	});
}
function PrimarySignal({ label, value, detail, emphasis = "high" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-w-0",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground",
				children: label
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: cn("mt-1 text-foreground", emphasis === "high" ? "text-[17px] font-semibold leading-snug tracking-tight" : "text-[14px] font-medium leading-snug"),
				children: value
			}),
			detail ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-0.5 text-[12px] leading-snug text-muted-foreground",
				children: detail
			}) : null
		]
	});
}
function Panel({ title, count, meta, action, children, className, id, level = "default" }) {
	const bordered = level !== "reference";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		id,
		className: cn(level === "supporting" ? "overflow-hidden rounded-md bg-surface" : bordered ? "overflow-hidden rounded-md border border-border bg-card" : "border-t border-border/70 pt-2", className),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: cn("flex items-center justify-between gap-3", bordered ? "px-3 py-2" : "px-0 py-1", level === "supporting" ? null : bordered ? "border-b border-border" : null, level === "primary" ? "bg-surface py-2.5" : null),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
				className: cn("flex items-baseline gap-2", level === "primary" ? "text-[14px] font-semibold tracking-tight text-foreground" : level === "supporting" ? "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground" : level === "reference" ? "text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground/80" : "text-[12px] font-semibold uppercase tracking-[0.08em]"),
				children: [title, count != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-mono text-[11px] font-normal normal-case tracking-normal text-muted-foreground",
					children: count
				}) : null]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-3",
				children: [meta ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-[11px] text-muted-foreground",
					children: meta
				}) : null, action]
			})]
		}), children]
	});
}
function Field({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-w-0",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
			className: "text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
			className: "mt-0.5 truncate text-[13px]",
			children: value ?? "—"
		})]
	});
}
function NoRows({ label = "No records" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "px-3 py-4 text-[12px] text-muted-foreground",
		children: label
	});
}
//#endregion
export { PrimarySignal as a, StatusChip as c, Panel as i, StatusDot as l, Field as n, SeverityChip as o, NoRows as r, StageBadge as s, AttentionBand as t };
