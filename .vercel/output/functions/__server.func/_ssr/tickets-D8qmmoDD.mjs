import { f as Outlet, g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { B as useProfile, L as canManage, dn as cn } from "./router-DuzTz6dO.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/tickets-D8qmmoDD.js
var import_jsx_runtime = require_jsx_runtime();
function TicketsLayout() {
	const { profile } = useProfile();
	const tabs = [
		{
			to: "/tickets",
			label: "Queue",
			exact: true
		},
		...canManage(profile?.role) ? [{
			to: "/tickets/routing",
			label: "Routing",
			exact: false
		}] : [],
		{
			to: "/alerts",
			label: "Alerts",
			exact: false
		}
	];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "border-b border-border px-6 pt-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex items-start justify-between gap-6",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-[15px] font-semibold tracking-tight",
				children: "Tickets"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 max-w-2xl text-[13px] text-muted-foreground",
				children: "Support requests routed by category, with a 24-hour first-response SLA."
			})] })
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
			className: "mt-3 flex gap-4",
			children: tabs.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
				to: t.to,
				activeOptions: { exact: t.exact },
				className: cn("border-b-2 border-transparent pb-2 text-[12px] font-medium text-muted-foreground transition-colors", "hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground"),
				children: t.label
			}, t.to))
		})]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {})] });
}
//#endregion
export { TicketsLayout as component };
