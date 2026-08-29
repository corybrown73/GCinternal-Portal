import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { dn as cn } from "./router-DuzTz6dO.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/page-wX17g2fe.js
var import_jsx_runtime = require_jsx_runtime();
function PageHeader({ title, description, actions }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-start justify-between gap-6 border-b border-border px-6 py-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
			className: "text-[15px] font-semibold tracking-tight",
			children: title
		}), description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-1 max-w-2xl text-[13px] text-muted-foreground",
			children: description
		}) : null] }), actions ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex items-center gap-2",
			children: actions
		}) : null]
	});
}
function PageBody({ children, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("px-6 py-5", className),
		children
	});
}
function EmptyState({ title, description, hint }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-md border border-dashed border-border bg-card px-6 py-10 text-center",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] font-medium",
				children: title
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mx-auto mt-1.5 max-w-md text-[13px] text-muted-foreground",
				children: description
			}),
			hint ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mx-auto mt-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground/70",
				children: hint
			}) : null
		]
	});
}
//#endregion
export { PageBody as n, PageHeader as r, EmptyState as t };
