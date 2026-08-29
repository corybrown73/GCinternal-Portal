import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { n as PageBody, r as PageHeader } from "./page-wX17g2fe.mjs";
import { O as ArrowRight, a as Upload, g as KeyRound, l as Route, n as Users } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/admin.index-BRuRZT9S.js
var import_jsx_runtime = require_jsx_runtime();
var CARDS = [
	{
		to: "/admin/api-keys",
		icon: KeyRound,
		title: "API keys",
		description: "Create and revoke scoped keys for Salesforce, Zapier and monitoring integrations calling /api/v1/*."
	},
	{
		to: "/admin/users",
		icon: Users,
		title: "Users",
		description: "Every portal profile and its role. Roles gate sales edits, admin areas and the customer portal."
	},
	{
		to: "/tickets/routing",
		icon: Route,
		title: "Ticket routing",
		description: "Assignment rules for inbound tickets: which team picks up what, and the fallback owner."
	},
	{
		to: "/pipeline",
		icon: Upload,
		title: "CSV import",
		description: "Bulk-load or refresh presale deals from a Salesforce export. The import dialog lives on the Pipeline board."
	}
];
function AdminIndex() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		title: "Admin",
		description: "Integration keys, people and routing. Everything here is super-admin only and audited."
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageBody, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "grid gap-3 sm:grid-cols-2",
		children: CARDS.map((card) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
			to: card.to,
			className: "group rounded-md border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/60",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(card.icon, {
						className: "h-3.5 w-3.5 text-muted-foreground",
						strokeWidth: 1.75
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[13px] font-medium group-hover:underline",
						children: card.title
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, {
					className: "h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5",
					strokeWidth: 1.75
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1.5 text-[12px] text-muted-foreground",
				children: card.description
			})]
		}, card.to))
	}) })] });
}
//#endregion
export { AdminIndex as component };
